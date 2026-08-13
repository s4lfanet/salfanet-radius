/**
 * PPPoE Feature — Zod Schemas
 *
 * Validation schemas for API request bodies and forms related to PPPoE users.
 * Import and use in route handlers or server actions.
 *
 * @module features/pppoe/schemas
 */

import { z } from 'zod'

export const createPppoeUserSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/, 'Username hanya boleh huruf, angka, ., _ atau -'),
  password: z.string().min(6).max(64),
  name: z.string().min(2).max(100),
  phone: z.string().min(8).max(20).regex(/^[0-9+]+$/, 'Nomor HP tidak valid'),
  email: z.string().email().optional().or(z.literal('')),
  profileId: z.string().min(1, 'Pilih paket'),
  areaId: z.string().optional(),
  routerId: z.string().optional(),
  address: z.string().optional(),
  ipAddress: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'IP address tidak valid').optional().or(z.literal('')),
  subscriptionType: z.enum(['PREPAID', 'POSTPAID']).default('POSTPAID'),
  billingDay: z.number().int().min(1).max(31).optional(),
  comment: z.string().max(500).optional(),
  // PSB wizard fields
  odp: z.string().max(100).optional(),
  discount: z.number().int().min(0).optional(),
  discountNote: z.string().max(255).optional(),
  installDate: z.string().optional(),
  connectionType: z.enum(['PPPOE', 'STATIC_IP', 'HOTSPOT']).optional(),
  idCardNumber: z.string().max(50).optional(),
  idCardPhoto: z.string().max(500).optional(),
  installationPhotos: z.array(z.string()).optional(),
  macAddress: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  expiredAt: z.string().optional(),
  registeredAt: z.string().optional(),
  autoIsolationEnabled: z.boolean().optional(),
  followRoad: z.boolean().optional(),
  noPppoeAccount: z.boolean().optional(),
  pppoeCustomerId: z.string().optional(),
  firstInvoice: z.enum(['none', 'prorate', 'full']).optional(),
  createPppSecret: z.boolean().optional(),
})

export const updatePppoeUserSchema = createPppoeUserSchema.partial().omit({ username: true })

export const pppoeUserListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().optional(),
  status: z.enum(['active', 'inactive', 'isolated', 'suspended']).optional(),
  routerId: z.string().optional(),
  areaId: z.string().optional(),
  profileId: z.string().optional(),
})

export const changePasswordSchema = z.object({
  password: z.string().min(6).max(64),
})

export const updateStatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'isolated', 'suspended']),
  reason: z.string().optional(),
})

export type CreatePppoeUserInput = z.infer<typeof createPppoeUserSchema>
export type UpdatePppoeUserInput = z.infer<typeof updatePppoeUserSchema>
export type PppoeUserListQuery = z.infer<typeof pppoeUserListQuerySchema>
