import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requireAgentAuth } from '@/server/middleware/agent-auth';

function generateTicketNumber(): string {
  const date = new Date();
  const yy = date.getFullYear().toString().slice(-2);
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const rand = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  return `AGT${yy}${mm}${rand}`;
}

/** GET /api/agent/tickets */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAgentAuth(request);
    if (!auth.authorized) return auth.response;
    const { agentId } = auth;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const where: any = {
      customerEmail: `agent:${agentId}`,
    };
    if (status) where.status = status;

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        category: true,
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, tickets });
  } catch (error) {
    console.error('Agent GET tickets error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/agent/tickets */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAgentAuth(request);
    if (!auth.authorized) return auth.response;
    const { agentId } = auth;

    const body = await request.json();
    const { subject, description, categoryId, priority } = body;

    if (!subject?.trim() || !description?.trim()) {
      return NextResponse.json({ error: 'subject and description are required' }, { status: 400 });
    }

    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Ensure unique ticket number
    let ticketNumber = generateTicketNumber();
    let exists = await prisma.ticket.findUnique({ where: { ticketNumber } });
    while (exists) {
      ticketNumber = generateTicketNumber();
      exists = await prisma.ticket.findUnique({ where: { ticketNumber } });
    }

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        customerId: null,
        customerName: agent.name,
        customerEmail: `agent:${agentId}`,
        customerPhone: agent.phone,
        subject: subject.trim(),
        description: description.trim(),
        categoryId: categoryId || null,
        priority: priority || 'MEDIUM',
        status: 'OPEN',
        messages: {
          create: {
            senderType: 'CUSTOMER',
            senderId: agentId,
            senderName: agent.name,
            message: description.trim(),
          },
        },
      },
      include: {
        category: true,
        messages: true,
      },
    });

    // Admin DB notification
    try {
      await prisma.notification.create({
        data: {
          type: 'new_ticket',
          title: 'Tiket Baru dari Agent',
          message: `${agent.name} membuat tiket: "${subject.trim()}" (#${ticketNumber})`,
          link: `/admin/tickets/${ticket.id}`,
        },
      });
    } catch (notifErr) {
      console.error('[AgentTicket] Admin notification error:', notifErr);
    }

    // Web push to all technicians
    try {
      const { sendWebPushToAllTechnicians } = await import('@/server/services/push-notification.service');
      await sendWebPushToAllTechnicians({
        title: '🎫 Tiket Baru dari Agent',
        body: `${agent.name}: "${subject.trim()}" (#${ticketNumber})`,
        url: '/technician/tickets',
        tag: 'new-ticket',
      });
    } catch (pushErr) {
      console.error('[AgentTicket] Technician push error:', pushErr);
    }

    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    console.error('Agent POST tickets error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
