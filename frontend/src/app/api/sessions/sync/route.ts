import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// Session sync has been migrated to NestJS backend
// This legacy route delegates to the backend API

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get('type');

  try {
    const token = (session as any).accessToken || '';
    const res = await fetch(`${BACKEND_URL}/api/v1/cron/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        type: type === 'pppoe' ? 'pppoe_session_sync' : type === 'hotspot' ? 'hotspot_sync' : 'all',
      }),
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
