'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiAdmin, ApiError } from '@/lib/api/client';
import { UserX, Search, Unplug, ChevronDown, X, Loader2 } from 'lucide-react';

export default function CollectorIsolirPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);
  const [showCabutModal, setShowCabutModal] = useState(false);
  const [cabutTarget, setCabutTarget] = useState<any>(null);
  const [cabutNotes, setCabutNotes] = useState('');
  const [cabutLoading, setCabutLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await apiAdmin<{ users: any[] }>('/api/collector/isolir');
      setUsers(res.users || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData() }, [loadData]);

  const filtered = users.filter(u => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (u.name || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.customerId || '').toLowerCase().includes(q);
  });
  const visible = filtered.slice(0, visibleCount);

  const openCabutModal = (u: any) => {
    setCabutTarget(u);
    setCabutNotes('');
    setShowCabutModal(true);
  };

  const submitCabut = async () => {
    if (!cabutTarget) return;
    setCabutLoading(true);
    try {
      await apiAdmin('/api/collector/ont-removals', {
        method: 'POST',
        body: JSON.stringify({ username: cabutTarget.username, notes: cabutNotes }),
      });
      setShowCabutModal(false);
      setCabutTarget(null);
      setCabutNotes('');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Gagal mencatat';
      alert(msg);
    } finally {
      setCabutLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Pelanggan Terisolir</h2>
          <p className="text-sm text-muted-foreground mt-1">Pelanggan di wilayahmu yang sedang isolir</p>
        </div>
        <span className="px-3 py-1 rounded-full bg-red-500/10 text-red-600 text-sm font-bold">
          {users.length} Pelanggan
        </span>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setVisibleCount(20); }}
          className="w-full pl-10 pr-10 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Cari nama, username, ID..."
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Memuat...</div>
      ) : visible.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          <UserX className="w-10 h-10 mx-auto mb-3 opacity-20" />
          {search ? `Tidak ada hasil untuk "${search}"` : 'Tidak ada pelanggan terisolir saat ini.'}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {visible.map(u => (
              <div key={u.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground">{u.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {u.customerId || u.username} · {u.phone || '—'}
                  </div>
                  {!u.is_paid && (
                    <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 font-medium">
                      Belum bayar: Rp {Number(u.unpaid_amount || 0).toLocaleString('id-ID')}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => openCabutModal(u)}
                  className="flex-shrink-0 p-2 rounded-lg text-red-600 hover:bg-red-500/10 transition-all"
                  title="Catat Cabut ONT"
                >
                  <Unplug className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
          {visibleCount < filtered.length && (
            <div className="text-center mt-4">
              <button
                onClick={() => setVisibleCount(c => c + 20)}
                className="px-6 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent flex items-center gap-2"
              >
                <ChevronDown className="w-4 h-4" /> Muat {Math.min(20, filtered.length - visibleCount)} lagi ({visibleCount}/{filtered.length})
              </button>
            </div>
          )}
        </>
      )}

      {/* Cabut ONT Modal */}
      {showCabutModal && cabutTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCabutModal(false)}>
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground mb-1">Catat Cabut ONT</h3>
            <p className="text-sm text-muted-foreground mb-4">{cabutTarget.name} ({cabutTarget.username})</p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">Catatan (opsional)</label>
              <textarea
                value={cabutNotes}
                onChange={e => setCabutNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                placeholder="Catatan pencabutan..."
              />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowCabutModal(false)} className="flex-1 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent">
                Batal
              </button>
              <button
                onClick={submitCabut}
                disabled={cabutLoading}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {cabutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />}
                Catat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
