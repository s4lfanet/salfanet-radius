'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// Types (static - no recharts dependency)
export interface ChartData {
  [key: string]: string | number;
}

interface BaseChartProps {
  data: ChartData[];
  loading?: boolean;
  height?: number;
}

// Loading component (static - used as fallback for dynamic imports)
const ChartLoading = ({ height = 250 }: { height?: number }) => (
  <div className="flex items-center justify-center" style={{ height }}>
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

// Empty state (static - no recharts dependency)
const ChartEmpty = ({ height = 250, message = 'No data available' }: { height?: number; message?: string }) => (
  <div className="flex flex-col items-center justify-center text-muted-foreground" style={{ height }}>
    <svg className="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
    <p className="text-xs">{message}</p>
  </div>
);

// ==================== DYNAMIC RECHARTS COMPONENTS ====================
// recharts is ~400KB - lazy load to keep it out of initial bundle for non-chart pages
const loadingFallback = (height = 250) => <ChartLoading height={height} />;

export const RevenueLineChart = dynamic(() => import('./RechartsComponents').then(m => m.RevenueLineChart), {
  ssr: false,
  loading: () => loadingFallback(),
});

export const CategoryBarChart = dynamic(() => import('./RechartsComponents').then(m => m.CategoryBarChart), {
  ssr: false,
  loading: () => loadingFallback(),
});

export const UserStatusPieChart = dynamic(() => import('./RechartsComponents').then(m => m.UserStatusPieChart), {
  ssr: false,
  loading: () => loadingFallback(),
});

export const UserGrowthChart = dynamic(() => import('./RechartsComponents').then(m => m.UserGrowthChart), {
  ssr: false,
  loading: () => loadingFallback(),
});

export const VoucherSalesChart = dynamic(() => import('./RechartsComponents').then(m => m.VoucherSalesChart), {
  ssr: false,
  loading: () => loadingFallback(),
});

export const VoucherStatusPieChart = dynamic(() => import('./RechartsComponents').then(m => m.VoucherStatusPieChart), {
  ssr: false,
  loading: () => loadingFallback(),
});

export const SessionsChart = dynamic(() => import('./RechartsComponents').then(m => m.SessionsChart), {
  ssr: false,
  loading: () => loadingFallback(),
});

export const BandwidthChart = dynamic(() => import('./RechartsComponents').then(m => m.BandwidthChart), {
  ssr: false,
  loading: () => loadingFallback(),
});

export const IncomeExpenseChart = dynamic(() => import('./RechartsComponents').then(m => m.IncomeExpenseChart), {
  ssr: false,
  loading: () => loadingFallback(),
});

// ==================== TOP REVENUE SOURCES (no recharts) ====================
interface TopRevenueSourcesProps extends BaseChartProps {}

export function TopRevenueSources({ data, loading, height = 200 }: TopRevenueSourcesProps) {
  if (loading) return <ChartLoading height={height} />;
  if (!data || data.length === 0) return <ChartEmpty height={height} />;

  const PIE_COLORS = ['#0d9488', '#6366f1', '#f59e0b', '#ef4444', '#22c55e', '#8b5cf6'];
  const maxValue = Math.max(...data.map(d => Number(d.amount) || 0));

  return (
    <div className="space-y-2" style={{ height }}>
      {data.slice(0, 5).map((item, index) => {
        const percent = maxValue > 0 ? (Number(item.amount) / maxValue) * 100 : 0;
        return (
          <div key={index} className="space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground truncate flex-1">{item.source}</span>
              <span className="font-medium text-foreground ml-2">
                Rp {Number(item.amount).toLocaleString('id-ID')}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${percent}%`,
                  backgroundColor: PIE_COLORS[index % PIE_COLORS.length]
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ==================== CHART CARD WRAPPER (no recharts) ====================
interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function ChartCard({ title, subtitle, children, action }: ChartCardProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-3">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">{title}</h3>
          {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
