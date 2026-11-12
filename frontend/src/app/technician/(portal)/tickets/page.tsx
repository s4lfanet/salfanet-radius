'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Play,
  RefreshCcw,
  Search,
  Ticket,
  X,
} from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { formatWIB } from '@/lib/timezone';
import { useTranslation } from '@/hooks/useTranslation';
import { apiAdmin } from '@/lib/api/client';
import {
  CategoryBadge,
  Fact,
  PriorityBadge,
  ReplyComposer,
  StatusBadge,
  TicketThread,
  uploadAll,
  type ReplyPayload,
  type ThreadMessage,
} from '@/components/tickets/ticket-ui';

interface TicketData {
  id: string;
  ticketNumber: string;
  customerName: string;
  customerPhone: string;
  subject: string;
  description: string;
  attachments: string | null;
  priority: string;
  status: string;
  assignedToId: string | null;
  assignedToType: string | null;
  createdAt: string;
  resolvedAt: string | null;
  estimatedRepair?: string | null;
  category: { id: string; name: string; color: string | null } | null;
  customer: { id: string; username: string; name: string; phone: string } | null;
  _count: { messages: number };
}

function formatDate(d: string) {
  return formatWIB(d, 'd MMM yyyy, HH:mm');
}

function waLink(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits.startsWith('0') ? `62${digits.slice(1)}` : digits}`;
}

const BTN = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50';
const BTN_PRIMARY = `${BTN} bg-primary text-primary-foreground hover:bg-primary/90`;
const BTN_SUCCESS = `${BTN} bg-emerald-600 text-white hover:bg-emerald-700`;
const BTN_OUTLINE = `${BTN} border border-border text-foreground hover:bg-muted`;

export default function TechnicianTicketsPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();

  const STATUS_TABS: { value: string; label: string }[] = [
    { value: '', label: 'Semua' },
    { value: 'OPEN', label: t('techPortal.statusOpen') },
    { value: 'IN_PROGRESS', label: t('techPortal.statusInProgress') },
    { value: 'WAITING_CUSTOMER', label: t('techPortal.statusWaitingCustomer') },
    { value: 'RESOLVED', label: t('techPortal.statusResolved') },
    { value: 'CLOSED', label: t('techPortal.statusClosed') },
  ];
  const statusLabel = (s: string) => STATUS_TABS.find((tab) => tab.value === s)?.label ?? s;

  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [search, setSearch] = useState('');
  const [showMine, setShowMine] = useState(false);

  const [detailTicket, setDetailTicket] = useState<TicketData | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [mobileTab, setMobileTab] = useState<'chat' | 'info'>('chat');
  const [gpsLoading, setGpsLoading] = useState(false);

  const threadEndRef = useRef<HTMLDivElement>(null);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filterStatus) p.set('status', filterStatus);
      if (filterPriority) p.set('priority', filterPriority);
      if (search) p.set('search', search);
      if (showMine) p.set('mine', 'true');
      const data = await apiAdmin<{ tickets?: TicketData[] }>(`/api/technician/tickets?${p}`);
      setTickets(data.tickets ?? []);
    } catch {
      addToast({ type: 'error', title: t('techPortal.failedLoadTickets') });
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterPriority, search, showMine]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  // `silent` is the background refresh: no spinner, no scrolling, no error toast.
  const loadMessages = useCallback(async (ticketId: string, silent = false) => {
    if (!silent) setMessagesLoading(true);
    try {
      const data = await apiAdmin<ThreadMessage[]>(`/api/technician/tickets?ticketId=${encodeURIComponent(ticketId)}`);
      setMessages(Array.isArray(data) ? data : []);
      if (!silent) setTimeout(() => threadEndRef.current?.scrollIntoView({ block: 'end' }), 50);
    } catch {
      if (!silent) addToast({ type: 'error', title: 'Gagal memuat pesan tiket' });
    } finally {
      if (!silent) setMessagesLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replies, photos and notes from the customer, admin or another technician show up without reopening the ticket.
  useEffect(() => {
    if (!detailTicket) return;
    const id = detailTicket.id;
    const timer = setInterval(() => { void loadMessages(id, true); }, 15000);
    return () => clearInterval(timer);
  }, [detailTicket, loadMessages]);

  // Escape closes the ticket window, as a dialog should.
  useEffect(() => {
    if (!detailTicket) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetailTicket(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailTicket]);

  async function openDetail(ticket: TicketData) {
    setDetailTicket(ticket);
    setMobileTab('chat');
    setMessages([]);
    await loadMessages(ticket.id);
  }

  function closeDetail() {
    setDetailTicket(null);
    setMessages([]);
  }

  async function doAction(ticketId: string, action: string, extra?: Record<string, unknown>) {
    setActionLoading(ticketId + action);
    try {
      await apiAdmin('/api/technician/tickets', {
        method: 'PATCH',
        body: JSON.stringify({ ticketId, action, ...extra }),
      });
      addToast({ type: 'success', title: t('techPortal.actionCompleted') });
      await loadTickets();
      if (detailTicket?.id === ticketId) {
        const updatedStatus = (extra?.status as string | undefined) || (action === 'claim' ? 'IN_PROGRESS' : detailTicket.status);
        setDetailTicket((prev) => prev ? { ...prev, status: updatedStatus, assignedToId: action === 'claim' ? ticketId : prev.assignedToId } : prev);
        await loadMessages(ticketId, true);
      }
    } catch (e: unknown) {
      addToast({ type: 'error', title: 'Gagal', description: (e as Error).message });
    } finally {
      setActionLoading(null);
    }
  }

  function addGps(insert: (text: string) => void) {
    if (!navigator.geolocation) {
      addToast({ type: 'error', title: 'GPS tidak tersedia di perangkat ini' });
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        insert(`Lokasi: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\nhttps://maps.google.com/?q=${latitude},${longitude}`);
        setGpsLoading(false);
      },
      (err) => {
        setGpsLoading(false);
        addToast({ type: 'error', title: 'Gagal mendapatkan lokasi', description: err.message });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function sendReply({ text, files, internal }: ReplyPayload) {
    if (!detailTicket) return false;
    try {
      const attachments = await uploadAll(files, (form) =>
        apiAdmin<{ url?: string; error?: string }>('/api/technician/upload', { method: 'POST', body: form }),
      );
      await apiAdmin('/api/technician/tickets', {
        method: 'PATCH',
        body: JSON.stringify({
          ticketId: detailTicket.id,
          action: 'reply',
          message: text || undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
          isInternal: internal,
        }),
      });
      await loadMessages(detailTicket.id);
      return true;
    } catch (e: unknown) {
      addToast({ type: 'error', title: 'Gagal mengirim', description: (e as Error).message });
      return false;
    }
  }

  /** The next step a technician takes on a ticket in this state, or null when there is none. */
  function nextActions(ticket: TicketData, full: boolean) {
    const busy = !!actionLoading?.startsWith(ticket.id);
    const spin = busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null;
    const done = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED';
    const w = full ? ' w-full' : '';
    return (
      <>
        {!ticket.assignedToId && !done && (
          <button onClick={() => doAction(ticket.id, 'claim')} disabled={busy} className={BTN_PRIMARY + w}>
            {spin ?? <Play className="h-4 w-4" aria-hidden="true" />} Ambil tiket
          </button>
        )}
        {ticket.status === 'IN_PROGRESS' && (
          <>
            <button onClick={() => doAction(ticket.id, 'update_status', { status: 'RESOLVED' })} disabled={busy} className={BTN_SUCCESS + w}>
              {spin ?? <CheckCircle2 className="h-4 w-4" aria-hidden="true" />} Tandai selesai
            </button>
            <button onClick={() => doAction(ticket.id, 'update_status', { status: 'WAITING_CUSTOMER' })} disabled={busy} className={BTN_OUTLINE + w}>
              <Clock className="h-4 w-4" aria-hidden="true" /> Menunggu pelanggan
            </button>
          </>
        )}
        {ticket.status === 'WAITING_CUSTOMER' && (
          <button onClick={() => doAction(ticket.id, 'update_status', { status: 'IN_PROGRESS' })} disabled={busy} className={BTN_PRIMARY + w}>
            {spin ?? <Play className="h-4 w-4" aria-hidden="true" />} Lanjutkan pengerjaan
          </button>
        )}
        {full && ticket.status === 'OPEN' && (
          <button onClick={() => doAction(ticket.id, 'update_status', { status: 'CLOSED' })} disabled={busy} className={BTN_OUTLINE + w}>
            <X className="h-4 w-4" aria-hidden="true" /> Tutup tiket
          </button>
        )}
      </>
    );
  }

  const FIELD = 'min-h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 lg:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">{t('techPortal.tickets')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('techPortal.ticketsSubtitle')}</p>
        </div>
        <button onClick={loadTickets} disabled={loading} className={BTN_OUTLINE}>
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span className="hidden sm:inline">{t('techPortal.refresh')}</span>
        </button>
      </header>

      <div className="space-y-3">
        <div role="tablist" aria-label="Saring status" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value || 'all'}
              role="tab"
              aria-selected={filterStatus === tab.value}
              onClick={() => setFilterStatus(tab.value)}
              className={`min-h-9 shrink-0 rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                filterStatus === tab.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('techPortal.searchTicket')}
              aria-label={t('techPortal.searchTicket')}
              className={`${FIELD} w-full pl-9`}
            />
          </div>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} aria-label="Prioritas" className={FIELD}>
            <option value="">{t('techPortal.allPriority')}</option>
            <option value="URGENT">{t('techPortal.priorityUrgent')}</option>
            <option value="HIGH">{t('techPortal.priorityHigh')}</option>
            <option value="MEDIUM">{t('techPortal.priorityMedium')}</option>
            <option value="LOW">{t('techPortal.priorityLow')}</option>
          </select>
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm text-foreground">
            <input type="checkbox" checked={showMine} onChange={(e) => setShowMine(e.target.checked)} className="h-4 w-4 accent-primary" />
            {t('techPortal.myTickets')}
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Memuat tiket
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-14 text-center">
          <Ticket className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">{t('techPortal.noTickets')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filterStatus || filterPriority || search || showMine ? 'Coba ubah saringan di atas.' : 'Tiket baru dari admin atau pelanggan muncul di sini.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <article className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono font-medium text-foreground">#{ticket.ticketNumber}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      {formatDate(ticket.createdAt)}
                    </p>
                    <h2 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-foreground">{ticket.subject}</h2>
                  </div>
                  <PriorityBadge priority={ticket.priority} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={ticket.status} label={statusLabel(ticket.status)} />
                  {ticket.category && <CategoryBadge name={ticket.category.name} color={ticket.category.color} />}
                </div>
                {ticket.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{ticket.description}</p>}
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground">
                  <span>{ticket.customerName}</span>
                  <a href={`tel:${ticket.customerPhone}`} className="text-muted-foreground hover:text-foreground">{ticket.customerPhone}</a>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> {ticket._count.messages} pesan
                  </span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                  {nextActions(ticket, false)}
                  <button onClick={() => openDetail(ticket)} className={`${BTN_OUTLINE} sm:ml-auto`}>
                    <MessageSquare className="h-4 w-4" aria-hidden="true" /> Buka tiket
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {detailTicket && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 sm:items-center sm:p-4" onClick={closeDetail}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-dialog-title"
            onClick={(e) => e.stopPropagation()}
            className="flex h-dvh w-full flex-col bg-background sm:h-[90vh] sm:max-w-5xl sm:rounded-xl sm:border sm:border-border sm:shadow-xl"
          >
            <header className="flex items-start gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono font-medium text-foreground">#{detailTicket.ticketNumber}</span>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  {formatDate(detailTicket.createdAt)}
                </p>
                <h2 id="ticket-dialog-title" className="mt-0.5 line-clamp-2 text-base font-semibold leading-snug text-foreground">{detailTicket.subject}</h2>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <StatusBadge status={detailTicket.status} label={statusLabel(detailTicket.status)} />
                  <PriorityBadge priority={detailTicket.priority} withPrefix />
                </div>
              </div>
              <button onClick={closeDetail} aria-label="Tutup" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>

            <div role="tablist" aria-label="Bagian tiket" className="flex border-b border-border lg:hidden">
              {([['chat', 'Percakapan'], ['info', 'Info dan tindakan']] as const).map(([value, label]) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={mobileTab === value}
                  onClick={() => setMobileTab(value)}
                  className={`min-h-11 flex-1 border-b-2 text-sm font-medium ${mobileTab === value ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex min-h-0 flex-1">
              <section className={`min-h-0 min-w-0 flex-1 flex-col ${mobileTab === 'chat' ? 'flex' : 'hidden'} lg:flex`}>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  <TicketThread
                    viewer="TECHNICIAN"
                    messages={messages}
                    loading={messagesLoading}
                    opening={{ name: detailTicket.customerName, text: detailTicket.description || '', attachments: detailTicket.attachments, createdAt: detailTicket.createdAt }}
                  />
                  <div ref={threadEndRef} />
                </div>
                {detailTicket.status !== 'CLOSED' && (
                  <div className="border-t border-border p-3">
                    <ReplyComposer
                      allowInternal
                      allowPdf={false}
                      maxBytes={5 * 1024 * 1024}
                      onSend={sendReply}
                      onReject={(reason) => addToast({ type: 'error', title: reason })}
                      tools={(insert, busy) => (
                        <button
                          type="button"
                          onClick={() => addGps(insert)}
                          disabled={busy || gpsLoading}
                          className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                        >
                          {gpsLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MapPin className="h-4 w-4" aria-hidden="true" />}
                          Lokasi
                        </button>
                      )}
                    />
                  </div>
                )}
              </section>

              <aside className={`min-h-0 w-full overflow-y-auto border-border p-4 lg:block lg:w-80 lg:border-l ${mobileTab === 'info' ? 'block' : 'hidden'}`}>
                <div className="space-y-5">
                  {detailTicket.status !== 'CLOSED' && detailTicket.status !== 'RESOLVED' && (
                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-foreground">Tindakan</h3>
                      <div className="flex flex-col gap-2">{nextActions(detailTicket, true)}</div>
                    </section>
                  )}
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">Pelanggan</h3>
                    <dl className="space-y-3">
                      <Fact label="Nama">{detailTicket.customerName}</Fact>
                      <Fact label="Username">{detailTicket.customer?.username && <span className="font-mono">{detailTicket.customer.username}</span>}</Fact>
                      <Fact label="No. HP">{detailTicket.customerPhone}</Fact>
                    </dl>
                    {detailTicket.customerPhone && (
                      <div className="flex flex-wrap gap-2">
                        <a href={`tel:${detailTicket.customerPhone}`} className={BTN_OUTLINE}>
                          <Phone className="h-4 w-4" aria-hidden="true" /> Telepon
                        </a>
                        <a href={waLink(detailTicket.customerPhone)} target="_blank" rel="noopener noreferrer" className={BTN_OUTLINE}>
                          <MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp
                        </a>
                      </div>
                    )}
                  </section>
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">Detail</h3>
                    <dl className="space-y-3">
                      <Fact label="Kategori">{detailTicket.category && <CategoryBadge name={detailTicket.category.name} color={detailTicket.category.color} />}</Fact>
                      <Fact label="Perkiraan perbaikan">{detailTicket.estimatedRepair}</Fact>
                      <Fact label="Dibuat">{formatDate(detailTicket.createdAt)}</Fact>
                      <Fact label="Selesai">{detailTicket.resolvedAt ? formatDate(detailTicket.resolvedAt) : null}</Fact>
                    </dl>
                  </section>
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
