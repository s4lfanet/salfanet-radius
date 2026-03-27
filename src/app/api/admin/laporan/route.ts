import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC, nowWIB, formatWIB } from '@/lib/timezone';
import { prisma } from '@/server/db/client';

// ── Format Rupiah ────────────────────────────────────────────────────────────
function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '-';
  return formatWIB(date, 'dd/MM/yyyy');
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'invoice'; // invoice | payment | customer
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const status = searchParams.get('status') || 'all';

    // Build date range with WIB-aware conversion
    const nowLocal = nowWIB();
    const from = dateFrom
      ? startOfDayWIBtoUTC(dateFrom)
      : new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), 1));
    const to = dateTo
      ? endOfDayWIBtoUTC(dateTo)
      : nowLocal;

    // ── INVOICE REPORT ────────────────────────────────────────────────────
    if (type === 'invoice') {
      const where: any = {
        createdAt: { gte: from, lte: to },
      };
      if (status !== 'all') {
        where.status = status.toUpperCase();
      }

      const invoices = await prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          invoiceNumber: true,
          customerName: true,
          customerUsername: true,
          customerPhone: true,
          amount: true,
          status: true,
          dueDate: true,
          paidAt: true,
          createdAt: true,
          invoiceType: true,
          notes: true,
        },
        take: 5000,
      });

      const rows = invoices.map((inv) => ({
        'No. Invoice': inv.invoiceNumber,
        'Nama Pelanggan': inv.customerName || '-',
        'Username': inv.customerUsername || '-',
        'Telepon': inv.customerPhone || '-',
        'Jumlah': inv.amount,
        'Jumlah (Rp)': formatRupiah(inv.amount),
        'Status': inv.status,
        'Jenis': inv.invoiceType,
        'Jatuh Tempo': formatDate(inv.dueDate),
        'Dibayar': formatDate(inv.paidAt),
        'Dibuat': formatDate(inv.createdAt),
        'Catatan': inv.notes || '-',
      }));

      const summary = {
        total: invoices.length,
        paid: invoices.filter(i => i.status === 'PAID').length,
        pending: invoices.filter(i => i.status === 'PENDING').length,
        overdue: invoices.filter(i => i.status === 'OVERDUE').length,
        totalAmount: invoices.reduce((s, i) => s + i.amount, 0),
        paidAmount: invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + i.amount, 0),
      };

      return NextResponse.json({ success: true, rows, summary, type });
    }

    // ── PAYMENT REPORT ────────────────────────────────────────────────────
    if (type === 'payment') {
      const payments = await prisma.payment.findMany({
        where: {
          paidAt: { gte: from, lte: to },
        },
        orderBy: { paidAt: 'desc' },
        include: {
          invoice: {
            select: {
              invoiceNumber: true,
              customerName: true,
              customerUsername: true,
              customerPhone: true,
            },
          },
        },
        take: 5000,
      });

      const rows = payments.map((pay) => ({
        'No. Invoice': pay.invoice?.invoiceNumber || '-',
        'Nama Pelanggan': pay.invoice?.customerName || '-',
        'Username': pay.invoice?.customerUsername || '-',
        'Telepon': pay.invoice?.customerPhone || '-',
        'Jumlah': pay.amount,
        'Jumlah (Rp)': formatRupiah(pay.amount),
        'Metode': pay.method,
        'Status': pay.status,
        'Tanggal Bayar': formatDate(pay.paidAt),
        'Catatan': pay.notes || '-',
      }));

      const summary = {
        total: payments.length,
        totalAmount: payments.reduce((s, p) => s + p.amount, 0),
      };

      return NextResponse.json({ success: true, rows, summary, type });
    }

    // ── CUSTOMER REPORT ───────────────────────────────────────────────────
    if (type === 'customer') {
      const where: any = {
        createdAt: { gte: from, lte: to },
      };
      if (status !== 'all') {
        where.status = status;
      }

      const customers = await prisma.pppoeUser.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          profile: { select: { name: true, price: true } },
          area: { select: { name: true } },
        },
        take: 5000,
      });

      const rows = customers.map((c) => ({
        'ID': c.customerId || c.id.slice(0, 8),
        'Nama': c.name,
        'Username': c.username,
        'Telepon': c.phone,
        'Email': c.email || '-',
        'Status': c.status,
        'Jenis': c.subscriptionType,
        'Paket': c.profile?.name || '-',
        'Harga Paket': c.profile?.price ? formatRupiah(c.profile.price) : '-',
        'Area': c.area?.name || '-',
        'Saldo': formatRupiah(c.balance),
        'Auto Renewal': c.autoRenewal ? 'Ya' : 'Tidak',
        'Terdaftar': formatDate(c.createdAt),
        'Expired': formatDate(c.expiredAt),
        'Catatan': c.comment || '-',
      }));

      const summary = {
        total: customers.length,
        active: customers.filter(c => c.status === 'active').length,
        isolated: customers.filter(c => c.status === 'isolated').length,
        stopped: customers.filter(c => c.status === 'stopped').length,
        expired: customers.filter(c => c.status === 'expired').length,
      };

      return NextResponse.json({ success: true, rows, summary, type });
    }

    return NextResponse.json({ error: 'Invalid type. Use: invoice | payment | customer' }, { status: 400 });
  } catch (error: any) {
    console.error('[LAPORAN API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
