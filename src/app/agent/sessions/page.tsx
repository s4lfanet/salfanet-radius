'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { nowWIB } from '@/lib/timezone';
import { format } from 'date-fns';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Wifi,
  WifiOff,
  Users,
  Activity,
  RefreshCcw,
  Search,
} from 'lucide-react';

interface AgentData {
  id: string;
  name: string;
}

interface Session {
  id: string;
  username: string;
  nasIpAddress: string;
  nasPortId: string;
  framedIpAddress: string;
  callingStationId: string;
  calledStationId: string;
  acctSessionId: string;
  acctStartTime: string;
  acctInputOctets: number;
  acctOutputOctets: number;
  acctSessionTime: number;
  expiresAt?: string | null;
  profileName?: string;
  routerName?: string;
}

export default function AgentSessionsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredSessions, setFilteredSessions] = useState<Session[]>([]);
  const [now, setNow] = useState(() => nowWIB().getTime());
  const [stats, setStats] = useState({
    total: 0,
    totalUpload: 0,
    totalDownload: 0,
  });

  // 1-second ticker for live duration counter
  useEffect(() => {
    const ticker = setInterval(() => setNow(nowWIB().getTime()), 1000);
    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    const agentDataStr = localStorage.getItem('agentData');
    if (!agentDataStr) {
      router.push('/agent');
      return;
    }

    const agentData = JSON.parse(agentDataStr);
    setAgent(agentData);
    loadSessions();

    // Auto-refresh setiap 30 detik agar trafik upload/download hotspot ter-update
    // (MikroTik mengirim Interim-Update setiap 60 detik)
    const interval = setInterval(() => {
      loadSessions(true);
    }, 30000);

    // Refresh immediately when tab becomes visible (browser throttles background timers)
    const onVisible = () => {
      if (!document.hidden) loadSessions(true);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router]);

  useEffect(() => {
    if (searchQuery) {
      const filtered = sessions.filter(s => 
        s.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.framedIpAddress?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.callingStationId?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredSessions(filtered);
    } else {
      setFilteredSessions(sessions);
    }
  }, [searchQuery, sessions]);

  const loadSessions = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = localStorage.getItem('agentToken');
      if (!token) { router.push('/agent'); return; }
      const res = await fetch('/api/agent/sessions', {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();

      if (res.ok) {
        setSessions(data.sessions || []);
        setStats({
          total: data.sessions?.length || 0,
          totalUpload: data.sessions?.reduce((sum: number, s: Session) => sum + (s.acctInputOctets || 0), 0) || 0,
          totalDownload: data.sessions?.reduce((sum: number, s: Session) => sum + (s.acctOutputOctets || 0), 0) || 0,
        });
      }
    } catch (error) {
      console.error('Load sessions error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds < 0) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  const formatLocal = (date: Date | string | null, formatStr: string) => {
    if (!date) return '-';
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      return format(d, formatStr);
    } catch {
      return '-';
    }
  };

  const liveDuration = (startTimeStr: string | null) => {
    if (!startTimeStr) return 0;
    const startMs = new Date(startTimeStr).getTime();
    return Math.max(0, Math.floor((now - startMs) / 1000));
  };

  // Countdown from expiresAt (remaining time)
  const liveCountdown = (expiresAtStr: string | null | undefined) => {
    if (!expiresAtStr) return 0;
    return Math.max(0, Math.floor((new Date(expiresAtStr).getTime() - now) / 1000));
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6">
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-[#00f7ff] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-slate-500 dark:text-[#e0d0ff]/70">{t('agent.portal.loadingSessions')}...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">{t('agent.portal.onlineSessions')}</h1>
          <p className="text-xs lg:text-sm text-slate-500 dark:text-[#e0d0ff]/60 mt-1">{t('agent.portal.activeVouchers')}</p>
        </div>
        <button
          onClick={() => loadSessions(false)}
          className="flex items-center gap-2 px-4 py-2 bg-[#bc13fe]/20 hover:bg-[#bc13fe]/30 border border-purple-300 dark:border-[#bc13fe]/30 rounded-xl text-white transition"
        >
          <RefreshCcw className="h-4 w-4" />
          <span className="hidden lg:inline">{t('agent.portal.refresh')}</span>
        </button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/80 dark:bg-[#0a0520]/80 backdrop-blur-xl rounded-xl border-2 border-cyan-200 dark:border-[#00f7ff]/30 p-4 shadow-[0_0_20px_rgba(0,247,255,0.1)]">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#00f7ff]/20 rounded-lg">
              <Users className="h-6 w-6 text-[#00f7ff]" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/70">{t('agent.portal.totalSessions')}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-[#0a0520]/80 backdrop-blur-xl rounded-xl border-2 border-emerald-200 dark:border-[#00ff88]/30 p-4 shadow-[0_0_20px_rgba(0,255,136,0.1)]">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#00ff88]/20 rounded-lg">
              <Activity className="h-6 w-6 text-[#00ff88]" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/70">{t('agent.portal.totalUpload')}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatBytes(stats.totalUpload)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-[#0a0520]/80 backdrop-blur-xl rounded-xl border-2 border-pink-200 dark:border-[#ff44cc]/30 p-4 shadow-[0_0_20px_rgba(255,68,204,0.1)]">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#ff44cc]/20 rounded-lg">
              <Activity className="h-6 w-6 text-[#ff44cc]" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/70">{t('agent.portal.totalDownload')}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatBytes(stats.totalDownload)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white/80 dark:bg-[#0a0520]/80 backdrop-blur-xl rounded-xl border-2 border-purple-300 dark:border-[#bc13fe]/30 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-[#e0d0ff]/50" />
          <input
            type="text"
            placeholder={t('agent.portal.searchSession') + '...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-100 dark:bg-[#0a0520] border-2 border-purple-300 dark:border-[#bc13fe]/30 rounded-lg text-white focus:border-[#00f7ff] outline-none"
          />
        </div>
      </div>

      {/* Sessions List */}
      <div className="bg-white/80 dark:bg-[#0a0520]/80 backdrop-blur-xl rounded-2xl border-2 border-purple-300 dark:border-[#bc13fe]/30 overflow-hidden shadow-[0_0_30px_rgba(188,19,254,0.15)]">
        <div className="px-5 py-4 border-b border-purple-200 dark:border-[#bc13fe]/20">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wifi className="h-5 w-5 text-[#00ff88]" />
            {t('agent.portal.activeSessions')} ({filteredSessions.length})
          </h2>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden divide-y divide-purple-100 dark:divide-[#bc13fe]/10">
          {filteredSessions.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <WifiOff className="h-10 w-10 text-[#e0d0ff]/30 mx-auto mb-2" />
              <p className="text-sm text-slate-500 dark:text-[#e0d0ff]/60">
                {searchQuery ? t('agent.portal.noSearchResults') : t('agent.portal.noActiveSessions')}
              </p>
            </div>
          ) : (
            filteredSessions.map((session) => (
              <div key={session.id} className="p-3 space-y-2 hover:bg-purple-50/50 dark:hover:bg-[#bc13fe]/5 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse flex-shrink-0 mt-1" />
                    <div className="min-w-0">
                      <p className="font-mono font-bold text-sm text-slate-900 dark:text-white truncate">{session.username}</p>
                      <p className="text-[10px] text-slate-500 dark:text-[#e0d0ff]/60">{session.profileName || '-'} · {session.routerName || '-'}</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-white whitespace-nowrap">
                    {session.expiresAt
                      ? formatDuration(liveCountdown(session.expiresAt)) + ' left'
                      : formatDuration(liveDuration(session.acctStartTime))}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400 dark:text-[#e0d0ff]/40">IP:</span>
                    <span className="font-mono text-white">{session.framedIpAddress || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 dark:text-[#e0d0ff]/40">MAC:</span>
                    <span className="font-mono text-slate-500 dark:text-[#e0d0ff]/60 truncate ml-1">{session.callingStationId || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 dark:text-[#e0d0ff]/40">↑ UL:</span>
                    <span className="text-[#00ff88] font-medium">{formatBytes(session.acctInputOctets || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 dark:text-[#e0d0ff]/40">↓ DL:</span>
                    <span className="text-[#ff44cc] font-medium">{formatBytes(session.acctOutputOctets || 0)}</span>
                  </div>
                  <div className="col-span-2 flex justify-between">
                    <span className="text-slate-400 dark:text-[#e0d0ff]/40">Start:</span>
                    <span className="text-slate-500 dark:text-[#e0d0ff]/60">{session.acctStartTime ? formatLocal(session.acctStartTime, 'dd MMM HH:mm') : '-'}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-[#0a0520]/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-cyan-600 dark:text-[#00f7ff] uppercase tracking-wider">{t('agent.portal.username')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-cyan-600 dark:text-[#00f7ff] uppercase tracking-wider">{t('agent.portal.profile')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-cyan-600 dark:text-[#00f7ff] uppercase tracking-wider">{t('agent.portal.router')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-cyan-600 dark:text-[#00f7ff] uppercase tracking-wider">{t('agent.portal.ipAddress')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-cyan-600 dark:text-[#00f7ff] uppercase tracking-wider">{t('agent.portal.macAddress')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-cyan-600 dark:text-[#00f7ff] uppercase tracking-wider">{t('agent.portal.upload')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-cyan-600 dark:text-[#00f7ff] uppercase tracking-wider">{t('agent.portal.download')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-cyan-600 dark:text-[#00f7ff] uppercase tracking-wider">{t('agent.portal.duration')}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-cyan-600 dark:text-[#00f7ff] uppercase tracking-wider">{t('agent.portal.startTime')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#bc13fe]/10">
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <WifiOff className="h-12 w-12 text-[#e0d0ff]/30 mb-3" />
                      <p className="text-sm text-slate-500 dark:text-[#e0d0ff]/60">
                        {searchQuery ? t('agent.portal.noSearchResults') : t('agent.portal.noActiveSessions')}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSessions.map((session) => (
                  <tr key={session.id} className="hover:bg-purple-50/50 dark:hover:bg-[#bc13fe]/5 transition">
                    <td className="px-4 py-3">
                      <p className="font-mono font-bold text-sm text-slate-900 dark:text-white">{session.username}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-[#e0d0ff]/80">
                      {session.profileName || '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-[#e0d0ff]/80">
                      {session.routerName || '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-900 dark:text-white font-mono">{session.framedIpAddress || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-[#e0d0ff]/80 font-mono">{session.callingStationId || '-'}</td>
                    <td className="px-4 py-3 text-xs text-[#00ff88]">{formatBytes(session.acctInputOctets || 0)}</td>
                    <td className="px-4 py-3 text-xs text-[#ff44cc]">{formatBytes(session.acctOutputOctets || 0)}</td>
                    <td className="px-4 py-3 text-xs text-slate-900 dark:text-white">
                      {session.expiresAt
                        ? formatDuration(liveCountdown(session.expiresAt)) + ' left'
                        : formatDuration(liveDuration(session.acctStartTime))}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-[#e0d0ff]/60">
                      {session.acctStartTime ? formatLocal(session.acctStartTime, 'dd MMM HH:mm') : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

