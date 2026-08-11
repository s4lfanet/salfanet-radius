import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/config";
import { nowWIB } from "@/lib/timezone";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Helper to format month name
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';

    const now = nowWIB();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();

    const result: any = {};

    // ==================== REVENUE DATA ====================
    if (type === 'all' || type === 'revenue') {
      // Monthly revenue for last 12 months
      const monthlyRevenue = [];
      for (let i = 11; i >= 0; i--) {
        const date = new Date(Date.UTC(currentYear, currentMonth - i, 1));
        const startOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
        const endOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59));

        const income = await prisma.transaction.aggregate({
          where: {
            type: 'INCOME',
            date: { gte: startOfMonth, lte: endOfMonth },
          },
          _sum: { amount: true },
        });

        monthlyRevenue.push({
          month: `${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear().toString().slice(-2)}`,
          revenue: Number(income._sum.amount) || 0,
        });
      }

      // Revenue by category (this month)
      const startOfCurrentMonth = new Date(Date.UTC(currentYear, currentMonth, 1));
      const categoryRevenue = await prisma.transaction.groupBy({
        by: ['categoryId'],
        where: {
          type: 'INCOME',
          date: { gte: startOfCurrentMonth },
        },
        _sum: { amount: true },
      });

      const categories = await prisma.transactionCategory.findMany({
        where: { id: { in: categoryRevenue.map(c => c.categoryId).filter(Boolean) as string[] } },
      });

      const categoryMap = new Map(categories.map(c => [c.id, c.name]));
      const revenueByCategory = categoryRevenue
        .filter(c => c.categoryId)
        .map(c => ({
          category: categoryMap.get(c.categoryId!) || 'Lainnya',
          amount: Number(c._sum.amount) || 0,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 6);

      result.revenue = {
        monthly: monthlyRevenue,
        byCategory: revenueByCategory,
      };
    }

    // ==================== USER STATISTICS ====================
    if (type === 'all' || type === 'users') {
      // User by status
      const usersByStatus = await prisma.pppoeUser.groupBy({
        by: ['status'],
        _count: { id: true },
      });

      const statusMap: Record<string, string> = {
        'active': 'Active',
        'expired': 'Expired',
        'suspended': 'Suspended',
        'disabled': 'Disabled',
      };

      const userStatusData = usersByStatus.map(u => ({
        name: statusMap[u.status] || u.status,
        value: u._count.id,
      }));

      // User growth per month
      const userGrowth = [];
      let cumulativeTotal = 0;

      // Get total users before 12 months ago
      const twelveMonthsAgo = new Date(Date.UTC(currentYear, currentMonth - 11, 1));
      const usersBefore = await prisma.pppoeUser.count({
        where: { createdAt: { lt: twelveMonthsAgo } },
      });
      cumulativeTotal = usersBefore;

      for (let i = 11; i >= 0; i--) {
        const date = new Date(Date.UTC(currentYear, currentMonth - i, 1));
        const startOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
        const endOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59));

        const newUsers = await prisma.pppoeUser.count({
          where: { createdAt: { gte: startOfMonth, lte: endOfMonth } },
        });

        cumulativeTotal += newUsers;

        userGrowth.push({
          month: `${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear().toString().slice(-2)}`,
          newUsers,
          totalUsers: cumulativeTotal,
        });
      }

      result.users = {
        byStatus: userStatusData,
        growth: userGrowth,
      };
    }

    // ==================== HOTSPOT ANALYTICS ====================
    if (type === 'all' || type === 'hotspot') {
      // Voucher sales by profile (this month)
      const startOfCurrentMonth = new Date(Date.UTC(currentYear, currentMonth, 1));
      
      const vouchersByProfile = await prisma.hotspotVoucher.groupBy({
        by: ['profileId'],
        where: {
          status: { in: ['ACTIVE', 'EXPIRED'] },
          createdAt: { gte: startOfCurrentMonth },
        },
        _count: true,
      });

      const profiles = await prisma.hotspotProfile.findMany({
        where: { id: { in: vouchersByProfile.map(v => v.profileId) } },
      });

      const profileMap = new Map(profiles.map(p => [p.id, p.name]));
      const voucherSalesData = vouchersByProfile
        .map(v => ({
          profile: profileMap.get(v.profileId) || 'Unknown',
          sold: v._count || 0,
        }))
        .sort((a, b) => b.sold - a.sold)
        .slice(0, 8);

      // Voucher by status
      const vouchersByStatus = await prisma.hotspotVoucher.groupBy({
        by: ['status'],
        _count: true,
      });

      const voucherStatusData = vouchersByStatus.map(v => ({
        name: v.status,
        value: v._count || 0,
      }));

      result.hotspot = {
        salesByProfile: voucherSalesData,
        byStatus: voucherStatusData,
      };
    }

    // ==================== SESSION MONITORING ====================
    if (type === 'all' || type === 'sessions') {
      // Session counts for last 24 hours (hourly)
      const sessionsData = [];
      const hoursAgo = 24;

      for (let i = hoursAgo - 1; i >= 0; i--) {
        const nowMs = now.getTime(); // WIB-as-UTC base time
        const hourStart = new Date(nowMs - (i + 1) * 60 * 60 * 1000);
        const hourEnd = new Date(nowMs - i * 60 * 60 * 1000);

        // Count sessions active during this hour
        const pppoeCount = await prisma.radacct.count({
          where: {
            acctstarttime: { lte: hourEnd },
            OR: [
              { acctstoptime: null },
              { acctstoptime: { gte: hourStart } },
            ],
            groupname: { not: 'hotspot' },
          },
        });

        const hotspotCount = await prisma.radacct.count({
          where: {
            acctstarttime: { lte: hourEnd },
            OR: [
              { acctstoptime: null },
              { acctstoptime: { gte: hourStart } },
            ],
            groupname: 'hotspot',
          },
        });

        sessionsData.push({
          time: `${hourEnd.getUTCHours().toString().padStart(2, '0')}:00`,
          pppoe: pppoeCount,
          hotspot: hotspotCount,
        });
      }

      // Bandwidth usage for last 7 days (daily)
      const bandwidthData = [];
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(Date.UTC(currentYear, currentMonth, now.getUTCDate() - i, 0, 0, 0));
        const dayEnd = new Date(Date.UTC(currentYear, currentMonth, now.getUTCDate() - i, 23, 59, 59));

        const bandwidth = await prisma.radacct.aggregate({
          where: {
            acctstarttime: { gte: dayStart, lte: dayEnd },
          },
          _sum: {
            acctinputoctets: true,
            acctoutputoctets: true,
          },
        });

        const uploadMB = Number(bandwidth._sum.acctinputoctets || 0) / (1024 * 1024);
        const downloadMB = Number(bandwidth._sum.acctoutputoctets || 0) / (1024 * 1024);

        bandwidthData.push({
          time: `${dayStart.getUTCDate()}/${dayStart.getUTCMonth() + 1}`,
          upload: Math.round(uploadMB),
          download: Math.round(downloadMB),
        });
      }

      result.sessions = {
        hourly: sessionsData,
        bandwidth: bandwidthData,
      };
    }

    // ==================== FINANCIAL OVERVIEW ====================
    if (type === 'all' || type === 'financial') {
      // Income vs Expense for last 6 months
      const incomeExpenseData = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date(Date.UTC(currentYear, currentMonth - i, 1));
        const startOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
        const endOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59));

        const income = await prisma.transaction.aggregate({
          where: {
            type: 'INCOME',
            date: { gte: startOfMonth, lte: endOfMonth },
          },
          _sum: { amount: true },
        });

        const expense = await prisma.transaction.aggregate({
          where: {
            type: 'EXPENSE',
            date: { gte: startOfMonth, lte: endOfMonth },
          },
          _sum: { amount: true },
        });

        incomeExpenseData.push({
          month: monthNames[date.getUTCMonth()],
          income: Number(income._sum.amount) || 0,
          expense: Number(expense._sum.amount) || 0,
        });
      }

      // Top revenue sources (this month)
      const startOfCurrentMonth = new Date(Date.UTC(currentYear, currentMonth, 1));
      const topSources = await prisma.transaction.groupBy({
        by: ['description'],
        where: {
          type: 'INCOME',
          date: { gte: startOfCurrentMonth },
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      });

      const topRevenueData = topSources.map(s => ({
        source: s.description?.substring(0, 30) || 'Lainnya',
        amount: Number(s._sum.amount) || 0,
      }));

      // If no transaction descriptions, use categories
      if (topRevenueData.length === 0) {
        const categoryRevenue = await prisma.transaction.groupBy({
          by: ['categoryId'],
          where: {
            type: 'INCOME',
            date: { gte: startOfCurrentMonth },
            NOT: { categoryId: undefined },
          },
          _sum: { amount: true },
          orderBy: { _sum: { amount: 'desc' } },
          take: 5,
        });

        const categories = await prisma.transactionCategory.findMany({
          where: { id: { in: categoryRevenue.map(c => c.categoryId).filter(Boolean) as string[] } },
        });

        const categoryMap = new Map(categories.map(c => [c.id, c.name]));
        topRevenueData.push(...categoryRevenue.map(c => ({
          source: categoryMap.get(c.categoryId!) || 'Lainnya',
          amount: Number(c._sum?.amount) || 0,
        })));
      }

      result.financial = {
        incomeExpense: incomeExpenseData,
        topSources: topRevenueData,
      };
    }

    return NextResponse.json({
      success: true,
      data: result,
    });

  } catch (error: any) {
    console.error("Analytics error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
