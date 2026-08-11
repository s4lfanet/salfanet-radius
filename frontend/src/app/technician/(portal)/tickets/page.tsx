'use client';

export const dynamic = 'force-dynamic';

function renderWithLinks(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline break-all hover:text-blue-300">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Ticket,
  Search,
  Filter,
  RefreshCcw,
  Loader2,
  MessageSquare,
  CheckCircle2,
  Clock,
  Play,
  X,
  Send,
  User,
  Phone,
  Tag,
  Eye,
  Camera,
  MapPin,
  Calendar,
  Hash,
} from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { formatWIB } from '@/lib/timezone';
import { useTranslation } from '@/hooks/useTranslation';

interface TicketData {
  id: string;
  ticketNumber: string;
  customerName: string;
  customerPhone: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  assignedToId: string | null;
  assignedToType: string | null;
  createdAt: string;
  resolvedAt: string | null;
  category: { id: string; name: string; color: string | null } | null;
  customer: { id: string; username: string; name: string; phone: string } | null;
  _count: { messages: number };
}

interface TicketMessage {
  id: string;
  ticketId: string;
  senderType: string;
  senderId: string | null;
  senderName: string;
  message: string;
  attachments: string | null;
  isInternal: boolean;
  createdAt: string;
}

const PRIORITY_STYLE: Record<string, string> = {
  URGENT: 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 border-red-300 dark:border-red-500/40',
  HIGH: 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-500/40',
  MEDIUM: 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-500/40',
  LOW: 'bg-slate-100 dark:bg-slate-500/20 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-500/40',
};

const PRIORITY_LEFT: Record<string, string> = {
  URGENT: 'border-l-red-500',
  HIGH: 'border-l-orange-500',
  MEDIUM: 'border-l-amber-500',
  LOW: 'border-l-slate-400',
};

const STATUS_STYLE: Record<string, string> = {
  OPEN: 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-500/40',
  IN_PROGRESS: 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-600 dark:text-[#00f7ff] border-cyan-300 dark:border-[#00f7ff]/40',
  WAITING_CUSTOMER: 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-500/40',
  RESOLVED: 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 border-green-300 dark:border-green-500/40',
  CLOSED: 'bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600/40',
};

function formatDate(d: string) {
  return formatWIB(d, 'dd MMM yyyy HH:mm');
}

function parseAttachments(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

export default function TechnicianTicketsPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();

  const STATUS_LABEL: Record<string, string> = {
    OPEN: t('techPortal.statusOpen'),
    IN_PROGRESS: t('techPortal.statusInProgress'),
    WAITING_CUSTOMER: t('techPortal.statusWaitingCustomer'),
    RESOLVED: t('techPortal.statusResolved'),
    CLOSED: t('techPortal.statusClosed'),
  };

  const PRIORITY_LABEL: Record<string, string> = {
    URGENT: t('techPortal.priorityUrgent'),
    HIGH: t('techPortal.priorityHigh'),
    MEDIUM: t('techPortal.priorityMedium'),
    LOW: t('techPortal.priorityLow'),
  };

  // List state
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [search, setSearch] = useState('');
  const [showMine, setShowMine] = useState(false);

  // Detail modal state
  const [detailTicket, setDetailTicket] = useState<TicketData | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Reply state
  const [replyMessage, setReplyMessage] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filterStatus) p.set('status', filterStatus);
      if (filterPriority) p.set('priority', filterPriority);
      if (search) p.set('search', search);
      if (showMine) p.set('mine', 'true');
      const res = await fetch(`/api/technician/tickets?${p}`);
      if (!res.ok) throw new Error(t('techPortal.failedLoadTickets'));
      const data = await res.json();
      setTickets(data.tickets ?? []);
    } catch {
      addToast({ type: 'error', title: t('techPortal.failedLoadTickets') });
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterPriority, search, showMine]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const loadMessages = useCallback(async (ticketId: string) => {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/tickets/messages?ticketId=${ticketId}`);
      if (!res.ok) throw new Error('Gagal memuat pesan');
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch {
      addToast({ type: 'error', title: 'Gagal memuat pesan tiket' });
    } finally {
      setMessagesLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openDetail(ticket: TicketData) {
    setDetailTicket(ticket);
    setReplyMessage('');
    setPhotoFile(null);
    setPhotoPreview(null);
    await loadMessages(ticket.id);
  }

  function closeDetail() {
    setDetailTicket(null);
    setMessages([]);
    setReplyMessage('');
    setPhotoFile(null);
    setPhotoPreview(null);
  }

  async function doAction(ticketId: string, action: string, extra?: Record<string, unknown>) {
    setActionLoading(ticketId + action);
    try {
      const res = await fetch('/api/technician/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('techPortal.actionFailed'));
      addToast({ type: 'success', title: t('techPortal.actionCompleted') });
      await loadTickets();
      if (detailTicket?.id === ticketId) {
        const updatedStatus = (extra?.status as string | undefined) || (action === 'claim' ? 'IN_PROGRESS' : detailTicket.status);
        setDetailTicket((prev) => prev ? { ...prev, status: updatedStatus, assignedToId: action === 'claim' ? ticketId : prev.assignedToId } : prev);
        await loadMessages(ticketId);
      }
    } catch (e: unknown) {
      addToast({ type: 'error', title: 'Error', description: (e as Error).message });
    } finally {
      setActionLoading(null);
    }
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleGetGPS() {
    if (!navigator.geolocation) {
      addToast({ type: 'error', title: 'GPS tidak tersedia di perangkat ini' });
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
        const gpsText = `📍 Lokasi: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\n${mapsUrl}`;
        setReplyMessage((prev) => (prev ? `${prev}\n${gpsText}` : gpsText));
        setGpsLoading(false);
        replyTextareaRef.current?.focus();
      },
      (err) => {
        setGpsLoading(false);
        addToast({ type: 'error', title: 'Gagal mendapatkan lokasi', description: err.message });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  async function sendReply() {
    if (!detailTicket) return;
    if (!replyMessage.trim() && !photoFile) {
      addToast({ type: 'error', title: 'Tulis pesan atau pilih foto terlebih dahulu' });
      return;
    }
    setReplyLoading(true);
    try {
      let uploadedUrls: string[] = [];
      if (photoFile) {
        const fd = new FormData();
        fd.append('file', photoFile);
        const upRes = await fetch('/api/technician/upload', { method: 'POST', body: fd });
        const upData = await upRes.json();
        if (!upRes.ok) throw new Error(upData.error || 'Gagal mengupload foto');
        uploadedUrls = [upData.url];
      }
      const res = await fetch('/api/technician/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: detailTicket.id,
          action: 'reply',
          message: replyMessage.trim() || undefined,
          attachments: uploadedUrls.length > 0 ? uploadedUrls : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addToast({ type: 'success', title: 'Pesan terkirim' });
      setReplyMessage('');
      setPhotoFile(null);
      setPhotoPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadMessages(detailTicket.id);
    } catch (e: unknown) {
      addToast({ type: 'error', title: 'Gagal mengirim pesan', description: (e as Error).message });
    } finally {
      setReplyLoading(false);
    }
  }

  const stats = {
    total: tickets.length,
    open: tickets.filter((tk) => tk.status === 'OPEN').length,
    inProgress: tickets.filter((tk) => tk.status === 'IN_PROGRESS').length,
    resolved: tickets.filter((tk) => tk.status === 'RESOLVED').length,
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Ticket className="w-5 h-5 text-[#bc13fe]" />
            {t('techPortal.tickets')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60 mt-0.5">
            {t('techPortal.ticketsSubtitle')}
          </p>
        </div>
        <button
          onClick={loadTickets}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-slate-100 dark:bg-[#bc13fe]/10 hover:bg-slate-200 dark:hover:bg-[#bc13fe]/20 text-slate-700 dark:text-[#e0d0ff] border border-slate-200 dark:border-[#bc13fe]/30 rounded-xl transition-all"
        >
          <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('techPortal.refresh')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, icon: <Ticket className="w-4 h-4" />, color: 'text-[#bc13fe] bg-[#bc13fe]/10 border-[#bc13fe]/30' },
          { label: t('techPortal.statusOpen'), value: stats.open, icon: <Clock className="w-4 h-4" />, color: 'text-amber-500 bg-amber-500/10 border-amber-500/30' },
          { label: t('techPortal.statusInProgress'), value: stats.inProgress, icon: <Play className="w-4 h-4" />, color: 'text-[#00f7ff] bg-[#00f7ff]/10 border-[#00f7ff]/30' },
          { label: t('techPortal.statusResolved'), value: stats.resolved, icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-green-500 bg-green-500/10 border-green-500/30' },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60">{s.label}</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{s.value}</p>
              </div>
              <div className={`p-2.5 rounded-xl border flex items-center justify-center ${s.color}`}>{s.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <Filter className="w-4 h-4 text-[#00f7ff] flex-shrink-0" />
          <div className="flex-1 min-w-40 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('techPortal.searchTicket')}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#00f7ff]/60 focus:ring-1 focus:ring-[#00f7ff]/30"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-[#00f7ff]/60"
          >
            <option value="">{t('techPortal.allStatus')}</option>
            <option value="OPEN">{t('techPortal.statusOpen')}</option>
            <option value="IN_PROGRESS">{t('techPortal.statusInProgress')}</option>
            <option value="WAITING_CUSTOMER">{t('techPortal.statusWaitingCustomer')}</option>
            <option value="RESOLVED">{t('techPortal.statusResolved')}</option>
            <option value="CLOSED">{t('techPortal.statusClosed')}</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-[#00f7ff]/60"
          >
            <option value="">{t('techPortal.allPriority')}</option>
            <option value="URGENT">{t('techPortal.priorityUrgent')}</option>
            <option value="HIGH">{t('techPortal.priorityHigh')}</option>
            <option value="MEDIUM">{t('techPortal.priorityMedium')}</option>
            <option value="LOW">{t('techPortal.priorityLow')}</option>
          </select>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showMine}
              onChange={(e) => setShowMine(e.target.checked)}
              className="rounded accent-[#bc13fe]"
            />
            <span className="text-xs text-slate-600 dark:text-[#e0d0ff]/70 whitespace-nowrap">{t('techPortal.myTickets')}</span>
          </label>
        </div>
      </div>

      {/* Ticket list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[#00f7ff]" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16">
          <Ticket className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-[#e0d0ff]/50">{t('techPortal.noTickets')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => {
            const isLoading = actionLoading?.startsWith(ticket.id);
            return (
              <div
                key={ticket.id}
                className={`bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/50 border-l-4 ${PRIORITY_LEFT[ticket.priority] ?? 'border-l-slate-400'} overflow-hidden transition-shadow hover:shadow-md dark:hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)]`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-[#bc13fe]">
                          <Hash className="w-3 h-3" />{ticket.ticketNumber}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${PRIORITY_STYLE[ticket.priority] ?? PRIORITY_STYLE.MEDIUM}`}>
                          {PRIORITY_LABEL[ticket.priority] ?? ticket.priority}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${STATUS_STYLE[ticket.status] ?? STATUS_STYLE.OPEN}`}>
                          {STATUS_LABEL[ticket.status] ?? ticket.status}
                        </span>
                        {ticket.category && (
                          <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                            <Tag className="w-2.5 h-2.5" />{ticket.category.name}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate mb-1">
                        {ticket.subject}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-[#e0d0ff]/60">
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />{ticket.customerName}</span>
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{ticket.customerPhone}</span>
                        <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{ticket._count.messages} pesan</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(ticket.createdAt)}</span>
                      </div>
                    </div>

                    {/* Lihat Detail button */}
                    <button
                      onClick={() => openDetail(ticket)}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold bg-[#00f7ff]/10 hover:bg-[#00f7ff]/20 text-[#00aabb] dark:text-[#00f7ff] border border-[#00f7ff]/30 rounded-xl transition-all"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Lihat Detail</span>
                    </button>
                  </div>

                  {/* Quick action buttons */}
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
                    {!ticket.assignedToId && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && (
                      <button
                        onClick={() => doAction(ticket.id, 'claim')}
                        disabled={!!isLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-[#bc13fe]/10 hover:bg-[#bc13fe]/20 text-[#bc13fe] border border-[#bc13fe]/30 rounded-xl transition-all disabled:opacity-50"
                      >
                        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        {t('techPortal.claimTicket')}
                      </button>
                    )}
                    {ticket.status === 'IN_PROGRESS' && (
                      <>
                        <button
                          onClick={() => doAction(ticket.id, 'update_status', { status: 'WAITING_CUSTOMER' })}
                          disabled={!!isLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30 rounded-xl transition-all disabled:opacity-50"
                        >
                          <Clock className="w-3 h-3" />{t('techPortal.waitingCustomer')}
                        </button>
                        <button
                          onClick={() => doAction(ticket.id, 'update_status', { status: 'RESOLVED' })}
                          disabled={!!isLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/30 rounded-xl transition-all disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3 h-3" />{t('techPortal.markDone')}
                        </button>
                      </>
                    )}
                    {ticket.status === 'WAITING_CUSTOMER' && (
                      <button
                        onClick={() => doAction(ticket.id, 'update_status', { status: 'IN_PROGRESS' })}
                        disabled={!!isLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-[#00f7ff] border border-cyan-200 dark:border-[#00f7ff]/30 rounded-xl transition-all disabled:opacity-50"
                      >
                        <Play className="w-3 h-3" />Lanjutkan
                      </button>
                    )}
                    {ticket.status !== 'CLOSED' && (
                      <button
                        onClick={() => openDetail(ticket)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-xl transition-all"
                      >
                        <MessageSquare className="w-3 h-3" />{t('techPortal.replyTicket')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== DETAIL MODAL ===== */}
      {detailTicket && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-stretch sm:items-center justify-center sm:p-4">
          <div className="w-full sm:max-w-4xl bg-white dark:bg-[#080e1c] rounded-none sm:rounded-3xl border-0 sm:border border-slate-200 dark:border-[#1e2d4a] shadow-2xl flex flex-col" style={{ maxHeight: '100dvh' }}>

            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-[#1a2640] flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-1 h-8 rounded-full flex-shrink-0 ${
                  detailTicket.priority === 'URGENT' ? 'bg-red-500' :
                  detailTicket.priority === 'HIGH' ? 'bg-orange-500' :
                  detailTicket.priority === 'MEDIUM' ? 'bg-amber-500' : 'bg-slate-400'
                }`} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono font-bold text-[#bc13fe]">#{detailTicket.ticketNumber}</span>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${STATUS_STYLE[detailTicket.status] ?? STATUS_STYLE.OPEN}`}>
                      {STATUS_LABEL[detailTicket.status] ?? detailTicket.status}
                    </span>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${PRIORITY_STYLE[detailTicket.priority] ?? PRIORITY_STYLE.MEDIUM}`}>
                      {PRIORITY_LABEL[detailTicket.priority] ?? detailTicket.priority}
                    </span>
                  </div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">{detailTicket.subject}</h2>
                </div>
              </div>
              <button onClick={closeDetail} className="flex-shrink-0 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">

              {/* LEFT: Ticket Info Panel */}
              <div className="lg:w-72 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-[#1a2640] overflow-y-auto p-4 space-y-4">
                {/* Customer info */}
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Info Pelanggan</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-[#e0d0ff]/80">
                      <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="font-medium">{detailTicket.customerName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-[#e0d0ff]/80">
                      <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <a href={`tel:${detailTicket.customerPhone}`} className="font-medium hover:text-[#00f7ff] transition-colors">{detailTicket.customerPhone}</a>
                    </div>
                    {detailTicket.customer?.username && (
                      <div className="flex items-center gap-2 text-xs">
                        <Hash className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="font-mono text-[#00f7ff]">{detailTicket.customer.username}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Ticket meta */}
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Detail Tiket</h4>
                  <div className="space-y-2 text-xs text-slate-600 dark:text-[#e0d0ff]/70">
                    {detailTicket.category && (
                      <div className="flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /><span>{detailTicket.category.name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /><span>{formatDate(detailTicket.createdAt)}</span>
                    </div>
                    {detailTicket.resolvedAt && (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" /><span>Selesai: {formatDate(detailTicket.resolvedAt)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Deskripsi</h4>
                  <p className="text-xs text-slate-700 dark:text-[#e0d0ff]/80 whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-slate-900/40 rounded-xl p-3 border border-slate-100 dark:border-slate-700/40">
                    {detailTicket.description ? renderWithLinks(detailTicket.description) : <span className="italic text-slate-400">Tidak ada deskripsi</span>}
                  </p>
                </div>

                {/* Status actions */}
                {detailTicket.status !== 'CLOSED' && detailTicket.status !== 'RESOLVED' && (
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Ubah Status</h4>
                    <div className="space-y-2">
                      {!detailTicket.assignedToId && (
                        <button
                          onClick={() => doAction(detailTicket.id, 'claim')}
                          disabled={!!actionLoading}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-[#bc13fe]/10 hover:bg-[#bc13fe]/20 text-[#bc13fe] border border-[#bc13fe]/30 rounded-xl transition-all disabled:opacity-50"
                        >
                          {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          Ambil Tiket (Klaim)
                        </button>
                      )}
                      {detailTicket.status === 'IN_PROGRESS' && (
                        <>
                          <button
                            onClick={() => doAction(detailTicket.id, 'update_status', { status: 'WAITING_CUSTOMER' })}
                            disabled={!!actionLoading}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30 rounded-xl transition-all disabled:opacity-50"
                          >
                            <Clock className="w-3 h-3" />Menunggu Pelanggan
                          </button>
                          <button
                            onClick={() => doAction(detailTicket.id, 'update_status', { status: 'RESOLVED' })}
                            disabled={!!actionLoading}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/30 rounded-xl transition-all disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3 h-3" />Tandai Selesai
                          </button>
                        </>
                      )}
                      {detailTicket.status === 'WAITING_CUSTOMER' && (
                        <button
                          onClick={() => doAction(detailTicket.id, 'update_status', { status: 'IN_PROGRESS' })}
                          disabled={!!actionLoading}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-[#00f7ff] border border-cyan-200 dark:border-[#00f7ff]/30 rounded-xl transition-all disabled:opacity-50"
                        >
                          <Play className="w-3 h-3" />Lanjutkan Pengerjaan
                        </button>
                      )}
                      {detailTicket.status === 'OPEN' && (
                        <button
                          onClick={() => doAction(detailTicket.id, 'update_status', { status: 'CLOSED' })}
                          disabled={!!actionLoading}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-xl transition-all disabled:opacity-50"
                        >
                          <X className="w-3 h-3" />Tutup Tiket
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT: Message Thread + Reply */}
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-[#00f7ff]" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-xs text-slate-500 dark:text-slate-500">Belum ada pesan</p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isTech = msg.senderType === 'TECHNICIAN';
                      const isSystem = msg.senderType === 'SYSTEM';
                      const attachs = parseAttachments(msg.attachments);

                      if (isSystem) {
                        return (
                          <div key={msg.id} className="flex justify-center">
                            <div className="max-w-xs px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-500 dark:text-slate-400 italic text-center">
                              {msg.message}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={msg.id} className={`flex ${isTech ? 'justify-end' : 'justify-start'}`}>
                          <div className="max-w-[80%] space-y-1">
                            <div className={`text-[10px] font-medium mb-1 ${isTech ? 'text-right text-[#00f7ff]' : 'text-left text-slate-500 dark:text-slate-400'}`}>
                              {msg.senderName}
                            </div>
                            {/* Photo attachments */}
                            {attachs.length > 0 && (
                              <div className="space-y-1">
                                {attachs.map((url, i) => (
                                  <button
                                    key={i}
                                    onClick={() => setLightboxUrl(url)}
                                    className="block rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 hover:opacity-90 transition-opacity"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={url} alt="Foto lampiran" className="max-w-[200px] max-h-[200px] object-cover" />
                                  </button>
                                ))}
                              </div>
                            )}
                            {/* Message text */}
                            {msg.message && msg.message !== '📷 Foto dikirim' && (
                              <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                                isTech
                                  ? 'bg-[#bc13fe]/15 dark:bg-[#bc13fe]/20 text-slate-800 dark:text-[#f0e0ff] rounded-tr-sm border border-[#bc13fe]/20'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-[#e0d0ff]/90 rounded-tl-sm border border-slate-200 dark:border-slate-700'
                              }`}>
                                {renderWithLinks(msg.message)}
                              </div>
                            )}
                            <div className={`text-[9px] text-slate-400 dark:text-slate-500 ${isTech ? 'text-right' : 'text-left'}`}>
                              {formatDate(msg.createdAt)}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply form */}
                {detailTicket.status !== 'CLOSED' && (
                  <div className="border-t border-slate-100 dark:border-[#1a2640] p-4 flex-shrink-0">
                    {/* Photo preview */}
                    {photoPreview && (
                      <div className="relative inline-block mb-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoPreview} alt="Preview" className="h-20 w-auto rounded-xl border border-slate-200 dark:border-slate-700 object-cover" />
                        <button
                          onClick={() => { setPhotoFile(null); setPhotoPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    <div className="flex gap-2 items-end">
                      <textarea
                        ref={replyTextareaRef}
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendReply();
                        }}
                        rows={2}
                        placeholder="Tulis balasan... (Ctrl+Enter untuk kirim)"
                        className="flex-1 px-3 py-2.5 text-xs bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#00f7ff]/60 focus:ring-1 focus:ring-[#00f7ff]/30 resize-none"
                      />
                      <div className="flex flex-col gap-1.5">
                        {/* Camera / file pick */}
                        <label className="cursor-pointer flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 transition-colors" title="Upload foto">
                          <Camera className="w-4 h-4" />
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handlePhotoSelect}
                            className="hidden"
                          />
                        </label>
                        {/* GPS */}
                        <button
                          onClick={handleGetGPS}
                          disabled={gpsLoading}
                          className="flex items-center justify-center w-9 h-9 rounded-xl bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/30 transition-colors disabled:opacity-50"
                          title="Tag lokasi GPS"
                        >
                          {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                        </button>
                        {/* Send */}
                        <button
                          onClick={sendReply}
                          disabled={replyLoading || (!replyMessage.trim() && !photoFile)}
                          className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#bc13fe] hover:bg-[#bc13fe]/90 text-white transition-colors disabled:opacity-40"
                          title="Kirim (Ctrl+Enter)"
                        >
                          {replyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 flex items-center gap-3">
                      <span className="flex items-center gap-1"><Camera className="w-3 h-3" />Foto saat pengerjaan</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />Tag koordinat lokasi</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Foto tiket"
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
