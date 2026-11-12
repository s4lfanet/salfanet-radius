'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, MapPin } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { formatWIB } from '@/lib/timezone';
import { apiCustomer, ApiError } from '@/lib/api';
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
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  resolvedAt?: string | null;
  customerName: string;
  estimatedRepair?: string | null;
  assignedToId?: string | null;
  assignedToName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationTag?: string | null;
  attachments?: string | null;
  category?: { name: string; color: string | null } | null;
}

/** What the customer can expect next, said in their terms. */
const STATUS_HINT: Record<TicketStatus, string> = {
  OPEN: 'Laporan Anda sudah kami terima dan menunggu ditangani petugas.',
  IN_PROGRESS: 'Petugas sedang menangani laporan Anda.',
  WAITING_CUSTOMER: 'Petugas menunggu jawaban Anda. Balas di bawah agar penanganan bisa dilanjutkan.',
  RESOLVED: 'Petugas menandai masalah ini selesai. Balas jika masalah masih terjadi.',
  CLOSED: 'Tiket ini sudah ditutup. Buat tiket baru jika ada masalah lain.',
};

export default function TicketDetailPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);

  const fail = useCallback(
    (msg: string) => addToast({ type: 'error', title: 'Gagal', description: msg, duration: 8000 }),
    [addToast],
  );

  const fetchTicket = useCallback(async () => {
    try {
      const data = await apiCustomer<TicketDetail[]>(`/api/tickets?id=${encodeURIComponent(ticketId)}`);
      setTicket(data.length > 0 ? data[0] : null);
    } catch (error) {
      console.error('Failed to fetch ticket:', error);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await apiCustomer<ThreadMessage[]>(`/api/tickets/messages?ticketId=${encodeURIComponent(ticketId)}&includeInternal=false`);
      setMessages(data);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setMessagesLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    if (!localStorage.getItem('customer_token')) {
      router.push('/customer/login');
      return;
    }
    if (!ticketId) return;
    void fetchTicket();
    void fetchMessages();
    // A reply from staff, with its photos, shows up without reloading the page; the status can change with it.
    const timer = setInterval(() => { void fetchMessages(); void fetchTicket(); }, 20000);
    return () => clearInterval(timer);
  }, [ticketId, router, fetchTicket, fetchMessages]);

  const sendReply = async ({ text, files }: ReplyPayload) => {
    let senderName = ticket?.customerName || 'Pelanggan';
    try {
      const user = JSON.parse(localStorage.getItem('customer_user') || '{}');
      senderName = user.name || user.username || senderName;
    } catch {
      // keep the name from the ticket
    }
    try {
      const attachments = await uploadAll(files, (form) =>
        apiCustomer<{ url?: string; error?: string }>('/api/customer/tickets/upload', { method: 'POST', body: form }),
      );
      await apiCustomer('/api/tickets/messages', {
        method: 'POST',
        body: JSON.stringify({ ticketId, senderType: 'CUSTOMER', senderName, message: text, isInternal: false, attachments }),
      });
      await fetchMessages();
      return true;
    } catch (error) {
      fail(error instanceof ApiError || error instanceof Error ? error.message : t('ticket.replyFailed'));
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
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-foreground">{t('ticket.ticketNotFound')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tiket mungkin sudah dihapus atau tautannya salah.</p>
        <Link href="/customer/tickets" className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('ticket.backToTickets')}
        </Link>
      </div>
    );
  }

  const isClosed = ticket.status === 'CLOSED';
  const hasCoords = ticket.latitude != null && ticket.longitude != null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-3 lg:p-5">
      <Link href="/customer/tickets" className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Tiket saya
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
        <p className="text-sm text-muted-foreground">{STATUS_HINT[ticket.status]}</p>
        {ticket.estimatedRepair && !isClosed && ticket.status !== 'RESOLVED' && (
          <p className="text-sm text-foreground">
            Perkiraan perbaikan: <span className="font-medium">{ticket.estimatedRepair}</span>
          </p>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="min-w-0 space-y-4">
          <Panel title="Percakapan">
            <TicketThread
              viewer="CUSTOMER"
              messages={messages}
              loading={messagesLoading}
              opening={{ name: ticket.customerName, text: ticket.description, attachments: ticket.attachments, createdAt: ticket.createdAt }}
            />
          </Panel>
          {isClosed ? (
            <p className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">{t('ticket.ticketClosed')}</p>
          ) : (
            <ReplyComposer onSend={sendReply} onReject={fail} />
          )}
        </div>

        <Panel title="Ringkasan">
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <Fact label="Ditangani">{ticket.assignedToId ? ticket.assignedToName || 'Petugas' : 'Belum ada petugas'}</Fact>
            <Fact label="Perkiraan perbaikan">{ticket.estimatedRepair}</Fact>
            <Fact label="Kategori">{ticket.category?.name}</Fact>
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
