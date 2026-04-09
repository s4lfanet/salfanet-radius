import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';

function generateTicketNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `TKT${year}${month}${random}`;
}



export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      customerId,
      customerName,
      customerPhone,
      customerAddress,
      subject,
      description,
      categoryId,
      priority,
      routerId,
      oltId,
      odcId,
      odpId,
    } = body;

    if (!customerName?.trim() || !customerPhone?.trim() || !subject?.trim() || !description?.trim()) {
      return NextResponse.json({ error: 'customerName, customerPhone, subject, description wajib diisi' }, { status: 400 });
    }

    // Generate unique ticket number
    let ticketNumber = generateTicketNumber();
    for (let i = 0; i < 10; i++) {
      const exists = await prisma.ticket.findUnique({ where: { ticketNumber } });
      if (!exists) break;
      ticketNumber = generateTicketNumber();
    }

    // Build enriched description with infra context
    let enrichedDesc = description.trim();
    const enrichParts: string[] = [];

    if (routerId) {
      const router = await prisma.router.findUnique({ where: { id: routerId }, select: { name: true, nasname: true } });
      if (router) enrichParts.push(`📡 Router: ${router.name}${router.nasname ? ` (${router.nasname})` : ''}`);
    }
    if (oltId) {
      const olt = await prisma.networkOLT.findUnique({ where: { id: oltId }, select: { name: true, ipAddress: true } });
      if (olt) enrichParts.push(`🏗️ OLT: ${olt.name}${olt.ipAddress ? ` (${olt.ipAddress})` : ''}`);
    }
    if (odcId) {
      const odc = await prisma.networkODC.findUnique({ where: { id: odcId }, select: { name: true } });
      if (odc) enrichParts.push(`🔌 ODC: ${odc.name}`);
    }
    if (odpId) {
      const odp = await prisma.networkODP.findUnique({ where: { id: odpId }, select: { name: true } });
      if (odp) enrichParts.push(`📦 ODP: ${odp.name}`);
    }
    if (customerAddress) enrichParts.push(`📍 Alamat: ${customerAddress}`);

    if (enrichParts.length > 0) {
      enrichedDesc = enrichedDesc + '\n\n--- Informasi Infrastruktur ---\n' + enrichParts.join('\n');
    }

    // Create ticket
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        customerId: customerId || null,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        subject: subject.trim(),
        description: enrichedDesc,
        categoryId: categoryId || null,
        priority: priority || 'MEDIUM',
        status: 'OPEN',
      },
      include: {
        category: { select: { id: true, name: true, color: true } },
      },
    });

    // Create initial system message
    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        senderType: 'SYSTEM',
        senderName: 'System',
        message: `Tiket #${ticketNumber} telah dibuat dan dikirim ke semua teknisi.`,
        isInternal: true,
      },
    });

    // Notify admin
    await prisma.notification.create({
      data: {
        type: 'new_ticket',
        title: 'Tiket Baru — Dispatch ke Teknisi',
        message: `${customerName}: "${subject}" (#${ticketNumber}) dikirim ke semua teknisi`,
        link: `/admin/tickets/${ticket.id}`,
      },
    });

    // Get all active technicians
    const technicians = await prisma.technician.findMany({
      where: { isActive: true },
      select: { id: true, name: true, phoneNumber: true },
    });

    // Send WA to all technicians via WhatsAppService (handles all provider types + failover)
    const priorityLabel: Record<string, string> = {
      LOW: '🟢 Rendah', MEDIUM: '🟡 Sedang', HIGH: '🟠 Tinggi', URGENT: '🔴 Urgent',
    };

    const waMessage = [
      `🎫 *TIKET BARU - DISPATCH SEMUA TEKNISI*`,
      `📋 No. Tiket: *#${ticketNumber}*`,
      `👤 Pelanggan: *${customerName}*`,
      `📞 Telepon: ${customerPhone}`,
      customerAddress ? `📍 Alamat: ${customerAddress}` : null,
      ``,
      `📝 Subjek: *${subject}*`,
      `⚠️ Prioritas: ${priorityLabel[priority || 'MEDIUM'] || priority}`,
      ticket.category ? `🏷️ Kategori: ${ticket.category.name}` : null,
      ``,
      enrichParts.length > 0 ? enrichParts.join('\n') : null,
      ``,
      `📄 Deskripsi:\n${description.trim().substring(0, 300)}${description.length > 300 ? '...' : ''}`,
      ``,
      `✅ Silakan klaim tiket ini di portal teknisi.`,
    ].filter(Boolean).join('\n');

    await Promise.allSettled(
      technicians.map(tech =>
        WhatsAppService.sendMessage({ phone: tech.phoneNumber, message: waMessage }).catch(e =>
          console.error(`[Dispatch WA] Failed to send to ${tech.name}:`, e.message)
        )
      )
    );

    // Send web push to all technicians
    try {
      const { sendWebPushToAllTechnicians } = await import('@/server/services/push-notification.service');
      await sendWebPushToAllTechnicians({
        title: '🎫 Tiket Baru — Perlu Ditangani',
        body: `${customerName}: "${subject}" • ${priorityLabel[priority || 'MEDIUM'] || priority}`,
        url: '/technician/tickets',
        tag: `ticket-${ticket.id}`,
      });
    } catch (pushErr) {
      console.error('[Dispatch] Push notification error:', pushErr);
    }

    return NextResponse.json({
      success: true,
      ticket,
      notified: technicians.length,
    });
  } catch (error) {
    console.error('[Dispatch Ticket] Error:', error);
    return NextResponse.json({ error: 'Gagal mengirim tiket' }, { status: 500 });
  }
}
