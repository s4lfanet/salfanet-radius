import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

const BACKEND_URL = process.env.SERVER_API_URL || process.env.BACKEND_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, username } = body;

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    const sessionRole = session.user.role;

    // Forward to backend activity log API
    const res = await fetch(`${BACKEND_URL}/api/admin/auth/logout-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        username,
        userRole: sessionRole,
      }),
    });

    if (!res.ok) {
      console.error('[LOGOUT-LOG] Backend error:', res.status);
      // Don't fail logout if logging fails
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout log error:', error);
    return NextResponse.json({ error: 'Failed to log' }, { status: 500 });
  }
}
