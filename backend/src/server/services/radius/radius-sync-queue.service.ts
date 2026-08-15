import 'server-only';
import { prisma } from '@/server/db/client';
import { randomUUID } from 'crypto';

/**
 * RADIUS Sync Retry Queue Service
 *
 * Tracks failed RADIUS syncs and retries them with exponential backoff:
 *   1m → 5m → 15m → 30m → 1h
 *
 * After maxRetries (5), status becomes DEAD and admin must manually retry.
 */

const BACKOFF_SCHEDULE_MS = [
  1 * 60 * 1000,   // 1 minute
  5 * 60 * 1000,   // 5 minutes
  15 * 60 * 1000,  // 15 minutes
  30 * 60 * 1000,  // 30 minutes
  60 * 60 * 1000,  // 1 hour
];

const MAX_RETRIES = BACKOFF_SCHEDULE_MS.length;

export type SyncType = 'full' | 'password' | 'profile' | 'ip' | 'status' | 'delete';
export type SyncStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'DEAD';

/**
 * Enqueue a failed RADIUS sync for retry.
 * If an entry already exists for the same user+syncType and is not DEAD/SYNCED,
 * update it instead of creating a duplicate.
 */
export async function enqueueFailedSync(
  pppoeUserId: string,
  username: string,
  syncType: SyncType,
  error: string
): Promise<void> {
  const existing = await prisma.radiusSyncQueue.findFirst({
    where: {
      pppoeUserId,
      syncType,
      status: { in: ['PENDING', 'FAILED', 'SYNCING'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    // Update existing entry — increment retry count, set next retry
    const nextRetryCount = existing.retryCount + 1;
    const backoffIdx = Math.min(existing.retryCount, BACKOFF_SCHEDULE_MS.length - 1);
    const nextRetryAt = new Date(Date.now() + BACKOFF_SCHEDULE_MS[backoffIdx]);

    const isDead = nextRetryCount >= MAX_RETRIES;

    await prisma.radiusSyncQueue.update({
      where: { id: existing.id },
      data: {
        status: isDead ? 'DEAD' : 'FAILED',
        retryCount: nextRetryCount,
        lastError: error.slice(0, 2000), // Limit error length, no secrets
        lastAttemptAt: new Date(),
        nextRetryAt: isDead ? null : nextRetryAt,
        failedAt: isDead ? new Date() : null,
        maxRetries: MAX_RETRIES,
      },
    });
  } else {
    // Create new entry
    const nextRetryAt = new Date(Date.now() + BACKOFF_SCHEDULE_MS[0]);
    await prisma.radiusSyncQueue.create({
      data: {
        id: randomUUID(),
        pppoeUserId,
        username,
        syncType,
        status: 'PENDING',
        retryCount: 0,
        maxRetries: MAX_RETRIES,
        lastError: error.slice(0, 2000),
        nextRetryAt,
      },
    });
  }
}

/**
 * Mark a sync queue entry as successfully synced.
 */
export async function markSynced(queueId: string): Promise<void> {
  await prisma.radiusSyncQueue.update({
    where: { id: queueId },
    data: {
      status: 'SYNCED',
      completedAt: new Date(),
      lastError: null,
    },
  });
}

/**
 * Mark a sync queue entry as failed (but still retryable).
 */
export async function markFailed(queueId: string, error: string): Promise<void> {
  const entry = await prisma.radiusSyncQueue.findUnique({ where: { id: queueId } });
  if (!entry) return;

  const nextRetryCount = entry.retryCount + 1;
  const backoffIdx = Math.min(entry.retryCount, BACKOFF_SCHEDULE_MS.length - 1);
  const nextRetryAt = new Date(Date.now() + BACKOFF_SCHEDULE_MS[backoffIdx]);
  const isDead = nextRetryCount >= entry.maxRetries;

  await prisma.radiusSyncQueue.update({
    where: { id: queueId },
    data: {
      status: isDead ? 'DEAD' : 'FAILED',
      retryCount: nextRetryCount,
      lastError: error.slice(0, 2000),
      lastAttemptAt: new Date(),
      nextRetryAt: isDead ? null : nextRetryAt,
      failedAt: isDead ? new Date() : null,
    },
  });
}

/**
 * Get all pending retries that are due for processing.
 */
export async function getDueRetries(limit = 50): Promise<Array<{ id: string; pppoeUserId: string; username: string; syncType: string }>> {
  const now = new Date();
  const entries = await prisma.radiusSyncQueue.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      nextRetryAt: { lte: now },
    },
    orderBy: { nextRetryAt: 'asc' },
    take: limit,
    select: { id: true, pppoeUserId: true, username: true, syncType: true },
  });
  return entries;
}

/**
 * Get failed/dead syncs for admin dashboard.
 */
export async function getFailedSyncs(limit = 100) {
  return prisma.radiusSyncQueue.findMany({
    where: { status: { in: ['FAILED', 'DEAD'] } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      pppoeUserId: true,
      username: true,
      syncType: true,
      status: true,
      retryCount: true,
      maxRetries: true,
      lastError: true,
      lastAttemptAt: true,
      nextRetryAt: true,
      failedAt: true,
      createdAt: true,
    },
  });
}

/**
 * Manually retry a dead/failed sync (admin action).
 * Resets retry count and schedules immediate retry.
 */
export async function manualRetry(queueId: string): Promise<void> {
  await prisma.radiusSyncQueue.update({
    where: { id: queueId },
    data: {
      status: 'PENDING',
      retryCount: 0,
      nextRetryAt: new Date(),
      failedAt: null,
      lastError: null,
    },
  });
}

/**
 * Sync a single PPPoE user to RADIUS tables.
 * This is the core sync logic — used by both the retry processor and manual sync.
 * Returns true on success, throws on failure.
 */
export async function syncSingleUserToRadius(pppoeUserId: string): Promise<void> {
  const user = await prisma.pppoeUser.findUnique({
    where: { id: pppoeUserId },
    include: { profile: true },
  });

  if (!user) {
    throw new Error(`PPPoE user not found: ${pppoeUserId}`);
  }

  const { username, password, ipAddress, profile } = user;
  const nasIdentifier = user.routerId || null;

  // Use transaction for atomicity per user
  await prisma.$transaction(async (tx) => {
    // Delete old entries scoped by nas_identifier
    await tx.radcheck.deleteMany({
      where: nasIdentifier
        ? { username, nas_identifier: nasIdentifier }
        : { username, nas_identifier: null },
    });
    await tx.radusergroup.deleteMany({
      where: nasIdentifier
        ? { username, nas_identifier: nasIdentifier }
        : { username, nas_identifier: null },
    });
    await tx.radreply.deleteMany({
      where: nasIdentifier
        ? { username, nas_identifier: nasIdentifier }
        : { username, nas_identifier: null },
    });

    // Re-create radcheck (password)
    await tx.radcheck.create({
      data: { username, attribute: 'Cleartext-Password', op: ':=', value: password, nas_identifier: nasIdentifier },
    });

    // Re-create radusergroup (profile group)
    if (profile?.groupName) {
      await tx.radusergroup.create({
        data: { username, groupname: profile.groupName, priority: 0, nas_identifier: nasIdentifier },
      });
    }

    // Re-create radreply (static IP)
    if (ipAddress) {
      await tx.radreply.create({
        data: { username, attribute: 'Framed-IP-Address', op: ':=', value: ipAddress, nas_identifier: nasIdentifier },
      });
    }

    // Mark synced
    await tx.pppoeUser.update({
      where: { id: user.id },
      data: { syncedToRadius: true, lastSyncAt: new Date() },
    });
  });
}

/**
 * Process due retries — called by cron job.
 * Processes entries in batches to avoid overwhelming the database.
 */
export async function processRetryQueue(batchSize = 50): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  dead: number;
}> {
  const dueEntries = await getDueRetries(batchSize);

  let succeeded = 0;
  let failed = 0;
  let dead = 0;

  for (const entry of dueEntries) {
    // Mark as SYNCING
    await prisma.radiusSyncQueue.update({
      where: { id: entry.id },
      data: { status: 'SYNCING', lastAttemptAt: new Date() },
    });

    try {
      await syncSingleUserToRadius(entry.pppoeUserId);
      await markSynced(entry.id);
      succeeded++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      await markFailed(entry.id, errorMsg);

      // Check if it became dead
      const updated = await prisma.radiusSyncQueue.findUnique({
        where: { id: entry.id },
        select: { status: true },
      });
      if (updated?.status === 'DEAD') {
        dead++;
      } else {
        failed++;
      }
    }
  }

  return { processed: dueEntries.length, succeeded, failed, dead };
}
