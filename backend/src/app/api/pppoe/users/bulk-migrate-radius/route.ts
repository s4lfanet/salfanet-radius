import { NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { managePppSecret } from '@/server/services/mikrotik/ppp-secret.service';
import { reloadFreeRadius } from '@/server/services/radius/freeradius.service';
import { disconnectMultiplePPPoEUsers } from '@/server/services/radius/coa-handler.service';

/**
 * POST /api/pppoe/users/bulk-migrate-radius
 *
 * Migrate a router from LOCAL auth mode to RADIUS auth mode.
 *
 * What this does (all in one operation):
 * 1. Changes router.authMode from 'local' → 'radius'
 * 2. Re-syncs ALL PPPoE users on that router to RADIUS tables (radcheck, radusergroup, radreply)
 * 3. Disables PPP secrets in MikroTik (they become backup, RADIUS is now primary)
 * 4. Reloads FreeRADIUS so changes take effect immediately
 * 5. Sends CoA disconnect to kick active sessions so they re-auth via RADIUS
 *
 * Body: { routerId: string }
 */
export async function POST(request: Request) {
  try {
    const authCheck = await requirePermission('customers.edit');
    if (!authCheck.authorized) return authCheck.response;
    const { routerId } = await request.json();

    if (!routerId) {
      return NextResponse.json(
        { error: 'routerId is required' },
        { status: 400 }
      );
    }

    // Get router
    const router = await prisma.router.findUnique({
      where: { id: routerId },
      select: { id: true, name: true, authMode: true, nasname: true, ipAddress: true },
    });

    if (!router) {
      return NextResponse.json(
        { error: 'Router not found' },
        { status: 404 }
      );
    }

    if (router.authMode === 'radius') {
      return NextResponse.json({
        success: true,
        message: `Router "${router.name}" sudah menggunakan mode RADIUS. Tidak perlu migrasi.`,
        alreadyRadius: true,
        summary: { total: 0, synced: 0, secretsDisabled: 0, failed: 0 },
      });
    }

    // Get all PPPoE users on this router
    const users = await prisma.pppoeUser.findMany({
      where: { routerId: router.id },
      include: {
        profile: true,
        router: { select: { id: true, authMode: true } },
      },
    });

    const nasIdentifier = router.id;
    let synced = 0;
    let secretsDisabled = 0;
    let failed = 0;
    const errors: Array<{ username: string; error: string }> = [];

    // ─── Step 1: Re-sync all users to RADIUS tables ───────────────────
    for (const user of users) {
      try {
        // Clean old RADIUS entries for this user on this NAS
        await prisma.$executeRaw`
          DELETE FROM radcheck WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `;
        await prisma.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `;
        await prisma.$executeRaw`
          DELETE FROM radreply WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `;

        // Only create RADIUS entries for active/isolated users (blocked/stop = no auth)
        if (user.status === 'active' || user.status === 'isolated') {
          const groupName = user.status === 'isolated'
            ? 'isolir'
            : (user.profile?.groupName || null);

          // radcheck: Cleartext-Password
          await prisma.$executeRaw`
            INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
            VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasIdentifier})
            ON DUPLICATE KEY UPDATE value = ${user.password}
          `;

          // radusergroup: profile group
          if (groupName) {
            await prisma.$executeRaw`
              INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
              VALUES (${user.username}, ${groupName}, 1, ${nasIdentifier})
            `;
          }

          // radreply: static IP if set
          if (user.ipAddress) {
            await prisma.$executeRaw`
              INSERT INTO radreply (username, attribute, op, value, nas_identifier)
              VALUES (${user.username}, 'Framed-IP-Address', ':=', ${user.ipAddress}, ${nasIdentifier})
              ON DUPLICATE KEY UPDATE value = ${user.ipAddress}
            `;
          }
        }

        // Mark user as synced to RADIUS
        await prisma.pppoeUser.update({
          where: { id: user.id },
          data: { syncedToRadius: true, lastSyncAt: new Date() },
        });

        synced++;

        // ─── Step 2: Disable PPP secret in MikroTik (backup mode) ──────
        // In RADIUS mode, PPP secrets are kept as disabled backup.
        // RADIUS is now the primary auth source.
        if (user.connectionType !== 'HOTSPOT') {
          try {
            const profile = user.status === 'isolated' ? 'isolir' : (user.profile?.groupName || undefined);
            const action = (user.status === 'blocked' || user.status === 'stop') ? 'disable' : 'enable';
            // In RADIUS mode, we still create/update the secret but disabled
            // so it exists as backup but RADIUS takes priority
            await managePppSecret(router.id, action, {
              username: user.username,
              password: user.password,
              profile,
              disabled: true, // always disabled in RADIUS mode (backup only)
              comment: `Salfanet-${user.id.slice(0, 8)}`,
            });
            secretsDisabled++;
          } catch (e: any) {
            // MikroTik secret management failure is non-fatal — RADIUS is primary now
            console.error(`[MIGRATE-RADIUS] PPP secret disable failed for "${user.username}":`, e?.message || e);
          }
        }
      } catch (e: any) {
        failed++;
        errors.push({ username: user.username, error: e?.message || 'Unknown error' });
        console.error(`[MIGRATE-RADIUS] Sync failed for "${user.username}":`, e);
      }
    }

    // ─── Step 3: Change router authMode to 'radius' ───────────────────
    await prisma.router.update({
      where: { id: router.id },
      data: { authMode: 'radius' },
    });

    // ─── Step 4: Reload FreeRADIUS ────────────────────────────────────
    try {
      await reloadFreeRadius();
    } catch (e) {
      console.warn('[MIGRATE-RADIUS] FreeRADIUS reload failed:', e);
    }

    // ─── Step 5: CoA disconnect all active sessions ───────────────────
    // Kick all active sessions so they re-authenticate via RADIUS
    let coaResult = null;
    try {
      const usernames = users
        .filter(u => u.status === 'active' || u.status === 'isolated')
        .map(u => u.username);
      if (usernames.length > 0) {
        coaResult = await disconnectMultiplePPPoEUsers(usernames);
        console.log(`[MIGRATE-RADIUS] CoA disconnect result:`, coaResult);
      }
    } catch (e) {
      console.error('[MIGRATE-RADIUS] CoA disconnect failed:', e);
    }

    const message = `Migrasi selesai: Router "${router.name}" sekarang menggunakan RADIUS auth. ` +
      `${synced}/${users.length} pelanggan di-sync ke RADIUS, ${secretsDisabled} PPP secret di-disable (backup). ` +
      (failed > 0 ? `${failed} gagal.` : '') +
      ` CoA disconnect: ${coaResult?.disconnected || 0} sesi di-kick.`;

    return NextResponse.json({
      success: true,
      message,
      router: { id: router.id, name: router.name, authMode: 'radius' },
      summary: {
        total: users.length,
        synced,
        secretsDisabled,
        failed,
      },
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      coa: coaResult,
    });
  } catch (error) {
    console.error('Bulk migrate to RADIUS error:', error);
    return NextResponse.json(
      { error: 'Failed to migrate to RADIUS' },
      { status: 500 }
    );
  }
}
