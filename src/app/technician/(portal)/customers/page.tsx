'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  RefreshCcw,
  Loader2,
  Wifi,
  WifiOff,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  X,
  MapPin,
  Phone,
} from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { formatWIB } from '@/lib/timezone';
import { useTranslation } from '@/hooks/useTranslation';

interface Customer {
  id: string;
  username: string;
  customerId: string | null;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  status: string;
  subscriptionType: string;
  expiredAt: string | null;
  createdAt: string;
  profile: {
    id: string;
    name: string;
    price: number;
    downloadSpeed: number;
    uploadSpeed: number;
  } | null;
  area: { id: string; name: string } | null;
  router: { id: string; name: string } | null;
}

const STATUS_CONFIG: Record<string, { dot: string; badge: string; icon: React.ReactNode }> = {
  active: {
    dot: 'bg-green-400',
    badge: 'bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/30',
    icon: <Wifi className="w-3 h-3" />,
  },
  isolated: {
    dot: 'bg-red-400',
    badge: 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30',
    icon: <WifiOff className="w-3 h-3" />,
  },
  stopped: {
    dot: 'bg-slate-400',
    badge: 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600/40',
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  blocked: {
    dot: 'bg-orange-400',
    badge: 'bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30',
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  expired: {
    dot: 'bg-amber-400',
    badge: 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30',
    icon: <Clock className="w-3 h-3" />,
  },
};

const STATUS_FILTERS = ['active', 'isolated', 'stopped', 'blocked', 'expired'] as const;

function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
}

function formatDate(d: string) {
  return formatWIB(d, 'dd MMM yyyy');
}

function isNearExpiry(d: string | null) {
  if (!d) return false;
  return (new Date(d).getTime() - Date.now()) / 86400000 <= 7;
}

export default function TechnicianCustomersPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();

  const STATUS_LABEL: Record<string, string> = {
    active: t('techPortal.active'),
    isolated: t('techPortal.isolated'),
    stopped: t('techPortal.stopped'),
    blocked: t('techPortal.blocked'),
    expired: t('techPortal.expired'),
  };

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const LIMIT = 30;

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search) p.set('search', search);
      if (filterStatus) p.set('status', filterStatus);
      const res = await fetch(`/api/technician/customers?${p}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCustomers(data.users ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } catch {
      addToast({ type: 'error', title: t('techPortal.failedLoadCustomers') });
    } finally {
      setLoading(false);
    }
  }, [page, search, filterStatus, addToast]);

  useEffect(() => { setPage(1); }, [search, filterStatus]);
  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  return (
    <div className="p-4 lg:p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {t('techPortal.customers')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/50 mt-0.5">
            {total.toLocaleString('id-ID')} {t('techPortal.customersSubtitle')}
          </p>
        </div>
        <button
          onClick={loadCustomers}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white dark:bg-[#1a0f35]/80 hover:bg-slate-50 dark:hover:bg-[#bc13fe]/10 text-slate-600 dark:text-[#e0d0ff] border border-slate-200 dark:border-[#bc13fe]/30 rounded-xl transition-all shadow-sm"
        >
          <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{t('techPortal.refresh')}</span>
        </button>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('techPortal.searchCustomer')}
            className="w-full pl-9 pr-8 py-2.5 text-sm bg-white dark:bg-[#1a0f35]/80 border border-slate-200 dark:border-[#bc13fe]/20 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#bc13fe]/50 focus:ring-1 focus:ring-[#bc13fe]/20 transition"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition">
              <X className="w-3 h-3 text-slate-400" />
            </button>
          )}
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2.5 text-sm bg-white dark:bg-[#1a0f35]/80 border border-slate-200 dark:border-[#bc13fe]/20 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-[#bc13fe]/50 transition sm:w-40"
        >
          <option value="">{t('techPortal.allStatus')}</option>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>

      {/* Active filter pill */}
      {filterStatus && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-[#e0d0ff]/50">Filter:</span>
          <button
            onClick={() => setFilterStatus('')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${STATUS_CONFIG[filterStatus]?.badge ?? ''}`}
          >
            {STATUS_CONFIG[filterStatus]?.icon}
            {STATUS_LABEL[filterStatus]}
            <X className="w-2.5 h-2.5 ml-0.5" />
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#bc13fe]" />
          <p className="text-xs text-slate-400 dark:text-[#e0d0ff]/40">{t('techPortal.loading')}</p>
        </div>
      ) : customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-[#1a0f35]/60 flex items-center justify-center">
            <Users className="w-7 h-7 text-slate-300 dark:text-[#bc13fe]/30" />
          </div>
          <p className="text-sm text-slate-500 dark:text-[#e0d0ff]/40">{t('techPortal.noData')}</p>
          {search && (
            <button onClick={() => setSearch('')} className="text-xs text-[#bc13fe] hover:underline">
              Clear search
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="block md:hidden divide-y divide-slate-100 dark:divide-[#bc13fe]/8">
            {customers.map((c) => {
              const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.active;
              const nearExpiry = isNearExpiry(c.expiredAt);
              return (
                <div key={c.id} className="p-3 space-y-2 hover:bg-slate-50 dark:hover:bg-[#bc13fe]/5 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-8 rounded-full flex-shrink-0 ${cfg.dot}`} />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white text-[13px] truncate">{c.name}</p>
                        <p className="text-[11px] font-mono text-[#00bcd4] dark:text-[#00f7ff] truncate">
                          {c.username}
                          {c.customerId && <span className="ml-1.5 text-[#bc13fe]/60">#{c.customerId}</span>}
                        </p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full flex-shrink-0 ${cfg.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] ml-3.5">
                    <div className="flex items-center gap-1 text-slate-500 dark:text-[#e0d0ff]/50">
                      <Phone className="w-2.5 h-2.5 flex-shrink-0" />
                      <span>{c.phone}</span>
                    </div>
                    {c.profile ? (
                      <div className="text-right">
                        <span className="font-medium text-slate-700 dark:text-[#e0d0ff]/80">{c.profile.name}</span>
                        <span className="text-slate-400 dark:text-[#e0d0ff]/40 ml-1">{formatIDR(c.profile.price)}</span>
                      </div>
                    ) : <div />}
                    {c.area && (
                      <div className="flex items-center gap-1 text-slate-400 dark:text-[#e0d0ff]/40">
                        <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                        <span className="truncate">{c.area.name}</span>
                      </div>
                    )}
                    {c.router && (
                      <div className="flex items-center gap-1 text-slate-400 dark:text-[#e0d0ff]/35">
                        <Wifi className="w-2.5 h-2.5 flex-shrink-0" />
                        <span className="truncate">{c.router.name}</span>
                      </div>
                    )}
                    {c.expiredAt && (
                      <div className={`col-span-2 flex items-center gap-1 ${nearExpiry ? 'text-red-500 dark:text-red-400 font-semibold' : 'text-slate-500 dark:text-[#e0d0ff]/50'}`}>
                        <CalendarDays className="w-3 h-3 flex-shrink-0" />
                        <span>Expired: {formatDate(c.expiredAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table */}
          <div className="bg-white dark:bg-[#1a0f35]/60 rounded-2xl border border-slate-200 dark:border-[#bc13fe]/15 overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-[#bc13fe]/10 bg-slate-50 dark:bg-[#0a0520]/40">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#e0d0ff]/50 whitespace-nowrap">
                      {t('techPortal.name')} / Username
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#e0d0ff]/50 whitespace-nowrap">
                      {t('techPortal.phone')}
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#e0d0ff]/50 whitespace-nowrap">
                      Paket
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#e0d0ff]/50 whitespace-nowrap">
                      Area / Router
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#e0d0ff]/50 whitespace-nowrap">
                      Expired
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#e0d0ff]/50 whitespace-nowrap">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#bc13fe]/8">
                  {customers.map((c) => {
                    const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.active;
                    const nearExpiry = isNearExpiry(c.expiredAt);
                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-slate-50 dark:hover:bg-[#bc13fe]/5 transition-colors"
                      >
                        {/* Name + Username */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className={`w-1.5 h-8 rounded-full flex-shrink-0 ${cfg.dot}`} />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-white text-[13px] truncate max-w-[160px]">
                                {c.name}
                              </p>
                              <p className="text-[11px] font-mono text-[#00bcd4] dark:text-[#00f7ff] truncate">
                                {c.username}
                                {c.customerId && (
                                  <span className="ml-1.5 text-[#bc13fe]/60 dark:text-[#bc13fe]/50">
                                    #{c.customerId}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Phone */}
                        <td className="px-4 py-3">
                          <span className="text-[12px] text-slate-600 dark:text-[#e0d0ff]/70 whitespace-nowrap">
                            {c.phone}
                          </span>
                        </td>

                        {/* Package */}
                        <td className="px-4 py-3">
                          {c.profile ? (
                            <div>
                              <p className="text-[12px] font-medium text-slate-700 dark:text-[#e0d0ff]/80 whitespace-nowrap">
                                {c.profile.name}
                              </p>
                              <p className="text-[11px] text-slate-400 dark:text-[#e0d0ff]/40">
                                {formatIDR(c.profile.price)}
                              </p>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-300 dark:text-slate-600">-</span>
                          )}
                        </td>

                        {/* Area / Router */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            {c.area && (
                              <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-[#e0d0ff]/50">
                                <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                                <span className="truncate max-w-[100px]">{c.area.name}</span>
                              </div>
                            )}
                            {c.router && (
                              <div className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-[#e0d0ff]/35">
                                <Wifi className="w-2.5 h-2.5 flex-shrink-0" />
                                <span className="truncate max-w-[100px]">{c.router.name}</span>
                              </div>
                            )}
                            {!c.area && !c.router && (
                              <span className="text-[11px] text-slate-300 dark:text-slate-600">-</span>
                            )}
                          </div>
                        </td>

                        {/* Expiry */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {c.expiredAt ? (
                            <div className={`flex items-center gap-1 text-[12px] ${nearExpiry ? 'text-red-500 dark:text-red-400 font-semibold' : 'text-slate-500 dark:text-[#e0d0ff]/50'}`}>
                              <CalendarDays className="w-3 h-3 flex-shrink-0" />
                              {formatDate(c.expiredAt)}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-300 dark:text-slate-600">-</span>
                          )}
                        </td>

                        {/* Status badge */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full ${cfg.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
                            {STATUS_LABEL[c.status] ?? c.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400 dark:text-[#e0d0ff]/40">
                {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} dari {total.toLocaleString('id-ID')}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-xl bg-white dark:bg-[#1a0f35]/60 border border-slate-200 dark:border-[#bc13fe]/20 text-slate-600 dark:text-[#e0d0ff] disabled:opacity-30 hover:border-[#bc13fe]/40 transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-[#e0d0ff]/50">
                  {page} / {pages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                  className="p-2 rounded-xl bg-white dark:bg-[#1a0f35]/60 border border-slate-200 dark:border-[#bc13fe]/20 text-slate-600 dark:text-[#e0d0ff] disabled:opacity-30 hover:border-[#bc13fe]/40 transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
