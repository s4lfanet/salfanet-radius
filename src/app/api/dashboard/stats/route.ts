import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/config";
import { getRecentActivities } from "@/server/services/activity-log.service";
import { cacheGetOrSet, redisDel, RedisKeys } from "@/server/cache/redis";
import { nowWIB, startOfDayWIBtoUTC } from "@/lib/timezone";

// Disable caching for this route - always fetch fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATS_CACHE_TTL = 30; // 30 detik — cukup fresh untuk dashboard

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as any).role;

    // Parse optional ?month=YYYY-MM param (defaults to current WIB month)
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get('month'); // e.g. "2026-02"
    const nowLocal = nowWIB();
    let selectedYear: number;
    let selectedMonth: number; // 0-indexed
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      [selectedYear, selectedMonth] = monthParam.split('-').map(Number);
      selectedMonth -= 1; // convert 1-indexed to 0-indexed
    } else {
      selectedYear = nowLocal.getUTCFullYear();
      selectedMonth = nowLocal.getUTCMonth();
    }
    const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

    // Force refresh jika query param ?refresh=1
    if (searchParams.get('refresh') === '1') {
      await redisDel(`${RedisKeys.dashboardStats()}:${monthKey}`);
    }

    // Wrap semua DB queries dalam cache Redis 30 detik
    const result = await cacheGetOrSet(
      `${RedisKeys.dashboardStats()}:${monthKey}`,
      STATS_CACHE_TTL,
      async () => {
    const now = nowWIB();
    const startOfMonth = new Date(Date.UTC(selectedYear, selectedMonth, 1));
    const startOfNextMonth = new Date(Date.UTC(selectedYear, selectedMonth + 1, 1));
    // last day of selected month (handles 28/29/30/31 days correctly)
    const endOfMonth = new Date(Date.UTC(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999));
    const MONTH_NAMES_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const periodLabel = `${MONTH_NAMES_ID[selectedMonth]} ${selectedYear}`;
    const isCurrentMonth = (selectedYear === now.getUTCFullYear() && selectedMonth === now.getUTCMonth());

    // ==================== 1. Total PPPoE Users ====================
    let totalPppoeUsers = 0;
    try {
      totalPppoeUsers = await prisma.pppoeUser.count();
    } catch (e) {
      console.error('[Dashboard] Error counting pppoeUser:', e);
    }

    // ==================== 2 & 3. Active Sessions (PPPoE & Hotspot separate) ====================
    let activeSessionsPPPoE = 0;
    let activeSessionsHotspot = 0;

    try {
      // ── Sumber kebenaran: radacct (konsisten dengan halaman Sesi) ──
      // Active = acctstoptime IS NULL (sama persis dengan halaman Sesi)
      // TIDAK menggunakan Redis fallback — Redis online:users bisa stale jika
      // Accounting-Stop tidak terkirim, menghasilkan false positive di dashboard.
      const activeRadacctSessions = await prisma.radacct.findMany({
        where: {
          acctstoptime: null,
        },
        select: {
          username: true,
          servicetype: true,
          framedprotocol: true,
        },
      });

      const normalizeUsername = (u: string) => u.includes('@') ? u.split('@')[0] : u;

      const uniqueUsernames = [...new Set(
        activeRadacctSessions.map(s => s.username).filter(Boolean)
      )] as string[];

      const normalizedUsernames = [...new Set(
        uniqueUsernames.map(normalizeUsername).filter(Boolean)
      )];

      if (uniqueUsernames.length > 0) {
        // Kategorisasi yang lebih robust:
        // 1) Hint dari RADIUS attrs (framedprotocol/servicetype)
        // 2) Lookup username exact + normalized (user@realm -> user)
        // 3) Fallback berdasarkan pola username
        const [pppoeUsers, hotspotVouchers] = await Promise.all([
          prisma.pppoeUser.findMany({
            where: {
              OR: [
                { username: { in: uniqueUsernames } },
                { username: { in: normalizedUsernames } },
              ],
            },
            select: { username: true },
          }),
          prisma.hotspotVoucher.findMany({
            where: {
              OR: [
                { code: { in: uniqueUsernames } },
                { code: { in: normalizedUsernames } },
              ],
            },
            select: { code: true },
          }),
        ]);

        const pppoeUsernameSet = new Set(pppoeUsers.map(u => u.username.toLowerCase()));
        const hotspotCodeSet = new Set(hotspotVouchers.map(v => v.code.toLowerCase()));

        const classifySessionType = (username: string, serviceType?: string | null, framedProtocol?: string | null): 'pppoe' | 'hotspot' => {
          const raw = username.toLowerCase();
          const normalized = normalizeUsername(username).toLowerCase();
          const service = (serviceType || '').toLowerCase();
          const protocol = (framedProtocol || '').toLowerCase();

          // Prefer RADIUS hints first when available.
          if (protocol.includes('ppp')) return 'pppoe';
          if (service.includes('framed')) return 'pppoe';

          // Then exact/normalized lookup.
          if (hotspotCodeSet.has(raw) || hotspotCodeSet.has(normalized)) return 'hotspot';
          if (pppoeUsernameSet.has(raw) || pppoeUsernameSet.has(normalized)) return 'pppoe';

          // Heuristic fallback: PPPoE often uses realm-style username.
          if (username.includes('@')) return 'pppoe';
          return 'hotspot';
        };

        const usernameTypeMap = new Map<string, 'pppoe' | 'hotspot'>();
        for (const s of activeRadacctSessions) {
          if (!s.username) continue;
          const detectedType = classifySessionType(s.username, s.servicetype, s.framedprotocol);
          const prev = usernameTypeMap.get(s.username);
          // If any active record for a username indicates PPPoE, keep PPPoE as stronger signal.
          if (!prev || detectedType === 'pppoe') {
            usernameTypeMap.set(s.username, detectedType);
          }
        }

        for (const type of usernameTypeMap.values()) {
          if (type === 'pppoe') activeSessionsPPPoE++;
          else activeSessionsHotspot++;
        }
      }
    } catch (e) {
      console.error('[Dashboard] Error counting active sessions:', e);
    }

    // ==================== 4. Unused Hotspot Vouchers ====================
    let unusedVouchers = 0;
    try {
      unusedVouchers = await prisma.hotspotVoucher.count({
        where: {
          status: 'WAITING',
          firstLoginAt: null,
        },
      });
    } catch (e) {
      console.error('[Dashboard] Error counting unused vouchers:', e);
    }

    // ==================== 5. Isolated Customers ====================
    let isolatedCount = 0;
    try {
      isolatedCount = await prisma.pppoeUser.count({
        where: { status: 'isolated' },
      });
    } catch (e) {
      console.error('[Dashboard] Error counting isolated users:', e);
    }

    // ==================== 6. Suspended Customers (Stop Langganan) ====================
    let suspendedCount = 0;
    try {
      suspendedCount = await prisma.pppoeUser.count({
        where: { status: 'suspended' },
      });
    } catch (e) {
      console.error('[Dashboard] Error counting suspended users:', e);
    }

    // ==================== 7. Voucher Revenue (this month) ====================
    let voucherRevenue = 0;
    try {
      // Try from Keuangan transactions with hotspot/voucher category
      const voucherCategory = await prisma.transactionCategory.findFirst({
        where: {
          OR: [
            { name: { contains: 'hotspot' } },
            { name: { contains: 'voucher' } },
          ],
          type: 'INCOME',
        },
      });

      if (voucherCategory) {
        const voucherIncome = await prisma.transaction.aggregate({
          where: {
            type: 'INCOME',
            categoryId: voucherCategory.id,
            date: { gte: startOfMonth, lt: startOfNextMonth },
          },
          _sum: { amount: true },
        });
        voucherRevenue = Number(voucherIncome._sum.amount) || 0;
      }

      // If no category found, estimate from sold vouchers (by firstLoginAt)
      if (voucherRevenue === 0) {
        const soldVouchers = await prisma.hotspotVoucher.findMany({
          where: {
            status: { in: ['ACTIVE', 'EXPIRED'] },
            firstLoginAt: { gte: startOfMonth, lt: startOfNextMonth },
          },
          include: { profile: { select: { sellingPrice: true } } },
        });
        voucherRevenue = soldVouchers.reduce((sum, v) => sum + (v.profile?.sellingPrice || 0), 0);
      }
    } catch (e) {
      console.error('[Dashboard] Error calculating voucher revenue:', e);
    }

    // ==================== 8. Invoice Revenue (Tagihan) this month ====================
    let invoiceRevenue = 0;
    try {
      const paidInvoices = await prisma.invoice.aggregate({
        where: {
          status: 'PAID',
          paidAt: { gte: startOfMonth, lt: startOfNextMonth },
        },
        _sum: { amount: true },
      });
      invoiceRevenue = Number(paidInvoices._sum.amount) || 0;
    } catch (e) {
      console.error('[Dashboard] Error calculating invoice revenue:', e);
    }

    // ==================== 9. Agent Voucher Sales (this month) ====================
    const agentSalesData: { agentId: string; agentName: string; sold: number; revenue: number }[] = [];
    let agentSalesTotal = { count: 0, revenue: 0 };
    try {
      const soldVouchersByAgent = await prisma.hotspotVoucher.findMany({
        where: {
          agentId: { not: null },
          firstLoginAt: { gte: startOfMonth, lt: startOfNextMonth },
        },
        select: {
          agentId: true,
          agent: { select: { name: true } },
          profile: { select: { sellingPrice: true } },
        },
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
      agentSalesData.splice(5); // top 5 only
    } catch (e) {
      console.error('[Dashboard] Error loading agent sales:', e);
    }

    // ==================== 10. RADIUS Auth Log ====================
    let radiusAuthLog: { username: string; reply: string; authdate: Date | string }[] = [];
    let radiusAuthStats = { acceptToday: 0, rejectToday: 0 };
    try {
      const startOfToday = startOfDayWIBtoUTC(now);

      [radiusAuthLog, radiusAuthStats.acceptToday, radiusAuthStats.rejectToday] = await Promise.all([
        prisma.radpostauth.findMany({
          orderBy: { authdate: 'desc' },
          take: 15,
          select: { username: true, reply: true, authdate: true },
        }),
        prisma.radpostauth.count({
          where: { reply: 'Access-Accept', authdate: { gte: startOfToday } },
        }),
        prisma.radpostauth.count({
          where: { reply: 'Access-Reject', authdate: { gte: startOfToday } },
        }),
      ]);
    } catch (e) {
      console.error('[Dashboard] Error loading RADIUS auth log:', e);
    }

    // ==================== Recent Activities ====================
    const activities = await getRecentActivities(10);

    // ==================== System Status ====================
    let radiusStatus = false;
    const databaseStatus = true;
    const apiStatus = true;

    try {
      const recentRadacct = await prisma.radacct.findFirst({
        where: {
          acctstarttime: { gte: new Date(now.getTime() - 3600000) },
        },
      });
      radiusStatus = !!recentRadacct;
    } catch (error) {
      radiusStatus = false;
    }

    // ==================== Format currency ====================
    const formatCurrency = (amount: number) =>
      new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);

    return {
      stats: {
        totalPppoeUsers,
        activeSessionsPPPoE,
        activeSessionsHotspot,
        unusedVouchers,
        isolatedCount,
        suspendedCount,
        voucherRevenue,
        voucherRevenueFormatted: formatCurrency(voucherRevenue),
        invoiceRevenue,
        invoiceRevenueFormatted: formatCurrency(invoiceRevenue),
      },
      activities,
      systemStatus: {
        radius: radiusStatus,
        database: databaseStatus,
        api: apiStatus,
      },
      agentSales: agentSalesData,
      agentSalesTotal,
      radiusAuthLog,
      radiusAuthStats,
      periodLabel,
      monthKey,
      isCurrentMonth,
    };
    }) // end cacheGetOrSet

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
