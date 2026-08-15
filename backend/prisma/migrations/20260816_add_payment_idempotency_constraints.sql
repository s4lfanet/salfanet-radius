-- Payment idempotency: unique constraint on payments.invoiceId
-- Ensures one invoice = one payment record at the database level.
-- Defense-in-depth alongside the transaction-level updateMany guard.
-- Safe to apply even if duplicate payments exist: run cleanup first if needed.

-- Check for duplicate payments before applying unique constraint
-- If duplicates exist, this migration will fail (intentional — clean up first)
ALTER TABLE `payments` ADD UNIQUE INDEX `idx_payments_invoiceId_unique` (`invoiceId`);
