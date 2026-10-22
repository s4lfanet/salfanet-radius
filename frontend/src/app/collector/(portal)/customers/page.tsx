'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiAdmin } from '@/lib/api/client';
import { formatWIB } from '@/lib/timezone';
import { ScopeFilter, scopeQuery, type ScopeValue } from '@/components/collector/ScopeFilter';
import { PageHeader, StatusPill, customerStatus, chipClass, LoadingState, ErrorState, EmptyState, ui, fmtRp, toneText } from '@/components/collector/ui';
import { Search, X, Users, Phone, MapPin, Router, Wifi, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

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
      setLoadError(e instanceof Error ? e.message : 'Daftar pelanggan gagal dimuat');
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
    <div>
      <PageHeader
        title="Pelanggan"
        description={assigned ? <>Wilayah tugas: <span className="font-medium text-foreground">{assigned}</span></> : 'Pelanggan sesuai area dan router/NAS yang ditugaskan admin'}
      />

      <ScopeFilter value={scope} onChange={(v) => { setScope(v); setVisible(PAGE_SIZE); }} />

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setVisible(PAGE_SIZE); }}
          className={cn(ui.input, 'pl-9 pr-11')}
          placeholder="Cari nama, ID, username, No. HP, alamat"
          aria-label="Cari pelanggan"
        />
        {search && (
          <button type="button" aria-label="Hapus pencarian" onClick={() => setSearch('')} className="absolute right-0 top-0 h-11 w-11 flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0" role="group" aria-label="Filter status">
        {STATUS.map((s) => (
          <button key={s.key} type="button" aria-pressed={status === s.key} onClick={() => { setStatus(s.key); setVisible(PAGE_SIZE); }} className={chipClass(status === s.key)}>
            {s.label} <span className="opacity-75">{counts[s.key]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState label="Memuat pelanggan..." />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={loadData} />
      ) : customers.length === 0 ? (
        <EmptyState icon={<Users className="w-5 h-5" />} title="Belum ada pelanggan di wilayah tugas Anda" hint="Minta admin memeriksa area dan router/NAS Anda di Kelola Kolektor." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search className="w-5 h-5" />} title="Tidak ada yang cocok" hint="Ubah kata kunci atau pilih filter Semua." />
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-2">{filtered.length} pelanggan</p>
          <ul className="space-y-2">
            {filtered.slice(0, visible).map((c) => {
              const st = customerStatus(c.status);
              return (
                <li key={c.id} className={cn(ui.card, 'p-4')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{c.name || c.username}</p>
                      <p className="text-xs text-muted-foreground truncate">{[c.customerId, c.username].filter(Boolean).join(' · ')}</p>
                    </div>
                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                    {c.profile && <span className="flex items-center gap-2 min-w-0"><Wifi className="w-4 h-4 shrink-0" /><span className="truncate">{c.profile.name} · {fmtRp(c.profile.price)}</span></span>}
                    {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-2 min-w-0 hover:text-foreground"><Phone className="w-4 h-4 shrink-0" /><span className="truncate">{c.phone}</span></a>}
                    {(c.area || c.router) && (
                      <span className="flex items-center gap-2 min-w-0">
                        {c.router ? <Router className="w-4 h-4 shrink-0" /> : <MapPin className="w-4 h-4 shrink-0" />}
                        <span className="truncate">{[c.area?.name, c.router?.name].filter(Boolean).join(' · ')}</span>
                      </span>
                    )}
                    {c.expiredAt && <span className="flex items-center gap-2"><CalendarDays className="w-4 h-4 shrink-0" />Aktif s/d {formatWIB(c.expiredAt, 'dd MMM yyyy')}</span>}
                    {c.address && <span className="flex items-start gap-2 sm:col-span-2 min-w-0"><MapPin className="w-4 h-4 shrink-0 mt-0.5" /><span className="line-clamp-2">{c.address}</span></span>}
                  </div>
                  {c.unpaid_count > 0 && (
                    <p className={cn('mt-3 pt-3 border-t border-border text-sm font-semibold', toneText('red'))}>
                      {c.unpaid_count} tagihan belum dibayar · {fmtRp(c.unpaid_amount)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {visible < filtered.length && (
            <button type="button" onClick={() => setVisible((v) => v + PAGE_SIZE)} className={cn(ui.btnSecondary, 'mt-4 w-full')}>
              Tampilkan {Math.min(PAGE_SIZE, filtered.length - visible)} lagi
            </button>
          )}
        </>
      )}
    </div>
  );
}
