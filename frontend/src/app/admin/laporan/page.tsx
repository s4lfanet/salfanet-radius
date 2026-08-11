'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, Download, FileText, Users, CreditCard, Filter, RefreshCw, FileSpreadsheet, BarChart3, TrendingUp, Calendar, Activity } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB, todayWIBStr, firstOfMonthWIBStr } from '@/lib/timezone';

// ── Types ────────────────────────────────────────────────────────────────────
type ReportType = 'invoice' | 'payment' | 'customer';

interface Summary {
  total: number;
  paid?: number;
  pending?: number;
  overdue?: number;
  active?: number;
  isolated?: number;
  stopped?: number;
  expired?: number;
  totalAmount?: number;
  paidAmount?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatRupiah(n: number): string {
  return `Rp ${n.toLocaleString('id-ID')}`;
}

function todayStr(): string {
  return todayWIBStr();
}

function firstOfMonthStr(): string {
  return firstOfMonthWIBStr();
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function LaporanPage() {
  const { t } = useTranslation();

  const TYPE_LABELS: Record<ReportType, string> = {
    invoice: t('laporan.typeInvoice'),
    payment: t('laporan.typePayment'),
    customer: t('laporan.typeCustomer'),
  };

  const INVOICE_STATUSES = [
    { value: 'all', label: t('laporan.statusAll') },
    { value: 'PAID', label: t('laporan.statusPaid') },
    { value: 'PENDING', label: t('laporan.statusPending') },
    { value: 'OVERDUE', label: t('laporan.statusOverdue') },
    { value: 'CANCELLED', label: t('laporan.statusCancelled') },
  ];

  const CUSTOMER_STATUSES = [
    { value: 'all', label: t('laporan.statusAll') },
    { value: 'active', label: t('laporan.statusActive') },
    { value: 'isolated', label: t('laporan.statusIsolated') },
    { value: 'stopped', label: t('laporan.statusStopped') },
    { value: 'expired', label: t('laporan.statusExpired') },
  ];

  const [reportType, setReportType] = useState<ReportType>('invoice');
  const [dateFrom, setDateFrom] = useState(firstOfMonthStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  // ── Fetch data from API ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    setRows([]);
    setSummary(null);
    setLoaded(false);

    try {
      const params = new URLSearchParams({
        type: reportType,
        dateFrom,
        dateTo,
        status,
      });
      const res = await fetch(`/api/admin/laporan?${params}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Gagal mengambil data laporan');

      setRows(data.rows || []);
      setSummary(data.summary || null);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [reportType, dateFrom, dateTo, status]);

  // ── Export Excel ─────────────────────────────────────────────────────────
  const exportExcel = async () => {
    if (!rows.length) return;
    setExporting('excel');
    try {
      const XLSX = (await import('xlsx')).default;
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, TYPE_LABELS[reportType]);

      // Auto column width
      const colWidths = Object.keys(rows[0]).map(k => ({
        wch: Math.max(k.length, ...rows.map(r => String(r[k] || '').length)) + 2,
      }));
      ws['!cols'] = colWidths;

      const filename = `Laporan_${TYPE_LABELS[reportType]}_${dateFrom}_${dateTo}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err: any) {
      alert('Gagal export Excel: ' + err.message);
    } finally {
      setExporting(null);
    }
  };

  // ── Export PDF ───────────────────────────────────────────────────────────
  const exportPdf = async () => {
    if (!rows.length) return;
    setExporting('pdf');
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      // Header
      doc.setFontSize(16);
      doc.setTextColor(30, 30, 30);
      doc.text(`Laporan ${TYPE_LABELS[reportType]}`, 15, 18);

      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.text(`Periode: ${dateFrom} s/d ${dateTo}`, 15, 26);
      doc.text(`Dicetak: ${formatWIB(new Date())}`, 15, 32);
      doc.text(`Total data: ${rows.length} baris`, 15, 38);

      // Summary
      if (summary) {
        const summaryText = Object.entries(summary)
          .map(([k, v]) => `${k}: ${typeof v === 'number' && k.toLowerCase().includes('amount') ? formatRupiah(v) : v}`)
          .join('   |   ');
        doc.text(summaryText, 15, 44, { maxWidth: 250 });
      }

      // Exclude raw amount column (keep formatted version)
      const headers = Object.keys(rows[0]).filter(k => k !== 'Jumlah' && k !== 'Harga');
      const tableData = rows.map(row => headers.map(h => String(row[h] ?? '-')));

      autoTable(doc, {
        head: [headers],
        body: tableData,
        startY: 52,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 30, 50], textColor: [200, 200, 255] },
        alternateRowStyles: { fillColor: [245, 245, 255] },
        margin: { left: 15, right: 15 },
      });

      const filename = `Laporan_${TYPE_LABELS[reportType]}_${dateFrom}_${dateTo}.pdf`;
      doc.save(filename);
    } catch (err: any) {
      alert('Gagal export PDF: ' + err.message);
    } finally {
      setExporting(null);
    }
  };

  // ── Column keys to display in preview table ──────────────────────────────
  const previewColumns = rows.length
    ? Object.keys(rows[0]).filter(k => k !== 'Jumlah' && k !== 'Harga')
    : [];

  const statusOptions = reportType === 'customer' ? CUSTOMER_STATUSES : INVOICE_STATUSES;

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-[#00f7ff] drop-shadow-[0_0_10px_rgba(0,247,255,0.7)]" />
            {t('laporan.title')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('laporan.subtitle')}</p>
        </div>
        <Link
          href="/admin/laporan/analitik"
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#00f7ff]/40 text-[#00f7ff] text-sm font-semibold hover:bg-[#00f7ff]/10 transition-all"
        >
          <Activity className="w-4 h-4" />
          {t('laporan.advancedAnalytics')}
        </Link>
      </div>

      {/* ── Filter Card ── */}
      <div className="bg-card/80 dark:bg-slate-800/60 backdrop-blur border border-[#bc13fe]/30 rounded-2xl p-6 shadow-[0_0_30px_rgba(188,19,254,0.1)]">
        <div className="flex items-center gap-2 mb-5">
          <Filter className="w-4 h-4 text-[#bc13fe]" />
          <span className="text-sm font-semibold text-foreground dark:text-slate-300 uppercase tracking-wider">{t('laporan.filterTitle')}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Report Type */}
          <div>
            <label className="block text-xs font-bold text-[#00f7ff] mb-2 uppercase tracking-wider">{t('laporan.reportType')}</label>
            <div className="flex gap-2 flex-wrap">
              {(['invoice', 'payment', 'customer'] as ReportType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setReportType(t); setStatus('all'); setLoaded(false); }}
                  className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                    reportType === t
                      ? 'bg-[#bc13fe] border-[#bc13fe] text-white shadow-[0_0_15px_rgba(188,19,254,0.5)]'
                      : 'bg-muted/80 dark:bg-slate-900/80 border-border dark:border-slate-600 text-muted-foreground dark:text-slate-400 hover:border-[#bc13fe]/50'
                  }`}
                >
                  {t === 'invoice' && <FileText className="w-3.5 h-3.5 inline mr-1" />}
                  {t === 'payment' && <CreditCard className="w-3.5 h-3.5 inline mr-1" />}
                  {t === 'customer' && <Users className="w-3.5 h-3.5 inline mr-1" />}
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-xs font-bold text-[#00f7ff] mb-2 uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5 inline mr-1" />{t('laporan.dateFrom')}
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2.5 bg-input border border-border text-foreground rounded-lg text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-xs font-bold text-[#00f7ff] mb-2 uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5 inline mr-1" />{t('laporan.dateTo')}
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2.5 bg-input border border-border text-foreground rounded-lg text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
            />
          </div>

          {/* Status filter (invoice & customer only) */}
          {reportType !== 'payment' && (
            <div>
              <label className="block text-xs font-bold text-[#00f7ff] mb-2 uppercase tracking-wider">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2.5 bg-input border border-border text-foreground rounded-lg text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
              >
                {statusOptions.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#bc13fe] to-[#9b10d4] text-white text-sm font-bold rounded-xl hover:shadow-[0_0_20px_rgba(188,19,254,0.5)] disabled:opacity-50 transition-all"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" />{t('laporan.loading')}</>
              : <><RefreshCw className="w-4 h-4" />{t('laporan.showData')}</>
            }
          </button>

          {loaded && rows.length > 0 && (
            <>
              <button
                onClick={exportExcel}
                disabled={exporting !== null}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white text-sm font-bold rounded-xl hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] disabled:opacity-50 transition-all"
              >
                {exporting === 'excel'
                  ? <><Loader2 className="w-4 h-4 animate-spin" />{t('laporan.exporting')}</>
                  : <><FileSpreadsheet className="w-4 h-4" />{t('laporan.exportExcel')}</>
                }
              </button>

              <button
                onClick={exportPdf}
                disabled={exporting !== null}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-rose-600 to-rose-700 text-white text-sm font-bold rounded-xl hover:shadow-[0_0_20px_rgba(225,29,72,0.4)] disabled:opacity-50 transition-all"
              >
                {exporting === 'pdf'
                  ? <><Loader2 className="w-4 h-4 animate-spin" />{t('laporan.exporting')}</>
                  : <><Download className="w-4 h-4" />{t('laporan.exportPdf')}</>
                }
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/40 rounded-xl text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ── Summary Cards ── */}
      {loaded && summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {reportType === 'invoice' && (
            <>
              <SummaryCard label={t('laporan.totalInvoice')} value={summary.total} icon={<FileText className="w-5 h-5" />} color="cyan" />
              <SummaryCard label={t('laporan.paid')} value={summary.paid ?? 0} icon={<TrendingUp className="w-5 h-5" />} color="green" />
              <SummaryCard label={t('laporan.unpaid')} value={summary.pending ?? 0} icon={<FileText className="w-5 h-5" />} color="yellow" />
              <SummaryCard label={t('laporan.totalBill')} value={formatRupiah(summary.totalAmount ?? 0)} icon={<CreditCard className="w-5 h-5" />} color="purple" />
            </>
          )}
          {reportType === 'payment' && (
            <>
              <SummaryCard label={t('laporan.totalTransaction')} value={summary.total} icon={<CreditCard className="w-5 h-5" />} color="cyan" />
              <SummaryCard label={t('laporan.totalReceived')} value={formatRupiah(summary.totalAmount ?? 0)} icon={<TrendingUp className="w-5 h-5" />} color="green" />
            </>
          )}
          {reportType === 'customer' && (
            <>
              <SummaryCard label={t('laporan.totalCustomer')} value={summary.total} icon={<Users className="w-5 h-5" />} color="cyan" />
              <SummaryCard label={t('laporan.active')} value={summary.active ?? 0} icon={<TrendingUp className="w-5 h-5" />} color="green" />
              <SummaryCard label={t('laporan.isolated')} value={summary.isolated ?? 0} icon={<Users className="w-5 h-5" />} color="yellow" />
              <SummaryCard label={t('laporan.stoppedExpired')} value={(summary.stopped ?? 0) + (summary.expired ?? 0)} icon={<Users className="w-5 h-5" />} color="red" />
            </>
          )}
        </div>
      )}

      {/* ── Data Preview Table ── */}
      {loaded && rows.length > 0 && (
        <div className="bg-card/80 dark:bg-slate-800/60 backdrop-blur border border-border/50 dark:border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50 dark:border-slate-700/50 flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground dark:text-slate-300">
              {t('laporan.previewData', { count: String(Math.min(rows.length, 100)), total: String(rows.length) })}
            </span>
            <span className="text-xs text-slate-500">{t('laporan.exportHint')}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 dark:bg-slate-900/60">
                  {previewColumns.map((col) => (
                    <th key={col} className="px-4 py-3 text-left text-xs font-bold text-[#00f7ff] uppercase tracking-wider whitespace-nowrap border-b border-slate-700/50">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((row, i) => (
                  <tr key={i} className={`border-b border-border/30 dark:border-slate-700/30 hover:bg-muted/30 dark:hover:bg-slate-700/30 transition-colors ${i % 2 === 0 ? 'bg-transparent' : 'bg-muted/20 dark:bg-slate-900/20'}`}>
                    {previewColumns.map((col) => (
                      <td key={col} className={`px-4 py-2.5 text-foreground dark:text-slate-300 ${
                        col === 'Catatan' ? 'max-w-[200px] truncate' : 'whitespace-nowrap'
                      } ${col === 'Status' ? getStatusClass(String(row[col])) : ''}`}
                        title={col === 'Catatan' ? String(row[col] ?? '') : undefined}
                      >
                        {col === 'Status'
                          ? <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getStatusBadge(String(row[col]))}`}>{row[col]}</span>
                          : String(row[col] ?? '-')
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {loaded && rows.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t('laporan.noData')}</p>
        </div>
      )}

      {/* ── Initial state ── */}
      {!loaded && !loading && (
        <div className="text-center py-16 text-slate-500">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Pilih filter dan klik <strong className="text-slate-400">{t('laporan.showData')}</strong></p>
        </div>
      )}
    </div>
  );
}

// ── Summary Card Component ───────────────────────────────────────────────────
function SummaryCard({ label, value, icon, color }: { label: string; value: any; icon: React.ReactNode; color: string }) {
  const colorMap: Record<string, string> = {
    cyan:   'text-[#00f7ff] border-[#00f7ff]/30 shadow-[0_0_15px_rgba(0,247,255,0.1)]',
    green:  'text-emerald-400 border-emerald-500/30',
    yellow: 'text-amber-400 border-amber-500/30',
    purple: 'text-[#bc13fe] border-[#bc13fe]/30',
    red:    'text-rose-400 border-rose-500/30',
  };
  return (
    <div className={`bg-card/80 dark:bg-slate-800/60 backdrop-blur border rounded-xl p-4 ${colorMap[color] || colorMap.cyan}`}>
      <div className={`flex items-center gap-2 mb-2 ${colorMap[color]?.split(' ')[0]}`}>
        {icon}
        <span className="text-xs font-bold uppercase tracking-wider opacity-80">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}

// ── Status helpers ────────────────────────────────────────────────────────────
function getStatusClass(s: string): string { return ''; }
function getStatusBadge(s: string): string {
  const map: Record<string, string> = {
    PAID:    'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    paid:    'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    PENDING: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    pending: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    OVERDUE: 'bg-red-500/20 text-red-400 border border-red-500/30',
    overdue: 'bg-red-500/20 text-red-400 border border-red-500/30',
    CANCELLED: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
    active:  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    isolated: 'bg-red-500/20 text-red-400 border border-red-500/30',
    stopped: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
    expired: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    SUCCESS: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    FAILED:  'bg-red-500/20 text-red-400 border border-red-500/30',
  };
  return map[s] || 'bg-muted/30 dark:bg-slate-600/30 text-muted-foreground dark:text-slate-300 border border-border/30 dark:border-slate-500/30';
}
