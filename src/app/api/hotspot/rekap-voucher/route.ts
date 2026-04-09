import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC } from '@/lib/timezone';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId');
    const profileId = searchParams.get('profileId');
    const monthParam = searchParams.get('month'); // YYYY-MM

    // Build optional month filter for createdAt
    let monthFilter: any = {};
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number);
      monthFilter = {
        createdAt: {
          gte: startOfDayWIBtoUTC(new Date(Date.UTC(y, m - 1, 1))),
          lte: endOfDayWIBtoUTC(new Date(Date.UTC(y, m, 0))),
        },
      };
    }

    // Get distinct batches (group only by batchCode to avoid duplicate rows)
    const batchGroups = await prisma.hotspotVoucher.groupBy({
      by: ['batchCode'],
      where: {
        batchCode: { not: null },
        ...(agentId && agentId !== 'all' ? { agentId } : {}),
        ...(profileId && profileId !== 'all' ? { profileId } : {}),
        ...monthFilter,
      },
      _min: { createdAt: true },
      orderBy: { _min: { createdAt: 'desc' } },
    });

    // Get voucher counts per batch by status
    const rekapData = await Promise.all(
      batchGroups.map(async (batch: any) => {
        const batchCode = batch.batchCode as string;

        // Get metadata from a sample voucher (profile, agent, router)
        const sample = await prisma.hotspotVoucher.findFirst({
          where: { batchCode },
          include: {
            profile: { select: { id: true, name: true, sellingPrice: true } },
            agent: { select: { id: true, name: true, phone: true } },
            router: { select: { id: true, name: true } },
          },
        });

        // Count by status for the entire batch (not filtered by month/agent/profile)
        const [waiting, active, expired] = await Promise.all([
          prisma.hotspotVoucher.count({ where: { batchCode, status: 'WAITING' } }),
          prisma.hotspotVoucher.count({ where: { batchCode, status: 'ACTIVE' } }),
          prisma.hotspotVoucher.count({ where: { batchCode, status: 'EXPIRED' } }),
        ]);

        const sellingPrice = sample?.profile?.sellingPrice ?? 0;
        const sold = active + expired;
        const totalQty = waiting + active + expired;

        return {
          batchCode,
          createdAt: batch._min.createdAt?.toISOString() ?? new Date().toISOString(),
          agent: sample?.agent ?? null,
          profile: sample?.profile ?? { id: '', name: 'Unknown', sellingPrice: 0 },
          router: sample?.router ?? null,
          totalQty,
          stock: waiting,
          active,
          expired,
          sold,
          sellingPrice,
          totalRevenue: sold * sellingPrice,
        };
      })
    );

    // Get all agents for filter
    const agents = await prisma.agent.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Get all profiles for filter
    const profiles = await prisma.hotspotProfile.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return NextResponse.json({
      rekap: rekapData,
      agents,
      profiles,
    });
  } catch (error) {
    console.error('Rekap voucher error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rekap voucher' },
      { status: 500 }
    );
  }
}
