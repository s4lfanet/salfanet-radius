import { prisma } from '@/server/db/client';
import { randomUUID } from 'crypto';
import { logCronLockAcquired, logCronLockDenied, logCronLockExpired, logCronHeartbeatFailure } from '@/server/services/monitoring.service';

/**
 * Atomic Cron Lock Service (MySQL-based distributed lock)
 *
 * Replaces the in-memory Set + findFirst race condition.
 * Uses MySQL's atomic INSERT (primary key constraint) for lock acquisition.
 * This guarantees only one instance can acquire a lock for a given job key,
 * even under concurrent execution.
 *
 * Lock properties:
 *   - unique job key (e.g. "invoice_generate")
 *   - owner token (random UUID to identify lock owner)
 *   - TTL (stale locks are reclaimable after expiry)
 *   - automatic release on completion/error
 *   - stale lock recovery
 */

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Try to acquire a lock for a cron job.
 * Uses INSERT — if the row already exists (primary key conflict), the lock is held by another instance.
 *
 * If an existing lock is expired (stale), it is reclaimed.
 *
 * Returns the owner token if successful, null if the lock is held by another instance.
 */
export async function acquireCronLock(jobKey: string, ttlMs: number = DEFAULT_TTL_MS): Promise<string | null> {
  const ownerToken = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  try {
    // First, try to delete any expired lock for this job key
    await prisma.cronLock.deleteMany({
      where: {
        jobKey,
        expiresAt: { lt: now },
      },
    });

    // Try to insert a new lock — this is atomic due to primary key constraint
    // If another instance already holds the lock, this will throw a unique constraint error
    await prisma.cronLock.create({
      data: {
        jobKey,
        ownerToken,
        acquiredAt: now,
        expiresAt,
      },
    });

    logCronLockAcquired(jobKey);
    return ownerToken;
  } catch (err) {
    // Check if this is a unique constraint violation (lock already held)
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Unique constraint') || message.includes('Duplicate entry') || message.includes('P2002')) {
      // Lock is held by another instance — check if it's stale
      const existing = await prisma.cronLock.findUnique({ where: { jobKey } });
      if (existing && existing.expiresAt < now) {
        // Stale lock — try to reclaim it using a conditional update
        // Only update if the expiresAt hasn't changed (optimistic concurrency)
        try {
          const updated = await prisma.cronLock.updateMany({
            where: {
              jobKey,
              expiresAt: existing.expiresAt, // Only reclaim if still the same stale lock
            },
            data: {
              ownerToken,
              acquiredAt: now,
              expiresAt,
            },
          });

          if (updated.count > 0) {
            return ownerToken;
          }
        } catch {
          // Another instance reclaimed it first — we lost the race
        }
      }
      // Lock is held and not stale — we cannot acquire it
      logCronLockDenied(jobKey);
      return null;
    }

    // Unknown error — rethrow
    throw err;
  }
}

/**
 * Release a cron lock. Only the owner can release it.
 * This prevents an instance from releasing a lock it doesn't own
 * (e.g., if the lock expired and was reclaimed by another instance).
 */
export async function releaseCronLock(jobKey: string, ownerToken: string): Promise<void> {
  try {
    await prisma.cronLock.deleteMany({
      where: {
        jobKey,
        ownerToken, // Only delete if we still own it
      },
    });
  } catch {
    // Non-fatal — lock will expire via TTL
  }
}

/**
 * Check if a lock is currently held (for debugging/monitoring).
 */
export async function isLockHeld(jobKey: string): Promise<boolean> {
  const lock = await prisma.cronLock.findUnique({ where: { jobKey } });
  if (!lock) return false;
  // If expired, it's not effectively held
  return lock.expiresAt > new Date();
}

/**
 * Get all active locks (for monitoring/debugging).
 */
export async function getActiveLocks() {
  const now = new Date();
  return prisma.cronLock.findMany({
    where: { expiresAt: { gte: now } },
    select: {
      jobKey: true,
      ownerToken: true,
      acquiredAt: true,
      expiresAt: true,
    },
  });
}

/**
 * Get all locks including stale ones (for monitoring).
 */
export async function getAllLocks() {
  return prisma.cronLock.findMany({
    select: {
      jobKey: true,
      ownerToken: true,
      acquiredAt: true,
      expiresAt: true,
    },
  });
}

/**
 * Force-release a lock (admin override — use with caution).
 */
export async function forceReleaseLock(jobKey: string): Promise<void> {
  await prisma.cronLock.deleteMany({ where: { jobKey } });
}

/**
 * Renew (heartbeat) a cron lock.
 *
 * Extends the TTL of a lock that is still owned by the caller.
 * Uses a conditional update — only succeeds if:
 *   1. The lock still exists
 *   2. The ownerToken matches (prevents renewing someone else's lock)
 *   3. The lock has not expired yet (prevents renewing a stale lock
 *      that may have been reclaimed by another instance)
 *
 * Returns true if the renewal succeeded, false if:
 *   - The lock was released by another process
 *   - The lock expired and was reclaimed
 *   - The ownerToken doesn't match
 *
 * If renewal fails, the caller should stop processing and abort the job,
 * because another instance may have taken over.
 *
 * Usage pattern for long-running jobs:
 *   const token = await acquireCronLock('my-job', 5 * 60 * 1000); // 5 min TTL
 *   if (!token) return; // lock held by another instance
 *   try {
 *     // Start a heartbeat interval (e.g., every 2 minutes)
 *     const heartbeat = setInterval(async () => {
 *       const ok = await renewCronLock('my-job', token, 5 * 60 * 1000);
 *       if (!ok) {
 *         console.error('[cron-lock] Heartbeat failed — aborting job (lock lost)');
 *         throw new Error('LOCK_LOST');
 *       }
 *     }, 2 * 60 * 1000);
 *
 *     // ... do the work ...
 *
 *     clearInterval(heartbeat);
 *   } finally {
 *     clearInterval(heartbeat as any);
 *     await releaseCronLock('my-job', token);
 *   }
 */
export async function renewCronLock(
  jobKey: string,
  ownerToken: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<boolean> {
  const now = new Date();
  const newExpiresAt = new Date(now.getTime() + ttlMs);

  try {
    // Conditional update — only renew if we still own it AND it hasn't expired
    const result = await prisma.cronLock.updateMany({
      where: {
        jobKey,
        ownerToken, // Only our lock
        expiresAt: { gte: now }, // Only if not yet expired
      },
      data: {
        expiresAt: newExpiresAt,
      },
    });

    if (result.count === 0) {
      logCronHeartbeatFailure(jobKey);
      console.error(`[cron-lock] Heartbeat failed for ${jobKey} — lock lost or expired`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[cron-lock] Heartbeat error for ${jobKey}:`, err);
    return false;
  }
}

/**
 * Create a heartbeat timer for a cron lock.
 *
 * Returns a NodeJS.Timeout that can be cleared with clearInterval().
 * The heartbeat calls renewCronLock periodically.
 * If renewal fails, the onLost callback is invoked.
 *
 * Usage:
 *   const token = await acquireCronLock('my-job', 10 * 60 * 1000);
 *   if (!token) return;
 *   const heartbeat = startHeartbeat('my-job', token, 10 * 60 * 1000, 3 * 60 * 1000, () => {
 *     throw new Error('LOCK_LOST');
 *   });
 *   try { ... } finally { clearInterval(heartbeat); await releaseCronLock('my-job', token); }
 */
export function startHeartbeat(
  jobKey: string,
  ownerToken: string,
  ttlMs: number = DEFAULT_TTL_MS,
  intervalMs: number = Math.floor(ttlMs / 3),
  onLost?: () => void,
): NodeJS.Timeout {
  return setInterval(async () => {
    const ok = await renewCronLock(jobKey, ownerToken, ttlMs);
    if (!ok && onLost) {
      onLost();
    }
  }, intervalMs);
}
