'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

function renderWithLinks(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline break-all hover:text-blue-400">
        {part}
      </a>
    ) : (
      part
    ),
  );
}
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import { showSuccess, showError } from '@/lib/sweetalert';
import { ArrowLeft, Send, User, Clock, Lock, MessageCircle, Edit2, Save } from 'lucide-react';
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
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  assignedToId?: string;
  assignedToType?: string;
  category?: {
    id: string;
    name: string;
    color: string;
  };
}

export default function AdminTicketDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  
  // Quick actions state
  const [editingStatus, setEditingStatus] = useState(false);
  const [editingPriority, setEditingPriority] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<TicketStatus>('OPEN');
  const [selectedPriority, setSelectedPriority] = useState<TicketPriority>('MEDIUM');

  useEffect(() => {
    if (ticketId) {
      fetchTicket();
      fetchMessages();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const fetchTicket = async () => {
    try {
      const res = await fetch(`/api/tickets?id=${ticketId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          setTicket(data[0]);
          setSelectedStatus(data[0].status);
          setSelectedPriority(data[0].priority);
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
      const res = await fetch(`/api/tickets/messages?ticketId=${ticketId}&includeInternal=true`);
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

    setSending(true);
    try {
      const res = await fetch('/api/tickets/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          senderType: 'ADMIN',
          senderName: 'Admin',
          message: replyText,
          isInternal,
        }),
      });

      if (res.ok) {
        setReplyText('');
        setIsInternal(false);
        fetchMessages();
        fetchTicket(); // Update lastResponseAt
        await showSuccess(t('ticket.replySent') || 'Reply sent successfully');
      } else {
        await showError(t('ticket.replyFailed'));
      }
    } catch (error) {
      console.error('Failed to send reply:', error);
      await showError(t('ticket.replyFailed'));
    } finally {
      setSending(false);
    }
  };

  const handleUpdateStatus = async () => {
    try {
      const res = await fetch('/api/tickets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: ticketId,
          status: selectedStatus,
        }),
      });

      if (res.ok) {
        fetchTicket();
        setEditingStatus(false);
        await showSuccess(t('ticket.statusUpdated') || 'Status updated successfully');
      } else {
        await showError(t('ticket.updateFailed'));
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      await showError(t('ticket.updateFailed'));
    }
  };

  const handleUpdatePriority = async () => {
    try {
      const res = await fetch('/api/tickets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: ticketId,
          priority: selectedPriority,
        }),
      });

      if (res.ok) {
        fetchTicket();
        setEditingPriority(false);
        await showSuccess(t('ticket.priorityUpdated') || 'Priority updated successfully');
      } else {
        await showError(t('ticket.updateFailed'));
      }
    } catch (error) {
      console.error('Failed to update priority:', error);
      await showError(t('ticket.updateFailed'));
    }
  };

  const getStatusColor = (status: TicketStatus) => {
    const colors = {
      OPEN: 'bg-info/10 text-info',
      IN_PROGRESS: 'bg-primary/10 text-primary',
      WAITING_CUSTOMER: 'bg-warning/10 text-warning',
      RESOLVED: 'bg-success/10 text-success',
      CLOSED: 'bg-muted text-muted-foreground',
    };
    return colors[status] || colors.OPEN;
  };

  const getPriorityColor = (priority: TicketPriority) => {
    const colors = {
      LOW: 'bg-muted text-muted-foreground',
      MEDIUM: 'bg-primary/10 text-primary',
      HIGH: 'bg-warning/10 text-warning',
      URGENT: 'bg-destructive/10 text-destructive',
    };
    return colors[priority] || colors.MEDIUM;
  };

  const getSenderBadgeColor = (senderType: SenderType) => {
    const colors = {
      CUSTOMER: 'bg-info/10 text-info',
      ADMIN: 'bg-primary/10 text-primary',
      TECHNICIAN: 'bg-success/10 text-success',
      SYSTEM: 'bg-muted text-muted-foreground',
    };
    return colors[senderType] || colors.SYSTEM;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 dark:border-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10"></div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-lg sm:text-2xl font-bold text-foreground mb-2">
          {t('ticket.ticketNotFound')}
        </h2>
        <Link href="/admin/tickets" className="text-primary hover:text-primary/80">
          {t('ticket.backToTickets')}
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/tickets" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={24} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-lg font-mono text-muted-foreground">#{ticket.ticketNumber}</span>
            
            {/* Status - Editable */}
            {editingStatus ? (
              <div className="flex items-center gap-2">
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as TicketStatus)}
                  className="border border-border rounded px-2 py-1 text-sm bg-background text-foreground"
                >
                  <option value="OPEN">{t('ticket.status_OPEN')}</option>
                  <option value="IN_PROGRESS">{t('ticket.status_IN_PROGRESS')}</option>
                  <option value="WAITING_CUSTOMER">{t('ticket.status_WAITING_CUSTOMER')}</option>
                  <option value="RESOLVED">{t('ticket.status_RESOLVED')}</option>
                  <option value="CLOSED">{t('ticket.status_CLOSED')}</option>
                </select>
                <button
                  onClick={handleUpdateStatus}
                  className="text-green-600 hover:text-green-700"
                >
                  <Save size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingStatus(true)}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}
              >
                {t(`ticket.status_${ticket.status}`)}
                <Edit2 size={12} />
              </button>
            )}

            {/* Priority - Editable */}
            {editingPriority ? (
              <div className="flex items-center gap-2">
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value as TicketPriority)}
                  className="border border-border rounded px-2 py-1 text-sm bg-background text-foreground"
                >
                  <option value="LOW">{t('ticket.priority_LOW')}</option>
                  <option value="MEDIUM">{t('ticket.priority_MEDIUM')}</option>
                  <option value="HIGH">{t('ticket.priority_HIGH')}</option>
                  <option value="URGENT">{t('ticket.priority_URGENT')}</option>
                </select>
                <button
                  onClick={handleUpdatePriority}
                  className="text-green-600 hover:text-green-700"
                >
                  <Save size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingPriority(true)}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}
              >
                {t(`ticket.priority_${ticket.priority}`)}
                <Edit2 size={12} />
              </button>
            )}

            {ticket.category && (
              <span
                className="px-3 py-1 rounded-full text-xs font-medium text-foreground"
                style={{ backgroundColor: ticket.category.color }}
              >
                {ticket.category.name}
              </span>
            )}
          </div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground">{ticket.subject}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Ticket Info */}
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <h3 className="font-semibold text-foreground mb-3">
              {t('ticket.description')}
            </h3>
            <p className="text-foreground/80 whitespace-pre-wrap mb-4">
              {renderWithLinks(ticket.description)}
            </p>
            <div className="border-t border-border pt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('ticket.customer')}:</span>
                  <p className="font-medium text-foreground">{ticket.customerName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('ticket.customerPhone')}:</span>
                  <p className="font-medium text-foreground">{ticket.customerPhone}</p>
                </div>
                {ticket.customerEmail && (
                  <div>
                    <span className="text-muted-foreground">{t('ticket.customerEmail')}:</span>
                    <p className="font-medium text-foreground">{ticket.customerEmail}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">{t('ticket.created')}:</span>
                  <p className="font-medium text-foreground">
                    {formatWIB(ticket.createdAt, 'd MMMM yyyy HH:mm')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t('ticket.conversation')}</h3>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-lg shadow-sm border p-4 ${
                  msg.isInternal
                    ? 'bg-warning/10 border-warning/30'
                    : msg.senderType === 'SYSTEM'
                    ? 'bg-muted border-border'
                    : 'bg-card border-border'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      msg.isInternal ? 'bg-warning/20' : 'bg-primary/10'
                    }`}>
                      {msg.isInternal ? <Lock size={20} className="text-warning" /> : <User size={20} className="text-primary" />}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-foreground">{msg.senderName}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSenderBadgeColor(msg.senderType)}`}>
                        {t(`ticket.senderType_${msg.senderType}`)}
                      </span>
                      {msg.isInternal && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-warning/20 text-warning">
                          {t('ticket.internal')}
                        </span>
                      )}
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock size={14} />
                        {formatWIB(msg.createdAt, 'd MMM HH:mm')}
                      </div>
                    </div>
                    <p className="text-foreground/80 whitespace-pre-wrap">{renderWithLinks(msg.message)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Reply Form */}
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <h3 className="font-semibold text-foreground mb-4">{t('ticket.addReply')}</h3>
            <form onSubmit={handleReply}>
              <div className="mb-4">
                <label className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    className="rounded border-border"
                  />
                  <Lock size={16} className="text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {t('ticket.internalNote')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({t('ticket.notVisibleToCustomer')})
                  </span>
                </label>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={4}
                  className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground placeholder:text-muted-foreground"
                  placeholder={isInternal ? t('ticket.internalNotePlaceholder') : t('ticket.replyPlaceholder')}
                  disabled={sending}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={sending || !replyText.trim()}
                  className="flex items-center gap-2 bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      {t('ticket.sending')}...
                    </>
                  ) : (
                    <>
                      <Send size={20} />
                      {isInternal ? t('ticket.addInternalNote') : t('ticket.sendReply')}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar - Quick Actions */}
        <div className="space-y-6">
          <div className="bg-card rounded-lg shadow-sm border border-border p-4">
            <h3 className="font-semibold text-foreground mb-4">{t('ticket.quickActions')}</h3>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground block mb-1">{t('ticket.status')}:</span>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                  {t(`ticket.status_${ticket.status}`)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">{t('ticket.priority')}:</span>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                  {t(`ticket.priority_${ticket.priority}`)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">{t('ticket.assigned')}:</span>
                <span className="text-foreground">
                  {ticket.assignedToId ? `${ticket.assignedToType} #${ticket.assignedToId}` : t('ticket.unassigned')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
