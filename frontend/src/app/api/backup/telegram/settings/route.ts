import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';

// GET - Get Telegram backup settings from database
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
