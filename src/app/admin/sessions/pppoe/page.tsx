'use client';

import { useEffect, useState, useCallback } from 'react';
import { Power, RefreshCw, Wifi, Search, Download, Trash2, RotateCcw } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB } from '@/lib/timezone';

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
  user: { 
    id: string; 
    customerId: string;
    name: string; 
    phone: string; 
    profile: string;
    area?: { id: string; name: string } | null;
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

export default function PPPoESessionsPage() {
  const { t } = useTranslation();
  const { addToast, confirm } = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [routers, setRouters] = useState<Router[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [disconnecting, setDisconnecting] = useState(false);
  const [routerFilter, setRouterFilter] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [pageSize, setPageSize] = useState<number>(10);
  const [now, setNow] = useState(() => Date.now());
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());

  // 1-second ticker for live uptime counter
  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  // Use server-computed duration (clock-independent) + elapsed seconds since last fetch.
  // This avoids the clock-skew problem where NAS timestamps are ahead of VPS clock.
  const liveDuration = (serverDuration: number) => {
    const elapsed = Math.floor((now - fetchedAt) / 1000);
    return serverDuration + elapsed;
  };

  const fetchSessions = useCallback(async (page: number = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', pageSize.toString());
      params.set('type', 'pppoe'); // Force PPPoE only
      params.set('live', 'true'); // Merge live bytes dari MikroTik API
      if (routerFilter) params.set('routerId', routerFilter);
      if (searchFilter) params.set('search', searchFilter);

      const res = await fetch(`/api/sessions?${params}`);
      const data = await res.json();
      setSessions(data.sessions || []);
      setFetchedAt(Date.now());
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

  // Format uptime to HH:MM:SS
  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
      message: t('sessions.disconnectPppoeConfirm').replace('{count}', String(sessionIds.length)),
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

  const handleExportExcel = async () => {
    try {
      const params = new URLSearchParams();
      params.set('format', 'excel');
      params.set('mode', 'active');
      params.set('type', 'pppoe');
      if (routerFilter) params.set('routerId', routerFilter);
      if (searchFilter) params.set('username', searchFilter);
      const res = await fetch(`/api/sessions/export?${params}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Sessions-PPPoE-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      addToast({ type: 'error', title: 'Error', description: t('sessions.exportFailed') });
    }
  };

  return (
    <div className="bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
            <Wifi className="w-4 h-4 sm:w-5 sm:h-5 text-[#00f7ff] flex-shrink-0" />
            {t('sessions.pppoeSessions')}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('sessions.monitorPppoe')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleDisconnect(Array.from(selectedSessions))}
            disabled={selectedSessions.size === 0 || disconnecting}
            className="px-3 py-1.5 text-xs font-medium bg-muted hover:bg-muted/80 text-foreground rounded-lg disabled:opacity-50 flex items-center gap-1.5 border border-border"
          >
            <Power className="w-3.5 h-3.5" />
            {t('sessions.kickUserButton')}
          </button>
          <button
            disabled={selectedSessions.size === 0}
            className="px-3 py-1.5 text-xs font-medium bg-success hover:bg-success/90 text-success-foreground rounded-lg disabled:opacity-50 flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('sessions.deleteButton')}
          </button>
          <button
            onClick={() => fetchSessions(1)}
            className="px-3 py-1.5 text-xs font-medium bg-warning hover:bg-warning/90 text-warning-foreground rounded-lg flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t('sessions.resyncButton')}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
          <p className="text-[10px] sm:text-xs text-[#00f7ff] uppercase tracking-wide">{t('sessions.activeSessions')}</p>
          <p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{stats?.pppoe || 0}</p>
        </div>
        <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
          <p className="text-[10px] sm:text-xs text-[#00f7ff] uppercase tracking-wide">↑ {t('sessions.totalUpload')}</p>
          <p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{stats?.totalUploadFormatted || '0 B'}</p>
        </div>
        <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
          <p className="text-[10px] sm:text-xs text-[#00f7ff] uppercase tracking-wide">↓ {t('sessions.totalDownload')}</p>
          <p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{stats?.totalDownloadFormatted || '0 B'}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {/* Filters */}
        <div className="px-3 py-2 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-muted">
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('sessions.search')}:</span>
            <input
              type="text"
              placeholder={t('sessions.searchPlaceholder')}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="px-2 py-1 text-xs border border-border rounded bg-card w-full sm:w-40"
            />
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block lg:hidden divide-y divide-border">
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
                    <span className="font-mono text-xs font-medium text-foreground">
                      {session.user?.customerId || '-'}
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
                    <span className="text-muted-foreground">{t('sessions.customer')}:</span>
                    <span className="font-medium text-foreground">{session.user?.name || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('sessions.username')}:</span>
                    <span className="font-mono text-muted-foreground">{session.username}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('sessions.startTime')}:</span>
                    <span className="text-muted-foreground">{formatDateTime(session.startTime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('sessions.uptime')}:</span>
                    <span className="font-medium text-info">{formatUptime(liveDuration(session.duration))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('sessions.upload')}:</span>
                    <span className="text-info">{session.uploadFormatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('sessions.download')}:</span>
                    <span className="text-success">{session.downloadFormatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('sessions.router')}:</span>
                    <span className="text-muted-foreground">{session.router?.name || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('sessions.server')}:</span>
                    <span className="text-muted-foreground">{session.user?.profile || '-'}</span>
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
        <div className="overflow-x-auto hidden lg:block">
          <table className="w-full text-xs">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-2 py-2 text-left w-8">
                  <input
                    type="checkbox"
                    checked={selectedSessions.size === sessions.length && sessions.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-border w-3.5 h-3.5"
                  />
                </th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.serviceNumber')}</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.customer')}</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.username')}</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.startTime')}</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.lastUpdate')}</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.uptime')}</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">↑ {t('sessions.upload')}</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">↓ {t('sessions.download')}</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.router')}</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.ipAddress')}</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('sessions.macAddress')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && sessions.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">
                    {t('sessions.noPppoeSessions')}
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
                    <td className="px-2 py-2 font-mono text-[10px] text-foreground">{session.user?.customerId || '-'}</td>
                    <td className="px-2 py-2 text-[10px] text-foreground">{session.user?.name || '-'}</td>
                    <td className="px-2 py-2 font-mono text-[10px] text-muted-foreground">{session.username}</td>
                    <td className="px-2 py-2 text-[10px] text-muted-foreground whitespace-nowrap">{formatDateTime(session.startTime)}</td>
                    <td className="px-2 py-2 text-[10px] text-muted-foreground whitespace-nowrap">{formatDateTime(session.lastUpdate)}</td>
                    <td className="px-2 py-2 text-[10px] font-medium text-info">{formatUptime(liveDuration(session.duration))}</td>
                    <td className="px-2 py-2 text-[10px] text-success">{session.uploadFormatted}</td>
                    <td className="px-2 py-2 text-[10px] text-info">{session.downloadFormatted}</td>
                    <td className="px-2 py-2 text-[10px] text-muted-foreground">{session.router?.name || '-'}</td>
                    <td className="px-2 py-2 font-mono text-[10px] text-muted-foreground">{session.framedIpAddress || '-'}</td>
                    <td className="px-2 py-2 font-mono text-[10px] text-muted-foreground">{session.macAddress || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-3 py-2 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2 bg-muted">
          <div className="text-xs text-muted-foreground">
            {t('sessions.showing')} {((pagination.page - 1) * pageSize) + 1} {t('sessions.to')} {Math.min(pagination.page * pageSize, pagination.total)} {t('sessions.of')} {pagination.total} {t('sessions.entries')}
          </div>
          <div className="flex items-center gap-1 flex-wrap justify-center">
            <button
              onClick={() => fetchSessions(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="px-3 py-1 text-xs border border-border rounded disabled:opacity-50 hover:bg-muted/80 text-muted-foreground"
            >
              {t('common.previous')}
            </button>
            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
              let pageNum = pagination.page - 2 + i;
              if (pageNum < 1) pageNum = i + 1;
              if (pageNum > pagination.totalPages) return null;
              return (
                <button
                  key={pageNum}
                  onClick={() => fetchSessions(pageNum)}
                  className={`px-3 py-1 text-xs border rounded ${
                    pageNum === pagination.page 
                      ? 'bg-primary text-primary-foreground border-primary' 
                      : 'border-border hover:bg-muted/80 text-muted-foreground'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => fetchSessions(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
              className="px-3 py-1 text-xs border border-border rounded disabled:opacity-50 hover:bg-muted/80 text-muted-foreground"
            >
              {t('common.next')}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
