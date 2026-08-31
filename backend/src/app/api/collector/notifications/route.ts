import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';

export async function GET(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sinceParam = searchParams.get('since');
  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const events: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    timestamp: string;
  }> = [];

  // 1. Recent payments collected by this collector
  const recentPayments = await prisma.invoice.findMany({
    where: {
      paidById: collector.id,
      status: 'PAID',
      paidAt: { gte: since },
    },
    select: {
      id: true,
      invoiceNumber: true,
      amount: true,
      customerName: true,
      paymentMethod: true,
      paidAt: true,
    },
    orderBy: { paidAt: 'desc' },
    take: 10,
  });

  for (const inv of recentPayments) {
    const amt = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(inv.amount);
    events.push({
      id: `collected-${inv.id}`,
      type: 'payment_collected',
      title: 'Pembayaran Tercatat',
      message: `Invoice ${inv.invoiceNumber} — ${inv.customerName || 'Pelanggan'} (${amt})`,
      timestamp: (inv.paidAt ?? new Date()).toISOString(),
    });
  }

  // 2. Recent ONT removal tasks assigned to this collector
  const ontTasks = await prisma.ontRemovalTask.findMany({
    where: {
      assignedToId: collector.id,
      assignedToType: 'ADMIN',
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      updatedAt: { gte: since },
    },
    select: {
      id: true,
      customerName: true,
      customerAddress: true,
      status: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });

  for (const task of ontTasks) {
    events.push({
      id: `ont-${task.id}`,
      type: 'ont_task',
      title: 'Tugas Lepas ONT',
      message: `${task.customerName}${task.customerAddress ? ` — ${task.customerAddress}` : ''}`,
      timestamp: task.updatedAt.toISOString(),
    });
  }

  // 3. Tickets assigned to this collector
  const assignedTickets = await prisma.ticket.findMany({
    where: {
      assignedToId: collector.id,
      assignedToType: 'ADMIN',
      updatedAt: { gte: since },
      status: { in: ['OPEN', 'IN_PROGRESS'] },
    },
    select: {
      id: true,
      ticketNumber: true,
      subject: true,
      customerName: true,
      priority: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });

  for (const t of assignedTickets) {
    events.push({
      id: `ticket-${t.id}`,
      type: 'ticket_assigned',
      title: `Tiket ${t.ticketNumber}`,
      message: `${t.subject}${t.customerName ? ` — ${t.customerName}` : ''}`,
      timestamp: t.updatedAt.toISOString(),
    });
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json({
    success: true,
    events: events.slice(0, 20),
    count: events.length,
  });
}
