import 'server-only'
/**
 * Invoice Repository — Data Access Layer
 *
 * Thin wrapper around Prisma calls for the `invoice` model.
 *
 * @module server/db/repositories/invoice
 */

import { Prisma, invoices_status, InvoiceType } from '@prisma/client'
import { prisma } from '@/server/db/client'

export type InvoiceListParams = {
  page?: number
  limit?: number
  userId?: string
  status?: string
  invoiceType?: string
}

export const invoiceRepository = {
  findById(id: string, include?: Prisma.invoiceInclude) {
    return prisma.invoice.findUnique({ where: { id }, include })
  },

  findByInvoiceNumber(invoiceNumber: string) {
    return prisma.invoice.findUnique({ where: { invoiceNumber } })
  },

  findByPaymentToken(paymentToken: string) {
    return prisma.invoice.findUnique({ where: { paymentToken } })
  },

  findByUser(userId: string) {
    return prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
  },

  async findPaginated({ page = 1, limit = 20, userId, status, invoiceType }: InvoiceListParams) {
    const skip = (page - 1) * limit
    const where: Prisma.invoiceWhereInput = {
      ...(userId && { userId }),
      ...(status && { status: status as invoices_status }),
      ...(invoiceType && { invoiceType: invoiceType as InvoiceType }),
    }

    const [data, total] = await prisma.$transaction([
      prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: true, payments: true },
      }),
      prisma.invoice.count({ where }),
    ])

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  },

  findPending() {
    return prisma.invoice.findMany({
      where: { status: 'PENDING' },
      orderBy: { dueDate: 'asc' },
    })
  },

  findOverdue(before: Date) {
    return prisma.invoice.findMany({
      where: { status: 'PENDING', dueDate: { lt: before } },
    })
  },

  count(where?: Prisma.invoiceWhereInput) {
    return prisma.invoice.count({ where })
  },

  create(data: Prisma.invoiceCreateInput) {
    return prisma.invoice.create({ data })
  },

  update(id: string, data: Prisma.invoiceUpdateInput) {
    return prisma.invoice.update({ where: { id }, data })
  },

  markPaid(id: string, paidAt: Date = new Date()) {
    return prisma.invoice.update({
      where: { id },
      data: { status: 'PAID', paidAt },
    })
  },
}
