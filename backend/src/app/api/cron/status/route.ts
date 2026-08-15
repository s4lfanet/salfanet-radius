import { NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { getAllCronStatuses } from '@/server/cron/jobs';

export async function GET() {
  try {
    const authCheck = await requirePermission('settings.view');
    if (!authCheck.authorized) return authCheck.response;
    const session = authCheck.session;

    const jobs = await getAllCronStatuses();
    return NextResponse.json({ success: true, jobs });
  } catch (error: any) {
    console.error('Cron status error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to get cron status' },
      { status: 500 }
    );
  }
}
