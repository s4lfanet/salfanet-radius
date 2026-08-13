import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

// Auth helper (shared pattern from other customer routes)
async function verifyCustomerToken(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return null;

    const session = await prisma.customerSession.findFirst({
      where: {
        token,
        verified: true,
        expiresAt: { gte: new Date() },
      },
    });
    if (!session) return null;

    return await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, username: true },
    });
  } catch {
    return null;
  }
}

// GET - Poll for customer notification events since a timestamp
export async function GET(request: NextRequest) {
  const user = await verifyCustomerToken(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sinceParam = searchParams.get('since');
  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // default last 30 days

  const events: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    timestamp: string;
  }> = [];

  // 1. Recently paid invoices (payment-success)
  const paidInvoices = await prisma.invoice.findMany({
    where: {
      userId: user.id,
      status: 'PAID',
      paidAt: { gte: since },
    },
    select: {
      id: true,
      invoiceNumber: true,
      amount: true,
      paidAt: true,
      invoiceType: true,
      additionalFees: true,
    },
    orderBy: { paidAt: 'desc' },
    take: 10,
  });

  for (const inv of paidInvoices) {
    const amt = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(inv.amount);

    // Detect package change invoices
    let isPackageChange = false;
    let newPackageName = '';
    try {
      const fees = inv.additionalFees as any;
      const item = fees?.items?.[0];
      if (item?.metadata?.type === 'package_change' || item?.metadata?.type === 'package_upgrade') {
        isPackageChange = true;
        newPackageName = item.metadata?.newPackageName || '';
      }
    } catch { /* ignore */ }

    if (isPackageChange) {
      events.push({
        id: `pkg-${inv.id}`,
        type: 'package_changed',
        title: 'Paket Berhasil Diperbarui!',
        message: `Paket internet Anda telah berubah ke ${newPackageName}. Invoice ${inv.invoiceNumber} sebesar ${amt} telah dikonfirmasi.`,
        timestamp: (inv.paidAt ?? new Date()).toISOString(),
      });
    } else {
      events.push({
        id: `paid-${inv.id}`,
        type: 'payment_success',
        title: 'Pembayaran Berhasil',
        message: `Invoice ${inv.invoiceNumber} sebesar ${amt} telah dikonfirmasi.`,
        timestamp: (inv.paidAt ?? new Date()).toISOString(),
      });
    }
  }

  // 2. Recently rejected manual payments
  const rejectedPayments = await prisma.manualPayment.findMany({
    where: {
      userId: user.id,
      status: 'REJECTED',
      approvedAt: { gte: since },
    },
    include: {
      invoice: { select: { invoiceNumber: true } },
    },
    orderBy: { approvedAt: 'desc' },
    take: 10,
  });

  for (const mp of rejectedPayments) {
    events.push({
      id: `rejected-${mp.id}`,
      type: 'payment_rejected',
      title: 'Pembayaran Ditolak',
      message: `Pembayaran untuk invoice ${mp.invoice.invoiceNumber} ditolak. Alasan: ${mp.rejectionReason || '-'}`,
      timestamp: (mp.approvedAt ?? new Date()).toISOString(),
    });
  }

  // 3. Recently approved manual payments (if not already in paid invoices)
  const approvedPayments = await prisma.manualPayment.findMany({
    where: {
      userId: user.id,
      status: 'APPROVED',
      approvedAt: { gte: since },
    },
    include: {
      invoice: { select: { invoiceNumber: true, amount: true } },
    },
    orderBy: { approvedAt: 'desc' },
    take: 10,
  });

  for (const mp of approvedPayments) {
    // Skip if already in paid invoices list
    const alreadyAdded = paidInvoices.some(
      (inv) => inv.invoiceNumber === mp.invoice.invoiceNumber
    );
    if (!alreadyAdded) {
      const amt = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
      }).format(mp.invoice.amount);
      events.push({
        id: `approved-${mp.id}`,
        type: 'payment_success',
        title: 'Pembayaran Disetujui',
        message: `Pembayaran manual untuk invoice ${mp.invoice.invoiceNumber} sebesar ${amt} telah disetujui.`,
        timestamp: (mp.approvedAt ?? new Date()).toISOString(),
      });
    }
  }

  // 4. Admin/staff replies on customer's tickets
  const recentReplies = await prisma.ticketMessage.findMany({
    where: {
      senderType: { in: ['ADMIN', 'TECHNICIAN', 'STAFF'] },
      isInternal: false,
      createdAt: { gte: since },
      ticket: { customerId: user.id },
    },
    include: {
      ticket: { select: { ticketNumber: true, subject: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  for (const reply of recentReplies) {
    events.push({
      id: `reply-${reply.id}`,
      type: 'ticket_reply',
      title: 'Balasan Tiket',
      message: `Ada balasan baru dari ${reply.senderName} pada tiket #${reply.ticket.ticketNumber}: "${reply.ticket.subject}"`,
      timestamp: reply.createdAt.toISOString(),
    });
  }

  // 5. Ticket status changes (resolved or closed) for customer's tickets
  const resolvedTickets = await prisma.ticket.findMany({
    where: {
      customerId: user.id,
      status: { in: ['RESOLVED', 'CLOSED'] },
      resolvedAt: { gte: since },
    },
    select: { id: true, ticketNumber: true, subject: true, status: true, resolvedAt: true },
    orderBy: { resolvedAt: 'desc' },
    take: 10,
  });

  for (const tk of resolvedTickets) {
    events.push({
      id: `ticket-status-${tk.id}`,
      type: 'ticket_resolved',
      title: tk.status === 'RESOLVED' ? 'Tiket Diselesaikan' : 'Tiket Ditutup',
      message:
        tk.status === 'RESOLVED'
          ? `Tiket #${tk.ticketNumber} "${tk.subject}" telah diselesaikan.`
          : `Tiket #${tk.ticketNumber} "${tk.subject}" telah ditutup.`,
      timestamp: (tk.resolvedAt ?? new Date()).toISOString(),
    });
  }

  // Sort by timestamp descending
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json({ success: true, events });
}
