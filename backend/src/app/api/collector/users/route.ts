import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';

export async function GET(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rawFilter = searchParams.get('filter') || 'unpaid';
  const filter = ['unpaid', 'all', 'paid'].includes(rawFilter) ? rawFilter : 'unpaid';

  try {
    const adminUser = await prisma.adminUser.findUnique({
      where: { id: collector.id },
      select: { areaId: true },
    });

    if (!adminUser?.areaId) {
      return NextResponse.json({ users: [] });
    }

    const users = await prisma.pppoeUser.findMany({
      where: {
        areaId: adminUser.areaId,
      },
      select: {
        id: true,
        username: true,
        name: true,
        customerId: true,
        phone: true,
        address: true,
        status: true,
      },
      orderBy: { name: 'asc' },
    });

    // Get ALL invoices for these users (not just filtered) so is_paid is accurate
    const userIds = users.map(u => u.id);
    const allInvoices = await prisma.invoice.findMany({
      where: {
        userId: { in: userIds },
        status: { not: 'CANCELLED' },
      },
      select: {
        id: true,
        userId: true,
        invoiceNumber: true,
        amount: true,
        status: true,
        dueDate: true,
        paidAt: true,
        paidById: true,
        paymentMethod: true,
      },
      orderBy: { dueDate: 'desc' },
    });

    // For display: filter by the requested filter
    const displayInvoices = allInvoices.filter(inv =>
      filter === 'unpaid'
        ? (inv.status === 'PENDING' || inv.status === 'OVERDUE')
        : true
    );

    const invoiceMap = new Map<string, typeof allInvoices>();
    for (const inv of displayInvoices) {
      const arr = invoiceMap.get(inv.userId) || [];
      arr.push(inv);
      invoiceMap.set(inv.userId, arr);
    }

    // Build is_paid map from ALL invoices (not just filtered)
    const allInvoiceMap = new Map<string, typeof allInvoices>();
    for (const inv of allInvoices) {
      const arr = allInvoiceMap.get(inv.userId) || [];
      arr.push(inv);
      allInvoiceMap.set(inv.userId, arr);
    }

    let enriched = users.map(u => {
      const userAllInvoices = allInvoiceMap.get(u.id) || [];
      const userDisplayInvoices = invoiceMap.get(u.id) || [];
      const unpaid = userAllInvoices.filter(i => i.status === 'PENDING' || i.status === 'OVERDUE');
      const paid = userAllInvoices.filter(i => i.status === 'PAID');
      return {
        ...u,
        invoices: userDisplayInvoices,
        unpaid_count: unpaid.length,
        unpaid_amount: unpaid.reduce((s, i) => s + i.amount, 0),
        is_paid: userAllInvoices.length > 0 && unpaid.length === 0,
        has_paid_by_collector: paid.some(i => i.paidById === collector.id),
      };
    });

    if (filter === 'unpaid') {
      enriched = enriched.filter(u => u.unpaid_count > 0);
    } else if (filter === 'paid') {
      enriched = enriched.filter(u => u.is_paid);
    }

    return NextResponse.json({ users: enriched });
  } catch (error) {
    console.error('Billable users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
