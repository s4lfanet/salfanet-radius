/**
 * Auto-Isolir service — isolir PPPoE users whose subscription has expired.
 *
 * Flow:
 *   1. Find users with status='active' AND expiredAt < now AND autoIsolationEnabled=true
 *   2. Update DB status to 'isolated'
 *   3. Update RADIUS tables (radusergroup → isolir group, remove Framed-IP)
 *   4. Enable PPP secret (isolated users still need to login for isolir profile)
 *   5. Send CoA disconnect to force re-auth with isolir profile
 *   6. Log to cron_history
 */
import { prisma } from '@/server/db/client';
import { nowWIBAsync } from '@/lib/timezone';
import { disconnectPPPoEUser, addToMikrotikAddressList } from '@/server/services/radius/coa-handler.service';
import { managePppSecret, shouldManagePppSecretForSuspend, kickPppoeSession } from '@/server/services/mikrotik/ppp-secret.service';
import { sendPushToUser } from '@/server/services/notifications/push-templates.service';

export async function runAutoIsolir(): Promise<{ isolated: number; total: number; errors: string[] }> {
  const errors: string[] = [];
  // Refresh timezone from DB — company might have changed it
  const now = await nowWIBAsync();

  // Check company settings
  const company = await prisma.company.findFirst({
    select: { isolationEnabled: true, gracePeriodDays: true, name: true, phone: true },
  });
  const isolationEnabled = company?.isolationEnabled !== false;
  if (!isolationEnabled) {
    console.log('[AUTO_ISOLIR] Isolation disabled by company settings — skipping');
    return { isolated: 0, total: 0, errors };
  }
  const graceDays = company?.gracePeriodDays || 0;
  const cutoff = new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000);

  // PREPAID: expiredAt < now - graceDays
  const prepaidExpired = await prisma.pppoeUser.findMany({
    where: {
      status: 'active',
      expiredAt: { lt: cutoff },
      autoIsolationEnabled: true,
      subscriptionType: 'PREPAID',
    },
    select: {
      id: true,
      username: true,
      name: true,
      password: true,
      ipAddress: true,
      macAddress: true,
      connectionType: true,
      profileId: true,
      routerId: true,
      expiredAt: true,
      profile: { select: { groupName: true } },
      router: { select: { id: true, authMode: true } },
    },
  });

  // POSTPAID: has OVERDUE invoice past dueDate + graceDays
  const postpaidOverdue = await prisma.pppoeUser.findMany({
    where: {
      status: 'active',
      autoIsolationEnabled: true,
      subscriptionType: 'POSTPAID',
      invoices: {
        some: {
          status: 'OVERDUE',
          dueDate: { lt: cutoff },
        },
      },
    },
    select: {
      id: true,
      username: true,
      name: true,
      password: true,
      ipAddress: true,
      macAddress: true,
      connectionType: true,
      profileId: true,
      routerId: true,
      expiredAt: true,
      profile: { select: { groupName: true } },
      router: { select: { id: true, authMode: true } },
    },
  });

  const expiredUsers = [...prepaidExpired, ...postpaidOverdue];
  console.log(`[AUTO_ISOLIR] Found ${prepaidExpired.length} prepaid + ${postpaidOverdue.length} postpaid = ${expiredUsers.length} users (grace: ${graceDays}d)`);

  let isolated = 0;
  for (const user of expiredUsers) {
    try {
      const nasIdentifier = user.router?.id || null;
      const authMode = user.router?.authMode || 'local';

      // 1. Update DB status — ATOMIC conditional update.
      // Only update if status is still 'active' — prevents double-isolation
      // if another instance already isolated this user.
      const updateResult = await prisma.pppoeUser.updateMany({
        where: { id: user.id, status: 'active' },
        data: { status: 'isolated' },
      });

      if (updateResult.count === 0) {
        // Another instance already isolated this user — skip (idempotency)
        continue;
      }

      // 2. Update RADIUS: move to isolir group (wrapped in transaction for consistency)
      await prisma.$transaction(async (tx) => {
        // Remove Auth-Type if exists
        await tx.radcheck.deleteMany({
          where: {
            username: user.username,
            attribute: 'Auth-Type',
            ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}),
          },
        });

        // Keep Cleartext-Password (user still needs to login)
        await tx.$executeRaw`
          INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
          VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasIdentifier})
          ON DUPLICATE KEY UPDATE value = ${user.password}
        `;

        // Move to isolir group
        await tx.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `;
        await tx.$executeRaw`
          INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
          VALUES (${user.username}, 'isolir', 1, ${nasIdentifier})
        `;

        // Remove static IP (user gets IP from pool-isolir)
        await tx.$executeRaw`
          DELETE FROM radreply WHERE username = ${user.username} AND attribute = 'Framed-IP-Address' AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `;
      });

      // 2b. Immediately add user's current IP to MikroTik address-list 'isolir'
      //     so firewall blocks internet even before the user reconnects.
      try {
        const activeSession = await prisma.radacct.findFirst({
          where: { username: user.username, acctstoptime: null },
          select: { framedipaddress: true, nasipaddress: true },
        });
        if (activeSession?.framedipaddress && activeSession.framedipaddress !== '0.0.0.0') {
          await addToMikrotikAddressList(
            activeSession.nasipaddress,
            activeSession.framedipaddress,
            'isolir'
          );
          console.log(`[AUTO_ISOLIR] Added ${activeSession.framedipaddress} to isolir address-list for ${user.username}`);
        }
      } catch (e: any) {
        console.warn(`[AUTO_ISOLIR] addToMikrotikAddressList failed for ${user.username}:`, e?.message || e);
      }

      // 3. MikroTik sync — based on connectionType
      const connType = user.connectionType || 'PPPOE';
      if (user.router?.id && shouldManagePppSecretForSuspend(user.router.authMode)) {
        if (connType === 'PPPOE') {
          // PPPoE: enable + change profile to 'isolir'
          // AWAIT — must complete before kick so user gets isolir profile on reconnect
          try {
            const r = await managePppSecret(user.router.id, 'enable', {
              username: user.username,
              password: user.password,
              profile: 'isolir',
              comment: `Salfanet-${user.id.slice(0, 8)}`,
            });
            console.log(`[AUTO_ISOLIR] PPP secret enable+isolir for ${user.username}: ${r.message}`);
          } catch (e: any) {
            console.error(`[AUTO_ISOLIR] PPP secret enable failed for ${user.username}:`, e?.message || e);
          }

          // Kick active PPPoE session via MikroTik API (critical for local — CoA doesn't work on local-auth sessions)
          try {
            const kicked = await kickPppoeSession(user.router.id, user.username);
            console.log(`[AUTO_ISOLIR] Kicked ${kicked} PPPoE session(s) for ${user.username}`);
          } catch (e: any) {
            console.error(`[AUTO_ISOLIR] Kick failed for ${user.username}:`, e?.message || e);
          }
        } else if (connType === 'HOTSPOT') {
          // Hotspot: disable hotspot user
          try {
            const { manageHotspotUser, kickHotspotSession } = await import('./mikrotik/arp-hotspot.service');
            const r = await manageHotspotUser(user.router!.id, 'update', {
              username: user.username, password: user.password, disabled: true, comment: 'Auto-isolir'
            });
            console.log(`[AUTO_ISOLIR] Hotspot disable for ${user.username}: ${r.message}`);
            // Also kick active hotspot session
            const kicked = await kickHotspotSession(user.router!.id, user.username);
            console.log(`[AUTO_ISOLIR] Kicked ${kicked} hotspot session(s) for ${user.username}`);
          } catch (e: any) {
            console.error(`[AUTO_ISOLIR] Hotspot disable failed for ${user.username}:`, e?.message || e);
          }
        }
        // STATIC_IP: isolation handled via RADIUS group change (radusergroup → isolir)
        // No MikroTik action needed — ARP entry stays, but RADIUS assigns isolir profile
      }

      // 4. CoA disconnect to force re-auth with isolir profile
      try {
        await disconnectPPPoEUser(user.username);
      } catch (e: any) {
        // CoA failure is non-fatal — user will get isolir profile on next login
        console.warn(`[AUTO_ISOLIR] CoA disconnect failed for ${user.username}:`, e?.message || e);
      }

      // 5. Send push notification about isolation
      await sendPushToUser(user.id, 'isolation-notice', {
        customerName: user.name || user.username,
        username: user.username,
        companyName: company?.name || '',
        companyPhone: company?.phone || '',
      }).catch((e) => console.error(`[AUTO_ISOLIR] Push failed for ${user.username}:`, e?.message || e));

      isolated++;
      const subType = prepaidExpired.find(u => u.id === user.id) ? 'PREPAID' : 'POSTPAID';
      console.log(`[AUTO_ISOLIR] Isolated ${user.username} (${subType}, expired: ${user.expiredAt?.toISOString()})`);
    } catch (e: any) {
      errors.push(`${user.username}: ${e?.message || e}`);
      console.error(`[AUTO_ISOLIR] Failed to isolate ${user.username}:`, e?.message || e);
    }
  }

  return { isolated, total: expiredUsers.length, errors };
}

/**
 * Auto-stop users who have been isolated for too long without payment.
 * Currently: isolated > 30 days → stop (remove from RADIUS entirely).
 */
export async function runAutoStop(): Promise<{ stopped: number; total: number; errors: string[] }> {
  const errors: string[] = [];
  const now = await nowWIBAsync();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Find users isolated more than 30 days ago
  // We use expiredAt as proxy since we don't have isolatedAt timestamp
  const longIsolatedUsers = await prisma.pppoeUser.findMany({
    where: {
      status: 'isolated',
      expiredAt: { lt: thirtyDaysAgo },
    },
    select: {
      id: true,
      username: true,
      password: true,
      ipAddress: true,
      macAddress: true,
      connectionType: true,
      routerId: true,
      router: { select: { id: true, authMode: true } },
    },
  });

  let stopped = 0;
  for (const user of longIsolatedUsers) {
    try {
      const nasIdentifier = user.router?.id || null;

      // Update DB status — ATOMIC conditional update.
      // Only update if status is still 'isolated' — prevents double-stop.
      const updateResult = await prisma.pppoeUser.updateMany({
        where: { id: user.id, status: 'isolated' },
        data: { status: 'stop' },
      });

      if (updateResult.count === 0) {
        // Another instance already stopped this user — skip (idempotency)
        continue;
      }

      // Remove from all RADIUS tables
      await prisma.$executeRaw`
        DELETE FROM radcheck WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
      `;
      await prisma.$executeRaw`
        DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
      `;
      await prisma.$executeRaw`
        DELETE FROM radreply WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
      `;

      // Disable MikroTik entry + kick active session — based on connectionType
      const connType = user.connectionType || 'PPPOE';
      if (user.router?.id && shouldManagePppSecretForSuspend(user.router.authMode)) {
        if (connType === 'PPPOE') {
          try {
            const r = await managePppSecret(user.router.id, 'disable', { username: user.username, password: user.password });
            console.log(`[AUTO_STOP] PPP secret disable for ${user.username}: ${r.message}`);
          } catch (e: any) {
            console.error(`[AUTO_STOP] PPP secret disable failed for ${user.username}:`, e?.message || e);
          }
          try {
            const kicked = await kickPppoeSession(user.router.id, user.username);
            console.log(`[AUTO_STOP] Kicked ${kicked} PPPoE session(s) for ${user.username}`);
          } catch (e: any) {
            console.error(`[AUTO_STOP] Kick failed for ${user.username}:`, e?.message || e);
          }
        } else if (connType === 'HOTSPOT') {
          try {
            const { manageHotspotUser, kickHotspotSession } = await import('./mikrotik/arp-hotspot.service');
            const r = await manageHotspotUser(user.router!.id, 'update', { username: user.username, password: user.password, disabled: true });
            console.log(`[AUTO_STOP] Hotspot disable for ${user.username}: ${r.message}`);
            const kicked = await kickHotspotSession(user.router!.id, user.username);
            console.log(`[AUTO_STOP] Kicked ${kicked} hotspot session(s) for ${user.username}`);
          } catch (e: any) {
            console.error(`[AUTO_STOP] Hotspot disable failed for ${user.username}:`, e?.message || e);
          }
        }
        // STATIC_IP: RADIUS tables already cleared, ARP entry can stay (no auth without RADIUS)
      }

      // CoA disconnect
      try {
        await disconnectPPPoEUser(user.username);
      } catch (e: any) {
        console.warn(`[AUTO_STOP] CoA disconnect failed for ${user.username}:`, e?.message || e);
      }

      stopped++;
      console.log(`[AUTO_STOP] Stopped ${user.username} (isolated >30 days)`);
    } catch (e: any) {
      errors.push(`${user.username}: ${e?.message || e}`);
      console.error(`[AUTO_STOP] Failed to stop ${user.username}:`, e?.message || e);
    }
  }

  return { stopped, total: longIsolatedUsers.length, errors };
}
