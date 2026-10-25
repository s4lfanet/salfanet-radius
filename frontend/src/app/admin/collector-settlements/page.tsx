'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Loader2, RefreshCw, ChevronLeft, ChevronRight, Search, Wallet, AlertTriangle, MapPin, Phone, FileImage } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiAdmin } from '@/lib/api';
import { showError, showSuccess } from '@/lib/sweetalert';
import { formatWIB, todayWIBStr } from '@/lib/timezone';
import { cn } from '@/lib/utils';

const fmtRp = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
const fmtDay = (d: string) => formatWIB(`${d}T12:00:00`, 'EEE, dd MMM yyyy');
const PAGE_SIZE = 50;

interface SettlementInvoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  paymentMethod: string | null;
  paidAt: string | null;
  customerName: string | null;
  customerUsername: string | null;
  customerId: string | null;
  phone: string | null;
  address: string | null;
  areaName: string | null;
  profileName: string | null;
  has_proof: boolean;
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
  invoices: SettlementInvoice[];
}

interface Payment extends SettlementInvoice {
  collectorId: string;
  collectorName: string;
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

const isCash = (m: string | null) => !m || m === 'cash';

function MethodLabel({ method }: { method: string | null }) {
  return (
    <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium', isCash(method) ? 'bg-muted text-muted-foreground' : 'bg-info/15 text-info')}>
      {isCash(method) ? 'Tunai' : 'Transfer'}
    </span>
  );
}

function ConfirmState({ by }: { by: string | null }) {
  return by
    ? <span className="inline-flex rounded-md bg-success/15 px-2 py-0.5 text-xs font-medium text-success" title={`Dikonfirmasi ${by}`}>Dikonfirmasi</span>
    : <span className="inline-flex rounded-md bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">Belum</span>;
}

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: ReadonlyArray<readonly [T, string]>; label: string }) {
  return (
    <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn('h-8 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', value === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

// Setoran: every payment the collectors took in for the period, one row each
// with the customer, the collector, the amount and the method, so finance can
// check them against what was handed over and confirm the ones that match,
// several at a time.
export default function AdminCollectorSettlementsPage() {
  const today = todayWIBStr();
  const [mode, setMode] = useState<'daily' | 'range'>('daily');
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<SettlementCollector[]>([]);
  const [unassigned, setUnassigned] = useState<Unassigned | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [collectorId, setCollectorId] = useState('');
  const [state, setState] = useState<'all' | 'open' | 'done'>('all');
  const [method, setMethod] = useState<'all' | 'cash' | 'transfer'>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
  // A different period is a different list: start from an empty selection.
  useEffect(() => { setSelected(new Set()); setPage(1); }, [mode, date, from, to]);
  useEffect(() => { setPage(1); }, [search, collectorId, state, method]);

  const payments: Payment[] = useMemo(() => data
    .flatMap((c) => c.invoices.map((i) => ({ ...i, collectorId: c.collector_id, collectorName: c.collector_name || c.collector_username })))
    .sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || '')), [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (collectorId && p.collectorId !== collectorId) return false;
      if (state === 'open' && p.confirmed_by) return false;
      if (state === 'done' && !p.confirmed_by) return false;
      if (method === 'cash' && !isCash(p.paymentMethod)) return false;
      if (method === 'transfer' && isCash(p.paymentMethod)) return false;
      if (!q) return true;
      return [p.customerName, p.customerUsername, p.customerId, p.phone, p.invoiceNumber, p.address].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [payments, search, collectorId, state, method]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summary = useMemo(() => {
    const open = payments.filter((p) => !p.confirmed_by);
    return {
      total: payments.reduce((s, p) => s + p.amount, 0),
      count: payments.length,
      cash: payments.filter((p) => isCash(p.paymentMethod)).reduce((s, p) => s + p.amount, 0),
      transfer: payments.filter((p) => !isCash(p.paymentMethod)).reduce((s, p) => s + p.amount, 0),
      open: open.reduce((s, p) => s + p.amount, 0),
      openCount: open.length,
      done: payments.filter((p) => p.confirmed_by).reduce((s, p) => s + p.amount, 0),
    };
  }, [payments]);

  const chosen = useMemo(() => payments.filter((p) => selected.has(p.id)), [payments, selected]);
  const chosenOpen = chosen.filter((p) => !p.confirmed_by);
  const chosenDone = chosen.filter((p) => p.confirmed_by);
  const chosenTotal = chosen.reduce((s, p) => s + p.amount, 0);
  const chosenCash = chosen.filter((p) => isCash(p.paymentMethod)).reduce((s, p) => s + p.amount, 0);

  const allFiltered = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const someFiltered = !allFiltered && filtered.some((p) => selected.has(p.id));
  const headRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (headRef.current) headRef.current.indeterminate = someFiltered; }, [someFiltered, filtered.length, selected]);

  const toggle = (id: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected((s) => {
    const next = new Set(s);
    if (allFiltered) filtered.forEach((p) => next.delete(p.id)); else filtered.forEach((p) => next.add(p.id));
    return next;
  });

  const setConfirmed = async (rows: Payment[], confirm: boolean) => {
    if (rows.length === 0) return;
    setBusy(confirm ? 'confirm' : 'undo');
    try {
      await apiAdmin('/api/collector/setoran/confirm', { method: 'POST', body: JSON.stringify({ invoiceIds: rows.map((r) => r.id), confirm }) });
      showSuccess(confirm ? `${rows.length} pembayaran dikonfirmasi` : `Konfirmasi ${rows.length} pembayaran dibatalkan`);
      setSelected(new Set());
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Konfirmasi gagal disimpan');
    } finally {
      setBusy(null);
    }
  };

  const assign = async (invoiceId: string) => {
    const target = assignTo[invoiceId];
    if (!target) return;
    setBusy(`assign|${invoiceId}`);
    try {
      await apiAdmin('/api/collector/setoran/unassigned', { method: 'POST', body: JSON.stringify({ invoiceId, collectorId: target }) });
      showSuccess('Pembayaran dicatat ke kolektor');
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Gagal mencatat ke kolektor');
    } finally {
      setBusy(null);
    }
  };

  const activeCollectors = data.filter((c) => c.is_active);
  const input = 'h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const checkbox = 'h-4 w-4 shrink-0 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const rangeLabel = mode === 'daily' ? fmtDay(date) : `${fmtDay(from)} sampai ${fmtDay(to)}`;
  const timeOf = (iso: string | null) => (iso ? formatWIB(iso, mode === 'daily' ? 'HH:mm' : 'dd MMM, HH:mm') : '-');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Setoran Kolektor</h1>
        <p className="mt-1 text-sm text-muted-foreground">Semua pembayaran yang diterima kolektor. Centang yang sudah cocok dengan setorannya, lalu konfirmasi.</p>
      </div>

      {/* Period */}
      <div className="card flex flex-wrap items-end gap-3 p-3 sm:p-4">
        <Segmented value={mode} onChange={setMode} label="Periode" options={[['daily', 'Harian'], ['range', 'Rentang']] as const} />

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

        <Button type="button" variant="outline" className="h-9 gap-2 text-xs sm:ml-auto" onClick={load} disabled={loading}>
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
          {/* The unconfirmed amount is what needs action, so it leads */}
          <section className="card grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-label={`Ringkasan ${rangeLabel}`}>
            <div className="p-4">
              <p className="text-xs text-muted-foreground">Belum dikonfirmasi</p>
              <p className={cn('mt-1 text-2xl font-extrabold tracking-tight', summary.open > 0 ? 'text-warning' : 'text-foreground')}>{fmtRp(summary.open)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{summary.openCount > 0 ? `${summary.openCount} pembayaran menunggu` : 'Tidak ada yang menunggu'}</p>
            </div>
            <div className="p-4">
              <p className="text-xs text-muted-foreground">Sudah dikonfirmasi</p>
              <p className="mt-1 text-xl font-bold text-foreground">{fmtRp(summary.done)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{summary.count - summary.openCount} pembayaran</p>
            </div>
            <div className="p-4">
              <p className="text-xs text-muted-foreground">Total diterima kolektor</p>
              <p className="mt-1 text-xl font-bold text-foreground">{fmtRp(summary.total)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Tunai {fmtRp(summary.cash)} · Transfer {fmtRp(summary.transfer)}</p>
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
                <table className="w-full min-w-[34rem] text-sm">
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
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{inv.paidAt ? formatWIB(inv.paidAt, 'dd MMM, HH:mm') : '-'}</td>
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

          {data.length === 0 ? (
            <div className="card px-6 py-12 text-center">
              <Wallet className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
              <p className="text-sm font-semibold text-foreground">Belum ada kolektor aktif</p>
              <p className="mt-1 text-sm text-muted-foreground">Tambahkan kolektor di Kelola Kolektor untuk melihat setorannya di sini.</p>
            </div>
          ) : (
            <section className="space-y-3" aria-label="Pembayaran kolektor">
              {/* Collector totals double as the collector filter */}
              <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter kolektor">
                {[{ id: '', name: 'Semua kolektor', count: payments.length, total: summary.total, open: summary.openCount }, ...data.map((c) => ({
                  id: c.collector_id,
                  name: c.collector_name || c.collector_username,
                  count: c.invoice_count,
                  total: c.total_amount,
                  open: c.invoices.filter((i) => !i.confirmed_by).length,
                }))].map((c) => (
                  <button
                    key={c.id || 'all'}
                    type="button"
                    aria-pressed={collectorId === c.id}
                    onClick={() => setCollectorId(c.id)}
                    className={cn('shrink-0 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', collectorId === c.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted')}
                  >
                    <span className="block text-xs font-medium text-foreground">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c.count} pembayaran · {fmtRp(c.total)}{c.open > 0 && <span className="text-warning"> · {c.open} belum</span>}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Cari pembayaran" placeholder="Cari pelanggan, ID, HP, alamat, invoice" className={cn(input, 'w-full pl-9')} />
                </div>
                <Segmented value={state} onChange={setState} label="Status konfirmasi" options={[['all', 'Semua'], ['open', 'Belum'], ['done', 'Sudah']] as const} />
                <Segmented value={method} onChange={setMethod} label="Metode bayar" options={[['all', 'Semua'], ['cash', 'Tunai'], ['transfer', 'Transfer']] as const} />
                <p className="text-xs text-muted-foreground sm:ml-auto">{filtered.length} pembayaran</p>
              </div>

              {filtered.length === 0 ? (
                <div className="card px-6 py-12 text-center">
                  <p className="text-sm font-semibold text-foreground">{payments.length === 0 ? 'Tidak ada pembayaran kolektor pada periode ini' : 'Tidak ada pembayaran yang cocok'}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{payments.length === 0 ? 'Pilih tanggal lain, atau lihat apakah ada invoice lunas tanpa kolektor di atas.' : 'Ubah pencarian atau filter.'}</p>
                </div>
              ) : (
                <>
                  {/* Tablet and up */}
                  <div className="card hidden overflow-x-auto md:block">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                          <th scope="col" className="w-10 px-3 py-2.5">
                            <input ref={headRef} type="checkbox" className={checkbox} checked={allFiltered} onChange={toggleAll} aria-label={`Pilih semua ${filtered.length} pembayaran`} />
                          </th>
                          <th scope="col" className="px-3 py-2.5 text-left font-medium">Pelanggan</th>
                          <th scope="col" className="hidden px-3 py-2.5 text-left font-medium xl:table-cell">Alamat</th>
                          <th scope="col" className="px-3 py-2.5 text-left font-medium">Kolektor</th>
                          <th scope="col" className="px-3 py-2.5 text-left font-medium">Invoice</th>
                          <th scope="col" className="px-3 py-2.5 text-left font-medium">Metode</th>
                          <th scope="col" className="px-3 py-2.5 text-right font-medium">Jumlah</th>
                          <th scope="col" className="px-3 py-2.5 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {shown.map((p) => (
                          <tr key={p.id} className={cn('align-top hover:bg-muted/30', selected.has(p.id) && 'bg-primary/5')}>
                            <td className="px-3 py-3">
                              <input type="checkbox" className={checkbox} checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Pilih ${p.invoiceNumber}`} />
                            </td>
                            <td className="min-w-[13rem] px-3 py-3">
                              <p className="font-medium text-foreground">{p.customerName || p.customerUsername || '-'}</p>
                              <p className="text-xs text-muted-foreground">{[p.customerId, p.customerUsername].filter(Boolean).join(' · ')}</p>
                              {p.phone && <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" aria-hidden />{p.phone}</p>}
                              {/* Below xl the address column is hidden, so it folds in here */}
                              {p.address && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground xl:hidden">{p.address}</p>}
                            </td>
                            <td className="hidden max-w-[16rem] px-3 py-3 xl:table-cell">
                              <p className="line-clamp-2 text-sm text-foreground">{p.address || '-'}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">{[p.areaName, p.profileName].filter(Boolean).join(' · ')}</p>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-foreground">{p.collectorName}</td>
                            <td className="whitespace-nowrap px-3 py-3">
                              <p className="text-xs text-foreground">{p.invoiceNumber}</p>
                              <p className="text-xs text-muted-foreground">{timeOf(p.paidAt)}</p>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3">
                              <MethodLabel method={p.paymentMethod} />
                              {p.has_proof && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><FileImage className="h-3 w-3" aria-hidden />Ada bukti</p>}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-foreground">{fmtRp(p.amount)}</td>
                            <td className="px-3 py-3">
                              <ConfirmState by={p.confirmed_by} />
                              {p.confirmed_by && <p className="mt-1 text-xs text-muted-foreground">{p.confirmed_by}</p>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Phones */}
                  <ul className="space-y-2 md:hidden">
                    {shown.map((p) => (
                      <li key={p.id} className={cn('card p-4', selected.has(p.id) && 'border-primary')}>
                        <div className="flex items-start gap-3">
                          <input type="checkbox" className={cn(checkbox, 'mt-1 h-5 w-5')} checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Pilih ${p.invoiceNumber}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">{p.customerName || p.customerUsername || '-'}</p>
                                <p className="truncate text-xs text-muted-foreground">{[p.customerId, p.customerUsername].filter(Boolean).join(' · ')}</p>
                              </div>
                              <p className="shrink-0 font-bold tabular-nums text-foreground">{fmtRp(p.amount)}</p>
                            </div>
                            {p.phone && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3 shrink-0" aria-hidden />{p.phone}</p>}
                            {p.address && <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground"><MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /><span className="line-clamp-2">{p.address}</span></p>}
                            <p className="mt-1 text-xs text-muted-foreground">{[p.areaName, p.profileName].filter(Boolean).join(' · ')}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <MethodLabel method={p.paymentMethod} />
                              <ConfirmState by={p.confirmed_by} />
                              <span className="text-xs text-muted-foreground">{p.collectorName} · {timeOf(p.paidAt)}</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{p.invoiceNumber}{p.has_proof && ' · ada bukti transfer'}</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {pages > 1 && (
                    <nav className="flex items-center justify-between gap-3" aria-label="Halaman">
                      <p className="text-xs text-muted-foreground">{(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} dari {filtered.length}</p>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label="Halaman sebelumnya" disabled={page === 1} onClick={() => setPage((n) => Math.max(1, n - 1))}><ChevronLeft className="h-4 w-4" /></Button>
                        <span className="text-sm font-medium tabular-nums text-foreground">{page} / {pages}</span>
                        <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label="Halaman berikutnya" disabled={page === pages} onClick={() => setPage((n) => Math.min(pages, n + 1))}><ChevronRight className="h-4 w-4" /></Button>
                      </div>
                    </nav>
                  )}
                </>
              )}

              {/* Appears with the first tick. Fixed rather than sticky: the admin
                  layout clips overflow-x, which stops sticky from sticking. It floats
                  over the rows, hence the border and shadow, and starts after the
                  sidebar (lg:pl-64 in the layout). */}
              {chosen.length > 0 && (
                <div className="h-24 sm:h-16" aria-hidden />
              )}
              {chosen.length > 0 && (
                <div className="fixed inset-x-3 bottom-3 z-40 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-lg lg:left-[calc(16rem+0.75rem)]" role="region" aria-label="Aksi untuk pembayaran terpilih">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{chosen.length} pembayaran dipilih · {fmtRp(chosenTotal)}</p>
                    <p className="text-xs text-muted-foreground">Tunai {fmtRp(chosenCash)} · Transfer {fmtRp(chosenTotal - chosenCash)}</p>
                  </div>
                  <Button type="button" variant="outline" className="h-9 text-xs" onClick={() => setSelected(new Set())} disabled={busy !== null}>Kosongkan</Button>
                  {chosenDone.length > 0 && (
                    <Button type="button" variant="outline" className="h-9 text-xs text-destructive" onClick={() => setConfirmed(chosenDone, false)} disabled={busy !== null}>
                      {busy === 'undo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Batalkan konfirmasi ${chosenDone.length}`}
                    </Button>
                  )}
                  <Button type="button" className="h-9 text-xs" onClick={() => setConfirmed(chosenOpen, true)} disabled={busy !== null || chosenOpen.length === 0}>
                    {busy === 'confirm' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Konfirmasi ${chosenOpen.length} pembayaran`}
                  </Button>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
