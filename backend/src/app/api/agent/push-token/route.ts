import { NextRequest, NextResponse } from 'next/server';
import { requireAgentAuth } from '@/server/middleware/agent-auth';
import { registerAgentPushToken, removeAgentPushToken } from '@/server/services/fcm-push.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agent/push-token  — register the agent Flutter app's FCM token
 * DELETE /api/agent/push-token?token=...  — unregister (on logout)
 */
export async function POST(req: NextRequest) {
  const auth = await requireAgentAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    const { token, platform } = (await req.json()) as { token?: string; platform?: string };
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ success: false, error: 'token is required' }, { status: 400 });
    }
    await registerAgentPushToken(auth.agentId, token, platform || 'android');
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[Agent push-token] register error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAgentAuth(req);
  if (!auth.authorized) return auth.response;

  try {
    const token = new URL(req.url).searchParams.get('token');
    const removed = await removeAgentPushToken(auth.agentId, token);
    return NextResponse.json({ success: true, removed });
  } catch (error: unknown) {
    console.error('[Agent push-token] remove error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
