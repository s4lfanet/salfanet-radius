import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { unauthorized } from '@/lib/api-response'

// Cron jobs have been migrated to NestJS backend (@nestjs/schedule)
// This legacy route delegates to the backend API for backward compatibility

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized();

    // Delegate to backend
    const token = (session as any).accessToken || '';
    const res = await fetch(`${BACKEND_URL}/api/v1/cron/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = request.headers.get('x-cron-secret');
    const hasCronSecret = cronSecret && headerSecret === cronSecret;

    if (!hasCronSecret) {
      const session = await getServerSession(authOptions);
      if (!session || (session as any).user?.role !== 'SUPER_ADMIN') {
        return unauthorized();
      }
    }

    const body = await request.json().catch(() => ({}));
    const jobType = body.type || 'voucher_sync';

    // Delegate to backend cron trigger endpoint
    const res = await fetch(`${BACKEND_URL}/api/v1/cron/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: jobType, ...body }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
