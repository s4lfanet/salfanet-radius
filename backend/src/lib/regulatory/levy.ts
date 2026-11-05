/**
 * BHP Telekomunikasi and USO arithmetic, free of database access.
 *
 * Both are a percentage of gross telecom revenue, without PPN, less receivables
 * written off and interconnection owed to other operators (PP 43/2023, Permen
 * Kominfo 5/2021). They are the ISP's own cost and never go on a customer invoice.
 */

export type RevenueBasis = 'ISSUED' | 'COLLECTED';
export type AdjustmentType = 'WRITE_OFF' | 'INTERCONNECTION' | 'NON_TELECOM' | 'OTHER_REVENUE';

export const ADJUSTMENT_TYPES: AdjustmentType[] = ['WRITE_OFF', 'INTERCONNECTION', 'NON_TELECOM', 'OTHER_REVENUE'];

export interface LevyRates {
  bhpRate: number;
  usoRate: number;
  pphFinalRate: number;
}

/**
 * Splits a billed amount into revenue and PPN. Addons are added after tax when an
 * invoice is generated, so they carry no PPN and must stay out of the division.
 */
export function splitInvoiceTax(invoice: { amount: number; taxRate?: unknown; addonAmount?: number | null }) {
  const rate = Number(invoice.taxRate ?? 0);
  if (!(rate > 0)) return { revenue: invoice.amount, ppn: 0 };
  const addon = Math.min(invoice.addonAmount ?? 0, invoice.amount);
  const taxed = invoice.amount - addon;
  const untaxed = Math.round((taxed * 100) / (100 + rate));
  return { revenue: untaxed + addon, ppn: taxed - untaxed };
}

export interface MonthFigures {
  month: number;
  invoiceRevenue: number;
  ledgerRevenue: number;
  otherRevenue: number;
  ppn: number;
  writeOff: number;
  interconnection: number;
  nonTelecom: number;
}

export const emptyMonth = (month: number): MonthFigures => ({
  month,
  invoiceRevenue: 0,
  ledgerRevenue: 0,
  otherRevenue: 0,
  ppn: 0,
  writeOff: 0,
  interconnection: 0,
  nonTelecom: 0,
});

function withLevies<T extends Omit<MonthFigures, 'month'>>(row: T, rates: LevyRates, floorAtZero: boolean) {
  const gross = row.invoiceRevenue + row.ledgerRevenue + row.otherRevenue;
  const net = gross - row.writeOff - row.interconnection - row.nonTelecom;
  const base = floorAtZero ? Math.max(0, net) : net;
  const pct = (amount: number, rate: number) => Math.round((amount * rate) / 100);
  return {
    ...row,
    gross,
    base,
    bhp: pct(base, rates.bhpRate),
    uso: pct(base, rates.usoRate),
    pphFinal: pct(gross, rates.pphFinalRate),
  };
}

/**
 * The payable amount comes from the year's total base, so it can differ by a few
 * rupiah from the sum of the monthly rows. A month can go negative when a large
 * write-off lands in it; the year cannot.
 */
export function summarizeYear(months: MonthFigures[], rates: LevyRates) {
  const total = months.reduce(
    (sum, m) => ({
      invoiceRevenue: sum.invoiceRevenue + m.invoiceRevenue,
      ledgerRevenue: sum.ledgerRevenue + m.ledgerRevenue,
      otherRevenue: sum.otherRevenue + m.otherRevenue,
      ppn: sum.ppn + m.ppn,
      writeOff: sum.writeOff + m.writeOff,
      interconnection: sum.interconnection + m.interconnection,
      nonTelecom: sum.nonTelecom + m.nonTelecom,
    }),
    { invoiceRevenue: 0, ledgerRevenue: 0, otherRevenue: 0, ppn: 0, writeOff: 0, interconnection: 0, nonTelecom: 0 },
  );
  return {
    months: months.map((m) => withLevies(m, rates, false)),
    total: withLevies(total, rates, true),
  };
}

/** Income categories that are revenue when an admin has not chosen yet. */
export function isDefaultRevenueCategory(name: string): boolean {
  if (/deposit|top.?up|referral|reward/i.test(name)) return false;
  return /pppoe|hotspot|voucher|subscription|instalasi/i.test(name);
}

/** Customer of an `AUTO-RENEW-<userId>-<yyyy-mm-dd>` ledger reference. */
export function autoRenewUserId(reference: string): string | null {
  const match = /^AUTO-RENEW-(.+)-(\d{4}-\d{2}-\d{2})$/.exec(reference);
  return match ? match[1] : null;
}
