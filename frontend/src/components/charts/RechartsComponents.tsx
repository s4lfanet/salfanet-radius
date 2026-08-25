'use client';

import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Area, AreaChart
} from 'recharts';
import type { TooltipPayloadEntry, PieLabelRenderProps } from 'recharts';

function useResponsiveHeight(defaultHeight: number): number {
  const [height, setHeight] = useState(defaultHeight);
  useEffect(() => {
    const update = () => {
      if (window.innerWidth < 640) {
        setHeight(Math.round(defaultHeight * 0.75));
      } else {
        setHeight(defaultHeight);
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [defaultHeight]);
  return height;
}

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

// Currency formatter
const formatCurrency = (value: number) => {
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)}M`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}Jt`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return value.toString();
};

// Custom tooltip
interface CustomTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<TooltipPayloadEntry>;
  label?: string | number;
  valuePrefix?: string;
  valueSuffix?: string;
}

const CustomTooltip = ({ active, payload, label, valuePrefix = '', valueSuffix = '' }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-2">
        <p className="text-xs font-medium text-foreground mb-1">{label}</p>
        {payload.map((entry: TooltipPayloadEntry, index: number) => (
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
  const h = useResponsiveHeight(height);
  if (loading) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">Memuat...</span></div>;
  if (!data || data.length === 0) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">No data available</span></div>;

  return (
    <ResponsiveContainer width="100%" height={h}>
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
  const h = useResponsiveHeight(height);
  if (loading) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">Memuat...</span></div>;
  if (!data || data.length === 0) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">No data available</span></div>;

  return (
    <ResponsiveContainer width="100%" height={h}>
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
  const h = useResponsiveHeight(height);
  if (loading) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">Memuat...</span></div>;
  if (!data || data.length === 0) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">No data available</span></div>;

  const total = data.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

  return (
    <ResponsiveContainer width="100%" height={h}>
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
          label={({ name, percent }: PieLabelRenderProps) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => [(Number(value) ?? 0).toLocaleString('id-ID'), 'User']} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ==================== USER GROWTH LINE CHART ====================
interface UserGrowthChartProps extends BaseChartProps {}

export function UserGrowthChart({ data, loading, height = 200 }: UserGrowthChartProps) {
  const h = useResponsiveHeight(height);
  if (loading) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">Memuat...</span></div>;
  if (!data || data.length === 0) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">No data available</span></div>;

  return (
    <ResponsiveContainer width="100%" height={h}>
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
  const h = useResponsiveHeight(height);
  if (loading) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">Memuat...</span></div>;
  if (!data || data.length === 0) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">No data available</span></div>;

  return (
    <ResponsiveContainer width="100%" height={h}>
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
  const h = useResponsiveHeight(height);
  if (loading) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">Memuat...</span></div>;
  if (!data || data.length === 0) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">No data available</span></div>;

  const statusColors: Record<string, string> = {
    'ACTIVE': COLORS.success,
    'USED': COLORS.info,
    'EXPIRED': COLORS.danger,
    'UNUSED': COLORS.warning,
  };

  return (
    <ResponsiveContainer width="100%" height={h}>
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
        <Tooltip formatter={(value) => [(Number(value) ?? 0).toLocaleString('id-ID'), 'Voucher']} />
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
  const h = useResponsiveHeight(height);
  if (loading) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">Memuat...</span></div>;
  if (!data || data.length === 0) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">No data available</span></div>;

  return (
    <ResponsiveContainer width="100%" height={h}>
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
  const h = useResponsiveHeight(height);
  if (loading) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">Memuat...</span></div>;
  if (!data || data.length === 0) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">No data available</span></div>;

  const formatBandwidth = (value: number) => {
    if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`;
    return `${value.toFixed(0)} MB`;
  };

  return (
    <ResponsiveContainer width="100%" height={h}>
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
        <Tooltip formatter={(value) => [formatBandwidth(Number(value) ?? 0), '']} />
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
  const h = useResponsiveHeight(height);
  if (loading) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">Memuat...</span></div>;
  if (!data || data.length === 0) return <div className="flex items-center justify-center" style={{ height: h }}><span className="text-xs text-muted-foreground">No data available</span></div>;

  return (
    <ResponsiveContainer width="100%" height={h}>
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
