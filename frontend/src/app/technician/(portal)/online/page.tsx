'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Wifi, Search, RefreshCw, Loader2, Signal, ArrowDown, ArrowUp } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useTranslation } from '@/hooks/useTranslation';
import { apiAdmin } from '@/lib/api/client';
import { Pagination } from '@/components/Pagination';

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
  const pageRef = useRef(1);

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const fetchSessions = useCallback(async (page: number = 1, isPoll = false) => {
    try {
      if (!isPoll) setLoading(true);
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (routerFilter) params.set('routerId', routerFilter);
      if (search) params.set('search', search);

      const data = await apiAdmin<{ sessions?: Session[]; pagination?: Pagination }>(`/api/technician/sessions?${params}`, { cache: 'no-store' });
      setSessions(data.sessions || []);
      if (data.pagination) { setPagination(data.pagination); pageRef.current = data.pagination.page; }
    } catch {
      if (!isPoll) addToast({ type: 'error', title: 'Failed to load sessions' });
    } finally {
      if (!isPoll) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerFilter, search]);

  useEffect(() => {
    apiAdmin<{ routers?: Router[] }>('/api/technician/form-data').then(d => setRouters(d.routers || [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetchSessions(1);
    const interval = setInterval(() => fetchSessions(pageRef.current, true), 5000);
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
            <h1 className="text-lg font-bold text-foreground">{t('techPortal.onlineUsers')}</h1>
            <p className="text-xs text-muted-foreground">{pagination.total} {t('techPortal.activeUsers')}</p>
          </div>
        </div>
        <button onClick={() => fetchSessions(pagination.page)} title="Perbarui Data" className="p-2 bg-slate-100 dark:bg-[#1a0f35] border border-border rounded-xl hover:bg-slate-200 dark:hover:bg-[#bc13fe]/10 transition">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('techPortal.search')} className="w-full pl-10 pr-3 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-slate-400 focus:ring-2 focus:ring-[#00f7ff]/30 transition" />
        </div>
        <select value={routerFilter} onChange={(e) => setRouterFilter(e.target.value)} className="px-3 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground">
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
        <div className="text-center py-20 text-muted-foreground/70">
          <Wifi className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t('techPortal.noData')}</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-auto bg-card border border-border rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Username</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">{t('techPortal.name')}</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">IP</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">MAC</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Uptime</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Download</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Upload</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Router</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 dark:border-[#bc13fe]/10 hover:bg-slate-50 dark:hover:bg-[#bc13fe]/5 transition">
                    <td className="px-4 py-3 font-medium text-foreground">{s.username}</td>
                    <td className="px-4 py-3 text-muted-foreground/80">{s.user?.name || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground/80 font-mono text-xs">{s.framedIpAddress}</td>
                    <td className="px-4 py-3 text-muted-foreground/80 font-mono text-xs">{s.macAddress}</td>
                    <td className="px-4 py-3 text-green-600 dark:text-green-400 font-mono text-xs">{formatUptime(s.duration)}</td>
                    <td className="px-4 py-3 text-blue-600 dark:text-blue-400 text-xs">{s.downloadFormatted}</td>
                    <td className="px-4 py-3 text-purple-600 dark:text-purple-400 text-xs">{s.uploadFormatted}</td>
                    <td className="px-4 py-3 text-muted-foreground/80">{s.router?.name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {sessions.map((s) => (
              <div key={s.id} className="bg-card border border-border rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-foreground">{s.username}</p>
                    <p className="text-xs text-muted-foreground">{s.user?.name || '-'}</p>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 rounded-lg">
                    <Signal className="w-3 h-3 text-green-500" />
                    <span className="text-xs font-bold text-green-600 dark:text-green-400">{formatUptime(s.duration)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground/70">IP: </span>
                    <span className="font-mono text-foreground/80">{s.framedIpAddress}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/70">MAC: </span>
                    <span className="font-mono text-foreground/80">{s.macAddress?.slice(0, 11)}...</span>
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
                  <div className="ml-auto text-xs text-muted-foreground">{s.router?.name}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={(p) => fetchSessions(p)}
          />
        </>
      )}
    </div>
  );
}
