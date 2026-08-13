import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// GET /api/network/otbs/stats - Get OTB statistics
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const oltId = searchParams.get('oltId');

    const where = oltId ? { oltId } : {};

    const [
      total,
      activeCount,
      inactiveCount,
      maintenanceCount,
      totalPorts,
      usedPorts,
      otbsByOlt,
    ] = await Promise.all([
      prisma.network_otbs.count({ where }),
      prisma.network_otbs.count({ where: { ...where, status: 'ACTIVE' } }),
      prisma.network_otbs.count({ where: { ...where, status: 'INACTIVE' } }),
      prisma.network_otbs.count({ where: { ...where, status: 'MAINTENANCE' } }),
      prisma.network_otbs.aggregate({
        where,
        _sum: { portCount: true },
      }),
      prisma.network_otbs.aggregate({
        where,
        _sum: { usedPorts: true },
      }),
      prisma.network_otbs.groupBy({
        by: ['oltId'],
        where,
        _count: true,
      }),
    ]);

    const portUtilization = totalPorts._sum.portCount
      ? ((usedPorts._sum.usedPorts || 0) / totalPorts._sum.portCount) * 100
      : 0;

    return NextResponse.json({
      total,
      byStatus: {
        active: activeCount,
        inactive: inactiveCount,
        maintenance: maintenanceCount,
      },
      ports: {
        total: totalPorts._sum.portCount || 0,
        used: usedPorts._sum.usedPorts || 0,
        available: (totalPorts._sum.portCount || 0) - (usedPorts._sum.usedPorts || 0),
        utilization: Math.round(portUtilization * 100) / 100,
      },
      byOlt: otbsByOlt.map((item: any) => ({
        oltId: item.oltId,
        count: item._count,
      })),
    });
  } catch (error: any) {
    console.error('[OTB_STATS_ERROR]', error);
    return NextResponse.json(
      { error: 'Failed to fetch OTB statistics', details: error.message },
      { status: 500 }
    );
  }
}
