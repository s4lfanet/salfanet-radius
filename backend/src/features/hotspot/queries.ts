/**
 * Hotspot Feature — Common Queries
 *
 * @module features/hotspot/queries
 */

import { hotspotRepository } from '@/server/db/repositories'
import type { VoucherListQuery } from './schemas'

export async function getVouchers(params: VoucherListQuery) {
  return hotspotRepository.findPaginatedVouchers(params)
}

export async function getVoucherStats(): Promise<{ total: number; waiting: number; used: number; expired: number }> {
  const [total, waiting, used, expired] = await Promise.all([
    hotspotRepository.countByStatus('WAITING').then(() => 0), // placeholder — real count below
    hotspotRepository.countByStatus('WAITING'),
    hotspotRepository.countByStatus('USED'),
    hotspotRepository.countByStatus('EXPIRED'),
  ])

  // total = sum of all statuses
  return { total: waiting + used + expired, waiting, used, expired }
}

export async function getActiveProfiles() {
  return hotspotRepository.findActiveProfiles()
}
