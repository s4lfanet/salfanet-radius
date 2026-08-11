import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { getTimezoneOffsetMs } from '@/lib/timezone';
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
        select: { id: true, name: true, isActive: true, role: true },
      });
      if (!adminUser?.isActive || adminUser.role !== 'TECHNICIAN') return null;
      return { id: adminUser.id, name: adminUser.name ?? '', isActive: true };
    }
    const tech = await prisma.technician.findUnique({
      where: { id: payload.id as string },
      select: { id: true, name: true, isActive: true },
    });
    return tech?.isActive ? tech : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const TZ_OFFSET_MS = getTimezoneOffsetMs(); // Dynamic timezone offset
  const now = Date.now() + TZ_OFFSET_MS; // WIB-as-UTC for duration calc

  // 1. Customer stats by status
  const [statusCounts, onlineSessions] = await Promise.all([
    prisma.pppoeUser.groupBy({
      by: ['status'],
      _count: { id: true },
    }),
    prisma.radacct.findMany({
      where: { acctstoptime: null },
      select: {
        username: true,
        framedipaddress: true,
        nasipaddress: true,
        acctstarttime: true,
        acctinputoctets: true,
        acctoutputoctets: true,
        acctuniqueid: true,
      },
      orderBy: { acctstarttime: 'desc' },
      take: 500,
    }),
  ]);

  // Map status → count
  const countByStatus: Record<string, number> = {};
  for (const row of statusCounts) {
    countByStatus[row.status] = row._count.id;
  }

  // Cross-reference online sessions with customer data
  const onlineUsernames = onlineSessions.map((s) => s.username);
  const customerMap = onlineUsernames.length
    ? await prisma.pppoeUser.findMany({
        where: { username: { in: onlineUsernames } },
        select: {
          username: true,
          name: true,
          phone: true,
          status: true,
          profile: { select: { name: true } },
          area: { select: { name: true } },
          router: { select: { name: true } },
        },
      })
    : [];

  const customerByUsername = new Map(customerMap.map((c) => [c.username, c]));

  const sessions = onlineSessions.map((s) => {
    const startMs = s.acctstarttime
      ? new Date(s.acctstarttime).getTime()
      : now;
    const uptimeSec = Math.max(0, Math.floor((now - startMs) / 1000));

    const hours = Math.floor(uptimeSec / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    const secs = uptimeSec % 60;
    const uptime =
      hours > 0 ? `${hours}j ${mins}m` : mins > 0 ? `${mins}m ${secs}d` : `${secs}d`;

    const customer = customerByUsername.get(s.username);

    const dl = Number(s.acctoutputoctets ?? 0);
    const ul = Number(s.acctinputoctets ?? 0);
    const fmtBytes = (b: number) => {
      if (b > 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
      if (b > 1048576) return `${(b / 1048576).toFixed(1)} MB`;
      if (b > 1024) return `${(b / 1024).toFixed(1)} KB`;
      return `${b} B`;
    };

    return {
      uniqueId: s.acctuniqueid,
      username: s.username,
      framedIp: s.framedipaddress,
      nasIp: s.nasipaddress,
      uptimeSec,
      uptime,
      download: fmtBytes(dl),
      upload: fmtBytes(ul),
      customerName: customer?.name ?? null,
      customerPhone: customer?.phone ?? null,
      profileName: customer?.profile?.name ?? null,
      areaName: customer?.area?.name ?? null,
      routerName: customer?.router?.name ?? null,
    };
  });

  // Isolated customers
  const isolatedCustomers = await prisma.pppoeUser.findMany({
    where: { status: 'isolated' },
    select: {
      id: true,
      username: true,
      name: true,
      phone: true,
      expiredAt: true,
      profile: { select: { name: true } },
      area: { select: { name: true } },
    },
    take: 100,
    orderBy: { expiredAt: 'asc' },
  });

  const stats = {
    online: sessions.length,
    isolated: countByStatus['isolated'] ?? 0,
    active: countByStatus['active'] ?? 0,
    stopped: countByStatus['stopped'] ?? 0,
    total: Object.values(countByStatus).reduce((a, b) => a + b, 0),
  };

  return NextResponse.json({ stats, sessions, isolatedCustomers });
}
