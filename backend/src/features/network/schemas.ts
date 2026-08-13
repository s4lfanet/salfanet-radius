/**
 * Network Feature — Zod Schemas
 *
 * @module features/network/schemas
 */

import { z } from 'zod'

export const routerSchema = z.object({
  name: z.string().min(2).max(100),
  nasname: z.string().min(1, 'NAS IP diperlukan'),
  shortname: z.string().min(1),
  ipAddress: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'IP address tidak valid'),
  username: z.string().min(1),
  password: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(8728),
  apiPort: z.number().int().min(1).max(65535).default(8729),
  secret: z.string().min(1).default('secret123'),
  ports: z.number().int().default(1812),
  type: z.string().default('mikrotik'),
  isActive: z.boolean().default(true),
  description: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  vpnClientId: z.string().optional(),
})

export const vpnServerSchema = z.object({
  name: z.string().min(2).max(100),
  host: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  apiPort: z.number().int().min(1).max(65535).default(8728),
  subnet: z.string().min(1),
  isActive: z.boolean().default(true),
})

export type RouterInput = z.infer<typeof routerSchema>
export type VpnServerInput = z.infer<typeof vpnServerSchema>
