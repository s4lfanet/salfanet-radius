'use client';

import { useState, useEffect, useCallback } from 'react';
import { Inbox, Search, Eye, ChevronDown, Loader2, X } from 'lucide-react';
import { apiAdmin } from '@/lib/api';

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
  is_my_upload: boolean;
}

const STEP = 50;

export default function CollectorProofsPage() {
  const [proofs, setProofs] = useState<ProofItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(STEP);
  const [viewImage, setViewImage] = useState<string | null>(null);

  const fetchProofs = useCallback(async (f: string) => {
    setLoading(true);
    try {
      const data = await apiAdmin<{ proofs: ProofItem[] }>(`/api/collector/proofs?filter=${f}`);
      setProofs(data.proofs || []);
    } catch {
      setProofs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProofs(filter);
  }, [filter]);

  const filtered = proofs.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (p.fullname || '').toLowerCase().includes(q) ||
      (p.username || '').toLowerCase().includes(q) ||
      (p.phone || '').includes(q);
  });
  const visible = filtered.slice(0, visibleCount);

  const fmtRp = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Inbox className="w-5 h-5" /> Verifikasi Bukti Transfer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Periksa bukti transfer dari pelanggan di wilayah Anda.</p>
        </div>
        {filter === 'pending' && proofs.length > 0 && (
          <span className="bg-red-500 text-white rounded-full font-bold px-3 py-1 text-xs">
            {proofs.length} Pending
          </span>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {(['pending', 'approved', 'rejected'] as const).map(s => (
          <button
            key={s}
            onClick={() => { setFilter(s); setSearch(''); setVisibleCount(STEP); }}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
              filter === s
                ? 'bg-emerald-600 text-white'
                : 'border border-border bg-card text-muted-foreground hover:bg-muted'
            }`}
          >
            {s === 'pending' ? '⏳ Menunggu' : s === 'approved' ? '✅ Disetujui' : '❌ Ditolak'}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Cari nama, telepon..."
          value={search}
          onChange={e => { setSearch(e.target.value); setVisibleCount(STEP); }}
          className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
        />
        {search && (
          <button onClick={() => { setSearch(''); setVisibleCount(STEP); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-muted-foreground">
          <Inbox className="w-10 h-10 mx-auto mb-3 opacity-20" />
          {search ? `Tidak ada hasil untuk "${search}"` : filter === 'pending' ? 'Tidak ada bukti transfer yang menunggu verifikasi.' : 'Tidak ada data.'}
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 font-semibold text-muted-foreground">Pelanggan</th>
                    <th className="text-left p-3 font-semibold text-muted-foreground">Invoice</th>
                    <th className="text-left p-3 font-semibold text-muted-foreground">Jumlah</th>
                    <th className="text-left p-3 font-semibold text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-semibold text-muted-foreground">Tgl Kirim</th>
                    <th className="text-center p-3 font-semibold text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(proof => (
                    <tr key={proof.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="p-3">
                        <div className="font-medium text-foreground">{proof.fullname || proof.username}</div>
                        <div className="text-xs text-muted-foreground">{proof.phone || '—'}</div>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{proof.invoice_number}</td>
                      <td className="p-3 font-semibold text-foreground">{fmtRp(proof.amount)}</td>
                      <td className="p-3">
                        {proof.status === 'pending' && (
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">Menunggu</span>
                        )}
                        {proof.status === 'approved' && (
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">Disetujui</span>
                        )}
                        {proof.status === 'rejected' && (
                          <div>
                            <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-medium">Ditolak</span>
                            {proof.reject_reason && (
                              <div className="text-xs text-muted-foreground mt-1">{proof.reject_reason}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{fmtDate(proof.submitted_at)}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => setViewImage(proof.proof_image)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-border rounded-lg hover:bg-muted transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" /> Lihat
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {visibleCount < filtered.length && (
            <div className="text-center">
              <button
                onClick={() => setVisibleCount(c => c + STEP)}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-all"
              >
                <ChevronDown className="w-4 h-4" /> Muat {Math.min(STEP, filtered.length - visibleCount)} lagi
                <span className="text-muted-foreground text-xs">({visibleCount}/{filtered.length})</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* Image Modal */}
      {viewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setViewImage(null)}>
          <div className="relative max-w-2xl w-full">
            <button onClick={() => setViewImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300">
              <X className="w-6 h-6" />
            </button>
            <img src={viewImage} alt="Bukti Transfer" className="w-full rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
