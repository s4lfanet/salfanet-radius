'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Download, RefreshCw, Filter, ChevronLeft, ChevronRight, X, Copy, CheckCheck } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface RekapVoucher {
  batchCode: string;
  createdAt: string;
  agent: {
    id: string;
    name: string;
    phone: string;
  } | null;
  profile: {
    id: string;
    name: string;
    sellingPrice?: number;
  };
  router: {
    id: string;
    name: string;
  } | null;
  totalQty: number;
  stock: number;    // WAITING
  active: number;   // ACTIVE
  expired: number;  // EXPIRED
  sold: number;     // ACTIVE + EXPIRED
  sellingPrice: number;
  totalRevenue: number;
}

interface VoucherItem {
  id: string;
  code: string;
  status: 'WAITING' | 'ACTIVE' | 'EXPIRED';
  firstLoginAt?: string | null;
  expiresAt?: string | null;
  profile?: {
    name: string;
    validityValue?: number | null;
    validityUnit?: string | null;
  };
}

export default function RekapVoucherPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [rekap, setRekap] = useState<RekapVoucher[]>([]);
  const [filterAgent, setFilterAgent] = useState('');
  const [filterProfile, setFilterProfile] = useState('');
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [voucherMonth, setVoucherMonth] = useState<string>(''); // '' = all-time
  const [voucherModal, setVoucherModal] = useState<{
    open: boolean;
    batchCode: string;
    filter: '' | 'WAITING' | 'SOLD' | 'ACTIVE' | 'EXPIRED';
    loading: boolean;
    vouchers: VoucherItem[];
    copiedCode: string | null;
  }>({ open: false, batchCode: '', filter: '', loading: false, vouchers: [], copiedCode: null });

  const MONTH_NAMES_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const getMonthLabel = (ym: string) => {
    if (!ym) return 'Semua';
    const [y, m] = ym.split('-').map(Number);
    return `${MONTH_NAMES_ID[m - 1]} ${y}`;
  };
  const shiftVoucherMonth = (delta: number) => {
    const base = voucherMonth || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();
    const [y, m] = base.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setVoucherMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  };

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAgent, filterProfile, voucherMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterAgent && filterAgent !== 'all') params.set('agentId', filterAgent);
      if (filterProfile && filterProfile !== 'all') params.set('profileId', filterProfile);
      if (voucherMonth) params.set('month', voucherMonth);

      const res = await fetch(`/api/hotspot/rekap-voucher?${params}`);
      const data = await res.json();
      setRekap(data.rekap || []);
      setAgents(data.agents || []);
      setProfiles(data.profiles || []);
    } catch (error) {
      console.error('Failed to fetch rekap:', error);
    }
    setLoading(false);
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (filterAgent && filterAgent !== 'all') params.set('agentId', filterAgent);
      if (filterProfile && filterProfile !== 'all') params.set('profileId', filterProfile);
      if (voucherMonth) params.set('month', voucherMonth);
      
      const res = await fetch(`/api/hotspot/rekap-voucher/export?${params}`);
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
    }
  };

  const openVoucherModal = async (batchCode: string, statusFilter: '' | 'WAITING' | 'SOLD' | 'ACTIVE' | 'EXPIRED') => {
    setVoucherModal({ open: true, batchCode, filter: statusFilter, loading: true, vouchers: [], copiedCode: null });
    try {
      const params = new URLSearchParams({ batchCode, limit: '500' });
      // For SOLD (Terjual), fetch all then filter client-side to ACTIVE+EXPIRED
      if (statusFilter && statusFilter !== 'SOLD') params.set('status', statusFilter);
      const res = await fetch(`/api/hotspot/voucher?${params}`);
      const data = await res.json();
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
      const { formatWIB } = require('@/lib/timezone');
      return formatWIB(new Date(dateString), 'dd/MM/yyyy HH:mm');
    } catch {
      const date = new Date(dateString);
      return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    }
  };

  const filteredRekap = rekap.filter(item => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      item.batchCode.toLowerCase().includes(search) ||
      item.agent?.name.toLowerCase().includes(search) ||
      item.profile.name.toLowerCase().includes(search)
    );
  });

  const totalQty = filteredRekap.reduce((sum, item) => sum + item.totalQty, 0);
  const totalStock = filteredRekap.reduce((sum, item) => sum + item.stock, 0);
  const totalActive = filteredRekap.reduce((sum, item) => sum + item.active, 0);
  const totalExpired = filteredRekap.reduce((sum, item) => sum + item.expired, 0);
  const totalSold = filteredRekap.reduce((sum, item) => sum + item.sold, 0);
  const totalRevenue = filteredRekap.reduce((sum, item) => sum + item.totalRevenue, 0);

  const formatRupiah = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

  return (
    <div className="bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#00f7ff]" />
            {t('hotspot.rekapVoucherTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t('hotspot.rekapVoucherSubtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-card border-2 border-primary/30 rounded-lg hover:bg-primary/10 hover:border-primary/50 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5 text-primary" />
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent hover:bg-accent/90 text-black font-bold rounded-lg shadow-[0_0_15px_rgba(0,247,255,0.3)] hover:shadow-[0_0_20px_rgba(0,247,255,0.5)] transition-all border border-accent/50"
          >
            <Download className="w-3.5 h-3.5" />
            {t('common.export')}
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              <Filter className="w-3 h-3 inline mr-1" />
              {t('agent.title').split(' ')[0]}
            </label>
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-border rounded-md bg-card"
            >
              <option value="">{t('hotspot.allAgents')}</option>
              <option value="all">{t('hotspot.allAgents')}</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              <Filter className="w-3 h-3 inline mr-1" />
              {t('hotspot.profile')}
            </label>
            <select
              value={filterProfile}
              onChange={(e) => setFilterProfile(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-border rounded-md bg-card"
            >
              <option value="">{t('hotspot.allProfiles')}</option>
              <option value="all">{t('hotspot.allProfiles')}</option>
              {profiles.map(profile => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-foreground mb-1.5">
              {t('hotspot.searchBatchAgentProfile')}
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('hotspot.typeToSearch')}
              className="w-full px-2.5 py-1.5 text-xs border border-border rounded-md bg-card"
            />
          </div>
        </div>
        {/* Month Filter */}
        <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Periode:</span>
          <div className="flex items-center gap-1 border border-border rounded-lg bg-muted/30 px-1 py-1">
            <button
              onClick={() => shiftVoucherMonth(-1)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setVoucherMonth('')}
              className="text-xs font-medium text-foreground min-w-[90px] text-center hover:text-primary transition-colors"
              title="Klik untuk reset ke semua"
            >
              {getMonthLabel(voucherMonth)}
            </button>
            <button
              onClick={() => shiftVoucherMonth(1)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-lg border-2 border-primary/30 shadow-[0_0_15px_rgba(188,19,254,0.1)]">
          <div className="text-xs text-primary font-bold uppercase mb-1">{t('hotspot.totalQty')}</div>
          <div className="text-lg sm:text-2xl font-bold text-primary drop-shadow-[0_0_5px_rgba(188,19,254,0.5)]">{totalQty.toLocaleString()}</div>
        </div>
        <div className="bg-card p-4 rounded-lg border-2 border-success/30 shadow-[0_0_15px_rgba(0,255,136,0.1)]">
          <div className="text-xs text-success font-bold uppercase mb-1">{t('hotspot.stock')}</div>
          <div className="text-lg sm:text-2xl font-bold text-success drop-shadow-[0_0_5px_rgba(0,255,136,0.5)]">{totalStock.toLocaleString()}</div>
        </div>
        <div className="bg-card p-4 rounded-lg border-2 border-warning/30 shadow-[0_0_15px_rgba(255,170,0,0.1)]">
          <div className="text-xs text-warning font-bold uppercase mb-1">{t('hotspot.sold')}</div>
          <div className="text-lg sm:text-2xl font-bold text-warning drop-shadow-[0_0_5px_rgba(255,170,0,0.5)]">{totalSold.toLocaleString()}</div>
        </div>
        <div className="bg-card p-4 rounded-lg border-2 border-[#00f7ff]/30 shadow-[0_0_15px_rgba(0,247,255,0.1)] col-span-2 md:col-span-1">
          <div className="text-xs text-[#00f7ff] font-bold uppercase mb-1">Total Pendapatan</div>
          <div className="text-base sm:text-xl font-bold text-[#00f7ff] drop-shadow-[0_0_5px_rgba(0,247,255,0.5)]">{formatRupiah(totalRevenue)}</div>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-xs">{t('common.loading')}</div>
        ) : filteredRekap.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-xs">{t('hotspot.noRekapData')}</div>
        ) : (
          filteredRekap.map((item, index) => (
            <div key={item.batchCode} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-mono text-xs text-foreground">{item.batchCode}</div>
                  <div className="text-[10px] text-muted-foreground">{formatDate(item.createdAt)}</div>
                </div>
                <span className="text-[10px] text-muted-foreground">#{index + 1}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                <div>
                  <div className="text-[10px] text-muted-foreground">{t('hotspot.partnerAgent')}</div>
                  {item.agent ? (
                    <div>
                      <div className="font-medium text-foreground">{item.agent.name}</div>
                      <div className="text-[10px] text-muted-foreground">{item.agent.phone}</div>
                    </div>
                  ) : (
                    <div className="italic text-muted-foreground">{t('hotspot.admin')}</div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">{t('hotspot.profile')}</div>
                  <div>{item.profile.name}</div>
                  {item.sellingPrice > 0 && (
                    <div className="text-[10px] text-muted-foreground">{formatRupiah(item.sellingPrice)}/voucher</div>
                  )}
                </div>
                {item.router && (
                  <div className="col-span-2">
                    <div className="text-[10px] text-muted-foreground">Router</div>
                    <div className="font-medium text-foreground">{item.router.name}</div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs border-t border-border pt-2">
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground">{t('hotspot.qty')}</div>
                  <button onClick={() => openVoucherModal(item.batchCode, '')} className="font-medium text-primary hover:underline cursor-pointer">{item.totalQty}</button>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground">{t('hotspot.stock')}</div>
                  <button onClick={() => openVoucherModal(item.batchCode, 'WAITING')} className="font-medium text-success hover:underline cursor-pointer">{item.stock}</button>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground">{t('hotspot.sold')}</div>
                  <button onClick={() => openVoucherModal(item.batchCode, 'SOLD')} className="font-medium text-orange-600 hover:underline cursor-pointer">{item.sold}</button>
                  <div className="text-[9px] text-muted-foreground mt-0.5">{item.active}↑ {item.expired}↓</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground">Nominal</div>
                  <div className="font-medium text-[#00f7ff] text-[10px]">{formatRupiah(item.totalRevenue)}</div>
                </div>
              </div>
            </div>
          ))
        )}
        {filteredRekap.length > 0 && (
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/40 p-3">
            <div className="grid grid-cols-2 gap-2 text-xs mb-2">
              <div className="text-center">
                <div className="text-[10px] text-muted-foreground font-bold">{t('common.total')} {t('hotspot.qty')}</div>
                <div className="font-bold text-primary">{totalQty.toLocaleString()}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-muted-foreground font-bold">{t('common.total')} {t('hotspot.stock')}</div>
                <div className="font-bold text-success">{totalStock.toLocaleString()}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-muted-foreground font-bold">{t('common.total')} {t('hotspot.sold')}</div>
                <div className="font-bold text-orange-600">{totalSold.toLocaleString()}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-muted-foreground font-bold">Total Pendapatan</div>
                <div className="font-bold text-[#00f7ff] text-[11px]">{formatRupiah(totalRevenue)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table - Desktop */}
      <div className="hidden md:block bg-card rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">#</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('hotspot.batchCode')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('hotspot.creationDate')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('hotspot.partnerAgent')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('hotspot.profile')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Router</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase">{t('hotspot.qty')}</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase">{t('hotspot.stock')}</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase">{t('hotspot.sold')}</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase">Aktif</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase">Expired</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase">Harga/pcs</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase">Pendapatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-muted-foreground text-xs">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : filteredRekap.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-muted-foreground text-xs">
                    {t('hotspot.noRekapData')}
                  </td>
                </tr>
              ) : (
                filteredRekap.map((item, index) => (
                  <tr key={item.batchCode} className="hover:bg-muted">
                    <td className="px-3 py-2 text-[10px] text-muted-foreground">{index + 1}</td>
                    <td className="px-3 py-2 text-[10px] font-mono text-foreground">
                      {item.batchCode}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-muted-foreground">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-muted-foreground">
                      {item.agent ? (
                        <div>
                          <div className="font-medium text-foreground">{item.agent.name}</div>
                          <div className="text-muted-foreground">{item.agent.phone}</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">{t('hotspot.admin')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-muted-foreground">
                      {item.profile.name}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-muted-foreground">
                      {item.router?.name || <span className="italic">-</span>}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-right">
                      <button onClick={() => openVoucherModal(item.batchCode, '')} className="font-medium text-primary hover:underline cursor-pointer">{item.totalQty}</button>
                    </td>
                    <td className="px-3 py-2 text-[10px] text-right">
                      <button onClick={() => openVoucherModal(item.batchCode, 'WAITING')} className="font-medium text-success hover:underline cursor-pointer">{item.stock}</button>
                    </td>
                    <td className="px-3 py-2 text-[10px] text-right">
                      <button onClick={() => openVoucherModal(item.batchCode, 'SOLD')} className="font-medium text-orange-600 hover:underline cursor-pointer">{item.sold}</button>
                    </td>
                    <td className="px-3 py-2 text-[10px] text-right">
                      <button onClick={() => openVoucherModal(item.batchCode, 'ACTIVE')} className="font-medium text-green-500 hover:underline cursor-pointer">{item.active}</button>
                    </td>
                    <td className="px-3 py-2 text-[10px] text-right">
                      <button onClick={() => openVoucherModal(item.batchCode, 'EXPIRED')} className="font-medium text-muted-foreground hover:underline cursor-pointer">{item.expired}</button>
                    </td>
                    <td className="px-3 py-2 text-[10px] text-right font-medium text-muted-foreground">
                      {item.sellingPrice > 0 ? formatRupiah(item.sellingPrice) : '-'}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-right font-medium text-[#00f7ff]">
                      {item.totalRevenue > 0 ? formatRupiah(item.totalRevenue) : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredRekap.length > 0 && (
              <tfoot className="bg-muted border-t border-border">
                <tr className="font-bold">
                  <td colSpan={6} className="px-3 py-2 text-xs text-foreground text-right">
                    {t('common.total')}:
                  </td>
                  <td className="px-3 py-2 text-xs text-right text-primary">
                    {totalQty.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs text-right text-success">
                    {totalStock.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs text-right text-orange-600">
                    {totalSold.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs text-right text-green-500">
                    {totalActive.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs text-right text-muted-foreground">
                    {totalExpired.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs text-right text-muted-foreground">-</td>
                  <td className="px-3 py-2 text-xs text-right text-[#00f7ff]">
                    {formatRupiah(totalRevenue)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Info Footer */}
      <div className="text-xs text-muted-foreground bg-muted p-3 rounded-lg">
        <div className="flex items-start gap-2">
          <div className="mt-0.5">ℹ️</div>
          <div>
            <div className="font-medium mb-1">{t('hotspot.notes')}:</div>
            <ul className="list-disc list-inside space-y-0.5">
              <li><strong>{t('hotspot.qty')}:</strong> {t('hotspot.qtyDesc')}</li>
              <li><strong>{t('hotspot.stock')}:</strong> {t('hotspot.stockDesc')}</li>
              <li><strong>{t('hotspot.sold')}:</strong> {t('hotspot.soldDesc')} — <span className="text-foreground">klik angka untuk lihat kode voucher</span></li>
            </ul>
          </div>
        </div>
      </div>
      </div>

      {/* Voucher Codes Modal */}
      {voucherModal.open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setVoucherModal(prev => ({ ...prev, open: false }))}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full sm:max-w-lg bg-card border border-[#bc13fe]/30 rounded-t-2xl sm:rounded-xl shadow-[0_0_40px_rgba(188,19,254,0.3)] flex flex-col max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <div className="font-semibold text-sm text-foreground">Kode Voucher</div>
                <div className="text-[10px] text-muted-foreground font-mono">{voucherModal.batchCode}</div>
              </div>
              <div className="flex items-center gap-2">
                {/* Filter tabs */}
                {(['', 'WAITING', 'SOLD', 'ACTIVE', 'EXPIRED'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => openVoucherModal(voucherModal.batchCode, f)}
                    className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
                      voucherModal.filter === f
                        ? f === '' ? 'bg-primary text-white' : f === 'WAITING' ? 'bg-success text-white' : f === 'SOLD' ? 'bg-orange-500 text-white' : f === 'ACTIVE' ? 'bg-green-500 text-white' : 'bg-muted-foreground text-white'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {f === '' ? 'Semua' : f === 'WAITING' ? 'Stok' : f === 'SOLD' ? 'Terjual' : f === 'ACTIVE' ? 'Aktif' : 'Expired'}
                  </button>
                ))}
                <button onClick={() => setVoucherModal(prev => ({ ...prev, open: false }))} className="p-1 hover:bg-muted rounded cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 p-3">
              {voucherModal.loading ? (
                <div className="py-8 text-center text-muted-foreground text-xs">Memuat...</div>
              ) : voucherModal.vouchers.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-xs">Tidak ada voucher</div>
              ) : (
                <div className="divide-y divide-border">
                  {voucherModal.vouchers.map((v, idx) => (
                    <div key={v.id} className={`flex items-start gap-2 py-2 px-1 hover:bg-muted/30 rounded transition-colors ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => copyCode(v.code)}
                          className="font-mono text-[11px] font-medium hover:underline cursor-pointer flex items-center gap-1 text-left w-full"
                        >
                          <span className={v.status === 'WAITING' ? 'text-success' : v.status === 'ACTIVE' ? 'text-green-400' : 'text-muted-foreground'}>
                            {v.code}
                          </span>
                          {voucherModal.copiedCode === v.code
                            ? <CheckCheck className="w-3 h-3 flex-shrink-0 text-success" />
                            : <Copy className="w-3 h-3 flex-shrink-0 text-muted-foreground/40" />
                          }
                        </button>
                        {v.profile && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {v.profile.name}{v.profile.validityValue ? ` · ${v.profile.validityValue} ${v.profile.validityUnit}` : ''}
                          </div>
                        )}
                        {(v.firstLoginAt || v.expiresAt) && (
                          <div className="flex flex-wrap gap-x-3 mt-0.5">
                            {v.firstLoginAt && <span className="text-[10px] text-muted-foreground">Login: {formatDate(v.firstLoginAt)}</span>}
                            {v.expiresAt && <span className="text-[10px] text-muted-foreground">Exp: {formatDate(v.expiresAt)}</span>}
                          </div>
                        )}
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 font-medium ${
                        v.status === 'WAITING' ? 'bg-success/10 text-success' : v.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground'
                      }`}>
                        {v.status === 'WAITING' ? 'STOK' : v.status === 'ACTIVE' ? 'AKTIF' : 'EXP'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Modal Footer */}
            {!voucherModal.loading && voucherModal.vouchers.length > 0 && (
              <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground flex justify-between">
                <span>
                  {voucherModal.filter === '' ? 'Semua' : voucherModal.filter === 'WAITING' ? 'Stok' : voucherModal.filter === 'SOLD' ? 'Terjual' : voucherModal.filter === 'ACTIVE' ? 'Aktif' : 'Expired'}: <strong>{voucherModal.vouchers.length}</strong> voucher
                </span>
                <span>Klik kode untuk copy</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
