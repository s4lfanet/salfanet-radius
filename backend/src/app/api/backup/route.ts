import { NextRequest, NextResponse } from 'next/server';
import { getBackupHistory, createBackup } from '@/server/services/backup.service';
import { requirePermission } from '@/server/middleware/api-auth';

/**
 * GET /api/backup
 * Get list of all backups
 */
export async function GET(request: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.view');
    if (!authCheck.authorized) return authCheck.response;

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
    const authCheck = await requirePermission('settings.edit');
    if (!authCheck.authorized) return authCheck.response;

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
