import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC, nowWIB, formatWIB } from '@/lib/timezone';
import { prisma } from '@/server/db/client';
import {
  installerInvoiceWhere, installerLabel, installerUserWhere, parseInstallerFilter, INSTALLER_UNSET_LABEL,
} from '@/server/services/installer.service';

// ── Format Rupiah ────────────────────────────────────────────────────────────
function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '-';
  return formatWIB(date, 'dd/MM/yyyy');
}

// ── Enum translations ────────────────────────────────────────────────────────
const INVOICE_TYPE_LABELS: Record<string, string> = {
  MONTHLY: 'Bulanan',
  INSTALLATION: 'Pemasangan',
  ADDON: 'Tambahan',
  TOPUP: 'Top Up',
  RENEWAL: 'Perpanjangan',
};

const SUBSCRIPTION_TYPE_LABELS: Record<string, string> = {
  POSTPAID: 'Pascabayar',
  PREPAID: 'Prabayar',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Tunai',
  TRANSFER: 'Transfer',
  CASHBACK: 'Cashback',
  EWALLET: 'E-Wallet',
  QRIS: 'QRIS',
  VOUCHER: 'Voucher',
  AGENT_DEPOSIT: 'Deposit Agen',
  MANUAL: 'Manual',
};

function translateInvoiceType(type: string): string {
  return INVOICE_TYPE_LABELS[type] || type;
}

function translateSubscriptionType(type: string): string {
  return SUBSCRIPTION_TYPE_LABELS[type] || type;
}

function translatePaymentMethod(method: string): string {
  return PAYMENT_METHOD_LABELS[method] || method;
}

export async function GET(request: NextRequest) {
  try {
    const authCheck = await requirePermission('reports.view');
    if (!authCheck.authorized) return authCheck.response;
    const _session = authCheck.session;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'invoice'; // invoice | payment | customer
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const status = searchParams.get('status') || 'all';
    // '' | all | none | <id> — narrows every report to that installer's customers
    const installerFilter = parseInstallerFilter(searchParams.get('installerId'));
    const invoiceInstaller = installerInvoiceWhere(installerFilter);

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
        AND: [invoiceInstaller],
      };
      if (status !== 'all') {
        where.status = status.toUpperCase();
      }

      const invoices = await prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          user: { select: { installer: { select: { name: true } } } },
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
        'Instalatur': installerLabel(inv.user?.installer),
        'Jumlah': inv.amount,
        'Jumlah (Rp)': formatRupiah(inv.amount),
        'Status': inv.status,
        'Jenis': translateInvoiceType(inv.invoiceType),
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
          invoice: { is: invoiceInstaller },
        },
        orderBy: { paidAt: 'desc' },
        include: {
          invoice: {
            select: {
              invoiceNumber: true,
              customerName: true,
              customerUsername: true,
              customerPhone: true,
              user: { select: { installer: { select: { name: true } } } },
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
        'Instalatur': installerLabel(pay.invoice?.user?.installer),
        'Jumlah': pay.amount,
        'Jumlah (Rp)': formatRupiah(pay.amount),
        'Metode': translatePaymentMethod(pay.method),
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
        ...installerUserWhere(installerFilter),
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
          installer: { select: { name: true } },
          pppoeCustomer: { select: { email: true } },
        },
        take: 5000,
      });

      const rows = customers.map((c) => ({
        'ID': c.customerId || c.id.slice(0, 8),
        'Nama': c.name,
        'Username': c.username,
        'Telepon': c.phone,
        'Email': c.email || c.pppoeCustomer?.email || '-',
        'Status': c.status,
        'Jenis': translateSubscriptionType(c.subscriptionType),
        'Paket': c.profile?.name || '-',
        'Harga Paket': c.profile?.price ? formatRupiah(c.profile.price) : '-',
        'Area': c.area?.name || '-',
        'Instalatur': installerLabel(c.installer),
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
        stopped: customers.filter(c => c.status === 'stop').length,
        expired: customers.filter(c => c.status === 'expired').length,
      };

      return NextResponse.json({ success: true, rows, summary, type });
    }

    // ── PROFILE / PACKAGE REVENUE REPORT ──────────────────────────────────
    // Pendapatan per paket/profile — dari invoice yang punya customer (pppoeUser),
    // dikelompokkan berdasarkan profile pelanggan saat ini.
    if (type === 'profile') {
      const invoices = await prisma.invoice.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          userId: { not: null },
          AND: [invoiceInstaller],
        },
        select: {
          amount: true,
          status: true,
          user: { select: { profile: { select: { id: true, name: true, price: true } } } },
        },
        take: 20000,
      });

      const byProfile = new Map<string, {
        name: string;
        price: number;
        customerCount: Set<string>;
        totalInvoice: number;
        paidCount: number;
        paidAmount: number;
        unpaidCount: number;
        unpaidAmount: number;
      }>();

      // Jumlah pelanggan aktif per profile (independen dari invoice, agar akurat)
      const profileCustomerCounts = await prisma.pppoeUser.groupBy({
        by: ['profileId'],
        where: { profileId: { not: null }, ...installerUserWhere(installerFilter) },
        _count: { _all: true },
      });
      const customerCountMap = new Map(
        profileCustomerCounts.map((r) => [r.profileId as string, r._count._all])
      );

      for (const inv of invoices) {
        const profile = inv.user?.profile;
        const key = profile?.id ?? 'unknown';
        const name = profile?.name ?? 'Tanpa Paket';
        if (!byProfile.has(key)) {
          byProfile.set(key, {
            name,
            price: profile?.price ?? 0,
            customerCount: new Set(),
            totalInvoice: 0,
            paidCount: 0,
            paidAmount: 0,
            unpaidCount: 0,
            unpaidAmount: 0,
          });
        }
        const entry = byProfile.get(key)!;
        entry.totalInvoice += 1;
        if (inv.status === 'PAID') {
          entry.paidCount += 1;
          entry.paidAmount += inv.amount;
        } else if (inv.status === 'PENDING' || inv.status === 'OVERDUE') {
          entry.unpaidCount += 1;
          entry.unpaidAmount += inv.amount;
        }
      }

      const rows = Array.from(byProfile.entries())
        .map(([profileId, e]) => ({
          'Paket': e.name,
          'Harga': e.price,
          'Harga (Rp)': formatRupiah(e.price),
          'Jumlah Pelanggan': customerCountMap.get(profileId) ?? 0,
          'Total Invoice': e.totalInvoice,
          'Lunas': e.paidCount,
          'Pendapatan (Rp)': formatRupiah(e.paidAmount),
          'Belum Bayar': e.unpaidCount,
          'Tertunggak (Rp)': formatRupiah(e.unpaidAmount),
        }))
        .sort((a, b) => (b['Pendapatan (Rp)'] > a['Pendapatan (Rp)'] ? 1 : -1));

      const summary = {
        total: rows.length,
        // collectedAmount / outstandingAmount say what the numbers are. totalAmount and
        // paidAmount keep their old (swapped) meaning for clients that already read them.
        collectedAmount: Array.from(byProfile.values()).reduce((s, e) => s + e.paidAmount, 0),
        outstandingAmount: Array.from(byProfile.values()).reduce((s, e) => s + e.unpaidAmount, 0),
        totalAmount: Array.from(byProfile.values()).reduce((s, e) => s + e.paidAmount, 0),
        paidAmount: Array.from(byProfile.values()).reduce((s, e) => s + e.unpaidAmount, 0),
      };

      return NextResponse.json({ success: true, rows, summary, type });
    }

    // ── INSTALLER REPORT ──────────────────────────────────────────────────
    // Customers, invoices and revenue per installer (current installer of
    // each customer), for invoices created in the period.
    if (type === 'installer') {
      const [installers, customerCounts, invoices] = await Promise.all([
        prisma.installer.findMany({ select: { id: true, name: true, isActive: true } }),
        prisma.pppoeUser.groupBy({ by: ['installerId'], where: installerUserWhere(installerFilter), _count: { _all: true } }),
        prisma.invoice.findMany({
          where: { createdAt: { gte: from, lte: to }, userId: { not: null }, AND: [invoiceInstaller] },
          select: { amount: true, status: true, user: { select: { installerId: true } } },
          take: 50000,
        }),
      ]);

      type Row = { name: string; active: boolean; customers: number; invoices: number; paid: number; paidAmount: number; unpaid: number; unpaidAmount: number };
      const byInstaller = new Map<string, Row>();
      const keyOf = (id: string | null | undefined) => id ?? '__none__';
      const rowFor = (id: string | null | undefined): Row => {
        const k = keyOf(id);
        if (!byInstaller.has(k)) {
          const inst = installers.find((i) => i.id === id);
          byInstaller.set(k, { name: inst?.name ?? INSTALLER_UNSET_LABEL, active: inst?.isActive ?? true, customers: 0, invoices: 0, paid: 0, paidAmount: 0, unpaid: 0, unpaidAmount: 0 });
        }
        return byInstaller.get(k)!;
      };

      for (const c of customerCounts) rowFor(c.installerId).customers = c._count._all;
      for (const inv of invoices) {
        const r = rowFor(inv.user?.installerId);
        r.invoices += 1;
        if (inv.status === 'PAID') { r.paid += 1; r.paidAmount += inv.amount; }
        else if (inv.status === 'PENDING' || inv.status === 'OVERDUE') { r.unpaid += 1; r.unpaidAmount += inv.amount; }
      }

      const ordered = [...byInstaller.entries()].sort(([ka, a], [kb, b]) =>
        ka === '__none__' ? 1 : kb === '__none__' ? -1 : b.paidAmount - a.paidAmount || a.name.localeCompare(b.name, 'id'),
      );
      const rows = ordered.map(([, r]) => ({
        'Instalatur': r.active ? r.name : `${r.name} (nonaktif)`,
        'Jumlah Pelanggan': r.customers,
        'Total Invoice': r.invoices,
        'Lunas': r.paid,
        'Pendapatan': r.paidAmount,
        'Pendapatan (Rp)': formatRupiah(r.paidAmount),
        'Belum Bayar': r.unpaid,
        'Tertunggak': r.unpaidAmount,
        'Tertunggak (Rp)': formatRupiah(r.unpaidAmount),
      }));

      const summary = {
        total: rows.length,
        collectedAmount: ordered.reduce((s, [, r]) => s + r.paidAmount, 0),
        outstandingAmount: ordered.reduce((s, [, r]) => s + r.unpaidAmount, 0),
        totalAmount: ordered.reduce((s, [, r]) => s + r.paidAmount, 0),
        paidAmount: ordered.reduce((s, [, r]) => s + r.unpaidAmount, 0),
      };

      return NextResponse.json({ success: true, rows, summary, type });
    }

    return NextResponse.json({ error: 'Invalid type. Use: invoice | payment | customer | profile | installer' }, { status: 400 });
  } catch (error: any) {
    console.error('[LAPORAN API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
