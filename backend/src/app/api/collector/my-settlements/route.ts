import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';

export async function GET(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

  try {
    const startDate = new Date(date + 'T00:00:00');
    const endDate = new Date(date + 'T23:59:59');

    const invoices = await prisma.invoice.findMany({
      where: {
        paidById: collector.id,
        status: 'PAID',
        paidAt: { gte: startDate, lte: endDate },
      },
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        paymentMethod: true,
        paidAt: true,
        customerName: true,
        customerUsername: true,
        collectorProof: true,
        userId: true,
      },
      orderBy: { paidAt: 'desc' },
    });

    const totalAmount = invoices.reduce((s, i) => s + i.amount, 0);
    const cashAmount = invoices.filter(i => !i.paymentMethod || i.paymentMethod === 'cash').reduce((s, i) => s + i.amount, 0);
    const transferAmount = invoices.filter(i => i.paymentMethod && i.paymentMethod !== 'cash' && i.paymentMethod !== 'discount').reduce((s, i) => s + i.amount, 0);
    const discountAmount = invoices.filter(i => i.paymentMethod === 'discount').reduce((s, i) => s + i.amount, 0);

    // Check if confirmed
    const confirmation = await prisma.collectorSettlementConfirmation.findUnique({
      where: {
        collectorId_date: { collectorId: collector.id, date },
      },
      select: {
        confirmedBy: true,
        confirmedAt: true,
      },
    });

    let confirmedByName = null;
    if (confirmation) {
      const admin = await prisma.adminUser.findUnique({
        where: { id: confirmation.confirmedBy },
        select: { name: true },
      });
      confirmedByName = admin?.name || 'Admin';
    }

    return NextResponse.json({
      date,
      summary: {
        invoice_count: invoices.length,
        total_amount: totalAmount,
        cash_amount: cashAmount,
        transfer_amount: transferAmount,
        discount_amount: discountAmount,
      },
      invoices: invoices.map(i => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        amount: i.amount,
        paymentMethod: i.paymentMethod,
        paidAt: i.paidAt,
        customerName: i.customerName,
        customerUsername: i.customerUsername,
        has_proof: !!i.collectorProof,
      })),
      confirmation: confirmation
        ? { confirmed_by: confirmedByName, confirmed_at: confirmation.confirmedAt }
        : null,
    });
  } catch (error) {
    console.error('My settlements error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
