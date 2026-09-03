'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiAdmin } from '@/lib/api/client';
import { Wallet, Activity, ChevronDown, ChevronUp } from 'lucide-react';

const fmtRp = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
const fmtTime = (d: string) => d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : '—';

export default function CollectorSettlementsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState<'daily' | 'range'>('daily');
  const [date, setDate] = useState(today);
  const [dateFrom, setDateFrom] = useState(today.slice(0, 7) + '-01');
  const [dateTo, setDateTo] = useState(today);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeData, setRangeData] = useState<any>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, any>>({});

  const fetchDaily = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await apiAdmin<any>(`/api/collector/my-settlements?date=${d}`);
      setData(res);
    } catch {}
    finally { setLoading(false); }
  }, []);

  const fetchRange = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setRangeLoading(true);
    try {
      const res = await apiAdmin<any>(`/api/collector/my-settlements/range?date_from=${dateFrom}&date_to=${dateTo}`);
      setRangeData(res);
    } catch {}
    finally { setRangeLoading(false); }
  }, [dateFrom, dateTo]);

  const fetchDetailForDate = async (d: string) => {
    if (detailCache[d]) {
      setExpandedRow(r => r === d ? null : d);
      return;
    }
    try {
      const res = await apiAdmin<any>(`/api/collector/my-settlements?date=${d}`);
      setDetailCache(c => ({ ...c, [d]: res }));
      setExpandedRow(r => r === d ? null : d);
    } catch {}
  };

  useEffect(() => { fetchDaily(date) }, []);
  useEffect(() => { if (mode === 'range') fetchRange() }, [mode]);

  const pmMethod = (m: string) => {
    if (!m || m === 'cash') return <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600">Tunai</span>;
    if (m === 'transfer' || m === 'online') return <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-600">Transfer</span>;
    if (m === 'discount') return <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-600">Diskon</span>;
    return <span className="text-xs px-2 py-0.5 rounded bg-accent text-muted-foreground">{m}</span>;
  };

  const confirmBadge = (confirmed_by: string, confirmed_at: string) => {
    if (confirmed_by) return (
      <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">
        Dikonfirmasi {confirmed_at ? new Date(confirmed_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : ''}
      </span>
    );
    return <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-600">Belum dikonfirmasi</span>;
  };

  const renderSummaryCards = (summary: any) => {
    const items = [
      { label: 'Tagihan', value: summary?.invoice_count || 0, raw: true, color: 'text-blue-600' },
      { label: 'Total Setoran', value: fmtRp(summary?.total_amount), color: 'text-emerald-600' },
      { label: 'Tunai', value: fmtRp(summary?.cash_amount), color: 'text-cyan-600' },
      { label: 'Transfer', value: fmtRp(summary?.transfer_amount), color: 'text-purple-600' },
      { label: 'Diskon', value: fmtRp(summary?.discount_amount), color: 'text-amber-600' },
    ];
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {items.map(it => (
          <div key={it.label} className="bg-card border border-border rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">{it.label}</div>
            <div className={`font-bold ${it.raw ? 'text-xl' : 'text-sm'} ${it.color}`}>{it.value}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderInvoices = (invoices: any[] = []) => {
    if (!invoices.length) return <div className="bg-card border border-border rounded-lg p-4 text-center text-muted-foreground text-sm">Belum ada pembayaran.</div>;
    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-accent/30">
              <th className="text-left p-2 font-medium text-muted-foreground">Pelanggan</th>
              <th className="text-left p-2 font-medium text-muted-foreground">Kontak</th>
              <th className="text-left p-2 font-medium text-muted-foreground">Alamat</th>
              <th className="text-left p-2 font-medium text-muted-foreground">Paket</th>
              <th className="text-left p-2 font-medium text-muted-foreground">Area</th>
              <th className="text-right p-2 font-medium text-muted-foreground">Jumlah</th>
              <th className="text-center p-2 font-medium text-muted-foreground">Metode</th>
              <th className="text-right p-2 font-medium text-muted-foreground">Waktu</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv, i) => (
              <tr key={inv.id} className={`border-b border-border ${i % 2 === 0 ? '' : 'bg-accent/20'}`}>
                <td className="p-2">
                  <div className="font-medium text-foreground">{inv.customerName || inv.customerUsername || '—'}</div>
                  <div className="text-xs text-muted-foreground font-mono">{inv.customerId || inv.customerUsername || '—'}</div>
                </td>
                <td className="p-2 text-xs text-muted-foreground">{inv.phone || '—'}</td>
                <td className="p-2 text-xs text-muted-foreground max-w-[180px] truncate" title={inv.address}>{inv.address || '—'}</td>
                <td className="p-2 text-xs text-muted-foreground">{inv.profileName || '—'}</td>
                <td className="p-2 text-xs text-muted-foreground">{inv.areaName || '—'}</td>
                <td className="p-2 text-right font-medium text-foreground">{fmtRp(inv.amount)}</td>
                <td className="p-2 text-center">{pmMethod(inv.paymentMethod)}</td>
                <td className="p-2 text-right text-xs text-muted-foreground">{fmtTime(inv.paidAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">Rekap Setoran Saya</h2>
        <p className="text-sm text-muted-foreground mt-1">Riwayat tagihan yang kamu lunaskan</p>
      </div>

      <div className="flex gap-2 mb-4">
        {[{ key: 'daily', label: 'Harian' }, { key: 'range', label: 'Rentang' }].map(m => (
          <button
            key={m.key}
            onClick={() => setMode(m.key as 'daily' | 'range')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              mode === m.key ? 'bg-emerald-600 text-white' : 'bg-card border border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'daily' ? (
        <div>
          <div className="bg-card border border-border rounded-lg p-3 mb-4 flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Tanggal</label>
              <input type="date" value={date} onChange={e => { setDate(e.target.value); fetchDaily(e.target.value) }}
                className="px-3 py-1.5 rounded-lg border border-border bg-card text-foreground text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <button onClick={() => fetchDaily(date)} className="px-4 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-accent flex items-center gap-2">
              <Activity className="w-4 h-4" /> Refresh
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Memuat...</div>
          ) : data ? (
            <>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="text-sm text-muted-foreground">{fmtDate(data.date)}</div>
                {confirmBadge(data.confirmation?.confirmed_by, data.confirmation?.confirmed_at)}
              </div>
              {renderSummaryCards(data.summary)}
              {renderInvoices(data.invoices)}
            </>
          ) : null}
        </div>
      ) : (
        <div>
          <div className="bg-card border border-border rounded-lg p-3 mb-4 flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Dari</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-border bg-card text-foreground text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Sampai</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-border bg-card text-foreground text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <button onClick={fetchRange} className="px-4 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-accent flex items-center gap-2">
              <Activity className="w-4 h-4" /> Tampilkan
            </button>
          </div>

          {rangeLoading ? (
            <div className="text-center py-8 text-muted-foreground">Memuat...</div>
          ) : rangeData ? (
            rangeData.rows.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">Tidak ada data.</div>
            ) : (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-accent/30">
                      <th className="text-left p-2 font-medium text-muted-foreground">Tanggal</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">Tagihan</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">Total</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">Tunai</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">Transfer</th>
                      <th className="text-center p-2 font-medium text-muted-foreground">Status</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rangeData.rows.map((row: any, i: number) => (
                      <>
                        <tr key={row.date}
                          className={`border-b border-border cursor-pointer hover:bg-accent/30 ${i % 2 === 0 ? '' : 'bg-accent/10'}`}
                          onClick={() => fetchDetailForDate(row.date)}>
                          <td className="p-2 font-medium text-foreground">
                            {new Date(row.date).toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="p-2 text-right">{row.invoice_count}</td>
                          <td className="p-2 text-right font-medium">{fmtRp(row.total_amount)}</td>
                          <td className="p-2 text-right text-cyan-600">{fmtRp(row.cash_amount)}</td>
                          <td className="p-2 text-right text-purple-600">{fmtRp(row.transfer_amount)}</td>
                          <td className="p-2 text-center">{confirmBadge(row.confirmed_by, row.confirmed_at)}</td>
                          <td className="p-2 text-center">
                            {expandedRow === row.date ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </td>
                        </tr>
                        {expandedRow === row.date && detailCache[row.date] && (
                          <tr key={`${row.date}-detail`}>
                            <td colSpan={7} className="p-3 bg-accent/20">
                              {renderInvoices(detailCache[row.date].invoices)}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}
