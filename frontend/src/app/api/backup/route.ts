import { NextRequest, NextResponse } from 'next/server';
import { getBackupHistory, createBackup } from '@/server/services/backup.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

/**
 * GET /api/backup
 * Get list of all backups
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const backups = await getBackupHistory(50);

    // Convert BigInt to Number for JSON serialization
    const serializedBackups = backups.map((item) => ({
      ...item,
      filesize: Number(item.filesize),
    }));

    return NextResponse.json({
      success: true,
      backups: serializedBackups,
    });
  } catch (error: any) {
    console.error('[Backup API] GET Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/backup
 * Create a new backup
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await createBackup('manual');

    return NextResponse.json({
      success: true,
      backup: result.backup ? {
        ...result.backup,
        filesize: Number(result.backup.filesize),
      } : null,
    });
  } catch (error: any) {
    console.error('[Backup API] POST Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
