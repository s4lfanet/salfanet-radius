import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { cookies } from 'next/headers';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';

async function verifyTechnician() {
  const cookieStore = await cookies();
  const token = cookieStore.get('technician-token')?.value;
  if (!token) return null;
  try {
    const secret = TECH_JWT_SECRET;
    const { payload } = await jwtVerify(token, secret);
    if (payload.type === 'admin_user') {
      const adminUser = await prisma.adminUser.findUnique({
        where: { id: payload.id as string },
        select: { id: true, isActive: true, role: true },
      });
      if (!adminUser?.isActive || adminUser.role !== 'TECHNICIAN') return null;
      return { id: adminUser.id };
    }
    const tech = await prisma.technician.findUnique({
      where: { id: payload.id as string },
      select: { id: true, isActive: true },
    });
    return tech?.isActive ? tech : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const tech = await verifyTechnician();
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const settings = await prisma.genieacsSettings.findFirst({
    where: { isActive: true },
  });

  if (!settings) {
    return NextResponse.json({ settings: null });
  }

  return NextResponse.json({
    settings: {
      id: settings.id,
      host: settings.host,
      isActive: settings.isActive,
      hasPassword: !!settings.password,
    },
  });
}
