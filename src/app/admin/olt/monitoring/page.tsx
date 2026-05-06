'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Server, RefreshCw, AlertCircle, Activity, WifiOff, Wifi,
  Thermometer, Clock, Search, Settings,
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

export default function OLTMonitoringPage() {
  const [olts, setOlts] = useState<OLT[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchOLTs = useCallback(async () => {
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
    }
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    fetchOLTs();
    const interval = setInterval(fetchOLTs, 30000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, [fetchOLTs]);

  const handleManualPoll = async (oltId: string) => {
    setPolling(oltId);
    try {
      await fetch('/api/olt/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oltId }),
      });
      await fetchOLTs();
    } catch (e) {
      console.error('Poll failed', e);
    } finally {
      setPolling(null);
    }
  };

  const formatUptime = (seconds: bigint | number | null) => {
    if (!seconds) return 'N/A';
    const secs = typeof seconds === 'bigint' ? Number(seconds) : seconds;
    const days = Math.floor(secs / 86400);
    const hours = Math.floor((secs % 86400) / 3600);
    return `${days}d ${hours}h`;
  };

  const onlineCount = olts.filter((o) => o.isOnline).length;
  const totalAlerts = olts.reduce((s, o) => s + (o.unresolvedAlerts || 0), 0);
  const totalOnuOffline = olts.reduce((s, o) => s + (o.offlineOnu || 0), 0);

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
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Activity className="h-5 w-5 text-teal-600" />
            OLT Monitoring
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Real-time monitoring of all OLT devices</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchOLTs}
            className="inline-flex items-center px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </button>
          <Link href="/admin/olt/alerts">
            <button className={`inline-flex items-center px-3 py-1.5 text-xs rounded ${totalAlerts > 0 ? 'bg-red-600 hover:bg-red-700 text-white' : 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
              <AlertCircle className="h-3 w-3 mr-1" />
              Alerts ({totalAlerts})
            </button>
          </Link>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-medium">Total OLT</p>
              <p className="text-xl font-bold text-teal-600">{olts.length}</p>
              <p className="text-[10px] text-gray-400">{onlineCount} online</p>
            </div>
            <Server className="h-6 w-6 text-teal-600" />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-medium">Active Alerts</p>
              <p className="text-xl font-bold text-red-600">{totalAlerts}</p>
              <p className="text-[10px] text-gray-400">Unresolved</p>
            </div>
            <AlertCircle className="h-6 w-6 text-red-500" />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-medium">Total ONU</p>
              <p className="text-xl font-bold text-blue-600">{olts.reduce((s, o) => s + (o.totalOnu || 0), 0)}</p>
              <p className="text-[10px] text-gray-400">{olts.reduce((s, o) => s + (o.onlineOnu || 0), 0)} online</p>
            </div>
            <Activity className="h-6 w-6 text-blue-500" />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-medium">Offline ONU</p>
              <p className="text-xl font-bold text-orange-600">{totalOnuOffline}</p>
              <p className="text-[10px] text-gray-400">Perlu perhatian</p>
            </div>
            <WifiOff className="h-6 w-6 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nama atau IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="all">Semua Status</option>
            <option value="online">Online Only</option>
            <option value="offline">Offline Only</option>
          </select>
        </div>
      </div>

      {/* OLT Grid */}
      {olts.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-12 text-center">
          <Server className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Belum ada OLT</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
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
          {olts.map((olt) => (
            <div
              key={olt.id}
              className={`bg-white dark:bg-gray-900 rounded-lg border ${
                !olt.isOnline && olt.monitoringEnabled
                  ? 'border-red-300 dark:border-red-800'
                  : 'border-gray-200 dark:border-gray-800'
              } p-3 hover:shadow-md transition-shadow`}
            >
              {/* OLT Card Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {olt.isOnline
                    ? <Wifi className="h-4 w-4 text-green-500 flex-shrink-0" />
                    : <WifiOff className="h-4 w-4 text-red-500 flex-shrink-0" />}
                  <div className="min-w-0">
                    <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{olt.name}</h3>
                    <p className="text-[10px] font-mono text-gray-500 dark:text-gray-400">{olt.ipAddress}</p>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0 ml-2">
                  {olt.unresolvedAlerts > 0 && (
                    <span className="px-1.5 py-0.5 text-[9px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded font-bold">
                      {olt.unresolvedAlerts} alert
                    </span>
                  )}
                  {!olt.monitoringEnabled && (
                    <span className="px-1.5 py-0.5 text-[9px] bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">
                      Off
                    </span>
                  )}
                </div>
              </div>

              {/* OLT Info */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                <div>
                  <div className="text-[9px] text-gray-400 uppercase">Vendor</div>
                  <div className="text-[10px] font-medium capitalize text-gray-700 dark:text-gray-300">{olt.vendor ?? '-'}</div>
                </div>
                <div>
                  <div className="text-[9px] text-gray-400 uppercase">Model</div>
                  <div className="text-[10px] font-medium text-gray-700 dark:text-gray-300">{olt.model ?? '-'}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Thermometer className="h-2.5 w-2.5 text-gray-400" />
                  <div>
                    <div className="text-[9px] text-gray-400 uppercase">Suhu</div>
                    <div className={`text-[10px] font-medium ${olt.temperature !== null && olt.temperature > 60 ? 'text-red-600' : 'text-gray-700 dark:text-gray-300'}`}>
                      {olt.temperature !== null ? `${olt.temperature}°C` : 'N/A'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5 text-gray-400" />
                  <div>
                    <div className="text-[9px] text-gray-400 uppercase">Uptime</div>
                    <div className="text-[10px] font-medium text-gray-700 dark:text-gray-300">{formatUptime(olt.uptime)}</div>
                  </div>
                </div>
              </div>

              {/* ONU Stats */}
              <div className="flex gap-2 mb-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                <span className="text-[9px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded font-medium">
                  🟢 {olt.onlineOnu} Online
                </span>
                <span className="text-[9px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded font-medium">
                  🔴 {olt.offlineOnu} Offline
                </span>
                <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                  Total: {olt.totalOnu}
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-1">
                <Link href={`/admin/olt/${olt.id}`} className="flex-1">
                  <button className="w-full inline-flex items-center justify-center px-2 py-1 text-[10px] border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 rounded text-gray-700 dark:text-gray-300">
                    Detail
                  </button>
                </Link>
                <Link href="/admin/network/olts">
                  <button className="inline-flex items-center px-2 py-1 text-[10px] border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 rounded text-gray-700 dark:text-gray-300" title="Pengaturan OLT">
                    <Settings className="h-3 w-3" />
                  </button>
                </Link>
                {olt.monitoringEnabled && (
                  <button
                    onClick={() => handleManualPoll(olt.id)}
                    disabled={polling === olt.id}
                    className="inline-flex items-center px-2 py-1 text-[10px] border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 rounded text-gray-700 dark:text-gray-300 disabled:opacity-50"
                    title="Poll Manual"
                  >
                    <RefreshCw className={`h-3 w-3 ${polling === olt.id ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>

              {olt.lastPollAt && (
                <div className="text-[9px] text-gray-400 text-center mt-1.5">
                  Poll terakhir: {new Date(olt.lastPollAt).toLocaleString('id-ID')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
