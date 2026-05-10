'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Clock, Play, RefreshCw, CheckCircle, XCircle, Loader2, Activity } from 'lucide-react';
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
