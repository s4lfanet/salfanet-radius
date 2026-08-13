import 'server-only'
/**
 * Agent Repository — Data Access Layer
 *
 * Thin wrapper around Prisma calls for the `agent`, `agentSale`, `agentDeposit` models.
 *
 * @module server/db/repositories/agent
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db/client'

export const agentRepository = {
  findById(id: string, include?: Prisma.agentInclude) {
    return prisma.agent.findUnique({ where: { id }, include })
  },

  findByPhone(phone: string) {
    return prisma.agent.findUnique({ where: { phone } })
  },

  findAll(includeInactive = false) {
    return prisma.agent.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    })
  },

  findActive() {
    return prisma.agent.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    })
  },

  create(data: Prisma.agentCreateInput) {
    return prisma.agent.create({ data })
  },

  update(id: string, data: Prisma.agentUpdateInput) {
    return prisma.agent.update({ where: { id }, data })
  },

  adjustBalance(id: string, delta: number) {
    return prisma.agent.update({
      where: { id },
      data: { balance: { increment: delta } },
    })
  },

  delete(id: string) {
    return prisma.agent.delete({ where: { id } })
  },

  // ----- Deposits -----
  findDeposits(agentId: string) {
    return prisma.agentDeposit.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
    })
  },

  createDeposit(data: Prisma.agentDepositCreateInput) {
    return prisma.agentDeposit.create({ data })
  },

  // ----- Sales -----
  findSales(agentId: string, from?: Date, to?: Date) {
    return prisma.agentSale.findMany({
      where: {
        agentId,
        ...(from && to && { createdAt: { gte: from, lte: to } }),
      },
      orderBy: { createdAt: 'desc' },
    })
  },
}
