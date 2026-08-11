'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { Wifi, Search, RefreshCw, Loader2, Signal, Clock, ArrowDown, ArrowUp } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useTranslation } from '@/hooks/useTranslation';

interface Session {
  id: string;
  username: string;
  sessionId: string;
  framedIpAddress: string;
  macAddress: string;
  startTime: string;
  duration: number;
  durationFormatted: string;
  uploadFormatted: string;
  downloadFormatted: string;
  totalFormatted: string;
  router: { id: string; name: string } | null;
  user: {
    id: string;
    customerId: string;
    name: string;
    phone: string;
    profile: string;
    area?: { id: string; name: string } | null;
  } | null;
}

interface Pagination { total: number; page: number; limit: number; totalPages: number; }
interface Router { id: string; name: string; }

export default function TechnicianOnlinePage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [routerFilter, setRouterFilter] = useState('');
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 20, totalPages: 1 });

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const fetchSessions = useCallback(async (page: number = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (routerFilter) params.set('routerId', routerFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/technician/sessions?${params}`);
      const data = await res.json();
      setSessions(data.sessions || []);
      if (data.pagination) setPagination(data.pagination);
    } catch {
      addToast({ type: 'error', title: 'Failed to load sessions' });
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerFilter, search]);

  useEffect(() => {
    fetch('/api/technician/form-data').then(r => r.json()).then(d => setRouters(d.routers || [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetchSessions(1);
    const interval = setInterval(() => fetchSessions(pagination.page), 15000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSessions]);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-green-500/10 dark:bg-green-500/20 rounded-xl flex items-center justify-center">
            <Wifi className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{t('techPortal.onlineUsers')}</h1>
            <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60">{pagination.total} {t('techPortal.activeUsers')}</p>
          </div>
        </div>
        <button onClick={() => fetchSessions(pagination.page)} title="Perbarui Data" className="p-2 bg-slate-100 dark:bg-[#1a0f35] border border-slate-200 dark:border-[#bc13fe]/20 rounded-xl hover:bg-slate-200 dark:hover:bg-[#bc13fe]/10 transition">
          <RefreshCw className={`w-4 h-4 text-slate-600 dark:text-[#e0d0ff] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('techPortal.search')} className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-[#0a0520] border border-slate-200 dark:border-[#bc13fe]/30 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-[#00f7ff]/30 transition" />
        </div>
        <select value={routerFilter} onChange={(e) => setRouterFilter(e.target.value)} className="px-3 py-2.5 bg-white dark:bg-[#0a0520] border border-slate-200 dark:border-[#bc13fe]/30 rounded-xl text-sm text-slate-900 dark:text-white">
          <option value="">{t('techPortal.allRouters')}</option>
          {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      {/* Loading */}
      {loading && sessions.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#00f7ff]" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-20 text-slate-500 dark:text-[#e0d0ff]/50">
          <Wifi className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t('techPortal.noData')}</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-auto bg-white dark:bg-[#1a0f35]/80 border border-slate-200 dark:border-[#bc13fe]/20 rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#bc13fe]/20 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">Username</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">{t('techPortal.name')}</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">IP</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">MAC</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">Uptime</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">Download</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">Upload</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">Router</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 dark:border-[#bc13fe]/10 hover:bg-slate-50 dark:hover:bg-[#bc13fe]/5 transition">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{s.username}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-[#e0d0ff]/80">{s.user?.name || '-'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-[#e0d0ff]/80 font-mono text-xs">{s.framedIpAddress}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-[#e0d0ff]/80 font-mono text-xs">{s.macAddress}</td>
                    <td className="px-4 py-3 text-green-600 dark:text-green-400 font-mono text-xs">{formatUptime(s.duration)}</td>
                    <td className="px-4 py-3 text-blue-600 dark:text-blue-400 text-xs">{s.downloadFormatted}</td>
                    <td className="px-4 py-3 text-purple-600 dark:text-purple-400 text-xs">{s.uploadFormatted}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-[#e0d0ff]/80">{s.router?.name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {sessions.map((s) => (
              <div key={s.id} className="bg-white dark:bg-[#1a0f35]/80 border border-slate-200 dark:border-[#bc13fe]/20 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{s.username}</p>
                    <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60">{s.user?.name || '-'}</p>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 rounded-lg">
                    <Signal className="w-3 h-3 text-green-500" />
                    <span className="text-xs font-bold text-green-600 dark:text-green-400">{formatUptime(s.duration)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-[#e0d0ff]/50">IP: </span>
                    <span className="font-mono text-slate-700 dark:text-[#e0d0ff]/80">{s.framedIpAddress}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-[#e0d0ff]/50">MAC: </span>
                    <span className="font-mono text-slate-700 dark:text-[#e0d0ff]/80">{s.macAddress?.slice(0, 11)}...</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 pt-1 border-t border-slate-100 dark:border-[#bc13fe]/10">
                  <div className="flex items-center gap-1">
                    <ArrowDown className="w-3 h-3 text-blue-500" />
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{s.downloadFormatted}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <ArrowUp className="w-3 h-3 text-purple-500" />
                    <span className="text-xs font-medium text-purple-600 dark:text-purple-400">{s.uploadFormatted}</span>
                  </div>
                  <div className="ml-auto text-xs text-slate-500 dark:text-[#e0d0ff]/60">{s.router?.name}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60">
                {t('techPortal.page')} {pagination.page} / {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <button onClick={() => fetchSessions(pagination.page - 1)} disabled={pagination.page <= 1} className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-[#1a0f35] border border-slate-200 dark:border-[#bc13fe]/20 rounded-lg disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-[#bc13fe]/10 transition text-slate-700 dark:text-[#e0d0ff]">
                  {t('techPortal.prev')}
                </button>
                <button onClick={() => fetchSessions(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-[#1a0f35] border border-slate-200 dark:border-[#bc13fe]/20 rounded-lg disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-[#bc13fe]/10 transition text-slate-700 dark:text-[#e0d0ff]">
                  {t('techPortal.next')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
