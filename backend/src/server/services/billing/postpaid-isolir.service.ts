import 'server-only';
import type { PostpaidIsolirMode, Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { isolirDateAfterPayment } from '@/server/services/billing/invoice-schedule';

export const isIsolirMode = (value: unknown): value is PostpaidIsolirMode => value === 'DUE_DATE' || value === 'PAYMENT_DATE';

/** The mode a new customer gets when nobody chose one: the company's setting. */
export async function defaultPostpaidIsolirMode(): Promise<PostpaidIsolirMode> {
  const company = await prisma.company.findFirst({ select: { postpaidIsolirMode: true } });
  return company?.postpaidIsolirMode ?? 'DUE_DATE';
}

/**
 * Puts the isolir date of DUE_DATE customers on their next billing day. Customers
 * sharing a billing day share the date, so this is at most 28 updates.
 */
export async function syncDueDateIsolir(scope: Prisma.pppoeUserWhereInput = {}): Promise<void> {
  const where: Prisma.pppoeUserWhereInput = { ...scope, subscriptionType: 'POSTPAID', postpaidIsolirMode: 'DUE_DATE' };
  const groups = await prisma.pppoeUser.groupBy({ by: ['billingDay'], where });
  const now = new Date();

  for (const { billingDay } of groups) {
    const expiredAt = isolirDateAfterPayment({ subscriptionType: 'POSTPAID', postpaidIsolirMode: 'DUE_DATE', billingDay }, null, now);
    if (expiredAt) await prisma.pppoeUser.updateMany({ where: { ...where, billingDay }, data: { expiredAt } });
  }
}

/** Moves POSTPAID customers to a mode. Returns how many were changed. */
export async function applyPostpaidIsolirMode(mode: PostpaidIsolirMode, scope: Prisma.pppoeUserWhereInput = {}): Promise<number> {
  const { count } = await prisma.pppoeUser.updateMany({
    where: { ...scope, subscriptionType: 'POSTPAID' },
    data: { postpaidIsolirMode: mode },
  });
  if (mode === 'DUE_DATE') await syncDueDateIsolir(scope);
  return count;
}
