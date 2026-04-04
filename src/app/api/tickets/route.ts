import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// Generate unique ticket number
function generateTicketNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `TKT${year}${month}${random}`;
}

// Send WhatsApp notification
async function sendTicketNotification(
  phoneNumber: string,
  ticketNumber: string,
  subject: string,
  isNewTicket: boolean = true
) {
  try {
    const provider = await prisma.whatsapp_providers.findFirst({
      where: { isActive: true },
      orderBy: { priority: 'desc' },
    });

    if (!provider) {
      console.log('No active WhatsApp provider found');
      return;
    }

    const message = isNewTicket
      ? `🎫 Ticket Baru #${ticketNumber}\n\nSubjek: ${subject}\n\nTerima kasih telah menghubungi kami. Ticket Anda telah dibuat dan akan segera kami proses.\n\nAnda akan menerima notifikasi saat ada update.`
      : `✅ Update Ticket #${ticketNumber}\n\nSubjek: ${subject}\n\nAda balasan baru pada ticket Anda. Silakan cek portal customer untuk melihat detail.`;

    // Normalize phone number
    let normalizedPhone = phoneNumber.replace(/\D/g, '');
    if (normalizedPhone.startsWith('0')) {
      normalizedPhone = '62' + normalizedPhone.slice(1);
    } else if (!normalizedPhone.startsWith('62')) {
      normalizedPhone = '62' + normalizedPhone;
    }

    const response = await fetch(provider.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        phone: normalizedPhone,
        message,
      }),
    });

    const result = await response.json();

    await prisma.whatsapp_history.create({
      data: {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        phone: normalizedPhone,
        message,
        status: response.ok ? 'sent' : 'failed',
        response: JSON.stringify(result),
        providerName: provider.name,
        providerType: provider.type,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to send WhatsApp notification:', error);
    return false;
  }
}

// GET - List tickets (for customer or admin)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // If no admin session, try customer Bearer token
    let customerUserId: string | null = null;
    if (!session) {
      const bearerToken = req.headers.get('authorization')?.replace('Bearer ', '');
      if (bearerToken) {
        const customerSession = await prisma.customerSession.findFirst({
          where: { token: bearerToken, verified: true, expiresAt: { gte: new Date() } },
          select: { userId: true },
        });
        if (customerSession) {
          customerUserId = customerSession.userId;
        }
      }
      if (!customerUserId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const customerId = searchParams.get('customerId');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const categoryId = searchParams.get('categoryId');
    const search = searchParams.get('search');

    const where: any = {};

    // Filter by single ticket ID (used by customer detail page)
    if (id) {
      where.id = id;
    }

    // Customers can only see their own tickets
    if (customerUserId) {
      where.customerId = customerUserId;
    } else {
      // Admin can filter by arbitrary customerId
      if (customerId) {
        where.customerId = customerId;
      }

      if (priority) {
        where.priority = priority;
      }

      if (categoryId) {
        where.categoryId = categoryId;
      }
    }

    // Status and search apply to both admin and customer
    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { ticketNumber: { contains: search } },
        { subject: { contains: search } },
        { description: { contains: search } },
        { customerName: { contains: search } },
      ];
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        category: true,
        customer: {
          select: {
            id: true,
            username: true,
            name: true,
            phone: true,
            email: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json(tickets);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tickets' },
      { status: 500 }
    );
  }
}

// POST - Create new ticket
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      subject,
      description,
      categoryId,
      priority,
    } = body;

    // Validate required fields
    if (!customerName || !customerPhone || !subject || !description) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate unique ticket number
    let ticketNumber = generateTicketNumber();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await prisma.ticket.findUnique({
        where: { ticketNumber },
      });
      if (!existing) break;
      ticketNumber = generateTicketNumber();
      attempts++;
    }

    // Create ticket
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        customerId: customerId || null,
        customerName,
        customerEmail: customerEmail || null,
        customerPhone,
        subject,
        description,
        categoryId: categoryId || null,
        priority: priority || 'MEDIUM',
        status: 'OPEN',
      },
      include: {
        category: true,
        customer: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
      },
    });

    // Create initial system message
    await prisma.ticketMessage.create({
      data: {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        ticketId: ticket.id,
        senderType: 'SYSTEM',
        senderName: 'System',
        message: `Ticket #${ticketNumber} telah dibuat.`,
        isInternal: false,
      },
    });

    // Send WhatsApp notification
    await sendTicketNotification(customerPhone, ticketNumber, subject, true);

    // Create admin notification (for real-time toast in admin panel)
    await prisma.notification.create({
      data: {
        type: 'new_ticket',
        title: 'Tiket Baru Masuk',
        message: `${customerName} membuat tiket baru: "${subject}" (#${ticketNumber})`,
        link: `/admin/tickets/${ticket.id}`,
      },
    });

    // Send web push to all technicians
    try {
      const { sendWebPushToAllTechnicians } = await import('@/server/services/push-notification.service');
      await sendWebPushToAllTechnicians({
        title: '🎫 Tiket Baru Masuk',
        body: `${customerName}: "${subject}" (#${ticketNumber})`,
        url: '/technician/tickets',
        tag: 'new-ticket',
      });
    } catch (pushErr) {
      console.error('[Ticket] Technician push error:', pushErr);
    }

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('Error creating ticket:', error);
    return NextResponse.json(
      { error: 'Failed to create ticket' },
      { status: 500 }
    );
  }
}

// PUT - Update ticket (status, priority, assign, etc)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      status,
      priority,
      categoryId,
      assignedToId,
      assignedToType,
      subject,
      description,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Ticket ID is required' },
        { status: 400 }
      );
    }

    const existingTicket = await prisma.ticket.findUnique({
      where: { id },
    });

    if (!existingTicket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (status !== undefined) {
      updateData.status = status;
      if (status === 'RESOLVED' && !existingTicket.resolvedAt) {
        updateData.resolvedAt = new Date();
      }
      if (status === 'CLOSED' && !existingTicket.closedAt) {
        updateData.closedAt = new Date();
      }
    }

    if (priority !== undefined) updateData.priority = priority;
    if (categoryId !== undefined) updateData.categoryId = categoryId || null;
    if (assignedToId !== undefined) updateData.assignedToId = assignedToId || null;
    if (assignedToType !== undefined) updateData.assignedToType = assignedToType || null;
    if (subject !== undefined) updateData.subject = subject;
    if (description !== undefined) updateData.description = description;

    const ticket = await prisma.ticket.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        customer: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('Error updating ticket:', error);
    return NextResponse.json(
      { error: 'Failed to update ticket' },
      { status: 500 }
    );
  }
}

// DELETE - Delete ticket
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Ticket ID is required' },
        { status: 400 }
      );
    }

    await prisma.ticket.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Ticket deleted successfully' });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    return NextResponse.json(
      { error: 'Failed to delete ticket' },
      { status: 500 }
    );
  }
}
