import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { nowWIB, startOfDayWIBtoUTC } from '../../common/utils/timezone';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  /**
   * Get dashboard stats — ported from frontend /api/dashboard/stats
   */
  async getStats(monthParam?: string) {
    const now = nowWIB();
    let selectedYear: number;
    let selectedMonth: number;

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      [selectedYear, selectedMonth] = monthParam.split('-').map(Number);
      selectedMonth -= 1;
    } else {
      selectedYear = now.getUTCFullYear();
      selectedMonth = now.getUTCMonth();
    }

    const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    const startOfMonth = new Date(Date.UTC(selectedYear, selectedMonth, 1));
    const startOfNextMonth = new Date(Date.UTC(selectedYear, selectedMonth + 1, 1));
    const MONTH_NAMES_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const periodLabel = `${MONTH_NAMES_ID[selectedMonth]} ${selectedYear}`;
    const isCurrentMonth = selectedYear === now.getUTCFullYear() && selectedMonth === now.getUTCMonth();

    // 1. Total PPPoE Users
    let totalPppoeUsers = 0;
    try {
      totalPppoeUsers = await this.prisma.pppoeUser.count();
    } catch (e) {
      this.logger.error('Error counting pppoeUser:', e);
    }

    // 2 & 3. Active Sessions
    let activeSessionsPPPoE = 0;
    let activeSessionsHotspot = 0;
    try {
      const normalizeUsername = (u: string) => (u.includes('@') ? u.split('@')[0] : u);
      const activeRadacctSessions = await this.prisma.radacct.findMany({
        where: { acctstoptime: null },
        select: { username: true },
      });
      const onlineUsernames = new Set<string>(
        activeRadacctSessions.map((s) => s.username).filter(Boolean) as string[],
      );
      const allUsernames = [...onlineUsernames];
      let pppoeUsernameSet = new Set<string>();

      if (allUsernames.length > 0) {
        const normalizedUsernames = [...new Set(allUsernames.map(normalizeUsername))];
        const [pppoeUsers, hotspotVouchers] = await Promise.all([
          this.prisma.pppoeUser.findMany({
            where: {
              OR: [
                { username: { in: allUsernames } },
                { username: { in: normalizedUsernames } },
              ],
            },
            select: { username: true },
          }),
          this.prisma.hotspotVoucher.findMany({
            where: { code: { in: allUsernames } },
            select: { code: true },
          }),
        ]);

        pppoeUsernameSet = new Set(pppoeUsers.map((u) => u.username.toLowerCase()));
        const hotspotVoucherSet = new Set(hotspotVouchers.map((v) => v.code));

        for (const username of allUsernames) {
          const raw = username.toLowerCase();
          const normalized = normalizeUsername(username).toLowerCase();
          if (pppoeUsernameSet.has(raw) || pppoeUsernameSet.has(normalized)) {
            activeSessionsPPPoE++;
          } else if (hotspotVoucherSet.has(username)) {
            activeSessionsHotspot++;
          }
        }
      }

      // Synthetic active hotspot vouchers
      const nowTs = new Date();
      const activeCandidates = await this.prisma.hotspotVoucher.findMany({
        where: {
          status: 'ACTIVE',
          firstLoginAt: { not: null },
          code: { notIn: [...onlineUsernames] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: nowTs } }],
        },
        select: { code: true, firstLoginAt: true },
      });
      if (activeCandidates.length > 0) {
        const candidateCodes = activeCandidates.map((v) => v.code);
        const stoppedRows = await this.prisma.radacct.findMany({
          where: { username: { in: candidateCodes }, acctstoptime: { not: null } },
          select: { username: true, acctstoptime: true },
          orderBy: { acctstoptime: 'desc' },
        });
        const latestStopMap = new Map<string, Date>();
        for (const r of stoppedRows) {
          if (r.acctstoptime && !latestStopMap.has(r.username)) {
            latestStopMap.set(r.username, new Date(r.acctstoptime));
          }
        }
        const syntheticCount = activeCandidates.filter((v) => {
          const latestStop = latestStopMap.get(v.code);
          if (!latestStop || !v.firstLoginAt) return true;
          return latestStop.getTime() < new Date(v.firstLoginAt).getTime();
        }).length;
        activeSessionsHotspot += syntheticCount;
      }
    } catch (e) {
      this.logger.error('Error counting active sessions:', e);
    }

    // 4. Unused Hotspot Vouchers
    let unusedVouchers = 0;
    try {
      unusedVouchers = await this.prisma.hotspotVoucher.count({
        where: { status: 'WAITING', firstLoginAt: null },
      });
    } catch (e) {
      this.logger.error('Error counting unused vouchers:', e);
    }

    // 5. Isolated Customers
    let isolatedCount = 0;
    try {
      isolatedCount = await this.prisma.pppoeUser.count({
        where: { status: { in: ['isolated', 'ISOLATED', 'blocked', 'BLOCKED'] } },
      });
    } catch (e) {
      this.logger.error('Error counting isolated users:', e);
    }

    // 6. Suspended Customers
    let suspendedCount = 0;
    try {
      suspendedCount = await this.prisma.pppoeUser.count({
        where: { status: { in: ['suspended', 'SUSPENDED'] } },
      });
    } catch (e) {
      this.logger.error('Error counting suspended users:', e);
    }

    // 6b. Active PPPoE Users
    let activePppoeUsers = 0;
    try {
      activePppoeUsers = await this.prisma.pppoeUser.count({
        where: { status: { in: ['active', 'ACTIVE'] } },
      });
    } catch (e) {
      this.logger.error('Error counting active users:', e);
    }

    // 6c. New Registrations
    let newRegistrations = 0;
    try {
      newRegistrations = await this.prisma.registrationRequest.count({
        where: { status: { in: ['PENDING', 'REVIEWING'] } },
      });
    } catch (e) {
      this.logger.error('Error counting new registrations:', e);
    }

    // 6d. Upcoming Invoices
    let upcomingInvoices: Array<{
      invoiceNumber: string; customerName: string; customerUsername: string;
      amount: number; dueDate: string; status: string; daysUntilDue: number;
    }> = [];
    try {
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const raw = await this.prisma.invoice.findMany({
        where: { status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { lte: sevenDaysFromNow } },
        orderBy: { dueDate: 'asc' },
        take: 20,
        select: {
          invoiceNumber: true, customerName: true, customerUsername: true,
          amount: true, dueDate: true, status: true,
        },
      });
      upcomingInvoices = raw.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName || '-',
        customerUsername: inv.customerUsername || '-',
        amount: inv.amount,
        dueDate: inv.dueDate.toISOString(),
        status: inv.status,
        daysUntilDue: Math.ceil((new Date(inv.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      }));
    } catch (e) {
      this.logger.error('Error loading upcoming invoices:', e);
    }

    // 7. Voucher Revenue
    let voucherRevenue = 0;
    let voucherRevenueToday = 0;
    try {
      const startOfToday = startOfDayWIBtoUTC(now);
      const soldToday = await this.prisma.hotspotVoucher.findMany({
        where: { status: { in: ['ACTIVE', 'EXPIRED'] }, firstLoginAt: { gte: startOfToday } },
        include: { profile: { select: { sellingPrice: true } } },
      });
      voucherRevenueToday = soldToday.reduce((sum, v) => sum + (v.profile?.sellingPrice || 0), 0);

      const voucherCategory = await this.prisma.transactionCategory.findFirst({
        where: { OR: [{ name: { contains: 'hotspot' } }, { name: { contains: 'voucher' } }], type: 'INCOME' },
      });
      if (voucherCategory) {
        const voucherIncome = await this.prisma.transaction.aggregate({
          where: { type: 'INCOME', categoryId: voucherCategory.id, date: { gte: startOfMonth, lt: startOfNextMonth } },
          _sum: { amount: true },
        });
        voucherRevenue = Number(voucherIncome._sum.amount) || 0;
      }
      if (voucherRevenue === 0) {
        const soldVouchers = await this.prisma.hotspotVoucher.findMany({
          where: { status: { in: ['ACTIVE', 'EXPIRED'] }, firstLoginAt: { gte: startOfMonth, lt: startOfNextMonth } },
          include: { profile: { select: { sellingPrice: true } } },
        });
        voucherRevenue = soldVouchers.reduce((sum, v) => sum + (v.profile?.sellingPrice || 0), 0);
      }
    } catch (e) {
      this.logger.error('Error calculating voucher revenue:', e);
    }

    // 8. Invoice Revenue
    let invoiceRevenue = 0, invoiceRevenueToday = 0, invoiceCountToday = 0;
    let invoiceCountMonth = 0, unpaidInvoicesCount = 0, totalAllTimeRevenue = 0;
    try {
      const startOfToday = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
      const [todayAgg, monthAgg, monthCount, unpaidCount, allTimeAgg] = await Promise.all([
        this.prisma.invoice.aggregate({ where: { status: 'PAID', paidAt: { gte: startOfToday } }, _sum: { amount: true }, _count: { id: true } }),
        this.prisma.invoice.aggregate({ where: { status: 'PAID', paidAt: { gte: startOfMonth, lt: startOfNextMonth } }, _sum: { amount: true } }),
        this.prisma.invoice.count({ where: { status: 'PAID', paidAt: { gte: startOfMonth, lt: startOfNextMonth } } }),
        this.prisma.invoice.count({ where: { status: { in: ['PENDING', 'OVERDUE'] } } }),
        this.prisma.invoice.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
      ]);
      invoiceRevenueToday = Number(todayAgg._sum.amount) || 0;
      invoiceCountToday = todayAgg._count.id || 0;
      invoiceRevenue = Number(monthAgg._sum.amount) || 0;
      invoiceCountMonth = monthCount;
      unpaidInvoicesCount = unpaidCount;
      totalAllTimeRevenue = Number(allTimeAgg._sum.amount) || 0;
    } catch (e) {
      this.logger.error('Error calculating invoice revenue:', e);
    }

    // 9. Agent Sales
    const agentSalesData: Array<{ agentId: string; agentName: string; sold: number; revenue: number }> = [];
    let agentSalesTotal = { count: 0, revenue: 0 };
    try {
      const soldVouchersByAgent = await this.prisma.hotspotVoucher.findMany({
        where: { agentId: { not: null }, firstLoginAt: { gte: startOfMonth, lt: startOfNextMonth } },
        select: { agentId: true, agent: { select: { name: true } }, profile: { select: { sellingPrice: true } } },
      });
      const agentMap = new Map<string, { name: string; sold: number; revenue: number }>();
      for (const v of soldVouchersByAgent) {
        if (!v.agentId) continue;
        const entry = agentMap.get(v.agentId) ?? { name: v.agent?.name ?? v.agentId, sold: 0, revenue: 0 };
        entry.sold += 1;
        entry.revenue += v.profile?.sellingPrice ?? 0;
        agentMap.set(v.agentId, entry);
      }
      for (const [agentId, data] of agentMap.entries()) {
        agentSalesData.push({ agentId, agentName: data.name, sold: data.sold, revenue: data.revenue });
        agentSalesTotal.count += data.sold;
        agentSalesTotal.revenue += data.revenue;
      }
      agentSalesData.sort((a, b) => b.sold - a.sold);
      agentSalesData.splice(5);
    } catch (e) {
      this.logger.error('Error loading agent sales:', e);
    }

    // 10. RADIUS Auth Log
    let radiusAuthLog: Array<{ username: string; reply: string; authdate: Date | string }> = [];
    let radiusAuthStats = { acceptToday: 0, rejectToday: 0 };
    try {
      const startOfToday = startOfDayWIBtoUTC(now);
      [radiusAuthLog, radiusAuthStats.acceptToday, radiusAuthStats.rejectToday] = await Promise.all([
        this.prisma.radpostauth.findMany({ orderBy: { authdate: 'desc' }, take: 15, select: { username: true, reply: true, authdate: true } }),
        this.prisma.radpostauth.count({ where: { reply: 'Access-Accept', authdate: { gte: startOfToday } } }),
        this.prisma.radpostauth.count({ where: { reply: 'Access-Reject', authdate: { gte: startOfToday } } }),
      ]);
    } catch (e) {
      this.logger.error('Error loading RADIUS auth log:', e);
    }

    // Recent Activities
    const activities = await this.activityLogService.getRecentActivities(10);

    // System Status
    let radiusStatus = false;
    try {
      const recentRadacct = await this.prisma.radacct.findFirst({
        where: { acctstarttime: { gte: new Date(now.getTime() - 3600000) } },
      });
      radiusStatus = !!recentRadacct;
    } catch {
      radiusStatus = false;
    }

    const formatCurrency = (amount: number) =>
      new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

    return {
      stats: {
        totalPppoeUsers, activePppoeUsers, activeSessionsPPPoE, activeSessionsHotspot,
        unusedVouchers, isolatedCount, suspendedCount, newRegistrations, upcomingInvoices,
        voucherRevenue, voucherRevenueFormatted: formatCurrency(voucherRevenue),
        voucherRevenueToday, voucherRevenueTodayFormatted: formatCurrency(voucherRevenueToday),
        invoiceRevenue, invoiceRevenueFormatted: formatCurrency(invoiceRevenue),
        invoiceRevenueToday, invoiceRevenueTodayFormatted: formatCurrency(invoiceRevenueToday),
        invoiceCountToday, invoiceCountMonth, unpaidInvoicesCount,
        totalAllTimeRevenue, totalAllTimeRevenueFormatted: formatCurrency(totalAllTimeRevenue),
      },
      activities,
      systemStatus: { radius: radiusStatus, database: true, api: true },
      agentSales: agentSalesData,
      agentSalesTotal,
      radiusAuthLog,
      radiusAuthStats,
      periodLabel,
      monthKey,
      isCurrentMonth,
    };
  }

  /**
   * Get dashboard analytics — ported from frontend /api/dashboard/analytics
   */
  async getAnalytics(type: string = 'all') {
    const now = nowWIB();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const result: Record<string, unknown> = {};

    // Revenue
    if (type === 'all' || type === 'revenue') {
      const monthlyRevenue = [];
      for (let i = 11; i >= 0; i--) {
        const date = new Date(Date.UTC(currentYear, currentMonth - i, 1));
        const startOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
        const endOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59));
        const income = await this.prisma.transaction.aggregate({
          where: { type: 'INCOME', date: { gte: startOfMonth, lte: endOfMonth } },
          _sum: { amount: true },
        });
        monthlyRevenue.push({
          month: `${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear().toString().slice(-2)}`,
          revenue: Number(income._sum.amount) || 0,
        });
      }

      const startOfCurrentMonth = new Date(Date.UTC(currentYear, currentMonth, 1));
      const categoryRevenue = await this.prisma.transaction.groupBy({
        by: ['categoryId'],
        where: { type: 'INCOME', date: { gte: startOfCurrentMonth } },
        _sum: { amount: true },
      });
      const categories = await this.prisma.transactionCategory.findMany({
        where: { id: { in: categoryRevenue.map((c) => c.categoryId).filter(Boolean) as string[] } },
      });
      const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
      const revenueByCategory = categoryRevenue
        .filter((c) => c.categoryId)
        .map((c) => ({ category: categoryMap.get(c.categoryId!) || 'Lainnya', amount: Number(c._sum.amount) || 0 }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 6);

      result.revenue = { monthly: monthlyRevenue, byCategory: revenueByCategory };
    }

    // Users
    if (type === 'all' || type === 'users') {
      const usersByStatus = await this.prisma.pppoeUser.groupBy({ by: ['status'], _count: { id: true } });
      const statusMap: Record<string, string> = { active: 'Active', expired: 'Expired', suspended: 'Suspended', disabled: 'Disabled' };
      const userStatusData = usersByStatus.map((u) => ({ name: statusMap[u.status] || u.status, value: u._count.id }));

      const userGrowth = [];
      let cumulativeTotal = 0;
      const twelveMonthsAgo = new Date(Date.UTC(currentYear, currentMonth - 11, 1));
      const usersBefore = await this.prisma.pppoeUser.count({ where: { createdAt: { lt: twelveMonthsAgo } } });
      cumulativeTotal = usersBefore;
      for (let i = 11; i >= 0; i--) {
        const date = new Date(Date.UTC(currentYear, currentMonth - i, 1));
        const startOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
        const endOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59));
        const newUsers = await this.prisma.pppoeUser.count({ where: { createdAt: { gte: startOfMonth, lte: endOfMonth } } });
        cumulativeTotal += newUsers;
        userGrowth.push({
          month: `${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear().toString().slice(-2)}`,
          newUsers, totalUsers: cumulativeTotal,
        });
      }
      result.users = { byStatus: userStatusData, growth: userGrowth };
    }

    // Hotspot
    if (type === 'all' || type === 'hotspot') {
      const startOfCurrentMonth = new Date(Date.UTC(currentYear, currentMonth, 1));
      const vouchersByProfile = await this.prisma.hotspotVoucher.groupBy({
        by: ['profileId'],
        where: { status: { in: ['ACTIVE', 'EXPIRED'] }, createdAt: { gte: startOfCurrentMonth } },
        _count: true,
      });
      const profiles = await this.prisma.hotspotProfile.findMany({
        where: { id: { in: vouchersByProfile.map((v) => v.profileId) } },
      });
      const profileMap = new Map(profiles.map((p) => [p.id, p.name]));
      const voucherSalesData = vouchersByProfile
        .map((v) => ({ profile: profileMap.get(v.profileId) || 'Unknown', sold: v._count || 0 }))
        .sort((a, b) => b.sold - a.sold)
        .slice(0, 8);
      const vouchersByStatus = await this.prisma.hotspotVoucher.groupBy({ by: ['status'], _count: true });
      const voucherStatusData = vouchersByStatus.map((v) => ({ name: v.status, value: v._count || 0 }));
      result.hotspot = { salesByProfile: voucherSalesData, byStatus: voucherStatusData };
    }

    // Sessions
    if (type === 'all' || type === 'sessions') {
      const sessionsData = [];
      for (let i = 23; i >= 0; i--) {
        const nowMs = now.getTime();
        const hourStart = new Date(nowMs - (i + 1) * 60 * 60 * 1000);
        const hourEnd = new Date(nowMs - i * 60 * 60 * 1000);
        const pppoeCount = await this.prisma.radacct.count({
          where: { acctstarttime: { lte: hourEnd }, OR: [{ acctstoptime: null }, { acctstoptime: { gte: hourStart } }], groupname: { not: 'hotspot' } },
        });
        const hotspotCount = await this.prisma.radacct.count({
          where: { acctstarttime: { lte: hourEnd }, OR: [{ acctstoptime: null }, { acctstoptime: { gte: hourStart } }], groupname: 'hotspot' },
        });
        sessionsData.push({ time: `${hourEnd.getUTCHours().toString().padStart(2, '0')}:00`, pppoe: pppoeCount, hotspot: hotspotCount });
      }
      const bandwidthData = [];
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(Date.UTC(currentYear, currentMonth, now.getUTCDate() - i, 0, 0, 0));
        const dayEnd = new Date(Date.UTC(currentYear, currentMonth, now.getUTCDate() - i, 23, 59, 59));
        const bandwidth = await this.prisma.radacct.aggregate({
          where: { acctstarttime: { gte: dayStart, lte: dayEnd } },
          _sum: { acctinputoctets: true, acctoutputoctets: true },
        });
        const uploadMB = Number(bandwidth._sum.acctinputoctets || 0) / (1024 * 1024);
        const downloadMB = Number(bandwidth._sum.acctoutputoctets || 0) / (1024 * 1024);
        bandwidthData.push({ time: `${dayStart.getUTCDate()}/${dayStart.getUTCMonth() + 1}`, upload: Math.round(uploadMB), download: Math.round(downloadMB) });
      }
      result.sessions = { hourly: sessionsData, bandwidth: bandwidthData };
    }

    // Financial
    if (type === 'all' || type === 'financial') {
      const incomeExpenseData = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date(Date.UTC(currentYear, currentMonth - i, 1));
        const startOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
        const endOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59));
        const income = await this.prisma.transaction.aggregate({ where: { type: 'INCOME', date: { gte: startOfMonth, lte: endOfMonth } }, _sum: { amount: true } });
        const expense = await this.prisma.transaction.aggregate({ where: { type: 'EXPENSE', date: { gte: startOfMonth, lte: endOfMonth } }, _sum: { amount: true } });
        incomeExpenseData.push({ month: monthNames[date.getUTCMonth()], income: Number(income._sum.amount) || 0, expense: Number(expense._sum.amount) || 0 });
      }
      const startOfCurrentMonth = new Date(Date.UTC(currentYear, currentMonth, 1));
      const topSources = await this.prisma.transaction.groupBy({
        by: ['description'],
        where: { type: 'INCOME', date: { gte: startOfCurrentMonth } },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      });
      let topRevenueData = topSources.map((s) => ({ source: s.description?.substring(0, 30) || 'Lainnya', amount: Number(s._sum.amount) || 0 }));
      if (topRevenueData.length === 0) {
        const categoryRevenue = await this.prisma.transaction.groupBy({
          by: ['categoryId'],
          where: { type: 'INCOME', date: { gte: startOfCurrentMonth }, NOT: { categoryId: undefined } },
          _sum: { amount: true },
          orderBy: { _sum: { amount: 'desc' } },
          take: 5,
        });
        const categories = await this.prisma.transactionCategory.findMany({
          where: { id: { in: categoryRevenue.map((c) => c.categoryId).filter(Boolean) as string[] } },
        });
        const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
        topRevenueData = categoryRevenue.map((c) => ({ source: categoryMap.get(c.categoryId!) || 'Lainnya', amount: Number(c._sum?.amount) || 0 }));
      }
      result.financial = { incomeExpense: incomeExpenseData, topSources: topRevenueData };
    }

    return result;
  }

  /**
   * Get traffic data — ported from frontend /api/dashboard/traffic
   */
  async getTraffic() {
    const routers = await this.prisma.router.findMany({
      where: { isActive: true },
      select: { id: true, name: true, nasname: true, ipAddress: true },
    });

    if (routers.length === 0) {
      return { routers: [], message: 'No active routers found' };
    }

    const sessionAggs = await this.prisma.radacct.groupBy({
      by: ['nasipaddress'],
      where: { acctstoptime: null },
      _sum: { acctinputoctets: true, acctoutputoctets: true },
      _count: { radacctid: true },
    });

    const aggByNas = new Map<string, { rxBytes: number; txBytes: number; sessions: number }>();
    for (const agg of sessionAggs) {
      aggByNas.set(agg.nasipaddress, {
        rxBytes: Number(agg._sum.acctoutputoctets ?? 0),
        txBytes: Number(agg._sum.acctinputoctets ?? 0),
        sessions: agg._count.radacctid,
      });
    }

    const routerTraffic = routers.map((router) => {
      const stats = aggByNas.get(router.nasname) || aggByNas.get(router.ipAddress) || { rxBytes: 0, txBytes: 0, sessions: 0 };
      return {
        routerId: router.id,
        routerName: router.name,
        interfaces: [{
          name: 'active-sessions',
          rxBytes: stats.rxBytes,
          txBytes: stats.txBytes,
          rxRate: 0, txRate: 0, rxPackets: 0, txPackets: 0,
          running: stats.sessions > 0,
        }],
      };
    });

    return { routers: routerTraffic, timestamp: new Date().toISOString() };
  }
}
