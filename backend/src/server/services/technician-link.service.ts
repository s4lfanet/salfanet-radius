import 'server-only';
import { prisma } from '@/server/db/client';

/**
 * The technicians-table id for a technician who signs in with an admin
 * account (role TECHNICIAN, username + password).
 *
 * Work orders and customers registered by a technician reference the
 * technicians table. Those admin accounts have no row there, so their id
 * was written instead and the database refused it: taking or finishing a
 * work order failed for them. Technicians are now created only in Kelola
 * Teknisi; the existing admin accounts are linked here so they keep
 * working.
 *
 * The link is found by the account's phone number (the same person may
 * already be in Kelola Teknisi), else by a fixed placeholder, else a
 * technicians row is created.
 */
export async function technicianIdForAdminUser(adminUserId: string): Promise<string> {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminUserId },
    select: { id: true, name: true, username: true, phone: true, email: true },
  });
  if (!admin) throw new Error('Akun teknisi tidak ditemukan');

  const placeholder = `admin:${admin.id}`;
  const phone = admin.phone?.trim() || null;

  const find = () =>
    prisma.technician.findFirst({
      where: { phoneNumber: { in: phone ? [phone, placeholder] : [placeholder] } },
      // Prefer the row for the real phone number when both exist.
      orderBy: { createdAt: 'asc' },
      select: { id: true, phoneNumber: true },
    });

  const existing = await find();
  if (existing) return existing.id;

  try {
    const created = await prisma.technician.create({
      data: {
        name: admin.name || admin.username,
        phoneNumber: phone ?? placeholder,
        email: admin.email,
        isActive: true,
      },
      select: { id: true },
    });
    return created.id;
  } catch (e) {
    // Created by a parallel request a moment ago.
    if ((e as { code?: string })?.code === 'P2002') {
      const again = await find();
      if (again) return again.id;
    }
    throw e;
  }
}
