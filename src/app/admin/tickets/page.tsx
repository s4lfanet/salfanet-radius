'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { 
  Ticket, 
  MessageSquare, 
  Filter, 
  Search,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Users,
  Send,
  X,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { formatWIB } from '@/lib/timezone';
import { showSuccess, showError } from '@/lib/sweetalert';

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface TicketItem {
  id: string;
  ticketNumber: string;
  subject: string;
  customerName: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  assignedToId?: string;
  assignedToType?: string;
  category?: {
    name: string;
    color: string;
  };
  _count: {
    messages: number;
  };
}

interface Stats {
  total: number;
  byStatus: {
    open: number;
    inProgress: number;
    waitingCustomer: number;
    resolved: number;
    closed: number;
  };
  byPriority: {
    low: number;
    medium: number;
    high: number;
    urgent: number;
  };
  unassigned: number;
  avgResponseTimeHours: number;
}

interface DispatchFormData {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  subject: string;
  description: string;
  categoryId: string;
  priority: string;
  routerId: string;
  oltId: string;
  odcId: string;
  odpId: string;
}

interface DispatchDataResult {
  technicians: { id: string; name: string; phoneNumber: string }[];
  categories: { id: string; name: string; color: string | null }[];
  routers: { id: string; name: string; nasname: string | null }[];
  olts: { id: string; name: string; ipAddress: string }[];
  odcs: { id: string; name: string; oltId: string }[];
  odps: { id: string; name: string; odcId: string | null; portCount: number }[];
  customers: { id: string; username: string; name: string | null; phone: string | null; address: string | null; odpAssignment: { odpId: string; odp: { id: string; name: string } } | null }[];
}

export default function AdminTicketsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', priority: '', search: '' });

  // Dispatch modal state
  const [showDispatch, setShowDispatch] = useState(false);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchData, setDispatchData] = useState<DispatchDataResult | null>(null);
  const [dispatchDataLoading, setDispatchDataLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [form, setForm] = useState<DispatchFormData>({
    customerId: '', customerName: '', customerPhone: '', customerAddress: '',
    subject: '', description: '', categoryId: '', priority: 'MEDIUM',
    routerId: '', oltId: '', odcId: '', odpId: '',
  });

  const loadDispatchData = useCallback(async (search = '') => {
    setDispatchDataLoading(true);
    try {
      const res = await fetch(`/api/tickets/dispatch-data${search ? `?customerSearch=${encodeURIComponent(search)}` : ''}`);
      if (res.ok) setDispatchData(await res.json());
    } catch { /* ignore */ } finally {
      setDispatchDataLoading(false);
    }
  }, []);

  const handleCustomerSearchChange = useCallback((value: string) => {
    setCustomerSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!value.trim()) return;
    setCustomerSearchLoading(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tickets/dispatch-data?customerSearch=${encodeURIComponent(value)}`);
        if (res.ok) setDispatchData(await res.json());
      } catch { /* ignore */ } finally {
        setCustomerSearchLoading(false);
      }
    }, 400);
  }, []);

  const openDispatch = () => {
    setShowDispatch(true);
    if (!dispatchData) loadDispatchData();
  };

  const selectCustomer = (c: DispatchDataResult['customers'][0]) => {
    setForm(f => ({
      ...f,
      customerId: c.id,
      customerName: c.name || c.username,
      customerPhone: c.phone || '',
      customerAddress: c.address || '',
      odpId: c.odpAssignment?.odpId || f.odpId,
    }));
    setCustomerSearch(c.name || c.username);
  };

  const handleDispatch = async () => {
    if (!form.customerName || !form.customerPhone || !form.subject || !form.description) {
      showError('Lengkapi data', 'Nama pelanggan, telepon, subjek, dan deskripsi wajib diisi');
      return;
    }
    setDispatchLoading(true);
    try {
      const res = await fetch('/api/tickets/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal');
      showSuccess('Tiket Terkirim', `#${data.ticket.ticketNumber} dikirim ke ${data.notified} teknisi`);
      setShowDispatch(false);
      setForm({ customerId: '', customerName: '', customerPhone: '', customerAddress: '', subject: '', description: '', categoryId: '', priority: 'MEDIUM', routerId: '', oltId: '', odcId: '', odpId: '' });
      setCustomerSearch('');
      setCustomerSearchLoading(false);
      fetchTickets();
      fetchStats();
    } catch (e: any) {
      showError('Gagal kirim tiket', e.message);
    } finally {
      setDispatchLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchTickets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/tickets/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.priority) params.append('priority', filters.priority);
      if (filters.search) params.append('search', filters.search);

      const res = await fetch(`/api/tickets?${params.toString()}`);
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

  return (
    <div className="bg-background relative overflow-hidden">
      {/* Neon Cyberpunk Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      
      <div className="relative z-10 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">
            {t('ticket.tickets')}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t('ticket.manageAllTickets')}
          </p>
        </div>
        <button
          onClick={openDispatch}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-gradient-to-r from-[#bc13fe] to-[#9b10d6] text-white rounded-xl shadow-[0_0_20px_rgba(188,19,254,0.4)] hover:shadow-[0_0_30px_rgba(188,19,254,0.6)] transition-all"
        >
          <Send className="w-4 h-4" />
          Kirim ke Teknisi
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3 mb-4">
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-[#00f7ff] uppercase tracking-wide truncate">{t('ticket.totalTickets')}</p>
                <p className="text-lg sm:text-xl font-bold text-foreground mt-1">{stats.total}</p>
              </div>
              <Ticket className="text-[#00f7ff] h-5 w-5 sm:h-6 sm:w-6 drop-shadow-[0_0_15px_rgba(0,247,255,0.6)] flex-shrink-0" />
            </div>
          </div>

          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-[#00f7ff] uppercase tracking-wide truncate">{t('ticket.openTickets')}</p>
                <p className="text-lg sm:text-xl font-bold text-foreground mt-1">{stats.byStatus.open}</p>
              </div>
              <TrendingUp className="text-[#00f7ff] h-5 w-5 sm:h-6 sm:w-6 drop-shadow-[0_0_15px_rgba(0,247,255,0.6)] flex-shrink-0" />
            </div>
          </div>

          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-[#00f7ff] uppercase tracking-wide truncate">{t('ticket.urgentTickets')}</p>
                <p className="text-lg sm:text-xl font-bold text-foreground mt-1">{stats.byPriority.urgent}</p>
              </div>
              <AlertCircle className="text-red-400 h-5 w-5 sm:h-6 sm:w-6 drop-shadow-[0_0_15px_rgba(239,68,68,0.6)] flex-shrink-0" />
            </div>
          </div>

          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-[#00f7ff] uppercase tracking-wide truncate">{t('ticket.unassigned')}</p>
                <p className="text-lg sm:text-xl font-bold text-foreground mt-1">{stats.unassigned}</p>
              </div>
              <Users className="text-amber-400 h-5 w-5 sm:h-6 sm:w-6 drop-shadow-[0_0_15px_rgba(251,191,36,0.6)] flex-shrink-0" />
            </div>
          </div>

          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-[#00f7ff] uppercase tracking-wide truncate">{t('ticket.inProgress')}</p>
                <p className="text-lg sm:text-xl font-bold text-foreground mt-1">{stats.byStatus.inProgress}</p>
              </div>
              <Clock className="text-amber-400 h-5 w-5 sm:h-6 sm:w-6 drop-shadow-[0_0_15px_rgba(251,191,36,0.6)] flex-shrink-0" />
            </div>
          </div>

          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-[#00f7ff] uppercase tracking-wide truncate">{t('ticket.resolved')}</p>
                <p className="text-lg sm:text-xl font-bold text-foreground mt-1">{stats.byStatus.resolved}</p>
              </div>
              <CheckCircle className="text-green-400 h-5 w-5 sm:h-6 sm:w-6 drop-shadow-[0_0_15px_rgba(34,197,94,0.6)] flex-shrink-0" />
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-[#00f7ff] uppercase tracking-wide truncate">{t('ticket.avgResponseTime')}</p>
                <p className="text-lg sm:text-xl font-bold text-foreground mt-1">
                  {stats.avgResponseTimeHours.toFixed(1)} {t('ticket.hours')}
                </p>
              </div>
              <Clock className="text-[#00f7ff] h-5 w-5 sm:h-6 sm:w-6 drop-shadow-[0_0_15px_rgba(0,247,255,0.6)] flex-shrink-0" />
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-3 mb-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
          <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
          
          <div className="flex-1 min-w-0 sm:min-w-[180px]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder={t('ticket.searchPlaceholder')}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="flex-1 sm:flex-initial border border-border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
            >
              <option value="">{t('ticket.allStatus')}</option>
              <option value="OPEN">{t('ticket.status_OPEN')}</option>
              <option value="IN_PROGRESS">{t('ticket.status_IN_PROGRESS')}</option>
              <option value="WAITING_CUSTOMER">{t('ticket.status_WAITING_CUSTOMER')}</option>
              <option value="RESOLVED">{t('ticket.status_RESOLVED')}</option>
              <option value="CLOSED">{t('ticket.status_CLOSED')}</option>
            </select>

            <select
              value={filters.priority}
              onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
              className="flex-1 sm:flex-initial border border-border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
            >
              <option value="">{t('ticket.allPriority')}</option>
              <option value="LOW">{t('ticket.priority_LOW')}</option>
              <option value="MEDIUM">{t('ticket.priority_MEDIUM')}</option>
              <option value="HIGH">{t('ticket.priority_HIGH')}</option>
              <option value="URGENT">{t('ticket.priority_URGENT')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
            <p className="text-xs text-muted-foreground mt-2">{t('ticket.loading')}</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-8">
            <Ticket className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{t('ticket.noTicketsFound')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t('ticket.ticketNumber')}
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t('ticket.customer')}
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t('ticket.subject')}
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t('ticket.status')}
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t('ticket.priority')}
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                    {t('ticket.messages')}
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                    {t('ticket.created')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => router.push(`/admin/tickets/${ticket.id}`)}
                    className="hover:bg-muted cursor-pointer"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-xs font-mono font-medium text-primary">
                        #{ticket.ticketNumber}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-xs text-foreground">
                        {ticket.customerName}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-foreground line-clamp-2">
                          {ticket.subject}
                        </span>
                        {ticket.category && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium text-foreground whitespace-nowrap"
                            style={{ backgroundColor: ticket.category.color }}
                          >
                            {ticket.category.name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(ticket.status)}`}>
                        {t(`ticket.status_${ticket.status}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getPriorityColor(ticket.priority)}`}>
                        {t(`ticket.priority_${ticket.priority}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap hidden lg:table-cell">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageSquare className="h-3 w-3" />
                        {ticket._count.messages}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground hidden lg:table-cell">
                      {formatWIB(ticket.createdAt, 'd MMM yyyy')}
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="block md:hidden divide-y divide-border">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => router.push(`/admin/tickets/${ticket.id}`)}
                  className="p-3 hover:bg-muted/50 cursor-pointer transition-colors active:bg-muted"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <span className="text-[11px] font-mono font-medium text-primary">
                        #{ticket.ticketNumber}
                      </span>
                      <p className="text-xs font-medium text-foreground mt-0.5 line-clamp-2">{ticket.subject}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap flex-shrink-0 ${getPriorityColor(ticket.priority)}`}>
                      {t(`ticket.priority_${ticket.priority}`)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    <span className="text-[11px] text-muted-foreground">{ticket.customerName}</span>
                    <span className="text-[9px] text-muted-foreground/50">•</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${getStatusColor(ticket.status)}`}>
                      {t(`ticket.status_${ticket.status}`)}
                    </span>
                    {ticket.category && (
                      <>
                        <span className="text-[9px] text-muted-foreground/50">•</span>
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-medium text-foreground"
                          style={{ backgroundColor: ticket.category.color }}
                        >
                          {ticket.category.name}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      {ticket._count.messages}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {formatWIB(ticket.createdAt, 'd MMM yyyy')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Dispatch Modal */}
      {showDispatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => !dispatchLoading && setShowDispatch(false)}>
          <div className="bg-card border border-[#bc13fe]/30 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Send className="w-4 h-4 text-[#bc13fe]" />
                  Kirim Tiket ke Semua Teknisi
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tiket akan dikirim ke {dispatchData?.technicians.length ?? 0} teknisi aktif via WA & notifikasi
                </p>
              </div>
              <button onClick={() => !dispatchLoading && setShowDispatch(false)} className="p-1.5 hover:bg-muted rounded-lg transition">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {dispatchDataLoading && !dispatchData ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-[#bc13fe]" />
              </div>
            ) : (
              <div className="p-5 space-y-4">

                {/* Customer Section */}
                <div className="bg-muted/40 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Data Pelanggan</p>

                  {/* Customer search */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Cari Pelanggan</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        value={customerSearch}
                        onChange={e => handleCustomerSearchChange(e.target.value)}
                        placeholder="Nama, username, atau telepon..."
                        className="w-full pl-9 pr-8 py-2 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-[#bc13fe]/40 outline-none"
                        autoComplete="off"
                      />
                      {customerSearchLoading && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    {dispatchData?.customers && dispatchData.customers.length > 0 && customerSearch && !form.customerId && (
                      <div className="mt-1 bg-background border border-border rounded-lg max-h-36 overflow-y-auto">
                        {dispatchData.customers.map(c => (
                          <button key={c.id} onClick={() => selectCustomer(c)} className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground">{c.name || c.username}</span>
                            <span className="text-muted-foreground">{c.phone}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {form.customerId && (
                      <button onClick={() => setForm(f => ({ ...f, customerId: '' }))} className="mt-1 text-[10px] text-[#bc13fe] hover:underline">
                        Ganti pelanggan
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Nama <span className="text-red-400">*</span></label>
                      <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} placeholder="Nama pelanggan" className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-[#bc13fe]/40 outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Telepon <span className="text-red-400">*</span></label>
                      <input value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} placeholder="08xx..." className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-[#bc13fe]/40 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Alamat</label>
                    <input value={form.customerAddress} onChange={e => setForm(f => ({ ...f, customerAddress: e.target.value }))} placeholder="Alamat pelanggan" className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-[#bc13fe]/40 outline-none" />
                  </div>
                </div>

                {/* Infrastructure Section */}
                <div className="bg-muted/40 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Infrastruktur Jaringan</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Router/NAS</label>
                      <div className="relative">
                        <select value={form.routerId} onChange={e => setForm(f => ({ ...f, routerId: e.target.value }))} className="w-full appearance-none px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-[#bc13fe]/40 outline-none pr-8">
                          <option value="">— Pilih Router —</option>
                          {dispatchData?.routers.map(r => <option key={r.id} value={r.id}>{r.name}{r.nasname ? ` (${r.nasname})` : ''}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">OLT</label>
                      <div className="relative">
                        <select value={form.oltId} onChange={e => setForm(f => ({ ...f, oltId: e.target.value, odcId: '', odpId: '' }))} className="w-full appearance-none px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-[#bc13fe]/40 outline-none pr-8">
                          <option value="">— Pilih OLT —</option>
                          {dispatchData?.olts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">ODC</label>
                      <div className="relative">
                        <select value={form.odcId} onChange={e => setForm(f => ({ ...f, odcId: e.target.value, odpId: '' }))} className="w-full appearance-none px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-[#bc13fe]/40 outline-none pr-8">
                          <option value="">— Pilih ODC —</option>
                          {(dispatchData?.odcs ?? []).filter(o => !form.oltId || o.oltId === form.oltId).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">ODP</label>
                      <div className="relative">
                        <select value={form.odpId} onChange={e => setForm(f => ({ ...f, odpId: e.target.value }))} className="w-full appearance-none px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-[#bc13fe]/40 outline-none pr-8">
                          <option value="">— Pilih ODP —</option>
                          {(dispatchData?.odps ?? []).filter(o => !form.odcId || o.odcId === form.odcId).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ticket Info Section */}
                <div className="bg-muted/40 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Detail Tiket</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Kategori</label>
                      <div className="relative">
                        <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} className="w-full appearance-none px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-[#bc13fe]/40 outline-none pr-8">
                          <option value="">— Pilih Kategori —</option>
                          {dispatchData?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Prioritas</label>
                      <div className="relative">
                        <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="w-full appearance-none px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-[#bc13fe]/40 outline-none pr-8">
                          <option value="LOW">🟢 Rendah</option>
                          <option value="MEDIUM">🟡 Sedang</option>
                          <option value="HIGH">🟠 Tinggi</option>
                          <option value="URGENT">🔴 Urgent</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Subjek <span className="text-red-400">*</span></label>
                    <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Ringkasan masalah" className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-[#bc13fe]/40 outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Deskripsi <span className="text-red-400">*</span></label>
                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Detail masalah yang perlu ditangani teknisi..." rows={4} className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-1 focus:ring-[#bc13fe]/40 outline-none resize-none" />
                  </div>
                </div>

                {/* Technician List */}
                {dispatchData && dispatchData.technicians.length > 0 && (
                  <div className="bg-muted/30 rounded-xl p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Akan dikirim ke {dispatchData.technicians.length} teknisi aktif:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {dispatchData.technicians.map(t => (
                        <span key={t.id} className="px-2 py-0.5 text-[10px] bg-[#bc13fe]/10 text-[#bc13fe] border border-[#bc13fe]/20 rounded-full">{t.name}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer buttons */}
                <div className="flex gap-3 pt-1">
                  <button onClick={() => !dispatchLoading && setShowDispatch(false)} disabled={dispatchLoading} className="flex-1 py-2.5 text-sm font-semibold bg-muted text-foreground border border-border rounded-xl hover:bg-muted/80 transition disabled:opacity-50">
                    Batal
                  </button>
                  <button onClick={handleDispatch} disabled={dispatchLoading} className="flex-[2] py-2.5 text-sm font-semibold bg-gradient-to-r from-[#bc13fe] to-[#9b10d6] text-white rounded-xl shadow-[0_0_15px_rgba(188,19,254,0.4)] hover:shadow-[0_0_25px_rgba(188,19,254,0.6)] transition disabled:opacity-50 flex items-center justify-center gap-2">
                    {dispatchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {dispatchLoading ? 'Mengirim...' : `Kirim ke ${dispatchData?.technicians.length ?? 0} Teknisi`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
