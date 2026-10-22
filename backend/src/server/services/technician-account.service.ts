import 'server-only';
import { prisma } from '@/server/db/client';

/** Technician fields safe to send to the panel: never the password hash. */
export const TECHNICIAN_PUBLIC_SELECT = {
  id: true,
  name: true,
  username: true,
  phoneNumber: true,
  email: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  password: true,
} as const;

type WithPassword = { password: string | null } & Record<string, unknown>;

/** Replace the hash with hasPassword, so the list can flag accounts that cannot sign in yet. */
export function toPublicTechnician<T extends WithPassword>(t: T) {
  const { password, ...rest } = t;
  return { ...rest, hasPassword: !!password };
}

/** 3-32 characters: letters, digits, dot, dash, underscore. */
export function checkUsername(username: unknown): string | null {
  if (typeof username !== 'string' || !/^[A-Za-z0-9._-]{3,32}$/.test(username.trim())) {
    return 'Username 3 sampai 32 karakter: huruf, angka, titik, minus atau garis bawah';
  }
  return null;
}

export function checkPassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 6) return 'Password minimal 6 karakter';
  return null;
}

/**
 * The login form looks a username up among Kelola Teknisi accounts and then
 * among the older technician accounts from Admin & Role, so a name must be
 * free in both.
 */
export async function usernameTaken(username: string, exceptTechnicianId?: string): Promise<boolean> {
  const [tech, admin] = await Promise.all([
    prisma.technician.findUnique({ where: { username }, select: { id: true } }),
    prisma.adminUser.findUnique({ where: { username }, select: { role: true } }),
  ]);
  if (tech && tech.id !== exceptTechnicianId) return true;
  return admin?.role === 'TECHNICIAN';
}
