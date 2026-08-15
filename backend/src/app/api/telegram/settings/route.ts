import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { testTelegramConnection } from '@/server/services/notifications/telegram.service';

// GET - Get current Telegram settings
export async function GET(request: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.view');
    if (!authCheck.authorized) return authCheck.response;

    const settings = await prisma.telegramBackupSettings.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (!settings) {
      return NextResponse.json({
        enabled: false,
        botToken: '',
        chatId: '',
        backupTopicId: '',
        healthTopicId: '',
        schedule: 'daily',
        scheduleTime: '00:00',
        keepLastN: 7,
      });
    }

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error('[Telegram Settings] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get settings' },
      { status: 500 }
    );
  }
}

// POST - Update Telegram settings
export async function POST(request: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.edit');
    if (!authCheck.authorized) return authCheck.response;

    const body = await request.json();
    const {
      enabled,
      botToken,
      chatId,
      backupTopicId,
      healthTopicId,
      schedule,
      scheduleTime,
      keepLastN,
    } = body;

    // Validate required fields if enabled
    if (enabled) {
      if (!botToken || !chatId) {
        return NextResponse.json(
          { error: 'Bot token and chat ID are required when enabled' },
          { status: 400 }
        );
      }
    }

    // Delete old settings and create new one
    await prisma.telegramBackupSettings.deleteMany({});
    
    const settings = await prisma.telegramBackupSettings.create({
      data: {
        enabled: enabled || false,
        botToken: botToken || '',
        chatId: chatId || '',
        backupTopicId: backupTopicId || null,
        healthTopicId: healthTopicId || null,
        schedule: schedule || 'daily',
        scheduleTime: scheduleTime || '00:00',
        keepLastN: keepLastN || 7,
      },
    });

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error: any) {
    console.error('[Telegram Settings] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
