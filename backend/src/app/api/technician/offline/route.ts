import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';
import { batchListPppActive, listPppSecrets } from '@/server/services/mikrotik/ppp-secret.service';

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

// Returns PPPoE users that are NOT currently online (no active radacct session or MikroTik active session)
export async function GET(req: NextRequest) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(200, parseInt(searchParams.get('limit') || '50', 10));

  // Get all currently online usernames from radacct
  const onlineSessions = await prisma.radacct.findMany({
    where: { acctstoptime: null },
    select: { username: true },
  });
  const onlineUsernames = new Set(onlineSessions.map((s) => s.username));

  // Get routers — need full details for local-auth to fetch PPP secrets
  const routers = await prisma.router.findMany({
    where: { isActive: true },
    select: { id: true, name: true, authMode: true },
  });
  const localRouters = routers.filter(r => (r.authMode || 'local') !== 'radius');
  const localRouterIds = localRouters.map(r => r.id);
  const routerMap = new Map(routers.map(r => [r.id, r]));

  // Check MikroTik /ppp/active for local-auth routers
  if (localRouterIds.length > 0) {
    const pppActiveNames = await batchListPppActive(localRouterIds);
    for (const name of pppActiveNames) {
      onlineUsernames.add(name);
    }
  }

  // Build query for PPPoE users from database with active/isolated status
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

  // Also fetch PPP secrets from MikroTik for local-auth routers
  // This catches users that exist on the router but not in the database,
  // and disabled secrets (which are offline by definition)
  type OfflineUser = {
    id: string;
    username: string;
    name: string;
    phone: string;
    status: string;
    expiredAt: string | null;
    profile: { id: string; name: string; groupName: string } | null;
    router: { id: string; name: string } | null;
    area: { id: string; name: string } | null;
    source: 'database' | 'mikrotik';
    disabled: boolean;
  };

  const dbOfflineUsers: OfflineUser[] = offlineUsers.map(u => ({
    ...u,
    profile: u.profile,
    router: u.router,
    area: u.area,
    source: 'database' as const,
    disabled: false,
  }));

  // Fetch PPP secrets from MikroTik for local-auth routers
  const dbUsernames = new Set(allUsers.map(u => u.username));
  const mikrotikOfflineUsers: OfflineUser[] = [];

  if (localRouterIds.length > 0) {
    const secretResults = await Promise.allSettled(
      localRouters.map(async (r) => {
        const secrets = await listPppSecrets(r.id);
        return { routerId: r.id, routerName: r.name, secrets };
      })
    );

    for (const result of secretResults) {
      if (result.status !== 'fulfilled') continue;
      const { routerId, routerName, secrets } = result.value;
      for (const secret of secrets) {
        // Skip if already in database
        if (dbUsernames.has(secret.name)) continue;
        // Skip if currently online
        if (onlineUsernames.has(secret.name)) continue;
        // Apply search filter
        if (search && !secret.name.toLowerCase().includes(search.toLowerCase())) continue;

        mikrotikOfflineUsers.push({
          id: `mt-${routerId}-${secret.name}`,
          username: secret.name,
          name: '',
          phone: '',
          status: secret.disabled === 'true' ? 'stopped' : 'active',
          expiredAt: null,
          profile: null,
          router: { id: routerId, name: routerName },
          area: null,
          source: 'mikrotik' as const,
          disabled: secret.disabled === 'true',
        });
      }
    }
  }

  // Merge and sort
  const merged = [...dbOfflineUsers, ...mikrotikOfflineUsers].sort((a, b) =>
    (a.name || a.username).localeCompare(b.name || b.username)
  );

  const total = merged.length;
  const totalPages = Math.ceil(total / limit);
  const paged = merged.slice((page - 1) * limit, page * limit);

  return NextResponse.json({
    users: paged,
    total,
    pagination: { total, page, limit, totalPages },
  });
}
