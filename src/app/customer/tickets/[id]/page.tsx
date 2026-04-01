'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { ArrowLeft, Send, User, Clock } from 'lucide-react';
import { formatWIB } from '@/lib/timezone';

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
  }, [ticketId, router]);

  const fetchTicket = async () => {
    try {
      const token = localStorage.getItem('customer_token');
      const res = await fetch(`/api/tickets?id=${ticketId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          setTicket(data[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch ticket:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/tickets/messages?ticketId=${ticketId}&includeInternal=false`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
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
      const res = await fetch('/api/tickets/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          senderType: 'CUSTOMER',
          senderName,
          message: replyText,
          isInternal: false,
        }),
      });

      if (res.ok) {
        setReplyText('');
        fetchMessages();
        toast('success', t('ticket.replySent') || 'Balasan terkirim');
      } else {
        toast('error', t('ticket.replyFailed'));
      }
    } catch (error) {
      console.error('Failed to send reply:', error);
      toast('error', t('ticket.replyFailed'));
    } finally {
      setSending(false);
    }
  };

  const getStatusColor = (status: TicketStatus) => {
    const colors = {
      OPEN: 'bg-blue-100 text-blue-800',
      IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
      WAITING_CUSTOMER: 'bg-purple-100 text-purple-800',
      RESOLVED: 'bg-green-100 text-green-800',
      CLOSED: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || colors.OPEN;
  };

  const getPriorityColor = (priority: TicketPriority) => {
    const colors = {
      LOW: 'bg-gray-100 text-gray-600',
      MEDIUM: 'bg-teal-100 text-teal-600',
      HIGH: 'bg-orange-100 text-orange-600',
      URGENT: 'bg-red-100 text-red-600',
    };
    return colors[priority] || colors.MEDIUM;
  };

  const getSenderBadgeColor = (senderType: SenderType) => {
    const colors = {
      CUSTOMER: 'bg-cyan-100 text-cyan-800',
      ADMIN: 'bg-teal-100 text-teal-800',
      TECHNICIAN: 'bg-green-100 text-green-800',
      SYSTEM: 'bg-gray-100 text-gray-600',
    };
    return colors[senderType] || colors.SYSTEM;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {t('ticket.ticketNotFound')}
          </h2>
          <Link
            href="/customer/tickets"
            className="text-teal-600 hover:text-teal-700"
          >
            {t('ticket.backToTickets')}
          </Link>
        </div>
      </div>
    );
  }

  const isClosed = ticket.status === 'CLOSED';

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
        <div className="flex items-center gap-3 mb-3">
          <Link
            href="/customer/tickets"
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <ArrowLeft size={22} />
          </Link>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
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
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
              {ticket.subject}
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {t('ticket.created')}: {formatWIB(ticket.createdAt, 'd MMM yyyy HH:mm')}
            </p>
          </div>
        </div>
      </div>

      {/* Initial Description */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-2">
          {t('ticket.description')}
        </h3>
        <p className="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap">
          {ticket.description}
        </p>
        </div>

      {/* Messages */}
      <div className="space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`bg-white dark:bg-gray-900 rounded-lg border p-3 ${
              msg.senderType === 'SYSTEM' 
                ? 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800' 
                : 'border-gray-200 dark:border-gray-800'
            }`}
          >
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center">
                  <User size={16} className="text-teal-600 dark:text-teal-400" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-gray-900 dark:text-white text-sm">
                    {msg.senderName}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSenderBadgeColor(msg.senderType)}`}>
                    {t(`ticket.senderType_${msg.senderType}`)}
                  </span>
                  <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Clock size={12} />
                      {formatWIB(msg.createdAt, 'd MMM HH:mm')}
                    </div>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap">
                    {msg.message}
                  </p>
                </div>
              </div>
          </div>
        ))}
      </div>

      {/* Reply Form */}
      {!isClosed && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-3">
            {t('ticket.addReply')}
          </h3>
          <form onSubmit={handleReply}>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={4}
              className="w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent mb-3"
              placeholder={t('ticket.replyPlaceholder')}
              disabled={sending}
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={sending || !replyText.trim()}
                className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
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
              </button>
            </div>
          </form>
        </div>
      )}

      {isClosed && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-center">
          <p className="text-yellow-800 dark:text-yellow-200 text-sm">
            {t('ticket.ticketClosed')}
          </p>
        </div>
      )}
    </div>
  );
}
