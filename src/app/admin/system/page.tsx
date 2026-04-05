'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  RefreshCw, GitBranch, Package, Server, Cpu, Clock,
  CheckCircle, AlertCircle, Download, ChevronDown, ChevronUp,
  Terminal, Zap, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';

interface SystemInfo {
  version: string;
  commit: string;
  commitFull: string;
  commitDate: string;
  commitMessage: string;
  remoteCommit: string;
  hasUpdate: boolean;
  updateRunning: boolean;
  logExists: boolean;
  nodeVersion: string;
  platform: string;
  uptime: number;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}j ${m}m`;
}

function InfoCard({ icon, label, value, className }: { icon: React.ReactNode; label: string; value: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-border/50', className)}>
      <div className="p-2 rounded-lg bg-primary/10 text-primary dark:text-cyan-400 flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{label}</p>
        <p className="text-sm font-bold text-foreground truncate font-mono">{value}</p>
      </div>
    </div>
  );
}

export default function SystemUpdatePage() {
  const { t } = useTranslation();
  const [info, setInfo]           = useState<SystemInfo | null>(null);
  const [loading, setLoading]     = useState(true);
  const [updating, setUpdating]   = useState(false);
  const [checking, setChecking]   = useState(false);
  const [log, setLog]             = useState('');
  const [showLog, setShowLog]     = useState(false);
  const [updateDone, setUpdateDone] = useState(false);
  const [checkResult, setCheckResult] = useState<{ upToDate?: boolean; changelog?: string; error?: string } | null>(null);
  const [restartWait, setRestartWait] = useState(false);
  const logRef   = useRef<HTMLPreElement>(null);
  const sseRef   = useRef<EventSource | null>(null);

  const fetchInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system/info');
      if (res.ok) setInfo(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // Resume SSE if update was already running when page loaded
  useEffect(() => {
    if (info?.updateRunning && !updating) {
      startSse();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.updateRunning]);

  function startSse(resume = false) {
    if (sseRef.current) sseRef.current.close();
    setUpdating(true);
    setShowLog(true);
    if (!resume) {
      setUpdateDone(false);
      setLog('');
    }

    const es = new EventSource('/api/admin/system/update');
    sseRef.current = es;

    es.onmessage = (e) => {
      let data: any = {};
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      if (data.log) setLog(prev => prev + data.log);
      if (data.done) {
        es.close();
        sseRef.current = null;
        setUpdating(false);
        setUpdateDone(true);
        // Server restarts — poll until it's back
        waitForRestart();
      }
    };

    es.onerror = async () => {
      es.close();
      sseRef.current = null;

      try {
        const res = await fetch('/api/admin/system/update?action=status', { cache: 'no-store' });
        if (res.ok) {
          const status = await res.json();
          if (status?.running) {
            setLog(prev => prev + '\n[INFO] Koneksi log terputus, mencoba sambung ulang...\n');
            setTimeout(() => startSse(true), 1200);
            return;
          }
        }
      } catch {
        // ignore and fall through to restart wait
      }

      if (!updateDone) {
        setRestartWait(true);
        setUpdating(false);
        waitForRestart();
      }
    };
  }

  function waitForRestart() {
    setRestartWait(true);
    const poll = setInterval(async () => {
      try {
        const res = await fetch('/api/admin/system/info', { cache: 'no-store' });
        if (res.ok) {
          clearInterval(poll);
          setRestartWait(false);
          setUpdateDone(true);
          const newInfo = await res.json();
          setInfo(newInfo);
          setLog(prev => prev + '\n\n✔ Server kembali online — update selesai!');
        }
      } catch { /* still restarting */ }
    }, 2000);
  }

  async function handleUpdate(force = false) {
    setCheckResult(null);
    setLog('');
    setUpdateDone(false);

    try {
      const res = await fetch('/api/admin/system/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });

      let data: any = {};
      try { data = await res.json(); } catch { /* empty body */ }

      if (!res.ok) {
        alert(data.error || `Gagal memulai update (HTTP ${res.status})`);
        return;
      }
      startSse();
    } catch (e: any) {
      alert('Gagal memulai update: ' + (e?.message || 'network error'));
    }
  }

  async function handleCheck() {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch('/api/admin/system/update?action=check', {
        method: 'POST',
      });
      let data: any = {};
      try { data = await res.json(); } catch { data = { error: `HTTP ${res.status}` }; }
      setCheckResult(data);
    } catch (e: any) {
      setCheckResult({ error: e?.message || 'network error' });
    } finally {
      setChecking(false);
    }
  }

  async function handleShowLastLog() {
    try {
      const res = await fetch('/api/admin/system/update?action=status');
      let data: any = {};
      try { data = await res.json(); } catch { /* ignore */ }
      setLog(data.log || '(log kosong)');
      setShowLog(true);
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-violet-600 dark:from-cyan-400 dark:to-pink-400 tracking-wider">
            {t('system.title')}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">{t('system.subtitle')}</p>
        </div>
        {info && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-xs font-mono font-bold text-cyan-400">
            <Package className="w-3 h-3" />
            v{info.version}
          </div>
        )}
      </div>

      {/* System Info Cards */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-card/30" />
          ))}
        </div>
      ) : info ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <InfoCard icon={<Package className="w-4 h-4" />}  label={t('system.version')}   value={`v${info.version}`} />
          <InfoCard icon={<GitBranch className="w-4 h-4" />} label={t('system.commit')}    value={info.commit} />
          <InfoCard icon={<Server className="w-4 h-4" />}   label="Node.js"                value={info.nodeVersion} />
          <InfoCard icon={<Cpu className="w-4 h-4" />}      label="Platform"               value={info.platform} />
          <InfoCard icon={<Clock className="w-4 h-4" />}    label={t('system.uptime')}     value={formatUptime(info.uptime)} />
          <InfoCard icon={<Zap className="w-4 h-4" />}      label={t('system.remoteCommit')} value={info.remoteCommit} />
        </div>
      ) : null}

      {/* Commit message */}
      {info?.commitMessage && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/30 border border-border/40 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 flex-shrink-0 text-cyan-400" />
          <span className="font-mono truncate">{info.commitMessage}</span>
        </div>
      )}

      {/* Update status banner */}
      {info?.hasUpdate && !updating && !updateDone && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <p className="text-xs font-bold">{t('system.updateAvailable')} ({info.commit} → {info.remoteCommit})</p>
        </div>
      )}
      {updateDone && !restartWait && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <p className="text-xs font-bold">{t('system.updateSuccess')}</p>
        </div>
      )}
      {restartWait && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 animate-pulse">
          <RefreshCw className="w-4 h-4 flex-shrink-0 animate-spin" />
          <p className="text-xs font-bold">{t('system.restarting')}</p>
        </div>
      )}

      {/* Check result */}
      {checkResult && (
        <div className={cn(
          'p-3 rounded-xl border text-xs',
          checkResult.error
            ? 'bg-red-500/10 border-red-500/30 text-red-400'
            : checkResult.upToDate
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
        )}>
          {checkResult.error ? (
            <p className="font-bold">Error: {checkResult.error}</p>
          ) : checkResult.upToDate ? (
            <p className="font-bold flex items-center gap-2"><CheckCircle className="w-4 h-4" />{t('system.upToDate')}</p>
          ) : (
            <>
              <p className="font-bold mb-2">{t('system.updateAvailable')}:</p>
              <pre className="whitespace-pre-wrap font-mono text-[10px] opacity-80">{checkResult.changelog}</pre>
            </>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleCheck}
          disabled={checking || updating}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-card border border-border hover:border-cyan-500/40 hover:bg-cyan-500/5 text-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', checking && 'animate-spin')} />
          {checking ? t('system.checking') : t('system.checkUpdate')}
        </button>

        <button
          onClick={() => handleUpdate(false)}
          disabled={updating || restartWait}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 text-white hover:from-cyan-400 hover:to-cyan-500 shadow-[0_0_20px_rgba(0,255,255,0.3)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className={cn('w-3.5 h-3.5', updating && 'animate-bounce')} />
          {updating ? t('system.updating') : t('system.applyUpdate')}
        </button>

        <button
          onClick={() => handleUpdate(true)}
          disabled={updating || restartWait}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-card border border-pink-500/30 hover:bg-pink-500/10 text-pink-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Zap className="w-3.5 h-3.5" />
          {t('system.forceUpdate')}
        </button>

        {info?.logExists && !updating && (
          <button
            onClick={handleShowLastLog}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-card border border-border hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all"
          >
            <Terminal className="w-3.5 h-3.5" />
            {t('system.showLastLog')}
          </button>
        )}

        <button
          onClick={fetchInfo}
          className="flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-xl bg-card border border-border hover:border-primary/30 text-muted-foreground transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t('system.refresh')}
        </button>
      </div>

      {/* Live Log */}
      {(showLog || updating) && (
        <div className="rounded-xl border border-border bg-black/80 overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10 cursor-pointer"
            onClick={() => setShowLog(v => !v)}
          >
            <div className="flex items-center gap-2 text-xs font-bold text-[#22d3ee]">
              <Terminal className="w-3.5 h-3.5" />
              {t('system.updateLog')}
              {updating && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-[10px] animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
                  LIVE
                </span>
              )}
            </div>
            {showLog ? <ChevronUp className="w-4 h-4 text-white/50" /> : <ChevronDown className="w-4 h-4 text-white/50" />}
          </div>
          {showLog && (
            <pre
              ref={logRef}
              className="p-4 text-[11px] font-mono text-green-400 leading-relaxed overflow-auto max-h-[400px] whitespace-pre-wrap"
            >
              {log || t('system.waitingLog')}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
