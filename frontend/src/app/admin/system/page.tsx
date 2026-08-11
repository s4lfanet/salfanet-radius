'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, GitBranch, Package, Server, Cpu, Clock,
  AlertCircle, Terminal, Info,
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

function CmdBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      <pre
        className="border border-border/50 rounded-lg px-4 py-3 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto leading-relaxed"
        style={{ backgroundColor: '#0d1b2a', color: '#4ade80' }}
      >
        {children}
      </pre>
      <button
        onClick={() => { navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all opacity-0 group-hover:opacity-100"
      >
        {copied ? '✔ copied' : 'copy'}
      </button>
    </div>
  );
}

export default function SystemPage() {
  const { t } = useTranslation();
  const [info, setInfo]       = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system/info');
      if (res.ok) setInfo(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

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
        <div className="flex items-center gap-2">
          {info && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-xs font-mono font-bold text-cyan-400">
              <Package className="w-3 h-3" />
              v{info.version}
            </div>
          )}
          <button
            onClick={fetchInfo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border hover:border-primary/30 text-muted-foreground text-xs transition-all"
          >
            <RefreshCw className="w-3 h-3" />
            {t('system.refresh')}
          </button>
        </div>
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
          <InfoCard icon={<Package className="w-4 h-4" />}  label={t('system.version')}      value={`v${info.version}`} />
          <InfoCard icon={<GitBranch className="w-4 h-4" />} label={t('system.commit')}       value={info.commit} />
          <InfoCard icon={<Server className="w-4 h-4" />}   label="Node.js"                   value={info.nodeVersion} />
          <InfoCard icon={<Cpu className="w-4 h-4" />}      label="Platform"                  value={info.platform} />
          <InfoCard icon={<Clock className="w-4 h-4" />}    label={t('system.uptime')}        value={formatUptime(info.uptime)} />
          <InfoCard icon={<Terminal className="w-4 h-4" />} label={t('system.remoteCommit')}  value={info.remoteCommit} />
        </div>
      ) : null}

      {/* Commit message */}
      {info?.commitMessage && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/30 border border-border/40 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 flex-shrink-0 text-cyan-400" />
          <span className="font-mono truncate">{info.commitMessage}</span>
        </div>
      )}

      {/* Update available banner */}
      {info?.hasUpdate && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <p className="text-xs font-bold">
            {t('system.updateAvailable')} — {info.commit} → {info.remoteCommit}
          </p>
        </div>
      )}

      {/* Manual update guide */}
      <div className="rounded-xl border border-border/50 bg-card/30 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border-b border-border/40">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-bold text-foreground">Cara Update — via SSH</span>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Update dilakukan manual via SSH ke VPS. Jalankan perintah berikut dari komputer lokal (Windows PowerShell):
          </p>

          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">VPS Lokal</p>
            <CmdBlock>{`echo y | & "C:\\Program Files\\PuTTY\\plink.exe" -ssh root@192.168.54.200 -pw "Seven789@" "cd /var/www/salfanet-radius && bash vps-install/updater.sh --branch master --skip-backup" 2>&1`}</CmdBlock>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">VPS Publik</p>
            <CmdBlock>{`echo y | & "C:\\Program Files\\PuTTY\\plink.exe" -ssh root@103.151.140.110 -pw "Seven789@" "cd /var/www/salfanet-radius && bash vps-install/updater.sh --branch master --skip-backup" 2>&1`}</CmdBlock>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pantau log build (live)</p>
            <CmdBlock>{`echo y | & "C:\\Program Files\\PuTTY\\plink.exe" -ssh root@103.151.140.110 -pw "Seven789@" "tail -f /tmp/update-manual.log" 2>&1`}</CmdBlock>
          </div>
        </div>
      </div>
    </div>
  );
}
