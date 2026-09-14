'use client';

import React, { useEffect, useState } from 'react';
import {
  Users,
  Wifi,
  Activity,
  Loader2,
  Server,
  Database,
  Zap,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ShieldCheck,
  Ticket,
  Receipt,
  TrendingUp,
  DollarSign,
  PieChart as PieChartIcon,
  Store,
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  ShieldBan,
  UserX,
  UserPlus,
  AlertTriangle,
} from 'lucide-react';
import { formatWIB, getTimezoneInfo, nowWIB } from '@/lib/timezone';
import { useTranslation } from '@/hooks/useTranslation';
import { useApiQuery } from '@/lib/api/hooks';
import {
  UserStatusPieChart,
  ChartCard,
} from '@/components/charts';

interface DashboardStats {
  totalPppoeUsers: number;
  activePppoeUsers: number;
  activeSessionsPPPoE: number;
  activeSessionsHotspot: number;
  unusedVouchers: number;
  isolatedCount: number;
  suspendedCount: number;
  newRegistrations: number;
  upcomingInvoices: UpcomingInvoice[];
  voucherRevenue: number;
  voucherRevenueFormatted: string;
  voucherRevenueToday: number;
  voucherRevenueTodayFormatted: string;
  invoiceRevenue: number;
  invoiceRevenueFormatted: string;
  invoiceRevenueToday: number;
  invoiceRevenueTodayFormatted: string;
  invoiceCountToday: number;
  invoiceCountMonth: number;
  unpaidInvoicesCount: number;
  totalAllTimeRevenue: number;
  totalAllTimeRevenueFormatted: string;
}

interface UpcomingInvoice {
  invoiceNumber: string;
  customerName: string;
  customerUsername: string;
  amount: number;
  dueDate: string;
  status: string;
  daysUntilDue: number;
}

interface RecentActivity {
  id: string;
  user: string;
  action: string;
  time: string;
  status: 'success' | 'warning' | 'error';
}

interface ActivityLogEntry {
  id: string;
  username: string;
  userRole?: string;
  action: string;
  description: string;
  module: string;
  status: 'success' | 'warning' | 'error';
  ipAddress?: string;
  createdAt: string;
}

interface RadiusStatus {
  status: 'running' | 'stopped';
  uptime: string;
}

interface AnalyticsData {
  users?: {
    byStatus: { name: string; value: number }[];
  };
  financial?: {
    incomeExpense: { month: string; income: number; expense: number }[];
  };
}

interface AgentSaleEntry {
  agentId: string;
  agentName: string;
  sold: number;
  revenue: number;
}

interface RadiusAuthEntry {
  username: string;
  reply: string;
  authdate: string;
}

interface DashboardStatsResponse {
  success: boolean;
  stats: DashboardStats;
  activities: RecentActivity[];
  systemStatus: { radius: boolean; database: boolean; api: boolean };
  agentSales: AgentSaleEntry[];
  agentSalesTotal: { count: number; revenue: number };
  radiusAuthLog: RadiusAuthEntry[];
  radiusAuthStats: { acceptToday: number; rejectToday: number };
  periodLabel?: string;
}

interface AnalyticsResponse {
  success: boolean;
  data: AnalyticsData;
}

interface ActivityLogResponse {
  success: boolean;
  activities: ActivityLogEntry[];
  total: number;
  hasMore: boolean;
}

type IconElement = React.ReactElement<{ className?: string }>;

interface StatCard {
  title: string;
  value: string;
  subtitle?: string;
  detail?: string;
  icon: IconElement;
  gradient: string;
  bgGlow: string;
  href?: string;
}

export default function AdminDashboard() {
  const tzInfo = getTimezoneInfo();
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');

  const DAY_NAMES_ID = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const MONTH_NAMES_ID_DATE = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  function getIndonesianDate(d: Date): string {
    return `${DAY_NAMES_ID[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_NAMES_ID_DATE[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  // Month filter for revenue stats
  const [dashboardMonth, setDashboardMonth] = useState<string>(() => formatWIB(nowWIB(), 'yyyy-MM'));
  const { t } = useTranslation();

  // ─── React Query: Dashboard stats (30s polling) ───────────────────────────
  const dashboardQuery = useApiQuery<DashboardStatsResponse>('/api/dashboard/stats', {
    params: { month: dashboardMonth },
    refetchInterval: 30000,
    staleTime: 0,
  });

  // ─── React Query: RADIUS status (30s polling) ─────────────────────────────
  const radiusStatusQuery = useApiQuery<RadiusStatus>('/api/system/radius', {
    refetchInterval: 30000,
    staleTime: 0,
  });

  // ─── React Query: Analytics (5min polling) ────────────────────────────────
  const analyticsQuery = useApiQuery<AnalyticsResponse>('/api/dashboard/analytics', {
    params: { type: 'all' },
    refetchInterval: 300000,
    staleTime: 0,
  });

  // ─── React Query: Activity log total count ────────────────────────────────
  const activityQuery = useApiQuery<ActivityLogResponse>('/api/admin/activity-logs', {
    params: { limit: 1, offset: 0 },
    staleTime: 30000,
  });

  // Derive state from queries
  const stats = dashboardQuery.data?.stats ?? null;
  const systemStatus = dashboardQuery.data?.systemStatus ?? null;
  const agentSales = dashboardQuery.data?.agentSales ?? [];
  const agentSalesTotal = dashboardQuery.data?.agentSalesTotal ?? { count: 0, revenue: 0 };
  const radiusAuthStats = dashboardQuery.data?.radiusAuthStats ?? { acceptToday: 0, rejectToday: 0 };
  const periodLabel = dashboardQuery.data?.periodLabel ?? '';
  const analyticsData = analyticsQuery.data?.data ?? null;
  const radiusStatus = radiusStatusQuery.data ?? null;
  const activityTotal = activityQuery.data?.total ?? 0;
  const loading = dashboardQuery.isPending;
  const analyticsLoading = analyticsQuery.isFetching;

  // Clock tick (local, 1s)
  useEffect(() => {
    const now0 = nowWIB();
    setCurrentTime(formatWIB(now0, 'HH:mm:ss'));
    setCurrentDate(getIndonesianDate(now0));

    const timeInterval = setInterval(() => {
      const now = nowWIB();
      setCurrentTime(formatWIB(now, 'HH:mm:ss'));
      setCurrentDate(getIndonesianDate(now));
    }, 1000);

    return () => clearInterval(timeInterval);
  }, []);

  // Navigate months
  const shiftMonth = (delta: number) => {
    const [y, m] = dashboardMonth.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    const next = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    setDashboardMonth(next);
  };

  // Define stat cards with data
  const fmtIDR = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
  const totalMonthRevenue = stats ? (stats.invoiceRevenue + stats.voucherRevenue) : 0;
  const statCards: StatCard[] = stats ? [
    {
      title: t('dashboard.totalPppoeUsers'),
      value: stats.totalPppoeUsers.toLocaleString(),
      icon: <Users className="w-5 h-5" />,
      gradient: 'from-blue-500 to-cyan-400',
      bgGlow: 'bg-blue-500/20',
      href: '/admin/pppoe/users',
    },
    {
      title: 'Pelanggan Aktif',
      value: stats.activePppoeUsers.toLocaleString(),
      subtitle: 'PPPoE status aktif',
      icon: <CheckCircle2 className="w-5 h-5" />,
      gradient: 'from-emerald-500 to-green-400',
      bgGlow: 'bg-emerald-500/20',
    },
    {
      title: t('dashboard.activePppoeSessions'),
      value: stats.activeSessionsPPPoE.toLocaleString(),
      icon: <Activity className="w-5 h-5" />,
      gradient: 'from-cyan-500 to-teal-400',
      bgGlow: 'bg-cyan-500/20',
      href: '/admin/sessions/pppoe',
    },
    {
      title: t('dashboard.activeHotspotSessions'),
      value: stats.activeSessionsHotspot.toLocaleString(),
      icon: <Wifi className="w-5 h-5" />,
      gradient: 'from-primary to-primary',
      bgGlow: 'bg-primary/10',
      href: '/admin/sessions/hotspot',
    },
    {
      title: 'Registrasi Online Baru',
      value: stats.newRegistrations.toLocaleString(),
      subtitle: 'Menunggu proses',
      icon: <UserPlus className="w-5 h-5" />,
      gradient: 'from-pink-500 to-rose-400',
      bgGlow: 'bg-pink-500/20',
      href: '/admin/pppoe/registrations',
    },
    {
      title: t('dashboard.unusedVouchers'),
      value: stats.unusedVouchers.toLocaleString(),
      icon: <Ticket className="w-5 h-5" />,
      gradient: 'from-amber-500 to-yellow-400',
      bgGlow: 'bg-amber-500/20',
    },
    {
      title: t('dashboard.isolatedCustomers'),
      value: stats.isolatedCount.toLocaleString(),
      subtitle: 'Isolir & diblokir',
      icon: <ShieldBan className="w-5 h-5" />,
      gradient: 'from-red-500 to-rose-400',
      bgGlow: 'bg-red-500/20',
    },
    {
      title: t('dashboard.suspendedCustomers'),
      value: stats.suspendedCount.toLocaleString(),
      subtitle: 'Stop langganan',
      icon: <UserX className="w-5 h-5" />,
      gradient: 'from-orange-500 to-amber-400',
      bgGlow: 'bg-orange-500/20',
    },
    {
      title: t('dashboard.voucherRevenue'),
      value: stats.voucherRevenueFormatted,
      subtitle: periodLabel || t('dashboard.thisMonth'),
      detail: `Hari ini: ${stats.voucherRevenueTodayFormatted}`,
      icon: <DollarSign className="w-5 h-5" />,
      gradient: 'from-fuchsia-500 to-pink-400',
      bgGlow: 'bg-fuchsia-500/20',
    },
    {
      title: t('dashboard.invoiceRevenue'),
      value: stats.invoiceRevenueFormatted,
      subtitle: `${stats.invoiceCountMonth} tagihan • ${periodLabel || t('dashboard.thisMonth')}`,
      detail: `Hari ini: ${stats.invoiceRevenueTodayFormatted} (${stats.invoiceCountToday})`,
      icon: <Receipt className="w-5 h-5" />,
      gradient: 'from-teal-500 to-cyan-400',
      bgGlow: 'bg-teal-500/20',
    },
    {
      title: 'Belum Bayar',
      value: stats.unpaidInvoicesCount.toLocaleString(),
      subtitle: 'Tagihan pending & overdue',
      icon: <AlertTriangle className="w-5 h-5" />,
      gradient: 'from-orange-500 to-red-400',
      bgGlow: 'bg-orange-500/20',
      href: '/admin/invoices',
    },
    {
      title: 'Omzet Total',
      value: fmtIDR(totalMonthRevenue),
      subtitle: `Invoice + Voucher • ${periodLabel || t('dashboard.thisMonth')}`,
      detail: `Invoice: ${stats.invoiceRevenueFormatted}`,
      icon: <TrendingUp className="w-5 h-5" />,
      gradient: 'from-lime-500 to-green-400',
      bgGlow: 'bg-lime-500/20',
    },
  ] : [];

  return (
    <div className="bg-background relative">
      {/* Neon Cyberpunk Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-48 h-48 sm:w-96 sm:h-96 bg-primary/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-48 h-48 sm:w-96 sm:h-96 bg-brand-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-48 h-48 sm:w-96 sm:h-96 bg-pink-500/20 rounded-full blur-3xl"></div>
        <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>

      <div className="relative z-10 space-y-6">
            {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-brand-500 dark:via-white dark:to-pink-500 dark:drop-">
              {t('dashboard.title')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2 mt-1">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse "></span>
              {tzInfo.name} &bull; {currentDate} &bull; {currentTime}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Month navigator */}
            <div className="flex items-center gap-1 bg-brand-500/5 border border-brand-500/20 rounded-lg px-1 py-1">
              <button
                onClick={() => shiftMonth(-1)}
                className="p-1 rounded hover:bg-brand-500/15 text-brand-500/70 hover:text-brand-500 transition-colors"
                title={t('dashboard.prevMonth')}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium text-brand-500 min-w-[90px] text-center">
                {periodLabel || '...'}
              </span>
              <button
                onClick={() => shiftMonth(1)}
                disabled={dashboardMonth >= formatWIB(nowWIB(), 'yyyy-MM')}
                className="p-1 rounded hover:bg-brand-500/15 text-brand-500/70 hover:text-brand-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title={t('dashboard.nextMonth')}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => { dashboardQuery.refetch(); analyticsQuery.refetch(); }}
              disabled={loading || analyticsLoading}
              className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium bg-brand-500/10 border-2 border-brand-500/30 text-brand-500 rounded-lg hover:bg-brand-500/20 disabled:opacity-50 transition-all "
            >
              <RefreshCw className={`w-3.5 h-3.5 ${(loading || analyticsLoading) ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </button>
          </div>
        </div>

        {/* Stats Grid - 4 columns */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-brand-500 dark:text-brand-500 dark:drop-" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-6 gap-2 sm:gap-3">
            {statCards.map((card) => {
              const inner = (
                <>
                  {/* Background glow */}
                  <div className={`absolute -top-8 -right-8 w-24 h-24 ${card.bgGlow} rounded-full blur-2xl opacity-50 group-hover:opacity-80 transition-opacity`} />
                  <div className="relative flex items-center justify-between gap-2 min-w-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] sm:text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate">
                        {card.title}
                      </p>
                      <p className="text-lg sm:text-2xl font-bold text-foreground mt-1 sm:mt-1.5 truncate">
                        {card.value}
                      </p>
                      {card.subtitle && (
                        <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">{card.subtitle}</p>
                      )}
                      {card.detail && (
                        <p className="text-[9px] sm:text-[10px] text-brand-500/60 mt-0.5 font-medium">{card.detail}</p>
                      )}
                    </div>
                    <div className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-gradient-to-br ${card.gradient} text-white shadow-lg flex-shrink-0 flex items-center justify-center`}>
                      {React.cloneElement(card.icon, { className: 'w-4 h-4 sm:w-5 sm:h-5' })}
                    </div>
                  </div>
                </>
              );
              const cls = 'relative bg-card/60 rounded-xl border border-white/10 p-3 sm:p-4 hover:border-white/20 hover: transition-all group overflow-hidden';
              return card.href ? (
                <a key={card.title} href={card.href} className={cls}>{inner}</a>
              ) : (
                <div key={card.title} className={cls}>{inner}</div>
              );
            })}
          </div>
        )}

        {/* Charts + Activities Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* User Status Pie Chart */}
          <ChartCard
            title={t('dashboard.customerStatus')}
            subtitle={t('dashboard.pppoeUsers')}
            action={<PieChartIcon className="w-4 h-4 text-muted-foreground" />}
          >
            <UserStatusPieChart
              data={analyticsData?.users?.byStatus || []}
              loading={analyticsLoading}
              height={220}
            />
          </ChartCard>

          {/* Upcoming / Overdue Invoices */}
          <div className="bg-card/60 rounded-xl border border-white/10 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-pink-500/10 border border-pink-500/20">
                  <CalendarClock className="w-3.5 h-3.5 text-pink-500" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-foreground">Tagihan Jatuh Tempo</h2>
                  <p className="text-[10px] text-muted-foreground">
                    {stats?.upcomingInvoices?.length
                      ? `${stats.upcomingInvoices.length} pelanggan (H-7 s/d jatuh tempo)`
                      : 'Pelanggan dengan tagihan mendekati jatuh tempo'}
                  </p>
                </div>
              </div>
              <a
                href="/admin/invoices"
                className="text-[10px] text-pink-500 hover:text-pink-500/80 transition-colors"
              >
                Lihat semua
              </a>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[236px] divide-y divide-white/5">
              {!stats || stats.upcomingInvoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-1">
                  <CheckCircle2 className="h-5 w-5 text-green-400/40" />
                  <p className="text-[10px] text-muted-foreground">Tidak ada tagihan mendekati jatuh tempo</p>
                </div>
              ) : (
                stats.upcomingInvoices.map((inv) => {
                  const isOverdue = inv.status === 'OVERDUE';
                  const isUrgent = !isOverdue && inv.daysUntilDue <= 3;
                  const dotColor = isOverdue
                    ? 'bg-red-400 '
                    : isUrgent
                    ? 'bg-amber-400 '
                    : 'bg-yellow-400/70';
                  const labelColor = isOverdue ? 'text-red-400' : isUrgent ? 'text-amber-400' : 'text-yellow-400';
                  const labelText = isOverdue
                    ? `Terlambat ${Math.abs(inv.daysUntilDue)}h`
                    : inv.daysUntilDue === 0
                    ? 'Hari ini'
                    : `${inv.daysUntilDue}h lagi`;
                  return (
                    <div key={inv.invoiceNumber} className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] transition-colors">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-foreground truncate">{inv.customerName}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {inv.invoiceNumber} &bull; {inv.customerUsername}
                        </p>
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0 ml-2">
                        <span className="text-[11px] font-semibold text-foreground">
                          {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(inv.amount)}
                        </span>
                        <span className={`text-[9px] font-medium ${labelColor}`}>{labelText}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Activity Log - link to dedicated page */}
          <a
            href="/admin/logs/activity"
            className="bg-card/60 rounded-xl border border-white/10 p-4 flex flex-col justify-between hover:border-brand-500/40 transition-all group"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-brand-500/10 border border-brand-500/20">
                <Activity className="w-3.5 h-3.5 text-brand-500" />
              </div>
              <div>
                <h2 className="text-xs font-semibold text-foreground">{t('dashboard.activityLog')}</h2>
                <p className="text-[10px] text-muted-foreground/60">{t('dashboard.activitySubtitle')}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {activityTotal > 0 ? t('dashboard.activityCount', { count: String(activityTotal) }) : t('dashboard.noActivities')}
              </span>
              <span className="text-[10px] text-brand-500 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                {t('dashboard.viewAll') || 'Lihat semua'} <ChevronRight className="w-3 h-3" />
              </span>
            </div>
          </a>
        </div>

        {/* Agent Voucher Sales + RADIUS Auth Log Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Agent Voucher Sales */}
          <div className="bg-card/60 rounded-xl border border-white/10 p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3 min-w-0">
              <div>
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Store className="w-4 h-4 text-primary" />
                  {t('dashboard.agentVoucherSales')}
                </h2>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t('dashboard.agentVoucherSalesSubtitle')}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 text-[10px] font-medium bg-primary/10 text-primary rounded-lg border border-border">
                  {agentSalesTotal.count} {t('dashboard.agentVouchersSold')}
                </span>
              </div>
            </div>
            {agentSales.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Store className="h-5 w-5 mx-auto mb-1 opacity-50" />
                <p className="text-xs">{t('dashboard.noAgentSales')}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="grid grid-cols-3 gap-2 px-2 mb-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t('dashboard.agentName')}</span>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center">{t('dashboard.agentVouchersSold')}</span>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-right">{t('dashboard.agentRevenue')}</span>
                </div>
                {agentSales.map((agent, i) => (
                  <div key={agent.agentId} className="grid grid-cols-3 gap-2 items-center p-2 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-pink-500 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-xs font-medium text-foreground truncate">{agent.agentName}</span>
                    </div>
                    <span className="text-xs font-bold text-brand-500 text-center">{agent.sold.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground text-right">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(agent.revenue)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between p-2 border-t border-white/10 mt-1">
                  <span className="text-[10px] text-muted-foreground">{t('dashboard.agentTotalRevenue')}</span>
                  <span className="text-xs font-bold text-primary">
                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(agentSalesTotal.revenue)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* RADIUS Auth Log - link to dedicated page */}
          <a
            href="/admin/freeradius/logs"
            className="bg-card/60 rounded-xl border border-white/10 p-3 sm:p-4 hover:border-brand-500/40 transition-all group"
          >
            <div className="flex items-center justify-between mb-3 min-w-0">
              <div>
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-brand-500" />
                  {t('dashboard.radiusAuthLog')}
                </h2>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t('dashboard.radiusAuthLogSubtitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-1 text-[10px] font-medium bg-green-500/20 text-green-400 rounded-lg border border-green-500/30">
                &#10003; {radiusAuthStats.acceptToday} {t('dashboard.todayAccepted')}
              </span>
              <span className="px-2 py-1 text-[10px] font-medium bg-red-500/20 text-red-400 rounded-lg border border-red-500/30">
                &#10007; {radiusAuthStats.rejectToday} {t('dashboard.todayRejected')}
              </span>
            </div>
            <div className="flex items-center justify-end">
              <span className="text-[10px] text-brand-500 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                {t('dashboard.viewAll') || 'Lihat semua'} <ChevronRight className="w-3 h-3" />
              </span>
            </div>
          </a>
        </div>

        {/* System Status - link to dedicated page */}
        <a
          href="/admin/system"
          className="bg-card/60 rounded-xl border border-border p-3 sm:p-4 hover:border-brand-500/40 transition-all group block"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">{t('dashboard.systemStatus')}</h2>
            <span className="text-[10px] text-brand-500 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
              {t('dashboard.viewAll') || 'Lihat semua'} <ChevronRight className="w-3 h-3" />
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            {/* RADIUS Server */}
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                radiusStatus?.status === 'running' ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                <Server className={`w-4 h-4 ${
                  radiusStatus?.status === 'running' ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{t('system.radius')}</p>
                <div className="flex items-center gap-1">
                  {radiusStatus?.status === 'running' ? (
                    <>
                      <CheckCircle2 className="w-2.5 h-2.5 text-green-500 dark:text-green-400" />
                      <span className="text-[10px] text-green-500 dark:text-green-400 truncate">{radiusStatus.uptime}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-2.5 h-2.5 text-red-500 dark:text-red-400" />
                      <span className="text-[10px] text-red-500 dark:text-red-400">{t('system.offline')}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Database */}
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                systemStatus?.database ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                <Database className={`w-4 h-4 ${
                  systemStatus?.database ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                }`} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-foreground">{t('system.database')}</p>
                <div className="flex items-center gap-1">
                  {systemStatus?.database ? (
                    <>
                      <CheckCircle2 className="w-2.5 h-2.5 text-green-500 dark:text-green-400" />
                      <span className="text-[10px] text-green-500 dark:text-green-400">{t('system.connected')}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-2.5 h-2.5 text-red-500 dark:text-red-400" />
                      <span className="text-[10px] text-red-500 dark:text-red-400">{t('system.disconnected')}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* API */}
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                systemStatus?.api ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                <Zap className={`w-4 h-4 ${
                  systemStatus?.api ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                }`} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-foreground">{t('system.api')}</p>
                <div className="flex items-center gap-1">
                  {systemStatus?.api ? (
                    <>
                      <CheckCircle2 className="w-2.5 h-2.5 text-green-500 dark:text-green-400" />
                      <span className="text-[10px] text-green-500 dark:text-green-400">{t('system.running')}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-2.5 h-2.5 text-red-500 dark:text-red-400" />
                      <span className="text-[10px] text-red-500 dark:text-red-400">{t('system.stopped')}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </a>


      </div>
    </div>
  );
}
