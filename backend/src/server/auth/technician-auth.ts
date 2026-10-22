import 'server-only';
import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';

export interface TechnicianSession {
  id: string;
  name: string;
  isAdminUser: boolean;
}

/**
 * The signed-in technician, checked against the database on every request
 * (an account deactivated mid-token is refused). Covers both Kelola Teknisi
 * accounts and the older technician accounts from Admin & Role.
 *
 * Most technician routes still carry their own copy of this check; new
 * routes use this one.
 */
export async function verifyTechnician(req: NextRequest): Promise<TechnicianSession | null> {
  const token = req.cookies.get('technician-token')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, TECH_JWT_SECRET);
    if (payload.type === 'admin_user') {
      const admin = await prisma.adminUser.findUnique({
        where: { id: payload.id as string },
        select: { id: true, name: true, isActive: true, role: true },
      });
      if (!admin?.isActive || admin.role !== 'TECHNICIAN') return null;
      return { id: admin.id, name: admin.name, isAdminUser: true };
    }
    const tech = await prisma.technician.findUnique({
      where: { id: payload.id as string },
      select: { id: true, name: true, isActive: true },
    });
    return tech?.isActive ? { id: tech.id, name: tech.name, isAdminUser: false } : null;
  } catch {
    return null;
  }
}
