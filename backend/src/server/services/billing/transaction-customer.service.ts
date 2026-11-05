/**
 * Links Riwayat Transaksi rows to the customer behind them.
 *
 * `transactions` was written by many flows that only stored a text
 * `reference`. This resolves that reference once and stores the customer in
 * `pppoe_user_id`, so filters and grouping by installer are plain indexed
 * relations instead of string matching on every page load.
 *
 * Reference formats seen in the code (invoice numbers are themselves
 * `INV-YYYYMMDD-XXXXXX` or `TOPUP-<ms>-<n>`):
 *   INV-<invoiceNumber>          gateway, invoice page, collector, admin
 *   <invoiceNumber>              extend, older admin mark-paid
 *   TOPUP-<invoiceNumber>        top-up paid through a gateway
 *   TOPUP-<userId>-<ms>          top-up request
 *   AUTO-RENEW-<userId>-<date>   renewal from balance
 * Anything else (vouchers, agent deposits, referral, manual entries) has no
 * customer and stays null.
 */
import { prisma } from '@/server/db/client';

/**
 * Resolves every row not looked at yet. Cheap when there is nothing new
 * (indexed `customer_linked_at IS NULL`), so callers run it before reading.
 * A row that finds no customer is only written off (stamped) once it is more
 * than 10 minutes old, so one written just before its invoice is visible gets
 * another chance. Returns the number of rows looked at.
 */
export async function linkTransactionCustomers(): Promise<number> {
  return prisma.$executeRaw`
    UPDATE transactions t
    LEFT JOIN invoices i
      ON i.invoiceNumber IN (
        t.reference,
        CASE WHEN t.reference LIKE 'INV-%' THEN SUBSTRING(t.reference, 5) END,
        CASE WHEN t.reference LIKE 'TOPUP-%' THEN SUBSTRING(t.reference, 7) END
      )
    LEFT JOIN pppoe_users u
      ON u.id = COALESCE(
        i.userId,
        CASE
          WHEN t.reference LIKE 'AUTO-RENEW-%' THEN SUBSTRING(t.reference, 12, 36)
          WHEN t.reference LIKE 'TOPUP-%' THEN SUBSTRING(t.reference, 7, 36)
        END
      )
    SET t.pppoe_user_id = u.id,
        t.customer_linked_at = CASE
          WHEN u.id IS NOT NULL OR t.createdAt < UTC_TIMESTAMP(3) - INTERVAL 10 MINUTE THEN NOW(3)
        END
    WHERE t.customer_linked_at IS NULL
  `;
}

/** Same as linkTransactionCustomers but never throws: a failed link only means fewer rows are grouped. */
export async function linkTransactionCustomersSafe(): Promise<void> {
  try {
    await linkTransactionCustomers();
  } catch (e) {
    console.error('[transactions] linking customers failed:', e);
  }
}
