import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { unauthorized, forbidden, badRequest, serverError } from '@/lib/api-response';
import {
  startBackupCron,
  startHealthCron,
  stopBackupCron,
  stopHealthCron,
  getTelegramCronStatus,
  autoBackupToTelegram,
  sendHealthCheckToTelegram,
} from '@/server/jobs/telegram-cron';

// GET - Get Telegram cron status
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized();

    if (session.user.role !== 'SUPER_ADMIN') return forbidden();

    const status = getTelegramCronStatus();

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error: any) {
    console.error('[Telegram Cron Status] Error:', error);
    return serverError(error.message);
  }
}

// POST - Control Telegram cron jobs
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized();

    if (session.user.role !== 'SUPER_ADMIN') return forbidden();

    const body = await request.json();
    const { action, job } = body;

    if (!action || !job) return badRequest('Action and job are required');

    if (action === 'start') {
      if (job === 'backup') {
        await startBackupCron();
        return NextResponse.json({
          success: true,
          message: 'Backup cron started',
        });
      } else if (job === 'health') {
        await startHealthCron();
        return NextResponse.json({
          success: true,
          message: 'Health cron started',
        });
      } else if (job === 'all') {
        await startBackupCron();
        await startHealthCron();
        return NextResponse.json({
          success: true,
          message: 'All Telegram crons started',
        });
      }
    } else if (action === 'stop') {
      if (job === 'backup') {
        stopBackupCron();
        return NextResponse.json({
          success: true,
          message: 'Backup cron stopped',
        });
      } else if (job === 'health') {
        stopHealthCron();
        return NextResponse.json({
          success: true,
          message: 'Health cron stopped',
        });
      } else if (job === 'all') {
        stopBackupCron();
        stopHealthCron();
        return NextResponse.json({
          success: true,
          message: 'All Telegram crons stopped',
        });
      }
    } else if (action === 'restart') {
      if (job === 'backup') {
        await startBackupCron();
        return NextResponse.json({
          success: true,
          message: 'Backup cron restarted',
        });
      } else if (job === 'health') {
        await startHealthCron();
        return NextResponse.json({
          success: true,
          message: 'Health cron restarted',
        });
      } else if (job === 'all') {
        await startBackupCron();
        await startHealthCron();
        return NextResponse.json({
          success: true,
          message: 'All Telegram crons restarted',
        });
      }
    } else if (action === 'run_now') {
      if (job === 'backup') {
        const result = await autoBackupToTelegram();
        return NextResponse.json({
          success: result.success,
          message: result.success ? 'Backup completed' : result.error,
        });
      } else if (job === 'health') {
        const result = await sendHealthCheckToTelegram();
        return NextResponse.json({
          success: result.success,
          message: result.success ? 'Health check completed' : result.error,
        });
      }
    }

    return badRequest('Invalid action or job');
  } catch (error: any) {
    console.error('[Telegram Cron Control] Error:', error);
    return serverError(error.message);
  }
}
