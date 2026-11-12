'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, MapPin, MessageCircle, Phone } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { showSuccess, showError } from '@/lib/sweetalert';
import { formatWIB } from '@/lib/timezone';
import { apiAdmin } from '@/lib/api';
import { useApiQuery, useQueryClient, buildQueryKey } from '@/lib/api/hooks';
import {
  CategoryBadge,
  Fact,
  Panel,
  PriorityBadge,
  ReplyComposer,
  StatusBadge,
  TicketThread,
  uploadAll,
  type ReplyPayload,
  type ThreadMessage,
  type TicketPriority,
  type TicketStatus,
} from '@/components/tickets/ticket-ui';

interface TicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  attachments?: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  resolvedAt?: string | null;
  closedAt?: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customer?: { username: string } | null;
  assignedToId?: string | null;
  assignedToName?: string | null;
  estimatedRepair?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationTag?: string | null;
  category?: { id: string; name: string; color: string | null } | null;
}

const STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'];
const PRIORITIES: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

/** wa.me wants the number in international form without the plus. */
function waLink(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits.startsWith('0') ? `62${digits.slice(1)}` : digits}`;
}

const FIELD = 'w-full min-h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary';

export default function AdminTicketDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const ticketId = params.id as string;
  const queryClient = useQueryClient();

  const ticketQueryKey = buildQueryKey('/api/tickets', { id: ticketId });
  const messagesQueryKey = buildQueryKey('/api/tickets/messages', { ticketId, includeInternal: true });

  const { data: ticketData, isLoading: loading } = useApiQuery<TicketDetail[]>('/api/tickets', {
    params: { id: ticketId },
    enabled: !!ticketId,
  });
  const ticket = Array.isArray(ticketData) && ticketData.length > 0 ? ticketData[0] : null;

  const { data: messagesData, isLoading: messagesLoading } = useApiQuery<ThreadMessage[]>('/api/tickets/messages', {
    params: { ticketId, includeInternal: true },
    enabled: !!ticketId,
    // Replies and photos from the customer or a technician show up without reloading the page.
    refetchInterval: 15000,
  });
  const messages = messagesData || [];

  const [status, setStatus] = useState<TicketStatus>('OPEN');
  const [priority, setPriority] = useState<TicketPriority>('MEDIUM');
  const [eta, setEta] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ticket) return;
    setStatus(ticket.status);
    setPriority(ticket.priority);
    setEta(ticket.estimatedRepair || '');
  }, [ticket]);

  const dirty = !!ticket && (status !== ticket.status || priority !== ticket.priority || eta.trim() !== (ticket.estimatedRepair || ''));

  const saveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !dirty) return;
    const changes: Record<string, string> = {};
    if (status !== ticket.status) changes.status = status;
    if (priority !== ticket.priority) changes.priority = priority;
    if (eta.trim() !== (ticket.estimatedRepair || '')) changes.estimatedRepair = eta.trim();
    setSaving(true);
    try {
      await apiAdmin('/api/tickets', { method: 'PUT', body: JSON.stringify({ id: ticketId, ...changes }) });
      await queryClient.invalidateQueries({ queryKey: ticketQueryKey });
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      await showSuccess('Perubahan tiket disimpan');
    } catch (error: unknown) {
      await showError((error instanceof Error ? error.message : String(error)) || t('ticket.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const sendReply = async ({ text, files, internal }: ReplyPayload) => {
    try {
      const attachments = await uploadAll(files, (form) =>
        apiAdmin<{ url?: string; error?: string }>('/api/tickets/upload', { method: 'POST', body: form }),
      );
      await apiAdmin('/api/tickets/messages', {
        method: 'POST',
        body: JSON.stringify({ ticketId, senderType: 'ADMIN', senderName: 'Admin', message: text, isInternal: internal, attachments }),
      });
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      queryClient.invalidateQueries({ queryKey: ticketQueryKey });
      return true;
    } catch (error: unknown) {
      await showError((error instanceof Error ? error.message : String(error)) || t('ticket.replyFailed'));
      return false;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Memuat tiket
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-lg font-semibold text-foreground">{t('ticket.ticketNotFound')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tiket mungkin sudah dihapus atau tautannya salah.</p>
        <Link href="/admin/tickets" className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('ticket.backToTickets')}
        </Link>
      </div>
    );
  }

  const hasCoords = ticket.latitude != null && ticket.longitude != null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href="/admin/tickets" className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Semua tiket
      </Link>

      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-mono font-medium text-foreground">#{ticket.ticketNumber}</span>
          <span className="mx-2" aria-hidden="true">·</span>
          Dibuat {formatWIB(ticket.createdAt, 'd MMM yyyy, HH:mm')}
        </p>
        <h1 className="text-xl font-semibold leading-snug text-foreground sm:text-2xl">{ticket.subject}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={ticket.status} label={t(`ticket.status_${ticket.status}`)} />
          <PriorityBadge priority={ticket.priority} withPrefix />
          {ticket.category && <CategoryBadge name={ticket.category.name} color={ticket.category.color} />}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_auto_1fr]">
        <Panel title="Pelanggan" className="lg:col-start-2 lg:row-start-1">
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <Fact label="Nama">{ticket.customerName}</Fact>
            <Fact label="Username">{ticket.customer?.username && <span className="font-mono">{ticket.customer.username}</span>}</Fact>
            <Fact label="No. HP">{ticket.customerPhone}</Fact>
            <Fact label="Email">{ticket.customerEmail}</Fact>
          </dl>
          {ticket.customerPhone && (
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`tel:${ticket.customerPhone}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted">
                <Phone className="h-4 w-4" aria-hidden="true" /> Telepon
              </a>
              <a href={waLink(ticket.customerPhone)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted">
                <MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp
              </a>
            </div>
          )}
        </Panel>

        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-span-3 lg:row-start-1">
          <Panel title={`Percakapan (${messages.length + 1})`}>
            <TicketThread
              viewer="ADMIN"
              messages={messages}
              loading={messagesLoading}
              opening={{ name: ticket.customerName, text: ticket.description, attachments: ticket.attachments, createdAt: ticket.createdAt }}
            />
          </Panel>
          {ticket.status === 'CLOSED' ? (
            <p className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
              Tiket ini ditutup. Ubah status di panel Kelola tiket untuk membalas lagi.
            </p>
          ) : (
            <ReplyComposer allowInternal onSend={sendReply} onReject={(reason) => { void showError(reason); }} />
          )}
        </div>

        <Panel title="Kelola tiket" className="lg:col-start-2 lg:row-start-2">
          <form onSubmit={saveChanges} className="space-y-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              <label className="block text-xs text-muted-foreground">
                Status
                <select value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)} className={`${FIELD} mt-1`}>
                  {STATUSES.map((s) => <option key={s} value={s}>{t(`ticket.status_${s}`)}</option>)}
                </select>
              </label>
              <label className="block text-xs text-muted-foreground">
                Prioritas
                <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} className={`${FIELD} mt-1`}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{t(`ticket.priority_${p}`)}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-xs text-muted-foreground">
              Perkiraan perbaikan
              <input value={eta} onChange={(e) => setEta(e.target.value)} placeholder="Contoh: hari ini pukul 15.00" className={`${FIELD} mt-1`} />
            </label>
            <button
              type="submit"
              disabled={!dirty || saving}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {dirty ? 'Simpan perubahan' : 'Tidak ada perubahan'}
            </button>
          </form>
        </Panel>

        <Panel title="Detail" className="lg:col-start-2 lg:row-start-3 lg:self-start">
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <Fact label="Ditangani">{ticket.assignedToId ? ticket.assignedToName || 'Petugas' : 'Belum ada'}</Fact>
            <Fact label="Kategori">{ticket.category?.name}</Fact>
            <Fact label="Perkiraan perbaikan">{ticket.estimatedRepair}</Fact>
            <Fact label="Selesai">{ticket.resolvedAt ? formatWIB(ticket.resolvedAt, 'd MMM yyyy, HH:mm') : null}</Fact>
            <Fact label="Lokasi">{ticket.locationTag}</Fact>
          </dl>
          {hasCoords && (
            <a
              href={`https://maps.google.com/?q=${ticket.latitude},${ticket.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted"
            >
              <MapPin className="h-4 w-4" aria-hidden="true" /> Buka di Google Maps
            </a>
          )}
        </Panel>
      </div>
    </div>
  );
}
