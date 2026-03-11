'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp, TrendingDown, Users, DollarSign, UserX, RefreshCw,
  ArrowLeft, BarChart3, Activity, Crown,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useTranslation } from '@/hooks/useTranslation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthlyDataPoint {
  month: string;
  monthLabel: string;
  revenue: number;
  invoiceCount: number;
  newCustomers: number;
  churned: number;
  churnRate: number;
  arpu: number;
  cumulativeCustomers: number;
}

interface ProfileBreakdown {
  profile: string;
  count: number;
  percentage: number;
}

interface AreaBreakdown {
  area: string;
  count: number;
  percentage: number;
}

interface AnalyticsSummary {
  totalRevenue: number;
  totalNewCustomers: number;
  totalChurned: number;
  avgArpu: number;
  avgChurnRate: number;
  avgRetentionRate: number;
  currentActiveUsers: number;
}

interface AnalyticsData {
  period: number;
  monthlyData: MonthlyDataPoint[];
  profileBreakdown: ProfileBreakdown[];
  areaBreakdown: AreaBreakdown[];
  summary: AnalyticsSummary;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtIDR = (n: number) =>
  n >= 1_000_000
    ? `Rp ${(n / 1_000_000).toFixed(1)}jt`
    : `Rp ${n.toLocaleString('id-ID')}`;

const fmtIDRFull = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

// ─── Chart colors ─────────────────────────────────────────────────────────────

const PIE_COLORS = ['#0d9488', '#6366f1', '#f59e0b', '#ef4444', '#22c55e', '#8b5cf6', '#ec4899', '#14b8a6'];

// ─── Period selector config ───────────────────────────────────────────────────
const PERIOD_VALUES = ['3', '6', '12', '24'];

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, color, trend
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-xl font-bold text-foreground leading-none">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
      {trend && (
        <div className={`flex-shrink-0 self-start ${trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground'}`}>
          {trend === 'up' ? <TrendingUp className="w-4 h-4" /> : trend === 'down' ? <TrendingDown className="w-4 h-4" /> : null}
        </div>
      )}
    </div>
  );
}

// ─── Custom chart tooltip ─────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, isCurrency }: {
  active?: boolean; payload?: any[]; label?: string; isCurrency?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground">
            {isCurrency ? fmtIDRFull(p.value) : p.value?.toLocaleString('id-ID')}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Chart section wrapper ────────────────────────────────────────────────────

function ChartSection({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="mb-4">
        <h3 className="font-semibold text-foreground text-sm">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LaporanAnalitikPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const PERIODS = [
    { label: t('laporanAnalitik.months3'), value: '3' },
    { label: t('laporanAnalitik.months6'), value: '6' },
    { label: t('laporanAnalitik.months12'), value: '12' },
    { label: t('laporanAnalitik.months24'), value: '24' },
  ];

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string>('12');
  const [refreshing, setRefreshing] = useState(false);

  const loadAnalytics = useCallback(async (p: string, silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/analytics?period=${p}`);
      const json = await res.json();
      if (json.success) setData(json);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics(period);
  }, [period, loadAnalytics]);

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <div className="animate-spin w-10 h-10 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">{t('laporanAnalitik.loading')}</p>
        </div>
      </div>
    );
  }

  const d = data;
  const s = d?.summary;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => router.push('/admin/laporan')}
          className="p-2 rounded-lg border border-border hover:bg-accent transition-colors"
          title="Kembali ke Laporan"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Laporan Analitik Advanced
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Churn rate, retention, ARPU, dan tren pelanggan
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* Period selector */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  period === p.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => loadAnalytics(period, true)}
            disabled={refreshing}
            className="p-2 rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label={t('laporanAnalitik.totalRevenue')}
            value={fmtIDR(s.totalRevenue)}
            sub={t('laporanAnalitik.lastMonths', { n: String(data?.period) })}
            icon={DollarSign}
            color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
            trend="up"
          />
          <KpiCard
            label={t('laporanAnalitik.avgArpu')}
            value={fmtIDR(s.avgArpu)}
            sub={t('laporanAnalitik.perActiveCustomer')}
            icon={TrendingUp}
            color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          />
          <KpiCard
            label={t('laporanAnalitik.avgChurnRate')}
            value={`${s.avgChurnRate}%`}
            sub={t('laporanAnalitik.retention', { n: String(s.avgRetentionRate) })}
            icon={UserX}
            color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            trend={s.avgChurnRate > 5 ? 'down' : 'neutral'}
          />
          <KpiCard
            label={t('laporanAnalitik.activeCustomers')}
            value={s.currentActiveUsers.toLocaleString('id-ID')}
            sub={t('laporanAnalitik.newIn', { n: String(s.totalNewCustomers), n2: String(data?.period) })}
            icon={Users}
            color="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
            trend="up"
          />
        </div>
      )}

      {/* Revenue & Customers (combined) */}
      {d && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Revenue Trend */}
          <ChartSection title={t('laporanAnalitik.revenueTrend')} subtitle={t('laporanAnalitik.revenueTrendSub')}>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={d.monthlyData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} tickFormatter={v => fmtIDR(v)} width={70} />
                <Tooltip content={<CustomTooltip isCurrency />} />
                <Area
                  type="monotone" dataKey="revenue" name={t('laporanAnalitik.revenueTrend')}
                  stroke="#0d9488" fill="url(#revGrad)" strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* New customers vs Churn */}
          <ChartSection title={t('laporanAnalitik.newVsChurn')} subtitle={t('laporanAnalitik.newVsChurnSub')}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.monthlyData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="newCustomers" name={t('laporanAnalitik.newCustomers')} fill="#22c55e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="churned" name={t('laporanAnalitik.churn')} fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>
        </div>
      )}

      {/* ARPU & Churn Rate charts */}
      {d && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ARPU trend */}
          <ChartSection
            title={t('laporanAnalitik.arpuTrend')}
            subtitle={t('laporanAnalitik.arpuTrendSub')}
          >
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={d.monthlyData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} tickFormatter={v => fmtIDR(v)} width={72} />
                <Tooltip content={<CustomTooltip isCurrency />} />
                <Line
                  type="monotone" dataKey="arpu" name={t('laporanAnalitik.avgArpu')}
                  stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* Churn rate trend */}
          <ChartSection
            title={t('laporanAnalitik.churnTrend')}
            subtitle={t('laporanAnalitik.churnTrendSub')}
          >
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={d.monthlyData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} domain={[0, 'auto']}
                  tickFormatter={v => `${v}%`} width={40} />
                <Tooltip
                  formatter={(v: number | undefined) => [`${v ?? 0}%`, 'Churn Rate']}
                  labelFormatter={label => label}
                />
                <Line
                  type="monotone" dataKey="churnRate" name="Churn Rate (%)"
                  stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartSection>
        </div>
      )}

      {/* Cumulative active customers */}
      {d && (
        <ChartSection title={t('laporanAnalitik.cumulativeCustomers')} subtitle={t('laporanAnalitik.cumulativeCustomersSub')}>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={d.monthlyData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="custGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="monthLabel" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone" dataKey="cumulativeCustomers" name={t('laporanAnalitik.activeCustomers')}
                stroke="#8b5cf6" fill="url(#custGrad)" strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartSection>
      )}

      {/* Breakdowns */}
      {d && (d.profileBreakdown.length > 0 || d.areaBreakdown.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Profile breakdown */}
          {d.profileBreakdown.length > 0 && (
            <ChartSection title={t('laporanAnalitik.profileDistribution')} subtitle={t('laporanAnalitik.profileDistributionSub')}>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie
                      data={d.profileBreakdown} dataKey="count" cx="50%" cy="50%"
                      innerRadius={40} outerRadius={70}
                    >
                      {d.profileBreakdown.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number | undefined, _n, p) => [(v ?? 0) + ' pelanggan', p.payload.profile]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2 min-w-0">
                  {d.profileBreakdown.map((prof, idx) => (
                    <div key={prof.profile} className="flex items-center gap-2 text-xs">
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                      />
                      <span className="text-foreground truncate flex-1">{prof.profile}</span>
                      <span className="text-muted-foreground">{prof.count}</span>
                      <span className="text-muted-foreground w-8 text-right">{prof.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartSection>
          )}

          {/* Area breakdown */}
          {d.areaBreakdown.length > 0 && (
            <ChartSection title={t('laporanAnalitik.areaDistribution')} subtitle={t('laporanAnalitik.areaDistributionSub')}>
              <div className="space-y-2.5 mt-1">
                {d.areaBreakdown.map((area, idx) => (
                  <div key={area.area} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Crown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-foreground truncate">{area.area}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-muted-foreground">{area.count}</span>
                        <span className="text-muted-foreground w-8 text-right">{area.percentage}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${area.percentage}%`,
                          background: PIE_COLORS[idx % PIE_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ChartSection>
          )}
        </div>
      )}

      {/* Monthly data table */}
      {d && (
        <ChartSection title={t('laporanAnalitik.monthlyTable')} subtitle={t('laporanAnalitik.monthlyTableSub')}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">{t('laporanAnalitik.colMonth')}</th>
                  <th className="pb-2 pr-4 font-medium text-right">{t('laporanAnalitik.colRevenue')}</th>
                  <th className="pb-2 pr-4 font-medium text-right">{t('laporanAnalitik.colInvPaid')}</th>
                  <th className="pb-2 pr-4 font-medium text-right">{t('laporanAnalitik.colNewCustomers')}</th>
                  <th className="pb-2 pr-4 font-medium text-right">{t('laporanAnalitik.colChurn')}</th>
                  <th className="pb-2 pr-4 font-medium text-right">{t('laporanAnalitik.colChurnPct')}</th>
                  <th className="pb-2 pr-4 font-medium text-right">{t('laporanAnalitik.colArpu')}</th>
                  <th className="pb-2 font-medium text-right">{t('laporanAnalitik.colActiveEst')}</th>
                </tr>
              </thead>
              <tbody>
                {d.monthlyData.map(row => (
                  <tr key={row.month} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="py-2 pr-4 font-medium text-foreground">{row.monthLabel}</td>
                    <td className="py-2 pr-4 text-right text-emerald-600 dark:text-emerald-400">
                      {fmtIDR(row.revenue)}
                    </td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{row.invoiceCount}</td>
                    <td className="py-2 pr-4 text-right text-blue-600 dark:text-blue-400">
                      {row.newCustomers > 0 ? `+${row.newCustomers}` : row.newCustomers}
                    </td>
                    <td className="py-2 pr-4 text-right text-red-600 dark:text-red-400">
                      {row.churned > 0 ? row.churned : '-'}
                    </td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">
                      {row.churnRate > 0 ? `${row.churnRate}%` : '-'}
                    </td>
                    <td className="py-2 pr-4 text-right text-violet-600 dark:text-violet-400">
                      {row.arpu > 0 ? fmtIDR(row.arpu) : '-'}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {row.cumulativeCustomers.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartSection>
      )}

      {/* Note about churn approximation */}
      <div className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
        {t('laporanAnalitik.methodologyNote')}
      </div>
    </div>
  );
}
