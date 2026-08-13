/**
 * Agents Feature — Zod Schemas
 *
 * @module features/agents/schemas
 */

import { z } from 'zod'

export const createAgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(100),
  phone: z.string().min(8).max(20).regex(/^[0-9+]+$/, 'Nomor HP tidak valid'),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  routerId: z.string().optional(),
  minBalance: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

export const updateAgentSchema = createAgentSchema.partial().omit({ id: true })

export const agentDepositSchema = z.object({
  agentId: z.string().min(1),
  amount: z.number().int().min(1),
  notes: z.string().max(500).optional(),
  method: z.string().optional(),
})

export const agentDepositCreateSchema = z.object({
  agentId: z.string().min(1),
  amount: z.number().int().min(10000, 'Minimum deposit amount is Rp 10.000'),
  gateway: z.string().min(1),
  paymentMethod: z.string().optional(),
})

export const generateVoucherSchema = z.object({
  agentId: z.string().min(1),
  profileId: z.string().min(1),
  quantity: z.number().int().min(1).max(500).default(1),
  codeLength: z.number().int().min(4).max(32).default(6),
  codeType: z.enum(['alpha-upper', 'alpha-lower', 'numeric', 'alphanumeric-upper']).default('alpha-upper'),
  prefix: z.string().max(10).regex(/^[A-Za-z0-9_-]*$/, 'Karakter tidak valid').default(''),
})

export const agentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  routerId: z.string().optional(),
})

export type CreateAgentInput = z.infer<typeof createAgentSchema>
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>
export type AgentDepositInput = z.infer<typeof agentDepositSchema>
export type AgentListQuery = z.infer<typeof agentListQuerySchema>
