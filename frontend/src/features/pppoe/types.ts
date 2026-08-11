/**
 * PPPoE Feature — Domain Types
 *
 * TypeScript types for the PPPoE feature domain.
 * These extend/alias Prisma types with additional computed/presentation fields.
 *
 * @module features/pppoe/types
 */

import type { Prisma } from '@prisma/client'

// Base type from DB
export type PppoeUser = Prisma.pppoeUserGetPayload<Record<string, never>>

// With common relations
export type PppoeUserFull = Prisma.pppoeUserGetPayload<{
  include: {
    profile: true
    area: true
    router: true
    invoices: { take: 1; orderBy: { createdAt: 'desc' } }
  }
}>

export type PppoeProfile = Prisma.pppoeProfileGetPayload<Record<string, never>>
export type PppoeArea = Prisma.pppoeAreaGetPayload<Record<string, never>>

export type PppoeStatus = 'active' | 'inactive' | 'isolated' | 'suspended'
export type SubscriptionType = 'PREPAID' | 'POSTPAID'

export type PppoeUserListItem = Pick<
  PppoeUser,
  'id' | 'username' | 'name' | 'phone' | 'status' | 'expiredAt' | 'subscriptionType' | 'balance' | 'createdAt'
> & {
  profileName?: string
  areaName?: string
  routerName?: string
}

export type PppoeStats = {
  total: number
  active: number
  inactive: number
  isolated: number
  prepaid: number
  postpaid: number
  expiredToday: number
}
