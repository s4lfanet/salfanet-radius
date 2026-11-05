import 'server-only';
import { prisma } from '@/server/db/client';
import { endOfDayWIBtoUTC, formatWIB, nowWIB, startOfDayWIBtoUTC } from '@/lib/timezone';
import {
  autoRenewUserId, emptyMonth, isDefaultRevenueCategory, splitInvoiceTax, summarizeYear,
  type AdjustmentType, type LevyRates, type MonthFigures, type RevenueBasis,
} from '@/lib/regulatory/levy';
import { hasFlag, setFlag } from '@/server/services/app-flag.service';
import { notifyAdmins } from '@/server/services/notifications/event-notices.service';

export interface RegulatorySettings extends LevyRates {
  configured: boolean;
  revenueBasis: RevenueBasis;
  ledgerCategoryIds: string[] | null;
  npwp: string;
  licenseNumber: string;
}

export async function getRegulatorySettings(): Promise<RegulatorySettings> {
  const row = await prisma.regulatorySetting.findUnique({ where: { id: 'default' } });
  return {
    configured: !!row,
    bhpRate: Number(row?.bhpRate ?? 0.5),
    usoRate: Number(row?.usoRate ?? 1.25),
    pphFinalRate: Number(row?.pphFinalRate ?? 0),
    revenueBasis: row?.revenueBasis === 'COLLECTED' ? 'COLLECTED' : 'ISSUED',
    ledgerCategoryIds: Array.isArray(row?.ledgerCategoryIds) ? (row.ledgerCategoryIds as string[]) : null,
    npwp: row?.npwp ?? '',
    licenseNumber: row?.licenseNumber ?? '',
  };
}

const yearBounds = (year: number) => ({ gte: startOfDayWIBtoUTC(`${year}-01-01`), lte: endOfDayWIBtoUTC(`${year}-12-31`) });

/** 0-11 in the company's timezone, so a payment at 00:30 on the 1st lands in the right month. */
const monthIndex = (date: Date) => Number(formatWIB(date, 'M')) - 1;

/**
 * Invoices are the revenue record. Top-ups are money held for later, not revenue:
 * it is counted when the balance pays an invoice. An invoice settled by discount
 * brought in nothing.
 */
async function addInvoiceRevenue(months: MonthFigures[], year: number, basis: RevenueBasis) {
  const range = yearBounds(year);
  const invoices = await prisma.invoice.findMany({
    where: {
      invoiceType: { not: 'TOPUP' },
      ...(basis === 'COLLECTED' ? { status: 'PAID', paidAt: range } : { status: { not: 'CANCELLED' }, createdAt: range }),
    },
    select: { amount: true, taxRate: true, addonAmount: true, createdAt: true, paidAt: true, paymentMethod: true },
  });

  for (const invoice of invoices) {
    if (invoice.paymentMethod === 'discount') continue;
    const { revenue, ppn } = splitInvoiceTax(invoice);
    const month = months[monthIndex(basis === 'COLLECTED' ? invoice.paidAt! : invoice.createdAt)];
    month.invoiceRevenue += revenue;
    month.ppn += ppn;
  }
}

/**
 * Revenue that has no invoice: vouchers, manual income, and a renewal from balance
 * when no invoice was open. Ledger rows that mirror an invoice are skipped, or they
 * would count twice. Those rows use `INV-<number>` or, in older code, the bare number.
 */
async function addLedgerRevenue(months: MonthFigures[], year: number, categoryIds: string[]) {
  const range = yearBounds(year);
  const rows = await prisma.transaction.findMany({
    where: { type: 'INCOME', categoryId: { in: categoryIds }, date: range },
    select: { amount: true, date: true, reference: true },
  });

  const candidates = rows.filter((r) => !r.reference?.startsWith('INV-') && !r.reference?.startsWith('TOPUP-'));
  const references = [...new Set(candidates.map((r) => r.reference).filter((r): r is string => !!r && !r.startsWith('AUTO-RENEW-')))];
  const mirrored = new Set(
    (await prisma.invoice.findMany({ where: { invoiceNumber: { in: references } }, select: { invoiceNumber: true } })).map((i) => i.invoiceNumber),
  );

  const renewalUsers = [...new Set(candidates.map((r) => (r.reference ? autoRenewUserId(r.reference) : null)).filter((id): id is string => !!id))];
  const [paidOnRenewal, users] = await Promise.all([
    prisma.invoice.findMany({ where: { userId: { in: renewalUsers }, paidAt: range }, select: { userId: true, paidAt: true } }),
    prisma.pppoeUser.findMany({ where: { id: { in: renewalUsers } }, select: { id: true, profile: { select: { ppnActive: true, ppnRate: true } } } }),
  ]);
  const paidKeys = new Set(paidOnRenewal.map((i) => `${i.userId}|${i.paidAt!.toISOString().slice(0, 10)}`));
  const ppnRateOf = new Map(users.map((u) => [u.id, u.profile?.ppnActive ? Number(u.profile.ppnRate) : 0]));

  for (const row of candidates) {
    if (row.reference && mirrored.has(row.reference)) continue;
    const userId = row.reference ? autoRenewUserId(row.reference) : null;
    if (userId && paidKeys.has(`${userId}|${row.reference!.slice(-10)}`)) continue;

    // A renewal from balance is charged with PPN but its row does not say how much,
    // so the rate is the customer's current one.
    const { revenue, ppn } = splitInvoiceTax({ amount: row.amount, taxRate: userId ? ppnRateOf.get(userId) : 0 });
    const month = months[monthIndex(row.date)];
    month.ledgerRevenue += revenue;
    month.ppn += ppn;
  }
}

/**
 * A write-off stands only while its invoice is still unpaid: paid or cancelled
 * later, it no longer reduces anything. Under the collected basis an unpaid
 * invoice was never revenue, so there is nothing to reduce.
 */
async function applyAdjustments(months: MonthFigures[], year: number, basis: RevenueBasis) {
  const rows = await prisma.regulatoryAdjustment.findMany({ where: { year }, orderBy: [{ month: 'asc' }, { createdAt: 'asc' }] });
  const numbers = rows.flatMap((r) => (r.invoiceNumber ? [r.invoiceNumber] : []));
  const statusOf = new Map(
    (await prisma.invoice.findMany({ where: { invoiceNumber: { in: numbers } }, select: { invoiceNumber: true, status: true } })).map((i) => [i.invoiceNumber, i.status as string]),
  );

  return rows.map((row) => {
    const month = months[row.month - 1];
    let ignored: string | null = null;
    switch (row.type as AdjustmentType) {
      case 'WRITE_OFF': {
        const status = row.invoiceNumber ? statusOf.get(row.invoiceNumber) : undefined;
        if (basis === 'COLLECTED') ignored = 'Dasar pembayaran diterima tidak menghitung tagihan yang belum dibayar.';
        else if (status === 'PAID') ignored = 'Tagihan ini sudah dibayar.';
        else if (status === 'CANCELLED' || !status) ignored = 'Tagihan ini sudah dibatalkan atau dihapus.';
        else month.writeOff += row.amount;
        break;
      }
      case 'INTERCONNECTION':
        month.interconnection += row.amount;
        break;
      case 'NON_TELECOM':
        month.nonTelecom += row.amount;
        break;
      case 'OTHER_REVENUE':
        month.otherRevenue += row.amount;
        break;
    }
    return { ...row, ignored };
  });
}

export async function buildRegulatoryReport(year: number) {
  const settings = await getRegulatorySettings();
  const months = Array.from({ length: 12 }, (_, i) => emptyMonth(i + 1));

  const [categories, categoryTotals] = await Promise.all([
    prisma.transactionCategory.findMany({ where: { type: 'INCOME' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.transaction.groupBy({ by: ['categoryId'], where: { type: 'INCOME', date: yearBounds(year) }, _sum: { amount: true } }),
  ]);
  const counted = new Set(settings.ledgerCategoryIds ?? categories.filter((c) => isDefaultRevenueCategory(c.name)).map((c) => c.id));

  await addInvoiceRevenue(months, year, settings.revenueBasis);
  await addLedgerRevenue(months, year, [...counted]);
  const adjustments = await applyAdjustments(months, year, settings.revenueBasis);

  const totalOf = new Map(categoryTotals.map((c) => [c.categoryId, Number(c._sum.amount ?? 0)]));
  return {
    year,
    settings,
    ...summarizeYear(months, settings),
    adjustments,
    categories: categories.map((c) => ({ ...c, counted: counted.has(c.id), ledgerAmount: totalOf.get(c.id) ?? 0 })),
  };
}

/**
 * Tells admins in April that last year's BHP and USO are due on the 30th. Runs with
 * the daily reconciliation; a flag per year and stage keeps it to two notices.
 */
export async function remindRegulatoryDeadline(): Promise<void> {
  const today = formatWIB(nowWIB(), 'yyyy-MM-dd');
  const [year, month, day] = today.split('-').map(Number);
  if (month !== 4) return;

  const stage = day >= 23 ? 'final' : 'first';
  const flag = `regulatory-reminder-${year}-${stage}`;
  if (await hasFlag(flag)) return;
  if (!(await getRegulatorySettings()).configured) return;

  const { total } = await buildRegulatoryReport(year - 1);
  const rupiah = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
  await notifyAdmins({
    type: 'regulatory_deadline',
    title: `BHP dan USO ${year - 1} jatuh tempo 30 April`,
    message: `Perkiraan BHP ${rupiah(total.bhp)} dan USO ${rupiah(total.uso)}. Periksa pengurang di halaman Kewajiban BHP & USO sebelum membayar.`,
    link: '/admin/keuangan/kewajiban',
  });
  await setFlag(flag, today);
}
