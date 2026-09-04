'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { apiAdmin, ApiError } from '@/lib/api';
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
      const data = await apiAdmin<{ tickets: Ticket[] }>(`/api/technician/tickets?${params}`);
      setTickets(data.tickets || []);
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
      await apiAdmin('/api/technician/tickets', {
        method: 'PATCH',
        body: JSON.stringify({ ticketId, action, status }),
      });
      addToast({ type: 'success', title: 'Berhasil' });
      loadTickets();
    } catch (error) {
      if (error instanceof ApiError) {
        addToast({ type: 'error', title: error.message || 'Gagal melakukan aksi' });
      } else {
        addToast({ type: 'error', title: 'Gagal melakukan aksi' });
      }
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
      case 'CLOSED': return 'bg-slate-500/10 text-muted-foreground border-slate-200 dark:border-slate-500/30';
      case 'IN_PROGRESS': return 'bg-cyan-500/10 text-[#00bcd4] dark:text-brand-500 border-cyan-200 dark:border-brand-500/30';
      case 'WAITING_CUSTOMER': return 'bg-purple-500/10 text-purple-600 dark:text-violet-500 border-purple-200 dark:border-violet-500/30';
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
          { label: t('technician.totalTasks'), value: stats.total, icon: ClipboardList, color: 'text-violet-500', bg: 'bg-purple-500/10 dark:bg-violet-500/10', border: 'border-purple-200 dark:border-violet-500/20' },
          { label: t('technician.openTasks'), value: stats.open, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/20' },
          { label: t('technician.activeTasks'), value: stats.active, icon: AlertTriangle, color: 'text-[#00bcd4] dark:text-brand-500', bg: 'bg-cyan-500/10 dark:bg-brand-500/10', border: 'border-cyan-200 dark:border-brand-500/20' },
          { label: t('technician.completedTasks'), value: stats.completed, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-200 dark:border-green-500/20' },
        ].map(({ label, value, icon: Icon, color, bg, border }) => (
          <div key={label} className={`bg-card ${border} border rounded-2xl p-4 transition-all`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className="text-2xl font-bold text-foreground">{value}</p>
              </div>
              <div className={`p-2.5 ${bg} rounded-xl`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-2xl p-3 flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 bg-input border border-border rounded-xl text-xs text-foreground">
          <option value="">{t('technician.allStatus')}</option>
          <option value="OPEN">Terbuka</option>
          <option value="IN_PROGRESS">Dikerjakan</option>
          <option value="WAITING_CUSTOMER">Menunggu Pelanggan</option>
          <option value="RESOLVED">Selesai</option>
          <option value="CLOSED">Ditutup</option>
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="px-3 py-2 bg-input border border-border rounded-xl text-xs text-foreground">
          <option value="">{t('technician.allPriority')}</option>
          <option value="URGENT">{t('technician.priorityUrgent')}</option>
          <option value="HIGH">{t('technician.priorityHigh')}</option>
          <option value="MEDIUM">{t('technician.priorityMedium')}</option>
          <option value="LOW">{t('technician.priorityLow')}</option>
        </select>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showMyTasks} onChange={(e) => setShowMyTasks(e.target.checked)} className="w-3.5 h-3.5 rounded border-border bg-input text-brand-500 focus:ring-brand-500/50" />
          <span className="text-xs text-muted-foreground">{t('technician.myTasksOnly')}</span>
        </label>
        <button onClick={loadTickets} className="ml-auto p-2 bg-muted border border-border text-muted-foreground rounded-xl hover:bg-accent transition" title="Perbarui Data">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tickets */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <h3 className="text-base font-bold text-foreground mb-1">{t('technician.noTasks')}</h3>
          <p className="text-xs">{t('techPortal.noData')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="bg-card border border-border rounded-2xl p-4 hover:border-accent transition-all">
              <div className="flex flex-wrap gap-2 justify-between items-start mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-[10px] font-bold text-brand-500 dark:text-brand-500 opacity-70">#{ticket.ticketNumber}</span>
                    {ticket.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">{ticket.category.name}</span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-foreground">{ticket.subject}</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
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
                <p className="text-xs text-muted-foreground/70 mb-3 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> {ticket._count.messages} pesan
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {ticket.status === 'OPEN' && (
                  <button
                    onClick={() => handleAction(ticket.id, 'claim')}
                    disabled={actionLoading === ticket.id}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-brand-500 to-[#00d4e6] text-black text-xs font-bold rounded-xl hover:shadow-[0_0_15px_rgba(6,182,212,0.4)] transition disabled:opacity-50"
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
                  className="flex items-center gap-1.5 px-3 py-2 bg-muted text-muted-foreground text-xs font-bold rounded-xl hover:bg-accent transition"
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


