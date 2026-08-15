import { NextRequest, NextResponse } from 'next/server';
import { createBackup } from '@/server/services/backup.service';
import { requirePermission } from '@/server/middleware/api-auth';

export async function POST(request: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.edit');
    if (!authCheck.authorized) return authCheck.response;
    const session = authCheck.session;

    console.log(`[Backup API] User ${(session.user as any).username} initiated manual backup`);

    const result = await createBackup('manual');

    return NextResponse.json({
      success: true,
      filename: result.backup.filename,
      downloadUrl: `/api/backup/download/${result.backup.id}`,
      backup: {
        id: result.backup.id,
        filename: result.backup.filename,
        filesize: Number(result.backup.filesize),
        createdAt: result.backup.createdAt,
      },
    });
  } catch (error: any) {
    console.error('[Backup API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
