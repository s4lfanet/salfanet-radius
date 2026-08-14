import { NextRequest, NextResponse } from 'next/server';
import { logActivity } from '@/server/services/activity-log.service';

/**
 * Log logout activity from frontend.
 *
 * This endpoint is called by the frontend logout-log route
 * so the frontend does not need direct database access.
 *
 * Returns:
 *   200 { success: true }
 *   400 { error: 'Username required' }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, username, userRole } = body;

    if (!username) {
      return NextResponse.json(
        { error: 'Username required' },
        { status: 400 },
      );
    }

    await logActivity({
      userId,
      username,
      userRole,
      action: 'LOGOUT',
      description: `User logged out: ${username} (${userRole || 'unknown'})`,
      module: 'auth',
      status: 'success',
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AUTH/LOGOUT-LOG] Error:', error);
    return NextResponse.json(
      { error: 'Failed to log' },
      { status: 500 },
    );
  }
}
