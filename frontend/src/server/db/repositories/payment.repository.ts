import 'server-only'
/**
 * Payment Repository — Data Access Layer
 *
 * Thin wrapper around Prisma calls for the `payment` model.
 *
 * @module server/db/repositories/payment
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db/client'

export const paymentRepository = {
  findById(id: string) {
    return prisma.payment.findUnique({
      where: { id },
      include: { invoice: true, gateway: true },
    })
  },

  findByInvoice(invoiceId: string) {
    return prisma.payment.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
    })
  },

  findRecent(limit = 10) {
    return prisma.payment.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { invoice: true, gateway: true },
    })
  },

  create(data: Prisma.paymentCreateInput) {
    return prisma.payment.create({ data })
  },

  sumByGateway(gatewayId: string, from?: Date, to?: Date) {
    return prisma.payment.aggregate({
      where: {
        gatewayId,
        ...(from && to && { createdAt: { gte: from, lte: to } }),
      },
      _sum: { amount: true },
      _count: true,
    })
  },

  totalRevenue(from?: Date, to?: Date) {
    return prisma.payment.aggregate({
      where: {
        ...(from && to && { createdAt: { gte: from, lte: to } }),
      },
      _sum: { amount: true },
      _count: true,
    })
  },
}
