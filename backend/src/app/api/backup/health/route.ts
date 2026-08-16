import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseHealth } from '@/server/services/backup.service';
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

    const healthData = await getDatabaseHealth();

    return NextResponse.json(healthData);
  } catch (error: any) {
    console.error('[Health API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
