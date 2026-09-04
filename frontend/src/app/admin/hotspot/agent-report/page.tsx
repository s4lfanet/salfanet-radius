'use client';

import { useState, Fragment } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, Users, Ticket, Wallet, TrendingUp, Package, Phone, Router } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB, nowWIB, todayWIBStr } from '@/lib/timezone';
import { formatCurrency } from '@/lib/utils';
import { useApiQuery } from '@/lib/api/hooks';

interface ProfileBreakdown {
  profileName: string;
  generated: number;
  waiting: number;
  active: number;
  expired: number;
  sold: number;
  sellingPrice: number;
  costPrice: number;
  resellerFee: number;
  revenue: number;
  commission: number;
}

interface AgentReportItem {
  agentId: string;
  agentName: string;
  agentPhone: string;
  isActive: boolean;
  balance: number;
  router: { id: string; name: string } | null;
  totalGenerated: number;
  waiting: number;
  active: number;
  expired: number;
  sold: number;
  totalRevenue: number;
  totalCommission: number;
  adminEarnings: number;
  salesCount: number;
  totalSalesAmount: number;
  paidCount: number;
  paidAmount: number;
  unpaidCount: number;
  unpaidAmount: number;
  currentStock: number;
  stockValue: number;
  profileBreakdown: ProfileBreakdown[];
}

interface AgentReportResponse {
  type: string;
  periodLabel: string;
  dateStart: string;
  dateEnd: string;
  report: AgentReportItem[];
  summary: {
    totalAgents: number;
    totalGenerated: number;
    totalSold: number;
    totalRevenue: number;
    totalCommission: number;
    totalAdminEarnings: number;
    totalStock: number;
    totalStockValue: number;
    totalSalesAmount: number;
    totalPaidAmount: number;
    totalUnpaidAmount: number;
  };
  agents: { id: string; name: string }[];
}

const MONTH_NAMES_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export default function AgentReportPage() {
  const { t } = useTranslation();
  const [reportType, setReportType] = useState<'daily' | 'monthly'>('daily');
  const [dateValue, setDateValue] = useState<string>(() => todayWIBStr());
  const [monthValue, setMonthValue] = useState<string>(() => formatWIB(nowWIB(), 'yyyy-MM'));
  const [filterAgent, setFilterAgent] = useState<string>('');
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const shiftDate = (delta: number) => {
    const d = new Date(dateValue + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setDateValue(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };

  const shiftMonth = (delta: number) => {
    const [y, m] = monthValue.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonthValue(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const getPeriodLabel = () => {
    if (reportType === 'daily' && dateValue) {
      const [y, m, day] = dateValue.split('-').map(Number);
      const d = new Date(y, m - 1, day);
      return `${DAY_NAMES_ID[d.getDay()]}, ${day} ${MONTH_NAMES_ID[m - 1].slice(0, 3)} ${y}`;
    }
    if (reportType === 'monthly' && monthValue) {
      const [y, m] = monthValue.split('-').map(Number);
      return `${MONTH_NAMES_ID[m - 1]} ${y}`;
    }
    return '';
  };

  const queryParams: Record<string, string> = {
    type: reportType,
    ...(reportType === 'daily' ? { date: dateValue } : { month: monthValue }),
    ...(filterAgent && filterAgent !== 'all' ? { agentId: filterAgent } : {}),
  };

  const { data: reportData, isLoading, refetch } = useApiQuery<AgentReportResponse>(
    '/api/hotspot/agent-report',
    { params: queryParams, staleTime: 30000 }
  );

  const report = reportData?.report || [];
  const summary = reportData?.summary;
  const agents = reportData?.agents || [];
  const periodLabel = reportData?.periodLabel || getPeriodLabel();

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl"></div>
        <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-brand-500 dark:via-white dark:to-pink-500 dark:drop-shadow-[0_0_30px_rgba(6,182,212,0.5)] flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-500" />
              Laporan Reseller/Agent
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Laporan harian & bulanan penjualan voucher per reseller
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-card border-2 border-primary/30 rounded-lg hover:bg-primary/10 hover:border-primary/50 transition-all"
            title="Perbarui Data"
          >
            <RefreshCw className="w-3.5 h-3.5 text-primary" />
          </button>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-lg border border-border p-4 space-y-3">
          {/* Report Type Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">Jenis Laporan:</span>
            <div className="flex gap-1">
              {(['daily', 'monthly'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setReportType(mode)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors font-medium ${
                    reportType === mode
                      ? 'bg-primary text-white shadow-[0_0_8px_rgba(139,92,246,0.4)]'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {mode === 'daily' ? 'Harian' : 'Bulanan'}
                </button>
              ))}
            </div>
          </div>

          {/* Period Navigator + Agent Filter */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 border border-border rounded-lg bg-muted/30 px-1 py-1">
              <button
                onClick={() => reportType === 'daily' ? shiftDate(-1) : shiftMonth(-1)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-medium text-foreground min-w-[145px] text-center">
                {getPeriodLabel()}
              </span>
              <button
                onClick={() => reportType === 'daily' ? shiftDate(1) : shiftMonth(1)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Agent:</span>
              <select
                value={filterAgent}
                onChange={(e) => setFilterAgent(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-border rounded-md bg-card"
              >
                <option value="">Semua Agent</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-card p-3 rounded-lg border-2 border-primary/30 shadow-[0_0_15px_rgba(139,92,246,0.1)]">
              <div className="text-[10px] text-primary font-bold uppercase mb-1 flex items-center gap-1">
                <Users className="w-3 h-3" /> Agent
              </div>
              <div className="text-lg font-bold text-primary">{summary.totalAgents}</div>
            </div>
            <div className="bg-card p-3 rounded-lg border-2 border-success/30 shadow-[0_0_15px_rgba(0,255,136,0.1)]">
              <div className="text-[10px] text-success font-bold uppercase mb-1 flex items-center gap-1">
                <Package className="w-3 h-3" /> Stok
              </div>
              <div className="text-lg font-bold text-success">{summary.totalStock.toLocaleString()}</div>
            </div>
            <div className="bg-card p-3 rounded-lg border-2 border-warning/30 shadow-[0_0_15px_rgba(255,170,0,0.1)]">
              <div className="text-[10px] text-warning font-bold uppercase mb-1 flex items-center gap-1">
                <Ticket className="w-3 h-3" /> Terjual
              </div>
              <div className="text-lg font-bold text-warning">{summary.totalSold.toLocaleString()}</div>
            </div>
            <div className="bg-card p-3 rounded-lg border-2 border-brand-500/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
              <div className="text-[10px] text-brand-500 font-bold uppercase mb-1 flex items-center gap-1">
                <Wallet className="w-3 h-3" /> Pendapatan
              </div>
              <div className="text-sm font-bold text-brand-500">{formatCurrency(summary.totalRevenue)}</div>
            </div>
            <div className="bg-card p-3 rounded-lg border-2 border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.1)]">
              <div className="text-[10px] text-violet-500 font-bold uppercase mb-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Komisi
              </div>
              <div className="text-sm font-bold text-violet-500">{formatCurrency(summary.totalCommission)}</div>
            </div>
            <div className="bg-card p-3 rounded-lg border-2 border-emerald/30 shadow-[0_0_15px_rgba(0,200,100,0.1)]">
              <div className="text-[10px] text-emerald-500 font-bold uppercase mb-1">Admin Earn</div>
              <div className="text-sm font-bold text-emerald-500">{formatCurrency(summary.totalAdminEarnings)}</div>
            </div>
          </div>
        )}

        {/* Agent Report Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-bold text-foreground">
              Detail per Agent — {periodLabel}
            </h2>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
              Memuat data...
            </div>
          ) : report.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Tidak ada data untuk periode ini
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 border-b border-border">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Agent</th>
                    <th className="px-3 py-2 font-medium text-center">Generate</th>
                    <th className="px-3 py-2 font-medium text-center">Stok</th>
                    <th className="px-3 py-2 font-medium text-center">Terjual</th>
                    <th className="px-3 py-2 font-medium text-right">Pendapatan</th>
                    <th className="px-3 py-2 font-medium text-right">Komisi</th>
                    <th className="px-3 py-2 font-medium text-right">Admin Earn</th>
                    <th className="px-3 py-2 font-medium text-center">Saldo</th>
                    <th className="px-3 py-2 font-medium text-center">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.map((item) => (
                    <Fragment key={item.agentId}>
                      <tr
                        className={`hover:bg-muted/30 transition-colors ${!item.isActive ? 'opacity-50' : ''}`}
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{item.agentName}</div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Phone className="w-2.5 h-2.5" /> {item.agentPhone}
                            {item.router && (
                              <span className="flex items-center gap-0.5 ml-1">
                                <Router className="w-2.5 h-2.5" /> {item.router.name}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center text-foreground">{item.totalGenerated}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="text-success font-medium">{item.currentStock}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="text-warning font-medium">{item.sold}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-brand-500 font-medium">{formatCurrency(item.totalRevenue)}</td>
                        <td className="px-3 py-2 text-right text-violet-500 font-medium">{formatCurrency(item.totalCommission)}</td>
                        <td className="px-3 py-2 text-right text-emerald-500 font-medium">{formatCurrency(item.adminEarnings)}</td>
                        <td className="px-3 py-2 text-center text-foreground">{formatCurrency(item.balance)}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => setExpandedAgent(expandedAgent === item.agentId ? null : item.agentId)}
                            className="px-2 py-0.5 text-[10px] bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors"
                          >
                            {expandedAgent === item.agentId ? 'Tutup' : 'Lihat'}
                          </button>
                        </td>
                      </tr>
                      {expandedAgent === item.agentId && (
                        <tr key={item.agentId + '-detail'} className="bg-muted/20">
                          <td colSpan={9} className="px-4 py-3">
                            <div className="space-y-3">
                              {/* Sales transaction summary */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                                <div className="bg-card rounded p-2 border border-border">
                                  <div className="text-muted-foreground">Transaksi Penjualan</div>
                                  <div className="font-bold text-foreground">{item.salesCount}x</div>
                                </div>
                                <div className="bg-card rounded p-2 border border-border">
                                  <div className="text-muted-foreground">Total Penjualan</div>
                                  <div className="font-bold text-foreground">{formatCurrency(item.totalSalesAmount)}</div>
                                </div>
                                <div className="bg-card rounded p-2 border border-success/30">
                                  <div className="text-success">Lunas</div>
                                  <div className="font-bold text-success">{item.paidCount}x / {formatCurrency(item.paidAmount)}</div>
                                </div>
                                <div className="bg-card rounded p-2 border border-warning/30">
                                  <div className="text-warning">Belum Lunas</div>
                                  <div className="font-bold text-warning">{item.unpaidCount}x / {formatCurrency(item.unpaidAmount)}</div>
                                </div>
                              </div>

                              {/* Profile breakdown */}
                              {item.profileBreakdown.length > 0 && (
                                <div>
                                  <div className="text-[11px] font-bold text-muted-foreground mb-1">Rincian per Paket:</div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-[11px] border border-border rounded">
                                      <thead className="bg-muted/50">
                                        <tr className="text-left text-muted-foreground">
                                          <th className="px-2 py-1 font-medium">Paket</th>
                                          <th className="px-2 py-1 font-medium text-center">Generate</th>
                                          <th className="px-2 py-1 font-medium text-center">Stok</th>
                                          <th className="px-2 py-1 font-medium text-center">Terjual</th>
                                          <th className="px-2 py-1 font-medium text-right">Harga Jual</th>
                                          <th className="px-2 py-1 font-medium text-right">Komisi</th>
                                          <th className="px-2 py-1 font-medium text-right">Pendapatan</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-border">
                                        {item.profileBreakdown.map((pb, idx) => (
                                          <tr key={idx}>
                                            <td className="px-2 py-1 text-foreground font-medium">{pb.profileName}</td>
                                            <td className="px-2 py-1 text-center">{pb.generated}</td>
                                            <td className="px-2 py-1 text-center text-success">{pb.waiting}</td>
                                            <td className="px-2 py-1 text-center text-warning">{pb.sold}</td>
                                            <td className="px-2 py-1 text-right">{formatCurrency(pb.sellingPrice)}</td>
                                            <td className="px-2 py-1 text-right text-violet-500">{formatCurrency(pb.commission)}</td>
                                            <td className="px-2 py-1 text-right text-brand-500">{formatCurrency(pb.revenue)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Stock value */}
                              <div className="text-[11px] text-muted-foreground">
                                Nilai stok saat ini: <span className="font-bold text-success">{formatCurrency(item.stockValue)}</span>
                                {' '}({item.currentStock} voucher WAITING)
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
