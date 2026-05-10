'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Clock, Play, RefreshCw, CheckCircle, XCircle, Loader2, Activity, Settings2, RotateCcw, Pencil, X } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { formatWIB } from '@/lib/timezone';

interface CronJob {
  type: string;
  name: string;
  description: string;
  scheduleLabel: string;
  enabled: boolean;
  health: 'healthy' | 'degraded' | 'error';
  lastRun?: {
    startedAt: string;
    completedAt?: string;
    status: 'success' | 'error' | 'running';
    duration?: number;
    result?: string;
    error?: string;
  };
  nextRun: string;
  recentHistory?: any[];
}

interface ScheduleConfig {
  jobType: string;
  name: string;
  description: string;
  defaultSchedule: string;
  defaultScheduleLabel: string;
  schedule: string;
  enabled: boolean;
  hasOverride: boolean;
  updatedAt: string | null;
}

interface CronHistory {
  id: string;
  type: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'success' | 'error';
  result?: string;
  error?: string;
}

// Common schedule presets
const SCHEDULE_PRESETS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 2 hours', value: '0 */2 * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Daily at 1 AM', value: '0 1 * * *' },
  { label: 'Daily at 2 AM', value: '0 2 * * *' },
  { label: 'Daily at 3 AM', value: '0 3 * * *' },
  { label: 'Daily at 4 AM', value: '0 4 * * *' },
  { label: 'Daily at 7 AM', value: '0 7 * * *' },
  { label: 'Daily at 8 AM', value: '0 8 * * *' },
  { label: 'Daily at noon', value: '0 12 * * *' },
  { label: 'Custom…', value: 'custom' },
];

function ScheduleEditor({ config, onSave, onClose }: {
  config: ScheduleConfig;
  onSave: (jobType: string, schedule: string, enabled: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [schedule, setSchedule] = useState(config.schedule === 'dynamic' ? config.defaultSchedule : config.schedule);
  const [enabled, setEnabled] = useState(config.enabled);
  const [saving, setSaving] = useState(false);
  const isCustom = !SCHEDULE_PRESETS.find(p => p.value === schedule && p.value !== 'custom');
  const [selectedPreset, setSelectedPreset] = useState(isCustom ? 'custom' : schedule);
  const [customValue, setCustomValue] = useState(isCustom ? schedule : '');
  const isDynamic = config.defaultSchedule === 'dynamic';

  const effectiveSchedule = selectedPreset === 'custom' ? customValue : selectedPreset;

  const handlePresetChange = (val: string) => {
    setSelectedPreset(val);
    if (val !== 'custom') setSchedule(val);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(config.jobType, effectiveSchedule, enabled);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              Edit Schedule
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{config.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          {/* Enabled toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input type="checkbox" className="sr-only" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
              <div className={`w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted'}`} />
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
            </div>
            <span className="text-sm font-medium text-foreground">Job Enabled</span>
          </label>

          {isDynamic ? (
            <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
              Schedule untuk job ini dikelola dari pengaturan khusus (Telegram Settings). Hanya status enabled/disabled yang bisa diubah di sini.
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Preset Schedule</label>
                <select
                  className="mt-1 w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  value={selectedPreset}
                  onChange={e => handlePresetChange(e.target.value)}
                >
                  {SCHEDULE_PRESETS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              {selectedPreset === 'custom' && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Custom Cron Expression</label>
                  <input
                    type="text"
                    className="mt-1 w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                    placeholder="*/5 * * * *"
                    value={customValue}
                    onChange={e => setCustomValue(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Format: minute hour day month weekday</p>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Default:</span>
                <code className="bg-muted px-1.5 py-0.5 rounded font-mono">{config.defaultSchedule}</code>
                <span className="text-muted-foreground/60">({config.defaultScheduleLabel})</span>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (selectedPreset === 'custom' && !customValue.trim())}
            className="flex-1 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CronSettingsPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [schedules, setSchedules] = useState<ScheduleConfig[]>([]);
  const [history, setHistory] = useState<CronHistory[]>([]);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'jobs' | 'schedules' | 'history'>('jobs');
  const [editingSchedule, setEditingSchedule] = useState<ScheduleConfig | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [statusRes, schedulesRes] = await Promise.all([
        fetch('/api/cron/status'),
        fetch('/api/cron/schedules'),
      ]);
      const statusData = await statusRes.json();
      const schedulesData = await schedulesRes.json();

      if (statusData.success) {
        setJobs(statusData.jobs || []);
        const allHistory = statusData.jobs.flatMap((job: any) =>
          (job.recentHistory || []).map((h: any) => ({
            id: h.id, type: job.type,
            startedAt: h.startedAt, completedAt: h.completedAt,
            status: h.status, result: h.result, error: h.error,
          }))
        );
        setHistory(allHistory.sort((a: CronHistory, b: CronHistory) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        ).slice(0, 50));
      }
      if (schedulesData.success) setSchedules(schedulesData.schedules || []);
    } catch (error) {
      console.error('Load cron data error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  const triggerManual = async (jobType: string) => {
    setTriggering(jobType);
    try {
      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: jobType, ...(jobType === 'invoice_generate' ? { force: true } : {}) })
      });
      const data = await res.json();
      if (data.success) {
        addToast({ type: 'success', title: t('common.success'), description: data.message || 'Job triggered successfully', duration: 2000 });
      } else {
        addToast({ type: 'error', title: t('common.error'), description: data.error || t('common.failed') });
      }
      loadData();
    } catch (error) {
      addToast({ type: 'error', title: t('common.error'), description: t('settings.failedTriggerJob') });
    } finally {
      setTriggering(null);
    }
  };

  const saveSchedule = async (jobType: string, schedule: string, enabled: boolean) => {
    try {
      const res = await fetch('/api/cron/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobType, schedule, enabled }),
      });
      const data = await res.json();
      if (data.success) {
        addToast({ type: 'success', title: 'Schedule updated', description: `${jobType} schedule saved. Restart cron runner to apply.`, duration: 4000 });
        await loadData();
      } else {
        addToast({ type: 'error', title: t('common.error'), description: data.error });
      }
    } catch {
      addToast({ type: 'error', title: t('common.error'), description: 'Failed to save schedule' });
    }
  };

  const resetSchedule = async (jobType: string) => {
    try {
      await fetch(`/api/cron/schedules?jobType=${encodeURIComponent(jobType)}`, { method: 'DELETE' });
      addToast({ type: 'success', title: 'Reset to default', description: `${jobType} reverted to default schedule.`, duration: 3000 });
      await loadData();
    } catch {
      addToast({ type: 'error', title: t('common.error'), description: 'Failed to reset schedule' });
    }
  };

  const getHealthBadge = (health: string, enabled: boolean) => {
    if (!enabled) return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded">{t('settings.disabled')}</span>;
    switch (health) {
      case 'healthy': return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-success/10 text-success rounded">🟢 Active</span>;
      case 'degraded': return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-warning/20 text-warning rounded">🟡 Degraded</span>;
      case 'error': return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-destructive/10 text-destructive rounded">🔴 Error</span>;
      default: return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded">-</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success': return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-success/10 text-success rounded"><CheckCircle className="w-3 h-3" />{t('settings.success')}</span>;
      case 'error': return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-destructive/10 text-destructive rounded"><XCircle className="w-3 h-3" />{t('settings.failed')}</span>;
      case 'running': return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary rounded"><Loader2 className="w-3 h-3 animate-spin" />{t('settings.running')}</span>;
      default: return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded">-</span>;
    }
  };

  const typeLabels: Record<string, string> = {
    voucher_sync: 'Voucher Sync', agent_sales: 'Agent Sales',
    invoice_generate: 'Invoice Gen', invoice_reminder: 'Reminders',
    auto_isolir: 'Auto Isolir', disconnect_sessions: 'Disconnect Sessions',
    activity_log_cleanup: 'Activity Log Cleanup', telegram_backup: 'Telegram Backup',
    telegram_health: 'Telegram Health', notification_check: 'Notification Check',
    auto_renewal: 'Auto Renewal', webhook_log_cleanup: 'Webhook Cleanup',
    hotspot_sync: 'Hotspot Sync', pppoe_auto_isolir: 'PPPoE Auto Isolir',
    pppoe_session_sync: 'PPPoE Session Sync', session_monitor: 'Session Monitor',
    suspend_check: 'Suspend Check', freeradius_health: 'RADIUS Health',
    invoice_status_update: 'Invoice Status', cron_history_cleanup: 'History Cleanup',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl" />
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl" />
        </div>
        <Loader2 className="w-12 h-12 animate-spin text-brand-500 dark:text-[#00f7ff] relative z-10" />
      </div>
    );
  }

  const filteredHistory = selectedType === 'all' ? history : history.filter(h => h.type === selectedType);

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl" />
        <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
      </div>

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] flex items-center gap-3">
              <Clock className="w-7 h-7 text-brand-500 dark:text-[#00f7ff]" />
              {t('settings.cronTitle')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('settings.cronSubtitle')}</p>
          </div>
          <button onClick={loadData} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors">
            <RefreshCw className="w-4 h-4" />
            {t('common.refresh')}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
          {([
            { key: 'jobs', label: 'Status & Trigger', icon: Activity },
            { key: 'schedules', label: 'Jadwal Cron', icon: Settings2 },
            { key: 'history', label: 'Riwayat Eksekusi', icon: Clock },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── TAB: STATUS & TRIGGER ── */}
        {activeTab === 'jobs' && (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {jobs.map((job) => (
              <div key={job.type} className="bg-card rounded-lg border border-border shadow-sm p-4">
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <h3 className="font-semibold text-sm text-foreground leading-tight">{job.name}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">{job.description}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">{t('settings.schedule')}:</span>
                      <div className="font-medium text-foreground">{job.scheduleLabel}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('common.status')}:</span>
                      <div className="mt-0.5">{getHealthBadge(job.health, job.enabled)}</div>
                    </div>
                  </div>
                  <div className="text-xs space-y-1 pt-2 border-t border-border">
                    <div>
                      <span className="text-muted-foreground">{t('settings.lastRun')}:</span>
                      <div className="font-medium text-foreground">{job.lastRun ? formatWIB(job.lastRun.startedAt) : t('settings.never')}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('settings.nextRun')}:</span>
                      <div className="font-medium text-primary dark:text-violet-200">{formatWIB(job.nextRun)}</div>
                    </div>
                    {job.lastRun?.duration && (
                      <div>
                        <span className="text-muted-foreground">{t('settings.duration')}:</span>
                        <div className="font-medium text-foreground">{(job.lastRun.duration / 1000).toFixed(2)}s</div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => triggerManual(job.type)}
                    disabled={triggering !== null}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    {triggering === job.type ? <><Loader2 className="w-3 h-3 animate-spin" />{t('settings.running')}...</> : <><Play className="w-3 h-3" />{t('settings.triggerNow')}</>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TAB: JADWAL CRON ── */}
        {activeTab === 'schedules' && (
          <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Settings2 className="w-5 h-5" />
                Manajemen Jadwal Cron
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Atur kapan setiap cron job dijalankan. Perubahan aktif setelah cron runner di-restart.
              </p>
            </div>

            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2 px-6 py-2.5">
              <span className="font-semibold">⚠ Catatan:</span>
              Perubahan jadwal disimpan ke database. Cron runner membaca jadwal saat startup — jalankan
              <code className="mx-1 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded font-mono">pm2 restart salfanet-cron</code>
              di VPS untuk menerapkan jadwal baru.
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Job</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Default</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Aktif</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {schedules.map(s => (
                    <tr key={s.jobType} className="hover:bg-muted/50">
                      <td className="px-6 py-3">
                        <div className="font-medium text-sm text-foreground">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.jobType}</div>
                      </td>
                      <td className="px-6 py-3">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{s.defaultSchedule}</code>
                        <div className="text-xs text-muted-foreground mt-0.5">{s.defaultScheduleLabel}</div>
                      </td>
                      <td className="px-6 py-3">
                        {s.hasOverride ? (
                          <div>
                            <code className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono border border-primary/20">{s.schedule}</code>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">default</span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        {s.enabled
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-success/10 text-success rounded">🟢 Enabled</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded">⏸ Disabled</span>
                        }
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingSchedule(s)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                          {s.hasOverride && (
                            <button
                              onClick={() => resetSchedule(s.jobType)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 rounded-lg transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Reset
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="block md:hidden p-4 space-y-3">
              {schedules.map(s => (
                <div key={s.jobType} className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm text-foreground">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.jobType}</div>
                    </div>
                    {s.enabled
                      ? <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded">🟢 On</span>
                      : <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">⏸ Off</span>
                    }
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Default:</span>
                      <code className="block bg-muted px-1.5 py-0.5 rounded font-mono mt-0.5">{s.defaultSchedule}</code>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Aktif:</span>
                      <code className={`block px-1.5 py-0.5 rounded font-mono mt-0.5 ${s.hasOverride ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-muted'}`}>
                        {s.hasOverride ? s.schedule : 'default'}
                      </code>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingSchedule(s)}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    {s.hasOverride && (
                      <button
                        onClick={() => resetSchedule(s.jobType)}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 rounded-lg transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" /> Reset
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB: RIWAYAT EKSEKUSI ── */}
        {activeTab === 'history' && (
          <div className="bg-card rounded-lg border border-border shadow-sm">
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    {t('settings.executionHistory')}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('settings.last50Executions')}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setSelectedType('all')} className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${selectedType === 'all' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                    {t('common.all')}
                  </button>
                  {jobs.map((job) => (
                    <button key={job.type} onClick={() => setSelectedType(job.type)} className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${selectedType === job.type ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                      {typeLabels[job.type] || job.type}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="block md:hidden p-4 space-y-3">
              {filteredHistory.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">{t('settings.noExecutionHistory')}</p>
              ) : filteredHistory.map((item) => {
                const duration = item.completedAt ? Math.round((new Date(item.completedAt).getTime() - new Date(item.startedAt).getTime()) / 1000) : null;
                return (
                  <div key={item.id} className="bg-card/80 border border-border rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded">{typeLabels[item.type] || item.type}</span>
                      {getStatusBadge(item.status)}
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">{t('settings.startedAt')}</span><span>{formatWIB(item.startedAt)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">{t('settings.duration')}</span><span>{duration ? `${duration}s` : '-'}</span></div>
                      {item.status === 'success' && item.result && <p className="text-xs text-muted-foreground pt-1 border-t border-border">{item.result}</p>}
                      {item.status === 'error' && item.error && <p className="text-xs text-destructive pt-1 border-t border-border">{item.error}</p>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    {[t('settings.type'), t('settings.startedAt'), t('settings.completedAt'), t('settings.duration'), t('common.status'), t('settings.result')].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredHistory.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-muted-foreground">{t('settings.noExecutionHistory')}</td></tr>
                  ) : filteredHistory.map((item) => {
                    const duration = item.completedAt ? Math.round((new Date(item.completedAt).getTime() - new Date(item.startedAt).getTime()) / 1000) : null;
                    return (
                      <tr key={item.id} className="hover:bg-muted">
                        <td className="px-6 py-4 text-sm"><span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded">{typeLabels[item.type] || item.type}</span></td>
                        <td className="px-6 py-4 text-sm text-foreground">{formatWIB(item.startedAt)}</td>
                        <td className="px-6 py-4 text-sm text-foreground">{item.completedAt ? formatWIB(item.completedAt) : '-'}</td>
                        <td className="px-6 py-4 text-sm text-foreground">{duration ? `${duration}s` : '-'}</td>
                        <td className="px-6 py-4">{getStatusBadge(item.status)}</td>
                        <td className="px-6 py-4 text-sm">
                          {item.status === 'success' && <span className="text-foreground">{item.result}</span>}
                          {item.status === 'error' && <span className="text-destructive">{item.error}</span>}
                          {item.status === 'running' && <span className="text-primary">{t('settings.inProgress')}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Schedule editor modal */}
      {editingSchedule && (
        <ScheduleEditor
          config={editingSchedule}
          onSave={saveSchedule}
          onClose={() => setEditingSchedule(null)}
        />
      )}
    </div>
  );
}


interface CronJob {
  type: string;
  name: string;
  description: string;
  scheduleLabel: string;
  enabled: boolean;
  health: 'healthy' | 'degraded' | 'error';
  lastRun?: {
    startedAt: string;
    completedAt?: string;
    status: 'success' | 'error' | 'running';
    duration?: number;
    result?: string;
    error?: string;
  };
  nextRun: string;
  recentHistory?: any[];
}

interface CronHistory {
  id: string;
  type: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'success' | 'error';
  result?: string;
  error?: string;
}

export default function CronSettingsPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [history, setHistory] = useState<CronHistory[]>([]);
  const [selectedType, setSelectedType] = useState<string>('all');

  useEffect(() => {
    loadHistory();
    // Auto-refresh every 10 seconds
    const interval = setInterval(loadHistory, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/cron/status');
      const data = await res.json();
      if (data.success) {
        setJobs(data.jobs || []);
        
        // Flatten all recent history from all jobs
        const allHistory = data.jobs.flatMap((job: any) => 
          (job.recentHistory || []).map((h: any) => ({
            id: h.id,
            type: job.type,
            startedAt: h.startedAt,
            completedAt: h.completedAt,
            status: h.status,
            result: h.result,
            error: h.error,
          }))
        );
        
        // Sort by startedAt desc and take last 50
        const sortedHistory = allHistory
          .sort((a: CronHistory, b: CronHistory) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
          .slice(0, 50);
        
        setHistory(sortedHistory);
      }
    } catch (error) {
      console.error('Load history error:', error);
    } finally {
      setLoading(false);
    }
  };

  const triggerManual = async (jobType: string) => {
    setTriggering(jobType);
    try {
      const res = await fetch('/api/cron', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: jobType, ...(jobType === 'invoice_generate' ? { force: true } : {}) })
      });
      const data = await res.json();
      
      if (data.success) {
        let description = 'Job completed successfully!';
        if (jobType === 'voucher_sync') {
          description = `Synced ${data.synced} voucher(s)`;
        } else if (jobType === 'agent_sales') {
          description = `Recorded ${data.recorded} sales`;
        } else if (jobType === 'invoice_generate') {
          description = `Generated ${data.generated} invoices, skipped ${data.skipped}`;
        } else if (jobType === 'invoice_reminder') {
          description = `Sent ${data.sent} reminders, skipped ${data.skipped}`;
        } else if (jobType === 'auto_isolir') {
          description = `Isolated ${data.isolated} expired user(s)`;
        } else if (jobType === 'disconnect_sessions') {
          description = `Disconnected ${data.disconnected} expired session(s)`;
        } else if (jobType === 'activity_log_cleanup') {
          description = `Cleaned ${data.deleted} old activity log(s)`;
        } else if (jobType === 'auto_renewal') {
          description = `Processed ${data.processed || 0} auto-renewals, paid ${data.paid || 0}`;
        } else if (jobType === 'webhook_log_cleanup') {
          description = `Cleaned ${data.deleted} old webhook log(s)`;
        }
        addToast({ type: 'success', title: t('common.success'), description, duration: 2000 });
      } else {
        addToast({ type: 'error', title: t('common.error'), description: t('common.failed') + ': ' + data.error });
      }
      
      loadHistory();
    } catch (error) {
      console.error('Manual trigger error:', error);
      addToast({ type: 'error', title: t('common.error'), description: t('settings.failedTriggerJob') });
    } finally {
      setTriggering(null);
    }
  };

  const getHealthBadge = (health: string, enabled: boolean) => {
    if (!enabled) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded">{t('settings.disabled')}</span>;
    }
    switch (health) {
      case 'healthy':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-success/10 text-success rounded">🟢 Active</span>;
      case 'degraded':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-warning/20 text-warning dark:bg-yellow-900/30 dark:text-warning rounded">🟡 Degraded</span>;
      case 'error':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-destructive/10 text-destructive rounded">🔴 Error</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded">{t('settings.unknown')}</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-success/10 text-success rounded"><CheckCircle className="w-3 h-3" />{t('settings.success')}</span>;
      case 'error':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-destructive/10 text-destructive rounded"><XCircle className="w-3 h-3" />{t('settings.failed')}</span>;
      case 'running':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary dark:text-primary rounded"><Loader2 className="w-3 h-3 animate-spin" />{t('settings.running')}</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded">-</span>;
    }
  };

  const typeLabels: Record<string, string> = {
    voucher_sync: 'Voucher Sync',
    agent_sales: 'Agent Sales',
    invoice_generate: 'Invoice Gen',
    invoice_reminder: 'Reminders',
    auto_isolir: 'Auto Isolir',
    disconnect_sessions: 'Disconnect Sessions',
    activity_log_cleanup: 'Activity Log Cleanup',
    telegram_backup: 'Telegram Backup',
    telegram_health: 'Telegram Health',
    notification_check: 'Notification Check',
    auto_renewal: 'Auto Renewal',
    webhook_log_cleanup: 'Webhook Cleanup',
    hotspot_sync: 'Hotspot Sync',
    pppoe_auto_isolir: 'PPPoE Auto Isolir'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
        <Loader2 className="w-12 h-12 animate-spin text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" />
      </div>
    );
  }

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-3">
              <Clock className="w-7 h-7 text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_15px_rgba(0,247,255,0.8)]" />
              {t('settings.cronTitle')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {t('settings.cronSubtitle')}
            </p>
          </div>
          <button
            onClick={loadHistory}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
        </div>

      {/* Jobs Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {jobs.map((job) => (
          <div key={job.type} className="bg-card rounded-lg border border-border shadow-sm p-4">
            <div className="space-y-3">
              {/* Header */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <h3 className="font-semibold text-sm text-foreground">{job.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground">{job.description}</p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">{t('settings.schedule')}:</span>
                  <div className="font-medium text-foreground">{job.scheduleLabel}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('common.status')}:</span>
                  <div className="mt-0.5">
                    {getHealthBadge(job.health, job.enabled)}
                  </div>
                </div>
              </div>

              {/* Last Run Info */}
              <div className="text-xs space-y-1 pt-2 border-t border-border">
                <div>
                  <span className="text-muted-foreground">{t('settings.lastRun')}:</span>
                  <div className="font-medium text-foreground">
                    {job.lastRun ? formatWIB(job.lastRun.startedAt) : t('settings.never')}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('settings.nextRun')}:</span>
                  <div className="font-medium text-primary dark:text-violet-200">
                    {formatWIB(job.nextRun)}
                  </div>
                </div>
                {job.lastRun?.duration && (
                  <div>
                    <span className="text-muted-foreground">{t('settings.duration')}:</span>
                    <div className="font-medium text-foreground">
                      {(job.lastRun.duration / 1000).toFixed(2)}s
                    </div>
                  </div>
                )}
              </div>

              {/* Trigger Button */}
              <button
                onClick={() => triggerManual(job.type)}
                disabled={triggering !== null}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-foreground bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 rounded-lg transition-colors"
              >
                {triggering === job.type ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t('settings.running')}...
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" />
                    {t('settings.triggerNow')}
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Execution History */}
      <div className="bg-card rounded-lg border border-border shadow-sm">
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Activity className="w-5 h-5" />
                {t('settings.executionHistory')}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('settings.last50Executions')}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedType('all')}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                  selectedType === 'all'
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {t('common.all')}
              </button>
              {jobs.map((job) => (
                <button
                  key={job.type}
                  onClick={() => setSelectedType(job.type)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    selectedType === job.type
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {job.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3">
          {(selectedType === 'all' ? history : history.filter(h => h.type === selectedType)).length === 0 ? (
            <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3 text-center text-sm text-muted-foreground">
              {t('settings.noExecutionHistory')}
            </div>
          ) : (
            (selectedType === 'all' ? history : history.filter(h => h.type === selectedType)).map((item) => {
              const duration = item.completedAt
                ? Math.round((new Date(item.completedAt).getTime() - new Date(item.startedAt).getTime()) / 1000)
                : null;
              return (
                <div key={item.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded">
                      {typeLabels[item.type] || item.type}
                    </span>
                    {getStatusBadge(item.status)}
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('settings.startedAt')}</span>
                      <span className="text-foreground">{formatWIB(item.startedAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('settings.completedAt')}</span>
                      <span className="text-foreground">{item.completedAt ? formatWIB(item.completedAt) : '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('settings.duration')}</span>
                      <span className="text-foreground">{duration ? `${duration}s` : '-'}</span>
                    </div>
                    {item.status === 'success' && item.result && (
                      <div className="pt-1 border-t border-border">
                        <span className="text-muted-foreground text-xs">{t('settings.result')}</span>
                        <p className="text-foreground text-xs mt-0.5">{item.result}</p>
                      </div>
                    )}
                    {item.status === 'error' && item.error && (
                      <div className="pt-1 border-t border-border">
                        <span className="text-muted-foreground text-xs">{t('settings.result')}</span>
                        <p className="text-destructive text-xs mt-0.5">{item.error}</p>
                      </div>
                    )}
                    {item.status === 'running' && (
                      <div className="pt-1 border-t border-border">
                        <span className="text-primary text-xs">{t('settings.inProgress')}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('settings.type')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('settings.startedAt')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('settings.completedAt')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('settings.duration')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('common.status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('settings.result')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(selectedType === 'all' ? history : history.filter(h => h.type === selectedType)).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    {t('settings.noExecutionHistory')}
                  </td>
                </tr>
              ) : (
                (selectedType === 'all' ? history : history.filter(h => h.type === selectedType)).map((item) => {
                  const duration = item.completedAt 
                    ? Math.round((new Date(item.completedAt).getTime() - new Date(item.startedAt).getTime()) / 1000)
                    : null;

                  return (
                    <tr key={item.id} className="hover:bg-muted">
                      <td className="px-6 py-4 text-sm">
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded">
                          {typeLabels[item.type] || item.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground">
                        {formatWIB(item.startedAt)}
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground">
                        {item.completedAt ? formatWIB(item.completedAt) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground">
                        {duration ? `${duration}s` : '-'}
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(item.status)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {item.status === 'success' && (
                          <span className="text-foreground">{item.result}</span>
                        )}
                        {item.status === 'error' && (
                          <span className="text-destructive dark:text-destructive">{item.error}</span>
                        )}
                        {item.status === 'running' && (
                          <span className="text-primary dark:text-primary">{t('settings.inProgress')}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
