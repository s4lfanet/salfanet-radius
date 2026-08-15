import 'server-only'
import { prisma } from '@/server/db/client'
import { Prisma } from '@prisma/client'

/**
 * Payment Attempt Service — Phase 1 Payment Integrity
 *
 * Ensures:
 * - Only one active payment attempt per invoice at a time
 * - DB-level idempotency via unique orderId
 * - Amount validation before settlement
 * - State machine: CREATED → PROCESSING → PENDING → PAID/FAILED/EXPIRED/CANCELLED
 */

/**
 * Create a new payment attempt for an invoice.
 * Atomically cancels any existing active attempts for the same invoice
 * before creating the new one, all within a single transaction.
 *
 * This prevents duplicate active payment attempts under concurrent requests.
 */
export async function createPaymentAttempt(params: {
  invoiceId: string
  orderId: string
  gateway: string
  amount: number
  paymentToken?: string
  paymentUrl?: string
  snapToken?: string
  qrString?: string
}): Promise<{ success: true; attempt: any } | { success: false; error: string }> {
  const { invoiceId, orderId, gateway, amount, paymentToken, paymentUrl, snapToken, qrString } = params

  try {
    const attempt = await prisma.$transaction(async (tx) => {
      // Cancel any existing active attempts for this invoice
      await tx.paymentAttempt.updateMany({
        where: {
          invoiceId,
          status: { in: ['CREATED', 'PROCESSING', 'PENDING'] },
        },
        data: { status: 'CANCELLED' },
      })

      // Create new attempt — orderId unique constraint prevents duplicates
      return await tx.paymentAttempt.create({
        data: {
          invoiceId,
          orderId,
          gateway,
          amount,
          paymentToken,
          paymentUrl,
          snapToken,
          qrString,
          status: 'PENDING',
        },
      })
    })

    return { success: true, attempt }
  } catch (error: any) {
    // P2002 = unique constraint violation on orderId
    if (error?.code === 'P2002') {
      return { success: false, error: 'Duplicate payment attempt — orderId already exists' }
    }
    throw error
  }
}

/**
 * Atomically mark a payment attempt as PAID.
 * Uses updateMany with status condition — only one concurrent webhook
 * will get count > 0 and proceed to settlement.
 *
 * Also validates that gatewayAmount matches expected amount.
 *
 * Returns:
 * - { settled: true } — attempt was successfully marked PAID, proceed with settlement
 * - { settled: false, reason: 'already_paid' } — already processed by concurrent webhook
 * - { settled: false, reason: 'amount_mismatch' } — gateway amount != expected amount
 * - { settled: false, reason: 'not_found' } — attempt not found
 */
export async function settlePaymentAttempt(params: {
  orderId: string
  gatewayAmount?: number
  transactionId?: string
  paidAt?: Date
}): Promise<{ settled: boolean; reason: string; attempt?: any }> {
  const { orderId, gatewayAmount, transactionId, paidAt } = params

  // First, find the attempt to validate amount
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { orderId },
  })

  if (!attempt) {
    return { settled: false, reason: 'not_found' }
  }

  // Amount validation — if gateway provides amount, it must match
  if (gatewayAmount !== undefined && Number.isFinite(gatewayAmount) && gatewayAmount !== attempt.amount) {
    // Flag mismatch but don't settle
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        gatewayAmount,
        mismatchFlagged: true,
        status: 'FAILED',
        errorMessage: `Amount mismatch: expected ${attempt.amount}, got ${gatewayAmount}`,
      },
    })
    console.error(
      `[PaymentAttempt] AMOUNT_MISMATCH for ${orderId}: expected ${attempt.amount}, got ${gatewayAmount}`
    )
    return { settled: false, reason: 'amount_mismatch', attempt }
  }

  // Atomic idempotency guard — only one webhook will get count > 0
  const result = await prisma.paymentAttempt.updateMany({
    where: {
      orderId,
      status: { in: ['CREATED', 'PROCESSING', 'PENDING'] }, // Not yet settled
    },
    data: {
      status: 'PAID',
      gatewayAmount: gatewayAmount ?? attempt.amount,
      transactionId: transactionId || attempt.transactionId,
      paidAt: paidAt || new Date(),
    },
  })

  if (result.count === 0) {
    // Already PAID/FAILED/EXPIRED/CANCELLED — duplicate webhook
    return { settled: false, reason: 'already_paid' }
  }

  const updated = await prisma.paymentAttempt.findUnique({ where: { orderId } })
  return { settled: true, reason: 'settled', attempt: updated }
}

/**
 * Mark a payment attempt as FAILED.
 */
export async function failPaymentAttempt(orderId: string, errorMessage: string): Promise<void> {
  await prisma.paymentAttempt.updateMany({
    where: { orderId, status: { in: ['CREATED', 'PROCESSING', 'PENDING'] } },
    data: { status: 'FAILED', errorMessage },
  })
}

/**
 * Mark expired payment attempts (older than 24 hours) as EXPIRED.
 * Called periodically to clean up stale attempts.
 */
export async function expireStalePaymentAttempts(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
  const result = await prisma.paymentAttempt.updateMany({
    where: {
      status: { in: ['CREATED', 'PROCESSING', 'PENDING'] },
      createdAt: { lt: cutoff },
    },
    data: { status: 'EXPIRED' },
  })
  return result.count
}

/**
 * Find the active payment attempt for an invoice, if any.
 */
export async function getActiveAttemptForInvoice(invoiceId: string) {
  return prisma.paymentAttempt.findFirst({
    where: {
      invoiceId,
      status: { in: ['CREATED', 'PROCESSING', 'PENDING'] },
    },
    orderBy: { createdAt: 'desc' },
  })
}
