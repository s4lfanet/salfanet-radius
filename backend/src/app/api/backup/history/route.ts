import { NextRequest, NextResponse } from 'next/server';
import { getBackupHistory } from '@/server/services/backup.service';
import { requirePermission } from '@/server/middleware/api-auth';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authCheck = await requirePermission('settings.view');
    if (!authCheck.authorized) return authCheck.response;
    const session = authCheck.session;

    // Check if user is SUPER_ADMIN
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const history = await getBackupHistory(50);

    // Convert BigInt to Number for JSON serialization
    const serializedHistory = history.map((item) => ({
      ...item,
      filesize: Number(item.filesize),
    }));

    return NextResponse.json({
      success: true,
      history: serializedHistory,
    });
  } catch (error: any) {
    console.error('[Backup History API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
