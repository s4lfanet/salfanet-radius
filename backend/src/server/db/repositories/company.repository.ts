import 'server-only'
/**
 * Company Repository — Data Access Layer
 *
 * Thin wrapper around Prisma calls for the `company` model.
 * There is always exactly ONE company record (single-tenant).
 *
 * @module server/db/repositories/company
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db/client'

export const companyRepository = {
  /** Returns the single company record, or null if not seeded yet. */
  getFirst() {
    return prisma.company.findFirst()
  },

  /** Get company by ID. */
  findById(id: string) {
    return prisma.company.findUnique({ where: { id } })
  },

  /** Update company settings by ID. */
  update(id: string, data: Prisma.companyUpdateInput) {
    return prisma.company.update({ where: { id }, data })
  },

  /** Upsert (create or update) the single company record. */
  upsert(id: string, create: Prisma.companyCreateInput, update: Prisma.companyUpdateInput) {
    return prisma.company.upsert({ where: { id }, create, update })
  },
}
