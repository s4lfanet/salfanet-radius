import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { badRequest, serverError } from '@/lib/api-response';

/**
 * GET /api/cron/telegram — get telegram bot status (native Next.js)
 * POST /api/cron/telegram — control telegram bot (start/stop)
 *
 * Previously delegated to NestJS backend — now native.
 */

export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('settings.cron');
  if (!authCheck.authorized) return authCheck.response;
  try {
    const config = await prisma.telegramBackupSettings.findFirst();
    return NextResponse.json({
      success: true,
      data: {
        enabled: config?.enabled ?? false,
        botToken: config?.botToken ? '***configured***' : null,
        chatId: config?.chatId || null,
        schedule: config?.schedule || 'daily',
        scheduleTime: config?.scheduleTime || '02:00',
        lastSyncAt: null,
      },
    });
  } catch (error: any) {
    return serverError(error.message);
  }
}

export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('settings.cron');
  if (!authCheck.authorized) return authCheck.response;
  try {
    const body = await request.json();
    const { action } = body;
    if (!action || !['start', 'stop', 'test'].includes(action)) {
      return badRequest('Action must be start, stop, or test');
    }

    if (action === 'test') {
      const { sendTelegramMessage } = await import('@/server/services/notifications/telegram.service');
      const config = await prisma.telegramBackupSettings.findFirst();
      if (!config?.botToken || !config?.chatId) {
        return badRequest('Telegram bot not configured');
      }
      try {
        await sendTelegramMessage(
          { botToken: config.botToken, chatId: config.chatId },
          '🤖 Test message from Salfanet Cron'
        );
        return NextResponse.json({ success: true, message: 'Test message sent' });
      } catch (e: any) {
        return serverError(`Failed to send: ${e.message}`);
      }
    }

    // start/stop — just toggle enabled flag
    const enabled = action === 'start';
    await prisma.telegramBackupSettings.updateMany({ data: { enabled } });

    return NextResponse.json({
      success: true,
      message: `Telegram bot ${enabled ? 'started' : 'stopped'}`,
    });
  } catch (error: any) {
    return serverError(error.message);
  }
}
