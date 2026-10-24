'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import CustomerDetailSheet from '@/components/field/CustomerDetailSheet';
import { mapsLinks, type MapPoint } from '@/components/field/CustomerMap';
import { apiAdmin } from '@/lib/api/client';
import { formatWIB } from '@/lib/timezone';
import { ScopeFilter, scopeQuery, type ScopeValue } from '@/components/collector/ScopeFilter';
import { PageHeader, StatusPill, customerStatus, chipClass, LoadingState, ErrorState, EmptyState, ui, fmtRp, toneText } from '@/components/collector/ui';
import { Search, X, Users, Phone, MapPin, Router, Wifi, CalendarDays, MessageCircle, Receipt, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Map as MapIcon, List, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';

const CustomerMap = dynamic(() => import('@/components/field/CustomerMap'), { ssr: false });

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
  connectionType: string | null;
  email: string | null;
  installDate: string | null;
  latitude: number | null;
  longitude: number | null;
  profile: { name: string; price: number } | null;
  area: { name: string } | null;
  router: { name: string } | null;
  unpaid_count: number;
  unpaid_amount: number;
  pay_status?: 'paid' | 'unpaid' | 'none';
  has_overdue?: boolean;
  last_paid_at?: string | null;
}

const STATUS = [
  { key: 'all', label: 'Semua' },
  { key: 'active', label: 'Aktif' },
  { key: 'isolir', label: 'Isolir' },
  { key: 'unpaid', label: 'Belum lunas' },
  { key: 'paid', label: 'Lunas' },
] as const;

type SortKey = 'name' | 'customerId' | 'profile' | 'expiredAt' | 'unpaid' | 'status';

const isIsolir = (s: string) => s === 'isolated' || s === 'suspended';
const fmtDate = (d: string | null) => (d ? formatWIB(d, 'dd MMM yyyy') : '-');

/** Payment status of a customer's invoices, as the list and detail show it. */
const payStatus = (c: Customer): { tone: 'green' | 'red' | 'amber' | 'slate'; label: string } => {
  const s = c.pay_status ?? (c.unpaid_count > 0 ? 'unpaid' : 'none');
  if (s === 'unpaid') return c.has_overdue ? { tone: 'red', label: 'Terlambat' } : { tone: 'amber', label: 'Belum lunas' };
  if (s === 'paid') return { tone: 'green', label: 'Lunas' };
  return { tone: 'slate', label: 'Belum ada tagihan' };
};

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
  const [view, setView] = useState<'table' | 'map'>('table');
  const [detailId, setDetailId] = useState<string | null>(null);

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
      if (status === 'paid' && c.pay_status !== 'paid') return false;
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
    paid: customers.filter((c) => c.pay_status === 'paid').length,
  }), [customers]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalUnpaid = filtered.reduce((s, c) => s + c.unpaid_amount, 0);

  // The map shows every filtered customer that has coordinates, not just one page.
  const mapPoints: MapPoint[] = useMemo(() => filtered
    .filter((c) => c.latitude != null && c.longitude != null)
    .map((c) => {
      const st = customerStatus(c.status);
      return {
        id: c.id,
        name: c.name || c.username,
        subtitle: c.unpaid_count > 0 ? `Tunggakan ${fmtRp(c.unpaid_amount)}` : st.label,
        lat: c.latitude as number,
        lng: c.longitude as number,
        tone: c.unpaid_count > 0 ? 'red' : st.tone === 'green' ? 'green' : st.tone === 'red' ? 'red' : 'slate',
      };
    }), [filtered]);
  const detail = detailId ? customers.find((c) => c.id === detailId) || null : null;

  const nameButton = (c: Customer, className?: string) => (
    <button type="button" onClick={() => setDetailId(c.id)} className={cn('text-left font-semibold text-foreground hover:text-blue-700 dark:hover:text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded', className)}>
      {c.name || c.username}
    </button>
  );

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

  // Labelled buttons: an icon alone did not say what a tap would do.
  // In the table they sit in a row; on phone cards they share a full row.
  const actions = (c: Customer, layout: 'row' | 'grid' = 'row') => {
    const btn = cn(ui.btnSecondary, 'h-[36px] px-3 text-xs pointer-coarse:h-[44px] whitespace-nowrap', layout === 'grid' && 'w-full px-2');
    const who = c.name || c.username;
    return (
      <div className={layout === 'grid' ? 'grid grid-cols-3 gap-2' : 'flex items-center justify-end gap-1.5'}>
        {c.unpaid_count > 0 && (
          <Link href={`/collector/billing?q=${encodeURIComponent(c.username)}`} className={cn(ui.btnPrimary, 'h-[36px] px-3 text-xs pointer-coarse:h-[44px] whitespace-nowrap', layout === 'grid' && 'w-full px-2')} title={`Buka tagihan ${who}`}>
            <Receipt className="w-3.5 h-3.5 shrink-0" /> Tagih
          </Link>
        )}
        {c.phone && (
          <>
            <a href={`tel:${c.phone}`} className={btn} title={`Telepon ${who} (${c.phone})`}>
              <Phone className="w-3.5 h-3.5 shrink-0" /> Telepon
            </a>
            <a href={`https://wa.me/${waNumber(c.phone)}`} target="_blank" rel="noopener noreferrer" className={btn} title={`Kirim WhatsApp ke ${who} (${c.phone})`}>
              <MessageCircle className={cn('w-3.5 h-3.5 shrink-0', toneText('green'))} /> WhatsApp
            </a>
          </>
        )}
      </div>
    );
  };

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
            <button type="button" aria-label="Hapus pencarian" onClick={() => setSearch('')} className="absolute right-0 top-0 h-[40px] pointer-coarse:h-[44px] w-[40px] pointer-coarse:w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground">
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
            <div className="flex items-center gap-3">
              {view === 'table' && (
                <label className="hidden md:flex items-center gap-2 text-muted-foreground">
                  Baris per halaman
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-[36px] rounded-xl border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                    {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              )}
              <div className="flex rounded-xl border border-border bg-card p-0.5" role="group" aria-label="Tampilan">
                {([['table', 'Daftar', List], ['map', 'Peta', MapIcon]] as const).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={view === key}
                    onClick={() => setView(key)}
                    className={cn(
                      'h-[36px] pointer-coarse:h-[44px] px-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                      view === key ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {view === 'map' ? (
            <section aria-label="Peta pelanggan">
              {mapPoints.length > 0 ? (
                <>
                  <CustomerMap points={mapPoints} onSelect={setDetailId} selectedId={detailId} className="h-[60dvh] min-h-[360px]" />
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#DC2626]" aria-hidden /> Ada tunggakan atau isolir</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#059669]" aria-hidden /> Aktif, tanpa tunggakan</span>
                    <span>Ketuk titik untuk melihat detail pelanggan.</span>
                  </div>
                </>
              ) : (
                <EmptyState icon={<MapPin className="w-5 h-5" />} title="Belum ada pelanggan dengan koordinat" hint="Koordinat diisi admin atau teknisi di data pelanggan." />
              )}
              {filtered.length > mapPoints.length && mapPoints.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">{filtered.length - mapPoints.length} pelanggan belum punya koordinat dan tidak tampil di peta.</p>
              )}
            </section>
          ) : (
          <>
          {/* Table: tablets and up */}
          <div className={cn(ui.card, 'hidden md:block overflow-x-auto')}>
            <table className="w-full text-[13px]">
              <thead className="border-b border-border bg-muted/50 text-[13px] text-muted-foreground">
                <tr>
                  <SortHead k="customerId" className="w-36">No. Layanan</SortHead>
                  <SortHead k="name">Pelanggan</SortHead>
                  <SortHead k="profile" className="hidden lg:table-cell">Paket</SortHead>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium hidden xl:table-cell">Router / Area</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium hidden lg:table-cell">Lokasi</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium hidden lg:table-cell">Telepon</th>
                  <SortHead k="expiredAt" className="hidden xl:table-cell">Aktif s/d</SortHead>
                  <SortHead k="status">Status</SortHead>
                  <SortHead k="unpaid">Pembayaran</SortHead>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((c) => {
                  const st = customerStatus(c.status);
                  return (
                    <tr key={c.id} className="hover:bg-muted/40 align-top">
                      <td className="px-3 py-3 text-muted-foreground tabular-nums">
                        <p className="text-foreground font-medium">{c.customerId || '-'}</p>
                        <p className="break-all">{c.username}</p>
                      </td>
                      <td className="px-3 py-3 min-w-[12rem]">
                        {nameButton(c)}
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
                      <td className="px-3 py-3 hidden lg:table-cell whitespace-nowrap">
                        {c.latitude != null && c.longitude != null ? (
                          <>
                            <p className="text-xs text-muted-foreground tabular-nums">{c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}</p>
                            <a href={mapsLinks(c.latitude, c.longitude).directions} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline">
                              <Navigation className="w-3 h-3" /> Rute
                            </a>
                          </>
                        ) : <span className="text-xs text-muted-foreground">Belum ada</span>}
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell text-muted-foreground whitespace-nowrap">{c.phone || '-'}</td>
                      <td className="px-3 py-3 hidden xl:table-cell text-muted-foreground whitespace-nowrap">{fmtDate(c.expiredAt)}</td>
                      <td className="px-3 py-3"><StatusPill tone={st.tone}>{st.label}</StatusPill></td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <StatusPill tone={payStatus(c).tone}>{payStatus(c).label}</StatusPill>
                        {c.unpaid_count > 0 ? (
                          <p className="mt-1 text-xs text-muted-foreground"><span className={cn('font-semibold', toneText('red'))}>{fmtRp(c.unpaid_amount)}</span> · {c.unpaid_count} tagihan</p>
                        ) : c.last_paid_at ? (
                          <p className="mt-1 text-xs text-muted-foreground">Dibayar {fmtDate(c.last_paid_at)}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">{actions(c)}</td>
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
                      {nameButton(c, 'block truncate max-w-full')}
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
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setDetailId(c.id)} className={cn(ui.btnSecondary, 'h-[40px]')}>Detail</button>
                    {c.latitude != null && c.longitude != null
                      ? <a href={mapsLinks(c.latitude, c.longitude).directions} target="_blank" rel="noopener noreferrer" className={cn(ui.btnSecondary, 'h-[40px]')}><Navigation className="w-4 h-4" /> Rute</a>
                      : <span className="h-[40px] inline-flex items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground">Belum ada koordinat</span>}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <StatusPill tone={payStatus(c).tone}>{payStatus(c).label}</StatusPill>
                      {c.unpaid_count > 0
                        ? <p className="text-sm text-right"><span className={cn('font-semibold', toneText('red'))}>{fmtRp(c.unpaid_amount)}</span> <span className="text-muted-foreground">· {c.unpaid_count} tagihan</span></p>
                        : c.last_paid_at && <p className="text-xs text-muted-foreground">Dibayar {fmtDate(c.last_paid_at)}</p>}
                    </div>
                    {(c.unpaid_count > 0 || c.phone) && actions(c, 'grid')}
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
        </>
      )}

      {detail && (
        <CustomerDetailSheet
          customer={detail}
          onClose={() => setDetailId(null)}
          actions={detail.unpaid_count > 0 ? (
            <Link href={`/collector/billing?q=${encodeURIComponent(detail.username)}`} className={cn(ui.btnPrimary, 'w-full')}>
              <Receipt className="w-4 h-4" /> Tagih {fmtRp(detail.unpaid_amount)}
            </Link>
          ) : undefined}
        >
          <section aria-labelledby="bill-title">
            <h4 id="bill-title" className="text-sm font-semibold text-foreground mb-1">Tagihan</h4>
            <p className="text-sm text-muted-foreground">
              {detail.unpaid_count > 0
                ? <><span className={cn('font-semibold', toneText('red'))}>{fmtRp(detail.unpaid_amount)}</span> belum dibayar dari {detail.unpaid_count} tagihan.</>
                : detail.pay_status === 'paid'
                  ? <>Lunas{detail.last_paid_at ? <>, terakhir dibayar {fmtDate(detail.last_paid_at)}</> : null}.</>
                  : 'Belum ada tagihan untuk pelanggan ini.'}
            </p>
          </section>
        </CustomerDetailSheet>
      )}
    </div>
  );
}
