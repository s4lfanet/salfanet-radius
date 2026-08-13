import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthlyDataPoint {
  month: string;       // 'YYYY-MM'
  monthLabel: string;  // 'Jan 2025'
  revenue: number;     // sum of paid invoices
  invoiceCount: number;
  newCustomers: number;
  churned: number;     // users set to 'stop' this month
  churnRate: number;   // % of total
  arpu: number;        // avg revenue per user (active at that month)
  cumulativeCustomers: number; // running total active at month end
}

// row type from $queryRaw
interface RawMonthRow { month: string; revenue?: bigint; invoice_count?: bigint; count?: bigint }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];

function getMonthRange(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months + 1);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildMonthList(months: number): string[] {
  const list: string[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    list.push(m);
  }
  return list;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

// ─── GET /api/admin/analytics ─────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get('period') || '12'; // months
    const months = Math.min(Math.max(parseInt(periodParam) || 12, 3), 24);

    const startDate = getMonthRange(months);
    const monthList = buildMonthList(months);

    // ── 1. Revenue by month ──────────────────────────────────────────────────
    const revenueRaw = await prisma.$queryRaw<RawMonthRow[]>`
      SELECT DATE_FORMAT(paidAt, '%Y-%m') as month,
             SUM(amount)                  as revenue,
             COUNT(*)                     as invoice_count
      FROM invoices
      WHERE status = 'PAID'
        AND paidAt >= ${startDate}
        AND paidAt IS NOT NULL
      GROUP BY month
      ORDER BY month ASC
    `;

    // ── 2. New customers by month ────────────────────────────────────────────
    const newCustomersRaw = await prisma.$queryRaw<RawMonthRow[]>`
      SELECT DATE_FORMAT(createdAt, '%Y-%m') as month,
             COUNT(*)                         as count
      FROM pppoe_users
      WHERE createdAt >= ${startDate}
      GROUP BY month
      ORDER BY month ASC
    `;

    // ── 3. Churned users by month (status changed to 'stop') ─────────────────
    //   Approximation: users where status='stop' AND updatedAt falls in month
    const churnRaw = await prisma.$queryRaw<RawMonthRow[]>`
      SELECT DATE_FORMAT(updatedAt, '%Y-%m') as month,
             COUNT(*)                        as count
      FROM pppoe_users
      WHERE status = 'stop'
        AND updatedAt >= ${startDate}
      GROUP BY month
      ORDER BY month ASC
    `;

    // ── 4. Profile breakdown (current active users) ───────────────────────────
    const profileBreakdownRaw = await prisma.pppoeUser.groupBy({
      by: ['profileId'],
      where: { status: { in: ['active', 'isolir'] } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    const profileIds = profileBreakdownRaw.map(p => p.profileId);
    const profiles = await prisma.pppoeProfile.findMany({
      where: { id: { in: profileIds } },
      select: { id: true, name: true },
    });
    const profileMap = new Map(profiles.map(p => [p.id, p.name]));
    const totalActive = profileBreakdownRaw.reduce((s, p) => s + p._count.id, 0);
    const profileBreakdown = profileBreakdownRaw.map(p => ({
      profile: profileMap.get(p.profileId) || p.profileId,
      count: p._count.id,
      percentage: totalActive > 0 ? Math.round((p._count.id / totalActive) * 100) : 0,
    }));

    // ── 5. Area breakdown (current active users) ──────────────────────────────
    const areaBreakdownRaw = await prisma.pppoeUser.groupBy({
      by: ['areaId'],
      where: { status: { in: ['active', 'isolir'] }, areaId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 8,
    });

    const areaIds = areaBreakdownRaw.map(a => a.areaId!).filter(Boolean);
    const areas = areaIds.length > 0
      ? await prisma.pppoeArea.findMany({
          where: { id: { in: areaIds } },
          select: { id: true, name: true },
        })
      : [];
    const areaMap = new Map(areas.map(a => [a.id, a.name]));
    const totalByArea = areaBreakdownRaw.reduce((s, a) => s + a._count.id, 0);
    const areaBreakdown = areaBreakdownRaw.map(a => ({
      area: areaMap.get(a.areaId!) || 'Lainnya',
      count: a._count.id,
      percentage: totalByArea > 0 ? Math.round((a._count.id / totalByArea) * 100) : 0,
    }));

    // ── 6. Merge into monthly data ─────────────────────────────────────────────
    const revenueMap = new Map<string, { revenue: number; invoiceCount: number }>();
    for (const r of revenueRaw) {
      revenueMap.set(r.month, {
        revenue: Number(r.revenue ?? 0),
        invoiceCount: Number(r.invoice_count ?? 0),
      });
    }

    const newCustMap = new Map<string, number>();
    for (const r of newCustomersRaw) {
      newCustMap.set(r.month, Number(r.count ?? 0));
    }

    const churnMap = new Map<string, number>();
    for (const r of churnRaw) {
      churnMap.set(r.month, Number(r.count ?? 0));
    }

    // Running cumulative for active users estimation
    // Baseline: total existing users before startDate
    const baselineCount = await prisma.pppoeUser.count({
      where: { createdAt: { lt: startDate }, status: { not: 'stop' } },
    });
    const baselineChurned = await prisma.pppoeUser.count({
      where: {
        createdAt: { lt: startDate },
        status: 'stop',
        updatedAt: { gte: startDate },
      },
    });

    let cumulativeActive = baselineCount - baselineChurned;
    const monthlyData: MonthlyDataPoint[] = [];

    for (const month of monthList) {
      const newC = newCustMap.get(month) ?? 0;
      const churned = churnMap.get(month) ?? 0;
      const revData = revenueMap.get(month) ?? { revenue: 0, invoiceCount: 0 };

      cumulativeActive = Math.max(0, cumulativeActive + newC - churned);
      const churnRate = cumulativeActive > 0
        ? Math.round((churned / (cumulativeActive + churned)) * 1000) / 10
        : 0;
      const arpu = cumulativeActive > 0
        ? Math.round(revData.revenue / cumulativeActive)
        : 0;

      monthlyData.push({
        month,
        monthLabel: monthLabel(month),
        revenue: revData.revenue,
        invoiceCount: revData.invoiceCount,
        newCustomers: newC,
        churned,
        churnRate,
        arpu,
        cumulativeCustomers: cumulativeActive,
      });
    }

    // ── 7. Summary stats ──────────────────────────────────────────────────────
    const totalRevenue = monthlyData.reduce((s, m) => s + m.revenue, 0);
    const totalNewCustomers = monthlyData.reduce((s, m) => s + m.newCustomers, 0);
    const totalChurned = monthlyData.reduce((s, m) => s + m.churned, 0);
    const nonZeroArpu = monthlyData.filter(m => m.arpu > 0);
    const avgArpu = nonZeroArpu.length > 0
      ? Math.round(nonZeroArpu.reduce((s, m) => s + m.arpu, 0) / nonZeroArpu.length)
      : 0;
    const nonZeroChurn = monthlyData.filter(m => m.churnRate > 0);
    const avgChurnRate = nonZeroChurn.length > 0
      ? Math.round((nonZeroChurn.reduce((s, m) => s + m.churnRate, 0) / nonZeroChurn.length) * 10) / 10
      : 0;
    const avgRetentionRate = Math.round((100 - avgChurnRate) * 10) / 10;

    return NextResponse.json({
      success: true,
      period: months,
      monthlyData,
      profileBreakdown,
      areaBreakdown,
      summary: {
        totalRevenue,
        totalNewCustomers,
        totalChurned,
        avgArpu,
        avgChurnRate,
        avgRetentionRate,
        currentActiveUsers: totalActive,
      },
    });
  } catch (error: any) {
    console.error('[Analytics API]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
