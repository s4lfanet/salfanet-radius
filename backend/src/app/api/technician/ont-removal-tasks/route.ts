import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { jwtVerify } from 'jose';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';

async function verifyTechnician(req: NextRequest) {
  const token = req.cookies.get('technician-token')?.value;
  if (!token) return null;
  try {
    const secret = TECH_JWT_SECRET;
    const { payload } = await jwtVerify(token, secret);
    if (payload.type === 'admin_user') {
      const adminUser = await prisma.adminUser.findUnique({
        where: { id: payload.id as string },
        select: { id: true, name: true, phone: true, isActive: true, role: true },
      });
      if (!adminUser?.isActive || adminUser.role !== 'TECHNICIAN') return null;
      return { id: adminUser.id, name: adminUser.name ?? '', phoneNumber: adminUser.phone ?? '', isActive: true };
    }
    const tech = await prisma.technician.findUnique({
      where: { id: payload.id as string },
      select: { id: true, name: true, phoneNumber: true, isActive: true },
    });
    return tech?.isActive ? tech : null;
  } catch {
    return null;
  }
}

// GET — ONT removal tasks assigned to this technician
export async function GET(req: NextRequest) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const rawStatus = searchParams.get('status') || 'PENDING';
    const status = ['PENDING', 'COMPLETED', 'CANCELLED'].includes(rawStatus) ? rawStatus : 'PENDING';

    const tasks = await prisma.ontRemovalTask.findMany({
      where: { assignedTechnicianId: tech.id, status },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const usernames = [...new Set(tasks.map((t) => t.username))];
    const users = await prisma.pppoeUser.findMany({
      where: { username: { in: usernames } },
      select: { username: true, name: true, customerId: true, address: true, phone: true },
    });
    const userMap = new Map(users.map((u) => [u.username, u]));

    const enriched = tasks.map((t) => {
      const u = userMap.get(t.username);
      return {
        ...t,
        customerName: u?.name || t.username,
        customerId: u?.customerId || null,
        address: u?.address || null,
        phone: u?.phone || null,
      };
    });

    return NextResponse.json({ tasks: enriched });
  } catch (error) {
    console.error('Technician ONT removal tasks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
