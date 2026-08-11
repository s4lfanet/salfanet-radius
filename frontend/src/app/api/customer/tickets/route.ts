import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

/**
 * Helper: get authenticated customer session from Bearer token
 */
async function getSession(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;

  return prisma.customerSession.findFirst({
    where: {
      token,
      verified: true,
      expiresAt: { gte: new Date() },
    },
  });
}

/**
 * GET /api/customer/tickets
 * List all tickets for the authenticated customer
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get customer info so we can match tickets
    const user = await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        customerId: true,
        name: true,
        phone: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      );
    }

    const where: Record<string, unknown> = {};

    // Match by customerId if available, else fall back to phone
    if (user.customerId) {
      where.customerId = user.customerId;
    } else if (user.phone) {
      where.customerPhone = user.phone;
    } else {
      where.customerId = user.id;
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true,
          },
        },
      },
      orderBy: [
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json(tickets);
  } catch (error) {
    console.error('Error fetching customer tickets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tickets' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/customer/tickets
 * Create a new ticket for the authenticated customer
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        customerId: true,
        name: true,
        phone: true,
        email: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { subject, description, categoryId, priority } = body;

    if (!subject || !description) {
      return NextResponse.json(
        { error: 'Subject and description are required' },
        { status: 400 }
      );
    }

    // Generate unique ticket number
    function generateTicketNumber() {
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      return `TKT${year}${month}${random}`;
    }

    let ticketNumber = generateTicketNumber();
    for (let i = 0; i < 10; i++) {
      const existing = await prisma.ticket.findUnique({ where: { ticketNumber } });
      if (!existing) break;
      ticketNumber = generateTicketNumber();
    }

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        customerId: user.customerId || user.id,
        customerName: user.name || 'Customer',
        customerEmail: user.email || '',
        customerPhone: user.phone || '',
        subject,
        description,
        categoryId: categoryId || null,
        priority: priority || 'MEDIUM',
        status: 'OPEN',
      },
      include: {
        category: true,
      },
    });

    // Admin DB notification (toast in admin panel)
    try {
      await prisma.notification.create({
        data: {
          type: 'new_ticket',
          title: 'Tiket Baru dari Pelanggan',
          message: `${user.name || 'Pelanggan'} membuat tiket: "${subject}" (#${ticketNumber})`,
          link: `/admin/tickets/${ticket.id}`,
        },
      });
    } catch (notifErr) {
      console.error('[Ticket] Admin notification error:', notifErr);
    }

    // Web push to all technicians
    try {
      const { sendWebPushToAllTechnicians } = await import('@/server/services/push-notification.service');
      await sendWebPushToAllTechnicians({
        title: '🎫 Tiket Baru dari Pelanggan',
        body: `${user.name || 'Pelanggan'}: "${subject}" (#${ticketNumber})`,
        url: '/technician/tickets',
        tag: 'new-ticket',
      });
    } catch (pushErr) {
      console.error('[Ticket] Technician push error:', pushErr);
    }

    return NextResponse.json(ticket, { status: 201 });
  } catch (error) {
    console.error('Error creating customer ticket:', error);
    return NextResponse.json(
      { error: 'Failed to create ticket' },
      { status: 500 }
    );
  }
}
