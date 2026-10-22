import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';
import { getCollectorScope, scopeWhere } from '@/server/auth/collector-scope';

const sum = (rows: { amount: number }[]) => rows.reduce((s, i) => s + i.amount, 0);

/**
 * Collector dashboard for one month (?period=YYYY-MM, default this month),
 * optionally narrowed to one area / router (?areaId, ?routerId) within the
 * collector's scope:
 * - collections: what this collector marked paid in that month
 * - billing: invoices due in that month for their customers, paid and unpaid
 */
export async function GET(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const asked = searchParams.get('period') || '';
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(asked);
    const year = match ? Number(match[1]) : now.getFullYear();
    const monthIndex = match ? Number(match[2]) - 1 : now.getMonth();
    const period = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    const periodStart = new Date(year, monthIndex, 1, 0, 0, 0);
    const periodEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const scope = await getCollectorScope(collector.id);
    const narrow = { areaId: searchParams.get('areaId'), routerId: searchParams.get('routerId') };
    const narrowed = !!(narrow.areaId || narrow.routerId);
    const customers: Prisma.pppoeUserWhereInput | null = scope ? scopeWhere(scope, narrow) : null;

    // Collections are the collector's own; the Area / Router filter applies
    // to them through the customer.
    const collected: Prisma.invoiceWhereInput = {
      paidById: collector.id,
      status: 'PAID',
      ...(narrowed && customers ? { user: customers } : {}),
    };
    const paidSelect = { amount: true, paymentMethod: true } as const;

    const [periodPaid, todayPaid, billing, isolirCount] = await Promise.all([
      prisma.invoice.findMany({ where: { ...collected, paidAt: { gte: periodStart, lte: periodEnd } }, select: paidSelect }),
      prisma.invoice.findMany({ where: { ...collected, paidAt: { gte: todayStart, lte: todayEnd } }, select: paidSelect }),
      customers
        ? prisma.invoice.findMany({
            where: { user: customers, dueDate: { gte: periodStart, lte: periodEnd }, status: { not: 'CANCELLED' } },
            select: { amount: true, status: true },
          })
        : Promise.resolve([] as { amount: number; status: string }[]),
      customers
        ? prisma.pppoeUser.count({ where: { AND: [customers, { status: { in: ['suspended', 'isolated'] } }] } })
        : Promise.resolve(0),
    ]);

    const isCash = (m: string | null) => !m || m === 'cash';
    const billPaid = billing.filter((i) => i.status === 'PAID');
    const billUnpaid = billing.filter((i) => i.status === 'PENDING' || i.status === 'OVERDUE');

    return NextResponse.json({
      summary: {
        period,
        invoice_count: periodPaid.length,
        total_amount: sum(periodPaid),
        cash_amount: sum(periodPaid.filter((i) => isCash(i.paymentMethod))),
        transfer_amount: sum(periodPaid.filter((i) => !isCash(i.paymentMethod) && i.paymentMethod !== 'discount')),
        discount_amount: sum(periodPaid.filter((i) => i.paymentMethod === 'discount')),
        today_count: todayPaid.length,
        today_amount: sum(todayPaid),
        isolir_count: isolirCount,
        // Invoices due in the period for the collector's customers.
        bill_count: billing.length,
        bill_amount: sum(billing),
        bill_paid_count: billPaid.length,
        bill_paid_amount: sum(billPaid),
        unpaid_count: billUnpaid.length,
        unpaid_amount: sum(billUnpaid),
      },
    });
  } catch (error) {
    console.error('Collector dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
