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
 * POST /api/pppoe/users/bulk-sync-radius
 *
 * Re-sync all PPPoE users to RADIUS tables (radcheck, radusergroup, radreply).
 * Also syncs profile attributes (Mikrotik-Rate-Limit, Pool-Name) to radgroupreply.
 * Also syncs MikroTik PPP secrets (disable + update profile) if router is in RADIUS mode.
 *
 * Does NOT change authMode — use this to fix out-of-sync RADIUS data.
 *
 * Body: { routerId?: string } — optional, if not provided syncs ALL routers
 */
export async function POST(request: Request) {
  try {
    const authCheck = await requirePermission('customers.edit');
    if (!authCheck.authorized) return authCheck.response;
    const body = await request.json().catch(() => ({}));
    const { routerId } = body as { routerId?: string };

    // Get users — either for a specific router or all
    const where = routerId ? { routerId } : {};
    const users = await prisma.pppoeUser.findMany({
      where,
      include: {
        profile: true,
        router: { select: { id: true, authMode: true, name: true } },
      },
    });

    if (users.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Tidak ada pelanggan untuk di-sync.',
        summary: { total: 0, synced: 0, secretsManaged: 0, profilesSynced: 0, failed: 0 },
      });
    }

    // Get unique routers (for MikroTik sync)
    const routerMap = new Map<string, { id: string; authMode: string; name: string }>();
    for (const user of users) {
      if (user.router && !routerMap.has(user.router.id)) {
        routerMap.set(user.router.id, user.router);
      }
    }

    // ─── Step 0: Sync all unique profile attributes to radgroupreply ──
    let profilesSynced = 0;
    const uniqueProfileIds = new Set<string>();
    for (const user of users) {
      if (user.profileId) uniqueProfileIds.add(user.profileId);
    }
    for (const profileId of uniqueProfileIds) {
      try {
        await syncProfileToRadGroupReply(profileId);
        profilesSynced++;
      } catch (e: any) {
        console.error(`[BULK-SYNC-RADIUS] Profile sync failed for ${profileId}:`, e?.message || e);
      }
    }

    let synced = 0;
    let secretsManaged = 0;
    let failed = 0;
    const errors: Array<{ username: string; error: string }> = [];

    for (const user of users) {
      try {
        const nasIdentifier = user.routerId || null;

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

        // Only create RADIUS entries for active/isolated users
        if (user.status === 'active' || user.status === 'isolated') {
          const groupName = user.status === 'isolated'
            ? 'isolir'
            : (user.profile?.groupName || null);

          await prisma.$executeRaw`
            INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
            VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasIdentifier})
            ON DUPLICATE KEY UPDATE value = ${user.password}
          `;

          if (groupName) {
            await prisma.$executeRaw`
              INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
              VALUES (${user.username}, ${groupName}, 1, ${nasIdentifier})
            `;
          }

          if (user.ipAddress) {
            await prisma.$executeRaw`
              INSERT INTO radreply (username, attribute, op, value, nas_identifier)
              VALUES (${user.username}, 'Framed-IP-Address', ':=', ${user.ipAddress}, ${nasIdentifier})
              ON DUPLICATE KEY UPDATE value = ${user.ipAddress}
            `;
          }
        }

        // Mark synced
        await prisma.pppoeUser.update({
          where: { id: user.id },
          data: { syncedToRadius: true, lastSyncAt: new Date() },
        });

        synced++;

        // ─── MikroTik PPP secret sync ────────────────────────────────
        // If router is in RADIUS mode, disable PPP secret (backup) + update profile
        // If router is in LOCAL mode, update secret with correct profile + enabled state
        const routerInfo = user.router ? routerMap.get(user.router.id) : null;
        if (routerInfo && user.connectionType !== 'HOTSPOT') {
          try {
            let mtProfile: string | undefined;
            if (user.status === 'isolated') {
              mtProfile = 'isolir';
            } else if (user.profileId) {
              const resolved = await getMikrotikProfileName(user.profileId);
              mtProfile = resolved || undefined;
            }

            if (routerInfo.authMode === 'radius') {
              // RADIUS mode: PPP secret = disabled backup, but update profile too
              // Use 'update' action which respects disabled param
              await managePppSecret(routerInfo.id, 'update', {
                username: user.username,
                password: user.password,
                profile: mtProfile,
                disabled: true, // disabled in RADIUS mode (backup only)
                comment: `Salfanet-${user.id.slice(0, 8)}`,
              });
            } else {
              // LOCAL mode: PPP secret = primary, enabled/disabled based on status
              const isDisabled = user.status === 'blocked' || user.status === 'stop';
              await managePppSecret(routerInfo.id, 'update', {
                username: user.username,
                password: user.password,
                profile: mtProfile,
                disabled: isDisabled,
                comment: `Salfanet-${user.id.slice(0, 8)}`,
              });
            }
            secretsManaged++;
          } catch (e: any) {
            console.error(`[BULK-SYNC-RADIUS] PPP secret sync failed for "${user.username}":`, e?.message || e);
          }
        }
      } catch (e: any) {
        failed++;
        errors.push({ username: user.username, error: e?.message || 'Unknown error' });
        console.error(`[BULK-SYNC-RADIUS] Failed for "${user.username}":`, e);
      }
    }

    // Reload FreeRADIUS
    try {
      await reloadFreeRadius();
    } catch (e) {
      console.warn('[BULK-SYNC-RADIUS] FreeRADIUS reload failed:', e);
    }

    // CoA disconnect active sessions on synced routers
    let coaResult = null;
    try {
      const usernames = users
        .filter(u => u.status === 'active' || u.status === 'isolated')
        .map(u => u.username);
      if (usernames.length > 0) {
        coaResult = await disconnectMultiplePPPoEUsers(usernames);
        console.log(`[BULK-SYNC-RADIUS] CoA disconnect result:`, coaResult);
      }
    } catch (e) {
      console.error('[BULK-SYNC-RADIUS] CoA disconnect failed:', e);
    }

    const scope = routerId ? (routerMap.get(routerId)?.name || 'router ini') : 'semua router';
    const message = `Sync RADIUS selesai: ${profilesSynced} profile (paket bandwidth) di-sync, ` +
      `${synced}/${users.length} pelanggan pada ${scope} berhasil di-sync, ` +
      `${secretsManaged} PPP secret di-update di MikroTik` +
      (failed > 0 ? `, ${failed} gagal` : '') +
      `. CoA: ${coaResult?.disconnected || 0} sesi di-kick.`;

    return NextResponse.json({
      success: true,
      message,
      summary: { total: users.length, synced, secretsManaged, profilesSynced, failed },
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      coa: coaResult,
    });
  } catch (error) {
    console.error('Bulk sync RADIUS error:', error);
    return NextResponse.json(
      { error: 'Failed to sync users to RADIUS' },
      { status: 500 }
    );
  }
}
