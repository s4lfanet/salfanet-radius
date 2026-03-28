'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import {
  Monitor,
  Wifi,
  WifiOff,
  AlertTriangle,
  Users,
  RefreshCcw,
  Loader2,
  Activity,
  Download,
  Upload,
  Clock,
  MapPin,
  Package,
  Phone,
} from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { formatWIB } from '@/lib/timezone';

interface OnlineSession {
  uniqueId: string;
  username: string;
  framedIp: string;
  nasIp: string;
  uptimeSec: number;
  uptime: string;
  download: string;
  upload: string;
  customerName: string | null;
  customerPhone: string | null;
  profileName: string | null;
  areaName: string | null;
  routerName: string | null;
}

interface IsolatedCustomer {
  id: string;
  username: string;
  name: string;
  phone: string;
  expiredAt: string | null;
  profile: { name: string } | null;
  area: { name: string } | null;
}

interface Stats {
  online: number;
  isolated: number;
  active: number;
  stopped: number;
  total: number;
}

export default function TechnicianMonitorPage() {
  const { addToast } = useToast();
  const [sessions, setSessions] = useState<OnlineSession[]>([]);
  const [isolatedCustomers, setIsolatedCustomers] = useState<IsolatedCustomer[]>([]);
  const [stats, setStats] = useState<Stats>({ online: 0, isolated: 0, active: 0, stopped: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'online' | 'isolated'>('online');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/technician/monitor');
      if (!res.ok) throw new Error('Gagal memuat data');
      const data = await res.json();
      setStats(data.stats);
      setSessions(data.sessions ?? []);
      setIsolatedCustomers(data.isolatedCustomers ?? []);
      setLastRefresh(new Date());
    } catch {
      addToast({ type: 'error', title: 'Gagal', description: 'Tidak dapat memuat data monitor' });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  function formatDate(d: string) {
    return formatWIB(d, 'dd MMM yyyy');
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Monitor className="w-5 h-5 text-[#00f7ff]" />
            Monitor Pelanggan
          </h1>
          <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60 mt-0.5">
            Status online/offline pelanggan · Auto-refresh 30d
            {lastRefresh && (
              <span className="ml-1.5 text-[#00f7ff]/60">
                (Terakhir: {lastRefresh.toLocaleTimeString('id-ID')})
              </span>
            )}
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-slate-100 dark:bg-[#00f7ff]/10 hover:bg-slate-200 dark:hover:bg-[#00f7ff]/20 text-slate-700 dark:text-[#00f7ff] border border-slate-200 dark:border-[#00f7ff]/30 rounded-xl transition-all"
        >
          <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Online Sekarang',
            value: stats.online,
            icon: <Wifi className="w-4 h-4" />,
            color: 'text-green-500 bg-green-500/10 border-green-500/30',
            pulse: true,
          },
          {
            label: 'Terisolasi',
            value: stats.isolated,
            icon: <AlertTriangle className="w-4 h-4" />,
            color: 'text-red-500 bg-red-500/10 border-red-500/30',
            pulse: false,
          },
          {
            label: 'Aktif',
            value: stats.active,
            icon: <Activity className="w-4 h-4" />,
            color: 'text-[#00f7ff] bg-[#00f7ff]/10 border-[#00f7ff]/30',
            pulse: false,
          },
          {
            label: 'Total Pelanggan',
            value: stats.total,
            icon: <Users className="w-4 h-4" />,
            color: 'text-[#bc13fe] bg-[#bc13fe]/10 border-[#bc13fe]/30',
            pulse: false,
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60">{s.label}</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{s.value}</p>
              </div>
              <div className={`p-2.5 rounded-xl border ${s.color} relative`}>
                {s.icon}
                {s.pulse && s.value > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tab selector */}
      <div className="flex gap-2 bg-slate-100 dark:bg-slate-800/60 rounded-2xl p-1.5 w-fit">
        <button
          onClick={() => setTab('online')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            tab === 'online'
              ? 'bg-white dark:bg-[#00f7ff]/10 text-green-600 dark:text-[#00f7ff] shadow-sm border border-green-200 dark:border-[#00f7ff]/30'
              : 'text-slate-500 dark:text-[#e0d0ff]/60 hover:text-slate-800 dark:hover:text-white'
          }`}
        >
          <Wifi className="w-3.5 h-3.5" />
          Online ({stats.online})
        </button>
        <button
          onClick={() => setTab('isolated')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            tab === 'isolated'
              ? 'bg-white dark:bg-red-500/10 text-red-600 dark:text-red-400 shadow-sm border border-red-200 dark:border-red-500/30'
              : 'text-slate-500 dark:text-[#e0d0ff]/60 hover:text-slate-800 dark:hover:text-white'
          }`}
        >
          <WifiOff className="w-3.5 h-3.5" />
          Terisolasi ({stats.isolated})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[#00f7ff]" />
        </div>
      ) : tab === 'online' ? (
        /* Online sessions table */
        <>
          {sessions.length === 0 ? (
            <div className="text-center py-16">
              <WifiOff className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500 dark:text-[#e0d0ff]/50">Tidak ada sesi online saat ini</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden">
              {/* Mobile Card View */}
            <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-700/30">
              {sessions.map((s) => (
                <div key={s.uniqueId} className="p-3 space-y-2 hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse flex-shrink-0 mt-1" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{s.customerName ?? s.username}</p>
                        <p className="text-[10px] font-mono text-[#00f7ff]">{s.username}</p>
                        {s.customerPhone && (
                          <p className="text-[10px] text-slate-400 flex items-center gap-0.5">
                            <Phone className="w-2.5 h-2.5" />{s.customerPhone}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">{s.uptime}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] ml-4">
                    <div className="flex justify-between">
                      <span className="text-slate-400">IP:</span>
                      <span className="font-mono text-slate-900 dark:text-white">{s.framedIp}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Router:</span>
                      <span className="text-slate-500 dark:text-slate-400 truncate ml-1">{s.routerName ?? s.nasIp}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">↓ DL:</span>
                      <span className="font-semibold text-green-600 dark:text-green-400">{s.download}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">↑ UL:</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{s.upload}</span>
                    </div>
                    {s.areaName && (
                      <div className="col-span-2 flex items-center gap-1 text-slate-400">
                        <MapPin className="w-2.5 h-2.5" /><span>{s.areaName}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="overflow-x-auto hidden md:block">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700/50">
                      <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Pelanggan / Username
                      </th>
                      <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        IP / Router
                      </th>
                      <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <Clock className="w-3 h-3 inline mr-1" />Uptime
                      </th>
                      <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <Download className="w-3 h-3 inline mr-1" />DL
                      </th>
                      <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <Upload className="w-3 h-3 inline mr-1" />UL
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/30">
                    {sessions.map((s) => (
                      <tr
                        key={s.uniqueId}
                        className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-700/20"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse flex-shrink-0" />
                            <div>
                              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                                {s.customerName ?? s.username}
                              </p>
                              <p className="text-[10px] text-[#00f7ff] font-mono">{s.username}</p>
                              {s.customerPhone && (
                                <p className="text-[10px] text-slate-400 flex items-center gap-0.5">
                                  <Phone className="w-2.5 h-2.5" />
                                  {s.customerPhone}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-mono text-slate-900 dark:text-white">{s.framedIp}</p>
                          <p className="text-[10px] text-slate-400">{s.routerName ?? s.nasIp}</p>
                          {s.areaName && (
                            <p className="text-[10px] text-slate-400 flex items-center gap-0.5">
                              <MapPin className="w-2.5 h-2.5" />
                              {s.areaName}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                            {s.uptime}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                            {s.download}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                            {s.upload}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Isolated customers */
        <>
          {isolatedCustomers.length === 0 ? (
            <div className="text-center py-16">
              <Wifi className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500 dark:text-[#e0d0ff]/50">Tidak ada pelanggan terisolasi</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {isolatedCustomers.map((c) => (
                <div
                  key={c.id}
                  className="bg-white dark:bg-slate-800/60 rounded-2xl border border-red-200 dark:border-red-500/20 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-red-50 dark:bg-red-500/10 rounded-xl border border-red-200 dark:border-red-500/20 flex-shrink-0">
                      <WifiOff className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {c.name}
                      </p>
                      <p className="text-[10px] font-mono text-[#bc13fe]">{c.username}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-0.5 mt-0.5">
                        <Phone className="w-2.5 h-2.5" />
                        {c.phone}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-red-100 dark:border-red-500/10 space-y-1">
                    {c.profile && (
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                        <Package className="w-3 h-3 flex-shrink-0" />
                        <span>{c.profile.name}</span>
                      </div>
                    )}
                    {c.area && (
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span>{c.area.name}</span>
                      </div>
                    )}
                    {c.expiredAt && (
                      <div className="flex items-center gap-1.5 text-[10px] text-red-500 dark:text-red-400">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        <span>Kadaluarsa: {formatDate(c.expiredAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
