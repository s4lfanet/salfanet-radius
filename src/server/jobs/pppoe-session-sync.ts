/**
 * PPPoE Session Sync — Pure RADIUS approach (no MikroTik API).
 *
 * Runs periodically (every 5 min) and maintains radacct health:
 *  1. Closes stale sessions that haven't received an Accounting-Update in >1h
 *     (indicates the session ended but Accounting-Stop was lost)
 *  2. Updates acctsessiontime for healthy active sessions
 *  3. Cross-checks with pppoe_users table — closes sessions for deleted/blocked users
 *
 * This is a pure RADIUS/database approach that does NOT depend on
 * MikroTik RouterOS API connectivity.
 */

import { prisma } from '@/server/db/client';
import { nanoid } from 'nanoid';
import { randomUUID } from 'crypto';

// ── Types ───────────────────────────────────────────────────────────────────

interface SyncResult {
  success: boolean;
  inserted: number;
  closed: number;
  routers: number;
  routerErrors: number;
  error?: string;
}

// ── Lock ────────────────────────────────────────────────────────────────────

let isSyncRunning = 0;  // timestamp lock: 0 = free, >0 = lock start time
const SYNC_LOCK_TTL_MS = 2 * 60 * 1000;  // auto-expire after 2 minutes

// ── Main sync ───────────────────────────────────────────────────────────────

export async function syncPPPoESessions(): Promise<SyncResult> {
  const now = Date.now();
  if (isSyncRunning && (now - isSyncRunning) < SYNC_LOCK_TTL_MS) {
    return { success: false, inserted: 0, closed: 0, routers: 0, routerErrors: 0, error: 'Already running' };
  }
  if (isSyncRunning) {
    console.log(`[PPPoE-Sync] Stale lock detected (${Math.round((now - isSyncRunning) / 1000)}s old), resetting`);
  }

  isSyncRunning = now;
  const startedAt = Date.now();
  let closed = 0;
  let imported = 0;

  try {
    // 1. Close stale sessions — no Accounting-Update in over 90 minutes
    //    Acct-Interim-Interval = 300s (5 min), so 90 min = 18 missed intervals.
    //    90 minutes provides a safe window that survives:
    //    - Web app rebuild (PM2 stop→build→start, typically 5-20 min)
    //    - Brief FreeRADIUS restart (NAS sync, health check, OOM recovery)
    //    - MikroTik RADIUS reconnect delay after RADIUS restarts
    //    The previous 30-minute threshold was too aggressive: if FreeRADIUS
    //    was killed by OOM during a heavy build, sessions would be marked stale
    //    before MikroTik had time to send new Accounting-Interim-Update packets.
    const staleResult = await prisma.$executeRaw`
      UPDATE radacct
      SET acctstoptime = NOW(),
          acctterminatecause = 'Lost-Carrier',
          acctsessiontime = TIMESTAMPDIFF(SECOND, acctstarttime, NOW())
      WHERE acctstoptime IS NULL
        AND acctupdatetime IS NOT NULL
        AND acctupdatetime < DATE_SUB(NOW(), INTERVAL 90 MINUTE)
    `;
    closed += Number(staleResult);
    if (staleResult > 0) {
      console.log(`[PPPoE-Sync] 🔴 Closed ${staleResult} stale session(s) (no update >30m)`);
    }

    // 2. Close sessions for users that are blocked/stop/deleted in pppoe_users
    //    These users should not have active accounting sessions
    const blockedResult = await prisma.$executeRaw`
      UPDATE radacct ra
      INNER JOIN pppoe_users pu ON pu.username = ra.username
      SET ra.acctstoptime = NOW(),
          ra.acctterminatecause = 'Admin-Reset',
          ra.acctsessiontime = TIMESTAMPDIFF(SECOND, ra.acctstarttime, NOW())
      WHERE ra.acctstoptime IS NULL
        AND pu.status IN ('blocked', 'stop')
    `;
    closed += Number(blockedResult);
    if (blockedResult > 0) {
      console.log(`[PPPoE-Sync] 🔴 Closed ${blockedResult} session(s) for blocked/stop users`);
    }

    // 3. Auto-import orphan RADIUS sessions into pppoe_users
    //    Find active sessions where username is not in pppoe_users AND not hotspot voucher.
    //    For each orphan that has a radcheck entry (legitimate RADIUS user), create a
    //    minimal pppoe_users record so the session appears in the dashboard.
    const orphanRows = await prisma.$queryRaw<Array<{ username: string }>>`
      SELECT DISTINCT ra.username
      FROM radacct ra
      LEFT JOIN pppoe_users pu ON pu.username = ra.username
      LEFT JOIN hotspot_vouchers hv ON hv.code = ra.username
      WHERE ra.acctstoptime IS NULL
        AND pu.id IS NULL
        AND hv.id IS NULL
        AND ra.acctstarttime < DATE_SUB(NOW(), INTERVAL 2 MINUTE)
    `;

    if (orphanRows.length > 0) {
      // Get a default profile to assign (fallback if radusergroup has no match)
      const defaultProfile = await prisma.pppoeProfile.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, groupName: true },
      });

      for (const { username } of orphanRows) {
        try {
          // Look up group from radusergroup → find matching pppoeProfile
          const userGroup = await prisma.radusergroup.findFirst({
            where: { username },
            select: { groupname: true },
          });

          let profileId = defaultProfile?.id;
          if (userGroup?.groupname) {
            const matchedProfile = await prisma.pppoeProfile.findFirst({
              where: { groupName: userGroup.groupname, isActive: true },
              select: { id: true },
            });
            if (matchedProfile) profileId = matchedProfile.id;
          }

          if (!profileId) {
            console.log(`[PPPoE-Sync] ⚠️ Skip import "${username}" — no profile found`);
            continue;
          }

          // Get password from radcheck
          const radcheckRow = await prisma.radcheck.findFirst({
            where: { username, attribute: 'Cleartext-Password' },
            select: { value: true },
          });

          await prisma.pppoeUser.create({
            data: {
              id: randomUUID(),
              username,
              password: radcheckRow?.value || 'radius-imported',
              profileId,
              name: username,
              phone: '-',
              status: 'active',
              syncedToRadius: true,
              lastSyncAt: new Date(),
              comment: 'Auto-imported dari sesi RADIUS aktif',
            },
          });

          imported++;
          console.log(`[PPPoE-Sync] ✅ Imported user "${username}" dari sesi RADIUS aktif`);
        } catch (importErr: any) {
          // Skip if already exists (race condition) or other DB error
          if (!importErr.message?.includes('Unique constraint')) {
            console.error(`[PPPoE-Sync] ⚠️ Gagal import "${username}":`, importErr.message);
          }
        }
      }

      if (imported > 0) {
        console.log(`[PPPoE-Sync] 📥 Total imported: ${imported} user(s) dari RADIUS`);
      }
    }

    // 4. Close orphan sessions — username still not in pppoe_users AND not hotspot voucher
    //    (after import above, legitimate users should now be in pppoe_users)
    const orphanResult = await prisma.$executeRaw`
      UPDATE radacct ra
      LEFT JOIN pppoe_users pu ON pu.username = ra.username
      LEFT JOIN hotspot_vouchers hv ON hv.code = ra.username
      SET ra.acctstoptime = NOW(),
          ra.acctterminatecause = 'Lost-Carrier',
          ra.acctsessiontime = TIMESTAMPDIFF(SECOND, ra.acctstarttime, NOW())
      WHERE ra.acctstoptime IS NULL
        AND pu.id IS NULL
        AND hv.id IS NULL
        AND ra.acctstarttime < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
    `;
    closed += Number(orphanResult);
    if (orphanResult > 0) {
      console.log(`[PPPoE-Sync] 🔴 Closed ${orphanResult} orphan session(s) (user tidak terdaftar di RADIUS)`);
    }

    // 4. Update acctsessiontime for all active sessions (keep it accurate)
    await prisma.$executeRaw`
      UPDATE radacct
      SET acctsessiontime = TIMESTAMPDIFF(SECOND, acctstarttime, NOW())
      WHERE acctstoptime IS NULL
        AND acctstarttime IS NOT NULL
    `;

    // 6. Count active NAS for reporting
    const nasCount = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
      SELECT COUNT(DISTINCT nasipaddress) as cnt
      FROM radacct
      WHERE acctstoptime IS NULL
    `;
    const activeNasCount = Number(nasCount[0]?.cnt || 0);

    // 7. Log to cronHistory
    const duration = Date.now() - startedAt;
    const message = `Pure RADIUS sync: ${closed} closed, ${imported} imported, ${activeNasCount} active NAS(es)`;

    await prisma.cronHistory.create({
      data: {
        id: nanoid(),
        jobType: 'pppoe_session_sync',
        status: 'success',
        startedAt: new Date(startedAt),
        completedAt: new Date(),
        duration,
        result: message,
      },
    });

    if (closed > 0 || imported > 0) {
      console.log(`[PPPoE-Sync] ✅ ${message}`);
    }

    return { success: true, inserted: imported, closed, routers: activeNasCount, routerErrors: 0 };
  } catch (error: any) {
    console.error('[PPPoE-Sync] ❌ Error:', error.message);

    await prisma.cronHistory.create({
      data: {
        id: nanoid(),
        jobType: 'pppoe_session_sync',
        status: 'error',
        startedAt: new Date(startedAt),
        completedAt: new Date(),
        duration: Date.now() - startedAt,
        error: error.message,
      },
    }).catch(() => {});

    return { success: false, inserted: 0, closed, routers: 0, routerErrors: 0, error: error.message };
  } finally {
    isSyncRunning = 0;
  }
}
