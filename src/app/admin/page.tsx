'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Users,
  Wifi,
  Activity,
  Clock,
  Loader2,
  Server,
  Database,
  Zap,
  CheckCircle2,
  XCircle,
  RotateCw,
  RefreshCw,
  ShieldBan,
  UserX,
  Ticket,
  Receipt,
  TrendingUp,
  DollarSign,
  BarChart3,
  PieChart as PieChartIcon,
  Store,
  ShieldCheck,
  ShieldX,
  LogIn,
  CreditCard,
  Settings,
  MessageSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Network,
  Globe,
  FileText,
  UserPlus,
  CalendarClock,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { formatWIB, getTimezoneInfo, nowWIB } from '@/lib/timezone';
import { useTranslation } from '@/hooks/useTranslation';
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

const MODULE_CONFIG: Record<string, { label: string; color: string; Icon: any }> = {
  auth:        { label: 'Login',     color: 'text-blue-400 bg-blue-500/20 border-blue-500/30',        Icon: LogIn },
  payment:     { label: 'Bayar',     color: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30', Icon: CreditCard },
  pppoe:       { label: 'PPPoE',     color: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30',         Icon: Network },
  hotspot:     { label: 'Hotspot',   color: 'text-violet-400 bg-violet-500/20 border-violet-500/30',   Icon: Wifi },
  voucher:     { label: 'Voucher',   color: 'text-amber-400 bg-amber-500/20 border-amber-500/30',      Icon: Ticket },
  invoice:     { label: 'Tagihan',   color: 'text-pink-400 bg-pink-500/20 border-pink-500/30',         Icon: FileText },
  transaction: { label: 'Transaksi', color: 'text-teal-400 bg-teal-500/20 border-teal-500/30',         Icon: Receipt },
  settings:    { label: 'Setting',   color: 'text-orange-400 bg-orange-500/20 border-orange-500/30',   Icon: Settings },
  system:      { label: 'Sistem',    color: 'text-red-400 bg-red-500/20 border-red-500/30',            Icon: Server },
  whatsapp:    { label: 'WA',        color: 'text-green-400 bg-green-500/20 border-green-500/30',      Icon: MessageSquare },
  network:     { label: 'Jaringan',  color: 'text-indigo-400 bg-indigo-500/20 border-indigo-500/30',  Icon: Globe },
  session:     { label: 'Sesi',      color: 'text-slate-400 bg-slate-500/20 border-slate-500/30',     Icon: Clock },
  user:        { label: 'User',      color: 'text-fuchsia-400 bg-fuchsia-500/20 border-fuchsia-500/30',Icon: Users },
  agent:       { label: 'Agen',      color: 'text-lime-400 bg-lime-500/20 border-lime-500/30',        Icon: Store },
};

const ACTIVITY_TABS = [
  { key: 'all',     label: 'Semua' },
  { key: 'auth',    label: 'Login' },
  { key: 'payment', label: 'Pembayaran' },
  { key: 'pppoe',   label: 'PPPoE' },
  { key: 'system',  label: 'Sistem' },
  { key: 'settings',label: 'Setting' },
];

function timeAgo(isoString: string): string {
  const diff = nowWIB().getTime() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}d`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j`;
  const d = Math.floor(h / 24);
  return `${d}hr`;
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
  const [mounted, setMounted] = useState(false);
  const tzInfo = getTimezoneInfo();
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');

  const DAY_NAMES_ID = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const MONTH_NAMES_ID_DATE = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  function getIndonesianDate(d: Date): string {
    return `${DAY_NAMES_ID[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_NAMES_ID_DATE[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [systemStatus, setSystemStatus] = useState<{ radius: boolean; database: boolean; api: boolean } | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [agentSales, setAgentSales] = useState<AgentSaleEntry[]>([]);
  const [agentSalesTotal, setAgentSalesTotal] = useState({ count: 0, revenue: 0 });
  const [radiusAuthLog, setRadiusAuthLog] = useState<RadiusAuthEntry[]>([]);
  const [radiusAuthStats, setRadiusAuthStats] = useState({ acceptToday: 0, rejectToday: 0 });
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [activityModule, setActivityModule] = useState('all');
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityOffset, setActivityOffset] = useState(0);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [radiusStatus, setRadiusStatus] = useState<RadiusStatus | null>(null);
  const [restarting, setRestarting] = useState(false);
  // Month filter for revenue stats
  const [dashboardMonth, setDashboardMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [periodLabel, setPeriodLabel] = useState<string>('');
  const { t } = useTranslation();
  const { addToast, confirm } = useToast();

  const loadActivityLog = useCallback(async (module: string, offset: number, append = false) => {
    setActivityLoading(true);
    try {
      const params = new URLSearchParams({ module, limit: '20', offset: String(offset) });
      const res = await fetch(`/api/admin/activity-logs?${params}`);
      const data = await res.json();
      if (data.success) {
        setActivityLog(prev => append ? [...prev, ...data.activities] : data.activities);
        setActivityTotal(data.total);
        setActivityHasMore(data.hasMore);
      }
    } catch (e) {
      console.error('Failed to load activity log:', e);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const loadDashboardData = useCallback(async (month?: string) => {
    try {
      const m = month || dashboardMonth;
      const res = await fetch(`/api/dashboard/stats?month=${m}`);
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setActivities(data.activities || []);
        setSystemStatus(data.systemStatus);
        setAgentSales(data.agentSales || []);
        setAgentSalesTotal(data.agentSalesTotal || { count: 0, revenue: 0 });
        setRadiusAuthLog(data.radiusAuthLog || []);
        setRadiusAuthStats(data.radiusAuthStats || { acceptToday: 0, rejectToday: 0 });
        if (data.periodLabel) setPeriodLabel(data.periodLabel);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [dashboardMonth]);

  const loadAnalyticsData = useCallback(async () => {
    try {
      setAnalyticsLoading(true);
      const res = await fetch('/api/dashboard/analytics?type=all');
      const data = await res.json();
      if (data.success) {
        setAnalyticsData(data.data);
      }
    } catch (error) {
      console.error('Failed to load analytics data:', error);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const loadRadiusStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/system/radius');
      const data = await res.json();
      if (data.success) {
        setRadiusStatus(data);
      }
    } catch (error) {
      console.error('Failed to load RADIUS status:', error);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    loadDashboardData();
    loadRadiusStatus();
    loadAnalyticsData();
    loadActivityLog('all', 0);
    const now0 = nowWIB();
    setCurrentTime(formatWIB(now0, 'HH:mm:ss'));
    setCurrentDate(getIndonesianDate(now0));

    const timeInterval = setInterval(() => {
      const now = nowWIB();
      setCurrentTime(formatWIB(now, 'HH:mm:ss'));
      setCurrentDate(getIndonesianDate(now));
    }, 1000);

    const dataInterval = setInterval(() => {
      loadDashboardData();
      loadRadiusStatus();
    }, 30000);

    const analyticsInterval = setInterval(() => {
      loadAnalyticsData();
    }, 300000);

    return () => {
      clearInterval(timeInterval);
      clearInterval(dataInterval);
      clearInterval(analyticsInterval);
    };
  }, [loadDashboardData, loadRadiusStatus, loadAnalyticsData, loadActivityLog]);

  // Navigate months
  const shiftMonth = (delta: number) => {
    const [y, m] = dashboardMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setDashboardMonth(next);
    setLoading(true);
    loadDashboardData(next);
  };

  const handleRestartRadius = async () => {
    if (!await confirm({
      title: t('system.restartRadius'),
      message: t('system.restartRadiusWarning'),
      confirmText: t('common.yes') + ', ' + t('system.restart'),
      cancelText: t('common.cancel'),
      variant: 'danger',
    })) return;

    setRestarting(true);
    try {
      const res = await fetch('/api/system/radius', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart' }),
      });

      const data = await res.json();
      if (data.success) {
        addToast({ type: 'success', title: t('notifications.success'), description: t('notifications.radiusRestarted') });
        loadRadiusStatus();
        loadDashboardData();
      } else {
        addToast({ type: 'error', title: t('notifications.error'), description: data.error || t('errors.restartFailed') });
      }
    } catch (error) {
      addToast({ type: 'error', title: t('notifications.error'), description: t('errors.restartFailed') });
    } finally {
      setRestarting(false);
    }
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
      gradient: 'from-violet-500 to-purple-400',
      bgGlow: 'bg-violet-500/20',
      href: '/admin/hotspot/sessions',
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
    <div className="bg-background relative overflow-hidden">
      {/* Neon Cyberpunk Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>

      <div className="relative z-10 space-y-6">
            {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">
              {t('dashboard.title')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2 mt-1">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.6)]"></span>
              {tzInfo.name} &bull; {currentDate} &bull; {currentTime}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Month navigator */}
            <div className="flex items-center gap-1 bg-[#00f7ff]/5 border border-[#00f7ff]/20 rounded-lg px-1 py-1">
              <button
                onClick={() => shiftMonth(-1)}
                className="p-1 rounded hover:bg-[#00f7ff]/15 text-[#00f7ff]/70 hover:text-[#00f7ff] transition-colors"
                title={t('dashboard.prevMonth')}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium text-[#00f7ff] min-w-[90px] text-center">
                {periodLabel || '...'}
              </span>
              <button
                onClick={() => shiftMonth(1)}
                disabled={dashboardMonth >= (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; })()}
                className="p-1 rounded hover:bg-[#00f7ff]/15 text-[#00f7ff]/70 hover:text-[#00f7ff] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title={t('dashboard.nextMonth')}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => { loadDashboardData(); loadAnalyticsData(); }}
              disabled={loading || analyticsLoading}
              className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium bg-[#00f7ff]/10 border-2 border-[#00f7ff]/30 text-[#00f7ff] rounded-lg hover:bg-[#00f7ff]/20 disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(0,247,255,0.2)]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${(loading || analyticsLoading) ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </button>
          </div>
        </div>

        {/* Stats Grid - 4 columns */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)]" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
            {statCards.map((card) => {
              const inner = (
                <>
                  {/* Background glow */}
                  <div className={`absolute -top-8 -right-8 w-24 h-24 ${card.bgGlow} rounded-full blur-2xl opacity-50 group-hover:opacity-80 transition-opacity`} />
                  <div className="relative flex items-start justify-between gap-2">
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
                        <p className="text-[9px] sm:text-[10px] text-[#00f7ff]/60 mt-0.5 font-medium">{card.detail}</p>
                      )}
                    </div>
                    <div className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-gradient-to-br ${card.gradient} text-white shadow-lg flex-shrink-0`}>
                      {React.cloneElement(card.icon, { className: 'w-4 h-4 sm:w-5 sm:h-5' })}
                    </div>
                  </div>
                </>
              );
              const cls = 'relative bg-card/60 backdrop-blur-xl rounded-xl border border-white/10 p-3 sm:p-4 hover:border-white/20 hover:shadow-[0_0_30px_rgba(188,19,254,0.2)] transition-all group overflow-hidden';
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
          <div className="bg-card/60 backdrop-blur-xl rounded-xl border border-white/10 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#ff44cc]/10 border border-[#ff44cc]/20">
                  <CalendarClock className="w-3.5 h-3.5 text-[#ff44cc]" />
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
                className="text-[10px] text-[#ff44cc] hover:text-[#ff44cc]/80 transition-colors"
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
                    ? 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.8)]'
                    : isUrgent
                    ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]'
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

          {/* Activity Log — compact panel beside charts */}
          <div className="bg-card/60 backdrop-blur-xl rounded-xl border border-white/10 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#00f7ff]/10 border border-[#00f7ff]/20">
                  <Activity className="w-3.5 h-3.5 text-[#00f7ff]" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-foreground">{t('dashboard.activityLog')}</h2>
                  <p className="text-[10px] text-[#e0d0ff]/40">
                    {activityTotal > 0 ? t('dashboard.activityCount', { count: String(activityTotal) }) : t('dashboard.activitySubtitle')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Filter tabs */}
                <div className="flex items-center gap-0.5 flex-wrap">
                  {ACTIVITY_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => {
                        setActivityModule(tab.key);
                        setActivityOffset(0);
                        loadActivityLog(tab.key, 0);
                      }}
                      className={`px-1.5 py-0.5 text-[9px] font-medium rounded transition-all border ${
                        activityModule === tab.key
                          ? 'bg-[#00f7ff]/20 text-[#00f7ff] border-[#00f7ff]/40'
                          : 'bg-white/5 text-muted-foreground border-white/10 hover:text-white/70'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { setActivityOffset(0); loadActivityLog(activityModule, 0); }}
                  disabled={activityLoading}
                  className="p-1 text-muted-foreground hover:text-[#00f7ff] bg-white/5 border border-white/10 rounded transition-all"
                >
                  <RefreshCw className={`w-3 h-3 ${activityLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Entries list */}
            <div className="flex-1 overflow-y-auto divide-y divide-white/5 max-h-[250px]">
              {activityLoading && activityLog.length === 0 ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-4 w-4 animate-spin text-[#00f7ff]" />
                </div>
              ) : activityLog.length === 0 ? (
                <div className="text-center py-10">
                  <Activity className="h-5 w-5 mx-auto mb-1 text-[#e0d0ff]/20" />
                  <p className="text-[10px] text-[#e0d0ff]/40">{t('dashboard.noActivities')}</p>
                </div>
              ) : (
                activityLog.map((entry) => {
                  const cfg = MODULE_CONFIG[entry.module] || { label: entry.module, color: 'text-slate-400 bg-slate-500/20 border-slate-500/30', Icon: Activity };
                  const IconComp = cfg.Icon;
                  return (
                    <div key={entry.id} className={`flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] transition-colors ${
                      entry.status === 'error' ? 'bg-red-500/5' : entry.status === 'warning' ? 'bg-amber-500/5' : ''
                    }`}>
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 border ${cfg.color}`}>
                        <IconComp className="w-3 h-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-foreground truncate">{entry.description}</p>
                        <p className="text-[10px] text-[#e0d0ff]/40 truncate">{entry.username} &bull; {entry.action}</p>
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0">
                        <span className="text-[9px] text-[#e0d0ff]/40">{timeAgo(entry.createdAt)}</span>
                        <span className={`text-[9px] font-medium ${
                          entry.status === 'success' ? 'text-green-400' : entry.status === 'warning' ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {entry.status === 'success' ? 'OK' : entry.status === 'warning' ? 'warn' : 'err'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Load More */}
            {activityHasMore && (
              <div className="p-2 border-t border-white/5 text-center">
                <button
                  onClick={() => {
                    const next = activityOffset + 20;
                    setActivityOffset(next);
                    loadActivityLog(activityModule, next, true);
                  }}
                  disabled={activityLoading}
                  className="flex items-center gap-1 mx-auto px-2.5 py-1 text-[10px] font-medium bg-[#00f7ff]/10 border border-[#00f7ff]/30 text-[#00f7ff] rounded-lg hover:bg-[#00f7ff]/20 disabled:opacity-50 transition-all"
                >
                  {activityLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <ChevronDown className="w-2.5 h-2.5" />}
                  {t('dashboard.loadMore')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Agent Voucher Sales + RADIUS Auth Log Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Agent Voucher Sales */}
          <div className="bg-card/60 backdrop-blur-xl rounded-xl border border-white/10 p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Store className="w-4 h-4 text-[#bc13fe]" />
                  {t('dashboard.agentVoucherSales')}
                </h2>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t('dashboard.agentVoucherSalesSubtitle')}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 text-[10px] font-medium bg-[#bc13fe]/20 text-[#bc13fe] rounded-lg border border-[#bc13fe]/30">
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
                      <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#bc13fe] to-[#ff44cc] flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-xs font-medium text-foreground truncate">{agent.agentName}</span>
                    </div>
                    <span className="text-xs font-bold text-[#00f7ff] text-center">{agent.sold.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground text-right">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(agent.revenue)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between p-2 border-t border-white/10 mt-1">
                  <span className="text-[10px] text-muted-foreground">{t('dashboard.agentTotalRevenue')}</span>
                  <span className="text-xs font-bold text-[#bc13fe]">
                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(agentSalesTotal.revenue)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* RADIUS Auth Log */}
          <div className="bg-card/60 backdrop-blur-xl rounded-xl border border-white/10 p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#00f7ff]" />
                  {t('dashboard.radiusAuthLog')}
                </h2>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t('dashboard.radiusAuthLogSubtitle')}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 text-[10px] font-medium bg-green-500/20 text-green-400 rounded-lg border border-green-500/30">
                  &#10003; {radiusAuthStats.acceptToday} {t('dashboard.todayAccepted')}
                </span>
                <span className="px-2 py-1 text-[10px] font-medium bg-red-500/20 text-red-400 rounded-lg border border-red-500/30">
                  &#10007; {radiusAuthStats.rejectToday} {t('dashboard.todayRejected')}
                </span>
              </div>
            </div>
            {radiusAuthLog.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ShieldX className="h-5 w-5 mx-auto mb-1 opacity-50" />
                <p className="text-xs">{t('dashboard.noAuthLogs')}</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                {radiusAuthLog.map((entry, i) => {
                  const isAccepted = entry.reply === 'Access-Accept';
                  return (
                    <div key={i} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        {isAccepted ? (
                          <ShieldCheck className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                        ) : (
                          <ShieldX className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        )}
                        <span className="text-xs font-medium text-foreground truncate">{entry.username}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          isAccepted ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {isAccepted ? t('dashboard.loginSuccess') : t('dashboard.loginFailed')}
                        </span>
                        <span className="text-[9px] text-[#e0d0ff]/40">
                          {entry.authdate ? formatWIB(entry.authdate, 'HH:mm:ss') : ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* System Status */}
        <div className="bg-card/60 backdrop-blur-xl rounded-xl border border-white/10 p-3 sm:p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">{t('dashboard.systemStatus')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            {/* RADIUS Server */}
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                radiusStatus?.status === 'running' ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                <Server className={`w-4 h-4 ${
                  radiusStatus?.status === 'running' ? 'text-green-400' : 'text-red-400'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{t('system.radius')}</p>
                <div className="flex items-center gap-1">
                  {radiusStatus?.status === 'running' ? (
                    <>
                      <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />
                      <span className="text-[10px] text-green-400 truncate">{radiusStatus.uptime}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-2.5 h-2.5 text-red-400" />
                      <span className="text-[10px] text-red-400">{t('system.offline')}</span>
                    </>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRestartRadius}
                disabled={restarting}
                className="h-7 w-7 p-0 text-white/50 hover:text-white"
              >
                {restarting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCw className="h-3 w-3" />
                )}
              </Button>
            </div>

            {/* Database */}
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                systemStatus?.database ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                <Database className={`w-4 h-4 ${
                  systemStatus?.database ? 'text-green-400' : 'text-red-400'
                }`} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-foreground">{t('system.database')}</p>
                <div className="flex items-center gap-1">
                  {systemStatus?.database ? (
                    <>
                      <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />
                      <span className="text-[10px] text-green-400">{t('system.connected')}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-2.5 h-2.5 text-red-400" />
                      <span className="text-[10px] text-red-400">{t('system.disconnected')}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* API */}
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                systemStatus?.api ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                <Zap className={`w-4 h-4 ${
                  systemStatus?.api ? 'text-green-400' : 'text-red-400'
                }`} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-foreground">{t('system.api')}</p>
                <div className="flex items-center gap-1">
                  {systemStatus?.api ? (
                    <>
                      <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />
                      <span className="text-[10px] text-green-400">{t('system.running')}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-2.5 h-2.5 text-red-400" />
                      <span className="text-[10px] text-red-400">{t('system.stopped')}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>


      </div>
    </div>
  );
}
