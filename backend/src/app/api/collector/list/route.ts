import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

export async function GET(req: NextRequest) {
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

    const enriched = collectors.map(c => ({
      ...c,
      areaName: c.areaId ? areaMap.get(c.areaId) || null : null,
    }));

    return NextResponse.json({ collectors: enriched });
  } catch (error) {
    console.error('Collector list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
