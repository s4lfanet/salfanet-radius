import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
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
        select: { id: true, isActive: true, role: true },
      });
      if (!adminUser?.isActive || adminUser.role !== 'TECHNICIAN') return null;
      return { id: adminUser.id, isActive: true };
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

// Returns PPPoE users that are NOT currently online (no active radacct session)
export async function GET(req: NextRequest) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';

  // Get all currently online usernames from radacct
  const onlineSessions = await prisma.radacct.findMany({
    where: { acctstoptime: null },
    select: { username: true },
  });
  const onlineUsernames = new Set(onlineSessions.map((s) => s.username));

  // Build query for PPPoE users with active/isolated status (not deleted/stopped permanently)
  const where: Record<string, unknown> = {
    status: { in: ['active', 'isolated'] },
  };

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { username: { contains: search } },
      { phone: { contains: search } },
    ];
  }

  const allUsers = await prisma.pppoeUser.findMany({
    where,
    select: {
      id: true,
      username: true,
      name: true,
      phone: true,
      status: true,
      expiredAt: true,
      profile: { select: { id: true, name: true, groupName: true } },
      router: { select: { id: true, name: true } },
      area: { select: { id: true, name: true } },
    },
    orderBy: { name: 'asc' },
  });

  // Filter out users that are currently online
  const offlineUsers = allUsers.filter((u) => !onlineUsernames.has(u.username));

  return NextResponse.json({ users: offlineUsers, total: offlineUsers.length });
}
