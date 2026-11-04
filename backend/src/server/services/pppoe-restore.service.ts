/**
 * Restore a PPPoE/Hotspot user to 'active' — DB status, RADIUS tables,
 * MikroTik secret/hotspot user, then kick + CoA so the next login gets the
 * normal profile. Same steps as PUT /api/pppoe/users/status with
 * status='active', usable from cron jobs and maintenance scripts.
 */
import { prisma } from '@/server/db/client';
import { disconnectPPPoEUser } from '@/server/services/radius/coa-handler.service';
import { managePppSecret, shouldManagePppSecretForSuspend, kickPppoeSession } from '@/server/services/mikrotik/ppp-secret.service';

export interface RestoreResult {
  username: string;
  restored: boolean;
  message: string;
}

/**
 * @param expectedStatuses only restore when the current status is one of these
 *   (atomic guard so a concurrent change is never overwritten)
 */
export async function restoreUserAccess(
  userId: string,
  expectedStatuses: string[] = ['isolated', 'stop'],
  logTag = 'RESTORE',
): Promise<RestoreResult> {
  const user = await prisma.pppoeUser.findUnique({
    where: { id: userId },
    select: {
      id: true, username: true, status: true, password: true, ipAddress: true,
      connectionType: true,
      profile: { select: { groupName: true } },
      router: { select: { id: true, authMode: true } },
    },
  });
  if (!user) return { username: userId, restored: false, message: 'user not found' };

  const oldStatus = user.status;
  const nasIdentifier = user.router?.id || null;

  const changed = await prisma.$transaction(async (tx) => {
    const res = await tx.pppoeUser.updateMany({
      where: { id: user.id, status: { in: expectedStatuses } },
      data: { status: 'active' },
    });
    if (res.count === 0) return false;

    for (const attribute of ['Auth-Type', 'NAS-IP-Address']) {
      await tx.radcheck.deleteMany({
        where: { username: user.username, attribute, ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}) },
      });
    }
    await tx.radreply.deleteMany({
      where: { username: user.username, attribute: 'Reply-Message', ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}) },
    });
    await tx.$executeRaw`
      INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
      VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasIdentifier})
      ON DUPLICATE KEY UPDATE value = ${user.password}
    `;
    await tx.$executeRaw`
      DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
    `;
    if (user.profile) {
      await tx.$executeRaw`
        INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
        VALUES (${user.username}, ${user.profile.groupName}, 1, ${nasIdentifier})
      `;
    }
    if (user.ipAddress) {
      await tx.$executeRaw`
        INSERT INTO radreply (username, attribute, op, value, nas_identifier)
        VALUES (${user.username}, 'Framed-IP-Address', ':=', ${user.ipAddress}, ${nasIdentifier})
        ON DUPLICATE KEY UPDATE value = ${user.ipAddress}
      `;
    }
    return true;
  });

  if (!changed) {
    return { username: user.username, restored: false, message: `status is '${oldStatus}', not in [${expectedStatuses.join(', ')}]` };
  }

  if (user.router?.id && shouldManagePppSecretForSuspend(user.router.authMode)) {
    const connType = user.connectionType || 'PPPOE';
    try {
      if (connType === 'HOTSPOT') {
        const { manageHotspotUser, kickHotspotSession } = await import('@/server/services/mikrotik/arp-hotspot.service');
        await manageHotspotUser(user.router.id, 'update', {
          username: user.username, password: user.password, disabled: false,
          comment: `Salfanet-${user.id.slice(0, 8)}`,
        });
        await kickHotspotSession(user.router.id, user.username);
      } else {
        await managePppSecret(user.router.id, 'enable', {
          username: user.username, password: user.password,
          profile: user.profile?.groupName || undefined,
          comment: `Salfanet-${user.id.slice(0, 8)}`,
        });
        await kickPppoeSession(user.router.id, user.username);
      }
    } catch (e: any) {
      console.error(`[${logTag}] MikroTik restore failed for ${user.username}:`, e?.message || e);
    }
  }

  try {
    await disconnectPPPoEUser(user.username);
  } catch (e: any) {
    console.warn(`[${logTag}] CoA disconnect failed for ${user.username}:`, e?.message || e);
  }

  console.log(`[${logTag}] Restored ${user.username} (${oldStatus} → active)`);
  return { username: user.username, restored: true, message: `${oldStatus} → active` };
}
