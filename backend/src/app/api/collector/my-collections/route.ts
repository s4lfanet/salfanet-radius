import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';

export async function GET(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const months = Math.min(parseInt(searchParams.get('months') || '6'), 24);

  try {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);

    const invoices = await prisma.invoice.findMany({
      where: {
        paidById: collector.id,
        status: 'PAID',
        paidAt: { gte: cutoff },
      },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        paidAt: true,
        invoiceNumber: true,
        customerName: true,
        customerUsername: true,
      },
      orderBy: { paidAt: 'desc' },
    });

    // Group by month
    const monthlyMap: Record<string, { total_count: number; total_amount: number; cash_amount: number; transfer_amount: number }> = {};
    for (const inv of invoices) {
      const m = inv.paidAt?.toISOString().slice(0, 7) || 'unknown';
      if (!monthlyMap[m]) monthlyMap[m] = { total_count: 0, total_amount: 0, cash_amount: 0, transfer_amount: 0 };
      monthlyMap[m].total_count++;
      monthlyMap[m].total_amount += inv.amount;
      if (!inv.paymentMethod || inv.paymentMethod === 'cash') monthlyMap[m].cash_amount += inv.amount;
      else if (inv.paymentMethod !== 'discount') monthlyMap[m].transfer_amount += inv.amount;
    }

    const monthly = Object.entries(monthlyMap)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => b.month.localeCompare(a.month));

    return NextResponse.json({
      total_count: invoices.length,
      total_amount: invoices.reduce((s, i) => s + i.amount, 0),
      monthly,
      recent: invoices.slice(0, 20).map(i => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        amount: i.amount,
        paymentMethod: i.paymentMethod,
        paidAt: i.paidAt,
        customerName: i.customerName,
        customerUsername: i.customerUsername,
      })),
    });
  } catch (error) {
    console.error('My collections error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
