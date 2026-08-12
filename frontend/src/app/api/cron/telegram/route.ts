import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { unauthorized, forbidden, badRequest, serverError } from '@/lib/api-response';

// Telegram cron jobs have been migrated to NestJS backend (@nestjs/schedule)
// This legacy route delegates to the backend API

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized();
    if (session.user.role !== 'SUPER_ADMIN') return forbidden();

    const token = (session as any).accessToken || '';
    const res = await fetch(`${BACKEND_URL}/api/v1/telegram/cron/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return serverError(error.message);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized();
    if (session.user.role !== 'SUPER_ADMIN') return forbidden();

    const body = await request.json();
    const { action, job } = body;
    if (!action || !job) return badRequest('Action and job are required');

    const token = (session as any).accessToken || '';
    const res = await fetch(`${BACKEND_URL}/api/v1/telegram/cron/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, job }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return serverError(error.message);
  }
}
