'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Server, RefreshCw, AlertCircle, Activity, WifiOff, Wifi,
  Thermometer, Clock, Search, Settings, Users, ChevronDown,
  ArrowUpDown, Zap,
} from 'lucide-react';

interface OLT {
  id: string;
  name: string;
  ipAddress: string;
  vendor: string | null;
  model: string | null;
  isOnline: boolean;
  temperature: number | null;
  uptime: bigint | number | null;
  totalOnu: number;
  onlineOnu: number;
  offlineOnu: number;
  lastPollAt: string | null;
  monitoringEnabled: boolean;
  unresolvedAlerts: number;
}

type SortKey = 'name' | 'alerts' | 'offline' | 'status';

const REFRESH_INTERVAL = 30;

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Belum pernah';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}d lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}j lalu`;
  return `${Math.floor(diff / 86400)}h lalu`;
}

function tempColor(t: number | null): string {
  if (t === null) return 'text-slate-400';
  if (t >= 65) return 'text-red-600 dark:text-red-400 font-bold';
  if (t >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

function uptimeStr(seconds: bigint | number | null): string {
  if (!seconds) return 'N/A';
  const s = typeof seconds === 'bigint' ? Number(seconds) : seconds;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function OLTMonitoringPage() {
  const [olts, setOlts] = useState<OLT[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [polling, setPolling] = useState<Set<string>>(new Set());
  const [pollingAll, setPollingAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const countdownRef = useRef(REFRESH_INTERVAL);

  const fetchOLTs = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/olt/monitoring?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOlts(data.olts ?? []);
      }
    } catch (e) {
      console.error('Failed to fetch OLTs', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      countdownRef.current = REFRESH_INTERVAL;
      setCountdown(REFRESH_INTERVAL);
    }
  }, [searchTerm, statusFilter]);

  // Auto-refresh with countdown
  useEffect(() => {
    fetchOLTs(true);
    const tick = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        fetchOLTs(true);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [fetchOLTs]);

  const handleManualPoll = async (oltId: string) => {
    setPolling((prev) => new Set(prev).add(oltId));
    try {
      await fetch('/api/olt/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oltId }),
      });
      await fetchOLTs(true);
    } catch (e) {
      console.error('Poll failed', e);
    } finally {
      setPolling((prev) => { const n = new Set(prev); n.delete(oltId); return n; });
    }
  };

  const handlePollAll = async () => {
    setPollingAll(true);
    const enabledOlts = olts.filter((o) => o.monitoringEnabled);
    await Promise.allSettled(
      enabledOlts.map((o) =>
        fetch('/api/olt/monitoring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oltId: o.id }),
        })
      )
    );
    await fetchOLTs(true);
    setPollingAll(false);
  };

  const sortedOlts = [...olts].sort((a, b) => {
    if (sortKey === 'alerts') return (b.unresolvedAlerts || 0) - (a.unresolvedAlerts || 0);
    if (sortKey === 'offline') return (b.offlineOnu || 0) - (a.offlineOnu || 0);
    if (sortKey === 'status') {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  });

  const onlineCount = olts.filter((o) => o.isOnline).length;
  const totalAlerts = olts.reduce((s, o) => s + (o.unresolvedAlerts || 0), 0);
  const totalOnuOffline = olts.reduce((s, o) => s + (o.offlineOnu || 0), 0);
  const totalOnuOnline = olts.reduce((s, o) => s + (o.onlineOnu || 0), 0);
  const totalOnu = olts.reduce((s, o) => s + (o.totalOnu || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Activity className="h-5 w-5 text-teal-600" />
            OLT Monitoring
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {onlineCount}/{olts.length} online — auto refresh dalam{' '}
            <span className={countdown <= 5 ? 'text-amber-500 font-semibold' : ''}>{countdown}d</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => fetchOLTs(false)}
            disabled={refreshing}
            className="inline-flex items-center px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded text-slate-700 dark:text-slate-300 disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {olts.some((o) => o.monitoringEnabled) && (
            <button
              onClick={handlePollAll}
              disabled={pollingAll}
              className="inline-flex items-center px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded disabled:opacity-60"
            >
              <Zap className={`h-3 w-3 mr-1 ${pollingAll ? 'animate-pulse' : ''}`} />
              Poll Semua
            </button>
          )}
          <Link href="/admin/olt/alerts">
            <button className={`inline-flex items-center px-3 py-1.5 text-xs rounded ${
              totalAlerts > 0
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}>
              <AlertCircle className="h-3 w-3 mr-1" />
              Alerts {totalAlerts > 0 && `(${totalAlerts})`}
            </button>
          </Link>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* OLT Status */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-slate-500 uppercase font-medium tracking-wide">OLT</p>
            <Server className="h-4 w-4 text-teal-500" />
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{olts.length}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] text-slate-500">{onlineCount} online</span>
            {olts.length - onlineCount > 0 && (
              <>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">{olts.length - onlineCount} offline</span>
              </>
            )}
          </div>
        </div>

        {/* Alerts */}
        <div className={`rounded-lg border p-3 ${
          totalAlerts > 0
            ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-slate-500 uppercase font-medium tracking-wide">Alert Aktif</p>
            <AlertCircle className={`h-4 w-4 ${totalAlerts > 0 ? 'text-red-500' : 'text-slate-400'}`} />
          </div>
          <p className={`text-2xl font-bold ${totalAlerts > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>
            {totalAlerts}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">{totalAlerts > 0 ? 'Perlu ditangani' : 'Semua normal'}</p>
        </div>

        {/* ONU Total */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-slate-500 uppercase font-medium tracking-wide">Total ONU</p>
            <Users className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{totalOnu}</p>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: totalOnu ? `${Math.round((totalOnuOnline / totalOnu) * 100)}%` : '0%' }}
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {totalOnuOnline} online ({totalOnu ? Math.round((totalOnuOnline / totalOnu) * 100) : 0}%)
          </p>
        </div>

        {/* ONU Offline */}
        <div className={`rounded-lg border p-3 ${
          totalOnuOffline > 0
            ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-slate-500 uppercase font-medium tracking-wide">ONU Offline</p>
            <WifiOff className={`h-4 w-4 ${totalOnuOffline > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
          </div>
          <p className={`text-2xl font-bold ${totalOnuOffline > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-100'}`}>
            {totalOnuOffline}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">{totalOnuOffline > 0 ? 'Perlu perhatian' : 'Semua up'}</p>
        </div>
      </div>

      {/* Filters + Sort */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama atau IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="all">Semua Status</option>
              <option value="online">Online Only</option>
              <option value="offline">Offline Only</option>
            </select>
            <div className="relative">
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="pl-7 pr-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 appearance-none"
              >
                <option value="status">Urutkan: Status</option>
                <option value="name">Urutkan: Nama</option>
                <option value="alerts">Urutkan: Alert</option>
                <option value="offline">Urutkan: Offline ONU</option>
              </select>
              <ArrowUpDown className="absolute left-2 top-2 h-3 w-3 text-slate-400 pointer-events-none" />
              <ChevronDown className="absolute right-1.5 top-2 h-3 w-3 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* OLT Grid */}
      {sortedOlts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-12 text-center">
          <Server className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Belum ada OLT</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {searchTerm || statusFilter !== 'all'
              ? 'Coba ubah filter pencarian'
              : 'Tambah OLT dari menu Network → OLT, lalu aktifkan monitoring'}
          </p>
          <Link href="/admin/network/olts" className="mt-4 inline-flex items-center px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded">
            <Server className="h-3 w-3 mr-1" />
            Kelola OLT
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedOlts.map((olt) => {
            const isPollActive = polling.has(olt.id);
            const onlinePct = olt.totalOnu > 0 ? Math.round((olt.onlineOnu / olt.totalOnu) * 100) : 0;
            const isOffline = !olt.isOnline && olt.monitoringEnabled;

            return (
              <div
                key={olt.id}
                className={`bg-white dark:bg-slate-900 rounded-lg border transition-shadow hover:shadow-md ${
                  isOffline
                    ? 'border-red-300 dark:border-red-800'
                    : olt.unresolvedAlerts > 0
                      ? 'border-amber-300 dark:border-amber-700'
                      : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                {/* Card Header */}
                <div className={`px-3 pt-3 pb-2 flex items-start justify-between ${
                  isOffline ? 'border-b border-red-100 dark:border-red-900/50' : 'border-b border-slate-100 dark:border-slate-800'
                }`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="relative flex-shrink-0">
                      {olt.isOnline
                        ? (
                          <>
                            <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-30 animate-ping" />
                            <Wifi className="h-4 w-4 text-emerald-500 relative" />
                          </>
                        )
                        : <WifiOff className="h-4 w-4 text-red-500" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{olt.name}</h3>
                      <p className="text-[10px] font-mono text-slate-400">{olt.ipAddress}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    {olt.unresolvedAlerts > 0 && (
                      <Link href="/admin/olt/alerts">
                        <span className="px-1.5 py-0.5 text-[9px] bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 rounded font-bold cursor-pointer hover:bg-red-200">
                          {olt.unresolvedAlerts}⚠
                        </span>
                      </Link>
                    )}
                    {!olt.monitoringEnabled && (
                      <span className="px-1.5 py-0.5 text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 rounded">
                        Mon off
                      </span>
                    )}
                  </div>
                </div>

                {/* ONU Progress */}
                <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-slate-400 uppercase tracking-wide">ONU</span>
                    <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
                      {olt.onlineOnu}/{olt.totalOnu}
                      <span className={`ml-1 ${onlinePct < 80 && olt.totalOnu > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        ({onlinePct}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        onlinePct >= 90 ? 'bg-emerald-500' : onlinePct >= 70 ? 'bg-amber-400' : 'bg-red-500'
                      }`}
                      style={{ width: `${onlinePct}%` }}
                    />
                  </div>
                  {olt.offlineOnu > 0 && (
                    <p className="text-[9px] text-red-600 dark:text-red-400 mt-0.5">{olt.offlineOnu} offline</p>
                  )}
                </div>

                {/* Device Info */}
                <div className="px-3 py-2 grid grid-cols-3 gap-x-2 border-b border-slate-100 dark:border-slate-800 text-center">
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase">Model</div>
                    <div className="text-[10px] font-medium text-slate-700 dark:text-slate-300 truncate">{olt.model ?? '-'}</div>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-0.5 text-[9px] text-slate-400 uppercase">
                      <Thermometer className="h-2.5 w-2.5" />Suhu
                    </div>
                    <div className={`text-[10px] font-semibold ${tempColor(olt.temperature)}`}>
                      {olt.temperature !== null ? `${olt.temperature}°C` : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-0.5 text-[9px] text-slate-400 uppercase">
                      <Clock className="h-2.5 w-2.5" />Uptime
                    </div>
                    <div className="text-[10px] font-medium text-slate-700 dark:text-slate-300">{uptimeStr(olt.uptime)}</div>
                  </div>
                </div>

                {/* Actions + Timestamp */}
                <div className="px-3 py-2 flex items-center gap-1">
                  <Link href={`/admin/olt/${olt.id}`} className="flex-1">
                    <button className="w-full inline-flex items-center justify-center px-2 py-1 text-[10px] bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/50 rounded text-teal-700 dark:text-teal-400 font-medium">
                      Detail
                    </button>
                  </Link>
                  <Link href="/admin/network/olts">
                    <button className="inline-flex items-center px-2 py-1 text-[10px] border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded text-slate-600 dark:text-slate-400" title="Pengaturan OLT">
                      <Settings className="h-3 w-3" />
                    </button>
                  </Link>
                  {olt.monitoringEnabled && (
                    <button
                      onClick={() => handleManualPoll(olt.id)}
                      disabled={isPollActive || pollingAll}
                      className="inline-flex items-center px-2 py-1 text-[10px] border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded text-slate-600 dark:text-slate-400 disabled:opacity-50"
                      title="Poll Manual"
                    >
                      <RefreshCw className={`h-3 w-3 ${isPollActive ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                  <span className="ml-auto text-[9px] text-slate-400 shrink-0">
                    {relativeTime(olt.lastPollAt)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
