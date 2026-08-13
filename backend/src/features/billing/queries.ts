/**
 * Billing Feature — Common Queries
 *
 * @module features/billing/queries
 */

import { invoiceRepository, paymentRepository } from '@/server/db/repositories'
import type { InvoiceListQuery } from './schemas'

export async function getInvoices(params: InvoiceListQuery) {
  return invoiceRepository.findPaginated(params)
}

export async function getInvoice(id: string) {
  return invoiceRepository.findById(id, { user: true, payments: true, manualPayments: true })
}

export async function getRecentPayments(limit = 10) {
  return paymentRepository.findRecent(limit)
}

export async function getRevenueSummary(from: Date, to: Date) {
  return paymentRepository.totalRevenue(from, to)
}

export async function getInvoiceStats() {
  const [pending, paid] = await Promise.all([
    invoiceRepository.count({ status: 'PENDING' }),
    invoiceRepository.count({ status: 'PAID' }),
  ])

  const now = new Date()
  const overdue = await invoiceRepository.count({
    status: 'PENDING',
    dueDate: { lt: now },
  })

  return { pending, paid, overdue }
}
