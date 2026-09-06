'use client';

import { useState, useRef, useEffect } from 'react';
import { BarChart3, Download, RefreshCw, ChevronLeft, ChevronRight, X, Copy, CheckCheck } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB, nowWIB, todayWIBStr, parseDateAsWIB } from '@/lib/timezone';
import { apiAdmin, buildUrl } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useApiQuery } from '@/lib/api/hooks';
import { showError } from '@/lib/sweetalert';

interface RekapVoucher {
  batchCode: string;
  createdAt: string;
  firstLoginAt?: string | null;
  agent: { id: string; name: string; phone: string } | null;
  profile: { id: string; name: string; sellingPrice?: number; costPrice?: number; resellerFee?: number };
  router: { id: string; name: string } | null;
  totalQty: number;
  stock: number;
  active: number;
  expired: number;
  sold: number;
  sellingPrice: number;
  costPrice: number;
  resellerFee: number;
  totalRevenue: number;
  agentProfit: number;
  adminEarnings: number;
}

interface DailyBreakdownItem {
  date: string;
  dateLabel: string;
  sold: number;
  active: number;
  expired: number;
  revenue: number;
}

interface VoucherItem {
  id: string;
  code: string;
  status: 'WAITING' | 'ACTIVE' | 'EXPIRED';
  firstLoginAt?: string | null;
  expiresAt?: string | null;
  profile?: { name: string; validityValue?: number | null; validityUnit?: string | null };
}

export default function RekapVoucherPage() {
  const { t } = useTranslation();
  const [filterAgent, setFilterAgent] = useState('');
  const [filterProfile, setFilterProfile] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [periodMode, setPeriodMode] = useState<'all' | 'daily' | 'weekly' | 'monthly'>('all');
  const [periodValue, setPeriodValue] = useState<string>('');
  const [voucherModal, setVoucherModal] = useState<{
    open: boolean;
    batchCode: string;
    filter: '' | 'WAITING' | 'SOLD' | 'ACTIVE' | 'EXPIRED';
    loading: boolean;
    vouchers: VoucherItem[];
    copiedCode: string | null;
  }>({ open: false, batchCode: '', filter: '', loading: false, vouchers: [], copiedCode: null });

  const MONTH_NAMES_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const DAY_NAMES_ID = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

  const todayStr = () => todayWIBStr();
  const currentMonthStr = () => formatWIB(nowWIB(), 'yyyy-MM');
  const getWeekMonday = (dateStr: string) => {
    const d = parseDateAsWIB(dateStr);
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(d.getTime() + diff * 86400000);
    return formatWIB(monday, 'yyyy-MM-dd');
  };
  const switchPeriodMode = (mode: 'all' | 'daily' | 'weekly' | 'monthly') => {
    setPeriodMode(mode);
    if (mode === 'all') { setPeriodValue(''); return; }
    if (mode === 'daily') setPeriodValue(todayStr());
    else if (mode === 'weekly') setPeriodValue(getWeekMonday(todayStr()));
    else setPeriodValue(currentMonthStr());
  };
  const shiftPeriod = (delta: number) => {
    if (periodMode === 'all') return;
    if (periodMode === 'daily') {
      const d = new Date(periodValue + 'T00:00:00');
      d.setDate(d.getDate() + delta);
      setPeriodValue(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    } else if (periodMode === 'weekly') {
      const d = new Date(periodValue + 'T00:00:00');
      d.setDate(d.getDate() + 7 * delta);
      setPeriodValue(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    } else {
      const [y, m] = periodValue.split('-').map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      setPeriodValue(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }
  };
  const getPeriodLabel = () => {
    if (periodMode === 'all') return 'Semua Data';
    if (periodMode === 'daily' && periodValue) {
      const [y, m, day] = periodValue.split('-').map(Number);
      const d = new Date(y, m - 1, day);
      return `${DAY_NAMES_ID[d.getDay()]}, ${day} ${MONTH_NAMES_ID[m - 1].slice(0,3)} ${y}`;
    }
    if (periodMode === 'weekly' && periodValue) {
      const start = new Date(periodValue + 'T00:00:00');
      const end = new Date(periodValue + 'T00:00:00');
      end.setDate(start.getDate() + 6);
      const fmt = (d: Date) => `${d.getDate()} ${MONTH_NAMES_ID[d.getMonth()].slice(0,3)}`;
      return `${fmt(start)} – ${fmt(end)} ${end.getFullYear()}`;
    }
    if (periodMode === 'monthly' && periodValue) {
      const [y, m] = periodValue.split('-').map(Number);
      return `${MONTH_NAMES_ID[m - 1]} ${y}`;
    }
    return '';
  };
  const buildPeriodQueryParams = (): Record<string, string> => {
    if (periodMode === 'monthly' && periodValue) return { month: periodValue };
    if (periodMode === 'daily' && periodValue) return { date: periodValue };
    if (periodMode === 'weekly' && periodValue) return { week: periodValue };
    return {};
  };

  const rekapParams: Record<string, unknown> = {
    agentId: filterAgent && filterAgent !== 'all' ? filterAgent : undefined,
    profileId: filterProfile && filterProfile !== 'all' ? filterProfile : undefined,
    ...buildPeriodQueryParams(),
  };
  const { data: rekapData, isLoading: loading, refetch: refetchRekap } = useApiQuery<{ rekap?: RekapVoucher[]; dailyBreakdown?: DailyBreakdownItem[]; mode?: string; agents?: { id: string; name: string }[]; profiles?: { id: string; name: string }[] }>(
    '/api/hotspot/rekap-voucher',
    { params: rekapParams, staleTime: 30000 }
  );
  const rekap = rekapData?.rekap || [];
  const dailyBreakdown = rekapData?.dailyBreakdown || [];
  const isPeriodMode = rekapData?.mode === 'period';
  const agents = rekapData?.agents || [];
  const profiles = rekapData?.profiles || [];

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (filterAgent && filterAgent !== 'all') params.set('agentId', filterAgent);
      if (filterProfile && filterProfile !== 'all') params.set('profileId', filterProfile);
      Object.entries(buildPeriodQueryParams()).forEach(([k, v]) => params.set(k, v));
      const res = await fetch(buildUrl(`/api/hotspot/rekap-voucher/export?${params}`), { credentials: 'include' });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Rekap-Voucher-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      showError('Gagal export data');
    }
  };

  const openVoucherModal = async (batchCode: string, statusFilter: '' | 'WAITING' | 'SOLD' | 'ACTIVE' | 'EXPIRED') => {
    setVoucherModal({ open: true, batchCode, filter: statusFilter, loading: true, vouchers: [], copiedCode: null });
    try {
      const params = new URLSearchParams({ batchCode, limit: '500' });
      if (statusFilter && statusFilter !== 'SOLD') params.set('status', statusFilter);
      const data = await apiAdmin<{ vouchers?: VoucherItem[] }>(`/api/hotspot/voucher?${params}`);
      let vouchers = (data.vouchers || []) as VoucherItem[];
      if (statusFilter === 'SOLD') vouchers = vouchers.filter(v => v.status !== 'WAITING');
      setVoucherModal(prev => ({ ...prev, loading: false, vouchers }));
    } catch {
      setVoucherModal(prev => ({ ...prev, loading: false }));
    }
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setVoucherModal(prev => ({ ...prev, copiedCode: code }));
    setTimeout(() => setVoucherModal(prev => ({ ...prev, copiedCode: null })), 1500);
  };

  const formatDate = (dateString: string) => {
    try {
      return formatWIB(new Date(dateString), 'dd/MM/yyyy HH:mm');
    } catch {
      const date = new Date(dateString);
      return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    }
  };

  const filteredRekap = rekap.filter(item => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return item.batchCode?.toLowerCase().includes(search) || item.agent?.name?.toLowerCase().includes(search) || item.profile?.name?.toLowerCase().includes(search);
  });

  const totalQty = filteredRekap.reduce((s, i) => s + i.totalQty, 0);
  const totalStock = filteredRekap.reduce((s, i) => s + i.stock, 0);
  const totalActive = filteredRekap.reduce((s, i) => s + i.active, 0);
  const totalExpired = filteredRekap.reduce((s, i) => s + i.expired, 0);
  const totalSold = filteredRekap.reduce((s, i) => s + i.sold, 0);
  const totalRevenue = filteredRekap.reduce((s, i) => s + i.totalRevenue, 0);
  const totalAdminEarnings = filteredRekap.reduce((s, i) => s + i.adminEarnings, 0);
  const totalAgentProfit = filteredRekap.reduce((s, i) => s + i.agentProfit, 0);

  // Per-agent summary
  const agentMap = new Map<string, { name: string; sold: number; profit: number }>();
  filteredRekap.forEach(item => {
    if (!item.agent) return;
    const prev = agentMap.get(item.agent.id) ?? { name: item.agent.name, sold: 0, profit: 0 };
    agentMap.set(item.agent.id, { name: prev.name, sold: prev.sold + item.sold, profit: prev.profit + item.agentProfit });
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">{t('hotspot.rekapVoucherTitle')}</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetchRekap()} className="p-2 rounded-lg border border-border hover:bg-muted transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-card rounded-lg border border-border p-3 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)} className="px-2.5 py-1.5 text-xs border border-border rounded-md bg-card">
            <option value="">{t('hotspot.allAgents')}</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={filterProfile} onChange={(e) => setFilterProfile(e.target.value)} className="px-2.5 py-1.5 text-xs border border-border rounded-md bg-card">
            <option value="">{t('hotspot.allProfiles')}</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cari batch / agent / profile..." className="px-2.5 py-1.5 text-xs border border-border rounded-md bg-card col-span-2" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {(['all', 'daily', 'weekly', 'monthly'] as const).map(mode => (
              <button key={mode} onClick={() => switchPeriodMode(mode)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${periodMode === mode ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {mode === 'all' ? 'Semua' : mode === 'daily' ? 'Harian' : mode === 'weekly' ? 'Mingguan' : 'Bulanan'}
              </button>
            ))}
          </div>
          {periodMode !== 'all' && (
            <div className="flex items-center gap-1">
              <button onClick={() => shiftPeriod(-1)} className="p-1 rounded hover:bg-muted"><ChevronLeft className="w-4 h-4 text-muted-foreground" /></button>
              <span className="text-xs font-medium text-foreground min-w-[140px] text-center">{getPeriodLabel()}</span>
              <button onClick={() => shiftPeriod(1)} className="p-1 rounded hover:bg-muted"><ChevronRight className="w-4 h-4 text-muted-foreground" /></button>
            </div>
          )}
        </div>
      </div>

      {/* Summary Stats — compact inline */}
      <div className="flex flex-wrap gap-2 text-xs">
        {isPeriodMode ? (
          <>
            <Stat label="Terjual" value={totalSold} color="text-orange-500" />
            <Stat label="Aktif" value={totalActive} color="text-green-500" />
            <Stat label="Expired" value={totalExpired} color="text-red-400" />
          </>
        ) : (
          <>
            <Stat label="Qty" value={totalQty} color="text-primary" />
            <Stat label="Stok" value={totalStock} color="text-green-500" />
            <Stat label="Terjual" value={totalSold} color="text-orange-500" />
            <Stat label="Aktif" value={totalActive} color="text-green-500" />
            <Stat label="Expired" value={totalExpired} color="text-red-400" />
          </>
        )}
        <Stat label="Pendapatan" value={formatCurrency(totalRevenue)} color="text-brand-500" />
        <Stat label="Admin" value={formatCurrency(totalAdminEarnings)} color="text-blue-400" />
        {totalAgentProfit > 0 && <Stat label="Profit Agent" value={formatCurrency(totalAgentProfit)} color="text-violet-500" />}
      </div>

      {/* Daily Breakdown — period mode only */}
      {isPeriodMode && dailyBreakdown.length > 0 && (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-3 py-2 bg-muted border-b border-border text-xs font-semibold">Rincian per Hari</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[500px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap">Tanggal</th>
                  <th className="px-3 py-1.5 text-right font-medium whitespace-nowrap">Terjual</th>
                  <th className="px-3 py-1.5 text-right font-medium whitespace-nowrap">Aktif</th>
                  <th className="px-3 py-1.5 text-right font-medium whitespace-nowrap">Expired</th>
                  <th className="px-3 py-1.5 text-right font-medium whitespace-nowrap">Pendapatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dailyBreakdown.map(d => (
                  <tr key={d.date} className="hover:bg-muted/50">
                    <td className="px-3 py-1.5 font-medium text-foreground whitespace-nowrap">{d.dateLabel}</td>
                    <td className="px-3 py-1.5 text-right text-orange-500 font-medium whitespace-nowrap">{d.sold}</td>
                    <td className="px-3 py-1.5 text-right text-green-500 whitespace-nowrap">{d.active}</td>
                    <td className="px-3 py-1.5 text-right text-red-400 whitespace-nowrap">{d.expired}</td>
                    <td className="px-3 py-1.5 text-right text-brand-500 font-medium whitespace-nowrap">{formatCurrency(d.revenue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted border-t border-border font-bold">
                <tr>
                  <td className="px-3 py-1.5 whitespace-nowrap">Total</td>
                  <td className="px-3 py-1.5 text-right text-orange-500 whitespace-nowrap">{dailyBreakdown.reduce((s,d) => s+d.sold, 0)}</td>
                  <td className="px-3 py-1.5 text-right text-green-500 whitespace-nowrap">{dailyBreakdown.reduce((s,d) => s+d.active, 0)}</td>
                  <td className="px-3 py-1.5 text-right text-red-400 whitespace-nowrap">{dailyBreakdown.reduce((s,d) => s+d.expired, 0)}</td>
                  <td className="px-3 py-1.5 text-right text-brand-500 whitespace-nowrap">{formatCurrency(dailyBreakdown.reduce((s,d) => s+d.revenue, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Per-agent summary — only if agent data exists */}
      {agentMap.size > 0 && (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-3 py-2 bg-muted border-b border-border text-xs font-semibold">Pendapatan per Agent</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[400px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-3 py-1.5 text-left font-medium whitespace-nowrap">Agent</th>
                  <th className="px-3 py-1.5 text-right font-medium whitespace-nowrap">Terjual</th>
                  <th className="px-3 py-1.5 text-right font-medium whitespace-nowrap">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Array.from(agentMap.entries()).map(([id, a]) => (
                  <tr key={id} className="hover:bg-muted/50">
                    <td className="px-3 py-1.5 font-medium text-foreground whitespace-nowrap">{a.name}</td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground whitespace-nowrap">{a.sold}</td>
                    <td className="px-3 py-1.5 text-right text-violet-500 font-medium whitespace-nowrap">{formatCurrency(a.profit)}</td>
                  </tr>
                ))}
              </tbody>
              {agentMap.size > 1 && (
                <tfoot className="bg-muted border-t border-border font-bold">
                  <tr>
                    <td className="px-3 py-1.5 whitespace-nowrap">Total</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">{filteredRekap.filter(i => i.agent).reduce((s,i) => s+i.sold, 0)}</td>
                    <td className="px-3 py-1.5 text-right text-violet-500 whitespace-nowrap">{formatCurrency(totalAgentProfit)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Main Table — responsive (cards on mobile, table on desktop) */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('common.loading')}</div>
      ) : filteredRekap.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('hotspot.noRekapData')}</div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filteredRekap.map((item, i) => (
              <div key={item.batchCode} className="bg-card rounded-lg border border-border p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-mono text-xs text-foreground">{item.batchCode}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {isPeriodMode && item.firstLoginAt ? `Terjual: ${formatDate(item.firstLoginAt)}` : formatDate(item.createdAt)}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">#{i+1}</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs mb-2">
                  <div>
                    <span className="text-muted-foreground">Agent: </span>
                    <span className="font-medium">{item.agent?.name || 'Admin'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Profile: </span>
                    <span className="font-medium">{item.profile.name}</span>
                  </div>
                  {item.router && <div className="col-span-2"><span className="text-muted-foreground">Router: </span><span className="font-medium">{item.router.name}</span></div>}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs border-t border-border pt-2">
                  {isPeriodMode ? (
                    <>
                      <span className="text-orange-500">Terjual: <strong>{item.sold}</strong></span>
                      <span className="text-green-500">Aktif: <strong>{item.active}</strong></span>
                      <span className="text-red-400">Exp: <strong>{item.expired}</strong></span>
                    </>
                  ) : (
                    <>
                      <button onClick={() => openVoucherModal(item.batchCode, '')} className="text-primary hover:underline">Qty: <strong>{item.totalQty}</strong></button>
                      <button onClick={() => openVoucherModal(item.batchCode, 'WAITING')} className="text-green-500 hover:underline">Stok: <strong>{item.stock}</strong></button>
                      <button onClick={() => openVoucherModal(item.batchCode, 'SOLD')} className="text-orange-500 hover:underline">Terjual: <strong>{item.sold}</strong></button>
                      <span className="text-green-500">Aktif: {item.active}</span>
                      <span className="text-red-400">Exp: {item.expired}</span>
                    </>
                  )}
                  <span className="text-brand-500 ml-auto">Pendapatan: <strong>{formatCurrency(item.totalRevenue)}</strong></span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-card rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[1100px]">
                <thead className="bg-muted border-b border-border text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap w-8">#</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Batch</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">{isPeriodMode ? 'Tgl Terjual' : 'Tgl Dibuat'}</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Agent</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Profile</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Router</th>
                    {!isPeriodMode && <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Qty</th>}
                    {!isPeriodMode && <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Stok</th>}
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Terjual</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Aktif</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Exp</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Harga</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Pendapatan</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Profit Agent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRekap.map((item, i) => (
                    <tr key={item.batchCode} className="hover:bg-muted/50">
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{i+1}</td>
                      <td className="px-3 py-2 font-mono text-foreground whitespace-nowrap">{item.batchCode}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {isPeriodMode && item.firstLoginAt ? formatDate(item.firstLoginAt) : formatDate(item.createdAt)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {item.agent ? (
                          <div><div className="font-medium text-foreground">{item.agent.name}</div><div className="text-muted-foreground">{item.agent.phone}</div></div>
                        ) : <span className="text-muted-foreground italic">Admin</span>}
                      </td>
                      <td className="px-3 py-2 text-foreground whitespace-nowrap">{item.profile.name}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{item.router?.name || '-'}</td>
                      {!isPeriodMode && (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button onClick={() => openVoucherModal(item.batchCode, '')} className="text-primary hover:underline cursor-pointer font-medium">{item.totalQty}</button>
                        </td>
                      )}
                      {!isPeriodMode && (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button onClick={() => openVoucherModal(item.batchCode, 'WAITING')} className="text-green-500 hover:underline cursor-pointer font-medium">{item.stock}</button>
                        </td>
                      )}
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => openVoucherModal(item.batchCode, 'SOLD')} className="text-orange-500 hover:underline cursor-pointer font-medium">{item.sold}</button>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => openVoucherModal(item.batchCode, 'ACTIVE')} className="text-green-500 hover:underline cursor-pointer">{item.active}</button>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => openVoucherModal(item.batchCode, 'EXPIRED')} className="text-muted-foreground hover:underline cursor-pointer">{item.expired}</button>
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">{item.sellingPrice > 0 ? formatCurrency(item.sellingPrice) : '-'}</td>
                      <td className="px-3 py-2 text-right font-medium text-brand-500 whitespace-nowrap">{item.totalRevenue > 0 ? formatCurrency(item.totalRevenue) : '-'}</td>
                      <td className="px-3 py-2 text-right font-medium text-violet-500 whitespace-nowrap">{item.agentProfit > 0 ? formatCurrency(item.agentProfit) : <span className="text-muted-foreground">-</span>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted border-t border-border font-bold">
                  <tr>
                    <td colSpan={isPeriodMode ? 6 : 8} className="px-3 py-2 text-right text-foreground whitespace-nowrap">Total:</td>
                    {!isPeriodMode && <td className="px-3 py-2 text-right text-primary whitespace-nowrap">{totalQty}</td>}
                    {!isPeriodMode && <td className="px-3 py-2 text-right text-green-500 whitespace-nowrap">{totalStock}</td>}
                    <td className="px-3 py-2 text-right text-orange-500 whitespace-nowrap">{totalSold}</td>
                    <td className="px-3 py-2 text-right text-green-500 whitespace-nowrap">{totalActive}</td>
                    <td className="px-3 py-2 text-right text-red-400 whitespace-nowrap">{totalExpired}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">-</td>
                    <td className="px-3 py-2 text-right text-brand-500 whitespace-nowrap">{formatCurrency(totalRevenue)}</td>
                    <td className="px-3 py-2 text-right text-violet-500 whitespace-nowrap">{formatCurrency(totalAgentProfit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Voucher Codes Modal */}
      {voucherModal.open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setVoucherModal(prev => ({ ...prev, open: false }))}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full sm:max-w-lg bg-card border border-border rounded-t-2xl sm:rounded-lg flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <div className="font-semibold text-sm text-foreground">Kode Voucher</div>
                <div className="text-[10px] text-muted-foreground font-mono">{voucherModal.batchCode}</div>
              </div>
              <div className="flex items-center gap-1">
                {(['', 'WAITING', 'SOLD', 'ACTIVE', 'EXPIRED'] as const).map(f => (
                  <button key={f} onClick={() => openVoucherModal(voucherModal.batchCode, f)}
                    className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${voucherModal.filter === f ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                    {f === '' ? 'Semua' : f === 'WAITING' ? 'Stok' : f === 'SOLD' ? 'Terjual' : f === 'ACTIVE' ? 'Aktif' : 'Expired'}
                  </button>
                ))}
                <button onClick={() => setVoucherModal(prev => ({ ...prev, open: false }))} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-3">
              {voucherModal.loading ? (
                <div className="py-8 text-center text-muted-foreground text-xs">Memuat...</div>
              ) : voucherModal.vouchers.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-xs">Tidak ada voucher</div>
              ) : (
                <div className="divide-y divide-border">
                  {voucherModal.vouchers.map((v, idx) => (
                    <div key={v.id} className={`flex items-start gap-2 py-2 px-1 hover:bg-muted/30 rounded ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <button onClick={() => copyCode(v.code)} className="font-mono text-[11px] font-medium hover:underline cursor-pointer flex items-center gap-1 text-left w-full">
                          <span className={v.status === 'WAITING' ? 'text-green-500' : v.status === 'ACTIVE' ? 'text-green-400' : 'text-muted-foreground'}>{v.code}</span>
                          {voucherModal.copiedCode === v.code ? <CheckCheck className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-muted-foreground/40" />}
                        </button>
                        {v.profile && <div className="text-[10px] text-muted-foreground mt-0.5">{v.profile.name}{v.profile.validityValue ? ` · ${v.profile.validityValue} ${v.profile.validityUnit}` : ''}</div>}
                        {(v.firstLoginAt || v.expiresAt) && (
                          <div className="flex flex-wrap gap-x-3 mt-0.5">
                            {v.firstLoginAt && <span className="text-[10px] text-muted-foreground">Login: {formatDate(v.firstLoginAt)}</span>}
                            {v.expiresAt && <span className="text-[10px] text-muted-foreground">Exp: {formatDate(v.expiresAt)}</span>}
                          </div>
                        )}
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 font-medium ${v.status === 'WAITING' ? 'bg-green-500/10 text-green-500' : v.status === 'ACTIVE' ? 'bg-green-400/10 text-green-400' : 'bg-muted text-muted-foreground'}`}>
                        {v.status === 'WAITING' ? 'STOK' : v.status === 'ACTIVE' ? 'AKTIF' : 'EXP'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {!voucherModal.loading && voucherModal.vouchers.length > 0 && (
              <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground flex justify-between">
                <span>{voucherModal.filter === '' ? 'Semua' : voucherModal.filter === 'WAITING' ? 'Stok' : voucherModal.filter === 'SOLD' ? 'Terjual' : voucherModal.filter === 'ACTIVE' ? 'Aktif' : 'Expired'}: <strong>{voucherModal.vouchers.length}</strong> voucher</span>
                <span>Klik kode untuk copy</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Compact stat pill
function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 flex items-center gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <span className={`font-bold ${color}`}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  );
}
