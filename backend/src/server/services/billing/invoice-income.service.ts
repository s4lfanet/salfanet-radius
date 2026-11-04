/**
 * Ledger entry (Riwayat Transaksi / keuangan) for a paid PPPoE invoice.
 *
 * Every way an invoice gets paid must leave one INCOME row in `transactions`,
 * or the money never shows up in Riwayat Transaksi and its totals. The
 * gateway webhook and the invoice page already wrote one; the collector's
 * mark-paid did not, so cash a collector took was missing from the ledger.
 *
 * Reference is `INV-<invoiceNumber>` (what the webhook and invoice page use).
 * Older code wrote the bare invoice number, so both are treated as "exists".
 */
import { nanoid } from 'nanoid';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';

type Db = Prisma.TransactionClient | typeof prisma;

export const PPPOE_INCOME_CATEGORY = 'Pembayaran PPPoE';

export const invoiceReference = (invoiceNumber: string) => `INV-${invoiceNumber}`;

const referencesOf = (invoiceNumber: string) => [invoiceReference(invoiceNumber), invoiceNumber];

async function pppoeIncomeCategoryId(db: Db): Promise<string> {
  const found = await db.transactionCategory.findFirst({
    where: { name: PPPOE_INCOME_CATEGORY, type: 'INCOME' },
    select: { id: true },
  });
  if (found) return found.id;
  const created = await db.transactionCategory.create({
    data: {
      id: 'cat-income-pppoe',
      name: PPPOE_INCOME_CATEGORY,
      type: 'INCOME',
      description: 'Pendapatan dari pembayaran pelanggan PPPoE bulanan',
    },
    select: { id: true },
  });
  return created.id;
}

export interface InvoiceIncome {
  invoiceNumber: string;
  amount: number;
  customerName: string;
  profileName?: string | null;
  notes: string;
  date?: Date;
  createdBy?: string | null;
}

/** Writes the ledger row once per invoice. Returns false when it already existed. */
export async function recordInvoiceIncome(db: Db, income: InvoiceIncome): Promise<boolean> {
  const existing = await db.transaction.findFirst({
    where: { reference: { in: referencesOf(income.invoiceNumber) } },
    select: { id: true },
  });
  if (existing) return false;

  await db.transaction.create({
    data: {
      id: nanoid(),
      categoryId: await pppoeIncomeCategoryId(db),
      type: 'INCOME',
      amount: income.amount,
      description: `Pembayaran ${income.profileName || 'PPPoE'} - ${income.customerName}`,
      date: income.date ?? new Date(),
      reference: invoiceReference(income.invoiceNumber),
      notes: income.notes,
      createdBy: income.createdBy ?? null,
    },
  });
  return true;
}

/** Removes the ledger row when a payment is taken back (e.g. rejected transfer proof). */
export async function removeInvoiceIncome(db: Db, invoiceNumber: string): Promise<number> {
  const { count } = await db.transaction.deleteMany({
    where: { reference: { in: referencesOf(invoiceNumber) }, type: 'INCOME' },
  });
  return count;
}
