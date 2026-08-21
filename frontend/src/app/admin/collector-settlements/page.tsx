'use client';

import { useState, useEffect, useCallback } from 'react';
import { Wallet, Activity, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { apiAdmin } from '@/lib/api';
import { showError, showSuccess } from '@/lib/sweetalert';

const fmtRp = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
const fmtTime = (d: string | null) => d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

interface SettlementCollector {
  collector_id: string;
  collector_name: string;
  collector_username: string;
  invoice_count: number;
  total_amount: number;
  cash_amount: number;
  transfer_amount: number;
  confirmed_by: string | null;
  confirmed_at: string | null;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    amount: number;
    paymentMethod: string | null;
    paidAt: string | null;
    customerName: string | null;
    customerUsername: string | null;
    has_proof: boolean;
  }>;
}

export default function AdminCollectorSettlementsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState<'daily' | 'range'>('daily');
  const [date, setDate] = useState(today);
  const [dateFrom, setDateFrom] = useState(today.slice(0, 7) + '-01');
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SettlementCollector[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmLoading, setConfirmLoading] = useState<string | null>(null);

  const fetchSettlements = useCallback(async (d: string) => {
    setLoading(true);
    setExpanded(null);
    try {
      const result = await apiAdmin<SettlementCollector[]>(`/api/collector/setoran?date=${d}`);
      setData(result || []);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettlements(date) }, []);

  const handleConfirm = async (collectorId: string, settlementDate: string) => {
    setConfirmLoading(collectorId);
    try {
      await apiAdmin('/api/collector/confirm-settlement', {
        method: 'POST',
        body: JSON.stringify({ collectorId, date: settlementDate }),
      });
      showSuccess('Setoran berhasil dikonfirmasi');
      setData(prev => prev.map(c => c.collector_id === collectorId ? { ...c, confirmed_by: 'Anda', confirmed_at: new Date().toISOString() } : c));
    } catch {
      showError('Gagal mengkonfirmasi setoran');
    } finally {
      setConfirmLoading(null);
    }
  };

  const handleUnconfirm = async (collectorId: string, settlementDate: string) => {
    setConfirmLoading(collectorId);
    try {
      await apiAdmin(`/api/collector/confirm-settlement?collectorId=${collectorId}&date=${settlementDate}`, {
        method: 'DELETE',
      });
      showSuccess('Konfirmasi setoran dibatalkan');
      setData(prev => prev.map(c => c.collector_id === collectorId ? { ...c, confirmed_by: null, confirmed_at: null } : c));
    } catch {
      showError('Gagal membatalkan konfirmasi');
    } finally {
      setConfirmLoading(null);
    }
  };

  const filtered = data.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (c.collector_name || '').toLowerCase().includes(q) ||
      (c.collector_username || '').toLowerCase().includes(q);
  });

  const pmBadge = (m: string | null) => {
    if (!m || m === 'cash') return <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Tunai</span>;
    if (m === 'transfer' || m === 'online') return <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Transfer</span>;
    if (m === 'discount') return <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Diskon</span>;
    return <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{m}</span>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Wallet className="w-5 h-5" /> Rekap Setoran Kolektor
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Verifikasi dan konfirmasi setoran kolektor per hari.</p>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2">
        {[{ key: 'daily', label: '📅 Harian' }, { key: 'range', label: '📆 Rentang' }].map(m => (
          <button
            key={m.key}
            onClick={() => setMode(m.key as 'daily' | 'range')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              mode === m.key ? 'bg-emerald-600 text-white' : 'border border-border bg-card text-muted-foreground hover:bg-muted'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'daily' ? (
        <>
          {/* Filter Bar */}
          <div className="card p-4 flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Tanggal</label>
              <input type="date" value={date}
                onChange={e => { setDate(e.target.value); fetchSettlements(e.target.value) }}
                className="px-3 py-1.5 rounded-lg border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Cari Kolektor</label>
              <input type="text" placeholder="Nama atau username..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-emerald-500 min-w-[180px]" />
            </div>
            <button onClick={() => fetchSettlements(date)}
              className="px-4 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-muted flex items-center gap-2">
              <Activity className="w-4 h-4" /> Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-8 text-center text-muted-foreground">
              <Wallet className="w-10 h-10 mx-auto mb-3 opacity-20" />
              Tidak ada setoran kolektor pada tanggal ini.
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(c => {
                const isConfirmed = !!c.confirmed_by;
                return (
                  <div key={c.collector_id} className="card overflow-hidden">
                    <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-foreground">{c.collector_name || c.collector_username}</span>
                          {isConfirmed ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">
                              ✓ Dikonfirmasi oleh {c.confirmed_by}
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">
                              ⏳ Belum Dikonfirmasi
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex gap-4 flex-wrap text-xs text-muted-foreground">
                          <span>📄 {c.invoice_count} transaksi</span>
                          <span className="font-bold text-foreground">{fmtRp(c.total_amount)}</span>
                          <span>💵 Cash: {fmtRp(c.cash_amount)}</span>
                          <span>🏦 Transfer: {fmtRp(c.transfer_amount)}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setExpanded(e => e === c.collector_id ? null : c.collector_id)}
                          className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-all"
                        >
                          {expanded === c.collector_id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          Detail
                        </button>
                        {!isConfirmed ? (
                          <button
                            onClick={() => handleConfirm(c.collector_id, date)}
                            disabled={confirmLoading === c.collector_id}
                            className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-all"
                          >
                            {confirmLoading === c.collector_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '✓ Konfirmasi'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUnconfirm(c.collector_id, date)}
                            disabled={confirmLoading === c.collector_id}
                            className="px-3 py-1.5 text-xs border border-red-500 text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-all"
                          >
                            Batal Konfirmasi
                          </button>
                        )}
                      </div>
                    </div>
                    {expanded === c.collector_id && (
                      <div className="border-t border-border overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/50">
                              <th className="text-left p-2 font-medium text-muted-foreground">Pelanggan</th>
                              <th className="text-left p-2 font-medium text-muted-foreground">Invoice</th>
                              <th className="text-right p-2 font-medium text-muted-foreground">Jumlah</th>
                              <th className="text-center p-2 font-medium text-muted-foreground">Metode</th>
                              <th className="text-right p-2 font-medium text-muted-foreground">Waktu</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.invoices.map(inv => (
                              <tr key={inv.id} className="border-b border-border last:border-0">
                                <td className="p-2">
                                  <div className="font-medium text-foreground">{inv.customerName || inv.customerUsername}</div>
                                  <div className="text-xs text-muted-foreground">{inv.customerUsername}</div>
                                </td>
                                <td className="p-2 text-xs text-muted-foreground">{inv.invoiceNumber}</td>
                                <td className="p-2 text-right font-semibold text-foreground">{fmtRp(inv.amount)}</td>
                                <td className="p-2 text-center">{pmBadge(inv.paymentMethod)}</td>
                                <td className="p-2 text-right text-xs text-muted-foreground">{fmtTime(inv.paidAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="card p-8 text-center text-muted-foreground">
          Mode rentang tanggal akan segera hadir.
        </div>
      )}
    </div>
  );
}
