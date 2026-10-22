'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiAdmin } from '@/lib/api/client';
import { formatWIB } from '@/lib/timezone';
import { ScopeFilter, scopeQuery, type ScopeValue } from '@/components/collector/ScopeFilter';
import { Search, X, Users, Phone, MapPin, Router, Wifi, Calendar } from 'lucide-react';

const PAGE_SIZE = 50;
const fmtRp = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;

interface Customer {
  id: string;
  username: string;
  name: string | null;
  customerId: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  expiredAt: string | null;
  profile: { name: string; price: number } | null;
  area: { name: string } | null;
  router: { name: string } | null;
  unpaid_count: number;
  unpaid_amount: number;
}

const STATUS = [
  { key: 'all', label: 'Semua' },
  { key: 'active', label: 'Aktif' },
  { key: 'isolir', label: 'Isolir' },
  { key: 'unpaid', label: 'Ada tunggakan' },
] as const;

const isIsolir = (s: string) => s === 'isolated' || s === 'suspended';

function statusBadge(status: string) {
  if (status === 'active') return { text: 'Aktif', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };
  if (isIsolir(status)) return { text: 'Isolir', cls: 'bg-red-500/10 text-red-600 dark:text-red-400' };
  if (status === 'stop' || status === 'stopped') return { text: 'Berhenti', cls: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' };
  return { text: status, cls: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' };
}

// The customers in the area / routers an admin assigned to this collector
// (Kelola Kolektor), not only those with an open invoice (that is Tagihan).
export default function CollectorCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scope, setScope] = useState<ScopeValue>({ areaId: '', routerId: '' });
  const [status, setStatus] = useState<(typeof STATUS)[number]['key']>('all');
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [assigned, setAssigned] = useState('');

  useEffect(() => {
    apiAdmin<{ collector?: { scopeLabel?: string } }>('/api/collector/auth/session')
      .then((d) => setAssigned(d.collector?.scopeLabel || ''))
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiAdmin<{ users: Customer[] }>(`/api/collector/users?filter=all${scopeQuery(scope)}`);
      setCustomers(res.users || []);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Gagal memuat data pelanggan');
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (status === 'active' && c.status !== 'active') return false;
      if (status === 'isolir' && !isIsolir(c.status)) return false;
      if (status === 'unpaid' && !(c.unpaid_count > 0)) return false;
      if (!q) return true;
      return [c.name, c.username, c.customerId, c.phone, c.address].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [customers, status, search]);

  const counts = useMemo(() => ({
    all: customers.length,
    active: customers.filter((c) => c.status === 'active').length,
    isolir: customers.filter((c) => isIsolir(c.status)).length,
    unpaid: customers.filter((c) => c.unpaid_count > 0).length,
  }), [customers]);

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-foreground">Pelanggan</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {assigned ? <>Pelanggan di <span className="font-medium text-foreground">{assigned}</span>, sesuai penugasan admin</> : 'Pelanggan sesuai area dan router/NAS yang ditugaskan admin'}
        </p>
      </div>

      <ScopeFilter value={scope} onChange={(v) => { setScope(v); setVisible(PAGE_SIZE); }} />

      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {STATUS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => { setStatus(s.key); setVisible(PAGE_SIZE); }}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              status === s.key ? 'bg-emerald-600 text-white' : 'bg-card border border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            {s.label} <span className="opacity-70">({counts[s.key]})</span>
          </button>
        ))}
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setVisible(PAGE_SIZE); }}
          className="w-full pl-10 pr-10 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Cari nama, username, ID, No. HP, alamat..."
        />
        {search && (
          <button type="button" aria-label="Hapus pencarian" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Memuat...</div>
      ) : loadError ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-red-600 dark:text-red-400">{loadError}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Tidak ada pelanggan.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-2">{filtered.length} pelanggan</p>
          <div className="space-y-2">
            {filtered.slice(0, visible).map((c) => {
              const badge = statusBadge(c.status);
              return (
                <div key={c.id} className="bg-card border border-border rounded-xl p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground truncate">{c.name || c.username}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[c.customerId, c.username].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${badge.cls}`}>{badge.text}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {c.profile && <span className="flex items-center gap-1.5 min-w-0"><Wifi className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{c.profile.name} · {fmtRp(c.profile.price)}</span></span>}
                    {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 min-w-0 hover:text-foreground"><Phone className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{c.phone}</span></a>}
                    {(c.area || c.router) && (
                      <span className="flex items-center gap-1.5 min-w-0">
                        {c.router ? <Router className="w-3.5 h-3.5 shrink-0" /> : <MapPin className="w-3.5 h-3.5 shrink-0" />}
                        <span className="truncate">{[c.area?.name, c.router?.name].filter(Boolean).join(' · ')}</span>
                      </span>
                    )}
                    {c.expiredAt && <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 shrink-0" />Aktif s/d {formatWIB(c.expiredAt, 'dd MMM yyyy')}</span>}
                    {c.address && <span className="flex items-start gap-1.5 sm:col-span-2 min-w-0"><MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span className="line-clamp-2">{c.address}</span></span>}
                  </div>
                  {c.unpaid_count > 0 && (
                    <div className="mt-2 text-xs font-medium text-orange-600 dark:text-orange-400">
                      {c.unpaid_count} tagihan belum bayar · {fmtRp(c.unpaid_amount)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {visible < filtered.length && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="mt-4 w-full py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              Tampilkan lagi ({filtered.length - visible} tersisa)
            </button>
          )}
        </>
      )}
    </div>
  );
}
