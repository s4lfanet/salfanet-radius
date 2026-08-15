import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';

// GET - Get Telegram backup settings from database
export async function GET(request: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.view');
    if (!authCheck.authorized) return authCheck.response;

    const settings = await prisma.telegramBackupSettings.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (!settings) {
      return NextResponse.json({
        success: true,
        settings: {
          enabled: false,
          botToken: '',
          chatId: '',
          backupTopicId: '',
          healthTopicId: '',
          schedule: 'daily',
          scheduleTime: '02:00',
          keepLastN: 7,
        },
      });
    }

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
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

    if (enabled && (!botToken || !chatId)) {
      return NextResponse.json(
        { error: 'Bot token and chat ID are required when enabled' },
        { status: 400 }
      );
    }

    await prisma.telegramBackupSettings.deleteMany({});

    const settings = await prisma.telegramBackupSettings.create({
      data: {
        enabled: enabled || false,
        botToken: botToken || '',
        chatId: chatId || '',
        backupTopicId: backupTopicId || null,
        healthTopicId: healthTopicId || null,
        schedule: schedule || 'daily',
        scheduleTime: scheduleTime || '02:00',
        keepLastN: keepLastN || 7,
      },
    });

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
