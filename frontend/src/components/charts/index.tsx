'use client';

import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Area, AreaChart
} from 'recharts';
import { Loader2 } from 'lucide-react';

// Color palettes
const COLORS = {
  primary: '#0d9488',
  secondary: '#6366f1',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
};

const PIE_COLORS = ['#0d9488', '#6366f1', '#f59e0b', '#ef4444', '#22c55e', '#8b5cf6'];

// Types
export interface ChartData {
  [key: string]: string | number;
}

interface BaseChartProps {
  data: ChartData[];
  loading?: boolean;
  height?: number;
}

// Loading component
const ChartLoading = ({ height = 250 }: { height?: number }) => (
  <div className="flex items-center justify-center" style={{ height }}>
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

// Empty state
const ChartEmpty = ({ height = 250, message = 'No data available' }: { height?: number; message?: string }) => (
  <div className="flex flex-col items-center justify-center text-muted-foreground" style={{ height }}>
    <svg className="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
    <p className="text-xs">{message}</p>
  </div>
);

// Currency formatter
const formatCurrency = (value: number) => {
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)}M`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}Jt`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return value.toString();
};

// Custom tooltip
const CustomTooltip = ({ active, payload, label, valuePrefix = '', valueSuffix = '' }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-2">
        <p className="text-xs font-medium text-foreground mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-xs" style={{ color: entry.color }}>
            {entry.name}: {valuePrefix}{typeof entry.value === 'number' ? entry.value.toLocaleString('id-ID') : entry.value}{valueSuffix}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ==================== REVENUE CHART ====================
interface RevenueLineChartProps extends BaseChartProps {
  dataKey?: string;
}

export function RevenueLineChart({ data, loading, height = 250, dataKey = 'revenue' }: RevenueLineChartProps) {
  if (loading) return <ChartLoading height={height} />;
  if (!data || data.length === 0) return <ChartEmpty height={height} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" opacity={0.3} vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip valuePrefix="Rp " />} />
        <Area 
          type="monotone" 
          dataKey={dataKey} 
          stroke={COLORS.primary} 
          strokeWidth={3}
          fill="url(#revenueGradient)" 
          name="Pendapatan"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ==================== CATEGORY BAR CHART ====================
interface CategoryBarChartProps extends BaseChartProps {
  dataKey?: string;
  nameKey?: string;
}

export function CategoryBarChart({ data, loading, height = 250, dataKey = 'amount', nameKey = 'category' }: CategoryBarChartProps) {
  if (loading) return <ChartLoading height={height} />;
  if (!data || data.length === 0) return <ChartEmpty height={height} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" opacity={0.3} vertical={false} />
        <XAxis 
          dataKey={nameKey} 
          tick={{ fontSize: 10 }} 
          tickLine={false} 
          axisLine={false} 
          angle={-25} 
          textAnchor="end" 
          height={60}
          interval={0}
        />
        <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip valuePrefix="Rp " />} />
        <Bar dataKey={dataKey} fill={COLORS.primary} radius={[4, 4, 0, 0]} name="Jumlah" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ==================== USER STATUS PIE CHART ====================
interface UserStatusPieChartProps extends BaseChartProps {}

export function UserStatusPieChart({ data, loading, height = 200 }: UserStatusPieChartProps) {
  if (loading) return <ChartLoading height={height} />;
  if (!data || data.length === 0) return <ChartEmpty height={height} />;

  const total = data.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={70}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
          label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number | undefined) => [(value ?? 0).toLocaleString('id-ID'), 'User']} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ==================== USER GROWTH LINE CHART ====================
interface UserGrowthChartProps extends BaseChartProps {}

export function UserGrowthChart({ data, loading, height = 200 }: UserGrowthChartProps) {
  if (loading) return <ChartLoading height={height} />;
  if (!data || data.length === 0) return <ChartEmpty height={height} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" opacity={0.3} vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Line 
          type="monotone" 
          dataKey="newUsers" 
          stroke={COLORS.success} 
          strokeWidth={3}
          dot={{ fill: COLORS.success, r: 4 }}
          name="User Baru"
        />
        <Line 
          type="monotone" 
          dataKey="totalUsers" 
          stroke={COLORS.secondary} 
          strokeWidth={3}
          dot={{ fill: COLORS.secondary, r: 4 }}
          name="Total User"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ==================== VOUCHER SALES BAR CHART ====================
interface VoucherSalesChartProps extends BaseChartProps {}

export function VoucherSalesChart({ data, loading, height = 200 }: VoucherSalesChartProps) {
  if (loading) return <ChartLoading height={height} />;
  if (!data || data.length === 0) return <ChartEmpty height={height} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" opacity={0.3} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis dataKey="profile" type="category" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={60} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="sold" fill={COLORS.info} radius={[0, 4, 4, 0]} name="Terjual" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ==================== VOUCHER STATUS PIE CHART ====================
interface VoucherStatusPieChartProps extends BaseChartProps {}

export function VoucherStatusPieChart({ data, loading, height = 200 }: VoucherStatusPieChartProps) {
  if (loading) return <ChartLoading height={height} />;
  if (!data || data.length === 0) return <ChartEmpty height={height} />;

  const statusColors: Record<string, string> = {
    'ACTIVE': COLORS.success,
    'USED': COLORS.info,
    'EXPIRED': COLORS.danger,
    'UNUSED': COLORS.warning,
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={40}
          outerRadius={65}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={statusColors[entry.name as string] || PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number | undefined) => [(value ?? 0).toLocaleString('id-ID'), 'Voucher']} />
        <Legend 
          layout="horizontal" 
          verticalAlign="bottom" 
          align="center"
          wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ==================== SESSIONS AREA CHART ====================
interface SessionsChartProps extends BaseChartProps {}

export function SessionsChart({ data, loading, height = 200 }: SessionsChartProps) {
  if (loading) return <ChartLoading height={height} />;
  if (!data || data.length === 0) return <ChartEmpty height={height} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
        <defs>
          <linearGradient id="pppoeGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.4}/>
            <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="hotspotGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.warning} stopOpacity={0.4}/>
            <stop offset="95%" stopColor={COLORS.warning} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" opacity={0.3} vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="pppoe" stroke={COLORS.primary} fill="url(#pppoeGradient)" strokeWidth={3} name="PPPoE" />
        <Area type="monotone" dataKey="hotspot" stroke={COLORS.warning} fill="url(#hotspotGradient)" strokeWidth={3} name="Hotspot" />
        <Legend wrapperStyle={{ fontSize: '10px' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ==================== BANDWIDTH CHART ====================
interface BandwidthChartProps extends BaseChartProps {}

export function BandwidthChart({ data, loading, height = 200 }: BandwidthChartProps) {
  if (loading) return <ChartLoading height={height} />;
  if (!data || data.length === 0) return <ChartEmpty height={height} />;

  const formatBandwidth = (value: number) => {
    if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`;
    return `${value.toFixed(0)} MB`;
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
        <defs>
          <linearGradient id="uploadGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.4}/>
            <stop offset="95%" stopColor={COLORS.success} stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="downloadGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.info} stopOpacity={0.4}/>
            <stop offset="95%" stopColor={COLORS.info} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" opacity={0.3} vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={formatBandwidth} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(value: number | undefined) => [formatBandwidth(value ?? 0), '']} />
        <Area type="monotone" dataKey="upload" stroke={COLORS.success} fill="url(#uploadGradient)" strokeWidth={3} name="Upload" />
        <Area type="monotone" dataKey="download" stroke={COLORS.info} fill="url(#downloadGradient)" strokeWidth={3} name="Download" />
        <Legend wrapperStyle={{ fontSize: '10px' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ==================== INCOME VS EXPENSE CHART ====================
interface IncomeExpenseChartProps extends BaseChartProps {}

export function IncomeExpenseChart({ data, loading, height = 250 }: IncomeExpenseChartProps) {
  if (loading) return <ChartLoading height={height} />;
  if (!data || data.length === 0) return <ChartEmpty height={height} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af" opacity={0.3} vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip valuePrefix="Rp " />} />
        <Legend wrapperStyle={{ fontSize: '10px' }} />
        <Bar dataKey="income" fill={COLORS.success} radius={[4, 4, 0, 0]} name="Pemasukan" />
        <Bar dataKey="expense" fill={COLORS.danger} radius={[4, 4, 0, 0]} name="Pengeluaran" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ==================== TOP REVENUE SOURCES ====================
interface TopRevenueSourcesProps extends BaseChartProps {}

export function TopRevenueSources({ data, loading, height = 200 }: TopRevenueSourcesProps) {
  if (loading) return <ChartLoading height={height} />;
  if (!data || data.length === 0) return <ChartEmpty height={height} />;

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

// ==================== CHART CARD WRAPPER ====================
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
