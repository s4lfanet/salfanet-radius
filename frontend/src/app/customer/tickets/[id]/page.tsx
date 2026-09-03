'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { ArrowLeft, Send, User, Clock } from 'lucide-react';
import { formatWIB } from '@/lib/timezone';
import { apiCustomer, ApiError } from '@/lib/api';
import { CyberCard } from '@/components/cyberpunk/CyberCard';
import { CyberButton } from '@/components/cyberpunk/CyberButton';

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type SenderType = 'CUSTOMER' | 'ADMIN' | 'TECHNICIAN' | 'SYSTEM';

interface Message {
  id: string;
  senderType: SenderType;
  senderName: string;
  message: string;
  createdAt: string;
  isInternal: boolean;
}

interface TicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  category?: {
    name: string;
    color: string;
  };
}

export default function TicketDetailPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const toast = (type: 'success' | 'error' | 'info', msg: string) =>
    addToast({ type, title: type === 'success' ? 'Berhasil' : 'Gagal', description: msg, duration: type === 'error' ? 8000 : 5000 });
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // Check auth
    const token = localStorage.getItem('customer_token');
    if (!token) {
      router.push('/customer/login');
      return;
    }
    
    if (ticketId) {
      fetchTicket();
      fetchMessages();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, router]);

  const fetchTicket = async () => {
    try {
      const data = await apiCustomer<TicketDetail[]>(`/api/tickets?id=${ticketId}`);
      if (data.length > 0) {
        setTicket(data[0]);
      }
    } catch (error) {
      console.error('Failed to fetch ticket:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    try {
      const data = await apiCustomer<Message[]>(`/api/tickets/messages?ticketId=${ticketId}&includeInternal=false`);
      setMessages(data);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!replyText.trim()) return;

    // Get customer name from session
    let senderName = 'Customer';
    const userData = localStorage.getItem('customer_user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        senderName = user.name || user.username;
      } catch (error) {
        console.error('Failed to parse user data:', error);
      }
    }

    setSending(true);
    try {
      await apiCustomer('/api/tickets/messages', {
        method: 'POST',
        body: JSON.stringify({
          ticketId,
          senderType: 'CUSTOMER',
          senderName,
          message: replyText,
          isInternal: false,
        }),
      });

      setReplyText('');
      fetchMessages();
      toast('success', t('ticket.replySent') || 'Balasan terkirim');
    } catch (error) {
      console.error('Failed to send reply:', error);
      if (error instanceof ApiError) toast('error', error.message || t('ticket.replyFailed'));
      else toast('error', t('ticket.replyFailed'));
    } finally {
      setSending(false);
    }
  };

  const getStatusColor = (status: TicketStatus) => {
    const colors = {
      OPEN: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
      IN_PROGRESS: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
      WAITING_CUSTOMER: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
      RESOLVED: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
      CLOSED: 'bg-muted text-muted-foreground border border-border',
    };
    return colors[status] || colors.OPEN;
  };

  const getPriorityColor = (priority: TicketPriority) => {
    const colors = {
      LOW: 'bg-muted text-muted-foreground border border-border',
      MEDIUM: 'bg-teal-500/15 text-teal-400 border border-teal-500/30',
      HIGH: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
      URGENT: 'bg-red-500/15 text-red-400 border border-red-500/30',
    };
    return colors[priority] || colors.MEDIUM;
  };

  const getSenderBadgeColor = (senderType: SenderType) => {
    const colors = {
      CUSTOMER: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30',
      ADMIN: 'bg-teal-500/15 text-teal-400 border border-teal-500/30',
      TECHNICIAN: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
      SYSTEM: 'bg-muted text-muted-foreground border border-border',
    };
    return colors[senderType] || colors.SYSTEM;
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            {t('ticket.ticketNotFound')}
          </h2>
          <Link
            href="/customer/tickets"
            className="text-cyan-400 hover:text-cyan-300"
          >
            {t('ticket.backToTickets')}
          </Link>
        </div>
      </div>
    );
  }

  const isClosed = ticket.status === 'CLOSED';

  return (
    <div className="p-3 lg:p-5 space-y-3 w-full">
      {/* Header */}
      <CyberCard className="p-3">
        <div className="flex items-center gap-3 mb-3">
          <Link
            href="/customer/tickets"
            className="text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            <ArrowLeft size={22} />
          </Link>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-sm font-mono text-muted-foreground">
                #{ticket.ticketNumber}
              </span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                  {t(`ticket.status_${ticket.status}`)}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                  {t(`ticket.priority_${ticket.priority}`)}
                </span>
                {ticket.category && (
                  <span
                    className="px-3 py-1 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: ticket.category.color }}
                  >
                    {ticket.category.name}
                  </span>
                )}
            </div>
            <h2 className="text-lg font-bold text-foreground mb-1">
              {ticket.subject}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t('ticket.created')}: {formatWIB(ticket.createdAt, 'd MMM yyyy HH:mm')}
            </p>
          </div>
        </div>
      </CyberCard>

      {/* Initial Description */}
      <CyberCard className="p-4">
        <h3 className="font-semibold text-foreground text-sm mb-2">
          {t('ticket.description')}
        </h3>
        <p className="text-foreground/80 text-sm whitespace-pre-wrap">
          {ticket.description}
        </p>
      </CyberCard>

      {/* Messages */}
      <div className="space-y-3">
        {messages.map((msg) => (
          <CyberCard
            key={msg.id}
            className={`p-3 ${msg.senderType === 'SYSTEM' ? 'bg-muted/50' : ''}`}
          >
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
                  <User size={16} className="text-cyan-400" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-foreground text-sm">
                    {msg.senderName}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSenderBadgeColor(msg.senderType)}`}>
                    {t(`ticket.senderType_${msg.senderType}`)}
                  </span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock size={12} />
                      {formatWIB(msg.createdAt, 'd MMM HH:mm')}
                    </div>
                  </div>
                  <p className="text-foreground/80 text-sm whitespace-pre-wrap">
                    {msg.message}
                  </p>
                </div>
              </div>
          </CyberCard>
        ))}
      </div>

      {/* Reply Form */}
      {!isClosed && (
        <CyberCard className="p-4">
          <h3 className="font-semibold text-foreground text-sm mb-3">
            {t('ticket.addReply')}
          </h3>
          <form onSubmit={handleReply}>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={4}
              className="w-full bg-background dark:bg-slate-900/50 border border-cyan-500/30 text-foreground placeholder:text-muted-foreground/50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all mb-3"
              placeholder={t('ticket.replyPlaceholder')}
              disabled={sending}
            />
            <div className="flex justify-end">
              <CyberButton
                type="submit"
                disabled={sending || !replyText.trim()}
                variant="cyan"
                className="flex items-center gap-2 px-4 py-2 text-sm"
              >
                {sending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    {t('ticket.sending')}...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    {t('ticket.sendReply')}
                  </>
                )}
              </CyberButton>
            </div>
          </form>
        </CyberCard>
      )}

      {isClosed && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-center">
          <p className="text-amber-400 text-sm">
            {t('ticket.ticketClosed')}
          </p>
        </div>
      )}
    </div>
  );
}

