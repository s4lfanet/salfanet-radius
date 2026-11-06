import { formatInTimeZone } from 'date-fns-tz';
import { WIB_TIMEZONE, getTimezoneOffsetMs } from '@/lib/timezone';

/**
 * When a customer is due, shared by the invoice_generate cron and the
 * "Generate Tagihan" button so both bill the same way.
 *
 * Dates are true UTC in the DB (lib/timezone.ts). Day boundaries are the
 * company timezone's, so "end of 28 Nov" is 28 Nov 23:59:59 WIB, stored as
 * 28 Nov 16:59:59Z. Building it with Date.UTC(…, 23, 59, 59) instead made
 * every due date display one day late (28 → 29).
 */

export interface YMD {
  year: number;
  month: number; // 1-12
  day: number;
}

/** The calendar date of an instant, in the company timezone. */
export function companyDate(d: Date): YMD {
  const [year, month, day] = formatInTimeZone(d, WIB_TIMEZONE, 'yyyy-MM-dd').split('-').map(Number);
  return { year, month, day };
}

/** End of a company-timezone calendar day, as a true-UTC instant. */
export function endOfCompanyDay({ year, month, day }: YMD): Date {
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - getTimezoneOffsetMs());
}

/** First and last instant of a company-timezone month, as true UTC. */
export function companyMonthRange(year: number, month: number): { start: Date; end: Date } {
  const offset = getTimezoneOffsetMs();
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - offset),
    end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999) - offset),
  };
}

/** Whole calendar days from `from` to `to` (company timezone), e.g. 28 Nov − 3 Okt = 56. */
export function daysBetween(from: YMD, to: YMD): number {
  return Math.round((Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / 86_400_000);
}

/**
 * PREPAID: the bill is the renewal for the period that starts at expiry,
 * so it is due on the expiry date itself — never earlier. A customer paid
 * through 28 Nov owes nothing in October; the 28 Nov renewal is the next
 * bill. (Due = "expiry day-of-month in the current month" billed them for a
 * month they had already paid.)
 */
export function prepaidDueDate(expiredAt: Date): Date {
  return endOfCompanyDay(companyDate(expiredAt));
}

/**
 * Whether the cron should create the PREPAID renewal now: once expiry is
 * within the company's lead time ("Buat tagihan H-N", invoiceGenerateDays),
 * or already passed without a bill.
 */
export function prepaidIsDue(expiredAt: Date, now: Date, leadDays: number): boolean {
  return daysBetween(companyDate(now), companyDate(expiredAt)) <= leadDays;
}

/**
 * POSTPAID customer on DUE_DATE: the isolir date after a payment is the next billing
 * day, whenever they paid. Counted from the invoice's due date when it is paid early,
 * so paying the 5 Nov bill on 1 Nov gives 5 Dec, not 5 Nov. Returns null for everyone
 * else, whose expiry keeps being extended by the package validity.
 */
export function isolirDateAfterPayment(
  user: { subscriptionType?: string | null; postpaidIsolirMode?: string | null; billingDay?: number | null },
  invoiceDueDate: Date | null | undefined,
  now: Date,
): Date | null {
  if (user.subscriptionType !== 'POSTPAID' || user.postpaidIsolirMode !== 'DUE_DATE') return null;
  const from = companyDate(invoiceDueDate && invoiceDueDate > now ? invoiceDueDate : now);
  const thisMonth = postpaidDueDate(from.year, from.month, user.billingDay);
  if (companyDate(thisMonth).day > from.day) return thisMonth;
  return from.month === 12 ? postpaidDueDate(from.year + 1, 1, user.billingDay) : postpaidDueDate(from.year, from.month + 1, user.billingDay);
}

/**
 * Whether a POSTPAID customer with an overdue bill is isolated now. On PAYMENT_DATE the
 * last payment protects them until their isolir date, but only for the bill of the
 * current cycle: a second overdue bill means they are still in arrears.
 */
export function postpaidShouldIsolate(
  user: { postpaidIsolirMode?: string | null; expiredAt?: Date | null },
  overdueBills: number,
  cutoff: Date,
): boolean {
  if (overdueBills === 0) return false;
  if (user.postpaidIsolirMode !== 'PAYMENT_DATE' || overdueBills > 1 || !user.expiredAt) return true;
  return user.expiredAt < cutoff;
}

/** POSTPAID: billing day of the given month, clamped to the month's length. */
export function postpaidDueDate(year: number, month: number, billingDay: number | null | undefined): Date {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return endOfCompanyDay({ year, month, day: Math.min(Math.max(billingDay ?? 1, 1), daysInMonth) });
}
