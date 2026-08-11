import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { isolateUser } from '@/server/jobs/auto-isolation';

export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication (SUPER_ADMIN only)
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { username, reason } = body;

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Username is required' },
        { status: 400 }
      );
    }

    const result = await isolateUser(username, reason);

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Manual isolation error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
