import 'server-only'
/**
 * Hotspot Repository — Data Access Layer
 *
 * Thin wrapper around Prisma calls for `hotspotVoucher` and `hotspotProfile`.
 *
 * @module server/db/repositories/hotspot
 */

import { Prisma, hotspot_vouchers_status } from '@prisma/client'
import { prisma } from '@/server/db/client'

export type VoucherListParams = {
  page?: number
  limit?: number
  profileId?: string
  routerId?: string
  agentId?: string
  status?: string
  batchCode?: string
}

export const hotspotRepository = {
  // ----- Profiles -----
  findProfileById(id: string) {
    return prisma.hotspotProfile.findUnique({ where: { id } })
  },

  findActiveProfiles() {
    return prisma.hotspotProfile.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    })
  },

  findAllProfiles() {
    return prisma.hotspotProfile.findMany({ orderBy: { name: 'asc' } })
  },

  // ----- Vouchers -----
  findVoucherById(id: string) {
    return prisma.hotspotVoucher.findUnique({
      where: { id },
      include: { profile: true, router: true },
    })
  },

  findVoucherByCode(code: string) {
    return prisma.hotspotVoucher.findUnique({ where: { code } })
  },

  findVouchersByBatch(batchCode: string) {
    return prisma.hotspotVoucher.findMany({ where: { batchCode } })
  },

  async findPaginatedVouchers({ page = 1, limit = 20, profileId, routerId, agentId, status, batchCode }: VoucherListParams) {
    const skip = (page - 1) * limit
    const where: Prisma.hotspotVoucherWhereInput = {
      ...(profileId && { profileId }),
      ...(routerId && { routerId }),
      ...(agentId && { agentId }),
      ...(status && { status: status as hotspot_vouchers_status }),
      ...(batchCode && { batchCode }),
    }

    const [data, total] = await prisma.$transaction([
      prisma.hotspotVoucher.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { profile: true },
      }),
      prisma.hotspotVoucher.count({ where }),
    ])

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  },

  updateVoucher(id: string, data: Prisma.hotspotVoucherUpdateInput) {
    return prisma.hotspotVoucher.update({ where: { id }, data })
  },

  deleteVoucher(id: string) {
    return prisma.hotspotVoucher.delete({ where: { id } })
  },

  countByStatus(status: string) {
    return prisma.hotspotVoucher.count({ where: { status: status as hotspot_vouchers_status } })
  },
}
