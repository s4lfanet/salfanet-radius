'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  RefreshCw, GitBranch, Package, Server, Cpu, Clock,
  AlertCircle, Terminal, Info, Download, CheckCircle2, XCircle,
  GitCommit, User, Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';
import { useApiQuery } from '@/lib/api/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { apiAdmin } from '@/lib/api';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';

interface SystemInfo {
  version: string;
  baseVersion: string;
  commit: string;
  commitFull: string;
  commitDate: string;
  commitMessage: string;
  gitBranch: string;
  totalCommits: number;
  behindCount: number;
  remoteCommit: string;
  hasUpdate: boolean;
  updateRunning: boolean;
  logExists: boolean;
  nodeVersion: string;
  platform: string;
  uptime: number;
}

interface ChangelogCommit {
  hash: string;
  date: string;
  author: string;
  subject: string;
}

interface ChangelogResponse {
  success: boolean;
  hasUpdate: boolean;
  localCommit: string;
  remoteCommit: string;
  commits: ChangelogCommit[];
}

interface UpdateStep {
  step: string;
  status: 'success' | 'error' | 'skipped';
  output?: string;
}

interface UpdateResponse {
  success: boolean;
  message?: string;
  error?: string;
  newCommit?: string;
  steps?: UpdateStep[];
  status?: UpdateStatus;
}

interface UpdateStatus {
  phase: 'idle' | 'running' | 'done' | 'error';
  step?: string;
  newCommit?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}j ${m}m`;
}

const STEP_ORDER = ['Git pull', 'Prisma db push', 'Backend build', 'Frontend build', 'PM2 restart', 'Complete', 'Starting...'];
function stepOrder(step: string): number {
  const idx = STEP_ORDER.indexOf(step);
  return idx === -1 ? 99 : idx;
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr === 'unknown') return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
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
  const queryClient = useQueryClient();

  const { data: info, isLoading: loading, refetch: refetchInfo } = useApiQuery<SystemInfo>('/api/admin/system/info', { staleTime: 30000 });

  const [changelog, setChangelog] = useState<ChangelogResponse | null>(null);
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchChangelog = useCallback(async () => {
    setChangelogLoading(true);
    setShowChangelog(true);
    try {
      const res = await apiAdmin<ChangelogResponse>('/api/admin/system/changelog');
      setChangelog(res);
    } catch (err: any) {
      await showError('Gagal memuat changelog: ' + (err.message || 'Unknown error'));
    } finally {
      setChangelogLoading(false);
    }
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const pollUpdateStatus = useCallback(async () => {
    try {
      const res = await apiAdmin<{ success: boolean; status: UpdateStatus }>('/api/admin/system/changelog?action=status');
      if (res.status) {
        setUpdateStatus(res.status);
        if (res.status.phase === 'done') {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setUpdating(false);
          await showSuccess(`Update berhasil! Commit: ${res.status.newCommit || 'OK'}`);
          queryClient.invalidateQueries({ queryKey: ['/api/admin/system/info'] });
          await refetchInfo();
          await fetchChangelog();
        } else if (res.status.phase === 'error') {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setUpdating(false);
          await showError(`Update gagal: ${res.status.error || 'unknown error'} (step: ${res.status.step || '?'})`);
        }
      }
    } catch (err) {
      console.error('Poll status error:', err);
    }
  }, [queryClient, refetchInfo, fetchChangelog]);

  const runUpdate = useCallback(async () => {
    const confirmed = await showConfirm(
      'Sistem akan melakukan git pull, build, dan restart semua service. Pastikan tidak ada user yang sedang aktif. Lanjutkan?',
      'Konfirmasi Update',
      'Ya, Update Sekarang',
      'Batal'
    );
    if (!confirmed) return;

    setUpdating(true);
    setUpdateStatus({ phase: 'running', step: 'Starting...' });

    try {
      const res = await apiAdmin<UpdateResponse>('/api/admin/system/changelog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update' }),
      });

      if (res.status?.phase === 'running' || res.success) {
        // Start polling every 3 seconds
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(pollUpdateStatus, 3000);
        // Immediate first poll
        setTimeout(pollUpdateStatus, 500);
      } else {
        await showError(res.error || 'Update gagal. Cek log langkah-langkah di bawah.');
        setUpdating(false);
        setUpdateStatus({ phase: 'error', error: res.error });
      }
    } catch (err: any) {
      let parsedError = err.message;
      try {
        const match = err.message?.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          parsedError = parsed.error || parsed.detail || err.message;
        }
      } catch { /* keep original */ }
      await showError('Update gagal: ' + parsedError);
      setUpdating(false);
      setUpdateStatus({ phase: 'error', error: parsedError });
    }
  }, [pollUpdateStatus]);

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
            onClick={() => refetchInfo()}
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
          <InfoCard icon={<GitBranch className="w-4 h-4" />} label="Branch"                    value={info.gitBranch || 'master'} />
          <InfoCard icon={<GitCommit className="w-4 h-4" />} label={t('system.commit')}       value={info.commit} />
          <InfoCard icon={<Server className="w-4 h-4" />}   label="Node.js"                   value={info.nodeVersion} />
          <InfoCard icon={<Cpu className="w-4 h-4" />}      label="Platform"                  value={info.platform} />
          <InfoCard icon={<Clock className="w-4 h-4" />}    label={t('system.uptime')}        value={formatUptime(info.uptime)} />
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
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p className="text-xs font-bold">
              {t('system.updateAvailable')} — {info.commit} → {info.remoteCommit} ({info.behindCount || '?'} commit{info.behindCount !== 1 ? 's' : ''} behind)
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchChangelog}
              disabled={changelogLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold transition-all"
            >
              {changelogLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <GitCommit className="w-3 h-3" />}
              Lihat Changelog
            </button>
            <button
              onClick={runUpdate}
              disabled={updating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all disabled:opacity-50"
            >
              {updating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              Update Sekarang
            </button>
          </div>
        </div>
      )}

      {/* Up to date banner */}
      {info && !info.hasUpdate && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <p className="text-xs font-bold">
              Sistem sudah up to date ({info.commit}) — {info.totalCommits || 0} total commits di branch {info.gitBranch || 'master'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchChangelog}
              disabled={changelogLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 text-xs font-bold transition-all"
            >
              {changelogLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <GitCommit className="w-3 h-3" />}
              Lihat Changelog
            </button>
          </div>
        </div>
      )}

      {/* Changelog section */}
      {showChangelog && (
        <div className="rounded-xl border border-border/50 bg-card/30 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-border/40">
            <div className="flex items-center gap-2">
              <GitCommit className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-bold text-foreground">
                Changelog {changelog?.hasUpdate ? `( ${changelog.commits.length} commit baru )` : '( 20 commit terakhir )'}
              </span>
            </div>
            <button onClick={() => setShowChangelog(false)} className="text-muted-foreground hover:text-foreground text-xs">Tutup</button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {changelogLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => (<div key={i} className="h-12 rounded-lg bg-card/30 animate-pulse" />))}
              </div>
            ) : changelog?.commits?.length ? (
              <div className="divide-y divide-border/30">
                {changelog.commits.map((commit, idx) => (
                  <div key={commit.hash + idx} className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors">
                    <div className={cn('flex-shrink-0 w-2 h-2 rounded-full mt-1.5', changelog.hasUpdate && idx === 0 ? 'bg-amber-400' : 'bg-cyan-400/60')} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{commit.subject}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                        <span className="font-mono text-cyan-400/80">{commit.hash}</span>
                        <span className="flex items-center gap-1"><User className="w-2.5 h-2.5" />{commit.author}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-2.5 h-2.5" />{formatDate(commit.date)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-muted-foreground">Tidak ada commit</div>
            )}
          </div>
        </div>
      )}

      {/* Update progress — live status from background process */}
      {updateStatus && updateStatus.phase !== 'idle' && (
        <div className="rounded-xl border border-border/50 bg-card/30 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border-b border-border/40">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold text-foreground">Update Progress</span>
            {updateStatus.phase === 'running' && (
              <span className="ml-auto flex items-center gap-1.5 text-[10px] text-cyan-400 font-medium">
                <RefreshCw className="w-3 h-3 animate-spin" /> Running...
              </span>
            )}
          </div>
          <div className="p-4 space-y-3">
            {/* Current step indicator */}
            {updateStatus.phase === 'running' && (
              <div className="flex items-center gap-3">
                <RefreshCw className="w-4 h-4 animate-spin text-cyan-400 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-cyan-400">{updateStatus.step || 'Processing...'}</p>
                  <p className="text-[10px] text-muted-foreground">Update berjalan di background. Halaman ini bisa ditutup.</p>
                </div>
              </div>
            )}

            {/* Done state */}
            {updateStatus.phase === 'done' && (
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-green-400">Update selesai!</p>
                  {updateStatus.newCommit && <p className="text-[10px] font-mono text-muted-foreground">Commit: {updateStatus.newCommit}</p>}
                </div>
              </div>
            )}

            {/* Error state */}
            {updateStatus.phase === 'error' && (
              <div className="flex items-start gap-3">
                <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-red-400">Update gagal: {updateStatus.step || 'unknown step'}</p>
                  {updateStatus.error && <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{updateStatus.error}</p>}
                </div>
              </div>
            )}

            {/* Step timeline */}
            <div className="space-y-1.5 pt-2 border-t border-border/30">
              {['Git pull', 'Prisma db push', 'Backend build', 'Frontend build', 'PM2 restart'].map((stepName) => {
                const isCurrent = updateStatus.step === stepName && updateStatus.phase === 'running';
                const isPast = updateStatus.phase === 'done' || (updateStatus.phase === 'running' && updateStatus.step !== stepName && stepOrder(stepName) < stepOrder(updateStatus.step || ''));
                const isError = updateStatus.phase === 'error' && updateStatus.step === stepName;
                return (
                  <div key={stepName} className="flex items-center gap-2 text-[11px]">
                    {isError ? <XCircle className="w-3 h-3 text-red-400" /> :
                     isCurrent ? <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" /> :
                     isPast ? <CheckCircle2 className="w-3 h-3 text-green-400" /> :
                     <div className="w-3 h-3 rounded-full border border-muted-foreground/30" />}
                    <span className={cn(
                      isCurrent && 'text-cyan-400 font-medium',
                      isPast && 'text-green-400/70',
                      isError && 'text-red-400 font-medium',
                      !isCurrent && !isPast && !isError && 'text-muted-foreground',
                    )}>{stepName}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Manual update guide */}
      <div className="rounded-xl border border-border/50 bg-card/30 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border-b border-border/40">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-bold text-foreground">Cara Update — via SSH (Manual)</span>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">Update juga bisa dilakukan manual via SSH ke VPS. Jalankan perintah berikut:</p>
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">VPS Lokal</p>
            <CmdBlock>{`plink -ssh -batch -pw seven7890 root@192.168.54.129 "cd /var/www/salfanet-radius && bash vps-install/updater.sh --branch master --skip-backup" 2>&1`}</CmdBlock>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pantau log build (live)</p>
            <CmdBlock>{`plink -ssh -batch -pw seven7890 root@192.168.54.129 "tail -f /tmp/update-manual.log" 2>&1`}</CmdBlock>
          </div>
        </div>
      </div>
    </div>
  );
}
