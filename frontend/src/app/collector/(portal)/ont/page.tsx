'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiAdmin } from '@/lib/api/client';
import { Unplug, RefreshCw } from 'lucide-react';
import { PageHeader, LoadingState, ErrorState, EmptyState, ui } from '@/components/collector/ui';
import { cn } from '@/lib/utils';

const fmtWhen = (d: string) => new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function CollectorOntPage() {
  const [removals, setRemovals] = useState<any[]>([]);
  const [meta, setMeta] = useState({ thisMonth: 0, lastMonth: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiAdmin<{ removals: any[]; thisMonth: number; lastMonth: number }>('/api/collector/ont-removals');
      setRemovals(res.removals || []);
      setMeta({ thisMonth: res.thisMonth || 0, lastMonth: res.lastMonth || 0 });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Riwayat cabut ONT gagal dimuat');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div>
      <PageHeader
        title="Cabut ONT"
        description="Perangkat yang Anda catat sudah dicabut dari pelanggan isolir"
        actions={
          <button type="button" onClick={loadData} aria-label="Muat ulang" className={ui.iconBtn}>
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        }
      />

      <div className={cn(ui.card, 'p-4 mb-4 grid grid-cols-2 divide-x divide-border')}>
        <div className="pr-4">
          <p className="text-xs text-muted-foreground">Bulan ini</p>
          <p className="text-2xl font-extrabold tracking-tight text-foreground">{meta.thisMonth}</p>
        </div>
        <div className="pl-4">
          <p className="text-xs text-muted-foreground">Bulan lalu</p>
          <p className="text-2xl font-extrabold tracking-tight text-foreground">{meta.lastMonth}</p>
        </div>
      </div>

      {loading && removals.length === 0 ? (
        <LoadingState label="Memuat riwayat..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : removals.length === 0 ? (
        <EmptyState icon={<Unplug className="w-5 h-5" />} title="Belum ada cabut ONT tercatat" hint="Catat dari halaman Pelanggan Isolir setelah perangkat diambil." />
      ) : (
        <>
        {/* Table: tablets and up */}
        <div className={cn(ui.card, 'hidden md:block overflow-x-auto')}>
          <table className="w-full text-[13px]">
            <thead className="border-b border-border bg-muted/50 text-[13px] text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">Dicabut</th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">Pelanggan</th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium hidden lg:table-cell">Paket</th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium hidden lg:table-cell">Area</th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">Alamat</th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {removals.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40 align-top">
                  <td className="px-3 py-3 text-muted-foreground whitespace-nowrap tabular-nums">{fmtWhen(r.removedAt)}</td>
                  <td className="px-3 py-3 min-w-[12rem]">
                    <p className="font-medium text-foreground">{r.fullname}</p>
                    <p className="text-xs text-muted-foreground">{r.customerId || r.username}</p>
                  </td>
                  <td className="px-3 py-3 hidden lg:table-cell text-foreground">{r.profileName || '-'}</td>
                  <td className="px-3 py-3 hidden lg:table-cell text-muted-foreground">{r.areaName || '-'}</td>
                  <td className="px-3 py-3 text-muted-foreground max-w-xs"><span className="line-clamp-2">{r.address || '-'}</span></td>
                  <td className="px-3 py-3 text-foreground max-w-xs">{r.notes || <span className="text-muted-foreground">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cards: phones */}
        <ul className={cn(ui.card, 'md:hidden divide-y divide-border')}>
          {removals.map((r) => (
            <li key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{r.fullname}</p>
                  <p className="text-xs text-muted-foreground truncate">{[r.customerId || r.username, r.profileName, r.areaName].filter(Boolean).join(' · ')}</p>
                </div>
                <p className="text-xs text-muted-foreground shrink-0 text-right">{fmtWhen(r.removedAt)}</p>
              </div>
              {(r.address || r.notes) && (
                <div className="mt-2 text-sm text-muted-foreground space-y-0.5">
                  {r.address && <p className="line-clamp-2">{r.address}</p>}
                  {r.notes && <p className="text-foreground">Catatan: {r.notes}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
        </>
      )}
    </div>
  );
}
