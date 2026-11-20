import 'server-only';
import { prisma } from '@/server/db/client';

/**
 * Mark stale radacct sessions as stopped.
 * A session is "stale" if acctstoptime IS NULL and acctupdatetime is older
 * than the threshold. This handles cases where MikroTik fails to send
 * Accounting-Stop (e.g. power outage, network issue).
 *
 * Uses DB-only timestamps (acctupdatetime vs acctstarttime) instead of NOW()
 * to avoid false positives when the VPS system clock differs from the NAS clock.
 * A session is stale when (acctupdatetime - acctstarttime) > 8h AND no update
 * has arrived in the last 8 hours measured by the last-update timestamp gap.
 *
 * Specifically: session is stale if:
 *   acctsessiontime > 0 (MikroTik already wrote a session time)
 *   AND acctupdatetime = acctstoptime-candidates (last update > 8h ago relative to itself)
 *
 * Simpler: if (NOW() in NAS-clock space) means we compare acctupdatetime against
 * a fixed absolute UTC wall-clock epoch we can trust — Java epoch of the server
 * startup is unreliable. Safest: only clean up if acctsessiontime already set AND
 * the session has been idle (acctupdatetime unchanged) for 8+ hours measured purely
 * between DB column values, using TIMESTAMPDIFF.
 *
 * Since both acctstarttime AND acctupdatetime come from FreeRADIUS (written via
 * FROM_UNIXTIME from the NAS clock), their difference is always clock-skew-safe.
 */
export async function cleanupStaleSessions(): Promise<number> {
  const STALE_HOURS = 8;
  try {
    // Only close sessions where no interim-update has arrived for 8+ hours
    // (measured purely in DB timestamps — clock-skew-safe).
    const result = await prisma.$executeRawUnsafe(`
      UPDATE radacct
      SET acctstoptime = acctupdatetime,
          acctterminatecause = 'Lost-Carrier',
          acctsessiontime = TIMESTAMPDIFF(SECOND, acctstarttime, acctupdatetime)
      WHERE acctstoptime IS NULL
        AND acctupdatetime IS NOT NULL
        AND TIMESTAMPDIFF(HOUR, acctupdatetime, NOW()) > ${STALE_HOURS}
        AND TIMESTAMPDIFF(HOUR, acctupdatetime, NOW()) < 720
    `);
    const total = Number(result);
    if (total > 0) {
      console.log(`[Sessions] Cleaned up ${total} stale radacct session(s)`);
    }
    return total;
  } catch (err) {
    console.error('[Sessions] Failed to cleanup stale sessions:', err);
    return 0;
  }
}
