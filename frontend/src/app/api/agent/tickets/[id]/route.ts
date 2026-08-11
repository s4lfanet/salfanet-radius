import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requireAgentAuth } from '@/server/middleware/agent-auth';

/** GET /api/agent/tickets/[id] */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAgentAuth(request);
    if (!auth.authorized) return auth.response;
    const { agentId } = auth;

    const { id } = await params;

    const ticket = await prisma.ticket.findFirst({
      where: { id, customerEmail: `agent:${agentId}` },
      include: {
        category: true,
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    console.error('Agent GET ticket error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/agent/tickets/[id] - add reply message */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAgentAuth(request);
    if (!auth.authorized) return auth.response;
    const { agentId } = auth;

    const { id } = await params;
    const body = await request.json();
    const { message } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const ticket = await prisma.ticket.findFirst({
      where: { id, customerEmail: `agent:${agentId}` },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const newMessage = await prisma.ticketMessage.create({
      data: {
        ticketId: id,
        senderType: 'CUSTOMER',
        senderId: agentId,
        senderName: agent.name,
        message: message.trim(),
      },
    });

    // Update ticket lastResponseAt and reopen if closed
    await prisma.ticket.update({
      where: { id },
      data: {
        lastResponseAt: new Date(),
        status: ticket.status === 'CLOSED' || ticket.status === 'RESOLVED' ? 'OPEN' : ticket.status,
      },
    });

    return NextResponse.json({ success: true, message: newMessage });
  } catch (error) {
    console.error('Agent POST ticket message error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
