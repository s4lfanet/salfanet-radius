import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';

export async function GET(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const period = `${year}-${month}`;
    const today = now.toISOString().slice(0, 10);

    // Summary for current period — filter at DB level to avoid fetching
    // the collector's entire payment history into memory.
    const periodStart = new Date(`${period}-01T00:00:00`);
    const periodEnd = new Date(year, now.getMonth() + 1, 0, 23, 59, 59);

    const invoices = await prisma.invoice.findMany({
      where: {
        paidById: collector.id,
        status: 'PAID',
        paidAt: { gte: periodStart, lte: periodEnd },
      },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        paidAt: true,
      },
    });

    // Also fetch today's invoices separately for the today summary
    const todayStart = new Date(today + 'T00:00:00');
    const todayEnd = new Date(today + 'T23:59:59');
    const todayInvoices = await prisma.invoice.findMany({
      where: {
        paidById: collector.id,
        status: 'PAID',
        paidAt: { gte: todayStart, lte: todayEnd },
      },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        paidAt: true,
      },
    });

    const totalAmount = invoices.reduce((s, i) => s + i.amount, 0);
    const cashAmount = invoices.filter(i => !i.paymentMethod || i.paymentMethod === 'cash').reduce((s, i) => s + i.amount, 0);
    const transferAmount = invoices.filter(i => i.paymentMethod && i.paymentMethod !== 'cash' && i.paymentMethod !== 'discount').reduce((s, i) => s + i.amount, 0);
    const discountAmount = invoices.filter(i => i.paymentMethod === 'discount').reduce((s, i) => s + i.amount, 0);

    const todayAmount = todayInvoices.reduce((s, i) => s + i.amount, 0);

    // Get users in collector's area
    let isolirCount = 0;
    let unpaidCount = 0;

    const adminUser = await prisma.adminUser.findUnique({
      where: { id: collector.id },
      select: { areaId: true },
    });

    if (adminUser?.areaId) {
      const suspendedUsers = await prisma.pppoeUser.count({
        where: {
          areaId: adminUser.areaId,
          status: { in: ['suspended', 'isolated'] },
        },
      });
      isolirCount = suspendedUsers;

      const unpaidInvoices = await prisma.invoice.count({
        where: {
          status: { in: ['PENDING', 'OVERDUE'] },
          user: { areaId: adminUser.areaId },
        },
      });
      unpaidCount = unpaidInvoices;
    }

    return NextResponse.json({
      summary: {
        period,
        invoice_count: invoices.length,
        total_amount: totalAmount,
        cash_amount: cashAmount,
        transfer_amount: transferAmount,
        discount_amount: discountAmount,
        today_count: todayInvoices.length,
        today_amount: todayAmount,
        isolir_count: isolirCount,
        unpaid_count: unpaidCount,
      },
    });
  } catch (error) {
    console.error('Collector dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
