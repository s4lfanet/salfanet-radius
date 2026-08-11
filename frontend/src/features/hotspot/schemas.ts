/**
 * Hotspot Feature — Zod Schemas
 *
 * @module features/hotspot/schemas
 */

import { z } from 'zod'

export const generateVoucherSchema = z.object({
  profileId: z.string().min(1, 'Pilih profil'),
  routerId: z.string().min(1, 'Pilih router'),
  quantity: z.number().int().min(1).max(25000),
  voucherType: z.enum(['same', 'different']).default('same'),
  codeType: z.enum(['alphanumeric', 'numeric', 'alpha']).default('alphanumeric'),
  codeLength: z.number().int().min(4).max(16).default(8),
})

export const hotspotProfileSchema = z.object({
  name: z.string().min(2).max(100),
  sellingPrice: z.number().int().min(0),
  costPrice: z.number().int().min(0),
  speed: z.string().min(1),
  validityValue: z.number().int().min(1),
  validityUnit: z.enum(['MINUTES', 'HOURS', 'DAYS', 'MONTHS']),
  sharedUsers: z.number().int().min(1).default(1),
  isActive: z.boolean().default(true),
  agentAccess: z.boolean().default(true),
  eVoucherAccess: z.boolean().default(true),
})

export const voucherListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  profileId: z.string().optional(),
  routerId: z.string().optional(),
  agentId: z.string().optional(),
  status: z.enum(['WAITING', 'USED', 'EXPIRED']).optional(),
  batchCode: z.string().optional(),
})

export type GenerateVoucherInput = z.infer<typeof generateVoucherSchema>
export type HotspotProfileInput = z.infer<typeof hotspotProfileSchema>
export type VoucherListQuery = z.infer<typeof voucherListQuerySchema>
