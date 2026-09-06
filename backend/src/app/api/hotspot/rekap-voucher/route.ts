import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC, formatWIB } from '@/lib/timezone';

export async function GET(req: NextRequest) {
  try {
    const authCheck = await requirePermission('reports.view');
    if (!authCheck.authorized) return authCheck.response;

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId');
    const profileId = searchParams.get('profileId');
    const monthParam = searchParams.get('month'); // YYYY-MM
    const dateParam  = searchParams.get('date');  // YYYY-MM-DD (daily)
    const weekParam  = searchParams.get('week');  // YYYY-MM-DD Monday of week

    // Determine mode: "all" (by createdAt) vs "period" (by firstLoginAt/sale date)
    const hasPeriodFilter = !!(dateParam || weekParam || monthParam);

    // Build date range
    let gte: Date | null = null;
    let lte: Date | null = null;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      gte = startOfDayWIBtoUTC(dateParam);
      lte = endOfDayWIBtoUTC(dateParam);
    } else if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
      const weekStart = new Date(weekParam + 'T00:00:00Z');
      const weekEnd   = new Date(weekParam + 'T00:00:00Z');
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      gte = startOfDayWIBtoUTC(weekStart);
      lte = endOfDayWIBtoUTC(weekEnd);
    } else if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number);
      gte = startOfDayWIBtoUTC(new Date(Date.UTC(y, m - 1, 1)));
      lte = endOfDayWIBtoUTC(new Date(Date.UTC(y, m, 0)));
    }

    // Base filter for agent/profile
    const baseFilter: any = {
      ...(agentId && agentId !== 'all' ? { agentId } : {}),
      ...(profileId && profileId !== 'all' ? { profileId } : {}),
    };

    if (hasPeriodFilter && gte && lte) {
      // ── PERIOD MODE: filter by firstLoginAt (sale date) ──
      // Get all SOLD vouchers in the period
      const soldVouchers = await prisma.hotspotVoucher.findMany({
        where: {
          ...baseFilter,
          firstLoginAt: { gte, lte, not: null },
        },
        select: {
          id: true,
          code: true,
          batchCode: true,
          status: true,
          firstLoginAt: true,
          expiresAt: true,
          profile: { select: { id: true, name: true, sellingPrice: true, costPrice: true, resellerFee: true } },
          agent: { select: { id: true, name: true, phone: true } },
          router: { select: { id: true, name: true } },
          agentId: true,
        },
        orderBy: { firstLoginAt: 'desc' },
      });

      // Group by date (yyyy-MM-dd) for daily breakdown
      const byDate = new Map<string, { date: string; sold: number; revenue: number; active: number; expired: number; vouchers: typeof soldVouchers }>();
      // Group by batch for batch-level rekap
      const byBatch = new Map<string, { batchCode: string; vouchers: typeof soldVouchers }>();

      for (const v of soldVouchers) {
        const saleDate = v.firstLoginAt ? formatWIB(v.firstLoginAt, 'yyyy-MM-dd') : 'unknown';
        if (!byDate.has(saleDate)) {
          byDate.set(saleDate, { date: saleDate, sold: 0, revenue: 0, active: 0, expired: 0, vouchers: [] });
        }
        const d = byDate.get(saleDate)!;
        d.sold++;
        d.revenue += v.profile?.sellingPrice ?? 0;
        if (v.status === 'ACTIVE') d.active++;
        if (v.status === 'EXPIRED') d.expired++;
        d.vouchers.push(v);

        const bc = v.batchCode || 'no-batch';
        if (!byBatch.has(bc)) {
          byBatch.set(bc, { batchCode: bc, vouchers: [] });
        }
        byBatch.get(bc)!.vouchers.push(v);
      }

      // Build rekap per batch (only sold vouchers in period)
      const rekapData = Array.from(byBatch.values()).map((batch) => {
        const sample = batch.vouchers[0];
        const active = batch.vouchers.filter(v => v.status === 'ACTIVE').length;
        const expired = batch.vouchers.filter(v => v.status === 'EXPIRED').length;
        const sold = batch.vouchers.length;
        const sellingPrice = sample?.profile?.sellingPrice ?? 0;
        const costPrice = sample?.profile?.costPrice ?? 0;
        const resellerFee = sample?.profile?.resellerFee ?? 0;
        const rawAgentId = sample?.agentId ?? null;
        const agentData = sample?.agent ?? (rawAgentId ? { id: rawAgentId, name: 'Agent (dihapus)', phone: '-' } : null);

        return {
          batchCode: batch.batchCode,
          createdAt: sample?.firstLoginAt?.toISOString() ?? new Date().toISOString(),
          firstLoginAt: sample?.firstLoginAt?.toISOString() ?? null,
          agent: agentData,
          profile: sample?.profile ?? { id: '', name: 'Unknown', sellingPrice: 0, costPrice: 0, resellerFee: 0 },
          router: sample?.router ?? null,
          totalQty: sold, // in period mode, totalQty = sold in period
          stock: 0,       // stock not applicable in period mode
          active,
          expired,
          sold,
          sellingPrice,
          costPrice,
          resellerFee,
          totalRevenue: sold * sellingPrice,
          agentProfit: agentData ? sold * resellerFee : 0,
          adminEarnings: agentData ? sold * costPrice : sold * sellingPrice,
        };
      }).sort((a, b) => (b.firstLoginAt ?? '').localeCompare(a.firstLoginAt ?? ''));

      // Build daily breakdown
      const dailyBreakdown = Array.from(byDate.values())
        .map(d => ({
          date: d.date,
          dateLabel: formatWIB(new Date(d.date + 'T00:00:00Z'), 'EEEE, dd MMM yyyy'),
          sold: d.sold,
          active: d.active,
          expired: d.expired,
          revenue: d.revenue,
        }))
        .sort((a, b) => b.date.localeCompare(a.date));

      // Get agents and profiles for filter
      const [agents, profiles] = await Promise.all([
        prisma.agent.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        prisma.hotspotProfile.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      ]);

      return NextResponse.json({
        rekap: rekapData,
        dailyBreakdown,
        mode: 'period',
        totalSold: soldVouchers.length,
        totalRevenue: soldVouchers.reduce((s, v) => s + (v.profile?.sellingPrice ?? 0), 0),
        agents,
        profiles,
      });
    }

    // ── ALL MODE: filter by createdAt (batch creation date) ──
    let dateRangeFilter: any = {};
    if (gte && lte) {
      dateRangeFilter = { createdAt: { gte, lte } };
    }

    const batchGroups = await prisma.hotspotVoucher.groupBy({
      by: ['batchCode'],
      where: {
        batchCode: { not: null },
        ...baseFilter,
        ...dateRangeFilter,
      },
      _min: { createdAt: true },
      orderBy: { _min: { createdAt: 'desc' } },
    });

    const rekapData = await Promise.all(
      batchGroups.map(async (batch: any) => {
        const batchCode = batch.batchCode as string;

        const sample = await prisma.hotspotVoucher.findFirst({
          where: { batchCode },
          orderBy: { agentId: 'desc' },
          select: {
            agentId: true,
            profile: { select: { id: true, name: true, sellingPrice: true, costPrice: true, resellerFee: true } },
            agent: { select: { id: true, name: true, phone: true } },
            router: { select: { id: true, name: true } },
          },
        });

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

        const rawAgentId = sample?.agentId ?? null;
        const agentData = sample?.agent ?? (rawAgentId ? { id: rawAgentId, name: 'Agent (dihapus)', phone: '-' } : null);

        return {
          batchCode,
          createdAt: batch._min.createdAt?.toISOString() ?? new Date().toISOString(),
          firstLoginAt: null,
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
          agentProfit: agentData ? sold * resellerFee : 0,
          adminEarnings: agentData ? sold * costPrice : sold * sellingPrice,
        };
      })
    );

    const [agents, profiles] = await Promise.all([
      prisma.agent.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.hotspotProfile.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);

    return NextResponse.json({
      rekap: rekapData,
      dailyBreakdown: [],
      mode: 'all',
      totalSold: rekapData.reduce((s, r) => s + r.sold, 0),
      totalRevenue: rekapData.reduce((s, r) => s + r.totalRevenue, 0),
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
