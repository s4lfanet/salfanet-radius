'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Wifi, Search, RefreshCw, Loader2, Signal, ArrowDown, ArrowUp } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useTranslation } from '@/hooks/useTranslation';
import { apiAdmin } from '@/lib/api/client';
import { Pagination } from '@/components/Pagination';
import CustomerDetailSheet, { type DetailCustomer } from '@/components/field/CustomerDetailSheet';
import { ConnectionBadge, SourceBadge, UnreachableNotice } from '@/components/field/ConnectionBadge';

interface Session {
  id: string;
  source: 'radius' | 'mikrotik';
  status: string;
  customer: DetailCustomer;
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
interface Summary { radius: number; mikrotik: number; isolated: number; unreachableRouters: Router[]; }

export default function TechnicianOnlinePage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [routerFilter, setRouterFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [detail, setDetail] = useState<Session | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const pageRef = useRef(1);

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
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
      if (sourceFilter) params.set('source', sourceFilter);
      if (search) params.set('search', search);

      const data = await apiAdmin<{ sessions?: Session[]; pagination?: Pagination; summary?: Summary }>(`/api/technician/sessions?${params}`, { cache: 'no-store' });
      setSessions(data.sessions || []);
      if (data.summary) setSummary(data.summary);
      if (data.pagination) { setPagination(data.pagination); pageRef.current = data.pagination.page; }
    } catch {
      if (!isPoll) addToast({ type: 'error', title: 'Failed to load sessions' });
    } finally {
      if (!isPoll) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerFilter, sourceFilter, search]);

  useEffect(() => {
    apiAdmin<{ routers?: Router[] }>('/api/technician/form-data').then(d => setRouters(d.routers || [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetchSessions(1);
    const interval = setInterval(() => fetchSessions(pageRef.current, true), 5000);
    return () => clearInterval(interval);
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
            <p className="text-xs text-muted-foreground">
              {pagination.total} {t('techPortal.activeUsers')}
              {summary && <span className="ml-1">· RADIUS {summary.radius} · Lokal {summary.mikrotik}</span>}
            </p>
          </div>
        </div>
        <button onClick={() => fetchSessions(pagination.page)} title="Perbarui Data" className="p-2 bg-slate-100 dark:bg-muted border border-border rounded-xl hover:bg-slate-200 dark:hover:bg-primary/10 transition">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <UnreachableNotice routers={summary?.unreachableRouters} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('techPortal.search')} className="w-full pl-10 pr-3 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500/30 transition" />
        </div>
        <select value={routerFilter} onChange={(e) => setRouterFilter(e.target.value)} className="px-3 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground">
          <option value="">{t('techPortal.allRouters')}</option>
          {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="px-3 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground">
          <option value="">Semua sumber</option>
          <option value="radius">RADIUS</option>
          <option value="mikrotik">Lokal (MikroTik)</option>
        </select>
      </div>

      {/* Loading */}
      {loading && sessions.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
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
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Sumber</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} onClick={() => setDetail(s)} className="border-b border-slate-100 dark:border-border hover:bg-slate-50 dark:hover:bg-primary/10 transition cursor-pointer">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {s.username}
                      {(s.status === 'isolated' || s.status === 'suspended') && <span className="ml-2 rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-bold text-orange-600 dark:text-orange-400">Isolir</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground/80">{s.user?.name || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground/80 font-mono text-xs">{s.framedIpAddress}</td>
                    <td className="px-4 py-3 text-muted-foreground/80 font-mono text-xs">{s.macAddress}</td>
                    <td className="px-4 py-3 text-green-600 dark:text-green-400 font-mono text-xs">{formatUptime(s.duration)}</td>
                    <td className="px-4 py-3 text-blue-600 dark:text-blue-400 text-xs">{s.downloadFormatted}</td>
                    <td className="px-4 py-3 text-purple-600 dark:text-primary text-xs">{s.uploadFormatted}</td>
                    <td className="px-4 py-3 text-muted-foreground/80">{s.router?.name || '-'}</td>
                    <td className="px-4 py-3"><SourceBadge source={s.source} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {sessions.map((s) => (
              <div key={s.id} onClick={() => setDetail(s)} className="bg-card border border-border rounded-2xl p-4 space-y-2 cursor-pointer">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-foreground flex items-center gap-1.5">{s.username} <SourceBadge source={s.source} />{(s.status === 'isolated' || s.status === 'suspended') && <span className="rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-bold text-orange-600 dark:text-orange-400">Isolir</span>}</p>
                    <p className="text-xs text-muted-foreground">{s.user?.name || '-'}</p>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 rounded-lg">
                    <Signal className="w-3 h-3 text-green-500" />
                    <span className="text-xs font-bold text-green-600 dark:text-green-400">{formatUptime(s.duration)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground/70">IP: </span>
                    <span className="font-mono text-foreground/80">{s.framedIpAddress}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/70">MAC: </span>
                    <span className="font-mono text-foreground/80">{s.macAddress?.slice(0, 11)}...</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 pt-1 border-t border-slate-100 dark:border-border">
                  <div className="flex items-center gap-1">
                    <ArrowDown className="w-3 h-3 text-blue-500" />
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{s.downloadFormatted}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <ArrowUp className="w-3 h-3 text-primary" />
                    <span className="text-xs font-medium text-purple-600 dark:text-primary">{s.uploadFormatted}</span>
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

      {detail && (
        <CustomerDetailSheet customer={detail.customer} onClose={() => setDetail(null)}>
          <div className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Koneksi</span>
              <span className="flex items-center gap-2"><SourceBadge source={detail.source} /><ConnectionBadge state="online" /></span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">IP</dt><dd className="text-right font-mono text-foreground">{detail.framedIpAddress || '-'}</dd>
              <dt className="text-muted-foreground">MAC</dt><dd className="text-right font-mono text-foreground">{detail.macAddress || '-'}</dd>
              <dt className="text-muted-foreground">Uptime</dt><dd className="text-right text-foreground">{formatUptime(detail.duration)}</dd>
              <dt className="text-muted-foreground">Download</dt><dd className="text-right text-foreground">{detail.downloadFormatted}</dd>
              <dt className="text-muted-foreground">Upload</dt><dd className="text-right text-foreground">{detail.uploadFormatted}</dd>
              <dt className="text-muted-foreground">Router</dt><dd className="text-right text-foreground">{detail.router?.name || '-'}</dd>
            </dl>
          </div>
        </CustomerDetailSheet>
      )}
    </div>
  );
}
