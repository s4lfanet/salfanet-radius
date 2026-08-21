import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';

export async function GET(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'date_from and date_to are required' }, { status: 400 });
  }

  try {
    const startDate = new Date(dateFrom + 'T00:00:00');
    const endDate = new Date(dateTo + 'T23:59:59');

    const invoices = await prisma.invoice.findMany({
      where: {
        paidById: collector.id,
        status: 'PAID',
        paidAt: { gte: startDate, lte: endDate },
      },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        paidAt: true,
      },
      orderBy: { paidAt: 'desc' },
    });

    // Group by date
    const byDate: Record<string, { invoice_count: number; total_amount: number; cash_amount: number; transfer_amount: number }> = {};
    for (const inv of invoices) {
      const d = inv.paidAt?.toISOString().slice(0, 10) || 'unknown';
      if (!byDate[d]) byDate[d] = { invoice_count: 0, total_amount: 0, cash_amount: 0, transfer_amount: 0 };
      byDate[d].invoice_count++;
      byDate[d].total_amount += inv.amount;
      if (!inv.paymentMethod || inv.paymentMethod === 'cash') byDate[d].cash_amount += inv.amount;
      else if (inv.paymentMethod !== 'discount') byDate[d].transfer_amount += inv.amount;
    }

    // Get confirmations for the range
    const confirmations = await prisma.collectorSettlementConfirmation.findMany({
      where: {
        collectorId: collector.id,
        date: { gte: dateFrom, lte: dateTo },
      },
      select: { date: true, confirmedBy: true, confirmedAt: true },
    });

    const confirmByDate: Record<string, { confirmed_by: string; confirmed_at: Date }> = {};
    for (const c of confirmations) {
      const admin = await prisma.adminUser.findUnique({
        where: { id: c.confirmedBy },
        select: { name: true },
      });
      confirmByDate[c.date] = { confirmed_by: admin?.name || 'Admin', confirmed_at: c.confirmedAt };
    }

    const rows = Object.entries(byDate)
      .map(([date, data]) => ({
        date,
        ...data,
        confirmed_by: confirmByDate[date]?.confirmed_by || null,
        confirmed_at: confirmByDate[date]?.confirmed_at || null,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({ rows });
  } catch (error) {
    console.error('My settlements range error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
