'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { Loader2, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, Search, Wallet, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiAdmin } from '@/lib/api';
import { showError, showSuccess } from '@/lib/sweetalert';
import { formatWIB, todayWIBStr } from '@/lib/timezone';
import { cn } from '@/lib/utils';

const fmtRp = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
const fmtTime = (d: string | null) => (d ? formatWIB(d, 'dd MMM, HH:mm') : '-');
const fmtDay = (d: string) => formatWIB(`${d}T12:00:00`, 'EEE, dd MMM yyyy');

interface SettlementInvoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  paymentMethod: string | null;
  paidAt: string | null;
  customerName: string | null;
  customerUsername: string | null;
  has_proof: boolean;
}

interface SettlementDay {
  date: string;
  invoice_count: number;
  total_amount: number;
  cash_amount: number;
  transfer_amount: number;
  confirmed_by: string | null;
  confirmed_at: string | null;
}

interface SettlementCollector {
  collector_id: string;
  collector_name: string;
  collector_username: string;
  is_active: boolean;
  invoice_count: number;
  total_amount: number;
  cash_amount: number;
  transfer_amount: number;
  confirmed_by: string | null;
  confirmed_at: string | null;
  days?: SettlementDay[];
  invoices: SettlementInvoice[];
}

interface Unassigned {
  count: number;
  total_amount: number;
  invoices: Array<{ id: string; invoiceNumber: string; amount: number; paymentMethod: string | null; paidAt: string | null; customerName: string | null; customerUsername: string | null }>;
}

const shiftDay = (d: string, delta: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + delta);
  return t.toISOString().slice(0, 10);
};

function MethodLabel({ method }: { method: string | null }) {
  const cash = !method || method === 'cash';
  return (
    <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium', cash ? 'bg-muted text-muted-foreground' : 'bg-info/15 text-info')}>
      {cash ? 'Tunai' : 'Transfer'}
    </span>
  );
}

function ConfirmState({ by }: { by: string | null }) {
  return by
    ? <span className="inline-flex rounded-md bg-success/15 px-2 py-0.5 text-xs font-medium text-success">Dikonfirmasi {by}</span>
    : <span className="inline-flex rounded-md bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">Belum dikonfirmasi</span>;
}

// Setoran: the money each collector took in, one day at a time or over a
// range, for finance to check and confirm. The decision on this screen is
// "does this collector's total match what was handed over", so the
// unconfirmed amount leads and the per-collector rows follow.
export default function AdminCollectorSettlementsPage() {
  const today = todayWIBStr();
  const [mode, setMode] = useState<'daily' | 'range'>('daily');
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState('');
  const [data, setData] = useState<SettlementCollector[]>([]);
  const [unassigned, setUnassigned] = useState<Unassigned | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const q = mode === 'daily' ? `date=${date}` : `from=${from}&to=${to}`;
    try {
      const [rows, orphans] = await Promise.all([
        apiAdmin<SettlementCollector[]>(`/api/collector/setoran?${q}`),
        apiAdmin<Unassigned>(`/api/collector/setoran/unassigned?${q}`).catch(() => null),
      ]);
      setData(Array.isArray(rows) ? rows : []);
      setUnassigned(orphans);
    } catch (e) {
      setData([]);
      setUnassigned(null);
      setError(e instanceof Error ? e.message : 'Setoran gagal dimuat');
    } finally {
      setLoading(false);
    }
  }, [mode, date, from, to]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setExpanded(null); }, [mode, date, from, to]);

  // What can be confirmed: one unit per collector for a day, one per day for a range.
  const unitsOf = useCallback((c: SettlementCollector): Array<SettlementDay> => (
    mode === 'daily'
      ? [{ date, invoice_count: c.invoice_count, total_amount: c.total_amount, cash_amount: c.cash_amount, transfer_amount: c.transfer_amount, confirmed_by: c.confirmed_by, confirmed_at: c.confirmed_at }]
      : c.days || []
  ), [mode, date]);

  const summary = useMemo(() => {
    let total = 0, count = 0, open = 0, openCount = 0, done = 0;
    for (const c of data) {
      for (const u of unitsOf(c)) {
        if (u.total_amount === 0) continue;
        total += u.total_amount;
        count += u.invoice_count;
        if (u.confirmed_by) done += u.total_amount;
        else { open += u.total_amount; openCount++; }
      }
    }
    return { total, count, open, openCount, done };
  }, [data, unitsOf]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((c) => {
      if (!q) return true;
      return (c.collector_name || '').toLowerCase().includes(q) || (c.collector_username || '').toLowerCase().includes(q);
    });
  }, [data, search]);

  const confirm = async (collectorId: string, day: string, undo: boolean) => {
    setBusy(`${collectorId}|${day}`);
    try {
      if (undo) await apiAdmin(`/api/collector/confirm-settlement?collectorId=${collectorId}&date=${day}`, { method: 'DELETE' });
      else await apiAdmin('/api/collector/confirm-settlement', { method: 'POST', body: JSON.stringify({ collectorId, date: day }) });
      showSuccess(undo ? 'Konfirmasi setoran dibatalkan' : 'Setoran dikonfirmasi');
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Konfirmasi gagal disimpan');
    } finally {
      setBusy(null);
    }
  };

  const assign = async (invoiceId: string) => {
    const collectorId = assignTo[invoiceId];
    if (!collectorId) return;
    setBusy(`assign|${invoiceId}`);
    try {
      await apiAdmin('/api/collector/setoran/unassigned', { method: 'POST', body: JSON.stringify({ invoiceId, collectorId }) });
      showSuccess('Pembayaran dicatat ke kolektor');
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Gagal mencatat ke kolektor');
    } finally {
      setBusy(null);
    }
  };

  const activeCollectors = data.filter((c) => c.is_active);

  const statusOf = (c: SettlementCollector) => {
    if (c.invoice_count === 0) return <span className="text-xs text-muted-foreground">Tidak ada pembayaran</span>;
    if (mode === 'daily') return <ConfirmState by={c.confirmed_by} />;
    const open = unitsOf(c).filter((u) => u.total_amount > 0 && !u.confirmed_by).length;
    return open > 0
      ? <span className="inline-flex rounded-md bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">{open} hari belum dikonfirmasi</span>
      : <span className="inline-flex rounded-md bg-success/15 px-2 py-0.5 text-xs font-medium text-success">Semua dikonfirmasi</span>;
  };

  const actionsOf = (c: SettlementCollector) => {
    if (c.invoice_count === 0) return null;
    const open = expanded === c.collector_id;
    const key = `${c.collector_id}|${date}`;
    return (
      <>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" aria-expanded={open} onClick={() => setExpanded(open ? null : c.collector_id)}>
          Rincian <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </Button>
        {mode === 'daily' && (c.confirmed_by ? (
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs text-destructive" disabled={busy === key} onClick={() => confirm(c.collector_id, date, true)}>
            {busy === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Batalkan'}
          </Button>
        ) : (
          <Button type="button" size="sm" className="h-8 text-xs" disabled={busy === key} onClick={() => confirm(c.collector_id, date, false)}>
            {busy === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Konfirmasi'}
          </Button>
        ))}
      </>
    );
  };

  const detailOf = (c: SettlementCollector) => (mode === 'daily' ? (
    <table className="w-full min-w-[30rem] text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th scope="col" className="px-4 py-2 text-left font-medium">Pelanggan</th>
          <th scope="col" className="px-4 py-2 text-left font-medium">Invoice</th>
          <th scope="col" className="px-4 py-2 text-left font-medium">Metode</th>
          <th scope="col" className="px-4 py-2 text-left font-medium">Waktu</th>
          <th scope="col" className="px-4 py-2 text-right font-medium">Jumlah</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/60">
        {c.invoices.map((inv) => (
          <tr key={inv.id}>
            <td className="px-4 py-2">
              <p className="font-medium text-foreground">{inv.customerName || inv.customerUsername || '-'}</p>
              <p className="text-xs text-muted-foreground">{inv.customerUsername}</p>
            </td>
            <td className="px-4 py-2 text-xs text-muted-foreground">{inv.invoiceNumber}</td>
            <td className="px-4 py-2"><MethodLabel method={inv.paymentMethod} /></td>
            <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtTime(inv.paidAt)}</td>
            <td className="whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums text-foreground">{fmtRp(inv.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <table className="w-full min-w-[30rem] text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th scope="col" className="px-4 py-2 text-left font-medium">Tanggal</th>
          <th scope="col" className="px-4 py-2 text-right font-medium">Transaksi</th>
          <th scope="col" className="px-4 py-2 text-right font-medium">Total</th>
          <th scope="col" className="px-4 py-2 text-left font-medium">Status</th>
          <th scope="col" className="px-4 py-2 text-right font-medium">Aksi</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/60">
        {(c.days || []).map((d) => {
          const dayKey = `${c.collector_id}|${d.date}`;
          return (
            <tr key={d.date}>
              <td className="px-4 py-2">
                <button type="button" className="rounded font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setDate(d.date); setMode('daily'); }}>
                  {fmtDay(d.date)}
                </button>
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{d.invoice_count}</td>
              <td className="whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums text-foreground">{fmtRp(d.total_amount)}</td>
              <td className="px-4 py-2"><ConfirmState by={d.confirmed_by} /></td>
              <td className="px-4 py-2 text-right">
                {d.confirmed_by ? (
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs text-destructive" disabled={busy === dayKey} onClick={() => confirm(c.collector_id, d.date, true)}>Batalkan</Button>
                ) : (
                  <Button type="button" size="sm" className="h-8 text-xs" disabled={busy === dayKey} onClick={() => confirm(c.collector_id, d.date, false)}>Konfirmasi</Button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  ));
  const input = 'h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const rangeLabel = mode === 'daily' ? fmtDay(date) : `${fmtDay(from)} sampai ${fmtDay(to)}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Setoran Kolektor</h1>
        <p className="mt-1 text-sm text-muted-foreground">Uang yang diterima tiap kolektor, untuk dicocokkan dengan setorannya lalu dikonfirmasi.</p>
      </div>

      {/* Period */}
      <div className="card p-3 sm:p-4 flex flex-wrap items-end gap-3">
        <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Periode">
          {([['daily', 'Harian'], ['range', 'Rentang']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
              className={cn('h-8 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', mode === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'daily' ? (
          <div className="flex items-end gap-1.5">
            <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label="Hari sebelumnya" onClick={() => setDate(shiftDay(date, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <label htmlFor="settle-date" className="mb-1 block text-xs text-muted-foreground">Tanggal</label>
              <input id="settle-date" type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className={input} />
            </div>
            <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label="Hari berikutnya" disabled={date >= today} onClick={() => setDate(shiftDay(date, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor="settle-from" className="mb-1 block text-xs text-muted-foreground">Dari</label>
              <input id="settle-from" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={input} />
            </div>
            <div>
              <label htmlFor="settle-to" className="mb-1 block text-xs text-muted-foreground">Sampai</label>
              <input id="settle-to" type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} className={input} />
            </div>
          </div>
        )}

        <div className="relative sm:ml-auto w-full sm:w-64">
          <label htmlFor="settle-search" className="mb-1 block text-xs text-muted-foreground">Cari kolektor</label>
          <Search className="pointer-events-none absolute left-3 bottom-2.5 h-4 w-4 text-muted-foreground" />
          <input id="settle-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama atau username" className={cn(input, 'w-full pl-9')} />
        </div>
        <Button type="button" variant="outline" className="h-9 gap-2 text-xs" onClick={load} disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Muat ulang
        </Button>
      </div>

      {loading && data.length === 0 && !error ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat setoran...
        </div>
      ) : error ? (
        <div className="card p-6 text-center" role="alert">
          <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-destructive" />
          <p className="text-sm font-semibold text-foreground">Setoran gagal dimuat</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button type="button" variant="outline" className="mt-3 h-9 text-xs" onClick={load}>Coba lagi</Button>
        </div>
      ) : (
        <>
          {/* Totals for the period: the unconfirmed amount is what needs action */}
          <section className="card grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-label={`Ringkasan ${rangeLabel}`}>
            <div className="p-4">
              <p className="text-xs text-muted-foreground">Belum dikonfirmasi</p>
              <p className={cn('mt-1 text-2xl font-extrabold tracking-tight', summary.open > 0 ? 'text-warning' : 'text-foreground')}>{fmtRp(summary.open)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{summary.openCount > 0 ? `${summary.openCount} setoran menunggu` : 'Tidak ada yang menunggu'}</p>
            </div>
            <div className="p-4">
              <p className="text-xs text-muted-foreground">Sudah dikonfirmasi</p>
              <p className="mt-1 text-xl font-bold text-foreground">{fmtRp(summary.done)}</p>
            </div>
            <div className="p-4">
              <p className="text-xs text-muted-foreground">Total diterima kolektor</p>
              <p className="mt-1 text-xl font-bold text-foreground">{fmtRp(summary.total)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{summary.count} transaksi</p>
            </div>
          </section>

          {/* Paid invoices that belong to no collector's settlement */}
          {unassigned && unassigned.count > 0 && (
            <section className="card border-warning/40" aria-labelledby="unassigned-title">
              <div className="p-4">
                <h2 id="unassigned-title" className="text-sm font-semibold text-foreground">
                  {unassigned.count} invoice lunas tidak masuk setoran kolektor manapun ({fmtRp(unassigned.total_amount)})
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ditandai lunas dari halaman Tagihan tanpa memilih kolektor. Jika uangnya diterima kolektor, catat ke kolektornya agar masuk setoran.
                </p>
              </div>
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-2 text-left font-medium">Pelanggan</th>
                      <th scope="col" className="px-4 py-2 text-left font-medium">Dibayar</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Jumlah</th>
                      <th scope="col" className="px-4 py-2 text-left font-medium">Catat ke kolektor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {unassigned.invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-foreground">{inv.customerName || inv.customerUsername || '-'}</p>
                          <p className="text-xs text-muted-foreground">{inv.invoiceNumber}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{fmtTime(inv.paidAt)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold text-foreground">{fmtRp(inv.amount)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <select
                              aria-label={`Kolektor untuk ${inv.invoiceNumber}`}
                              value={assignTo[inv.id] || ''}
                              onChange={(e) => setAssignTo((s) => ({ ...s, [inv.id]: e.target.value }))}
                              className={cn(input, 'h-8 min-w-[9rem] text-xs')}
                            >
                              <option value="">Pilih kolektor</option>
                              {activeCollectors.map((c) => <option key={c.collector_id} value={c.collector_id}>{c.collector_name || c.collector_username}</option>)}
                            </select>
                            <Button type="button" size="sm" className="h-8 text-xs" disabled={!assignTo[inv.id] || busy === `assign|${inv.id}`} onClick={() => assign(inv.id)}>
                              {busy === `assign|${inv.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Catat'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {rows.length === 0 ? (
            <div className="card px-6 py-12 text-center">
              <Wallet className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
              <p className="text-sm font-semibold text-foreground">{data.length === 0 ? 'Belum ada kolektor aktif' : 'Tidak ada kolektor yang cocok'}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.length === 0 ? 'Tambahkan kolektor di Kelola Kolektor untuk melihat setorannya di sini.' : 'Ubah kata kunci pencarian.'}
              </p>
            </div>
          ) : (
            <section aria-label="Setoran per kolektor">
              {/* Tablet and up: one table */}
              <div className="card hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 text-left font-medium">Kolektor</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Transaksi</th>
                      <th scope="col" className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">Tunai</th>
                      <th scope="col" className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">Transfer</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Total</th>
                      <th scope="col" className="px-4 py-2.5 text-left font-medium">Status</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <Fragment key={c.collector_id}>
                        <tr className="border-b border-border last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{c.collector_name || c.collector_username}</p>
                            <p className="text-xs text-muted-foreground">{c.collector_username}{!c.is_active && ' · nonaktif'}</p>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.invoice_count}</td>
                          <td className="hidden px-4 py-3 text-right tabular-nums text-muted-foreground lg:table-cell">{fmtRp(c.cash_amount)}</td>
                          <td className="hidden px-4 py-3 text-right tabular-nums text-muted-foreground lg:table-cell">{fmtRp(c.transfer_amount)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-foreground">{fmtRp(c.total_amount)}</td>
                          <td className="px-4 py-3">{statusOf(c)}</td>
                          <td className="px-4 py-3"><div className="flex items-center justify-end gap-2">{actionsOf(c)}</div></td>
                        </tr>
                        {expanded === c.collector_id && c.invoice_count > 0 && (
                          <tr className="border-b border-border bg-muted/20">
                            <td colSpan={7} className="p-0">{detailOf(c)}</td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phones: one card per collector, the actions always in view */}
              <ul className="space-y-3 md:hidden">
                {rows.map((c) => (
                  <li key={c.collector_id} className="card overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{c.collector_name || c.collector_username}</p>
                          <p className="text-xs text-muted-foreground">{c.collector_username}{!c.is_active && ' · nonaktif'}</p>
                        </div>
                        <p className="shrink-0 text-base font-bold tabular-nums text-foreground">{fmtRp(c.total_amount)}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.invoice_count} transaksi · tunai {fmtRp(c.cash_amount)} · transfer {fmtRp(c.transfer_amount)}
                      </p>
                      <div className="mt-3">{statusOf(c)}</div>
                      {c.invoice_count > 0 && <div className="mt-3 flex items-center gap-2">{actionsOf(c)}</div>}
                    </div>
                    {expanded === c.collector_id && c.invoice_count > 0 && <div className="overflow-x-auto border-t border-border bg-muted/20">{detailOf(c)}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
