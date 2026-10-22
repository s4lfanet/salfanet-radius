'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { apiAdmin } from '@/lib/api/client';
import { formatWIB } from '@/lib/timezone';
import { ScopeFilter, scopeQuery, type ScopeValue } from '@/components/collector/ScopeFilter';
import { PageHeader, StatusPill, customerStatus, chipClass, LoadingState, ErrorState, EmptyState, ui, fmtRp, toneText } from '@/components/collector/ui';
import { Search, X, Users, Phone, MapPin, Router, Wifi, CalendarDays, MessageCircle, Receipt, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Customer {
  id: string;
  username: string;
  name: string | null;
  customerId: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  expiredAt: string | null;
  subscriptionType: string | null;
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

type SortKey = 'name' | 'customerId' | 'profile' | 'expiredAt' | 'unpaid' | 'status';

const isIsolir = (s: string) => s === 'isolated' || s === 'suspended';
const fmtDate = (d: string | null) => (d ? formatWIB(d, 'dd MMM yyyy') : '-');

/** wa.me wants the number with country code and no symbols. */
const waNumber = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  return d.startsWith('0') ? '62' + d.slice(1) : d;
};

const sortValue = (c: Customer, key: SortKey): string | number => {
  switch (key) {
    case 'customerId': return c.customerId || c.username;
    case 'profile': return c.profile?.price ?? -1;
    case 'expiredAt': return c.expiredAt ? new Date(c.expiredAt).getTime() : Number.MAX_SAFE_INTEGER;
    case 'unpaid': return c.unpaid_amount;
    case 'status': return customerStatus(c.status).label;
    default: return (c.name || c.username).toLowerCase();
  }
};

// The customers in the area / routers an admin assigned to this collector
// (Kelola Kolektor), not only those with an open invoice (that is Tagihan).
// Wide screens get a sortable table like the admin panel; phones get cards,
// since nine columns cannot be read at 390px.
export default function CollectorCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scope, setScope] = useState<ScopeValue>({ areaId: '', routerId: '' });
  const [status, setStatus] = useState<(typeof STATUS)[number]['key']>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
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
  useEffect(() => { setPage(1); }, [status, search, scope, pageSize, sort]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = customers.filter((c) => {
      if (status === 'active' && c.status !== 'active') return false;
      if (status === 'isolir' && !isIsolir(c.status)) return false;
      if (status === 'unpaid' && !(c.unpaid_count > 0)) return false;
      if (!q) return true;
      return [c.name, c.username, c.customerId, c.phone, c.address].some((v) => (v || '').toLowerCase().includes(q));
    });
    return [...rows].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [customers, status, search, sort]);

  const counts = useMemo(() => ({
    all: customers.length,
    active: customers.filter((c) => c.status === 'active').length,
    isolir: customers.filter((c) => isIsolir(c.status)).length,
    unpaid: customers.filter((c) => c.unpaid_count > 0).length,
  }), [customers]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalUnpaid = filtered.reduce((s, c) => s + c.unpaid_amount, 0);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  const SortHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => {
    const active = sort.key === k;
    const Icon = !active ? ChevronsUpDown : sort.dir === 1 ? ChevronUp : ChevronDown;
    return (
      <th scope="col" aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={cn('px-3 py-2.5 text-left font-medium', className)}>
        <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 -mx-1 px-1 py-0.5 rounded-md hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
          {children} <Icon className={cn('w-3.5 h-3.5', !active && 'opacity-50')} />
        </button>
      </th>
    );
  };

  const actions = (c: Customer, compact = false) => (
    <div className={cn('flex items-center gap-1.5', compact ? 'justify-end' : '')}>
      {c.unpaid_count > 0 && (
        <Link href={`/collector/billing?q=${encodeURIComponent(c.username)}`} className={cn(ui.btnPrimary, 'h-9 px-3 text-xs pointer-coarse:h-11')} title="Buka tagihan pelanggan ini">
          <Receipt className="w-3.5 h-3.5" /> Tagih
        </Link>
      )}
      {c.phone && (
        <>
          <a href={`tel:${c.phone}`} aria-label={`Telepon ${c.name || c.username}`} className="h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11 inline-flex items-center justify-center rounded-xl border border-border bg-card text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            <Phone className="w-4 h-4" />
          </a>
          <a href={`https://wa.me/${waNumber(c.phone)}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${c.name || c.username}`} className="h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11 inline-flex items-center justify-center rounded-xl border border-border bg-card text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            <MessageCircle className="w-4 h-4" />
          </a>
        </>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Pelanggan"
        description={assigned ? <>Wilayah tugas: <span className="font-medium text-foreground">{assigned}</span></> : 'Pelanggan sesuai area dan router/NAS yang ditugaskan admin'}
      />

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <div className="relative lg:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
        <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0" role="group" aria-label="Filter status">
          {STATUS.map((s) => (
            <button key={s.key} type="button" aria-pressed={status === s.key} onClick={() => setStatus(s.key)} className={chipClass(status === s.key)}>
              {s.label} <span className="opacity-75">{counts[s.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <ScopeFilter value={scope} onChange={setScope} />

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
          <div className="flex items-center justify-between gap-3 mb-2 text-sm">
            <p className="text-muted-foreground">
              {filtered.length} pelanggan
              {totalUnpaid > 0 && <> · tunggakan <span className={cn('font-semibold', toneText('red'))}>{fmtRp(totalUnpaid)}</span></>}
            </p>
            <label className="hidden md:flex items-center gap-2 text-muted-foreground">
              Baris per halaman
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-9 rounded-xl border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>

          {/* Table: tablets and up */}
          <div className={cn(ui.card, 'hidden md:block overflow-x-auto')}>
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <SortHead k="customerId" className="w-36">No. Layanan</SortHead>
                  <SortHead k="name">Pelanggan</SortHead>
                  <SortHead k="profile" className="hidden lg:table-cell">Paket</SortHead>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium hidden xl:table-cell">Router / Area</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium hidden lg:table-cell">Telepon</th>
                  <SortHead k="expiredAt" className="hidden xl:table-cell">Aktif s/d</SortHead>
                  <SortHead k="status">Status</SortHead>
                  <SortHead k="unpaid" className="text-right">Tunggakan</SortHead>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((c) => {
                  const st = customerStatus(c.status);
                  return (
                    <tr key={c.id} className="hover:bg-muted/40 align-top">
                      <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums">
                        <p className="text-foreground font-medium">{c.customerId || '-'}</p>
                        <p className="break-all">{c.username}</p>
                      </td>
                      <td className="px-3 py-3 min-w-[12rem]">
                        <p className="font-semibold text-foreground">{c.name || c.username}</p>
                        {c.address && <p className="text-xs text-muted-foreground line-clamp-1 max-w-xs" title={c.address}>{c.address}</p>}
                        {/* Columns hidden below lg/xl fold into the name cell. */}
                        <p className="text-xs text-muted-foreground lg:hidden">{[c.profile?.name, c.phone].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell">
                        {c.profile ? (
                          <>
                            <p className="text-foreground">{c.profile.name}</p>
                            <p className="text-xs text-muted-foreground">{fmtRp(c.profile.price)}/bln</p>
                          </>
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-3 py-3 hidden xl:table-cell">
                        <p className="text-foreground">{c.router?.name || '-'}</p>
                        <p className="text-xs text-muted-foreground">{c.area?.name || '-'}</p>
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell text-muted-foreground whitespace-nowrap">{c.phone || '-'}</td>
                      <td className="px-3 py-3 hidden xl:table-cell text-muted-foreground whitespace-nowrap">{fmtDate(c.expiredAt)}</td>
                      <td className="px-3 py-3"><StatusPill tone={st.tone}>{st.label}</StatusPill></td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {c.unpaid_count > 0 ? (
                          <>
                            <p className={cn('font-semibold', toneText('red'))}>{fmtRp(c.unpaid_amount)}</p>
                            <p className="text-xs text-muted-foreground">{c.unpaid_count} tagihan</p>
                          </>
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-3 py-3">{actions(c, true)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cards: phones */}
          <ul className="md:hidden space-y-2">
            {shown.map((c) => {
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
                  <div className="mt-3 grid grid-cols-1 gap-y-1.5 text-sm text-muted-foreground">
                    {c.profile && <span className="flex items-center gap-2 min-w-0"><Wifi className="w-4 h-4 shrink-0" /><span className="truncate">{c.profile.name} · {fmtRp(c.profile.price)}</span></span>}
                    {(c.area || c.router) && (
                      <span className="flex items-center gap-2 min-w-0">
                        <Router className="w-4 h-4 shrink-0" />
                        <span className="truncate">{[c.router?.name, c.area?.name].filter(Boolean).join(' · ')}</span>
                      </span>
                    )}
                    {c.expiredAt && <span className="flex items-center gap-2"><CalendarDays className="w-4 h-4 shrink-0" />Aktif s/d {fmtDate(c.expiredAt)}</span>}
                    {c.address && <span className="flex items-start gap-2 min-w-0"><MapPin className="w-4 h-4 shrink-0 mt-0.5" /><span className="line-clamp-2">{c.address}</span></span>}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3">
                    {c.unpaid_count > 0
                      ? <p className={cn('text-sm font-semibold', toneText('red'))}>{fmtRp(c.unpaid_amount)} <span className="font-normal text-muted-foreground">· {c.unpaid_count} tagihan</span></p>
                      : <p className="text-sm text-muted-foreground">Tidak ada tunggakan</p>}
                    {actions(c, true)}
                  </div>
                </li>
              );
            })}
          </ul>

          {pages > 1 && (
            <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Halaman">
              <p className="text-sm text-muted-foreground">
                {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} dari {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Halaman sebelumnya" className={cn(ui.iconBtn, 'disabled:opacity-40')}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-medium text-foreground tabular-nums">{page} / {pages}</span>
                <button type="button" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} aria-label="Halaman berikutnya" className={cn(ui.iconBtn, 'disabled:opacity-40')}>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
