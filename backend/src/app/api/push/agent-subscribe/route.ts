import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { upsertAgentPushSubscription } from '@/server/services/push-notification.service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agentId, subscription } = body;

    if (!agentId || !subscription) {
      return NextResponse.json({ success: false, error: 'agentId and subscription are required' }, { status: 400 });
    }

    // Verify agent exists and is active
    const agent = await prisma.agent.findUnique({
      where: { id: String(agentId) },
      select: { id: true, isActive: true },
    });

    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    if (!agent.isActive) {
      return NextResponse.json({ success: false, error: 'Agent account is inactive' }, { status: 403 });
    }

    const saved = await upsertAgentPushSubscription(agent.id, subscription, request.headers.get('user-agent'));

    return NextResponse.json({ success: true, subscriptionId: saved.id });
  } catch (error: any) {
    console.error('[Agent Push Subscribe] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
