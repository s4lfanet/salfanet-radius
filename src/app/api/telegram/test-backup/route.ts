import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { createBackup } from '@/server/services/backup.service';
import { sendBackupToTelegram } from '@/server/services/notifications/telegram.service';
import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '@/server/db/client';
import * as fs from 'fs/promises';

// Allow up to 5 minutes for backup creation + compression + Telegram upload
export const maxDuration = 300;

// POST - Test auto backup by creating a real backup and sending it to Telegram
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Load Telegram settings from database
    const settings = await prisma.telegramBackupSettings.findFirst({
      where: { enabled: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!settings || !settings.botToken || !settings.chatId) {
      return NextResponse.json(
        { error: 'Telegram backup settings must be enabled and bot token/chat ID must be saved first' },
        { status: 400 }
      );
    }

    const { botToken, chatId, backupTopicId } = settings;
    const now = formatInTimeZone(new Date(), 'Asia/Jakarta', 'dd MMM yyyy HH:mm');

    // Step 1: Create actual backup
    const backupResult = await createBackup('manual');
    if (!backupResult.success || !backupResult.filepath || !backupResult.backup) {
      return NextResponse.json({ error: 'Backup failed: unable to create backup file' }, { status: 500 });
    }

    const { filepath, backup } = backupResult;

    try {
      await fs.access(filepath);
    } catch {
      return NextResponse.json({ error: 'Backup failed: file was not created on disk' }, { status: 500 });
    }

    // Step 2: Send backup file to Telegram
    const sendResult = await sendBackupToTelegram(
      {
        botToken,
        chatId,
        topicId: backupTopicId || undefined,
      },
      filepath,
      Number(backup.filesize)
    );

    if (!sendResult.success) {
      return NextResponse.json(
        { error: `Backup created at ${now} WIB but failed to send to Telegram: ${sendResult.error}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Backup file sent to Telegram successfully!`,
      filename: backup.filename,
      filesize: Number(backup.filesize),
    });
  } catch (error: any) {
    console.error('[Telegram Test Backup] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create or send backup' },
      { status: 500 }
    );
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
