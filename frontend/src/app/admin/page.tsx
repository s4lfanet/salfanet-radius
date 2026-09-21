'use client';

import React, { useEffect, useState } from 'react';
import { AdminBackgroundGlow } from '@/components/AdminBackgroundGlow';
import {
  Users,
  Wifi,
  Activity,
  Loader2,
  CheckCircle2,
  RefreshCw,
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
  Wallet,
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

interface AnalyticsData {
  users?: {
    byStatus: { name: string; value: number }[];
  };
  financial?: {
    incomeExpense: { month: string; income: number; expense: number }[];
  };
}

interface PaymentActivity {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerUsername: string | null;
  amount: number;
  paidAt: string;
  methodLabel: 'online' | 'transfer' | 'collector' | 'admin' | 'other';
  actorLabel: string;
}

interface PaymentActivityResponse {
  success: boolean;
  activities: PaymentActivity[];
}

interface NewCustomer {
  id: string;
  name: string;
  username: string;
  phone: string;
  status: string;
  createdAt: string;
  subscriptionType: string;
  profile: { name: string } | null;
  area: { name: string } | null;
}

interface NewCustomersResponse {
  success: boolean;
  month: string;
  count: number;
  customers: NewCustomer[];
}

interface AgentSaleEntry {
  agentId: string;
  agentName: string;
  sold: number;
  revenue: number;
}

interface DashboardStatsResponse {
  success: boolean;
  stats: DashboardStats;
  activities: RecentActivity[];
  agentSales: AgentSaleEntry[];
  agentSalesTotal: { count: number; revenue: number };
  periodLabel?: string;
}

interface AnalyticsResponse {
  success: boolean;
  data: AnalyticsData;
}

interface _ActivityLogResponse {
  success: boolean;
  total: number;
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

  // ─── React Query: Analytics (5min polling) ────────────────────────────────
  const analyticsQuery = useApiQuery<AnalyticsResponse>('/api/dashboard/analytics', {
    params: { type: 'all' },
    refetchInterval: 300000,
    staleTime: 0,
  });

  // ─── React Query: New customers for the selected month (same month-picker
  // as dashboard stats above) ────────────────────────────────────────────────
  const newCustomersQuery = useApiQuery<NewCustomersResponse>('/api/dashboard/new-customers', {
    params: { month: dashboardMonth },
    staleTime: 0,
  });

  // ─── React Query: Recent payment activity (1min polling) — independent of
  // the month picker above, always shows the latest settlements ───────────────
  const paymentActivityQuery = useApiQuery<PaymentActivityResponse>('/api/dashboard/payment-activity', {
    params: { limit: 15 },
    refetchInterval: 60000,
    staleTime: 0,
  });

  // Derive state from queries
  const stats = dashboardQuery.data?.stats ?? null;
  const agentSales = dashboardQuery.data?.agentSales ?? [];
  const agentSalesTotal = dashboardQuery.data?.agentSalesTotal ?? { count: 0, revenue: 0 };
  const periodLabel = dashboardQuery.data?.periodLabel ?? '';
  const analyticsData = analyticsQuery.data?.data ?? null;
  const loading = dashboardQuery.isPending;
  const analyticsLoading = analyticsQuery.isFetching;
  const newCustomers = newCustomersQuery.data?.customers ?? [];
  const newCustomersLoading = newCustomersQuery.isFetching;
  const paymentActivities = paymentActivityQuery.data?.activities ?? [];
  const paymentActivityLoading = paymentActivityQuery.isFetching;

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
  // Gradient reduced to 4 semantic families instead of a different hue per
  // card: blue = counts/activity, emerald = revenue, amber = needs action,
  // red = problem state. Was 12 unrelated hues competing on one screen.
  const statCards: StatCard[] = stats ? [
    {
      title: t('dashboard.totalPppoeUsers'),
      value: stats.totalPppoeUsers.toLocaleString(),
      icon: <Users className="w-5 h-5" />,
      gradient: 'from-blue-500 to-blue-400',
      bgGlow: 'bg-blue-500/20',
      href: '/admin/pppoe/users',
    },
    {
      title: 'Pelanggan Aktif',
      value: stats.activePppoeUsers.toLocaleString(),
      subtitle: 'PPPoE status aktif',
      icon: <CheckCircle2 className="w-5 h-5" />,
      gradient: 'from-emerald-500 to-emerald-400',
      bgGlow: 'bg-emerald-500/20',
    },
    {
      title: t('dashboard.activePppoeSessions'),
      value: stats.activeSessionsPPPoE.toLocaleString(),
      icon: <Activity className="w-5 h-5" />,
      gradient: 'from-blue-500 to-blue-400',
      bgGlow: 'bg-blue-500/20',
      href: '/admin/sessions/pppoe',
    },
    {
      title: t('dashboard.activeHotspotSessions'),
      value: stats.activeSessionsHotspot.toLocaleString(),
      icon: <Wifi className="w-5 h-5" />,
      gradient: 'from-blue-500 to-blue-400',
      bgGlow: 'bg-blue-500/20',
      href: '/admin/sessions/hotspot',
    },
    {
      title: 'Registrasi Online Baru',
      value: stats.newRegistrations.toLocaleString(),
      subtitle: 'Menunggu proses',
      icon: <UserPlus className="w-5 h-5" />,
      gradient: 'from-amber-500 to-amber-400',
      bgGlow: 'bg-amber-500/20',
      href: '/admin/pppoe/registrations',
    },
    {
      title: t('dashboard.unusedVouchers'),
      value: stats.unusedVouchers.toLocaleString(),
      icon: <Ticket className="w-5 h-5" />,
      gradient: 'from-blue-500 to-blue-400',
      bgGlow: 'bg-blue-500/20',
    },
    {
      title: t('dashboard.isolatedCustomers'),
      value: stats.isolatedCount.toLocaleString(),
      subtitle: 'Isolir & diblokir',
      icon: <ShieldBan className="w-5 h-5" />,
      gradient: 'from-red-500 to-red-400',
      bgGlow: 'bg-red-500/20',
    },
    {
      title: t('dashboard.suspendedCustomers'),
      value: stats.suspendedCount.toLocaleString(),
      subtitle: 'Stop langganan',
      icon: <UserX className="w-5 h-5" />,
      gradient: 'from-red-500 to-red-400',
      bgGlow: 'bg-red-500/20',
    },
    {
      title: t('dashboard.voucherRevenue'),
      value: stats.voucherRevenueFormatted,
      subtitle: periodLabel || t('dashboard.thisMonth'),
      detail: `Hari ini: ${stats.voucherRevenueTodayFormatted}`,
      icon: <DollarSign className="w-5 h-5" />,
      gradient: 'from-emerald-500 to-emerald-400',
      bgGlow: 'bg-emerald-500/20',
    },
    {
      title: t('dashboard.invoiceRevenue'),
      value: stats.invoiceRevenueFormatted,
      subtitle: `${stats.invoiceCountMonth} tagihan • ${periodLabel || t('dashboard.thisMonth')}`,
      detail: `Hari ini: ${stats.invoiceRevenueTodayFormatted} (${stats.invoiceCountToday})`,
      icon: <Receipt className="w-5 h-5" />,
      gradient: 'from-emerald-500 to-emerald-400',
      bgGlow: 'bg-emerald-500/20',
    },
    {
      title: 'Belum Bayar',
      value: stats.unpaidInvoicesCount.toLocaleString(),
      subtitle: 'Tagihan pending & overdue',
      icon: <AlertTriangle className="w-5 h-5" />,
      gradient: 'from-amber-500 to-amber-400',
      bgGlow: 'bg-amber-500/20',
      href: '/admin/invoices',
    },
    {
      title: 'Omzet Total',
      value: fmtIDR(totalMonthRevenue),
      subtitle: `Invoice + Voucher • ${periodLabel || t('dashboard.thisMonth')}`,
      detail: `Invoice: ${stats.invoiceRevenueFormatted}`,
      icon: <TrendingUp className="w-5 h-5" />,
      gradient: 'from-emerald-500 to-emerald-400',
      bgGlow: 'bg-emerald-500/20',
    },
  ] : [];

  return (
    <div className="bg-background relative">
      <AdminBackgroundGlow />

      <div className="relative z-10 space-y-6 pb-8">
            {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-brand-500 dark:via-white dark:to-pink-500">
              {t('dashboard.title')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2 mt-1">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
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
              onClick={() => { dashboardQuery.refetch(); analyticsQuery.refetch(); newCustomersQuery.refetch(); paymentActivityQuery.refetch(); }}
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
            <Loader2 className="h-8 w-8 animate-spin text-brand-500 dark:text-brand-500" />
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
                      <p className="text-[10px] sm:text-[11px] font-medium text-muted-foreground uppercase tracking-wider line-clamp-2 leading-tight" title={card.title}>
                        {card.title}
                      </p>
                      <p className="text-lg sm:text-2xl font-bold text-foreground mt-1 sm:mt-1.5 truncate">
                        {card.value}
                      </p>
                      {card.subtitle && (
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{card.subtitle}</p>
                      )}
                      {card.detail && (
                        <p className="text-[10px] sm:text-xs text-brand-500/60 mt-0.5 font-medium">{card.detail}</p>
                      )}
                    </div>
                    <div className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-gradient-to-br ${card.gradient} text-white shadow-lg flex-shrink-0 flex items-center justify-center`}>
                      {React.cloneElement(card.icon, { className: 'w-4 h-4 sm:w-5 sm:h-5' })}
                    </div>
                  </div>
                </>
              );
              const cls = 'relative bg-card/60 rounded-xl border border-white/10 p-3 sm:p-4 hover:border-white/20 transition-all group overflow-hidden';
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
                  <p className="text-xs text-muted-foreground">
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
                    ? 'bg-red-400'
                    : isUrgent
                    ? 'bg-amber-400'
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
                        <p className="text-xs font-medium text-foreground truncate">{inv.customerName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
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

          {/* Payment Activity Log */}
          <div className="bg-card/60 rounded-xl border border-white/10 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-success/10 border border-success/20">
                  <Wallet className="w-3.5 h-3.5 text-success" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-foreground">{t('dashboard.paymentActivity')}</h2>
                  <p className="text-xs text-muted-foreground">{t('dashboard.paymentActivitySubtitle')}</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[236px] divide-y divide-white/5">
              {paymentActivityLoading && paymentActivities.length === 0 ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : paymentActivities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-1">
                  <Wallet className="h-5 w-5 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">{t('dashboard.noPaymentActivity')}</p>
                </div>
              ) : (
                paymentActivities.map((activity) => {
                  const dotColor = activity.methodLabel === 'online'
                    ? 'bg-blue-400'
                    : activity.methodLabel === 'collector'
                    ? 'bg-success'
                    : activity.methodLabel === 'transfer'
                    ? 'bg-amber-400'
                    : 'bg-muted-foreground';
                  return (
                    <div key={activity.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] transition-colors">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{activity.customerName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{activity.actorLabel}</p>
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0 ml-2">
                        <span className="text-xs font-semibold text-foreground">
                          {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(activity.amount)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{formatWIB(new Date(activity.paidAt), 'dd MMM, HH:mm')}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* Agent Voucher Sales Row */}
        <div className="grid grid-cols-1 gap-4">

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
        </div>

        {/* New Customers This Month */}
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-card/60 rounded-xl border border-white/10 overflow-hidden">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-white/10 min-w-0">
              <div>
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-primary" />
                  {t('dashboard.newCustomers')}
                </h2>
                <p className="text-[10px] text-muted-foreground mt-0.5">{periodLabel}</p>
              </div>
              <span className="px-2 py-1 text-[10px] font-medium bg-primary/10 text-primary rounded-lg border border-border flex-shrink-0">
                {newCustomers.length} {t('dashboard.customers')}
              </span>
            </div>

            {newCustomersLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : newCustomers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <UserPlus className="h-5 w-5 mx-auto mb-1 opacity-50" />
                <p className="text-xs">{t('dashboard.noNewCustomers')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">{t('dashboard.customerName')}</th>
                      <th className="py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">Username</th>
                      <th className="py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">{t('dashboard.package')}</th>
                      <th className="py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">Area</th>
                      <th className="py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">{t('dashboard.registeredAt')}</th>
                      <th className="py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {newCustomers.map((c) => {
                      const statusStyle = c.status === 'active'
                        ? 'text-success'
                        : c.status === 'isolated' || c.status === 'suspended'
                        ? 'text-warning'
                        : c.status === 'blocked' || c.status === 'stop'
                        ? 'text-destructive'
                        : 'text-muted-foreground';
                      return (
                        <tr key={c.id} className="hover:bg-white/[0.03] transition-colors">
                          <td className="py-2 px-3 text-xs font-medium text-foreground whitespace-nowrap">{c.name}</td>
                          <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">{c.username}</td>
                          <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">{c.profile?.name || '-'}</td>
                          <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">{c.area?.name || '-'}</td>
                          <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">{formatWIB(new Date(c.createdAt), 'dd MMM yyyy')}</td>
                          <td className={`py-2 px-3 text-xs font-medium whitespace-nowrap ${statusStyle}`}>{c.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
