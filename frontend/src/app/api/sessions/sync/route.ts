import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

/**
 * POST /api/sessions/sync
 * Trigger session sync via /api/cron (native Next.js, no NestJS backend).
 * Query: ?type=pppoe | hotspot | all
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get('type');
  const jobType = type === 'pppoe' ? 'pppoe_session_sync' : type === 'hotspot' ? 'hotspot_sync' : 'pppoe_session_sync';

  try {
    const cronSecret = process.env.CRON_SECRET || '';
    const apiUrl = process.env.CRON_API_URL || 'http://localhost:3000';
    const res = await fetch(`${apiUrl}/api/cron`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cronSecret && { 'x-cron-secret': cronSecret }),
      },
      body: JSON.stringify({ type: jobType }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Sync failed', detail: error.message },
      { status: 500 },
    );
  }
}
