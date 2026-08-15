import { NextRequest, NextResponse } from 'next/server';
import { deleteBackup as deleteBackupHelper } from '@/server/services/backup.service';
import { requirePermission } from '@/server/middleware/api-auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission('settings.edit');
    if (!authCheck.authorized) return authCheck.response;
    const session = authCheck.session;

    const { id } = await params;

    console.log(`[Delete API] User ${(session.user as any).username} deleting backup ${id}`);

    await deleteBackupHelper(id);

    return NextResponse.json({
      success: true,
      message: 'Backup deleted successfully',
    });
  } catch (error: any) {
    console.error('[Delete API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
