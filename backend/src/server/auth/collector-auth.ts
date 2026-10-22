import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';
import { prisma } from '@/server/db/client';

export interface CollectorPayload {
  id: string;
  username: string;
  name: string;
  phone?: string;
  role: string;
  type: string;
}

export async function verifyCollector(req: NextRequest): Promise<CollectorPayload | null> {
  const token = req.cookies.get('collector-token')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, TECH_JWT_SECRET);
    if (payload.type !== 'admin_user' || payload.role !== 'collector') return null;
    // The token lives 7 days; check the account on every request so a
    // collector who is deactivated (or moved to another role) loses access
    // at once instead of keeping it, mark-paid included, until it expires.
    const account = await prisma.adminUser.findUnique({
      where: { id: payload.id as string },
      select: { isActive: true, role: true, name: true, phone: true },
    });
    if (!account?.isActive || account.role !== 'COLLECTOR') return null;
    return { ...(payload as unknown as CollectorPayload), name: account.name, phone: account.phone ?? undefined };
  } catch {
    return null;
  }
}
