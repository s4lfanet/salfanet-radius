import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { reloadFreeRadius } from '@/server/services/radius/freeradius.service';

// GET /api/admin/ippool — list pools
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    // NOTE: framedipaddress is VARCHAR — MIN()/MAX() on it sorts lexicographically
    // (e.g. "192.168.14.10" < "192.168.14.2" as strings), giving wrong IP range.
    // Use INET_ATON()/INET_NTOA() to compare/convert numerically for correct start/end IP.
    const result: Array<{ pool_name: string; total_ips: bigint; start_ip: string; end_ip: string }> = await prisma.$queryRaw`
      SELECT
        pool_name,
        COUNT(*) as total_ips,
        INET_NTOA(MIN(INET_ATON(framedipaddress))) as start_ip,
        INET_NTOA(MAX(INET_ATON(framedipaddress))) as end_ip
      FROM radippool
      GROUP BY pool_name
      ORDER BY pool_name ASC
    `;
    const data = result.map((p) => ({
      pool_name: p.pool_name,
      total_ips: Number(p.total_ips),
      start_ip: p.start_ip,
      end_ip: p.end_ip,
    }));
    return NextResponse.json({ success: true, data });
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
