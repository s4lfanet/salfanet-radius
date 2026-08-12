import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { reloadFreeRadius } from '@/server/services/radius/freeradius.service';

// GET /api/admin/ippool — list pools
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const pools = await prisma.radippool.groupBy({
      by: ['pool_name'],
      _count: { framedipaddress: true },
      _min: { framedipaddress: true },
      _max: { framedipaddress: true },
      orderBy: { pool_name: 'asc' },
    });
    const result = pools.map((p) => ({
      pool_name: p.pool_name,
      total_ips: p._count.framedipaddress,
      start_ip: p._min.framedipaddress,
      end_ip: p._max.framedipaddress,
    }));
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to list pools' }, { status: 500 });
  }
}

// POST /api/admin/ippool — create pool
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const body = await request.json();
    const { pool_name, network, start, end } = body;
    if (!pool_name || !network || start < 1 || end > 254 || start >= end) {
      return NextResponse.json({ success: false, error: 'Invalid pool parameters' }, { status: 400 });
    }
    const existing = await prisma.radippool.count({ where: { pool_name } });
    if (existing > 0) {
      return NextResponse.json({ success: false, error: `Pool '${pool_name}' already exists` }, { status: 400 });
    }
    const ips: { pool_name: string; framedipaddress: string }[] = [];
    for (let i = start; i <= end; i++) {
      ips.push({ pool_name, framedipaddress: `${network}.${i}` });
    }
    await prisma.radippool.createMany({ data: ips });
    // Reload FreeRADIUS so new pool is available for sqlippool allocation
    try { await reloadFreeRadius(); } catch (e) { console.warn('FreeRADIUS reload failed after pool create:', e); }
    return NextResponse.json({
      success: true,
      data: { pool_name, total_ips: ips.length, start_ip: `${network}.${start}`, end_ip: `${network}.${end}` },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to create pool' }, { status: 500 });
  }
}

// DELETE /api/admin/ippool?poolName=...
export async function DELETE(request: NextRequest) {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { searchParams } = new URL(request.url);
    const poolName = searchParams.get('poolName');
    if (!poolName) {
      return NextResponse.json({ success: false, error: 'poolName is required' }, { status: 400 });
    }
    const allocated = await prisma.radippool.count({
      where: { pool_name: poolName, username: { not: '' } },
    });
    if (allocated > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot delete pool '${poolName}': ${allocated} IPs are currently allocated` },
        { status: 400 },
      );
    }
    const result = await prisma.radippool.deleteMany({ where: { pool_name: poolName } });
    await prisma.radgroupreply.deleteMany({ where: { attribute: 'Pool-Name', value: poolName } });
    // Reload FreeRADIUS after pool deletion
    try { await reloadFreeRadius(); } catch (e) { console.warn('FreeRADIUS reload failed after pool delete:', e); }
    return NextResponse.json({ success: true, data: { pool_name: poolName, deleted: result.count } });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to delete pool' }, { status: 500 });
  }
}
