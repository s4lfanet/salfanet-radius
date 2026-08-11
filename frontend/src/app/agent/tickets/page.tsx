'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  TicketPlus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Send,
  Tag,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  MessageSquare,
  Plus,
  MapPin,
  Navigation,
} from 'lucide-react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB } from '@/lib/timezone';

interface TicketMessage {
  id: string;
  senderType: string;
  senderName: string;
  message: string;
  createdAt: string;
}

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  category?: { name: string; color?: string } | null;
  messages: TicketMessage[];
  _count?: { messages: number };
}

interface Category {
  id: string;
  name: string;
  color?: string;
}

const STATUS_COLORS: Record<string, string> = {
  OPEN:             'bg-blue-500/10 text-blue-400 border-blue-500/30',
  IN_PROGRESS:      'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  WAITING_CUSTOMER: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  RESOLVED:         'bg-green-500/10 text-green-400 border-green-500/30',
  CLOSED:           'bg-slate-500/10 text-slate-400 border-slate-500/30',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW:    'bg-slate-500/10 text-slate-400 border-slate-500/30',
  MEDIUM: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  HIGH:   'bg-orange-500/10 text-orange-400 border-orange-500/30',
  URGENT: 'bg-red-500/10 text-red-400 border-red-500/30',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  OPEN:             <AlertCircle className="w-3.5 h-3.5" />,
  IN_PROGRESS:      <Clock className="w-3.5 h-3.5" />,
  WAITING_CUSTOMER: <Clock className="w-3.5 h-3.5" />,
  RESOLVED:         <CheckCircle2 className="w-3.5 h-3.5" />,
  CLOSED:           <XCircle className="w-3.5 h-3.5" />,
};

function fmtDate(val: string) {
  return formatWIB(val, 'dd MMM yyyy HH:mm');
}

export default function AgentTicketsPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [sendingReply, setSendingReply] = useState<string | null>(null);

  // New ticket form
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', priority: 'MEDIUM', categoryId: '' });
  const [locationTag, setLocationTag] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);

  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const data = localStorage.getItem('agentData');
    if (!data) { router.push('/agent'); return; }
    loadTickets();
    loadCategories();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const loadTickets = async (status = filterStatus) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('agentToken');
      if (!token) { router.push('/agent'); return; }
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      const res = await fetch(`/api/agent/tickets?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setTickets(data.tickets);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const token = localStorage.getItem('agentToken');
      const res = await fetch('/api/tickets/categories', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setCategories(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
  };

  const handleGetGPS = () => {
    if (!navigator.geolocation) {
      showError('Browser tidak mendukung GPS');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setGpsLoading(false);
      },
      () => {
        showError('Gagal mendapatkan lokasi GPS. Pastikan izin lokasi diaktifkan.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleCreate = async () => {
    if (!form.subject.trim() || !form.description.trim()) {
      await showError('Subjek dan deskripsi wajib diisi.');
      return;
    }
    setCreating(true);
    try {
      const token = localStorage.getItem('agentToken');
      let finalDescription = form.description;
      if (locationTag || (latitude && longitude)) {
        finalDescription += '\n\n---';
        if (locationTag) finalDescription += `\n\uD83D\uDCCD Lokasi: ${locationTag}`;
        if (latitude && longitude) {
          finalDescription += `\n\uD83C\uDF10 Koordinat: ${latitude}, ${longitude}`;
          finalDescription += `\n\uD83D\uDDFA\uFE0F Maps: https://maps.google.com/?q=${latitude},${longitude}`;
        }
      }
      const res = await fetch('/api/agent/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, description: finalDescription }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await showSuccess(`Tiket #${data.ticket.ticketNumber} berhasil dibuat!`);
        setForm({ subject: '', description: '', priority: 'MEDIUM', categoryId: '' });
        setLocationTag('');
        setLatitude('');
        setLongitude('');
        setShowForm(false);
        loadTickets();
      } else {
        await showError(data.error || 'Gagal membuat tiket.');
      }
    } catch {
      await showError('Gagal membuat tiket.');
    } finally {
      setCreating(false);
    }
  };

  const handleReply = async (ticketId: string) => {
    const msg = replyText[ticketId]?.trim();
    if (!msg) return;
    setSendingReply(ticketId);
    try {
      const token = localStorage.getItem('agentToken');
      const res = await fetch(`/api/agent/tickets/${ticketId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReplyText(prev => ({ ...prev, [ticketId]: '' }));
        // Reload tickets to refresh messages
        await loadTickets(filterStatus);
        // Keep expanded
        setExpandedId(ticketId);
      } else {
        await showError(data.error || 'Gagal mengirim balasan.');
      }
    } catch {
      await showError('Gagal mengirim balasan.');
    } finally {
      setSendingReply(null);
    }
  };

  const handleFilterChange = (status: string) => {
    setFilterStatus(status);
    loadTickets(status);
  };

  const statusLabel: Record<string, string> = {
    '': 'Semua',
    OPEN: 'Terbuka',
    IN_PROGRESS: 'Diproses',
    WAITING_CUSTOMER: 'Menunggu',
    RESOLVED: 'Selesai',
    CLOSED: 'Ditutup',
  };
  const priorityLabel: Record<string, string> = {
    LOW: 'Rendah', MEDIUM: 'Sedang', HIGH: 'Tinggi', URGENT: 'Mendesak',
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-wide text-slate-900 dark:text-white">
            Tiket Keluhan / Gangguan
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Laporkan gangguan atau keluhan Anda kepada tim support
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadTickets()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-sm hover:shadow-md transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Buat Tiket
          </button>
        </div>
      </div>

      {/* Create Ticket Form */}
      {showForm && (
        <div className="rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <TicketPlus className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            Buat Tiket Baru
          </h2>

          {/* Subject */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Subjek <span className="text-red-400">*</span></label>
            <input
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Contoh: Internet mati sejak pagi"
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-violet-500 dark:focus:border-violet-400 transition"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Deskripsi <span className="text-red-400">*</span></label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Jelaskan masalah secara detail..."
              rows={4}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-violet-500 dark:focus:border-violet-400 transition resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Priority */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Prioritas</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white focus:outline-none focus:border-violet-500 dark:focus:border-violet-400 transition appearance-none cursor-pointer"
              >
                {Object.entries(priorityLabel).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Kategori</label>
              <select
                value={form.categoryId}
                onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white focus:outline-none focus:border-violet-500 dark:focus:border-violet-400 transition appearance-none cursor-pointer"
              >
                <option value="">-- Pilih Kategori --</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Location Tag */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              <MapPin className="w-3.5 h-3.5 inline mr-1 text-rose-500" />
              Tag Lokasi <span className="font-normal text-slate-400">(opsional)</span>
            </label>
            <input
              value={locationTag}
              onChange={e => setLocationTag(e.target.value)}
              placeholder="Contoh: RT 05/RW 02, Desa Sukamaju"
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-violet-500 dark:focus:border-violet-400 transition"
            />
          </div>

          {/* GPS Coordinates */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Koordinat GPS</label>
            <div className="flex gap-2">
              <div className="flex-1 px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400">
                {latitude && longitude ? `${latitude}, ${longitude}` : 'Belum ada koordinat'}
              </div>
              <button
                type="button"
                onClick={handleGetGPS}
                disabled={gpsLoading}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 disabled:opacity-50 transition"
              >
                {gpsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
                GPS
              </button>
            </div>
            {latitude && longitude && (
              <a
                href={`https://maps.google.com/?q=${latitude},${longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 mt-1"
              >
                <MapPin className="w-3 h-3" />
                Lihat di Google Maps
              </a>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setShowForm(false); setForm({ subject: '', description: '', priority: 'MEDIUM', categoryId: '' }); setLocationTag(''); setLatitude(''); setLongitude(''); }}
              className="flex-1 py-2 text-xs font-bold rounded-xl bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 transition"
            >
              Batal
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white disabled:opacity-60 shadow-sm transition"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {creating ? 'Mengirim...' : 'Kirim Tiket'}
            </button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(statusLabel).map(([val, label]) => (
          <button
            key={val}
            onClick={() => handleFilterChange(val)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
              filterStatus === val
                ? 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/20 dark:text-violet-400 dark:border-violet-500/40'
                : 'bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Ticket List */}
      {loading ? (
        <div className="flex justify-center items-center py-16">
          <Loader2 className="w-6 h-6 text-violet-600 dark:text-violet-400 animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="p-5 rounded-2xl bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20">
            <MessageSquare className="w-10 h-10 text-violet-400 dark:text-violet-500" />
          </div>
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Belum ada tiket</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Buat tiket baru untuk melaporkan gangguan</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => (
            <div
              key={ticket.id}
              className="rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-all"
            >
              {/* Ticket Header */}
              <button
                onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}
                className="w-full text-left px-4 py-3.5 flex items-start justify-between gap-3 hover:bg-slate-50 dark:hover:bg-white/5 transition"
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-violet-700 dark:text-violet-400 bg-violet-100 dark:bg-violet-500/10 px-2 py-0.5 rounded-md">
                      #{ticket.ticketNumber}
                    </span>
                    <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${STATUS_COLORS[ticket.status] || STATUS_COLORS.OPEN}`}>
                      {STATUS_ICON[ticket.status]}
                      {ticket.status.replace('_', ' ')}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.MEDIUM}`}>
                      {priorityLabel[ticket.priority] || ticket.priority}
                    </span>
                    {ticket.category && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md">
                        <Tag className="w-3 h-3" />
                        {ticket.category.name}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{ticket.subject}</p>
                  <div className="flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {fmtDate(ticket.createdAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {ticket._count?.messages || ticket.messages.length} pesan
                    </span>
                  </div>
                </div>
                <span className="flex-shrink-0 text-slate-400 mt-1">
                  {expandedId === ticket.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              </button>

              {/* Expanded - Messages + Reply */}
              {expandedId === ticket.id && (
                <div className="border-t border-slate-100 dark:border-slate-700">
                  {/* Messages */}
                  <div className="px-4 py-3 space-y-3 max-h-72 overflow-y-auto" ref={messagesRef}>
                    {ticket.messages.map(msg => {
                      const isAgent = msg.senderType === 'CUSTOMER';
                      return (
                        <div key={msg.id} className={`flex gap-2.5 ${isAgent ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black ${
                            isAgent
                              ? 'bg-gradient-to-br from-violet-600 to-cyan-600 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-white'
                          }`}>
                            {msg.senderName.charAt(0).toUpperCase()}
                          </div>
                          <div className={`flex-1 max-w-[80%] space-y-0.5 ${isAgent ? 'items-end' : 'items-start'} flex flex-col`}>
                            <div className={`px-3 py-2 rounded-xl text-xs leading-relaxed ${
                              isAgent
                                ? 'bg-violet-50 dark:bg-violet-900/30 text-slate-800 dark:text-white border border-violet-200 dark:border-violet-700/30'
                                : 'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600'
                            }`}>
                              {msg.message}
                            </div>
                            <div className={`text-[9px] text-slate-400 dark:text-slate-500 px-1 ${isAgent ? 'text-right' : 'text-left'}`}>
                              {msg.senderType === 'ADMIN' ? '\uD83D\uDC64 Admin' : msg.senderType === 'TECHNICIAN' ? '\uD83D\uDD27 Teknisi' : msg.senderName} · {fmtDate(msg.createdAt)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Reply box - only if not closed */}
                  {ticket.status !== 'CLOSED' && (
                    <div className="px-4 pb-4 flex gap-2">
                      <input
                        value={replyText[ticket.id] || ''}
                        onChange={e => setReplyText(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(ticket.id); } }}
                        placeholder="Tulis balasan..."
                        className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-violet-500 dark:focus:border-violet-400 transition"
                      />
                      <button
                        onClick={() => handleReply(ticket.id)}
                        disabled={sendingReply === ticket.id || !replyText[ticket.id]?.trim()}
                        className="flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white disabled:opacity-50 transition"
                      >
                        {sendingReply === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
