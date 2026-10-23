'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiAdmin } from '@/lib/api/client';
import { formatWIB } from '@/lib/timezone';
import { ChevronDown, RefreshCw, Wallet, CalendarRange } from 'lucide-react';
import { PageHeader, StatusPill, LoadingState, ErrorState, EmptyState, chipClass, ui, fmtRp, type Tone } from '@/components/collector/ui';
import { cn } from '@/lib/utils';

const fmtTime = (d: string) => d ? formatWIB(d, 'dd MMM HH:mm') : '-';
const fmtDate = (d: string) => d ? formatWIB(d, 'EEEE, dd MMMM yyyy') : '-';

const METHOD: Record<string, { label: string; tone: Tone }> = {
  cash: { label: 'Tunai', tone: 'slate' },
  transfer: { label: 'Transfer', tone: 'blue' },
  online: { label: 'Transfer', tone: 'blue' },
  discount: { label: 'Diskon', tone: 'amber' },
};
const method = (m: string) => METHOD[m || 'cash'] || { label: m, tone: 'slate' as Tone };

function Confirmation({ by, at }: { by?: string; at?: string }) {
  return by
    ? <StatusPill tone="green">Diterima admin{at ? ` ${formatWIB(at, 'dd MMM')}` : ''}</StatusPill>
    : <StatusPill tone="amber">Belum diterima admin</StatusPill>;
}

function Summary({ summary }: { summary: any }) {
  const rows = [
    { label: 'Tunai', value: summary?.cash_amount },
    { label: 'Transfer', value: summary?.transfer_amount },
    { label: 'Diskon', value: summary?.discount_amount },
  ];
  return (
    <div className={cn(ui.card, 'p-4 mb-3')}>
      <p className="text-[12px] text-muted-foreground">Total setoran · {summary?.invoice_count || 0} tagihan</p>
      <p className="text-2xl font-extrabold tracking-tight text-foreground">{fmtRp(summary?.total_amount)}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="text-[12px] text-muted-foreground">{r.label}</dt>
            <dd className="text-[13px] font-semibold text-foreground">{fmtRp(r.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Payments({ invoices = [] }: { invoices?: any[] }) {
  if (!invoices.length) {
    return <EmptyState icon={<Wallet className="w-5 h-5" />} title="Belum ada pembayaran" hint="Tagihan yang Anda tandai lunas di tanggal ini akan muncul di sini." />;
  }
  return (
    <ul className={cn(ui.card, 'divide-y divide-border')}>
      {invoices.map((inv) => {
        const m = method(inv.paymentMethod);
        return (
          <li key={inv.id} className="p-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{inv.customerName || inv.customerUsername || '-'}</p>
              <p className="text-[12px] text-muted-foreground truncate">
                {[inv.customerId || inv.customerUsername, inv.profileName, inv.areaName, fmtTime(inv.paidAt)].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[13px] font-semibold text-foreground">{fmtRp(inv.amount)}</p>
              <StatusPill tone={m.tone}>{m.label}</StatusPill>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

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
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const fetchDaily = useCallback(async (d: string) => {
    setLoading(true);
    setDailyError(null);
    try {
      setData(await apiAdmin<any>(`/api/collector/my-settlements?date=${d}`));
    } catch (e: unknown) {
      setDailyError(e instanceof Error ? e.message : 'Setoran harian gagal dimuat');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRange = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setRangeLoading(true);
    setRangeError(null);
    try {
      setRangeData(await apiAdmin<any>(`/api/collector/my-settlements/range?date_from=${dateFrom}&date_to=${dateTo}`));
    } catch (e: unknown) {
      setRangeError(e instanceof Error ? e.message : 'Rekap rentang tanggal gagal dimuat');
    } finally {
      setRangeLoading(false);
    }
  }, [dateFrom, dateTo]);

  const loadDetail = async (d: string) => {
    setDetailError(null);
    try {
      const res = await apiAdmin<any>(`/api/collector/my-settlements?date=${d}`);
      setDetailCache((c) => ({ ...c, [d]: res }));
    } catch (e: unknown) {
      setDetailError(e instanceof Error ? e.message : `Rincian ${d} gagal dimuat`);
    }
  };

  const toggleDay = (d: string) => {
    if (expandedRow === d) { setExpandedRow(null); return; }
    setExpandedRow(d);
    if (!detailCache[d]) loadDetail(d);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- first load only; later loads follow the date picker
  useEffect(() => { fetchDaily(date); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load the range once when switching to it
  useEffect(() => { if (mode === 'range') fetchRange(); }, [mode]);

  return (
    <div className="max-w-4xl">
      <PageHeader title="Setoran Saya" description="Tagihan yang Anda tandai lunas, per hari atau per rentang tanggal" />

      <div className="flex gap-2 mb-4" role="group" aria-label="Tampilan">
        {[{ key: 'daily', label: 'Per hari' }, { key: 'range', label: 'Rentang tanggal' }].map((m) => (
          <button key={m.key} type="button" aria-pressed={mode === m.key} onClick={() => setMode(m.key as 'daily' | 'range')} className={chipClass(mode === m.key)}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'daily' ? (
        <div>
          <div className="flex gap-2 items-end mb-4">
            <div className="flex-1 sm:flex-none sm:w-56">
              <label htmlFor="day" className="text-[12px] text-muted-foreground block mb-1">Tanggal</label>
              <input id="day" type="date" value={date} onChange={(e) => { setDate(e.target.value); fetchDaily(e.target.value); }} className={ui.input} />
            </div>
            <button type="button" onClick={() => fetchDaily(date)} aria-label="Muat ulang" className={ui.iconBtn}>
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </button>
          </div>

          {loading && !data ? (
            <LoadingState label="Memuat setoran..." />
          ) : dailyError ? (
            <ErrorState message={dailyError} onRetry={() => fetchDaily(date)} />
          ) : data ? (
            <div className={cn(loading && 'opacity-60')}>
              <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                <p className="text-[13px] font-medium text-foreground">{fmtDate(data.date)}</p>
                <Confirmation by={data.confirmation?.confirmed_by} at={data.confirmation?.confirmed_at} />
              </div>
              <Summary summary={data.summary} />
              <Payments invoices={data.invoices} />
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-2 sm:flex gap-2 items-end mb-4">
            <div className="sm:w-48">
              <label htmlFor="from" className="text-[12px] text-muted-foreground block mb-1">Dari</label>
              <input id="from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={ui.input} />
            </div>
            <div className="sm:w-48">
              <label htmlFor="to" className="text-[12px] text-muted-foreground block mb-1">Sampai</label>
              <input id="to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={ui.input} />
            </div>
            <button type="button" onClick={fetchRange} className={cn(ui.btnPrimary, 'col-span-2')}>
              <CalendarRange className="w-4 h-4" /> Tampilkan
            </button>
          </div>

          {rangeLoading ? (
            <LoadingState label="Memuat rekap..." />
          ) : rangeError ? (
            <ErrorState message={rangeError} onRetry={fetchRange} />
          ) : rangeData ? (
            rangeData.rows.length === 0 ? (
              <EmptyState icon={<CalendarRange className="w-5 h-5" />} title="Tidak ada setoran di rentang ini" hint="Pilih rentang tanggal lain." />
            ) : (
              <ul className="space-y-2">
                {rangeData.rows.map((row: any) => {
                  const open = expandedRow === row.date;
                  return (
                    <li key={row.date} className={ui.card}>
                      <button
                        type="button"
                        onClick={() => toggleDay(row.date)}
                        aria-expanded={open}
                        className="w-full text-left p-4 flex items-start gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-foreground">{formatWIB(row.date, 'EEE, dd MMM yyyy')}</p>
                          <p className="text-[12px] text-muted-foreground mt-0.5">
                            {row.invoice_count} tagihan · tunai {fmtRp(row.cash_amount)} · transfer {fmtRp(row.transfer_amount)}
                          </p>
                          <div className="mt-2"><Confirmation by={row.confirmed_by} at={row.confirmed_at} /></div>
                        </div>
                        <p className="text-[13px] font-bold text-foreground shrink-0">{fmtRp(row.total_amount)}</p>
                        <ChevronDown className={cn('w-5 h-5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
                      </button>
                      {open && (
                        <div className="border-t border-border p-3">
                          {detailCache[row.date] ? (
                            <Payments invoices={detailCache[row.date].invoices} />
                          ) : detailError ? (
                            <ErrorState message={detailError} onRetry={() => loadDetail(row.date)} />
                          ) : (
                            <LoadingState label="Memuat rincian..." />
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}
