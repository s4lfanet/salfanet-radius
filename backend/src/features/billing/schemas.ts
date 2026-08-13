/**
 * Billing Feature — Zod Schemas
 *
 * @module features/billing/schemas
 */

import { z } from 'zod'

export const createInvoiceSchema = z.object({
  userId: z.string().optional(),
  amount: z.number().int().min(1),
  dueDate: z.string().datetime().or(z.date()),
  invoiceType: z.enum(['MONTHLY', 'INSTALLATION', 'ADDON', 'TOPUP', 'RENEWAL']).default('MONTHLY'),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email().optional(),
  customerUsername: z.string().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  additionalFees: z.array(z.object({
    name: z.string(),
    amount: z.number().int(),
  })).optional(),
})

export const invoiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  userId: z.string().optional(),
  status: z.enum(['PENDING', 'PAID', 'CANCELLED', 'OVERDUE']).optional(),
  invoiceType: z.enum(['MONTHLY', 'INSTALLATION', 'ADDON', 'TOPUP', 'RENEWAL']).optional(),
})

export const manualPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().int().min(1),
  method: z.string().min(1),
  proofUrl: z.string().url().optional(),
  notes: z.string().max(500).optional(),
})

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>
export type ManualPaymentInput = z.infer<typeof manualPaymentSchema>
