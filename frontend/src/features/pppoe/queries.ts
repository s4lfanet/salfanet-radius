/**
 * PPPoE Feature — Common Queries
 *
 * Reusable server-side query helpers for PPPoE data.
 * These are thin orchestrators between the repository and the presentation layer.
 *
 * @module features/pppoe/queries
 */

import { pppoeRepository } from '@/server/db/repositories'
import type { PppoeUserListQuery } from './schemas'

export async function getPppoeUsers(params: PppoeUserListQuery) {
  return pppoeRepository.findPaginated(params)
}

export async function getPppoeUser(id: string) {
  return pppoeRepository.findById(id, {
    profile: true,
    area: true,
    router: true,
    invoices: { take: 5, orderBy: { createdAt: 'desc' } },
  })
}

export async function getPppoeStats() {
  const [total, active, inactive, isolated, prepaid, postpaid] = await Promise.all([
    pppoeRepository.count(),
    pppoeRepository.count({ status: 'active' }),
    pppoeRepository.count({ status: 'inactive' }),
    pppoeRepository.count({ status: 'isolated' }),
    pppoeRepository.count({ subscriptionType: 'PREPAID' }),
    pppoeRepository.count({ subscriptionType: 'POSTPAID' }),
  ])

  const now = new Date()
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)

  const expiredToday = await pppoeRepository.count({
    expiredAt: { gte: now, lte: endOfDay },
  })

  return { total, active, inactive, isolated, prepaid, postpaid, expiredToday }
}
