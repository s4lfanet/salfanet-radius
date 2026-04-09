'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Download, RefreshCw, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
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
  stock: number; // WAITING
  sold: number;  // ACTIVE + EXPIRED
  sellingPrice: number;
  totalRevenue: number;
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
                  <div className="font-medium text-primary">{item.totalQty}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground">{t('hotspot.stock')}</div>
                  <div className="font-medium text-success">{item.stock}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground">{t('hotspot.sold')}</div>
                  <div className="font-medium text-orange-600">{item.sold}</div>
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
                <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase">Harga/pcs</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase">Pendapatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground text-xs">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : filteredRekap.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground text-xs">
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
                    <td className="px-3 py-2 text-[10px] text-right font-medium text-primary">
                      {item.totalQty}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-right font-medium text-success">
                      {item.stock}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-right font-medium text-orange-600">
                      {item.sold}
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
              <li><strong>{t('hotspot.sold')}:</strong> {t('hotspot.soldDesc')}</li>
            </ul>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
