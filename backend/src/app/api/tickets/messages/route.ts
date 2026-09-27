import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

/**
 * Resolves who is calling: an admin/technician (NextAuth session, checked via
 * `permission`) or a customer (Bearer token against `customerSession`, same
 * dual-auth pattern already used by GET /api/tickets). Returns null and lets
 * the caller respond 401 when neither identity is valid — this file
 * previously had NO auth check at all on GET/POST/DELETE, letting anyone who
 * knew or guessed a ticketId read internal staff notes, post messages under
 * any spoofed sender name, or delete messages outright.
 */
async function resolveTicketCaller(req: NextRequest, permission: string): Promise<{ isStaff: boolean; customerUserId: string | null } | null> {
  const authCheck = await requirePermission(permission);
  if (authCheck.authorized) return { isStaff: true, customerUserId: null };

  const bearerToken = req.headers.get('authorization')?.replace('Bearer ', '');
  if (bearerToken) {
    const customerSession = await prisma.customerSession.findFirst({
      where: { token: bearerToken, verified: true, expiresAt: { gte: new Date() } },
      select: { userId: true },
    });
    if (customerSession) return { isStaff: false, customerUserId: customerSession.userId };
  }
  return null;
}

// Send WhatsApp notification for new reply
async function sendReplyNotification(
  phoneNumber: string,
  ticketNumber: string,
  subject: string,
  senderName: string
) {
  try {
    const provider = await prisma.whatsapp_providers.findFirst({
      where: { isActive: true },
      orderBy: { priority: 'desc' },
    });

    if (!provider) return;

    const message = `💬 Balasan Baru - Ticket #${ticketNumber}\n\nSubjek: ${subject}\nDari: ${senderName}\n\nAda balasan baru pada ticket Anda. Silakan cek portal customer untuk melihat detail.`;

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
  } catch (error) {
    console.error('Failed to send reply notification:', error);
  }
}

// GET - Get messages for a ticket
export async function GET(req: NextRequest) {
  try {
    const caller = await resolveTicketCaller(req, 'customers.view');
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const ticketId = searchParams.get('ticketId');
    // Internal staff notes are never sent to a customer caller, regardless
    // of what the query string asks for.
    const includeInternal = caller.isStaff && searchParams.get('includeInternal') === 'true';

    if (!ticketId) {
      return NextResponse.json(
        { error: 'Ticket ID is required' },
        { status: 400 }
      );
    }

    if (!caller.isStaff) {
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { customerId: true } });
      if (!ticket || ticket.customerId !== caller.customerUserId) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }
    }

    const where: any = { ticketId };

    if (!includeInternal) {
      where.isInternal = false;
    }

    const messages = await prisma.ticketMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

// POST - Add message/reply to ticket
export async function POST(req: NextRequest) {
  try {
    const caller = await resolveTicketCaller(req, 'customers.edit');
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    let {
      ticketId,
      senderType,
      senderId,
      senderName,
      message,
      isInternal,
    } = body;

    if (!ticketId || !senderType || !senderName || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get ticket details
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    // A customer caller can only post to their own ticket, only as
    // themselves, and never as an internal staff-only note — otherwise
    // they could spoof a staff reply or an internal note on any ticket.
    if (!caller.isStaff) {
      if (ticket.customerId !== caller.customerUserId) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }
      senderType = 'CUSTOMER';
      senderId = caller.customerUserId;
      isInternal = false;
    }

    // Create message
    const ticketMessage = await prisma.ticketMessage.create({
      data: {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        ticketId,
        senderType,
        senderId: senderId || null,
        senderName,
        message,
        isInternal: isInternal || false,
      },
    });

    // Update ticket's lastResponseAt
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        lastResponseAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Send notification to customer if reply is from staff and not internal
    if (
      !isInternal &&
      senderType !== 'CUSTOMER' &&
      ticket.customerPhone
    ) {
      await sendReplyNotification(
        ticket.customerPhone,
        ticket.ticketNumber,
        ticket.subject,
        senderName
      );
    }

    // Send web push to customer (independent of phone — only needs customerId)
    if (!isInternal && senderType !== 'CUSTOMER' && ticket.customerId) {
      try {
        const { sendWebPushToUser } = await import('@/server/services/push-notification.service');
        await sendWebPushToUser(ticket.customerId, {
          title: '💬 Balasan Baru di Tiket Anda',
          body: `${senderName}: ${message.substring(0, 100)}`,
          url: '/customer/tickets',
          tag: 'ticket-reply',
        });
      } catch { /* ignore */ }
    }

    // If customer sends a message, notify admin and assigned technician
    if (!isInternal && senderType === 'CUSTOMER') {
      try {
        await prisma.notification.create({
          data: {
            type: 'ticket_reply',
            title: 'Balasan Tiket dari Pelanggan',
            message: `${senderName} membalas tiket #${ticket.ticketNumber}: "${message.substring(0, 80)}"`,
            link: `/admin/tickets/${ticketId}`,
          },
        });
      } catch { /* ignore */ }

      // Push to assigned technician (if any)
      if (ticket.assignedToId && ticket.assignedToType === 'TECHNICIAN') {
        try {
          const { sendWebPushToTechnician } = await import('@/server/services/push-notification.service');
          await sendWebPushToTechnician(ticket.assignedToId, {
            title: '💬 Balasan dari Pelanggan - Tiket #' + ticket.ticketNumber,
            body: `${senderName}: ${message.substring(0, 100)}`,
            url: '/technician/tickets',
            tag: 'ticket-reply',
          });
        } catch { /* ignore */ }
      } else {
        // No assigned technician — push to all
        try {
          const { sendWebPushToAllTechnicians } = await import('@/server/services/push-notification.service');
          await sendWebPushToAllTechnicians({
            title: '💬 Balasan dari Pelanggan - Tiket #' + ticket.ticketNumber,
            body: `${senderName}: ${message.substring(0, 100)}`,
            url: '/technician/tickets',
            tag: 'ticket-reply',
          });
        } catch { /* ignore */ }
      }
    }

    return NextResponse.json(ticketMessage);
  } catch (error) {
    console.error('Error creating message:', error);
    return NextResponse.json(
      { error: 'Failed to create message' },
      { status: 500 }
    );
  }
}

// DELETE - Delete message
export async function DELETE(req: NextRequest) {
  try {
    const authCheck = await requirePermission('customers.edit');
    if (!authCheck.authorized) return authCheck.response;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Message ID is required' },
        { status: 400 }
      );
    }

    await prisma.ticketMessage.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    return NextResponse.json(
      { error: 'Failed to delete message' },
      { status: 500 }
    );
  }
}
