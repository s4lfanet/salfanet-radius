/**
 * Cron job definitions — default schedules and metadata.
 * Used by:
 *   - /api/cron/status    (display job health + last run)
 *   - /api/cron/schedules (display + edit schedule config)
 *   - /api/cron           (trigger job manually)
 *   - cron-runner.ts      (standalone cron runner script)
 */
import { prisma } from '@/server/db/client';
import { CronExpressionParser } from 'cron-parser';
import { nowWIB } from '@/lib/timezone';

export interface CronJobDef {
  type: string;
  name: string;
  description: string;
  defaultSchedule: string;
  defaultScheduleLabel: string;
}

export const CRON_JOB_DEFS: CronJobDef[] = [
  { type: 'hotspot_sync',          name: 'Hotspot Sync',           description: 'Sinkronisasi voucher hotspot aktif/expired', defaultSchedule: '* * * * *',   defaultScheduleLabel: 'Every minute' },
  { type: 'pppoe_auto_isolir',     name: 'Auto Isolir PPPoE',      description: 'Isolir user PPPoE yang expired (prepaid)',  defaultSchedule: '0 * * * *',   defaultScheduleLabel: 'Every hour' },
  { type: 'agent_sales',           name: 'Agent Sales',            description: 'Catat penjualan voucher agent',             defaultSchedule: '*/5 * * * *',  defaultScheduleLabel: 'Every 5 minutes' },
  { type: 'invoice_generate',      name: 'Invoice Generate',       description: 'Generate invoice bulanan (postpaid)',        defaultSchedule: '0 7 * * *',   defaultScheduleLabel: 'Daily at 7 AM' },
  { type: 'invoice_reminder',      name: 'Invoice Reminder',       description: 'Kirim reminder invoice jatuh tempo',         defaultSchedule: '0 * * * *',   defaultScheduleLabel: 'Every hour' },
  { type: 'invoice_status_update', name: 'Invoice Status Update',  description: 'Update status invoice (overdue/paid)',       defaultSchedule: '0 * * * *',   defaultScheduleLabel: 'Every hour' },
  { type: 'notification_check',    name: 'Notification Check',     description: 'Cek notifikasi expired/overdue/pending',     defaultSchedule: '0 */6 * * *',  defaultScheduleLabel: 'Every 6 hours' },
  { type: 'session_monitor',       name: 'Session Monitor',        description: 'Monitor sesi mencurigakan',                  defaultSchedule: '*/15 * * * *', defaultScheduleLabel: 'Every 15 minutes' },
  { type: 'disconnect_sessions',   name: 'Disconnect Sessions',    description: 'Disconnect sesi user yang sudah isolir/stop',defaultSchedule: '*/5 * * * *',  defaultScheduleLabel: 'Every 5 minutes' },
  { type: 'auto_renewal',          name: 'Auto Renewal',           description: 'Auto renew prepaid dari saldo',              defaultSchedule: '0 8 * * *',   defaultScheduleLabel: 'Daily at 8 AM' },
  { type: 'activity_log_cleanup',  name: 'Activity Log Cleanup',   description: 'Hapus log aktivitas >30 hari',               defaultSchedule: '0 2 * * *',   defaultScheduleLabel: 'Daily at 2 AM' },
  { type: 'webhook_log_cleanup',   name: 'Webhook Log Cleanup',    description: 'Hapus webhook log >7 hari',                  defaultSchedule: '0 3 * * *',   defaultScheduleLabel: 'Daily at 3 AM' },
  { type: 'freeradius_health',     name: 'FreeRADIUS Health',      description: 'Cek kesehatan FreeRADIUS service',           defaultSchedule: '*/5 * * * *',  defaultScheduleLabel: 'Every 5 minutes' },
  { type: 'pppoe_session_sync',    name: 'PPPoE Session Sync',     description: 'Sync sesi PPPoE dari MikroTik ke radacct',   defaultSchedule: '*/5 * * * *',  defaultScheduleLabel: 'Every 5 minutes' },
  { type: 'suspend_check',         name: 'Suspend Check',          description: 'Cek user yang perlu disuspend',              defaultSchedule: '0 * * * *',   defaultScheduleLabel: 'Every hour' },
  { type: 'cron_history_cleanup',  name: 'History Cleanup',        description: 'Hapus cron history >30 hari',                defaultSchedule: '0 4 * * *',   defaultScheduleLabel: 'Daily at 4 AM' },
  { type: 'radius_sync_retry',     name: 'RADIUS Sync Retry',      description: 'Retry failed FreeRADIUS syncs (exponential backoff)', defaultSchedule: '*/5 * * * *',  defaultScheduleLabel: 'Every 5 minutes' },
  { type: 'radius_reconciliation', name: 'RADIUS Reconciliation',  description: 'Daily reconciliation between SalfaNet and FreeRADIUS (detect drift, report mismatches)', defaultSchedule: '0 6 * * *',   defaultScheduleLabel: 'Daily at 6 AM' },
];

export const CRON_JOB_MAP = new Map(CRON_JOB_DEFS.map(j => [j.type, j]));

/**
 * Get effective schedule for a job (override or default).
 */
export async function getEffectiveSchedule(jobType: string): Promise<{ schedule: string; enabled: boolean; hasOverride: boolean }> {
  const def = CRON_JOB_MAP.get(jobType);
  if (!def) return { schedule: '* * * * *', enabled: false, hasOverride: false };

  const config = await prisma.cronScheduleConfig.findUnique({ where: { jobType } });
  if (config) {
    return { schedule: config.schedule, enabled: config.enabled, hasOverride: config.schedule !== def.defaultSchedule };
  }
  return { schedule: def.defaultSchedule, enabled: true, hasOverride: false };
}

/**
 * Get all schedule configs (for UI).
 */
export async function getAllScheduleConfigs() {
  const configs = await prisma.cronScheduleConfig.findMany();
  const configMap = new Map(configs.map(c => [c.jobType, c]));

  return CRON_JOB_DEFS.map(def => {
    const cfg = configMap.get(def.type);
    return {
      jobType: def.type,
      name: def.name,
      description: def.description,
      defaultSchedule: def.defaultSchedule,
      defaultScheduleLabel: def.defaultScheduleLabel,
      schedule: cfg?.schedule || def.defaultSchedule,
      enabled: cfg?.enabled ?? true,
      hasOverride: !!cfg,
      updatedAt: cfg?.updatedAt || null,
    };
  });
}

/**
 * Get all cron job statuses (for UI).
 */
export async function getAllCronStatuses() {
  // Get last run for each job type
  const lastRuns = await prisma.cronHistory.findMany({
    where: { jobType: { in: CRON_JOB_DEFS.map(j => j.type) } },
    orderBy: { startedAt: 'desc' },
    take: 100,
  });

  // Group by jobType — keep only the latest per type
  const lastRunMap = new Map<string, any>();
  const recentHistoryMap = new Map<string, any[]>();
  for (const h of lastRuns) {
    if (!lastRunMap.has(h.jobType)) {
      lastRunMap.set(h.jobType, h);
    }
    if (!recentHistoryMap.has(h.jobType)) {
      recentHistoryMap.set(h.jobType, []);
    }
    if (recentHistoryMap.get(h.jobType)!.length < 5) {
      recentHistoryMap.get(h.jobType)!.push(h);
    }
  }

  const schedules = await getAllScheduleConfigs();
  const scheduleMap = new Map(schedules.map(s => [s.jobType, s]));

  const now = nowWIB();
  return CRON_JOB_DEFS.map(def => {
    const lastRun = lastRunMap.get(def.type);
    const sched = scheduleMap.get(def.type);
    const enabled = sched?.enabled ?? true;
    const schedule = sched?.schedule || def.defaultSchedule;

    // Calculate next run using cron-parser (accurate, not heuristic).
    // Uses WIB-as-UTC time (consistent with database storage).
    let nextRunISO: string | null = null;
    try {
      const interval = CronExpressionParser.parse(schedule, { tz: 'UTC', currentDate: now });
      const next = interval.next().toDate();
      nextRunISO = next.toISOString();
    } catch {
      // Invalid schedule — leave nextRun as null
    }

    // Health: healthy if last run was success, error if failed, degraded if never ran
    let health: 'healthy' | 'degraded' | 'error' = 'degraded';
    if (lastRun?.status === 'success') health = 'healthy';
    else if (lastRun?.status === 'error') health = 'error';

    return {
      type: def.type,
      name: def.name,
      description: def.description,
      scheduleLabel: sched?.defaultScheduleLabel || def.defaultScheduleLabel,
      enabled,
      health,
      lastRun: lastRun ? {
        startedAt: lastRun.startedAt,
        completedAt: lastRun.completedAt,
        status: lastRun.status,
        duration: lastRun.duration,
        result: lastRun.result,
        error: lastRun.error,
      } : undefined,
      nextRun: nextRunISO,
      recentHistory: recentHistoryMap.get(def.type) || [],
    };
  });
}
