import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';

// GET - list ONT removals for this collector
export async function GET(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const removals = await prisma.ontRemoval.findMany({
      where: { collectorId: collector.id },
      orderBy: { removedAt: 'desc' },
      take: 100,
    });

    // Enrich with user info
    const usernames = removals.map(r => r.username);
    const users = await prisma.pppoeUser.findMany({
      where: { username: { in: usernames } },
      select: {
        username: true,
        name: true,
        customerId: true,
        areaId: true,
      },
    });

    const userMap = new Map(users.map(u => [u.username, u]));
    const areaIds = [...new Set(users.map(u => u.areaId).filter(Boolean))] as string[];
    const areas = await prisma.pppoeArea.findMany({
      where: { id: { in: areaIds } },
      select: { id: true, name: true },
    });
    const areaMap = new Map(areas.map(a => [a.id, a.name]));

    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = lastMonthDate.toISOString().slice(0, 7);

    const thisMonthCount = removals.filter(r => r.removedAt.toISOString().slice(0, 7) === thisMonth).length;
    const lastMonthCount = removals.filter(r => r.removedAt.toISOString().slice(0, 7) === lastMonth).length;

    const enriched = removals.map(r => {
      const u = userMap.get(r.username);
      return {
        id: r.id,
        username: r.username,
        fullname: u?.name || r.username,
        customerId: u?.customerId || null,
        areaName: u?.areaId ? areaMap.get(u.areaId) || null : null,
        notes: r.notes,
        removedAt: r.removedAt,
      };
    });

    return NextResponse.json({
      removals: enriched,
      thisMonth: thisMonthCount,
      lastMonth: lastMonthCount,
    });
  } catch (error) {
    console.error('ONT removals error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - record new ONT removal
export async function POST(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { username, notes } = await req.json();

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const removal = await prisma.ontRemoval.create({
      data: {
        username,
        collectorId: collector.id,
        notes: notes || null,
      },
    });

    return NextResponse.json({ success: true, id: removal.id });
  } catch (error) {
    console.error('ONT removal create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
