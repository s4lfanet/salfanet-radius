/**
 * Financial Reconciliation Service
 *
 * Daily reconciliation that verifies:
 * 1. Invoice-payment consistency (PAID invoices have payments, amounts match)
 * 2. Duplicate payment detection
 * 3. Orphaned payments (payments without PAID invoice)
 * 4. Negative balance detection
 *
 * Note: The transaction model does not have a userId field, so we cannot
 * directly reconcile user.balance against sum(transactions). Instead, we
 * focus on invoice-payment integrity, which is the most critical financial
 * consistency check. Balance reconciliation would require adding userId
 * to the transaction model (deferred — schema change).
 */
import 'server-only';
import { prisma } from '@/server/db/client';
import { nowWIB } from '@/lib/timezone';

export interface ReconciliationIssue {
  type: 'paid_without_payment' | 'amount_mismatch' | 'orphan_payment' | 'duplicate_payment' | 'negative_balance';
  entityId: string;
  entityLabel: string;
  details: string;
  severity: 'critical' | 'warning';
}

export interface ReconciliationResult {
  success: boolean;
  runAt: Date;
  totalInvoices: number;
  paidInvoices: number;
  totalPayments: number;
  issues: ReconciliationIssue[];
  issueCount: number;
  durationMs: number;
}

export async function runFinancialReconciliation(): Promise<ReconciliationResult> {
  const startedAt = nowWIB();
  const issues: ReconciliationIssue[] = [];

  // ── Check 1: PAID invoices without payment records ──────────────────────
  const paidInvoicesWithoutPayment = await prisma.invoice.findMany({
    where: {
      status: 'PAID',
      payments: { none: {} },
    },
    select: { id: true, invoiceNumber: true, amount: true, userId: true },
    take: 100,
  });

  for (const inv of paidInvoicesWithoutPayment) {
    issues.push({
      type: 'paid_without_payment',
      entityId: inv.id,
      entityLabel: inv.invoiceNumber,
      details: `Invoice ${inv.invoiceNumber} is PAID but has no payment record (amount: ${inv.amount})`,
      severity: 'critical',
    });
  }

  // ── Check 2: Payment amount mismatches ──────────────────────────────────
  const paidInvoices = await prisma.invoice.findMany({
    where: { status: 'PAID' },
    include: { payments: { select: { id: true, amount: true } } },
    take: 5000,
  });

  for (const inv of paidInvoices) {
    const totalPaid = inv.payments.reduce((sum, p) => sum + p.amount, 0);
    if (totalPaid !== inv.amount) {
      issues.push({
        type: 'amount_mismatch',
        entityId: inv.id,
        entityLabel: inv.invoiceNumber,
        details: `Invoice ${inv.invoiceNumber}: invoice amount=${inv.amount}, total payments=${totalPaid}, diff=${inv.amount - totalPaid}`,
        severity: 'critical',
      });
    }
  }

  // ── Check 3: Orphaned payments (payment for non-PAID invoice) ───────────
  const orphanPayments = await prisma.payment.findMany({
    where: {
      invoice: { status: { not: 'PAID' } },
    },
    include: { invoice: { select: { invoiceNumber: true, status: true } } },
    take: 100,
  });

  for (const p of orphanPayments) {
    issues.push({
      type: 'orphan_payment',
      entityId: p.id,
      entityLabel: p.invoice?.invoiceNumber || 'unknown',
      details: `Payment ${p.id} for invoice ${p.invoice?.invoiceNumber} but invoice status is ${p.invoice?.status}`,
      severity: 'warning',
    });
  }

  // ── Check 4: Duplicate payments for same invoice ────────────────────────
  // NOTE: payment.invoiceId has a @unique constraint in the Prisma schema, so
  // duplicates cannot occur at the DB level. This check is a defensive safety
  // net in case the constraint is ever dropped. We avoid the `having` clause
  // because Prisma 6's typing for groupBy `having` with `_count._all` does not
  // type-check (see paymentScalarWhereWithAggregatesInput). Filter in JS instead.
  const paymentCounts = await prisma.payment.groupBy({
    by: ['invoiceId'],
    where: { status: 'PAID' },
    _count: { _all: true },
    orderBy: { _count: { invoiceId: 'desc' } },
    take: 200,
  });
  const duplicatePayments = paymentCounts.filter((d) => d._count._all > 1);

  for (const dup of duplicatePayments) {
    issues.push({
      type: 'duplicate_payment',
      entityId: dup.invoiceId,
      entityLabel: dup.invoiceId,
      details: `Invoice ${dup.invoiceId} has ${dup._count._all} payment records (should be 1)`,
      severity: 'critical',
    });
  }

  // ── Check 5: Users with negative balance ────────────────────────────────
  const negativeBalanceUsers = await prisma.pppoeUser.findMany({
    where: { balance: { lt: 0 } },
    select: { id: true, username: true, balance: true },
    take: 100,
  });

  for (const u of negativeBalanceUsers) {
    issues.push({
      type: 'negative_balance',
      entityId: u.id,
      entityLabel: u.username,
      details: `User ${u.username} has negative balance: ${u.balance}`,
      severity: 'warning',
    });
  }

  const completedAt = nowWIB();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  const result: ReconciliationResult = {
    success: true,
    runAt: startedAt,
    totalInvoices: paidInvoices.length,
    paidInvoices: paidInvoices.length,
    totalPayments: orphanPayments.length,
    issues,
    issueCount: issues.length,
    durationMs,
  };

  // Log summary
  console.log(`[Financial Reconciliation] Completed in ${durationMs}ms — ${issues.length} issues found`);
  if (issues.length > 0) {
    const critical = issues.filter((i) => i.severity === 'critical').length;
    const warnings = issues.filter((i) => i.severity === 'warning').length;
    console.log(`[Financial Reconciliation] ${critical} critical, ${warnings} warnings`);
    for (const issue of issues.slice(0, 10)) {
      console.log(`  [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.details}`);
    }
    if (issues.length > 10) {
      console.log(`  ... and ${issues.length - 10} more issues`);
    }
  }

  return result;
}
