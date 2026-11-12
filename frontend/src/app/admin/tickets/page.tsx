'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import Link from 'next/link';
import { Ticket, MessageSquare, Search, Send, X, ChevronDown, Loader2, MapPin, Navigation, Upload, FileText } from 'lucide-react';
import { CategoryBadge, PriorityBadge, StatusBadge } from '@/components/tickets/ticket-ui';
import { formatWIB } from '@/lib/timezone';
import { showSuccess, showError } from '@/lib/sweetalert';
import { apiAdmin } from '@/lib/api';
import { useApiQuery, useQueryClient, buildQueryKey } from '@/lib/api/hooks';

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface TicketItem {
  id: string;
  ticketNumber: string;
  subject: string;
  customerName: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  assignedToId?: string;
  assignedToType?: string;
  assignedToName?: string | null;
  updatedAt?: string;
  category?: {
    name: string;
    color: string | null;
  };
  _count: {
    messages: number;
  };
}

interface Stats {
  total: number;
  byStatus: {
    open: number;
    inProgress: number;
    waitingCustomer: number;
    resolved: number;
    closed: number;
  };
  byPriority: {
    low: number;
    medium: number;
    high: number;
    urgent: number;
  };
  unassigned: number;
  avgResponseTimeHours: number;
}

interface DispatchFormData {
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  subject: string;
  description: string;
  categoryId: string;
  priority: string;
  routerId: string;
  oltId: string;
  odcId: string;
  odpId: string;
  latitude: string;
  longitude: string;
}

interface DispatchDataResult {
  technicians: { id: string; name: string; phoneNumber: string }[];
  categories: { id: string; name: string; color: string | null }[];
  routers: { id: string; name: string; nasname: string | null }[];
  olts: { id: string; name: string; ipAddress: string }[];
  odcs: { id: string; name: string; oltId: string }[];
  odps: { id: string; name: string; odcId: string | null; portCount: number }[];
  customers: { id: string; username: string; name: string | null; phone: string | null; address: string | null; latitude?: number | null; longitude?: number | null; odpAssignment: { odpId: string; odp: { id: string; name: string } } | null; _source?: 'pppoe' | 'billing' }[];
}

interface DispatchResponse {
  ticket: { ticketNumber: string };
  notified: number;
}

export default function AdminTicketsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ status: '', priority: '', search: '' });

  // Dispatch modal state
  const [showDispatch, setShowDispatch] = useState(false);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchData, setDispatchData] = useState<DispatchDataResult | null>(null);
  const [dispatchDataLoading, setDispatchDataLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [customerLockedIn, setCustomerLockedIn] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [form, setForm] = useState<DispatchFormData>({
    customerId: null, customerName: '', customerPhone: '', customerAddress: '',
    subject: '', description: '', categoryId: '', priority: 'MEDIUM',
    routerId: '', oltId: '', odcId: '', odpId: '',
    latitude: '', longitude: '',
  });
  const [uploadedFiles, setUploadedFiles] = useState<{ url: string; name: string; type: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  const ticketsQueryKey = buildQueryKey('/api/tickets', { status: filters.status, priority: filters.priority, search: filters.search });
  const statsQueryKey = buildQueryKey('/api/tickets/stats');

  // ─── React Query: Tickets list (auto-refetches on filter change) ──────────────
  const { data: ticketsData, isLoading: loading } = useApiQuery<TicketItem[]>('/api/tickets', {
    params: { status: filters.status, priority: filters.priority, search: filters.search },
  });
  const tickets = ticketsData || [];

  // ─── React Query: Ticket stats ────────────────────────────────────────────────
  const { data: stats } = useApiQuery<Stats>('/api/tickets/stats', {
    staleTime: 30000,
  });

  const loadDispatchData = useCallback(async (search = '') => {
    setDispatchDataLoading(true);
    try {
      const data = await apiAdmin<DispatchDataResult>(`/api/tickets/dispatch-data${search ? `?customerSearch=${encodeURIComponent(search)}` : ''}`);
      setDispatchData(data);
    } catch (e: unknown) { /* ignore - non-critical dispatch data load */ console.warn('Failed to load dispatch data:', e); } finally {
      setDispatchDataLoading(false);
    }
  }, []);

  const handleCustomerSearchChange = useCallback((value: string) => {
    setCustomerSearch(value);
    setCustomerLockedIn(false);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!value.trim()) {
      // Clear customer list when search is empty
      setDispatchData(prev => prev ? { ...prev, customers: [] } : prev);
      setCustomerSearchLoading(false);
      return;
    }
    setCustomerSearchLoading(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const data = await apiAdmin<DispatchDataResult>(`/api/tickets/dispatch-data?customerSearch=${encodeURIComponent(value)}`);
        setDispatchData(data);
      } catch (e: unknown) { /* ignore - non-critical customer search */ console.warn('Failed to search customers:', e); } finally {
        setCustomerSearchLoading(false);
      }
    }, 400);
  }, []);

  const openDispatch = () => {
    setShowDispatch(true);
    if (!dispatchData) loadDispatchData();
  };

  const selectCustomer = (c: DispatchDataResult['customers'][0]) => {
    setForm(f => ({
      ...f,
      // customerId must reference pppoeUser.id - billing customers don't have one
      customerId: c._source === 'billing' ? null : c.id,
      customerName: c.name || c.username,
      customerPhone: c.phone || '',
      customerAddress: c.address || '',
      odpId: c.odpAssignment?.odpId || f.odpId,
      latitude: c.latitude != null ? c.latitude.toFixed(6) : '',
      longitude: c.longitude != null ? c.longitude.toFixed(6) : '',
    }));
    setCustomerSearch(c.name || c.username);
    setCustomerLockedIn(true);
  };

  const handleGetGPS = () => {
    if (!navigator.geolocation) {
      showError('GPS tidak didukung', 'Browser tidak mendukung GPS');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setGpsLoading(false);
      },
      () => {
        showError('Gagal GPS', 'Gagal mendapatkan lokasi GPS. Pastikan izin lokasi diaktifkan.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formDataObj = new FormData();
        formDataObj.append('file', file);

        const res = await fetch('/api/tickets/upload', {
          method: 'POST',
          credentials: 'include',
          body: formDataObj,
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          showError('Gagal upload', data.error || `Gagal upload ${file.name}`);
          continue;
        }

        setUploadedFiles(prev => [...prev, { url: data.url, name: file.name, type: data.fileType }]);
      }
    } catch {
      showError('Gagal upload', 'Gagal mengupload file');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDispatch = async () => {
    if (!form.customerName || !form.customerPhone || !form.subject || !form.description) {
      showError('Lengkapi data', 'Nama pelanggan, telepon, subjek, dan deskripsi wajib diisi');
      return;
    }
    setDispatchLoading(true);
    try {
      const payload = {
        ...form,
        attachments: uploadedFiles.length > 0 ? uploadedFiles.map(f => f.url) : undefined,
      };
      const data = await apiAdmin<DispatchResponse>('/api/tickets/dispatch', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showSuccess('Tiket Terkirim', `#${data.ticket.ticketNumber} dikirim ke ${data.notified} teknisi`);
      setShowDispatch(false);
      setForm({ customerId: null, customerName: '', customerPhone: '', customerAddress: '', subject: '', description: '', categoryId: '', priority: 'MEDIUM', routerId: '', oltId: '', odcId: '', odpId: '', latitude: '', longitude: '' });
      setUploadedFiles([]);
      setCustomerSearch('');
      setCustomerLockedIn(false);
      setCustomerSearchLoading(false);
      queryClient.invalidateQueries({ queryKey: ticketsQueryKey });
      queryClient.invalidateQueries({ queryKey: statsQueryKey });
    } catch (e: unknown) {
      showError('Gagal kirim tiket', e instanceof Error ? e.message : String(e));
    } finally {
      setDispatchLoading(false);
    }
  };

  const hasFilter = !!(filters.status || filters.priority || filters.search);
  const FIELD = 'min-h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary';

  // Each tile is a real count from /api/tickets/stats; the ones that map to a filter apply it.
  const summary: { label: string; value: string | number; apply?: () => void; active?: boolean; tone?: string }[] = stats
    ? [
        { label: t('ticket.status_OPEN'), value: stats.byStatus.open, apply: () => setFilters({ ...filters, status: 'OPEN', priority: '' }), active: filters.status === 'OPEN' },
        { label: t('ticket.status_IN_PROGRESS'), value: stats.byStatus.inProgress, apply: () => setFilters({ ...filters, status: 'IN_PROGRESS', priority: '' }), active: filters.status === 'IN_PROGRESS' },
        { label: t('ticket.status_WAITING_CUSTOMER'), value: stats.byStatus.waitingCustomer, apply: () => setFilters({ ...filters, status: 'WAITING_CUSTOMER', priority: '' }), active: filters.status === 'WAITING_CUSTOMER' },
        { label: t('ticket.priority_URGENT'), value: stats.byPriority.urgent, apply: () => setFilters({ ...filters, status: '', priority: 'URGENT' }), active: filters.priority === 'URGENT' && !filters.status, tone: stats.byPriority.urgent > 0 ? 'text-red-600 dark:text-red-400' : '' },
        { label: t('ticket.unassigned'), value: stats.unassigned },
        { label: t('ticket.avgResponseTime'), value: `${stats.avgResponseTimeHours.toFixed(1)} ${t('ticket.hours')}` },
      ]
    : [];

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{t('ticket.tickets')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('ticket.manageAllTickets')}
            {stats && <> · {stats.total} tiket</>}
          </p>
        </div>
        <button
          onClick={openDispatch}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          Kirim ke Teknisi
        </button>
      </header>

      {summary.length > 0 && (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
          {summary.map((s) => {
            const body = (
              <>
                <dt className="truncate text-xs text-muted-foreground">{s.label}</dt>
                <dd className={`mt-1 text-lg font-semibold tabular-nums text-foreground ${s.tone ?? ''}`}>{s.value}</dd>
              </>
            );
            return s.apply ? (
              <button
                key={s.label}
                type="button"
                onClick={s.apply}
                aria-pressed={s.active}
                className={`block bg-card px-4 py-3 text-left hover:bg-muted focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${s.active ? 'bg-muted' : ''}`}
              >
                {body}
              </button>
            ) : (
              <div key={s.label} className="bg-card px-4 py-3">{body}</div>
            );
          })}
        </dl>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder={t('ticket.searchPlaceholder')}
            aria-label={t('ticket.searchPlaceholder')}
            className={`${FIELD} w-full pl-9`}
          />
        </div>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label={t('ticket.status')} className={`${FIELD} flex-1 sm:flex-none`}>
          <option value="">{t('ticket.allStatus')}</option>
          <option value="OPEN">{t('ticket.status_OPEN')}</option>
          <option value="IN_PROGRESS">{t('ticket.status_IN_PROGRESS')}</option>
          <option value="WAITING_CUSTOMER">{t('ticket.status_WAITING_CUSTOMER')}</option>
          <option value="RESOLVED">{t('ticket.status_RESOLVED')}</option>
          <option value="CLOSED">{t('ticket.status_CLOSED')}</option>
        </select>
        <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} aria-label={t('ticket.priority')} className={`${FIELD} flex-1 sm:flex-none`}>
          <option value="">{t('ticket.allPriority')}</option>
          <option value="LOW">{t('ticket.priority_LOW')}</option>
          <option value="MEDIUM">{t('ticket.priority_MEDIUM')}</option>
          <option value="HIGH">{t('ticket.priority_HIGH')}</option>
          <option value="URGENT">{t('ticket.priority_URGENT')}</option>
        </select>
        {hasFilter && (
          <button
            type="button"
            onClick={() => setFilters({ ...filters, status: '', priority: '', search: '' })}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" /> Hapus saringan
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> {t('ticket.loading')}
          </div>
        ) : tickets.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Ticket className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">{t('ticket.noTicketsFound')}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasFilter ? 'Tidak ada tiket yang cocok dengan saringan ini.' : 'Tiket dari pelanggan dan kiriman ke teknisi akan tampil di sini.'}
            </p>
          </div>
        ) : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b border-border bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Tiket</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t('ticket.customer')}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t('ticket.status')}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t('ticket.priority')}</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">Ditangani</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-medium xl:table-cell">Aktivitas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tickets.map((ticket) => (
                  <tr key={ticket.id} onClick={() => router.push(`/admin/tickets/${ticket.id}`)} className="cursor-pointer align-top hover:bg-muted/50">
                    <td className="max-w-md px-4 py-3">
                      <Link
                        href={`/admin/tickets/${ticket.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <span className="line-clamp-2">{ticket.subject}</span>
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">#{ticket.ticketNumber}</span>
                        {ticket.category && <CategoryBadge name={ticket.category.name} color={ticket.category.color} />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-foreground">{ticket.customerName}</td>
                    <td className="px-4 py-3"><StatusBadge status={ticket.status} label={t(`ticket.status_${ticket.status}`)} /></td>
                    <td className="px-4 py-3"><PriorityBadge priority={ticket.priority} label={t(`ticket.priority_${ticket.priority}`)} /></td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {ticket.assignedToId ? (
                        <span className="text-foreground">{ticket.assignedToName || 'Petugas'}</span>
                      ) : (
                        <span className="text-muted-foreground">Belum ada</span>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-muted-foreground xl:table-cell">
                      <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />{ticket._count.messages}</span>
                      <span className="ml-3">{formatWIB(ticket.updatedAt || ticket.createdAt, 'd MMM, HH:mm')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-border md:hidden">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link href={`/admin/tickets/${ticket.id}`} className="block px-4 py-3 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                    <div className="flex items-start justify-between gap-3">
                      <p className="line-clamp-2 min-w-0 text-sm font-medium text-foreground">{ticket.subject}</p>
                      <StatusBadge status={ticket.status} label={t(`ticket.status_${ticket.status}`)} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">#{ticket.ticketNumber}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      {ticket.customerName}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <PriorityBadge priority={ticket.priority} label={t(`ticket.priority_${ticket.priority}`)} />
                      {ticket.category && <CategoryBadge name={ticket.category.name} color={ticket.category.color} />}
                      <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />{ticket._count.messages}</span>
                      <span className="ml-auto">{formatWIB(ticket.updatedAt || ticket.createdAt, 'd MMM, HH:mm')}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Dispatch Modal */}
      {showDispatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => !dispatchLoading && setShowDispatch(false)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Send className="w-4 h-4 text-primary" />
                  Kirim Tiket ke Semua Teknisi
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tiket akan dikirim ke {dispatchData?.technicians.length ?? 0} teknisi aktif via WA & notifikasi
                </p>
              </div>
              <button onClick={() => !dispatchLoading && setShowDispatch(false)} className="p-1.5 hover:bg-muted rounded-lg transition">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {dispatchDataLoading && !dispatchData ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="p-5 space-y-4">

                {/* Customer Section */}
                <div className="bg-muted/40 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Data Pelanggan</p>

                  {/* Customer search */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Cari Pelanggan</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        value={customerSearch}
                        onChange={e => handleCustomerSearchChange(e.target.value)}
                        placeholder="Nama, username, atau telepon..."
                        className="w-full pl-9 pr-8 py-2 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary/40 outline-none"
                        autoComplete="off"
                      />
                      {customerSearchLoading && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    {dispatchData?.customers && dispatchData.customers.length > 0 && customerSearch && !customerLockedIn && (
                      <div className="mt-1 bg-background border border-border rounded-lg max-h-44 overflow-y-auto shadow-lg z-10">
                        {dispatchData.customers.map(c => (
                          <button key={c.id} onClick={() => selectCustomer(c)} className="w-full text-left px-3 py-2.5 text-xs hover:bg-muted transition flex items-center justify-between gap-2 min-w-0">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="font-medium text-foreground truncate">{c.name || c.username}</span>
                              <span className="text-muted-foreground">{c.phone} {c.username && c._source === 'pppoe' ? `· @${c.username}` : ''}</span>
                            </div>
                            <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              c._source === 'billing' ? 'bg-amber-500/20 text-amber-400' : 'bg-brand-500/15 text-brand-500'
                            }`}>{c._source === 'billing' ? 'Pelanggan' : 'PPPoE'}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {customerSearch && !customerLockedIn && !customerSearchLoading && dispatchData?.customers?.length === 0 && (
                      <p className="mt-1 text-xs text-muted-foreground px-1">Tidak ada pelanggan ditemukan untuk &quot;{customerSearch}&quot;</p>
                    )}
                    {customerLockedIn && (
                      <button onClick={() => { setForm(f => ({ ...f, customerId: null })); setCustomerLockedIn(false); setCustomerSearch(''); }} className="mt-1 text-[10px] text-primary hover:underline">
                        Ganti pelanggan
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Nama <span className="text-red-600 dark:text-red-400">*</span></label>
                      <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} placeholder="Nama pelanggan" className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-primary/40 outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Telepon <span className="text-red-600 dark:text-red-400">*</span></label>
                      <input value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} placeholder="08xx..." className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-primary/40 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Alamat</label>
                    <input value={form.customerAddress} onChange={e => setForm(f => ({ ...f, customerAddress: e.target.value }))} placeholder="Alamat pelanggan" className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-primary/40 outline-none" />
                  </div>

                  {/* Coordinates */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Koordinat Lokasi
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form.latitude}
                        onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                        placeholder="Latitude (-5.14...)"
                        className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-primary/40 outline-none"
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form.longitude}
                        onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                        placeholder="Longitude (119.4...)"
                        className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-primary/40 outline-none"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <button
                        type="button"
                        onClick={handleGetGPS}
                        disabled={gpsLoading}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-lg border border-brand-500/40 text-brand-500 bg-brand-500/10 hover:bg-brand-500/20 transition disabled:opacity-50"
                      >
                        {gpsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
                        Ambil GPS
                      </button>
                      {form.latitude && form.longitude && (
                        <a
                          href={`https://maps.google.com/?q=${form.latitude},${form.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-brand-500 hover:underline"
                        >
                          Lihat di Maps
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* File Upload Section */}
                <div className="bg-muted/40 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1">
                    <Upload className="w-3 h-3" /> Lampiran (Foto / Dokumen)
                  </p>
                  <label
                    className={`flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg px-4 py-5 cursor-pointer transition ${
                      uploading
                        ? 'border-border bg-primary/10 opacity-70'
                        : 'border-border hover:border-border hover:bg-primary/10'
                    }`}
                  >
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={handleFileUpload}
                      disabled={uploading}
                      className="hidden"
                    />
                    {uploading ? (
                      <div className="flex flex-col items-center gap-1.5">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        <span className="text-[10px] text-primary">Mengupload...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <Upload className="w-5 h-5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Klik untuk pilih file</span>
                        <span className="text-[10px] text-muted-foreground/70">JPG, PNG, WebP, PDF - maks 10MB</span>
                      </div>
                    )}
                  </label>
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-1.5">
                      {uploadedFiles.map((file, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border">
                          {file.type === 'pdf' ? (
                            <FileText className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                          ) : (
                            <img src={file.url} alt={file.name} className="w-8 h-8 object-cover rounded border border-border flex-shrink-0" />
                          )}
                          <span className="text-xs text-foreground truncate flex-1">{file.name}</span>
                          <button type="button" onClick={() => handleRemoveFile(index)} className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive flex-shrink-0">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Infrastructure Section */}
                <div className="bg-muted/40 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Infrastruktur Jaringan</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Router/NAS</label>
                      <div className="relative">
                        <select value={form.routerId} onChange={e => setForm(f => ({ ...f, routerId: e.target.value }))} className="w-full appearance-none px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-primary/40 outline-none pr-8">
                          <option value="">- Pilih Router -</option>
                          {dispatchData?.routers.map(r => <option key={r.id} value={r.id}>{r.name}{r.nasname ? ` (${r.nasname})` : ''}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">OLT</label>
                      <div className="relative">
                        <select value={form.oltId} onChange={e => setForm(f => ({ ...f, oltId: e.target.value, odcId: '', odpId: '' }))} className="w-full appearance-none px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-primary/40 outline-none pr-8">
                          <option value="">- Pilih OLT -</option>
                          {dispatchData?.olts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">ODC</label>
                      <div className="relative">
                        <select value={form.odcId} onChange={e => setForm(f => ({ ...f, odcId: e.target.value, odpId: '' }))} className="w-full appearance-none px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-primary/40 outline-none pr-8">
                          <option value="">- Pilih ODC -</option>
                          {(dispatchData?.odcs ?? []).filter(o => !form.oltId || o.oltId === form.oltId).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">ODP</label>
                      <div className="relative">
                        <select value={form.odpId} onChange={e => setForm(f => ({ ...f, odpId: e.target.value }))} className="w-full appearance-none px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-primary/40 outline-none pr-8">
                          <option value="">- Pilih ODP -</option>
                          {(dispatchData?.odps ?? []).filter(o => !form.odcId || o.odcId === form.odcId).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ticket Info Section */}
                <div className="bg-muted/40 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Detail Tiket</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Kategori</label>
                      <div className="relative">
                        <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} className="w-full appearance-none px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-primary/40 outline-none pr-8">
                          <option value="">- Pilih Kategori -</option>
                          {dispatchData?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Prioritas</label>
                      <div className="relative">
                        <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="w-full appearance-none px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-primary/40 outline-none pr-8">
                          <option value="LOW">🟢 Rendah</option>
                          <option value="MEDIUM">🟡 Sedang</option>
                          <option value="HIGH">🟠 Tinggi</option>
                          <option value="URGENT">🔴 Urgent</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Subjek <span className="text-red-600 dark:text-red-400">*</span></label>
                    <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Ringkasan masalah" className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-primary/40 outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Deskripsi <span className="text-red-600 dark:text-red-400">*</span></label>
                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Detail masalah yang perlu ditangani teknisi..." rows={4} className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-primary/40 outline-none resize-none" />
                  </div>
                </div>

                {/* Technician List */}
                {dispatchData && dispatchData.technicians.length > 0 && (
                  <div className="bg-muted/30 rounded-xl p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Akan dikirim ke {dispatchData.technicians.length} teknisi aktif:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {dispatchData.technicians.map(t => (
                        <span key={t.id} className="px-2 py-0.5 text-[10px] bg-primary/10 text-primary border border-border rounded-full">{t.name}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer buttons */}
                <div className="flex gap-3 pt-1">
                  <button onClick={() => !dispatchLoading && setShowDispatch(false)} disabled={dispatchLoading} className="flex-1 py-2.5 text-sm font-semibold bg-muted text-foreground border border-border rounded-xl hover:bg-muted/80 transition disabled:opacity-50">
                    Batal
                  </button>
                  <button onClick={handleDispatch} disabled={dispatchLoading} className="flex-[2] py-2.5 text-sm font-semibold bg-gradient-to-r from-primary to-[#9b10d6] text-white rounded-xl  hover: transition disabled:opacity-50 flex items-center justify-center gap-2">
                    {dispatchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {dispatchLoading ? 'Mengirim...' : `Kirim ke ${dispatchData?.technicians.length ?? 0} Teknisi`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
