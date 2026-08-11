'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import { useToast } from '@/components/cyberpunk/CyberToast';
import {
  ClipboardList, CheckCircle2, Clock, AlertTriangle, Filter, RefreshCw,
  Loader2, MessageSquare, User, Phone,
} from 'lucide-react';

interface Ticket {
  id: string;
  ticketNumber: string;
  customerName: string;
  customerPhone: string;
  subject: string;
  priority: string;
  status: string;
  assignedToId?: string | null;
  assignedToType?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  category?: { id: string; name: string; color?: string } | null;
  _count?: { messages: number };
}

export default function TechnicianDashboardPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [showMyTasks, setShowMyTasks] = useState(false);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (filterPriority) params.append('priority', filterPriority);
      if (showMyTasks) params.append('mine', 'true');
      const res = await fetch(`/api/technician/tickets?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadTickets(); }, [filterStatus, filterPriority, showMyTasks]);

  const handleAction = async (ticketId: string, action: string, status?: string) => {
    setActionLoading(ticketId);
    try {
      const res = await fetch('/api/technician/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, action, status }),
      });
      if (res.ok) {
        addToast({ type: 'success', title: 'Berhasil' });
        loadTickets();
      } else {
        const data = await res.json();
        addToast({ type: 'error', title: data.error || 'Gagal melakukan aksi' });
      }
    } catch {
      addToast({ type: 'error', title: 'Gagal melakukan aksi' });
    } finally {
      setActionLoading(null);
    }
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'URGENT': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30';
      case 'HIGH': return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-500/30';
      case 'MEDIUM': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30';
      default: return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-500/30';
    }
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'RESOLVED': return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/30';
      case 'CLOSED': return 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-500/30';
      case 'IN_PROGRESS': return 'bg-cyan-500/10 text-[#00bcd4] dark:text-[#00f7ff] border-cyan-200 dark:border-[#00f7ff]/30';
      case 'WAITING_CUSTOMER': return 'bg-purple-500/10 text-purple-600 dark:text-[#bc13fe] border-purple-200 dark:border-[#bc13fe]/30';
      case 'OPEN': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30';
      default: return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-500/30';
    }
  };

  const getStatusLabel = (s: string) => {
    switch (s) {
      case 'RESOLVED': return 'Selesai';
      case 'CLOSED': return 'Ditutup';
      case 'IN_PROGRESS': return 'Dikerjakan';
      case 'WAITING_CUSTOMER': return 'Menunggu Pelanggan';
      case 'OPEN': return 'Terbuka';
      default: return s;
    }
  };

  const stats = {
    total: tickets.length,
    open: tickets.filter(t => t.status === 'OPEN').length,
    active: tickets.filter(t => t.status === 'IN_PROGRESS' || t.status === 'WAITING_CUSTOMER').length,
    completed: tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length,
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: t('technician.totalTasks'), value: stats.total, icon: ClipboardList, color: 'text-[#bc13fe]', bg: 'bg-purple-500/10 dark:bg-[#bc13fe]/10', border: 'border-purple-200 dark:border-[#bc13fe]/20' },
          { label: t('technician.openTasks'), value: stats.open, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/20' },
          { label: t('technician.activeTasks'), value: stats.active, icon: AlertTriangle, color: 'text-[#00bcd4] dark:text-[#00f7ff]', bg: 'bg-cyan-500/10 dark:bg-[#00f7ff]/10', border: 'border-cyan-200 dark:border-[#00f7ff]/20' },
          { label: t('technician.completedTasks'), value: stats.completed, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-200 dark:border-green-500/20' },
        ].map(({ label, value, icon: Icon, color, bg, border }) => (
          <div key={label} className={`bg-white dark:bg-[#1a0f35]/80 ${border} border rounded-2xl p-4 transition-all`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60 mb-1">{label}</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
              </div>
              <div className={`p-2.5 ${bg} rounded-xl`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[#1a0f35]/80 border border-slate-200 dark:border-[#bc13fe]/20 rounded-2xl p-3 flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4 text-slate-400 dark:text-[#00f7ff]" />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-[#0a0520] border border-slate-200 dark:border-[#bc13fe]/30 rounded-xl text-xs text-slate-900 dark:text-white">
          <option value="">{t('technician.allStatus')}</option>
          <option value="OPEN">Terbuka</option>
          <option value="IN_PROGRESS">Dikerjakan</option>
          <option value="WAITING_CUSTOMER">Menunggu Pelanggan</option>
          <option value="RESOLVED">Selesai</option>
          <option value="CLOSED">Ditutup</option>
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-[#0a0520] border border-slate-200 dark:border-[#bc13fe]/30 rounded-xl text-xs text-slate-900 dark:text-white">
          <option value="">{t('technician.allPriority')}</option>
          <option value="URGENT">{t('technician.priorityUrgent')}</option>
          <option value="HIGH">{t('technician.priorityHigh')}</option>
          <option value="MEDIUM">{t('technician.priorityMedium')}</option>
          <option value="LOW">{t('technician.priorityLow')}</option>
        </select>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showMyTasks} onChange={(e) => setShowMyTasks(e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-300 dark:border-[#bc13fe]/50 bg-white dark:bg-[#0a0520] text-[#00f7ff] focus:ring-[#00f7ff]/50" />
          <span className="text-xs text-slate-600 dark:text-[#e0d0ff]/70">{t('technician.myTasksOnly')}</span>
        </label>
        <button onClick={loadTickets} className="ml-auto p-2 bg-slate-100 dark:bg-[#00f7ff]/10 border border-slate-200 dark:border-[#00f7ff]/30 text-slate-600 dark:text-[#00f7ff] rounded-xl hover:bg-slate-200 dark:hover:bg-[#00f7ff]/20 transition" title="Perbarui Data">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tickets */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#00f7ff]" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-20 text-slate-500 dark:text-[#e0d0ff]/50">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <h3 className="text-base font-bold text-slate-700 dark:text-white mb-1">{t('technician.noTasks')}</h3>
          <p className="text-xs">{t('techPortal.noData')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="bg-white dark:bg-[#1a0f35]/80 border border-slate-200 dark:border-[#bc13fe]/20 rounded-2xl p-4 hover:border-slate-300 dark:hover:border-[#00f7ff]/30 transition-all">
              <div className="flex flex-wrap gap-2 justify-between items-start mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-[10px] font-bold text-[#00f7ff] dark:text-[#00f7ff] opacity-70">#{ticket.ticketNumber}</span>
                    {ticket.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-[#e0d0ff]/60">{ticket.category.name}</span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{ticket.subject}</h3>
                  <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60 flex items-center gap-1 mt-0.5">
                    <User className="w-3 h-3" /> {ticket.customerName}
                    <Phone className="w-3 h-3 ml-1" /> {ticket.customerPhone}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-lg border ${getPriorityColor(ticket.priority)}`}>{ticket.priority}</span>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-lg border ${getStatusColor(ticket.status)}`}>{getStatusLabel(ticket.status)}</span>
                </div>
              </div>

              {ticket._count && ticket._count.messages > 0 && (
                <p className="text-xs text-slate-400 dark:text-[#e0d0ff]/50 mb-3 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> {ticket._count.messages} pesan
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {ticket.status === 'OPEN' && (
                  <button
                    onClick={() => handleAction(ticket.id, 'claim')}
                    disabled={actionLoading === ticket.id}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] text-black text-xs font-bold rounded-xl hover:shadow-[0_0_15px_rgba(0,247,255,0.4)] transition disabled:opacity-50"
                  >
                    {actionLoading === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    {t('technician.takeTask')}
                  </button>
                )}
                {ticket.status === 'IN_PROGRESS' && (
                  <button
                    onClick={() => handleAction(ticket.id, 'update_status', 'RESOLVED')}
                    disabled={actionLoading === ticket.id}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold rounded-xl hover:shadow-[0_0_15px_rgba(34,197,94,0.4)] transition disabled:opacity-50"
                  >
                    {actionLoading === ticket.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Selesaikan
                  </button>
                )}
                <Link
                  href="/technician/tickets"
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-[#e0d0ff] text-xs font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-white/20 transition"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Buka Tiket
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


