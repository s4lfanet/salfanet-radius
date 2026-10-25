import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { notifyCollector, fmtRupiah } from '@/server/services/collector-notification.service';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC, refreshTimezoneFromDB, todayWIBStr } from '@/lib/timezone';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Paid invoices that no collector's settlement counts: the admin marked them
 * paid, or an older payment was recorded without a collector. Gateway and
 * customer-submitted payments are left out, since no collector took that
 * money. GET lists them; POST attributes one to a collector.
 */
export async function GET(req: NextRequest) {
  const authCheck = await requirePermission('keuangan.view');
  if (!authCheck.authorized) return authCheck.response;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const from = searchParams.get('from') || date || todayWIBStr();
  const to = searchParams.get('to') || date || from;
  if (!DATE.test(from) || !DATE.test(to) || from > to) {
    return NextResponse.json({ error: 'Rentang tanggal tidak valid' }, { status: 400 });
  }

  try {
    await refreshTimezoneFromDB();
    const rows = await prisma.invoice.findMany({
      where: {
        status: 'PAID',
        paidById: null,
        OR: [{ paymentMethod: null }, { paymentMethod: { in: ['cash', 'transfer'] } }],
        paidAt: { gte: startOfDayWIBtoUTC(from), lte: endOfDayWIBtoUTC(to) },
        // A customer's own transfer that the admin approved is not collector money.
        manualPayments: { none: {} },
      },
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        paymentMethod: true,
        paidAt: true,
        customerName: true,
        customerUsername: true,
      },
      orderBy: { paidAt: 'desc' },
      take: 500,
    });
    return NextResponse.json({
      count: rows.length,
      total_amount: rows.reduce((s, i) => s + i.amount, 0),
      invoices: rows,
    });
  } catch (error) {
    console.error('Unassigned settlement list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authCheck = await requirePermission('keuangan.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { invoiceId, collectorId } = await req.json();
    if (!invoiceId || !collectorId) {
      return NextResponse.json({ error: 'invoiceId dan collectorId wajib diisi' }, { status: 400 });
    }
    const collector = await prisma.adminUser.findFirst({
      where: { id: String(collectorId), role: 'COLLECTOR', isActive: true },
      select: { id: true },
    });
    if (!collector) {
      return NextResponse.json({ error: 'Kolektor tidak ditemukan atau tidak aktif' }, { status: 400 });
    }

    // Only an invoice nobody has claimed: never move one between collectors.
    const claimed = await prisma.invoice.updateMany({
      where: { id: String(invoiceId), status: 'PAID', paidById: null },
      data: { paidById: collector.id, paymentMethod: 'cash' },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: 'Invoice tidak ditemukan, belum lunas, atau sudah punya kolektor' }, { status: 409 });
    }
    const inv = await prisma.invoice.findUnique({ where: { id: String(invoiceId) }, select: { invoiceNumber: true, customerName: true, amount: true } });
    await notifyCollector(collector.id, {
      type: 'payment_assigned',
      title: 'Pembayaran dicatat ke Anda',
      message: `${inv?.customerName || 'Pelanggan'} (${inv?.invoiceNumber || 'invoice'}, ${fmtRupiah(inv?.amount || 0)}) dicatat admin sebagai setoran Anda.`,
      link: '/collector/settlements',
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Assign settlement error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
