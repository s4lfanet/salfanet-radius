'use client';

import { useState, useEffect, useCallback } from 'react';
import { History, Receipt } from 'lucide-react';
import { apiAdmin } from '@/lib/api';
import { PageHeader, LoadingState, ErrorState, EmptyState, ui, fmtRp } from '@/components/collector/ui';
import { PaymentList } from '@/components/collector/PaymentList';
import { cn } from '@/lib/utils';

interface MonthlyData {
  month: string;
  total_count: number;
  total_amount: number;
  cash_amount: number;
  transfer_amount: number;
}

interface CollectionData {
  total_count: number;
  total_amount: number;
  monthly: MonthlyData[];
  recent: Array<{
    id: string;
    invoiceNumber: string;
    amount: number;
    paymentMethod: string | null;
    paidAt: string | null;
    customerName: string | null;
    customerUsername: string | null;
    customerId: string;
    phone: string;
    profileName: string;
    areaName: string;
    address: string;
  }>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtMonth = (m: string) => {
  if (!m || m === 'unknown') return '-';
  const [y, mo] = m.split('-');
  return `${MONTHS[parseInt(mo) - 1]} ${y}`;
};

export default function CollectorMyCollectionsPage() {
  const [data, setData] = useState<CollectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiAdmin<CollectionData>('/api/collector/my-collections?months=6'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Riwayat koleksi gagal dimuat');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const cash = data?.monthly.reduce((s, m) => s + m.cash_amount, 0) ?? 0;
  const transfer = data?.monthly.reduce((s, m) => s + m.transfer_amount, 0) ?? 0;

  return (
    <div>
      <PageHeader title="Koleksi Saya" description="Semua yang Anda tagih dalam 6 bulan terakhir" />

      {loading ? (
        <LoadingState label="Memuat riwayat..." />
      ) : error || !data ? (
        <ErrorState message={error || 'Riwayat koleksi gagal dimuat'} onRetry={fetchData} />
      ) : (
        // Wide screens: totals and months on the left, recent payments as a table on the right.
        <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-4 lg:items-start">
          <div className="space-y-4">
          <section className={cn(ui.card, 'p-4')}>
            <p className="text-xs text-muted-foreground">Total 6 bulan · {data.total_count} transaksi</p>
            <p className="text-2xl font-extrabold tracking-tight text-foreground">{fmtRp(data.total_amount)}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
              <div><dt className="text-xs text-muted-foreground">Tunai</dt><dd className="text-sm font-semibold text-foreground">{fmtRp(cash)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Transfer</dt><dd className="text-sm font-semibold text-foreground">{fmtRp(transfer)}</dd></div>
            </dl>
          </section>

          <section aria-labelledby="monthly">
            <h3 id="monthly" className="text-sm font-semibold text-foreground mb-2">Per bulan</h3>
            {data.monthly.length === 0 ? (
              <EmptyState icon={<History className="w-5 h-5" />} title="Belum ada koleksi" hint="Tagihan yang Anda tandai lunas akan terhitung di sini." />
            ) : (
              <ul className={cn(ui.card, 'divide-y divide-border')}>
                {data.monthly.map((m) => (
                  <li key={m.month} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{fmtMonth(m.month)}</p>
                      <p className="text-xs text-muted-foreground">{m.total_count} tagihan · tunai {fmtRp(m.cash_amount)} · transfer {fmtRp(m.transfer_amount)}</p>
                    </div>
                    <p className="text-sm font-bold text-foreground shrink-0">{fmtRp(m.total_amount)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          </div>

          <section aria-labelledby="recent">
            <h3 id="recent" className="text-sm font-semibold text-foreground mb-2">Terbaru</h3>
            {data.recent.length === 0 ? (
              <EmptyState icon={<Receipt className="w-5 h-5" />} title="Belum ada koleksi" />
            ) : (
              <PaymentList rows={data.recent} />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
