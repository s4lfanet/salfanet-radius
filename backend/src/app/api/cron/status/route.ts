import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { unauthorized } from '@/lib/api-response';
import { getAllCronStatuses } from '@/server/cron/jobs';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized();

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
