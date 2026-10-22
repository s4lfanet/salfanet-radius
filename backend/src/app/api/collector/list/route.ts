import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { parseRouterIds } from '@/server/auth/collector-scope';

export async function GET(_req: NextRequest) {
  const authCheck = await requirePermission('users.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const collectors = await prisma.adminUser.findMany({
      where: { role: 'COLLECTOR' },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
        areaId: true,
        collectorRouterIds: true,
        lastLogin: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });

    // Enrich with area name
    const areaIds = [...new Set(collectors.map(c => c.areaId).filter(Boolean))] as string[];
    const areas = await prisma.pppoeArea.findMany({
      where: { id: { in: areaIds } },
      select: { id: true, name: true },
    });
    const areaMap = new Map(areas.map(a => [a.id, a.name]));

    const routers = await prisma.router.findMany({ select: { id: true, name: true } });
    const routerMap = new Map(routers.map(r => [r.id, r.name]));

    const enriched = collectors.map(c => {
      const routerIds = parseRouterIds(c.collectorRouterIds).filter(id => routerMap.has(id));
      return {
        ...c,
        collectorRouterIds: routerIds,
        areaName: c.areaId ? areaMap.get(c.areaId) || null : null,
        routerNames: routerIds.map(id => routerMap.get(id) as string),
      };
    });

    return NextResponse.json({ collectors: enriched });
  } catch (error) {
    console.error('Collector list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
