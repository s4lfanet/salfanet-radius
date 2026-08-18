import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC, parseDateAsWIB, nowWIB, formatWIB } from '@/lib/timezone';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hotspot/agent-report
 *
 * Query params:
 *   - type: "daily" | "monthly" (required)
 *   - date: YYYY-MM-DD (for daily)
 *   - month: YYYY-MM (for monthly)
 *   - agentId: specific agent (optional, "all" or empty = all agents)
 *
 * Returns per-agent breakdown with:
 *   - Voucher stock (WAITING)
 *   - Sold (ACTIVE + EXPIRED)
 *   - Revenue, commission, admin earnings
 *   - Sales transaction data from agentSale table
 */
export async function GET(req: NextRequest) {
  try {
    const authCheck = await requirePermission('reports.view');
    if (!authCheck.authorized) return authCheck.response;

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'daily';
    const dateParam = searchParams.get('date');
    const monthParam = searchParams.get('month');
    const agentId = searchParams.get('agentId');

    // Build date range
    let dateStart: Date;
    let dateEnd: Date;
    let periodLabel: string;

    if (type === 'monthly') {
      const monthStr = monthParam || formatWIB(nowWIB(), 'yyyy-MM');
      const [y, m] = monthStr.split('-').map(Number);
      dateStart = startOfDayWIBtoUTC(new Date(Date.UTC(y, m - 1, 1)));
      dateEnd = endOfDayWIBtoUTC(new Date(Date.UTC(y, m, 0)));
      const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      periodLabel = `${monthNames[m - 1]} ${y}`;
    } else {
      // daily
      const dateStr = dateParam || formatWIB(nowWIB(), 'yyyy-MM-dd');
      dateStart = startOfDayWIBtoUTC(dateStr);
      dateEnd = endOfDayWIBtoUTC(dateStr);
      const d = parseDateAsWIB(dateStr);
      const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      periodLabel = `${dayNames[d.getUTCDay()]}, ${d.getUTCDate()} ${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    }

    // Get all agents (or specific one)
    const agentFilter = agentId && agentId !== 'all' ? { id: agentId } : {};
    const agents = await prisma.agent.findMany({
      where: agentFilter,
      select: {
        id: true,
        name: true,
        phone: true,
        isActive: true,
        balance: true,
        router: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Get vouchers in date range, grouped by agent
    // For daily: vouchers created on that day
    // For monthly: vouchers created in that month
    const vouchersInRange = await prisma.hotspotVoucher.findMany({
      where: {
        createdAt: { gte: dateStart, lte: dateEnd },
        ...(agentId && agentId !== 'all' ? { agentId } : {}),
      },
      select: {
        id: true,
        code: true,
        status: true,
        agentId: true,
        profileId: true,
        firstLoginAt: true,
        createdAt: true,
        profile: {
          select: {
            id: true,
            name: true,
            sellingPrice: true,
            costPrice: true,
            resellerFee: true,
          },
        },
      },
    });

    // Get agent sales in date range
    const salesInRange = await prisma.agentSale.findMany({
      where: {
        createdAt: { gte: dateStart, lte: dateEnd },
        ...(agentId && agentId !== 'all' ? { agentId } : {}),
      },
      select: {
        id: true,
        agentId: true,
        voucherCode: true,
        profileName: true,
        amount: true,
        paymentStatus: true,
        createdAt: true,
      },
    });

    // Also get total stock per agent (all vouchers with WAITING status, not date-filtered)
    const stockVouchers = await prisma.hotspotVoucher.findMany({
      where: {
        status: 'WAITING',
        ...(agentId && agentId !== 'all' ? { agentId } : {}),
      },
      select: {
        agentId: true,
        profile: { select: { name: true, sellingPrice: true, costPrice: true, resellerFee: true } },
      },
    });

    // Build per-agent report
    const reportData = agents.map((agent) => {
      const agentVouchers = vouchersInRange.filter((v) => v.agentId === agent.id);
      const agentSales = salesInRange.filter((s) => s.agentId === agent.id);
      const agentStock = stockVouchers.filter((v) => v.agentId === agent.id);

      // Voucher status counts
      const waiting = agentVouchers.filter((v) => v.status === 'WAITING').length;
      const active = agentVouchers.filter((v) => v.status === 'ACTIVE').length;
      const expired = agentVouchers.filter((v) => v.status === 'EXPIRED').length;
      const sold = active + expired;
      const totalGenerated = agentVouchers.length;

      // Financial calculations from vouchers
      let totalRevenue = 0;
      let totalCommission = 0;
      let adminEarnings = 0;

      // Group by profile for breakdown
      const profileBreakdown: Record<string, {
        profileName: string;
        generated: number;
        waiting: number;
        active: number;
        expired: number;
        sold: number;
        sellingPrice: number;
        costPrice: number;
        resellerFee: number;
        revenue: number;
        commission: number;
      }> = {};

      for (const v of agentVouchers) {
        const pid = v.profile.id;
        if (!profileBreakdown[pid]) {
          profileBreakdown[pid] = {
            profileName: v.profile.name,
            generated: 0,
            waiting: 0,
            active: 0,
            expired: 0,
            sold: 0,
            sellingPrice: v.profile.sellingPrice,
            costPrice: v.profile.costPrice,
            resellerFee: v.profile.resellerFee,
            revenue: 0,
            commission: 0,
          };
        }
        const pb = profileBreakdown[pid];
        pb.generated++;
        if (v.status === 'WAITING') pb.waiting++;
        else if (v.status === 'ACTIVE') pb.active++;
        else if (v.status === 'EXPIRED') pb.expired++;

        if (v.status === 'ACTIVE' || v.status === 'EXPIRED') {
          pb.sold++;
          pb.revenue += v.profile.sellingPrice;
          pb.commission += v.profile.resellerFee;
          totalRevenue += v.profile.sellingPrice;
          totalCommission += v.profile.resellerFee;
          adminEarnings += v.profile.costPrice;
        }
      }

      // Sales transaction data
      const totalSalesAmount = agentSales.reduce((sum, s) => sum + s.amount, 0);
      const paidSales = agentSales.filter((s) => s.paymentStatus === 'PAID');
      const unpaidSales = agentSales.filter((s) => s.paymentStatus === 'UNPAID');
      const paidAmount = paidSales.reduce((sum, s) => sum + s.amount, 0);
      const unpaidAmount = unpaidSales.reduce((sum, s) => sum + s.amount, 0);

      // Current stock (all WAITING vouchers, not date filtered)
      const currentStock = agentStock.length;
      const stockValue = agentStock.reduce((sum, v) => sum + (v.profile?.costPrice || 0), 0);

      return {
        agentId: agent.id,
        agentName: agent.name,
        agentPhone: agent.phone,
        isActive: agent.isActive,
        balance: agent.balance,
        router: agent.router,
        // Voucher stats for period
        totalGenerated,
        waiting,
        active,
        expired,
        sold,
        // Financial for period
        totalRevenue,
        totalCommission,
        adminEarnings,
        // Sales transactions for period
        salesCount: agentSales.length,
        totalSalesAmount,
        paidCount: paidSales.length,
        paidAmount,
        unpaidCount: unpaidSales.length,
        unpaidAmount,
        // Current stock (all-time WAITING)
        currentStock,
        stockValue,
        // Profile breakdown
        profileBreakdown: Object.values(profileBreakdown),
      };
    });

    // Sort by totalRevenue desc
    reportData.sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Summary totals
    const summary = {
      totalAgents: reportData.length,
      totalGenerated: reportData.reduce((s, r) => s + r.totalGenerated, 0),
      totalSold: reportData.reduce((s, r) => s + r.sold, 0),
      totalRevenue: reportData.reduce((s, r) => s + r.totalRevenue, 0),
      totalCommission: reportData.reduce((s, r) => s + r.totalCommission, 0),
      totalAdminEarnings: reportData.reduce((s, r) => s + r.adminEarnings, 0),
      totalStock: reportData.reduce((s, r) => s + r.currentStock, 0),
      totalStockValue: reportData.reduce((s, r) => s + r.stockValue, 0),
      totalSalesAmount: reportData.reduce((s, r) => s + r.totalSalesAmount, 0),
      totalPaidAmount: reportData.reduce((s, r) => s + r.paidAmount, 0),
      totalUnpaidAmount: reportData.reduce((s, r) => s + r.unpaidAmount, 0),
    };

    // Get all agents for filter dropdown
    const allAgents = await prisma.agent.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      type,
      periodLabel,
      dateStart: dateStart.toISOString(),
      dateEnd: dateEnd.toISOString(),
      report: reportData,
      summary,
      agents: allAgents,
    });
  } catch (error) {
    console.error('Agent report error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agent report' },
      { status: 500 },
    );
  }
}
