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
  const date = searchParams.get('date');

  try {
    // Get all collectors
    const collectors = await prisma.adminUser.findMany({
      where: { role: 'COLLECTOR', isActive: true },
      select: { id: true, name: true, username: true, phone: true },
    });

    // Get invoices paid by collectors
    const where: any = {
      status: 'PAID',
      paidById: { not: null },
      paymentMethod: { not: 'discount' },
    };
    if (date) {
      where.paidAt = {
        gte: new Date(date + 'T00:00:00'),
        lte: new Date(date + 'T23:59:59'),
      };
    }

    const invoices = await prisma.invoice.findMany({
      where,
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        paidAt: true,
        paidById: true,
        invoiceNumber: true,
        userId: true,
        customerName: true,
        customerUsername: true,
        customerPhone: true,
        collectorProof: true,
      },
    });

    // Get confirmations for this date
    const confirmations = await prisma.collectorSettlementConfirmation.findMany({
      where: { date: date || new Date().toISOString().slice(0, 10) },
      select: { collectorId: true, confirmedBy: true, confirmedAt: true },
    });
    // Batch fetch admin names to avoid N+1 queries
    const adminIds = [...new Set(confirmations.map(c => c.confirmedBy))];
    const admins = await prisma.adminUser.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, name: true },
    });
    const adminMap = new Map(admins.map(a => [a.id, a.name]));
    const confirmMap: Record<string, { confirmed_by: string; confirmed_at: Date }> = {};
    for (const c of confirmations) {
      confirmMap[c.collectorId] = { confirmed_by: adminMap.get(c.confirmedBy) || 'Admin', confirmed_at: c.confirmedAt };
    }

    const result = collectors.map(c => {
      const cInvoices = invoices.filter(i => i.paidById === c.id);
      const totalAmount = cInvoices.reduce((s, i) => s + i.amount, 0);
      const cashAmount = cInvoices.filter(i => !i.paymentMethod || i.paymentMethod === 'cash').reduce((s, i) => s + i.amount, 0);
      const transferAmount = cInvoices.filter(i => i.paymentMethod && i.paymentMethod !== 'cash').reduce((s, i) => s + i.amount, 0);

      const conf = confirmMap[c.id];
      return {
        collector_id: c.id,
        collector_name: c.name,
        collector_username: c.username,
        invoice_count: cInvoices.length,
        total_amount: totalAmount,
        cash_amount: cashAmount,
        transfer_amount: transferAmount,
        confirmed_by: conf?.confirmed_by || null,
        confirmed_at: conf?.confirmed_at || null,
        invoices: cInvoices.map(i => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          amount: i.amount,
          paymentMethod: i.paymentMethod,
          paidAt: i.paidAt,
          customerName: i.customerName,
          customerUsername: i.customerUsername,
          has_proof: !!i.collectorProof,
        })),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Collector setoran error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
