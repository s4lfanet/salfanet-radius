import 'server-only';
import { prisma } from '@/server/db/client';
import { Prisma } from '@prisma/client';

/**
 * External Task Outbox Service
 *
 * Transactional outbox pattern: external side effects are recorded in the
 * same DB transaction as the main operation, then processed asynchronously.
 *
 * State machine:
 *   PENDING → PROCESSING → SUCCESS (done)
 *   PENDING → PROCESSING → FAILED → PENDING (retry with backoff)
 *   PENDING → PROCESSING → FAILED → DEAD (max retries exceeded)
 *
 * Idempotency:
 *   - Unique constraint on (entityType, entityId, operation)
 *   - enqueueTask() uses upsert: if task exists and is not SUCCESS/DEAD,
 *     it updates the existing task instead of creating a duplicate.
 *   - The worker checks current entity state before applying side effects.
 */

const BACKOFF_SCHEDULE_MS = [
  30 * 1000,       // 30 seconds
  2 * 60 * 1000,   // 2 minutes
  5 * 60 * 1000,   // 5 minutes
  15 * 60 * 1000,  // 15 minutes
  30 * 60 * 1000,  // 30 minutes
];

const MAX_RETRIES = BACKOFF_SCHEDULE_MS.length;

export type TaskOperation =
  | 'sync_radius'
  | 'sync_mikrotik_create'
  | 'sync_mikrotik_update'
  | 'sync_mikrotik_delete'
  | 'send_wa'
  | 'send_email'
  | 'coa_disconnect'
  | 'reload_radius';

export type TaskStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'DEAD';

export interface ExternalTaskPayload {
  [key: string]: unknown;
}

/**
 * Enqueue an external task. Uses upsert to enforce idempotency:
 * if a task for the same (entityType, entityId, operation) already exists
 * and is not SUCCESS/DEAD, it resets to PENDING for retry.
 * If it is SUCCESS, it's a no-op (already done).
 * If it is DEAD, it resets to PENDING (manual retry).
 */
export async function enqueueTask(
  tx: Prisma.TransactionClient | typeof prisma,
  entityType: string,
  entityId: string,
  operation: TaskOperation,
  payload: ExternalTaskPayload
): Promise<void> {
  const id = `${entityType}:${entityId}:${operation}`;
  const now = new Date();
  const nextRetryAt = new Date(now.getTime() + BACKOFF_SCHEDULE_MS[0]);

  await (tx as typeof prisma).externalTask.upsert({
    where: { id },
    create: {
      id,
      entityType,
      entityId,
      operation,
      status: 'PENDING',
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      payload: payload as any,
      nextRetryAt,
    },
    update: {
      // Only reset if not already SUCCESS
      ...(await shouldResetTask(tx as typeof prisma, id) ? {
        status: 'PENDING',
        retryCount: 0,
        payload: payload as any,
        lastError: null,
        nextRetryAt,
        failedAt: null,
      } : {}),
    },
  });
}

/**
 * Check if a task should be reset (re-enqueued).
 * Returns true if task is PENDING, PROCESSING, FAILED, or DEAD.
 * Returns false if task is SUCCESS (already done — don't redo).
 */
async function shouldResetTask(
  tx: typeof prisma,
  id: string
): Promise<boolean> {
  const existing = await tx.externalTask.findUnique({ where: { id }, select: { status: true } });
  if (!existing) return true;
  return existing.status !== 'SUCCESS';
}

/**
 * Claim a task for processing (atomic conditional update).
 * Only one worker can claim a PENDING task at a time.
 */
export async function claimTask(
  tx: Prisma.TransactionClient | typeof prisma
): Promise<{ id: string; entityType: string; entityId: string; operation: string; payload: any; retryCount: number } | null> {
  const now = new Date();
  // Find the oldest due PENDING task
  const dueTasks = await (tx as typeof prisma).externalTask.findMany({
    where: {
      status: 'PENDING',
      nextRetryAt: { lte: now },
    },
    orderBy: { nextRetryAt: 'asc' },
    take: 1,
  });

  if (dueTasks.length === 0) return null;

  const task = dueTasks[0];

  // Atomic conditional claim: PENDING → PROCESSING
  const claimResult = await (tx as typeof prisma).externalTask.updateMany({
    where: { id: task.id, status: 'PENDING' },
    data: {
      status: 'PROCESSING',
      lastAttemptAt: now,
    },
  });

  if (claimResult.count === 0) {
    // Another worker claimed it — skip
    return null;
  }

  return {
    id: task.id,
    entityType: task.entityType,
    entityId: task.entityId,
    operation: task.operation,
    payload: task.payload,
    retryCount: task.retryCount,
  };
}

/**
 * Mark a task as successfully completed.
 */
export async function markTaskSuccess(taskId: string, result?: string): Promise<void> {
  await prisma.externalTask.update({
    where: { id: taskId },
    data: {
      status: 'SUCCESS',
      result: result?.slice(0, 2000) || null,
      lastError: null,
      completedAt: new Date(),
      nextRetryAt: null,
    },
  });
}

/**
 * Mark a task as failed. Schedules retry with exponential backoff
 * or marks as DEAD if max retries exceeded.
 */
export async function markTaskFailed(taskId: string, error: string): Promise<void> {
  const task = await prisma.externalTask.findUnique({ where: { id: taskId } });
  if (!task) return;

  const nextRetryCount = task.retryCount + 1;
  const backoffIdx = Math.min(task.retryCount, BACKOFF_SCHEDULE_MS.length - 1);
  const nextRetryAt = new Date(Date.now() + BACKOFF_SCHEDULE_MS[backoffIdx]);
  const isDead = nextRetryCount >= task.maxRetries;

  await prisma.externalTask.update({
    where: { id: taskId },
    data: {
      status: isDead ? 'DEAD' : 'PENDING', // Reset to PENDING for retry, or DEAD
      retryCount: nextRetryCount,
      lastError: error.slice(0, 2000),
      nextRetryAt: isDead ? null : nextRetryAt,
      failedAt: isDead ? new Date() : null,
    },
  });

  // Send Telegram alert when task goes DEAD (best-effort)
  if (isDead) {
    const { sendDeadTaskAlert } = await import('./notifications/alert.service');
    await sendDeadTaskAlert({
      taskType: 'external_task',
      taskId: task.id,
      entityType: task.entityType,
      entityId: task.entityId,
      operation: task.operation,
      retryCount: nextRetryCount,
      maxRetries: task.maxRetries,
      error,
    }).catch(() => {}); // never throw from alert
  }
}

/**
 * Get pending tasks that are due for processing.
 */
export async function getDueTasks(limit = 10): Promise<Array<{ id: string; entityType: string; entityId: string; operation: string }>> {
  const now = new Date();
  return prisma.externalTask.findMany({
    where: {
      status: 'PENDING',
      nextRetryAt: { lte: now },
    },
    orderBy: { nextRetryAt: 'asc' },
    take: limit,
    select: { id: true, entityType: true, entityId: true, operation: true },
  });
}

/**
 * Get failed/dead tasks for admin dashboard.
 */
export async function getFailedTasks(limit = 100) {
  return prisma.externalTask.findMany({
    where: { status: { in: ['FAILED', 'DEAD'] } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      entityType: true,
      entityId: true,
      operation: true,
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
 * Manually retry a dead/failed task (admin action).
 * Resets retry count and schedules immediate retry.
 */
export async function manualRetryTask(taskId: string): Promise<void> {
  await prisma.externalTask.update({
    where: { id: taskId },
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
 * Get task statistics for monitoring.
 */
export async function getTaskStats() {
  const [pending, processing, success, failed, dead] = await Promise.all([
    prisma.externalTask.count({ where: { status: 'PENDING' } }),
    prisma.externalTask.count({ where: { status: 'PROCESSING' } }),
    prisma.externalTask.count({ where: { status: 'SUCCESS' } }),
    prisma.externalTask.count({ where: { status: 'FAILED' } }),
    prisma.externalTask.count({ where: { status: 'DEAD' } }),
  ]);

  return { pending, processing, success, failed, dead, total: pending + processing + success + failed + dead };
}
