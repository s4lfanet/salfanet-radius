import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/server/middleware/api-auth';
import { registerAdminPushToken, removeAdminPushToken } from '@/server/services/fcm-push.service';

/**
 * POST /api/admin/push-token  — register the admin Flutter app's FCM token
 * DELETE /api/admin/push-token?token=...  — unregister (on logout)
 */
export async function POST(request: NextRequest) {
  const auth = await checkAuth();
  if (!auth.authorized) return auth.response;

  try {
    const { token, platform } = (await request.json()) as { token?: string; platform?: string };
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ success: false, error: 'token is required' }, { status: 400 });
    }
    await registerAdminPushToken(auth.userId, token, platform || 'android');
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[Admin push-token] register error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await checkAuth();
  if (!auth.authorized) return auth.response;

  try {
    const token = new URL(request.url).searchParams.get('token');
    const removed = await removeAdminPushToken(auth.userId, token);
    return NextResponse.json({ success: true, removed });
  } catch (error: unknown) {
    console.error('[Admin push-token] remove error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
