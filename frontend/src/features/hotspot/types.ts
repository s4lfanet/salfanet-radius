/**
 * Hotspot Feature — Domain Types
 *
 * @module features/hotspot/types
 */

import type { Prisma } from '@prisma/client'

export type HotspotVoucher = Prisma.hotspotVoucherGetPayload<Record<string, never>>
export type HotspotProfile = Prisma.hotspotProfileGetPayload<Record<string, never>>

export type VoucherStatus = 'WAITING' | 'USED' | 'EXPIRED'

export type VoucherWithProfile = Prisma.hotspotVoucherGetPayload<{
  include: { profile: true; router: true }
}>

export type VoucherStats = {
  total: number
  waiting: number
  used: number
  expired: number
}

export type BatchInfo = {
  batchCode: string
  profileId: string
  profileName: string
  total: number
  waiting: number
  used: number
  createdAt: Date
}
