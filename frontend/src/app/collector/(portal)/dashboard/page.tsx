'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { apiAdmin } from '@/lib/api/client';
import { ChevronLeft, ChevronRight, Receipt, UserX, Wallet, Banknote, Smartphone, BadgePercent, CalendarCheck } from 'lucide-react';
import { ScopeFilter, scopeQuery, type ScopeValue } from '@/components/collector/ScopeFilter';
import { PageHeader, IconBox, ErrorState, ui, fmtRp, toneText } from '@/components/collector/ui';
import { cn } from '@/lib/utils';

interface Summary {
  period: string;
  invoice_count: number;
  total_amount: number;
  cash_amount: number;
  transfer_amount: number;
  discount_amount: number;
  today_count: number;
  today_amount: number;
  isolir_count: number;
  bill_count: number;
  bill_amount: number;
  bill_paid_count: number;
  bill_paid_amount: number;
  unpaid_count: number;
  unpaid_amount: number;
}

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const shiftMonth = (period: string, delta: number) => {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};

export default function CollectorDashboardPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(thisMonth);
  const [scope, setScope] = useState<ScopeValue>({ areaId: '', routerId: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiAdmin<{ summary: Summary }>(`/api/collector/dashboard?period=${period}${scopeQuery(scope)}`);
      setData(res.summary);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ringkasan gagal dimuat');
    } finally {
      setLoading(false);
    }
  }, [period, scope]);

  useEffect(() => { loadData(); }, [loadData]);

  const month = monthLabel(period);
  const isCurrent = period === thisMonth();
  const s = data;
  // Share of this month's billing already paid, by amount (real figures only).
  const paidShare = s && s.bill_amount > 0 ? Math.round((s.bill_paid_amount / s.bill_amount) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Ringkasan"
        description="Tagihan pelanggan Anda dan setoran per bulan"
        actions={
          <>
            <button type="button" aria-label="Bulan sebelumnya" onClick={() => setPeriod((p) => shiftMonth(p, -1))} className={ui.iconBtn}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 sm:flex-none min-w-[9.5rem] text-center text-sm font-semibold text-foreground capitalize" aria-live="polite">{month}</div>
            <button type="button" aria-label="Bulan berikutnya" onClick={() => setPeriod((p) => shiftMonth(p, 1))} className={ui.iconBtn}>
              <ChevronRight className="w-4 h-4" />
            </button>
            {!isCurrent && (
              <button type="button" onClick={() => setPeriod(thisMonth())} className={cn(ui.btnSecondary, 'px-3')}>
                Bulan ini
              </button>
            )}
          </>
        }
      />

      <ScopeFilter value={scope} onChange={setScope} />

      {error && !s ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : !s ? (
        <div className={cn(ui.card, 'h-56 animate-pulse')} aria-label="Memuat ringkasan" />
      ) : (
        <div className={cn('grid gap-4 lg:grid-cols-5 lg:items-start transition-opacity', loading && 'opacity-60')}>
          {/* Focal point: what is still to collect this month. */}
          <section className={cn(ui.card, 'p-5 lg:col-span-3')} aria-labelledby="billing-title">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="billing-title" className="text-sm font-semibold text-foreground capitalize">Tagihan {month}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Jatuh tempo bulan ini, pelanggan di wilayah tugas Anda</p>
              </div>
              <IconBox tone="blue"><Receipt className="w-5 h-5" /></IconBox>
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground">Belum dibayar</p>
              <p className={cn('text-3xl font-extrabold tracking-tight', s.unpaid_amount > 0 ? toneText('red') : 'text-foreground')}>
                {fmtRp(s.unpaid_amount)}
              </p>
              <p className="text-sm text-muted-foreground">{s.unpaid_count} tagihan</p>
            </div>

            {s.bill_count > 0 ? (
              <div className="mt-4">
                <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={paidShare} aria-label="Bagian tagihan yang sudah lunas">
                  <div className="h-full rounded-full bg-emerald-600 dark:bg-emerald-400" style={{ width: `${paidShare}%` }} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Sudah lunas ({paidShare}%)</dt>
                    <dd className={cn('font-semibold', toneText('green'))}>{fmtRp(s.bill_paid_amount)} <span className="font-normal text-muted-foreground">· {s.bill_paid_count}</span></dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Total tagihan</dt>
                    <dd className="font-semibold text-foreground">{fmtRp(s.bill_amount)} <span className="font-normal text-muted-foreground">· {s.bill_count}</span></dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Belum ada tagihan yang jatuh tempo di bulan ini.</p>
            )}

            <div className="mt-5 flex flex-col sm:flex-row gap-2">
              <Link href="/collector/billing" className={cn(ui.btnPrimary, 'sm:flex-1')}>Buka daftar tagihan</Link>
              <Link href="/collector/isolir" className={cn(ui.btnSecondary, 'sm:flex-1')}>
                <UserX className="w-4 h-4" /> {s.isolir_count} pelanggan isolir saat ini
              </Link>
            </div>
          </section>

          {/* Collections: a breakdown list, not four equal tiles. */}
          <section className={cn(ui.card, 'p-5 lg:col-span-2')} aria-labelledby="collect-title">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="collect-title" className="text-sm font-semibold text-foreground">Setoran saya</h3>
                <p className="text-xs text-muted-foreground mt-0.5 capitalize">{month}</p>
              </div>
              <IconBox tone="green"><Wallet className="w-5 h-5" /></IconBox>
            </div>
            <p className="mt-3 text-2xl font-extrabold tracking-tight text-foreground">{fmtRp(s.total_amount)}</p>
            <p className="text-sm text-muted-foreground">{s.invoice_count} transaksi</p>

            <ul className="mt-4 divide-y divide-border border-t border-border">
              {isCurrent && (
                <li className="flex items-center gap-3 py-3">
                  <IconBox tone="blue" size="sm"><CalendarCheck className="w-4 h-4" /></IconBox>
                  <span className="flex-1 text-sm text-foreground">Hari ini <span className="text-muted-foreground">· {s.today_count} transaksi</span></span>
                  <span className="text-sm font-semibold text-foreground">{fmtRp(s.today_amount)}</span>
                </li>
              )}
              <li className="flex items-center gap-3 py-3">
                <IconBox tone="slate" size="sm"><Banknote className="w-4 h-4" /></IconBox>
                <span className="flex-1 text-sm text-foreground">Tunai</span>
                <span className="text-sm font-semibold text-foreground">{fmtRp(s.cash_amount)}</span>
              </li>
              <li className="flex items-center gap-3 py-3">
                <IconBox tone="slate" size="sm"><Smartphone className="w-4 h-4" /></IconBox>
                <span className="flex-1 text-sm text-foreground">Transfer</span>
                <span className="text-sm font-semibold text-foreground">{fmtRp(s.transfer_amount)}</span>
              </li>
              <li className="flex items-center gap-3 py-3">
                <IconBox tone="slate" size="sm"><BadgePercent className="w-4 h-4" /></IconBox>
                <span className="flex-1 text-sm text-foreground">Diskon</span>
                <span className="text-sm font-semibold text-foreground">{fmtRp(s.discount_amount)}</span>
              </li>
            </ul>
            <Link href="/collector/settlements" className={cn(ui.btnSecondary, 'mt-2 w-full')}>Lihat setoran per hari</Link>
          </section>
        </div>
      )}
    </div>
  );
}
