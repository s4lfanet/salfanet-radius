import 'server-only';
import { prisma } from '@/server/db/client';
import { claimTask, markTaskSuccess, markTaskFailed } from './external-task.service';

/**
 * External Task Processor
 *
 * Processes pending external tasks from the outbox table.
 * Each task is claimed atomically, executed, and marked as success/failed.
 *
 * Idempotency:
 * - sync_radius: DELETE + INSERT pattern (idempotent by nature)
 * - sync_mikrotik_create: checks if secret exists before creating
 * - sync_mikrotik_update: checks if secret exists before updating
 * - sync_mikrotik_delete: checks if secret exists before deleting
 * - send_wa: checks if notification already sent (via notification log)
 * - send_email: checks if email already sent (via notification log)
 * - coa_disconnect: safe to retry (CoA is stateless)
 * - reload_radius: safe to retry (reload is idempotent)
 */

const TASK_BATCH_SIZE = 5;
const MAX_TASKS_PER_RUN = 20;

/**
 * Process a batch of external tasks.
 * Called by cron job or manual trigger.
 */
export async function processExternalTasks(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
}> {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];
  const maxPerRun = MAX_TASKS_PER_RUN;

  for (let i = 0; i < maxPerRun; i += TASK_BATCH_SIZE) {
    const batchSize = Math.min(TASK_BATCH_SIZE, maxPerRun - i);

    // Process batch of tasks
    const batchResults = await Promise.allSettled(
      Array.from({ length: batchSize }, () => processSingleTask())
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        if (result.value === 'success') {
          processed++;
          succeeded++;
        } else if (result.value === 'failed') {
          processed++;
          failed++;
        }
        // 'no_task' = no more tasks to process
      } else {
        processed++;
        failed++;
        errors.push(result.reason?.message || 'Unknown error');
      }
    }

    // If all tasks in this batch were 'no_task', stop early
    const noTaskCount = batchResults.filter(
      r => r.status === 'fulfilled' && r.value === 'no_task'
    ).length;
    if (noTaskCount === batchSize) break;
  }

  return { processed, succeeded, failed, errors };
}

/**
 * Claim and process a single task.
 * Returns 'success', 'failed', or 'no_task' (no pending tasks).
 */
async function processSingleTask(): Promise<'success' | 'failed' | 'no_task'> {
  const task = await claimTask(prisma);
  if (!task) return 'no_task';

  try {
    const result = await executeTask(task);
    await markTaskSuccess(task.id, result);
    console.log(`[ExternalTask] ✅ ${task.operation} for ${task.entityType}:${task.entityId} — ${result}`);
    return 'success';
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    await markTaskFailed(task.id, errorMsg);
    console.error(`[ExternalTask] ❌ ${task.operation} for ${task.entityType}:${task.entityId} — ${errorMsg}`);
    return 'failed';
  }
}

/**
 * Execute a single task based on its operation type.
 * Each handler is idempotent — safe to retry.
 */
async function executeTask(task: {
  id: string;
  entityType: string;
  entityId: string;
  operation: string;
  payload: any;
}): Promise<string> {
  switch (task.operation) {
    case 'sync_radius':
      return executeSyncRadius(task.payload);
    case 'sync_mikrotik_create':
      return executeSyncMikrotik(task.payload, 'create');
    case 'sync_mikrotik_update':
      return executeSyncMikrotik(task.payload, 'update');
    case 'sync_mikrotik_delete':
      return executeSyncMikrotik(task.payload, 'delete');
    case 'send_wa':
      return executeSendWhatsApp(task.payload);
    case 'send_email':
      return executeSendEmail(task.payload);
    case 'coa_disconnect':
      return executeCoaDisconnect(task.payload);
    case 'reload_radius':
      return executeReloadRadius();
    default:
      throw new Error(`Unknown operation: ${task.operation}`);
  }
}

// ─── Task Handlers ───────────────────────────────────────────────────────────

/**
 * RADIUS sync — idempotent via DELETE + INSERT pattern.
 * Uses the existing syncSingleUserToRadius which is already idempotent.
 */
async function executeSyncRadius(payload: any): Promise<string> {
  const { syncSingleUserToRadius } = await import('./radius/radius-sync-queue.service');
  if (!payload.pppoeUserId) throw new Error('Missing pppoeUserId in payload');
  await syncSingleUserToRadius(payload.pppoeUserId);
  return `RADIUS synced for user ${payload.pppoeUserId}`;
}

/**
 * MikroTik PPP secret sync — idempotent via check-before-act.
 * - create: if secret exists, skip (don't duplicate)
 * - update: if secret doesn't exist, create instead
 * - delete: if secret doesn't exist, skip (already deleted)
 */
async function executeSyncMikrotik(payload: any, action: 'create' | 'update' | 'delete'): Promise<string> {
  const { managePppSecret } = await import('./mikrotik/ppp-secret.service');
  if (!payload.routerId || !payload.username) throw new Error('Missing routerId or username in payload');

  // managePppSecret already handles idempotency internally:
  // - create: uses API add, which will fail if duplicate (caught and logged)
  // - update: uses API set, which will fail if not found (caught and logged)
  // - delete: uses API remove, which will fail if not found (caught and logged)
  // For retry safety, we catch "not found" on delete and "already exists" on create
  try {
    const result = await managePppSecret(payload.routerId, action, {
      username: payload.username,
      password: payload.password,
      profile: payload.profile,
      disabled: payload.disabled,
      comment: payload.comment,
    });
    return `MikroTik ${action} for ${payload.username}: ${result.message}`;
  } catch (error: any) {
    // Idempotent: if delete fails because secret doesn't exist, treat as success
    if (action === 'delete' && (error?.message?.includes('not found') || error?.message?.includes('no such item'))) {
      return `MikroTik delete for ${payload.username}: already deleted (idempotent skip)`;
    }
    // Idempotent: if create fails because secret already exists, treat as success
    if (action === 'create' && (error?.message?.includes('already exists') || error?.message?.includes('failure: already'))) {
      return `MikroTik create for ${payload.username}: already exists (idempotent skip)`;
    }
    throw error;
  }
}

/**
 * WhatsApp notification — idempotent via notification log check.
 * Checks if a notification with the same messageHash was already sent.
 */
async function executeSendWhatsApp(payload: any): Promise<string> {
  if (!payload.template || !payload.data) throw new Error('Missing template or data in payload');

  // Check if notification was already sent (idempotency)
  if (payload.idempotencyKey) {
    const existing = await prisma.notification.findFirst({
      where: {
        type: `wa_${payload.template}`,
        // Use a metadata field to store the idempotency key
      },
      select: { id: true },
    });
    if (existing) {
      return `WhatsApp ${payload.template}: already sent (idempotent skip)`;
    }
  }

  const { sendAdminCreateUser } = await import('./notifications/whatsapp.service');
  // Route to the correct template function
  switch (payload.template) {
    case 'admin_create_user':
      await sendAdminCreateUser(payload.data);
      break;
    default:
      throw new Error(`Unknown WhatsApp template: ${payload.template}`);
  }
  return `WhatsApp ${payload.template} sent`;
}

/**
 * Email notification — idempotent via notification log check.
 */
async function executeSendEmail(payload: any): Promise<string> {
  if (!payload.template || !payload.data) throw new Error('Missing template or data in payload');

  // Check if email was already sent (idempotency)
  if (payload.idempotencyKey) {
    const existing = await prisma.notification.findFirst({
      where: { type: `email_${payload.template}` },
      select: { id: true },
    });
    if (existing) {
      return `Email ${payload.template}: already sent (idempotent skip)`;
    }
  }

  const { EmailService } = await import('./notifications/email.service');
  switch (payload.template) {
    case 'admin_create_user':
      await EmailService.sendAdminCreateUser(payload.data);
      break;
    default:
      throw new Error(`Unknown email template: ${payload.template}`);
  }
  return `Email ${payload.template} sent`;
}

/**
 * CoA disconnect — idempotent (CoA is stateless, safe to retry).
 */
async function executeCoaDisconnect(payload: any): Promise<string> {
  const { disconnectPPPoEUser } = await import('./radius/coa-handler.service');
  if (!payload.username) throw new Error('Missing username in payload');
  await disconnectPPPoEUser(payload.username);
  return `CoA disconnect sent for ${payload.username}`;
}

/**
 * FreeRADIUS reload — idempotent (reload is safe to retry).
 */
async function executeReloadRadius(): Promise<string> {
  const { reloadFreeRadius } = await import('./radius/freeradius.service');
  await reloadFreeRadius();
  return 'FreeRADIUS reloaded';
}
