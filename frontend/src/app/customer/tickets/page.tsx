'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, MessageSquare, Plus, Ticket } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB } from '@/lib/timezone';
import { apiCustomer } from '@/lib/api';
import { CategoryBadge, PriorityBadge, StatusBadge, type TicketPriority, type TicketStatus } from '@/components/tickets/ticket-ui';

interface TicketItem {
  id: string;
  ticketNumber: string;
  subject: string;
  description?: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt?: string;
  category?: { name: string; color: string | null } | null;
  _count: { messages: number };
}

const FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'OPEN', label: 'ticket.status_OPEN' },
  { value: 'IN_PROGRESS', label: 'ticket.status_IN_PROGRESS' },
  { value: 'WAITING_CUSTOMER', label: 'ticket.status_WAITING_CUSTOMER' },
  { value: 'RESOLVED', label: 'ticket.status_RESOLVED' },
  { value: 'CLOSED', label: 'ticket.status_CLOSED' },
];

export default function CustomerTicketsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('customer_token');
    const userData = localStorage.getItem('customer_user');
    if (!token || !userData) {
      router.push('/customer/login');
      return;
    }
    try {
      setCustomerId(JSON.parse(userData).id);
    } catch {
      router.push('/customer/login');
    }
  }, [router]);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const params = new URLSearchParams({ customerId });
        if (statusFilter !== 'all') params.append('status', statusFilter);
        const data = await apiCustomer<TicketItem[]>(`/api/tickets?${params.toString()}`);
        if (!cancelled) setTickets(data);
      } catch (error) {
        console.error('Failed to fetch tickets:', error);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [statusFilter, customerId, attempt]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-3 lg:p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">{t('ticket.myTickets')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('ticket.manageYourTickets')}</p>
        </div>
        <Link
          href="/customer/tickets/create"
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Buat tiket
        </Link>
      </header>

      <div role="tablist" aria-label="Saring status" className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-1 lg:mx-0 lg:px-0">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            role="tab"
            aria-selected={statusFilter === f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`min-h-9 shrink-0 rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              statusFilter === f.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {f.value === 'all' ? f.label : t(f.label)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> {t('ticket.loading')}
        </div>
      ) : failed ? (
        <div className="rounded-xl border border-border bg-card px-4 py-10 text-center">
          <p className="text-sm font-medium text-foreground">Daftar tiket gagal dimuat.</p>
          <p className="mt-1 text-sm text-muted-foreground">Periksa koneksi internet, lalu coba lagi.</p>
          <button onClick={() => setAttempt((n) => n + 1)} className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-muted">Coba lagi</button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center">
          <Ticket className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">
            {statusFilter === 'all' ? t('ticket.noTickets') : 'Tidak ada tiket dengan status ini.'}
          </p>
          {statusFilter === 'all' && (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Ada gangguan internet atau pertanyaan tagihan? Laporkan lewat tiket.</p>
              <Link href="/customer/tickets/create" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4" aria-hidden="true" /> {t('ticket.createFirstTicket')}
              </Link>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/customer/tickets/${ticket.id}`}
                className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono font-medium text-foreground">#{ticket.ticketNumber}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      {formatWIB(ticket.createdAt, 'd MMM yyyy, HH:mm')}
                    </p>
                    <h2 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-foreground">{ticket.subject}</h2>
                  </div>
                  <StatusBadge status={ticket.status} label={t(`ticket.status_${ticket.status}`)} />
                </div>
                {ticket.description && <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{ticket.description}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <PriorityBadge priority={ticket.priority} withPrefix />
                  {ticket.category && <CategoryBadge name={ticket.category.name} color={ticket.category.color} />}
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> {ticket._count.messages} balasan
                  </span>
                  {ticket.updatedAt && <span>Diperbarui {formatWIB(ticket.updatedAt, 'd MMM, HH:mm')}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
