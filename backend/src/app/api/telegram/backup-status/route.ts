import { NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { getCurrentTimezone, refreshTimezoneFromDB } from '@/lib/timezone';
import { lastScheduledRun, nextScheduledRun } from '@/server/cron/telegram-backup';

export const dynamic = 'force-dynamic';

/**
 * GET - where the automatic Telegram backup stands: whether it can run at
 * all, when it runs next, and how the last attempts went. Read only; it
 * changes nothing about how the backup itself runs.
 */
export async function GET() {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    await refreshTimezoneFromDB().catch(() => {});
    const tz = getCurrentTimezone();
    const now = new Date();

    const [settings, cronConfig, lastCronRun, recent] = await Promise.all([
      prisma.telegramBackupSettings.findFirst({ orderBy: { createdAt: 'desc' } }),
      prisma.cronScheduleConfig.findUnique({ where: { jobType: 'telegram_backup' } }).catch(() => null),
      prisma.cronHistory.findFirst({ where: { jobType: 'telegram_backup' }, orderBy: { startedAt: 'desc' } }),
      prisma.backupHistory.findMany({ where: { type: 'auto' }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);

    // Why nothing would run, in the order the runner checks it.
    const problems: string[] = [];
    if (!settings) problems.push('Pengaturan Telegram belum disimpan.');
    else {
      if (!settings.enabled) problems.push('Backup otomatis belum diaktifkan di pengaturan ini.');
      if (!settings.botToken || !settings.chatId) problems.push('Bot token atau Chat ID belum diisi.');
    }
    if (cronConfig && !cronConfig.enabled) problems.push('Job "Telegram Backup" dimatikan di Pengaturan > Cron Jobs.');

    const next = settings ? nextScheduledRun(now, settings.schedule, settings.scheduleTime, tz) : null;
    // A scheduled time already passed that no backup reached Telegram for: the runner takes it on its next check.
    const due = settings ? lastScheduledRun(now, settings.schedule, settings.scheduleTime, tz) : null;
    const duePending = !!settings?.enabled && !!due && settings.updatedAt <= due && !recent.some((b) => b.createdAt >= due && b.status === "success" && b.method === "telegram");
    return NextResponse.json({
      success: true,
      enabled: !!settings?.enabled,
      canRun: problems.length === 0,
      problems,
      cronJob: { enabled: cronConfig ? cronConfig.enabled : true, schedule: cronConfig?.schedule ?? '*/5 * * * *' },
      nextRunAt: next && settings?.enabled ? next.toISOString() : null,
      duePending,
      lastRunner: lastCronRun
        ? { at: lastCronRun.startedAt.toISOString(), status: lastCronRun.status, result: lastCronRun.result?.slice(0, 300) ?? null, error: lastCronRun.error?.slice(0, 300) ?? null }
        : null,
      recent: recent.map((b) => ({
        at: b.createdAt.toISOString(),
        filename: b.filename,
        status: b.status,
        sentToTelegram: b.method === 'telegram',
        error: b.error,
      })),
      timezone: tz,
    });
  } catch (error) {
    console.error('[Telegram backup status] error:', error);
    return NextResponse.json({ success: false, error: 'Gagal memuat status backup' }, { status: 500 });
  }
}
