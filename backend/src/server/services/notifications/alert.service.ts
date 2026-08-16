/**
 * Alert Service — sends Telegram alerts for critical system events.
 *
 * Currently used for:
 * - DEAD external tasks (tasks that exhausted all retries)
 * - DEAD RADIUS sync queue entries
 *
 * Uses the existing telegramBackupSettings for credentials.
 * Alerts are best-effort: failures are logged but never throw.
 */
import 'server-only';
import { prisma } from '@/server/db/client';

interface DeadTaskAlertData {
  taskType: 'external_task' | 'radius_sync';
  taskId: string;
  entityType?: string;
  entityId?: string;
  operation?: string;
  username?: string;
  retryCount: number;
  maxRetries: number;
  error: string;
}

/**
 * Send a Telegram alert when a task moves to DEAD status.
 * Best-effort: silently fails if Telegram is not configured.
 */
export async function sendDeadTaskAlert(data: DeadTaskAlertData): Promise<void> {
  try {
    const settings = await prisma.telegramBackupSettings.findFirst({
      where: { enabled: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!settings?.botToken || !settings?.chatId) {
      // Telegram not configured — skip silently
      return;
    }

    const { sendTelegramMessage } = await import('./notifications/telegram.service');

    const typeLabel = data.taskType === 'external_task' ? 'External Task' : 'RADIUS Sync';
    const entityInfo = data.entityType
      ? `\n<b>Entity:</b> ${data.entityType}:${data.entityId || 'N/A'}`
      : data.username
        ? `\n<b>Username:</b> ${data.username}`
        : '';
    const opInfo = data.operation ? `\n<b>Operation:</b> ${data.operation}` : '';

    const message = [
      `🚨 <b>DEAD ${typeLabel} Alert</b>`,
      '',
      `<b>Task ID:</b> ${data.taskId}${entityInfo}${opInfo}`,
      `<b>Retries:</b> ${data.retryCount}/${data.maxRetries}`,
      `<b>Error:</b> ${(data.error || 'Unknown').slice(0, 500)}`,
      '',
      `⚠️ Task exhausted all retries and moved to DEAD status.`,
      `Manual retry may be needed via admin panel.`,
    ].join('\n');

    await sendTelegramMessage(
      {
        botToken: settings.botToken,
        chatId: settings.chatId,
        topicId: settings.healthTopicId || undefined,
      },
      message
    );

    console.log(`[Dead Task Alert] Telegram alert sent for ${data.taskType} ${data.taskId}`);
  } catch (err) {
    // Best-effort — never throw from alert
    console.error('[Dead Task Alert] Failed to send Telegram alert:', err instanceof Error ? err.message : err);
  }
}
