import type { Prisma } from '@prisma/client';
import type { prisma } from '@/server/db/client';
import { expiryAfterPayment } from '@/server/services/billing/invoice-schedule';

/** A prisma client or a transaction client: only invoice reads are needed. */
type Db = Prisma.TransactionClient | typeof prisma;

const DAY_MS = 86_400_000;

/**
 * A new customer is created with the first period already running: the
 * expiry is set to registration + one period, and that is what the first
 * invoice pays for. Extending from that date on the first payment gave
 * 21 Nov → 21 Jan instead of 21 Dec.
 *
 * True when this invoice is the customer's first one (nothing earlier, nothing
 * paid yet) and was raised with the registration, so paying it must keep the
 * expiry the customer was created with.
 */
export async function isFirstPeriodInvoice(
  db: Db,
  invoiceId: string,
  user: { id: string; createdAt: Date; expiredAt: Date | null },
  now: Date,
): Promise<boolean> {
  if (!user.expiredAt || user.expiredAt <= now) return false;
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, userId: true, invoiceType: true, createdAt: true },
  });
  if (!invoice || invoice.userId !== user.id) return false;

  const others = await db.invoice.count({
    where: {
      userId: user.id,
      id: { not: invoice.id },
      OR: [{ status: 'PAID' }, { createdAt: { lt: invoice.createdAt } }],
    },
  });
  if (others > 0) return false;

  if (invoice.invoiceType === 'INSTALLATION') return true;
  // The PSB form's first invoice is a MONTHLY one made in the same moment as the
  // customer. A later renewal of an imported customer must still extend.
  return Math.abs(invoice.createdAt.getTime() - user.createdAt.getTime()) <= DAY_MS;
}

/** The expiry a paid invoice gives: unchanged for a first-period invoice, extended otherwise. */
export async function expiryForInvoicePayment(
  db: Db,
  user: { id: string; createdAt: Date; expiredAt: Date | null; subscriptionType: string; postpaidIsolirMode: string; billingDay: number | null },
  invoiceId: string,
  invoiceDueDate: Date | null | undefined,
  validity: { validityUnit: string; validityValue: number },
  now: Date,
): Promise<Date> {
  if (await isFirstPeriodInvoice(db, invoiceId, user, now)) return user.expiredAt as Date;
  return expiryAfterPayment(user, validity, invoiceDueDate, now);
}
