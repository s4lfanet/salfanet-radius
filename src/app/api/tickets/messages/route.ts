import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

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
    const { searchParams } = new URL(req.url);
    const ticketId = searchParams.get('ticketId');
    const includeInternal = searchParams.get('includeInternal') === 'true';

    if (!ticketId) {
      return NextResponse.json(
        { error: 'Ticket ID is required' },
        { status: 400 }
      );
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
    const body = await req.json();
    const {
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

      // Also send web push to customer
      if (ticket.customerId) {
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
