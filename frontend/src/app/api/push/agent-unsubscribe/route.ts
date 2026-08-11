import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { removeAgentPushSubscription } from '@/server/services/push-notification.service';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { agentId, endpoint, subscription } = body;

    if (!agentId) {
      return NextResponse.json({ success: false, error: 'agentId is required' }, { status: 400 });
    }

    const agent = await prisma.agent.findUnique({
      where: { id: String(agentId) },
      select: { id: true },
    });

    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    const endpointUrl = endpoint || subscription?.endpoint;
    const deleted = await removeAgentPushSubscription(agent.id, endpointUrl);

    return NextResponse.json({ success: true, deleted });
  } catch (error: any) {
    console.error('[Agent Push Unsubscribe] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
