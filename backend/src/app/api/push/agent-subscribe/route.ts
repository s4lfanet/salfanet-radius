import { NextResponse } from 'next/server';
import { requireAgentAuth } from '@/server/middleware/agent-auth';
import { upsertAgentPushSubscription } from '@/server/services/push-notification.service';

export async function POST(request: Request) {
  try {
    const auth = await requireAgentAuth(request);
    if (!auth.authorized) return auth.response;
    const { agentId } = auth;

    const body = await request.json();
    const { subscription } = body;

    if (!subscription) {
      return NextResponse.json({ success: false, error: 'subscription is required' }, { status: 400 });
    }

    const saved = await upsertAgentPushSubscription(agentId, subscription, request.headers.get('user-agent'));

    return NextResponse.json({ success: true, subscriptionId: saved.id });
  } catch (error: any) {
    console.error('[Agent Push Subscribe] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
