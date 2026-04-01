'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import { Ticket, MessageSquare, Plus, Filter } from 'lucide-react';
import { CyberCard, CyberButton } from '@/components/cyberpunk';
import { formatWIB } from '@/lib/timezone';

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface TicketItem {
  id: string;
  ticketNumber: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  category?: {
    name: string;
    color: string;
  };
  _count: {
    messages: number;
  };
}

export default function CustomerTicketsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [customerId, setCustomerId] = useState<string | null>(null);

  useEffect(() => {
    // Check auth and get customer ID
    const token = localStorage.getItem('customer_token');
    const userData = localStorage.getItem('customer_user');
    
    if (!token || !userData) {
      router.push('/customer/login');
      return;
    }
    
    try {
      const user = JSON.parse(userData);
      setCustomerId(user.id);
    } catch (error) {
      router.push('/customer/login');
    }
  }, [router]);

  useEffect(() => {
    if (customerId) {
      fetchTickets();
    }
  }, [statusFilter, customerId]);

  const fetchTickets = async () => {
    if (!customerId) return;
    
    try {
      setLoading(true);
      const token = localStorage.getItem('customer_token');
      const params = new URLSearchParams();
      params.append('customerId', customerId);
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      
      const res = await fetch(`/api/tickets?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data);
      }
    } catch (error) {
      console.error('Failed to fetch tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: TicketStatus) => {
    const colors = {
      OPEN: 'bg-accent/20 text-accent border border-accent/40 shadow-[0_0_5px_rgba(0,247,255,0.3)]',
      IN_PROGRESS: 'bg-primary/20 text-primary border border-primary/40 shadow-[0_0_5px_rgba(188,19,254,0.3)]',
      WAITING_CUSTOMER: 'bg-warning/20 text-warning border border-warning/40 shadow-[0_0_5px_rgba(255,170,0,0.3)]',
      RESOLVED: 'bg-success/20 text-success border border-success/40 shadow-[0_0_5px_rgba(0,255,136,0.3)]',
      CLOSED: 'bg-muted text-muted-foreground border border-border',
    };
    return colors[status] || colors.OPEN;
  };

  const getPriorityColor = (priority: TicketPriority) => {
    const colors = {
      LOW: 'bg-muted text-muted-foreground border border-border',
      MEDIUM: 'bg-primary/20 text-primary border border-primary/40',
      HIGH: 'bg-warning/20 text-warning border border-warning/40',
      URGENT: 'bg-destructive/20 text-destructive border border-destructive/40 shadow-[0_0_5px_rgba(255,51,102,0.3)]',
    };
    return colors[priority] || colors.MEDIUM;
  };

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-primary uppercase tracking-wider drop-shadow-[0_0_8px_rgba(188,19,254,0.6)]">
            {t('ticket.myTickets')}
          </h1>
          <p className="text-sm text-accent/70 mt-0.5">
            {t('ticket.manageYourTickets')}
          </p>
        </div>
        <CyberButton
          onClick={() => router.push('/customer/tickets/create')}
          size="sm"
          className="flex items-center gap-1.5"
        >
          <Plus size={18} />
          <span className="hidden sm:inline">{t('common.create')}</span>
        </CyberButton>
      </div>

      <div>
        {/* Filters */}
        <CyberCard className="p-4 mb-6 bg-card/80 backdrop-blur-xl border-2 border-primary/30">
          <div className="flex items-center gap-4">
            <Filter size={20} className="text-accent drop-shadow-[0_0_5px_rgba(0,247,255,0.5)]" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border-2 border-primary/30 bg-input rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
            >
              <option value="all">{t('ticket.allStatus')}</option>
              <option value="OPEN">{t('ticket.status_OPEN')}</option>
              <option value="IN_PROGRESS">{t('ticket.status_IN_PROGRESS')}</option>
              <option value="WAITING_CUSTOMER">{t('ticket.status_WAITING_CUSTOMER')}</option>
              <option value="RESOLVED">{t('ticket.status_RESOLVED')}</option>
              <option value="CLOSED">{t('ticket.status_CLOSED')}</option>
            </select>
          </div>
        </CyberCard>

        {/* Tickets List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto shadow-[0_0_15px_rgba(188,19,254,0.5)]"></div>
            <p className="text-accent mt-4">{t('ticket.loading')}</p>
          </div>
        ) : tickets.length === 0 ? (
          <CyberCard className="p-12 text-center bg-card/80 backdrop-blur-xl border-2 border-primary/30">
            <Ticket size={48} className="text-primary mx-auto mb-4 drop-shadow-[0_0_10px_rgba(188,19,254,0.5)]" />
            <h3 className="text-lg font-bold text-primary mb-2 uppercase tracking-wider">
              {t('ticket.noTickets')}
            </h3>
            <p className="text-muted-foreground mb-6">
              {t('ticket.noTicketsDescription')}
            </p>
            <CyberButton
              onClick={() => router.push('/customer/tickets/create')}
              className="inline-flex items-center gap-2"
            >
              <Plus size={20} />
              {t('ticket.createFirstTicket')}
            </CyberButton>
          </CyberCard>
        ) : (
          <div className="space-y-4">
            {tickets.map((ticket) => (
              <CyberCard
                key={ticket.id}
                onClick={() => router.push(`/customer/tickets/${ticket.id}`)}
                className="p-6 cursor-pointer bg-card/80 backdrop-blur-xl border-2 border-primary/30 hover:border-accent/50 hover:shadow-[0_0_30px_rgba(0,247,255,0.2)] transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="text-sm font-mono text-accent font-bold">
                        #{ticket.ticketNumber}
                      </span>
                      <span className={`px-3 py-1 rounded-lg text-xs font-bold ${getStatusColor(ticket.status)}`}>
                        {t(`ticket.status_${ticket.status}`)}
                      </span>
                      <span className={`px-3 py-1 rounded-lg text-xs font-bold ${getPriorityColor(ticket.priority)}`}>
                        {t(`ticket.priority_${ticket.priority}`)}
                      </span>
                      {ticket.category && (
                        <span
                          className="px-3 py-1 rounded-lg text-xs font-bold text-white border"
                          style={{ backgroundColor: ticket.category.color, borderColor: ticket.category.color }}
                        >
                          {ticket.category.name}
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">
                      {ticket.subject}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MessageSquare size={16} className="text-accent" />
                        <span>{ticket._count.messages} {t('ticket.messages')}</span>
                      </div>
                      <span>
                        {t('ticket.created')}: {formatWIB(ticket.createdAt, 'd MMM yyyy HH:mm')}
                      </span>
                    </div>
                  </div>
                </div>
              </CyberCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
