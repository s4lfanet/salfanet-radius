import { NextResponse } from 'next/server';
import { requireAgentAuth } from '@/server/middleware/agent-auth';
import { removeAgentPushSubscription } from '@/server/services/push-notification.service';

export async function POST(request: Request) {
  try {
    const auth = await requireAgentAuth(request);
    if (!auth.authorized) return auth.response;
    const { agentId } = auth;

    const body = await request.json().catch(() => ({}));
    const { endpoint, subscription } = body;

    const endpointUrl = endpoint || subscription?.endpoint;
    const deleted = await removeAgentPushSubscription(agentId, endpointUrl);

    return NextResponse.json({ success: true, deleted });
  } catch (error: any) {
    console.error('[Agent Push Unsubscribe] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
