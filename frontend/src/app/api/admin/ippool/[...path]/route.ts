import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

// Catch-all for /api/admin/ippool/*
// Supports: /stats, /:poolName (details), /mappings/list, /mappings (POST), /expand (PUT), /mappings/:id (DELETE)

export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;

  const path = request.nextUrl.pathname.replace('/api/admin/ippool', '');

  try {
    // /stats
    if (path === '/stats') {
      const totalIps = await prisma.radippool.count();
      const allocatedIps = await prisma.radippool.count({ where: { username: { not: '' } } });
      const poolCount = await prisma.radippool.groupBy({ by: ['pool_name'], _count: { _all: true } });
      return NextResponse.json({
        success: true,
        data: {
          total_pools: poolCount.length,
          total_ips: totalIps,
          allocated_ips: allocatedIps,
          free_ips: totalIps - allocatedIps,
          utilization: totalIps > 0 ? ((allocatedIps / totalIps) * 100).toFixed(2) + '%' : '0%',
        },
      });
    }

    // /mappings/list
    if (path === '/mappings/list') {
      const mappings = await prisma.radgroupreply.findMany({
        where: { attribute: 'Pool-Name' },
        select: { groupname: true, value: true, id: true },
        orderBy: { groupname: 'asc' },
      });
      return NextResponse.json({
        success: true,
        data: mappings.map((m) => ({ id: m.id, groupname: m.groupname, pool_name: m.value })),
      });
    }

    // /:poolName (pool details)
    const poolName = decodeURIComponent(path.replace(/^\//, ''));
    if (poolName) {
      const total = await prisma.radippool.count({ where: { pool_name: poolName } });
      if (total === 0) {
        return NextResponse.json({ success: false, error: `Pool '${poolName}' not found` }, { status: 404 });
      }
      const allocated = await prisma.radippool.count({
        where: { pool_name: poolName, username: { not: '' } },
      });
      const recent = await prisma.radippool.findMany({
        where: { pool_name: poolName, username: { not: '' } },
        orderBy: { expiry_time: 'desc' },
        take: 50,
        select: {
          framedipaddress: true,
          username: true,
          callingstationid: true,
          nasipaddress: true,
          expiry_time: true,
        },
      });
      return NextResponse.json({
        success: true,
        data: {
          pool_name: poolName,
          total_ips: total,
          allocated,
          free: total - allocated,
          recent_allocations: recent,
        },
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid path' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to fetch data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;

  const path = request.nextUrl.pathname.replace('/api/admin/ippool', '');

  try {
    // /mappings — map pool to group
    if (path === '/mappings') {
      const body = await request.json();
      const { groupname, pool_name } = body;
      const poolExists = await prisma.radippool.count({ where: { pool_name } });
      if (poolExists === 0) {
        return NextResponse.json({ success: false, error: `Pool '${pool_name}' not found` }, { status: 404 });
      }
      const existing = await prisma.radgroupreply.findFirst({
        where: { groupname, attribute: 'Pool-Name' },
      });
      if (existing) {
        await prisma.radgroupreply.update({
          where: { id: existing.id },
          data: { value: pool_name, op: ':=' },
        });
      } else {
        await prisma.radgroupreply.create({
          data: { groupname, attribute: 'Pool-Name', op: ':=', value: pool_name },
        });
      }
      return NextResponse.json({ success: true, data: { groupname, pool_name, mapped: true } });
    }

    return NextResponse.json({ success: false, error: 'Invalid path' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to create mapping' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;

  const path = request.nextUrl.pathname.replace('/api/admin/ippool', '');

  try {
    // /expand — expand pool
    if (path === '/expand') {
      const body = await request.json();
      const { pool_name, network, start, end } = body;
      if (!pool_name || !network || start < 1 || end > 254 || start >= end) {
        return NextResponse.json({ success: false, error: 'Invalid expand parameters' }, { status: 400 });
      }
      const existing = await prisma.radippool.findMany({
        where: { pool_name },
        select: { framedipaddress: true },
      });
      const existingSet = new Set(existing.map((e) => e.framedipaddress));
      const newIps: { pool_name: string; framedipaddress: string }[] = [];
      for (let i = start; i <= end; i++) {
        const ip = `${network}.${i}`;
        if (!existingSet.has(ip)) {
          newIps.push({ pool_name, framedipaddress: ip });
        }
      }
      if (newIps.length > 0) {
        await prisma.radippool.createMany({ data: newIps });
      }
      const total = await prisma.radippool.count({ where: { pool_name } });
      return NextResponse.json({ success: true, data: { pool_name, added: newIps.length, total_ips: total } });
    }

    return NextResponse.json({ success: false, error: 'Invalid path' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to expand pool' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;

  const path = request.nextUrl.pathname.replace('/api/admin/ippool', '');

  try {
    // /mappings/:id — delete pool mapping
    if (path.startsWith('/mappings/')) {
      const id = parseInt(path.replace('/mappings/', ''), 10);
      if (isNaN(id)) {
        return NextResponse.json({ success: false, error: 'Invalid mapping id' }, { status: 400 });
      }
      const mapping = await prisma.radgroupreply.findUnique({ where: { id } });
      if (!mapping || mapping.attribute !== 'Pool-Name') {
        return NextResponse.json({ success: false, error: 'Pool mapping not found' }, { status: 404 });
      }
      await prisma.radgroupreply.delete({ where: { id } });
      return NextResponse.json({ success: true, data: { id, deleted: true } });
    }

    return NextResponse.json({ success: false, error: 'Invalid path' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to delete mapping' }, { status: 500 });
  }
}
