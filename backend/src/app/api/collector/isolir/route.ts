import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';

export async function GET(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
        status: { in: ['suspended', 'isolated'] },
      },
      select: {
        id: true,
        username: true,
        name: true,
        customerId: true,
        phone: true,
        address: true,
        areaId: true,
        expiredAt: true,
        subscriptionType: true,
        connectionType: true,
        profile: { select: { id: true, name: true, price: true } },
        area: { select: { id: true, name: true } },
        router: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Fetch unpaid invoices for each user
    const userIds = users.map(u => u.id);
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        userId: { in: userIds },
        status: { in: ['PENDING', 'OVERDUE'] },
      },
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        dueDate: true,
        status: true,
        userId: true,
      },
      orderBy: { dueDate: 'asc' },
    });

    // Group invoices by userId
    const invoicesByUser = new Map<string, typeof unpaidInvoices>();
    for (const inv of unpaidInvoices) {
      const arr = invoicesByUser.get(inv.userId) || [];
      arr.push(inv);
      invoicesByUser.set(inv.userId, arr);
    }

    const unpaidMap = new Map<string, number>();
    for (const inv of unpaidInvoices) {
      unpaidMap.set(inv.userId, (unpaidMap.get(inv.userId) || 0) + inv.amount);
    }

    const enriched = users.map(u => ({
      ...u,
      is_paid: !unpaidMap.has(u.id),
      unpaid_amount: unpaidMap.get(u.id) || 0,
      unpaid_count: invoicesByUser.get(u.id)?.length || 0,
      invoices: (invoicesByUser.get(u.id) || []).map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: inv.amount,
        dueDate: inv.dueDate?.toISOString() || null,
        status: inv.status,
      })),
    }));

    return NextResponse.json({ users: enriched });
  } catch (error) {
    console.error('Collector isolir error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
