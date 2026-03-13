/**
 * Prisma Client Singleton — Salfanet Radius
 *
 * Single instance of PrismaClient yang digunakan di seluruh server-side code.
 * File ini HANYA boleh diimport di server-side (API routes, services, repositories).
 *
 * Lokasi lama: src/lib/prisma.ts (sekarang re-export proxy)
 * Lokasi baru: src/server/db/client.ts (file ini)
 *
 * @module server/db/client
 */

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
