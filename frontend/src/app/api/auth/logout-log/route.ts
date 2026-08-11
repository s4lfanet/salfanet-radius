import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { logActivity } from '@/server/services/activity-log.service';

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

    await logActivity({
      userId,
      username,
      userRole: sessionRole,
      action: 'LOGOUT',
      description: `User logged out: ${username} (${sessionRole})`,
      module: 'auth',
      status: 'success',
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout log error:', error);
    return NextResponse.json({ error: 'Failed to log' }, { status: 500 });
  }
}
