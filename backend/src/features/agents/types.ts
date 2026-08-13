/**
 * Agents Feature — Domain Types
 *
 * @module features/agents/types
 */

import type { Prisma } from '@prisma/client'

export type Agent = Prisma.agentGetPayload<Record<string, never>>
export type AgentDeposit = Prisma.agentDepositGetPayload<Record<string, never>>
export type AgentSale = Prisma.agentSaleGetPayload<Record<string, never>>

export type AgentWithStats = Agent & {
  totalSales: number
  totalDeposits: number
  voucherCount: number
}

export type AgentStats = {
  totalAgents: number
  activeAgents: number
  totalBalance: number
}
