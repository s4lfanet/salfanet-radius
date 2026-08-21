import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';

export async function GET(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get('filter') || 'unpaid'; // unpaid, all, paid

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
        status: { in: ['active', 'suspended'] },
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

    // Get invoices for these users
    const userIds = users.map(u => u.id);
    const invoices = await prisma.invoice.findMany({
      where: {
        userId: { in: userIds },
        status: { in: filter === 'unpaid' ? ['PENDING', 'OVERDUE'] : ['PAID', 'PENDING', 'OVERDUE'] },
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

    const invoiceMap = new Map<string, typeof invoices>();
    for (const inv of invoices) {
      const arr = invoiceMap.get(inv.userId) || [];
      arr.push(inv);
      invoiceMap.set(inv.userId, arr);
    }

    let enriched = users.map(u => {
      const userInvoices = invoiceMap.get(u.id) || [];
      const unpaid = userInvoices.filter(i => i.status === 'PENDING' || i.status === 'OVERDUE');
      const paid = userInvoices.filter(i => i.status === 'PAID');
      return {
        ...u,
        invoices: userInvoices,
        unpaid_count: unpaid.length,
        unpaid_amount: unpaid.reduce((s, i) => s + i.amount, 0),
        is_paid: unpaid.length === 0,
        has_paid_by_collector: paid.some(i => i.paidById === collector.id),
      };
    });

    if (filter === 'unpaid') {
      enriched = enriched.filter(u => u.unpaid_count > 0);
    } else if (filter === 'paid') {
      enriched = enriched.filter(u => u.unpaid_count === 0 && u.invoices.length > 0);
    }

    return NextResponse.json({ users: enriched });
  } catch (error) {
    console.error('Billable users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
