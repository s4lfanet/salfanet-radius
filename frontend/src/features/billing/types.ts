/**
 * Billing Feature — Domain Types
 *
 * @module features/billing/types
 */

import type { Prisma } from '@prisma/client'

export type Invoice = Prisma.invoiceGetPayload<Record<string, never>>
export type Payment = Prisma.paymentGetPayload<Record<string, never>>

export type InvoiceStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'OVERDUE'
export type InvoiceType = 'MONTHLY' | 'INSTALLATION' | 'ADDON' | 'TOPUP' | 'RENEWAL'

export type InvoiceWithUser = Prisma.invoiceGetPayload<{
  include: { user: true; payments: true }
}>

export type PaymentWithGateway = Prisma.paymentGetPayload<{
  include: { gateway: true; invoice: true }
}>

export type RevenueSummary = {
  total: number
  count: number
  period: string
}

export type InvoiceStats = {
  totalPending: number
  totalPaid: number
  totalOverdue: number
  pendingAmount: number
  paidAmount: number
}
