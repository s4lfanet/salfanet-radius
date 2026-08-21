import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { checkAuth } from '@/server/middleware/api-auth';

export async function GET(req: NextRequest) {
  const authCheck = await checkAuth();
  if (!authCheck.authorized) return authCheck.response;

  const role = (authCheck.session.user as any).role;
  if (role !== 'SUPER_ADMIN' && role !== 'FINANCE') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const months = Math.min(parseInt(searchParams.get('months') || '6'), 24);

  try {
    const collectors = await prisma.adminUser.findMany({
      where: { role: 'COLLECTOR', isActive: true },
      select: { id: true, name: true, username: true },
      orderBy: { name: 'asc' },
    });

    if (collectors.length === 0) return NextResponse.json([]);

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);

    const invoices = await prisma.invoice.findMany({
      where: {
        status: 'PAID',
        paidById: { in: collectors.map(c => c.id) },
        paidAt: { gte: cutoff },
        paymentMethod: { not: 'discount' },
      },
      select: {
        paidById: true,
        amount: true,
        paymentMethod: true,
        paidAt: true,
      },
    });

    const result = collectors.map(c => {
      const cInvoices = invoices.filter(i => i.paidById === c.id);
      const monthlyMap: Record<string, { total_count: number; total_amount: number; cash_amount: number; transfer_amount: number }> = {};

      for (const inv of cInvoices) {
        const m = inv.paidAt?.toISOString().slice(0, 7) || 'unknown';
        if (!monthlyMap[m]) monthlyMap[m] = { total_count: 0, total_amount: 0, cash_amount: 0, transfer_amount: 0 };
        monthlyMap[m].total_count++;
        monthlyMap[m].total_amount += inv.amount;
        if (!inv.paymentMethod || inv.paymentMethod === 'cash') monthlyMap[m].cash_amount += inv.amount;
        else monthlyMap[m].transfer_amount += inv.amount;
      }

      return {
        collector_id: c.id,
        collector_name: c.name,
        collector_username: c.username,
        monthly: Object.entries(monthlyMap)
          .map(([month, data]) => ({ month, ...data }))
          .sort((a, b) => b.month.localeCompare(a.month)),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Collector history error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
