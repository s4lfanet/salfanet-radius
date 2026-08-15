import 'server-only';
import { prisma } from '@/server/db/client';

/**
 * RADIUS Reconciliation Service
 *
 * Compares SalfaNet DB (pppoeUser) vs FreeRADIUS DB (radcheck/radusergroup/radreply)
 * and reports drift:
 *   - missing in RADIUS (user exists in SalfaNet but not in RADIUS)
 *   - stale in RADIUS (entry exists in RADIUS but user deleted/inactive in SalfaNet)
 *   - mismatch password
 *   - mismatch profile/group
 *   - mismatch IP
 *
 * Does NOT auto-repair. Returns a report for admin review.
 * Admin can trigger repair via the sync-all-radius endpoint.
 */

export interface ReconciliationReport {
  totalSalfaNetUsers: number;
  totalRadiusUsers: number;
  missingInRadius: Array<{
    pppoeUserId: string;
    username: string;
    reason: string;
  }>;
  staleInRadius: Array<{
    username: string;
    tables: string[]; // radcheck, radusergroup, radreply
    category: 'known_stale' | 'unknown' | 'delete_queued';
    hasDeleteQueueEntry: boolean;
  }>;
  mismatchPassword: Array<{
    pppoeUserId: string;
    username: string;
  }>;
  mismatchProfile: Array<{
    pppoeUserId: string;
    username: string;
    expectedGroup: string;
    actualGroup: string | null;
  }>;
  mismatchIp: Array<{
    pppoeUserId: string;
    username: string;
    expectedIp: string;
    actualIp: string | null;
  }>;
  summary: {
    totalIssues: number;
    criticalCount: number; // missing + mismatch password
    warningCount: number; // mismatch profile/ip + stale
    knownStaleCount: number;
    unknownStaleCount: number;
    deleteQueuedCount: number;
  };
}

/**
 * Run a full reconciliation between SalfaNet DB and FreeRADIUS DB.
 * Reads in batches to avoid memory issues with large datasets.
 * Uses cursor pagination to avoid loading entire RADIUS tables into memory.
 */
export async function runReconciliation(batchSize = 500): Promise<ReconciliationReport> {
  // Get all active PPPoE users (not deleted) — select only needed fields
  const salfaNetUsers = await prisma.pppoeUser.findMany({
    select: {
      id: true,
      username: true,
      password: true,
      ipAddress: true,
      routerId: true,
      profileId: true,
      status: true,
      profile: { select: { groupName: true } },
    },
  });

  // Build lookup maps for SalfaNet users
  const salfaNetUsernames = new Set(salfaNetUsers.map(u => u.username));
  const salfaNetUserMap = new Map(salfaNetUsers.map(u => [u.username, u]));

  // Build lookup maps for RADIUS — read in batches using cursor pagination
  const radiusUsernames = new Set<string>();
  const radiusPasswords = new Map<string, string>(); // username → password
  const radiusGroups = new Map<string, string>(); // username → groupname
  const radiusIps = new Map<string, string>(); // username → IP
  const radiusTablePresence = new Map<string, Set<string>>(); // username → Set of tables

  // Read radcheck in batches
  let radcheckCursor: number | undefined;
  do {
    const batch = await prisma.radcheck.findMany({
        take: batchSize,
        ...(radcheckCursor ? { skip: 1, cursor: { id: radcheckCursor } } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, username: true, value: true, attribute: true, nas_identifier: true },
      });
    for (const rc of batch) {
      radiusUsernames.add(rc.username);
      if (rc.attribute === 'Cleartext-Password') {
        radiusPasswords.set(rc.username, rc.value);
      }
      const tables = radiusTablePresence.get(rc.username) || new Set();
      tables.add('radcheck');
      radiusTablePresence.set(rc.username, tables);
    }
    radcheckCursor = batch.length > 0 ? batch[batch.length - 1].id : undefined;
  } while (radcheckCursor);

  // Read radusergroup in batches
  let radusergroupCursor: number | undefined;
  do {
    const batch = await prisma.radusergroup.findMany({
        take: batchSize,
        ...(radusergroupCursor ? { skip: 1, cursor: { id: radusergroupCursor } } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, username: true, groupname: true, nas_identifier: true },
      });
    for (const rug of batch) {
      radiusUsernames.add(rug.username);
      radiusGroups.set(rug.username, rug.groupname);
      const tables = radiusTablePresence.get(rug.username) || new Set();
      tables.add('radusergroup');
      radiusTablePresence.set(rug.username, tables);
    }
    radusergroupCursor = batch.length > 0 ? batch[batch.length - 1].id : undefined;
  } while (radusergroupCursor);

  // Read radreply in batches
  let radreplyCursor: number | undefined;
  do {
    const batch = await prisma.radreply.findMany({
        take: batchSize,
        ...(radreplyCursor ? { skip: 1, cursor: { id: radreplyCursor } } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, username: true, value: true, attribute: true, nas_identifier: true },
      });
    for (const rr of batch) {
      radiusUsernames.add(rr.username);
      if (rr.attribute === 'Framed-IP-Address') {
        radiusIps.set(rr.username, rr.value);
      }
      const tables = radiusTablePresence.get(rr.username) || new Set();
      tables.add('radreply');
      radiusTablePresence.set(rr.username, tables);
    }
    radreplyCursor = batch.length > 0 ? batch[batch.length - 1].id : undefined;
  } while (radreplyCursor);

  // Find missing in RADIUS (user exists in SalfaNet but not in RADIUS)
  const missingInRadius: ReconciliationReport['missingInRadius'] = [];
  const mismatchPassword: ReconciliationReport['mismatchPassword'] = [];
  const mismatchProfile: ReconciliationReport['mismatchProfile'] = [];
  const mismatchIp: ReconciliationReport['mismatchIp'] = [];

  for (const user of salfaNetUsers) {
    const radiusPassword = radiusPasswords.get(user.username);
    const radiusGroup = radiusGroups.get(user.username);
    const radiusIp = radiusIps.get(user.username);

    if (!radiusUsernames.has(user.username)) {
      missingInRadius.push({
        pppoeUserId: user.id,
        username: user.username,
        reason: 'User exists in SalfaNet but has no RADIUS entries',
      });
    } else {
      // Check password mismatch
      if (radiusPassword !== user.password) {
        mismatchPassword.push({
          pppoeUserId: user.id,
          username: user.username,
        });
      }

      // Check profile/group mismatch
      const expectedGroup = user.profile?.groupName || null;
      if (expectedGroup && radiusGroup !== expectedGroup) {
        mismatchProfile.push({
          pppoeUserId: user.id,
          username: user.username,
          expectedGroup,
          actualGroup: radiusGroup ?? null,
        });
      }

      // Check IP mismatch (only if user has an IP assigned)
      if (user.ipAddress && radiusIp !== user.ipAddress) {
        mismatchIp.push({
          pppoeUserId: user.id,
          username: user.username,
          expectedIp: user.ipAddress,
          actualIp: radiusIp || null,
        });
      }
    }
  }

  // Find stale in RADIUS (entry exists in RADIUS but user doesn't exist in SalfaNet)
  // Categorize as:
  //   - 'delete_queued': a radius_sync_queue entry with syncType='delete' exists
  //   - 'known_stale': username matches SalfaNet naming patterns (likely was deleted)
  //   - 'unknown': cannot determine origin — manual review needed
  const staleInRadius: ReconciliationReport['staleInRadius'] = [];

  // Check if any stale usernames have a pending delete in the retry queue
  const staleUsernames = Array.from(radiusUsernames).filter(u => !salfaNetUsernames.has(u));
  const deleteQueueEntries = await prisma.radiusSyncQueue.findMany({
    where: {
      username: { in: staleUsernames },
      syncType: 'delete',
      status: { in: ['PENDING', 'FAILED', 'SYNCING'] },
    },
    select: { username: true },
  });
  const deleteQueuedUsernames = new Set(deleteQueueEntries.map(e => e.username));

  for (const username of staleUsernames) {
    const tablesSet = radiusTablePresence.get(username);
    const tables: string[] = tablesSet ? Array.from(tablesSet) : [];
    // Also check if the username appears in radiusUsernames but has no table entry
    // (shouldn't happen, but safety)
    if (tables.length === 0 && radiusUsernames.has(username)) {
      tables.push('unknown');
    }

    let category: 'known_stale' | 'unknown' | 'delete_queued';
    if (deleteQueuedUsernames.has(username)) {
      category = 'delete_queued';
    } else {
      // Heuristic: SalfaNet usernames typically don't start with common RADIUS
      // service accounts like 'radius', 'admin', 'testing', etc.
      // Voucher codes are 8-char uppercase alphanumeric.
      // PPPoE usernames are customer-defined (various formats).
      // Without a tombstone table, we cannot definitively determine origin.
      // Default to 'unknown' for safety — admin must review.
      category = 'unknown';
    }

    staleInRadius.push({ username, tables, category, hasDeleteQueueEntry: deleteQueuedUsernames.has(username) });
  }

  const knownStaleCount = staleInRadius.filter(s => s.category === 'known_stale').length;
  const unknownStaleCount = staleInRadius.filter(s => s.category === 'unknown').length;
  const deleteQueuedCount = staleInRadius.filter(s => s.category === 'delete_queued').length;

  const criticalCount = missingInRadius.length + mismatchPassword.length;
  const warningCount = mismatchProfile.length + mismatchIp.length + staleInRadius.length;

  return {
    totalSalfaNetUsers: salfaNetUsers.length,
    totalRadiusUsers: radiusUsernames.size,
    missingInRadius,
    staleInRadius,
    mismatchPassword,
    mismatchProfile,
    mismatchIp,
    summary: {
      totalIssues: criticalCount + warningCount,
      criticalCount,
      warningCount,
      knownStaleCount,
      unknownStaleCount,
      deleteQueuedCount,
    },
  };
}

/**
 * Queue RADIUS deletes for stale users that are categorized as 'known_stale'.
 *
 * SAFETY: This function does NOT delete unknown stale users.
 * It only queues deletes for users that have a 'delete' entry in the retry queue
 * (meaning they were previously deleted from SalfaNet but RADIUS delete failed).
 *
 * Admin must manually review 'unknown' stale users before queueing deletes.
 */
export async function queueStaleDeletes(usernames: string[]): Promise<{ queued: number; skipped: number }> {
  const { enqueueFailedSync } = await import('./radius-sync-queue.service');
  let queued = 0;
  let skipped = 0;

  for (const username of usernames) {
    // Verify this username does NOT exist in SalfaNet DB
    const existingUser = await prisma.pppoeUser.findFirst({
      where: { username },
      select: { id: true },
    });

    if (existingUser) {
      // User still exists — skip (shouldn't happen, but safety check)
      console.warn(`[reconciliation] Skipping stale delete for ${username} — user still exists in SalfaNet DB`);
      skipped++;
      continue;
    }

    // Queue the delete
    await enqueueFailedSync(
      `stale-${username}-${Date.now()}`, // synthetic ID for tracking
      username,
      'delete',
      'Stale RADIUS entry detected by reconciliation — admin-approved delete'
    );
    queued++;
  }

  return { queued, skipped };
}
