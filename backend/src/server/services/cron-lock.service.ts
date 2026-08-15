import 'server-only';
import { prisma } from '@/server/db/client';
import { randomUUID } from 'crypto';

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
