import { NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { getTaskStats } from '@/server/services/external-task.service';

/**
 * GET /api/admin/external-tasks/stats
 * Returns external task queue statistics by status.
 */
export async function GET() {
  const authCheck = await requirePermission('dashboard.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const stats = await getTaskStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error: any) {
    console.error('[External Tasks Stats Error]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch task statistics' },
      { status: 500 }
    );
  }
}
