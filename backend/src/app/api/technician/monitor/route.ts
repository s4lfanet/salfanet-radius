import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';
import {
  getConnectivitySnapshot,
  offlineWhere,
} from '@/server/services/technician/connectivity.service';

export const dynamic = 'force-dynamic';

function formatUptime(seconds: number): string {
  if (!seconds) return '0s';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function fmtBytes(b: number): string {
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(2)} GB`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(2)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

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

/**
 * Summary for the technician Monitor page. Online / offline / unknown /
 * isolated use the same rule as the Online, Offline and Isolir pages
 * (technician/connectivity.service), so the numbers match across pages.
 */
export async function GET(req: NextRequest) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const snap = await getConnectivitySnapshot();
  const onlineUsernames = [...snap.sessions.keys()];

  const [statusCounts, onlineCustomers, offlineCount, unknownCount, isolatedCustomers] = await Promise.all([
    prisma.pppoeUser.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.pppoeUser.findMany({
      where: { username: { in: onlineUsernames } },
      select: {
        username: true,
        name: true,
        phone: true,
        profile: { select: { name: true } },
        area: { select: { name: true } },
        router: { select: { name: true } },
      },
    }),
    prisma.pppoeUser.count({ where: offlineWhere(snap, 'offline') }),
    prisma.pppoeUser.count({ where: offlineWhere(snap, 'unknown') }),
    prisma.pppoeUser.findMany({
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
    }),
  ]);

  const countByStatus: Record<string, number> = {};
  for (const row of statusCounts) countByStatus[row.status] = row._count.id;

  // Only registered customers count as online sessions.
  const customerByUsername = new Map(onlineCustomers.map((c) => [c.username, c]));
  const sessions = [...snap.sessions.values()]
    .filter((s) => customerByUsername.has(s.username))
    .map((s) => {
      const c = customerByUsername.get(s.username)!;
      return {
        uniqueId: `${s.source}-${s.username}`,
        username: s.username,
        source: s.source,
        framedIp: s.ip ?? '-',
        nasIp: '-',
        uptimeSec: s.uptimeSec,
        uptime: formatUptime(s.uptimeSec),
        download: fmtBytes(s.txBytes),
        upload: fmtBytes(s.rxBytes),
        customerName: c.name ?? null,
        customerPhone: c.phone ?? null,
        profileName: c.profile?.name ?? null,
        areaName: c.area?.name ?? null,
        routerName: s.routerName ?? c.router?.name ?? null,
      };
    })
    .sort((a, b) => (a.customerName ?? a.username).localeCompare(b.customerName ?? b.username))
    .slice(0, 300);

  const stats = {
    online: customerByUsername.size,
    offline: offlineCount,
    unknown: unknownCount,
    isolated: countByStatus['isolated'] ?? 0,
    active: countByStatus['active'] ?? 0,
    stopped: countByStatus['stopped'] ?? 0,
    total: Object.values(countByStatus).reduce((a, b) => a + b, 0),
  };

  return NextResponse.json({
    stats,
    sessions,
    isolatedCustomers,
    unreachableRouters: snap.unreachableRouters,
  });
}
