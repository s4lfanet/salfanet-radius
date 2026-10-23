'use client';

import { useState, useEffect, useCallback } from 'react';
import { Inbox, Search, Eye, X } from 'lucide-react';
import { apiAdmin } from '@/lib/api';
import { formatWIB } from '@/lib/timezone';
import { PageHeader, StatusPill, LoadingState, ErrorState, EmptyState, chipClass, ui, fmtRp } from '@/components/collector/ui';
import { cn } from '@/lib/utils';

interface ProofItem {
  id: string;
  invoice_id: string;
  invoice_number: string;
  amount: number;
  status: string;
  reject_reason: string | null;
  reviewed_at: string | null;
  proof_image: string;
  submitted_at: string;
  fullname: string;
  username: string;
  phone: string;
  customerId: string;
  profileName: string;
  profilePrice: number;
  areaName: string;
  address: string;
  is_my_upload: boolean;
}

const STEP = 50;
const fmtDate = (d: string) => d ? formatWIB(d, 'dd MMM yyyy HH:mm') : '-';

const FILTERS = [
  { key: 'pending', label: 'Menunggu' },
  { key: 'approved', label: 'Disetujui' },
  { key: 'rejected', label: 'Ditolak' },
] as const;

export default function CollectorProofsPage() {
  const [proofs, setProofs] = useState<ProofItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(STEP);
  const [viewImage, setViewImage] = useState<string | null>(null);

  const fetchProofs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiAdmin<{ proofs: ProofItem[] }>(`/api/collector/proofs?filter=${filter}`);
      setProofs(data.proofs || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bukti transfer gagal dimuat');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchProofs(); }, [fetchProofs]);

  useEffect(() => {
    if (!viewImage) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewImage(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewImage]);

  const filtered = proofs.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (p.fullname || '').toLowerCase().includes(q) ||
      (p.username || '').toLowerCase().includes(q) ||
      (p.phone || '').includes(q);
  });
  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="max-w-4xl">
      <PageHeader title="Bukti Transfer" description="Bukti transfer pelanggan di wilayah tugas Anda dan status pemeriksaan admin" />

      <div className="flex gap-2 mb-3 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0" role="group" aria-label="Filter status">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => { setFilter(f.key); setVisibleCount(STEP); }} className={chipClass(filter === f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setVisibleCount(STEP); }}
          className={cn(ui.input, 'pl-9')}
          placeholder="Cari nama, username, No. HP"
          aria-label="Cari bukti transfer"
        />
      </div>

      {loading ? (
        <LoadingState label="Memuat bukti transfer..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchProofs} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Inbox className="w-5 h-5" />}
          title={search ? 'Tidak ada yang cocok' : filter === 'pending' ? 'Tidak ada bukti yang menunggu' : 'Belum ada bukti di sini'}
          hint={search ? 'Ubah kata kunci pencarian.' : undefined}
        />
      ) : (
        <>
          <ul className="space-y-2">
            {visible.map((p) => (
              <li key={p.id} className={cn(ui.card, 'p-4')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{p.fullname || p.username}</p>
                    <p className="text-[12px] text-muted-foreground truncate">
                      {[p.customerId || p.username, p.profileName, p.areaName].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {p.status === 'approved' ? <StatusPill tone="green">Disetujui</StatusPill>
                    : p.status === 'rejected' ? <StatusPill tone="red">Ditolak</StatusPill>
                    : <StatusPill tone="amber">Menunggu</StatusPill>}
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-foreground">{fmtRp(p.amount)}</p>
                    <p className="text-[12px] text-muted-foreground">#{p.invoice_number} · dikirim {fmtDate(p.submitted_at)}</p>
                    {p.is_my_upload && <p className="text-[12px] text-muted-foreground">Diunggah oleh Anda</p>}
                  </div>
                  <button type="button" onClick={() => setViewImage(p.proof_image)} className={cn(ui.btnSecondary, 'h-[40px] shrink-0')}>
                    <Eye className="w-4 h-4" /> Lihat bukti
                  </button>
                </div>
                {p.status === 'rejected' && p.reject_reason && (
                  <p className="mt-3 pt-3 border-t border-border text-[13px] text-red-700 dark:text-red-400">Alasan ditolak: {p.reject_reason}</p>
                )}
              </li>
            ))}
          </ul>
          {visibleCount < filtered.length && (
            <button type="button" onClick={() => setVisibleCount((c) => c + STEP)} className={cn(ui.btnSecondary, 'mt-4 w-full')}>
              Tampilkan {Math.min(STEP, filtered.length - visibleCount)} lagi ({visibleCount} dari {filtered.length})
            </button>
          )}
        </>
      )}

      {viewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Bukti transfer">
          <button type="button" aria-label="Tutup" className="absolute inset-0 bg-black/80" onClick={() => setViewImage(null)} />
          <div className="relative w-full max-w-2xl">
            <button type="button" onClick={() => setViewImage(null)} aria-label="Tutup" className="absolute -top-12 right-0 h-[40px] pointer-coarse:h-[44px] w-[40px] pointer-coarse:w-[44px] flex items-center justify-center rounded-xl text-white hover:bg-white/10">
              <X className="w-6 h-6" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element -- proof is a data URL or upload path of any size */}
            <img src={viewImage} alt="Bukti transfer" className="w-full max-h-[80dvh] object-contain rounded-xl bg-black" />
          </div>
        </div>
      )}
    </div>
  );
}
