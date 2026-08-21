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
        status: 'suspended',
      },
      select: {
        id: true,
        username: true,
        name: true,
        customerId: true,
        phone: true,
        address: true,
        areaId: true,
      },
      orderBy: { name: 'asc' },
    });

    const area = await prisma.pppoeArea.findUnique({
      where: { id: adminUser.areaId },
      select: { name: true },
    });

    // Check unpaid invoices for each user
    const userIds = users.map(u => u.id);
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        userId: { in: userIds },
        status: 'PENDING',
      },
      select: { userId: true, amount: true },
    });

    const unpaidMap = new Map<string, number>();
    for (const inv of unpaidInvoices) {
      unpaidMap.set(inv.userId, (unpaidMap.get(inv.userId) || 0) + inv.amount);
    }

    const enriched = users.map(u => ({
      ...u,
      areaName: area?.name || null,
      is_paid: !unpaidMap.has(u.id),
      unpaid_amount: unpaidMap.get(u.id) || 0,
    }));

    return NextResponse.json({ users: enriched });
  } catch (error) {
    console.error('Collector isolir error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
