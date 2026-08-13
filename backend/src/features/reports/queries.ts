/**
 * Reports Feature — Common Queries
 *
 * Reusable data-fetching functions for reports and analytics.
 *
 * @module features/reports/queries
 */

import { prisma } from '@/server/db/client'
import { paymentRepository } from '@/server/db/repositories'

/** Get revenue totals grouped by month for the past N months */
export async function getMonthlyRevenue(months = 12) {
  const from = new Date()
  from.setMonth(from.getMonth() - months)

  const payments = await prisma.payment.findMany({
    where: { createdAt: { gte: from } },
    select: { amount: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  // Group by YYYY-MM
  const grouped: Record<string, number> = {}
  for (const p of payments) {
    const key = p.createdAt.toISOString().slice(0, 7)
    grouped[key] = (grouped[key] ?? 0) + p.amount
  }

  return Object.entries(grouped).map(([month, total]) => ({ month, total }))
}

/** Count active/inactive/isolated users over time */
export async function getUserGrowth(days = 30) {
  const from = new Date()
  from.setDate(from.getDate() - days)

  const users = await prisma.pppoeUser.findMany({
    where: { createdAt: { gte: from } },
    select: { createdAt: true, status: true },
    orderBy: { createdAt: 'asc' },
  })

  const grouped: Record<string, number> = {}
  for (const u of users) {
    const key = u.createdAt.toISOString().slice(0, 10)
    grouped[key] = (grouped[key] ?? 0) + 1
  }

  return Object.entries(grouped).map(([date, count]) => ({ date, count }))
}

/** Get top agents by sales count */
export async function getTopAgents(limit = 10) {
  return prisma.agentSale.groupBy({
    by: ['agentId'],
    _count: { id: true },
    _sum: { amount: true },
    orderBy: { _count: { id: 'desc' } },
    take: limit,
  })
}

/** Get invoice summary per status */
export async function getInvoiceSummary() {
  return prisma.invoice.groupBy({
    by: ['status'],
    _count: { id: true },
    _sum: { amount: true },
  })
}

/** Get payment gateway usage stats */
export async function getGatewayStats(from?: Date, to?: Date) {
  const where = from && to ? { createdAt: { gte: from, lte: to } } : {}
  return prisma.payment.groupBy({
    by: ['gatewayId'],
    where,
    _count: { id: true },
    _sum: { amount: true },
  })
}
