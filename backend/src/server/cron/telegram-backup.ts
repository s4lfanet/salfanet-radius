import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { prisma } from '@/server/db/client';
import { getCurrentTimezone, refreshTimezoneFromDB } from '@/lib/timezone';
import { cleanupOldBackups, createBackup, getDatabaseHealth } from '@/server/services/backup.service';
import { sendBackupToTelegram, sendHealthReport, sendTelegramMessage } from '@/server/services/notifications/telegram.service';

/**
 * Automatic database backup to Telegram, on the schedule set in
 * Pengaturan → Telegram (daily / 12h / 6h / weekly at HH:mm).
 *
 * The cron runner calls this every few minutes; it backs up when a
 * scheduled time has passed with no automatic backup since. A server that
 * was down at the scheduled time catches up when it is back.
 */

const PERIOD_HOURS: Record<string, number> = { daily: 24, '12h': 12, '6h': 6, weekly: 168 };
const HOUR = 3600_000;

/** The most recent scheduled time at or before [now], in the company timezone. */
export function lastScheduledRun(now: Date, schedule: string, time: string, tz: string): Date {
  const period = (PERIOD_HOURS[schedule] ?? 24) * HOUR;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  const hh = m ? Math.min(23, Number(m[1])) : 2;
  const mm = m ? Math.min(59, Number(m[2])) : 0;
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = formatInTimeZone(now, tz, 'yyyy-MM-dd');
  let anchor = fromZonedTime(`${day}T${pad(hh)}:${pad(mm)}:00`, tz).getTime();
  if (schedule === 'weekly') {
    // Sunday: ISO day 7, so 7 % 7 = 0 days back.
    anchor -= (Number(formatInTimeZone(now, tz, 'i')) % 7) * 24 * HOUR;
  }
  const t = now.getTime();
  while (anchor > t) anchor -= period;
  while (anchor + period <= t) anchor += period;
  return new Date(anchor);
}

export async function runTelegramBackup(opts: { force?: boolean } = {}) {
  const settings = await prisma.telegramBackupSettings.findFirst({ where: { enabled: true }, orderBy: { createdAt: 'desc' } });
  if (!settings) return { skipped: 'Backup Telegram tidak aktif' };
  if (!settings.botToken || !settings.chatId) return { skipped: 'Bot token atau chat ID belum diisi' };

  await refreshTimezoneFromDB().catch(() => {});
  const tz = getCurrentTimezone();
  const now = new Date();
  const due = lastScheduledRun(now, settings.schedule, settings.scheduleTime, tz);

  if (!opts.force) {
    // Settings saved after that time: wait for the next one, rather than
    // backing up the moment the feature is switched on.
    if (settings.updatedAt > due) return { skipped: `Menunggu jadwal berikutnya (dihitung dari ${formatInTimeZone(due, tz, 'dd MMM HH:mm')})` };
    // One attempt per scheduled time, also when that attempt failed.
    const attempted = await prisma.backupHistory.findFirst({ where: { type: 'auto', createdAt: { gte: due } }, select: { id: true } });
    if (attempted) return { skipped: 'Sudah dibackup untuk jadwal ini' };
  }

  const target = { botToken: settings.botToken, chatId: settings.chatId, topicId: settings.backupTopicId || undefined };

  let backup;
  try {
    backup = await createBackup('auto');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sendTelegramMessage(target, `🔴 <b>Backup otomatis gagal</b>\n\n${escapeHtml(msg).slice(0, 500)}`).catch(() => {});
    throw e;
  }
  if (!backup.success || !backup.filepath) throw new Error('File backup tidak terbentuk');

  const sent = await sendBackupToTelegram(target, backup.filepath, Number(backup.backup.filesize));
  await prisma.backupHistory.update({
    where: { id: backup.backup.id },
    data: sent.success ? { method: 'telegram' } : { method: 'local', error: `Kirim ke Telegram gagal: ${sent.error ?? '-'}`.slice(0, 1000) },
  });
  if (!sent.success) {
    await sendTelegramMessage(
      target,
      `🟡 <b>Backup otomatis tersimpan di server, tapi file gagal dikirim</b>\n\n${escapeHtml(backup.backup.filename)}\n${escapeHtml(sent.error ?? '').slice(0, 400)}`,
    ).catch(() => {});
  }

  // A health report goes with it when a Health topic is set up.
  let health: string | undefined;
  if (settings.healthTopicId) {
    try {
      const { health: h } = await getDatabaseHealth();
      const r = await sendHealthReport({ ...target, topicId: settings.healthTopicId }, h);
      health = r.success ? 'terkirim' : `gagal: ${r.error}`;
    } catch (e) {
      health = `gagal: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  const cleanup = await cleanupOldBackups(settings.keepLastN > 0 ? settings.keepLastN : 7).catch(() => null);

  if (!sent.success) throw new Error(`Backup ${backup.backup.filename} gagal dikirim ke Telegram: ${sent.error}`);
  return { file: backup.backup.filename, sent: true, health, deletedOld: cleanup?.deleted ?? 0 };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
