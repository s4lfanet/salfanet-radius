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

  try {
    // 1. Close stale sessions — no Accounting-Update in over 1 hour
    //    This means the NAS stopped sending updates (session likely ended,
    //    but Accounting-Stop packet was lost due to restart/network issue)
    const staleResult = await prisma.$executeRaw`
      UPDATE radacct
      SET acctstoptime = NOW(),
          acctterminatecause = 'Lost-Carrier',
          acctsessiontime = TIMESTAMPDIFF(SECOND, acctstarttime, NOW())
      WHERE acctstoptime IS NULL
        AND acctupdatetime IS NOT NULL
        AND acctupdatetime < DATE_SUB(NOW(), INTERVAL 1 HOUR)
    `;
    closed += Number(staleResult);
    if (staleResult > 0) {
      console.log(`[PPPoE-Sync] 🔴 Closed ${staleResult} stale session(s) (no update >1h)`);
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

    // 3. Close orphan sessions — username doesn't exist in pppoe_users at all
    //    and not a hotspot voucher either (those are handled by hotspot-sync)
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
      console.log(`[PPPoE-Sync] 🔴 Closed ${orphanResult} orphan session(s) (user not found)`);
    }

    // 4. Update acctsessiontime for all active sessions (keep it accurate)
    await prisma.$executeRaw`
      UPDATE radacct
      SET acctsessiontime = TIMESTAMPDIFF(SECOND, acctstarttime, NOW())
      WHERE acctstoptime IS NULL
        AND acctstarttime IS NOT NULL
    `;

    // 5. Count active NAS for reporting
    const nasCount = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
      SELECT COUNT(DISTINCT nasipaddress) as cnt
      FROM radacct
      WHERE acctstoptime IS NULL
    `;
    const activeNasCount = Number(nasCount[0]?.cnt || 0);

    // 6. Log to cronHistory
    const duration = Date.now() - startedAt;
    const message = `Pure RADIUS sync: ${closed} closed, ${activeNasCount} active NAS(es)`;

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

    if (closed > 0) {
      console.log(`[PPPoE-Sync] ✅ ${message}`);
    }

    return { success: true, inserted: 0, closed, routers: activeNasCount, routerErrors: 0 };
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
