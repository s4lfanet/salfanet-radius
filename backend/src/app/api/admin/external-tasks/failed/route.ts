import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { getFailedTasks } from '@/server/services/external-task.service';

/**
 * GET /api/admin/external-tasks/failed?limit=100
 * Returns failed/dead external tasks for admin monitoring.
 */
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('dashboard.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);

    const tasks = await getFailedTasks(limit);
    return NextResponse.json({ success: true, data: tasks });
  } catch (error: any) {
    console.error('[External Tasks Failed Error]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch failed tasks' },
      { status: 500 }
    );
  }
}
