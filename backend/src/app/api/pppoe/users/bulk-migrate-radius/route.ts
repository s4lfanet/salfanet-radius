import { NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { managePppSecret, getMikrotikProfileName } from '@/server/services/mikrotik/ppp-secret.service';
import { reloadFreeRadius } from '@/server/services/radius/freeradius.service';
import { disconnectMultiplePPPoEUsers } from '@/server/services/radius/coa-handler.service';

/**
 * Sync a single PPPoE profile's attributes (Mikrotik-Rate-Limit, Pool-Name, etc.)
 * to RADIUS radgroupreply table. Ensures bandwidth package is correct in RADIUS.
 */
async function syncProfileToRadGroupReply(profileId: string) {
  const profile = await prisma.pppoeProfile.findUnique({
    where: { id: profileId },
    select: { id: true, groupName: true, speed: true, ipPool: true, name: true },
  });
  if (!profile || !profile.groupName) return;

  // Upsert Mikrotik-Rate-Limit
  if (profile.speed) {
    const existingRate = await prisma.radgroupreply.findFirst({
      where: { groupname: profile.groupName, attribute: 'Mikrotik-Rate-Limit' },
    });
    if (existingRate) {
      await prisma.radgroupreply.update({
        where: { id: existingRate.id },
        data: { value: profile.speed },
      });
    } else {
      await prisma.radgroupreply.create({
        data: { groupname: profile.groupName, attribute: 'Mikrotik-Rate-Limit', op: ':=', value: profile.speed },
      });
    }
  }

  // Upsert Pool-Name if set
  if (profile.ipPool) {
    const existingPool = await prisma.radgroupreply.findFirst({
      where: { groupname: profile.groupName, attribute: 'Pool-Name' },
    });
    if (existingPool) {
      await prisma.radgroupreply.update({
        where: { id: existingPool.id },
        data: { value: profile.ipPool },
      });
    } else {
      await prisma.radgroupreply.create({
        data: { groupname: profile.groupName, attribute: 'Pool-Name', op: ':=', value: profile.ipPool },
      });
    }
  }
}

/**
 * POST /api/pppoe/users/bulk-migrate-radius
 *
 * Migrate a router from LOCAL auth mode to RADIUS auth mode.
 *
 * What this does (all in one operation):
 * 1. Syncs all profile attributes (Mikrotik-Rate-Limit, Pool-Name) to radgroupreply
 * 2. Re-syncs ALL PPPoE users on that router to RADIUS tables (radcheck, radusergroup, radreply)
 * 3. Disables PPP secrets in MikroTik + updates profile name (backup, RADIUS is primary)
 * 4. Changes router.authMode from 'local' → 'radius'
 * 5. Reloads FreeRADIUS so changes take effect immediately
 * 6. Sends CoA disconnect to kick active sessions so they re-auth via RADIUS
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
        summary: { total: 0, synced: 0, secretsDisabled: 0, profilesSynced: 0, failed: 0 },
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
    let profilesSynced = 0;
    let failed = 0;
    const errors: Array<{ username: string; error: string }> = [];

    // ─── Step 0: Sync all unique profile attributes to radgroupreply ──
    // This ensures bandwidth packages (Mikrotik-Rate-Limit, Pool-Name) are
    // correct in RADIUS before users start authenticating via RADIUS.
    const uniqueProfileIds = new Set<string>();
    for (const user of users) {
      if (user.profileId) uniqueProfileIds.add(user.profileId);
    }
    for (const profileId of uniqueProfileIds) {
      try {
        await syncProfileToRadGroupReply(profileId);
        profilesSynced++;
      } catch (e: any) {
        console.error(`[MIGRATE-RADIUS] Profile sync failed for ${profileId}:`, e?.message || e);
      }
    }

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
        //
        // BUG FIX: Use action 'update' with disabled:true instead of
        // 'enable' with disabled:true — 'enable' action ignores the
        // disabled param and always sets disabled=no.
        if (user.connectionType !== 'HOTSPOT') {
          try {
            // Get the correct MikroTik profile name (not RADIUS group name)
            let mtProfile: string | undefined;
            if (user.status === 'isolated') {
              mtProfile = 'isolir';
            } else if (user.profileId) {
              const resolved = await getMikrotikProfileName(user.profileId);
              mtProfile = resolved || undefined;
            }

            // Use 'update' action which respects the disabled param
            await managePppSecret(router.id, 'update', {
              username: user.username,
              password: user.password,
              profile: mtProfile,
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
      `${profilesSynced} profile (paket bandwidth) di-sync ke radgroupreply, ` +
      `${synced}/${users.length} pelanggan di-sync ke RADIUS, ` +
      `${secretsDisabled} PPP secret di-disable (backup). ` +
      (failed > 0 ? `${failed} gagal. ` : '') +
      `CoA disconnect: ${coaResult?.disconnected || 0} sesi di-kick.`;

    return NextResponse.json({
      success: true,
      message,
      router: { id: router.id, name: router.name, authMode: 'radius' },
      summary: {
        total: users.length,
        synced,
        secretsDisabled,
        profilesSynced,
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
