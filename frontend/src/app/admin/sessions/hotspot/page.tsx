'use client';

import { useEffect, useState, useCallback } from 'react';
import { Power, RefreshCw, WifiOff, Search, RotateCcw } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB, nowWIB } from '@/lib/timezone';

interface Session {
  id: string;
  username: string;
  sessionId: string;
  type: 'pppoe' | 'hotspot';
  nasIpAddress: string;
  framedIpAddress: string;
  macAddress: string;
  startTime: string;
  lastUpdate: string | null;
  duration: number;
  durationFormatted: string;
  uploadFormatted: string;
  downloadFormatted: string;
  totalFormatted: string;
  router: { id: string; name: string } | null;
  voucher: {
    id: string;
    status: string;
    profile: string;
    batchCode?: string;

    expiresAt?: string | null;
    agent?: { id: string; name: string } | null;
  } | null;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Stats {
  total: number;
  pppoe: number;
  hotspot: number;
  totalBandwidthFormatted: string;
  totalUploadFormatted: string;
  totalDownloadFormatted: string;
}

interface Router {
  id: string;
  name: string;
}

export default function HotspotSessionsPage() {
  const { t } = useTranslation();
  const { addToast, confirm } = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [routers, setRouters] = useState<Router[]>([]);
  const [now, setNow] = useState(() => nowWIB().getTime());

  // 1-second ticker for live duration
  useEffect(() => {
    const ticker = setInterval(() => setNow(nowWIB().getTime()), 1000);
    return () => clearInterval(ticker);
  }, []);
  const [loading, setLoading] = useState(true);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [disconnecting, setDisconnecting] = useState(false);
  const [routerFilter, setRouterFilter] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [pageSize, setPageSize] = useState<number>(25);
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch('/api/sessions/sync?type=hotspot', { method: 'POST' });
      await fetchSessions(1);
      addToast({ type: 'success', title: t('common.success'), description: t('sessions.syncComplete') });
    } catch {
      addToast({ type: 'error', title: t('common.error'), description: t('sessions.syncFailed') });
    } finally {
      setSyncing(false);
    }
  };

  const fetchSessions = useCallback(async (page: number = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', pageSize.toString());
      params.set('type', 'hotspot'); // Force Hotspot only
      params.set('live', 'true'); // Merge live bytes from MikroTik API
      if (routerFilter) params.set('routerId', routerFilter);
      if (searchFilter) params.set('search', searchFilter);

      const res = await fetch(`/api/sessions?${params}`);
      const data = await res.json();
      setSessions(data.sessions || []);
      setStats(data.stats);
      if (data.pagination) {
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [pageSize, routerFilter, searchFilter]);

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return formatWIB(dateStr, 'dd/MM/yyyy HH:mm');
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds < 0) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const liveDuration = (startTimeStr: string | null) => {
    if (!startTimeStr) return 0;
    return Math.max(0, Math.floor((now - new Date(startTimeStr).getTime()) / 1000));
  };

  // Remaining time countdown from expiresAt
  const liveCountdown = (expiresAtStr: string | null | undefined) => {
    if (!expiresAtStr) return 0;
    return Math.max(0, Math.floor((new Date(expiresAtStr).getTime() - now) / 1000));
  };

  const fetchRouters = async () => {
    try {
      const res = await fetch('/api/network/routers');
      const data = await res.json();
      setRouters(data.routers || []);
    } catch (error) {
      console.error('Failed to fetch routers:', error);
    }
  };

  useEffect(() => {
    fetchRouters();
  }, []);

  useEffect(() => {
    fetchSessions(1);
    const interval = setInterval(() => {
      fetchSessions(pagination.page);
    }, 10000); // 10 detik — live bytes dari MikroTik API
    return () => clearInterval(interval);
  }, [fetchSessions, pagination.page]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSessions(new Set(sessions.map(s => s.sessionId)));
    } else {
      setSelectedSessions(new Set());
    }
  };

  const handleSelectSession = (sessionId: string, checked: boolean) => {
    const newSelected = new Set(selectedSessions);
    if (checked) {
      newSelected.add(sessionId);
    } else {
      newSelected.delete(sessionId);
    }
    setSelectedSessions(newSelected);
  };

  const handleDisconnect = async (sessionIds: string[]) => {
    if (sessionIds.length === 0) return;

    if (!await confirm({
      title: t('sessions.kickUser'),
      message: t('sessions.disconnectHotspotConfirm').replace('{count}', String(sessionIds.length)),
      confirmText: t('sessions.yesKick'),
      cancelText: t('common.cancel'),
      variant: 'danger',
    })) return;

    setDisconnecting(true);
    try {
      const res = await fetch('/api/sessions/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionIds })
      });
      const data = await res.json();
      if (data.success) {
        addToast({ type: 'success', title: t('common.success'), description: t('sessions.sessionsDisconnected').replace('{count}', data.disconnected) });
        setSelectedSessions(new Set());
        fetchSessions(pagination.page);
      } else {
        addToast({ type: 'error', title: t('common.error'), description: data.error || t('sessions.failedDisconnect') });
      }
    } catch {
      addToast({ type: 'error', title: t('common.error'), description: t('sessions.failedDisconnectSession') });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
              <WifiOff className="w-5 h-5 text-[#ff44cc]" />
              {t('sessions.hotspotSessions')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('sessions.monitorHotspot')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDisconnect(Array.from(selectedSessions))}
              disabled={selectedSessions.size === 0 || disconnecting}
              className="px-3 py-1.5 text-xs font-medium bg-destructive/100 hover:bg-destructive text-destructive-foreground rounded-lg disabled:opacity-50 flex items-center gap-1.5"
            >
              <Power className="w-3.5 h-3.5" />
              {t('sessions.disconnect')} ({selectedSessions.size})
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-3 py-1.5 text-xs font-medium bg-warning hover:bg-warning/90 text-warning-foreground rounded-lg flex items-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? t('common.loading') : t('sessions.resyncButton')}
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <p className="text-xs text-[#00f7ff] uppercase tracking-wide">{t('sessions.activeSessions')}</p>
            <p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{stats?.hotspot || 0}</p>
          </div>
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <p className="text-xs text-[#00f7ff] uppercase tracking-wide">↑ {t('sessions.totalUpload')}</p>
            <p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{stats?.totalUploadFormatted || '0 B'}</p>
          </div>
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <p className="text-xs text-[#00f7ff] uppercase tracking-wide">↓ {t('sessions.totalDownload')}</p>
            <p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{stats?.totalDownloadFormatted || '0 B'}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2">
            <select
              value={routerFilter}
              onChange={(e) => setRouterFilter(e.target.value)}
              className="px-2 py-1.5 text-xs border border-border rounded-lg bg-card"
            >
              <option value="">{t('common.allRouters')}</option>
              {routers.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('sessions.searchPlaceholder')}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-xs border border-border rounded-lg bg-card w-48"
            />
          </div>
        </div>

        {/* Sessions Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {/* Pagination Header */}
          <div className="px-3 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-muted">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{t('sessions.show')}</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2 py-1 border border-border rounded text-xs bg-card"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>{t('sessions.entries')}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {t('sessions.showing')} {((pagination.page - 1) * pageSize) + 1} {t('sessions.to')} {Math.min(pagination.page * pageSize, pagination.total)} {t('sessions.of')} {pagination.total} {t('sessions.entries')}
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="block md:hidden divide-y divide-border">
            {sessions.length === 0 ? (
              <div className="px-3 py-8 text-center text-muted-foreground text-xs">
                {loading ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : t('sessions.noData')}
              </div>
            ) : (
              sessions.map((session) => (
                <div key={session.id} className="p-3 hover:bg-muted">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedSessions.has(session.sessionId)}
                        onChange={(e) => handleSelectSession(session.sessionId, e.target.checked)}
                        className="rounded border-border w-3.5 h-3.5"
                      />
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                        <WifiOff className="w-2.5 h-2.5" />
                        HOTSPOT
                      </span>
                    </div>
                    <button
                      onClick={() => handleDisconnect([session.sessionId])}
                      disabled={disconnecting}
                      className="p-1.5 text-destructive hover:bg-destructive/10 rounded disabled:opacity-50"
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('sessions.username')}:</span>
                      <span className="font-mono font-medium text-foreground">{session.username}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('sessions.profile')}:</span>
                      <span className="text-muted-foreground">{session.voucher?.profile || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('sessions.startTime')}:</span>
                      <span className="text-muted-foreground">{formatDateTime(session.startTime)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('sessions.duration')}:</span>
                      <span className="font-medium text-primary dark:text-primary">
                        {session.voucher?.expiresAt
                          ? formatDuration(liveCountdown(session.voucher.expiresAt)) + ' left'
                          : formatDuration(liveDuration(session.startTime))}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('sessions.uploadDownload')}:</span>
                      <span>
                        <span className="text-success">↑{session.uploadFormatted}</span>
                        {' / '}
                        <span className="text-accent">↓{session.downloadFormatted}</span>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('sessions.router')}:</span>
                      <span className="text-muted-foreground">{session.router?.name || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('sessions.ipAddress')}:</span>
                      <span className="font-mono text-muted-foreground">{session.framedIpAddress || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('sessions.macAddress')}:</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{session.macAddress || '-'}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-2 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={selectedSessions.size === sessions.length && sessions.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-border w-3.5 h-3.5"
                    />
                  </th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.username')}</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.profile')}</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.agent')}</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.startTime')}</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.lastUpdate')}</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.duration')}</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">↑ {t('sessions.upload')}</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">↓ {t('sessions.download')}</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.router')}</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.ipAddress')}</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.macAddress')}</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-3 py-8 text-center text-muted-foreground text-xs">
                      {loading ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : t('common.noData')}
                    </td>
                  </tr>
                ) : (
                  sessions.map((session) => (
                    <tr key={session.id} className="hover:bg-muted">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selectedSessions.has(session.sessionId)}
                          onChange={(e) => handleSelectSession(session.sessionId, e.target.checked)}
                          className="rounded border-border w-3.5 h-3.5"
                        />
                      </td>
                      <td className="px-2 py-2 font-mono text-[10px] text-foreground">{session.username}</td>
                      <td className="px-2 py-2 text-[10px]">
                        {session.voucher?.profile || '-'}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-muted-foreground">
                        {session.voucher?.agent?.name || '-'}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatDateTime(session.startTime)}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatDateTime(session.lastUpdate)}
                      </td>
                      <td className="px-2 py-2 text-[10px] font-medium text-primary dark:text-primary">
                        {session.voucher?.expiresAt
                          ? formatDuration(liveCountdown(session.voucher.expiresAt)) + ' left'
                          : formatDuration(liveDuration(session.startTime))}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-success">{session.uploadFormatted}</td>
                      <td className="px-2 py-2 text-[10px] text-accent">{session.downloadFormatted}</td>
                      <td className="px-2 py-2 text-[10px] text-muted-foreground">
                        {session.router?.name || '-'}
                      </td>
                      <td className="px-2 py-2 font-mono text-[10px] text-muted-foreground">
                        {session.framedIpAddress || '-'}
                      </td>
                      <td className="px-2 py-2 font-mono text-[9px] text-muted-foreground">
                        {session.macAddress || '-'}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => handleDisconnect([session.sessionId])}
                          disabled={disconnecting}
                          className="p-1 text-destructive hover:bg-destructive/10 rounded disabled:opacity-50"
                          title={t('sessions.disconnect')}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {pagination.totalPages > 1 && (
            <div className="px-3 py-2 border-t border-border flex items-center justify-between bg-muted">
              <div className="text-xs text-muted-foreground">
                {t('common.page')} {pagination.page} {t('sessions.of')} {pagination.totalPages}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => fetchSessions(1)}
                  disabled={pagination.page === 1}
                  className="px-2 py-1 text-xs border rounded disabled:opacity-50 hover:bg-muted"
                >
                  {t('common.first')}
                </button>
                <button
                  onClick={() => fetchSessions(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="px-2 py-1 text-xs border rounded disabled:opacity-50 hover:bg-muted"
                >
                  {t('common.prev')}
                </button>
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  let pageNum = pagination.page - 2 + i;
                  if (pageNum < 1) pageNum = i + 1;
                  if (pageNum > pagination.totalPages) return null;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => fetchSessions(pageNum)}
                      className={`px-2.5 py-1 text-xs border rounded ${pageNum === pagination.page
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'hover:bg-muted'
                        }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => fetchSessions(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className="px-2 py-1 text-xs border rounded disabled:opacity-50 hover:bg-muted"
                >
                  {t('common.next')}
                </button>
                <button
                  onClick={() => fetchSessions(pagination.totalPages)}
                  disabled={pagination.page === pagination.totalPages}
                  className="px-2 py-1 text-xs border rounded disabled:opacity-50 hover:bg-muted"
                >
                  {t('common.last')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
