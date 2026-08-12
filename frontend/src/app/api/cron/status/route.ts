import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { unauthorized } from '@/lib/api-response';

// Cron status now managed by NestJS backend
// This legacy route delegates to the backend API

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized();

    const token = (session as any).accessToken || '';
    const res = await fetch(`${BACKEND_URL}/api/v1/cron/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to get cron status' },
      { status: 500 }
    );
  }
}
