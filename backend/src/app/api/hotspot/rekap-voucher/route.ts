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
    const dateParam  = searchParams.get('date');  // YYYY-MM-DD (daily)
    const weekParam  = searchParams.get('week');  // YYYY-MM-DD Monday of week

    // Build date range filter for createdAt (WIB-as-UTC)
    let dateRangeFilter: any = {};
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      dateRangeFilter = {
        createdAt: {
          gte: startOfDayWIBtoUTC(dateParam),
          lte: endOfDayWIBtoUTC(dateParam),
        },
      };
    } else if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
      // weekParam is Monday (YYYY-MM-DD), end is Sunday (+6 days)
      const weekStart = new Date(weekParam + 'T00:00:00Z');
      const weekEnd   = new Date(weekParam + 'T00:00:00Z');
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      dateRangeFilter = {
        createdAt: {
          gte: startOfDayWIBtoUTC(weekStart),
          lte: endOfDayWIBtoUTC(weekEnd),
        },
      };
    } else if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number);
      dateRangeFilter = {
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
        ...dateRangeFilter,
      },
      _min: { createdAt: true },
      orderBy: { _min: { createdAt: 'desc' } },
    });

    // Get voucher counts per batch by status
    const rekapData = await Promise.all(
      batchGroups.map(async (batch: any) => {
        const batchCode = batch.batchCode as string;

        // Get metadata from a sample voucher — prefer vouchers with agentId set (orderBy agentId desc puts non-null first)
        const sample = await prisma.hotspotVoucher.findFirst({
          where: { batchCode },
          orderBy: { agentId: 'desc' }, // non-null agentId sorts before null in DESC
          select: {
            agentId: true,
            profile: { select: { id: true, name: true, sellingPrice: true, costPrice: true, resellerFee: true } },
            agent: { select: { id: true, name: true, phone: true } },
            router: { select: { id: true, name: true } },
          },
        });

        // Count by status for the entire batch
        const [waiting, active, expired] = await Promise.all([
          prisma.hotspotVoucher.count({ where: { batchCode, status: 'WAITING' } }),
          prisma.hotspotVoucher.count({ where: { batchCode, status: 'ACTIVE' } }),
          prisma.hotspotVoucher.count({ where: { batchCode, status: 'EXPIRED' } }),
        ]);

        const sellingPrice = sample?.profile?.sellingPrice ?? 0;
        const costPrice = sample?.profile?.costPrice ?? 0;
        const resellerFee = sample?.profile?.resellerFee ?? 0;
        const sold = active + expired;
        const totalQty = waiting + active + expired;

        // If agentId is set on voucher but agent was deleted, still treat it as agent batch
        const rawAgentId = sample?.agentId ?? null;
        const agentData = sample?.agent ?? (rawAgentId ? { id: rawAgentId, name: 'Agent (dihapus)', phone: '-' } : null);

        return {
          batchCode,
          createdAt: batch._min.createdAt?.toISOString() ?? new Date().toISOString(),
          agent: agentData,
          profile: sample?.profile ?? { id: '', name: 'Unknown', sellingPrice: 0, costPrice: 0, resellerFee: 0 },
          router: sample?.router ?? null,
          totalQty,
          stock: waiting,
          active,
          expired,
          sold,
          sellingPrice,
          costPrice,
          resellerFee,
          totalRevenue: sold * sellingPrice,
          // Agent batches: admin earned costPrice*sold (already collected when agent generated)
          // Admin batches: admin earned sellingPrice*sold
          agentProfit: agentData ? sold * resellerFee : 0,
          adminEarnings: agentData ? sold * costPrice : sold * sellingPrice,
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
