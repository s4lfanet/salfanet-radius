import 'server-only';
import { prisma } from '@/server/db/client';

/** One-time markers the server keeps for itself (table app_flags). */
export async function hasFlag(key: string): Promise<boolean> {
  return !!(await prisma.appFlag.findUnique({ where: { key }, select: { key: true } }));
}

export async function setFlag(key: string, value?: string): Promise<void> {
  await prisma.appFlag.upsert({ where: { key }, update: { value: value ?? null }, create: { key, value: value ?? null } });
}
