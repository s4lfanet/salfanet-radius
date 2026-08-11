import 'server-only'
/**
 * PPPoE User Repository — Data Access Layer
 *
 * Thin wrapper around Prisma calls for the `pppoeUser` model.
 * Services should call these functions instead of calling prisma directly,
 * keeping query logic in one place.
 *
 * @module server/db/repositories/pppoe
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db/client'

export type PppoeUserWithProfile = Prisma.pppoeUserGetPayload<{
  include: { profile: true; area: true; router: true }
}>

export type PppoeUserListParams = {
  page?: number
  limit?: number
  search?: string
  status?: string
  routerId?: string
  areaId?: string
  profileId?: string
}

export const pppoeRepository = {
  findById(id: string, include?: Prisma.pppoeUserInclude) {
    return prisma.pppoeUser.findUnique({ where: { id }, include })
  },

  findByUsername(username: string) {
    return prisma.pppoeUser.findUnique({ where: { username } })
  },

  findByPhone(phone: string) {
    return prisma.pppoeUser.findFirst({ where: { phone } })
  },

  findByCustomerId(customerId: string) {
    return prisma.pppoeUser.findUnique({ where: { customerId } })
  },

  async findPaginated({ page = 1, limit = 20, search, status, routerId, areaId, profileId }: PppoeUserListParams) {
    const skip = (page - 1) * limit
    const where: Prisma.pppoeUserWhereInput = {
      ...(status && { status }),
      ...(routerId && { routerId }),
      ...(areaId && { areaId }),
      ...(profileId && { profileId }),
      ...(search && {
        OR: [
          { username: { contains: search } },
          { name: { contains: search } },
          { phone: { contains: search } },
        ],
      }),
    }

    const [data, total] = await prisma.$transaction([
      prisma.pppoeUser.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { profile: true, area: true, router: true },
      }),
      prisma.pppoeUser.count({ where }),
    ])

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  },

  findExpired() {
    return prisma.pppoeUser.findMany({
      where: {
        status: 'active',
        expiredAt: { lt: new Date() },
      },
    })
  },

  count(where?: Prisma.pppoeUserWhereInput) {
    return prisma.pppoeUser.count({ where })
  },

  create(data: Prisma.pppoeUserCreateInput) {
    return prisma.pppoeUser.create({ data })
  },

  update(id: string, data: Prisma.pppoeUserUpdateInput) {
    return prisma.pppoeUser.update({ where: { id }, data })
  },

  updateStatus(id: string, status: string) {
    return prisma.pppoeUser.update({ where: { id }, data: { status } })
  },

  delete(id: string) {
    return prisma.pppoeUser.delete({ where: { id } })
  },
}
