/**
 * Shared Zod Base Types & Validators
 *
 * Common reusable Zod schemas used across multiple features.
 * Import from here to stay consistent across the codebase.
 *
 * @module lib/validators
 */

import { z } from 'zod'

// ----- Primitives -----
export const idSchema = z.string().min(1, 'ID diperlukan')

export const phoneSchema = z
  .string()
  .min(8, 'Nomor HP minimal 8 digit')
  .max(20, 'Nomor HP terlalu panjang')
  .regex(/^[0-9+]+$/, 'Nomor HP hanya boleh angka dan tanda +')

export const emailSchema = z.string().email('Email tidak valid').optional().or(z.literal(''))

export const passwordSchema = z.string().min(6, 'Password minimal 6 karakter').max(64, 'Password terlalu panjang')

export const dateRangeSchema = z.object({
  from: z.string().datetime().or(z.date()),
  to: z.string().datetime().or(z.date()),
})

// ----- Pagination -----
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
})

// ----- Common search -----
export const searchQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
})

// ----- Helpers -----
/** Strip empty string values → undefined (useful for optional fields) */
export function emptyStringToUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((val) => (val === '' ? undefined : val), schema)
}

export type PaginationParams = z.infer<typeof paginationSchema>
export type DateRangeParams = z.infer<typeof dateRangeSchema>
export type SearchQueryParams = z.infer<typeof searchQuerySchema>
