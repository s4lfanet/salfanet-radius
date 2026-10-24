import { prisma } from '@/server/db/client';
import { nowWIBAsync, WIB_TIMEZONE, formatWIB } from '@/lib/timezone';
import { formatInTimeZone } from 'date-fns-tz';
import { generateInvoiceNumber } from '@/server/services/billing/invoice.service';
import { nanoid } from 'nanoid';
import { randomBytes } from 'crypto';
import { shouldManagePppSecretForSuspend } from '@/server/services/mikrotik/ppp-secret.service';
import { sendPushToUser } from '@/server/services/notifications/push-templates.service';
import {
  companyDate,
  companyMonthRange,
  postpaidDueDate,
  prepaidDueDate,
  prepaidIsDue,
} from '@/server/services/billing/invoice-schedule';

/**
 * Invoice Generate — runs daily.
 * PREPAID: invoiceType=RENEWAL, dueDate = the expiry date itself, created
 *   once expiry is within company.invoiceGenerateDays (default 7). A customer
 *   paid through 28 Nov gets no October bill.
 * POSTPAID: invoiceType=MONTHLY, dueDate = billingDay of the current month.
 * At most one MONTHLY/RENEWAL invoice per customer per due-date month.
 */
export async function runInvoiceGenerate(): Promise<{ generated: number; skipped: number; total: number; errors: string[] }> {
  // Refresh timezone from DB — company might have changed it
  const now = await nowWIBAsync();
  const errors: string[] = [];

  const company = await prisma.company.findFirst({
    select: { invoiceGenerateDays: true, baseUrl: true, name: true, phone: true },
  });
  const baseUrl = company?.baseUrl || 'http://localhost:3000';

  const { year, month } = companyDate(now);
  const leadDays = company?.invoiceGenerateDays ?? 7;
  const monthKey = (d: Date) => {
    const c = companyDate(d);
    return `${c.year}-${c.month}`;
  };

  const users = await prisma.pppoeUser.findMany({
    where: { status: { in: ['active', 'isolated'] } },
    include: {
      profile: { select: { id: true, name: true, price: true, ppnActive: true, ppnRate: true } },
    },
  });

  // Existing bills keyed by customer + due-date month. PREPAID renewals can
  // fall in a later month than the run (expiry within the lead time), or an
  // earlier one (expired and never billed), so look back a year.
  const existingInvoices = await prisma.invoice.findMany({
    where: {
      userId: { in: users.map(u => u.id) },
      invoiceType: { in: ['MONTHLY', 'RENEWAL'] },
      dueDate: { gte: new Date(now.getTime() - 366 * 86_400_000) },
      status: { not: 'CANCELLED' },
    },
    select: { userId: true, dueDate: true },
  });
  const billedMonths = new Set(existingInvoices.map(i => `${i.userId}:${monthKey(i.dueDate)}`));

  // Phase 7: Batch fetch all recurring addons for all users upfront (N+1 fix)
  // Instead of querying addons per-user inside the loop, fetch all at once.
  const allAddons = await prisma.customerAddon.findMany({
    where: {
      pppoeUserId: { in: users.map(u => u.id) },
      endDate: null,
      addonType: { isRecurring: true, isActive: true },
    },
    include: { addonType: { select: { id: true, name: true, price: true } } },
  });
  const addonsByUserId = new Map<string, typeof allAddons>();
  for (const addon of allAddons) {
    const list = addonsByUserId.get(addon.pppoeUserId) || [];
    list.push(addon);
    addonsByUserId.set(addon.pppoeUserId, list);
  }

  let generated = 0;
  let skipped = 0;

  for (const user of users) {
    try {
      if (!user.profile) {
        errors.push(`${user.username}: profile not found`);
        continue;
      }

      const subscriptionType = (user as any).subscriptionType || 'POSTPAID';
      let dueDate: Date;
      let invoiceType: string;

      if (subscriptionType === 'PREPAID') {
        // Still paid up beyond the lead time: nothing to bill yet.
        if (!user.expiredAt || !prepaidIsDue(user.expiredAt, now, leadDays)) { skipped++; continue; }
        dueDate = prepaidDueDate(user.expiredAt);
        invoiceType = 'RENEWAL';
      } else {
        dueDate = postpaidDueDate(year, month, (user as any).billingDay);
        invoiceType = 'MONTHLY';
      }

      if (billedMonths.has(`${user.id}:${monthKey(dueDate)}`)) {
        skipped++;
        continue;
      }
      const dueC = companyDate(dueDate);
      const { start: monthStart, end: monthEnd } = companyMonthRange(dueC.year, dueC.month);

      // Calculate amount with PPN (subtract user discount from base price)
      const baseAmount = Math.max(0, user.profile.price - (user.discount || 0));
      let amount = baseAmount;
      let taxRate: number | null = null;
      if (user.profile.ppnActive && user.profile.ppnRate > 0) {
        taxRate = Number(user.profile.ppnRate);
        amount = Math.round(baseAmount + (baseAmount * taxRate / 100));
      }

      // Phase 7: Use batch-fetched addons instead of per-user query (N+1 fix)
      const addons = addonsByUserId.get(user.id) || [];

      // Calculate total addon charges (effective price = priceOverride ?? addonType.price)
      const addonCharges = addons.map((ca) => ({
        addonTypeId: ca.addonTypeId,
        addonName: ca.addonType.name,
        amount: ca.priceOverride !== null ? ca.priceOverride : ca.addonType.price,
      }));
      const addonAmount = addonCharges.reduce((sum, a) => sum + a.amount, 0);
      amount += addonAmount;

      const invoiceId = nanoid();
      const invoiceNumber = generateInvoiceNumber();
      const paymentToken = randomBytes(32).toString('hex');
      const paymentLink = `${baseUrl}/pay/${paymentToken}`;

      // ─── Idempotency: atomic create with conditional check ───────────────
      // Use a transaction to atomically check + create.
      // If another instance created the invoice between our findMany and now,
      // the unique check inside the transaction will catch it.
      let created = false;
      try {
        await prisma.$transaction(async (tx) => {
          // Re-check inside transaction — if another instance already created
          // an invoice for this user+month+type, skip (idempotency).
          const existing = await tx.invoice.findFirst({
            where: {
              userId: user.id,
              invoiceType: { in: ['MONTHLY', 'RENEWAL'] },
              dueDate: { gte: monthStart, lte: monthEnd },
              status: { not: 'CANCELLED' },
            },
            select: { id: true },
          });
          if (existing) {
            // Already created by another instance — skip
            return;
          }

          await tx.invoice.create({
            data: {
              id: invoiceId,
              invoiceNumber,
              userId: user.id,
              amount,
              baseAmount,
              addonAmount,
              ...(taxRate !== null && { taxRate }),
              dueDate,
              status: 'PENDING',
              invoiceType: invoiceType as any,
              customerName: user.name,
              customerPhone: user.phone,
              customerEmail: user.email || null,
              customerUsername: user.username,
              paymentToken,
              paymentLink,
              createdAt: now,
              // Create invoiceAddon records for each recurring addon
              invoiceAddons: addonCharges.length > 0
                ? {
                    create: addonCharges.map((a) => ({
                      addonTypeId: a.addonTypeId,
                      addonName: a.addonName,
                      amount: a.amount,
                    })),
                  }
                : undefined,
            },
          });
          created = true;
        });
      } catch (txErr: any) {
        // If unique constraint violation — another instance created it
        if (txErr?.message?.includes('Unique') || txErr?.code === 'P2002') {
          skipped++;
          continue;
        }
        throw txErr;
      }

      if (created) {
        generated++;
      } else {
        skipped++;
      }
    } catch (err: any) {
      errors.push(`${user.username}: ${err?.message || err}`);
    }
  }

  console.log(`[INVOICE_GENERATE] generated=${generated} skipped=${skipped} errors=${errors.length}`);

  try {
    const { NotificationService } = await import('@/server/services/notifications/dispatcher.service');
    await NotificationService.notifyInvoicesGenerated(generated);
  } catch (e: any) {
    console.error('[INVOICE_GENERATE] Admin notification failed:', e?.message || e);
  }

  return { generated, skipped, total: users.length, errors };
}

/**
 * Auto-Cancel Stale Invoices — cancel PENDING/OVERDUE invoices for customers
 * who have already renewed past the invoice's due date.
 *
 * Scenario: customer pays invoice A (extends expiry to Nov 3). Invoice A was
 * for October. Later, an old October invoice (PENDING/OVERDUE, dueDate Oct 3)
 * still exists because it was never marked PAID — it was superseded by the
 * renewal. This cron cancels those stale invoices so they don't clutter the
 * dashboard or trigger false overdue reminders.
 *
 * Logic: invoice is PENDING/OVERDUE AND user.status='active' AND
 *        user.expiredAt > invoice.dueDate (user already renewed past due date)
 */
export async function runInvoiceAutoCancel(): Promise<{ cancelled: number; total: number; details: string[] }> {
  const _now = await nowWIBAsync();
  const details: string[] = [];

  // Find stale invoices: PENDING/OVERDUE where the customer has already
  // renewed (expiredAt > invoice.dueDate) and is still active.
  // Only applies to PREPAID users (expiredAt is not null).
  const staleInvoices = await prisma.invoice.findMany({
    where: {
      status: { in: ['PENDING', 'OVERDUE'] },
      // POSTPAID customers also carry an expiredAt, but their bill is for the
      // month already used — renewing past it doesn't make it stale.
      invoiceType: 'RENEWAL',
      user: {
        status: 'active',
        subscriptionType: 'PREPAID',
        expiredAt: { not: null },
      },
    },
    select: {
      id: true,
      invoiceNumber: true,
      amount: true,
      dueDate: true,
      status: true,
      customerName: true,
      userId: true,
      user: {
        select: {
          name: true,
          username: true,
          expiredAt: true,
          status: true,
        },
      },
    },
  });

  // Filter: only cancel invoices where user.expiredAt > invoice.dueDate
  // (the user has already renewed past this invoice's due date)
  // Compared by calendar date: the renewal due on the expiry day itself has
  // dueDate at 23:59:59 that day, and legacy rows store expiry at other
  // times of the same day — that bill is current, not stale.
  const dayNumber = (d: Date) => {
    const c = companyDate(d);
    return Date.UTC(c.year, c.month - 1, c.day);
  };
  const toCancel = staleInvoices.filter((inv) => {
    if (!inv.user?.expiredAt) return false;
    return dayNumber(inv.user.expiredAt) > dayNumber(inv.dueDate);
  });

  if (toCancel.length === 0) {
    return { cancelled: 0, total: staleInvoices.length, details: [] };
  }

  // Cancel the stale invoices
  const ids = toCancel.map((inv) => inv.id);
  const result = await prisma.invoice.updateMany({
    where: { id: { in: ids } },
    data: { status: 'CANCELLED' },
  });

  // Log each cancellation
  for (const inv of toCancel) {
    const detail = `${inv.invoiceNumber} (${inv.customerName || inv.user?.username || 'unknown'}, due ${formatInTimeZone(inv.dueDate, WIB_TIMEZONE, 'yyyy-MM-dd')}, user expired ${inv.user?.expiredAt ? formatInTimeZone(inv.user.expiredAt, WIB_TIMEZONE, 'yyyy-MM-dd') : 'null'})`;
    details.push(detail);
    console.log(`[INVOICE_AUTO_CANCEL] Cancelled ${detail}`);
  }

  // Log to activity log
  try {
    const { logActivity } = await import('@/server/services/activity-log.service');
    await logActivity({
      username: 'system',
      action: 'auto_cancel_stale_invoice',
      description: `Auto-cancelled ${result.count} stale invoice(s): ${details.join('; ').slice(0, 500)}`,
      module: 'invoice',
      metadata: { cancelledIds: ids, count: result.count },
    });
  } catch (e) {
    console.warn('[INVOICE_AUTO_CANCEL] Failed to log activity:', e);
  }

  console.log(`[INVOICE_AUTO_CANCEL] cancelled=${result.count} of ${staleInvoices.length} checked`);
  return { cancelled: result.count, total: staleInvoices.length, details };
}

/**
 * Invoice Status Update — change PENDING → OVERDUE when dueDate < now.
 */
export async function runInvoiceStatusUpdate(): Promise<{ updated: number }> {
  const now = await nowWIBAsync();
  const result = await prisma.invoice.updateMany({
    where: {
      status: 'PENDING',
      dueDate: { lt: now },
    },
    data: { status: 'OVERDUE' },
  });
  if (result.count > 0) {
    console.log(`[INVOICE_STATUS] ${result.count} invoices marked as OVERDUE`);
  }
  return { updated: result.count };
}

/**
 * Reminder schedule from Settings > WhatsApp > Notifikasi. One schedule for
 * every channel: WhatsApp, email (when "Notifikasi invoice" is on in the
 * email settings) and the customer app push.
 */
export interface ReminderSchedule {
  enabled: boolean;
  /** Offsets from the due date: -7 = 7 days before, 0 = due day, 3 = 3 days after. */
  days: number[];
  /** HH:mm in the company time zone; nothing is sent earlier in the day. */
  time: string;
  batchSize: number;
  batchDelaySec: number;
  randomize: boolean;
}

export async function loadReminderSchedule(): Promise<ReminderSchedule> {
  const s = await prisma.whatsapp_reminder_settings.findFirst();
  let days: number[] = [-7, -5, -3, 0];
  try {
    const parsed = s?.reminderDays ? JSON.parse(s.reminderDays) : null;
    if (Array.isArray(parsed)) days = parsed.map(Number).filter((n) => Number.isInteger(n) && n >= -30 && n <= 30);
  } catch { /* keep defaults */ }
  return {
    enabled: s?.enabled ?? true,
    days,
    time: /^\d{2}:\d{2}$/.test(s?.reminderTime || '') ? s!.reminderTime : '09:00',
    batchSize: Math.max(1, s?.batchSize ?? 10),
    batchDelaySec: Math.max(0, s?.batchDelay ?? 60),
    randomize: s?.randomize ?? true,
  };
}

/** Whole calendar days from today to the due date, in the company time zone (positive = before due). */
export function daysUntilDueLocal(dueDate: Date, now: Date): number {
  const ymd = (d: Date) => formatWIB(d, 'yyyy-MM-dd').split('-').map(Number);
  const [dy, dm, dd] = ymd(dueDate);
  const [ny, nm, nd] = ymd(now);
  return Math.round((Date.UTC(dy, dm - 1, dd) - Date.UTC(ny, nm - 1, nd)) / 86_400_000);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// The runner gives this job 55 minutes; leave room to finish cleanly. Work
// not reached is picked up by the next run on the same day.
const REMINDER_RUN_BUDGET_MS = 50 * 60 * 1000;

/**
 * Marks reminder `key` as sent on the invoice, atomically. Returns false when
 * it was already sent, including by the old format, which stored only the
 * day number for all channels together.
 */
async function claimReminder(invoiceId: string, key: string, day: number): Promise<boolean> {
  let claimed = false;
  await prisma.$transaction(async (tx) => {
    const current = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { sentReminders: true } });
    let sent: Array<number | string> = [];
    try { sent = current?.sentReminders ? JSON.parse(current.sentReminders) : []; } catch { /* treat as none */ }
    if (sent.includes(key) || sent.includes(day)) return;
    sent.push(key);
    await tx.invoice.update({ where: { id: invoiceId }, data: { sentReminders: JSON.stringify(sent) } });
    claimed = true;
  });
  return claimed;
}

/** Undo a claim after a failed send so the next run tries again. */
async function releaseReminder(invoiceId: string, key: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { sentReminders: true } });
    let sent: Array<number | string> = [];
    try { sent = current?.sentReminders ? JSON.parse(current.sentReminders) : []; } catch { return; }
    await tx.invoice.update({ where: { id: invoiceId }, data: { sentReminders: JSON.stringify(sent.filter((k) => k !== key)) } });
  }).catch(() => { /* next claim simply stays blocked for today */ });
}

/**
 * Invoice Reminder: WhatsApp, email and push for PENDING/OVERDUE invoices,
 * on the days and from the time set in the reminder settings. Runs hourly;
 * each channel is sent at most once per invoice per scheduled day.
 */
export interface InvoiceReminderResult {
  sent: number;
  skipped: number;
  total: number;
  errors: string[];
  note?: string;
  /** Why invoices got no message, so a run that sends nothing says why. */
  reasons?: { alreadySent: number; noPhone: number; noTemplate: number; waFailed: number };
}

const dayLabel = (d: number) => (d === 0 ? 'hari H' : d < 0 ? `H${d}` : `H+${d}`);

/**
 * When a run sends nothing: where the unpaid invoices stand, so the admin
 * sees whether that is expected (next reminder on a later day) or a gap in
 * the settings (overdue invoices, but no H+ day chosen).
 */
async function unpaidOutlook(now: Date, days: number[]): Promise<string> {
  const unpaid = await prisma.invoice.findMany({
    where: { status: { in: ['PENDING', 'OVERDUE'] } },
    select: { dueDate: true },
  });
  if (unpaid.length === 0) return '. Tidak ada invoice belum lunas';

  const offsets = unpaid.map((i) => -daysUntilDueLocal(i.dueDate, now)); // same sign as the settings: -3 = 3 days before
  const overdue = offsets.filter((o) => o > 0).length;
  const parts = [`. Invoice belum lunas: ${unpaid.length}`];
  if (overdue) {
    parts.push(days.some((d) => d > 0)
      ? `${overdue} sudah lewat jatuh tempo`
      : `${overdue} sudah lewat jatuh tempo dan tidak akan diingatkan karena tidak ada hari H+ di pengaturan reminder`);
  }
  // Next day on which some invoice reaches a reminder offset.
  let next = Infinity;
  for (const o of offsets) for (const d of days) if (d > o && d - o < next) next = d - o;
  if (Number.isFinite(next)) {
    const at = new Date(now.getTime() + next * 86_400_000);
    parts.push(`reminder berikutnya ${formatWIB(at, 'dd/MM/yyyy')}`);
  }
  return parts.join(', ');
}

/**
 * `manual`: started by an admin from the cron page, so the send time is not
 * waited for (the scheduled days and once-per-day rule still apply).
 */
export async function runInvoiceReminder(opts: { manual?: boolean } = {}): Promise<InvoiceReminderResult> {
  const started = Date.now();
  const now = await nowWIBAsync();
  const errors: string[] = [];
  const schedule = await loadReminderSchedule();

  if (!schedule.enabled) {
    return { sent: 0, skipped: 0, total: 0, errors, note: 'Reminder invoice dinonaktifkan di pengaturan' };
  }
  if (!opts.manual && formatWIB(now, 'HH:mm') < schedule.time) {
    return { sent: 0, skipped: 0, total: 0, errors, note: `Belum jam kirim (${schedule.time})` };
  }
  if (schedule.days.length === 0) {
    return { sent: 0, skipped: 0, total: 0, errors, note: 'Tidak ada hari reminder yang dipilih' };
  }

  // Only invoices whose due date is one of the scheduled offsets from today.
  const minOffset = Math.min(...schedule.days);
  const maxOffset = Math.max(...schedule.days);
  const windowStart = new Date(now.getTime() - (maxOffset + 1) * 86_400_000);
  const windowEnd = new Date(now.getTime() + (-minOffset + 1) * 86_400_000);

  const candidates = await prisma.invoice.findMany({
    where: {
      status: { in: ['PENDING', 'OVERDUE'] },
      dueDate: { gte: windowStart, lte: windowEnd },
    },
    select: {
      id: true, invoiceNumber: true, amount: true, dueDate: true, status: true,
      customerName: true, customerPhone: true, customerUsername: true, customerEmail: true,
      paymentLink: true, userId: true,
      user: {
        select: {
          address: true, customerId: true, email: true,
          profile: { select: { name: true } },
          area: { select: { name: true } },
        },
      },
    },
  });

  const [waProviders, company, emailSettings] = await Promise.all([
    prisma.whatsapp_providers.count({ where: { isActive: true } }),
    prisma.company.findFirst({ select: { name: true, phone: true } }),
    prisma.emailSettings.findFirst({ select: { enabled: true, notifyInvoice: true } }),
  ]);
  const waAvailable = waProviders > 0;
  const emailAvailable = !!emailSettings?.enabled && !!emailSettings?.notifyInvoice;

  const due = candidates
    .map((inv) => ({ inv, day: daysUntilDueLocal(inv.dueDate, now) }))
    .filter(({ day }) => schedule.days.includes(-day));
  if (schedule.randomize) {
    for (let i = due.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [due[i], due[j]] = [due[j], due[i]];
    }
  }

  const { sendInvoiceReminder } = await import('@/server/services/notifications/whatsapp-templates.service');
  const { EmailService } = await import('@/server/services/notifications/email.service');

  let sent = 0;
  let skipped = 0;
  let waInBatch = 0;
  let stoppedEarly = false;
  const reasons = { alreadySent: 0, noPhone: 0, noTemplate: 0, waFailed: 0 };

  for (const { inv, day } of due) {
    if (Date.now() - started > REMINDER_RUN_BUDGET_MS) { stoppedEarly = true; break; }

    const user = inv.user;
    const isOverdue = day < 0;
    const daysOverdue = isOverdue ? -day : 0;
    const customerName = inv.customerName || inv.customerUsername || 'Pelanggan';
    const customerEmail = inv.customerEmail || user?.email || null;
    const common = {
      customerName,
      customerId: user?.customerId || undefined,
      customerUsername: inv.customerUsername || undefined,
      profileName: user?.profile?.name,
      area: user?.area?.name,
      address: user?.address || undefined,
      invoiceNumber: inv.invoiceNumber,
      amount: inv.amount,
      dueDate: inv.dueDate,
      paymentLink: inv.paymentLink || '',
      companyName: company?.name || '',
      companyPhone: company?.phone || '',
      isOverdue,
      daysOverdue,
    };
    let any = false;

    try {
      if (waAvailable && !inv.customerPhone) reasons.noPhone++;
      else if (waAvailable && inv.customerPhone) {
        if (!await claimReminder(inv.id, `w:${day}`, day)) reasons.alreadySent++;
        else {
          // Pace WhatsApp sends per the batch settings to avoid provider bans.
          if (waInBatch >= schedule.batchSize) {
            await sleep(schedule.batchDelaySec * 1000);
            waInBatch = 0;
          }
          try {
            const ok = await sendInvoiceReminder({ phone: inv.customerPhone, ...common });
            waInBatch++;
            if (ok) any = true;
            else {
              reasons.noTemplate++;
              await releaseReminder(inv.id, `w:${day}`);
            }
          } catch (e: any) {
            reasons.waFailed++;
            await releaseReminder(inv.id, `w:${day}`);
            errors.push(`${inv.invoiceNumber} WA: ${e?.message || e}`);
          }
        }
      }

      if (emailAvailable && customerEmail && await claimReminder(inv.id, `e:${day}`, day)) {
        const r = await EmailService.sendInvoiceReminder({ email: customerEmail, ...common })
          .catch((e: any) => ({ success: false, error: e?.message || String(e) }));
        if (r?.success) any = true;
        else {
          await releaseReminder(inv.id, `e:${day}`);
          errors.push(`${inv.invoiceNumber} email: ${r?.error || 'gagal'}`);
        }
      }

      if (inv.userId && await claimReminder(inv.id, `p:${day}`, day)) {
        await sendPushToUser(inv.userId, isOverdue ? 'invoice-overdue' : 'invoice-reminder', {
          customerName,
          customerAddress: user?.address || undefined,
          profileName: user?.profile?.name,
          invoiceNumber: inv.invoiceNumber,
          amount: inv.amount,
          dueDate: inv.dueDate,
          companyName: company?.name || '',
          companyPhone: company?.phone || '',
          isOverdue,
          daysOverdue,
        }).catch((e) => console.error(`[INVOICE_REMINDER] Push failed for ${inv.invoiceNumber}:`, e?.message || e));
      }
    } catch (e: any) {
      errors.push(`${inv.invoiceNumber}: ${e?.message || e}`);
    }

    if (any) sent++;
    else skipped++;
  }

  const days = [...schedule.days].sort((a, b) => a - b).map(dayLabel).join(', ');
  const note = [
    due.length === 0 ? `tidak ada invoice belum lunas yang jatuh tempo pada hari reminder (${days}) hari ini${await unpaidOutlook(now, schedule.days)}` : '',
    !waAvailable ? 'tidak ada provider WhatsApp aktif' : '',
    reasons.alreadySent ? `${reasons.alreadySent} sudah dikirim hari ini` : '',
    reasons.noPhone ? `${reasons.noPhone} tanpa nomor HP` : '',
    reasons.noTemplate ? `${reasons.noTemplate} gagal: template invoice-reminder/overdue tidak aktif` : '',
    reasons.waFailed ? `${reasons.waFailed} gagal dikirim provider WhatsApp` : '',
    !emailAvailable ? 'email reminder nonaktif' : '',
    stoppedEarly ? 'batas waktu tercapai, sisa dikirim di jalan berikutnya' : '',
  ].filter(Boolean).join('; ') || undefined;
  console.log(`[INVOICE_REMINDER] due=${due.length} sent=${sent} skipped=${skipped} errors=${errors.length}${note ? ` (${note})` : ''}`);
  return { sent, skipped, total: due.length, errors, note, reasons };
}

/**
 * Auto Renewal — auto-renew PREPAID users from balance.
 */
export async function runAutoRenewal(): Promise<{ renewed: number; skipped: number; total: number; errors: string[] }> {
  const now = await nowWIBAsync();
  const errors: string[] = [];

  const renewWindow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const users = await prisma.pppoeUser.findMany({
    where: {
      autoRenewal: true,
      subscriptionType: 'PREPAID',
      status: { in: ['active', 'isolated'] },
      expiredAt: { lte: renewWindow },
    },
    include: {
      profile: { select: { id: true, name: true, groupName: true, price: true, ppnActive: true, ppnRate: true, validityValue: true, validityUnit: true } },
      area: { select: { name: true } },
      router: { select: { id: true, authMode: true } },
    },
  });

  let renewed = 0;
  let skipped = 0;

  for (const user of users) {
    try {
      if (!user.profile) { skipped++; continue; }

      const baseAmount = Math.max(0, user.profile.price - (user.discount || 0));
      let amount = baseAmount;
      if (user.profile.ppnActive && user.profile.ppnRate > 0) {
        amount = Math.round(baseAmount + (baseAmount * Number(user.profile.ppnRate) / 100));
      }

      if (user.balance < amount) { skipped++; continue; }

      // ─── ATOMIC: balance decrement + expiry update + invoice mark-paid ────────
      // All operations in a single $transaction to ensure balance and ledger
      // stay consistent. If any step fails, everything rolls back.
      const validityValue = (user.profile as any).validityValue || 1;
      const validityUnit = (user.profile as any).validityUnit || 'MONTHS';
      let validityMs: number;
      switch (validityUnit) {
        case 'MINUTES': validityMs = validityValue * 60 * 1000; break;
        case 'HOURS':   validityMs = validityValue * 60 * 60 * 1000; break
        case 'DAYS':    validityMs = validityValue * 24 * 60 * 60 * 1000; break;
        case 'MONTHS':  validityMs = validityValue * 30 * 24 * 60 * 60 * 1000; break;
        default:        validityMs = 30 * 24 * 60 * 60 * 1000;
      }
      const baseDate = user.expiredAt && user.expiredAt > now ? user.expiredAt : now;
      const newExpiredAt = new Date(baseDate.getTime() + validityMs);

      try {
        await prisma.$transaction(async (tx) => {
          // Atomic conditional balance decrement — only if balance still sufficient
          // This prevents double-decrement if cron runs concurrently
          const balanceResult = await tx.pppoeUser.updateMany({
            where: { id: user.id, balance: { gte: amount } },
            data: {
              balance: { decrement: amount },
              expiredAt: newExpiredAt,
              status: 'active',
            },
          });

          if (balanceResult.count === 0) {
            // Balance insufficient or user not found — skip
            throw new Error('BALANCE_INSUFFICIENT');
          }

          // Mark unpaid invoices as PAID (atomic conditional update)
          await tx.invoice.updateMany({
            where: {
              userId: user.id,
              status: { in: ['PENDING', 'OVERDUE'] },
            },
            data: {
              status: 'PAID',
              paidAt: now,
            },
          });

          // ─── Record in Keuangan ledger (atomic with balance decrement) ────────
          // Ensures auto-renewal balance usage is tracked in financial reports.
          let subscriptionCategory = await tx.transactionCategory.findFirst({
            where: { name: 'Subscription' },
          });
          if (!subscriptionCategory) {
            subscriptionCategory = await tx.transactionCategory.create({
              data: {
                id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                name: 'Subscription',
                type: 'INCOME',
                description: 'Pembayaran subscription auto-renewal',
              },
            });
          }
          await tx.transaction.create({
            data: {
              id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              categoryId: subscriptionCategory.id,
              amount: amount,
              type: 'INCOME',
              description: `Auto-renewal ${user.username} - ${(user.profile as any).name || 'profile'}`,
              reference: `AUTO-RENEW-${user.id}-${now.toISOString().slice(0, 10)}`,
              notes: `Auto renewal dari saldo, profile: ${(user.profile as any).name || 'N/A'}`,
              createdAt: now,
              createdBy: 'system',
            },
          });
        });
      } catch (txError: any) {
        if (txError?.message === 'BALANCE_INSUFFICIENT') {
          skipped++;
          continue;
        }
        throw txError;
      }

      // If user was isolated, restore RADIUS + PPP secret so they reconnect normally
      if (user.status === 'isolated') {
        const nasIdentifier = user.router?.id || null;
        const authMode = user.router?.authMode || 'local';
        const groupName = (user.profile as any).groupName;
        try {
          // Restore radcheck password
          await prisma.$executeRaw`
            INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
            VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasIdentifier})
            ON DUPLICATE KEY UPDATE value = ${user.password}
          `;
          // Restore radusergroup to original profile
          await prisma.$executeRaw`
            DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
          `;
          await prisma.$executeRaw`
            INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
            VALUES (${user.username}, ${groupName}, 1, ${nasIdentifier})
          `;
          // Remove isolir reply message
          await prisma.radreply.deleteMany({
            where: {
              username: user.username,
              attribute: 'Reply-Message',
              ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}),
            }
          });
          // Restore PPP secret in MikroTik
          if (user.router?.id && shouldManagePppSecretForSuspend(authMode)) {
            const { managePppSecret, kickPppoeSession } = await import('@/server/services/mikrotik/ppp-secret.service');
            managePppSecret(user.router.id, 'enable', {
              username: user.username,
              password: user.password,
              profile: groupName,
            }).then(r => console.log(`[AUTO_RENEWAL] PPP secret restored to ${groupName} for ${user.username}: ${r.message}`))
              .catch(e => console.error(`[AUTO_RENEWAL] PPP secret restore failed for ${user.username}:`, e?.message || e));
            kickPppoeSession(user.router.id, user.username)
              .then(k => console.log(`[AUTO_RENEWAL] Kicked ${k} session(s) for ${user.username}`))
              .catch(e => console.error(`[AUTO_RENEWAL] Kick failed for ${user.username}:`, e?.message || e));
          }
          // CoA disconnect
          const { disconnectPPPoEUser } = await import('@/server/services/radius/coa-handler.service');
          await disconnectPPPoEUser(user.username);
          console.log(`[AUTO_RENEWAL] RADIUS restored for ${user.username} (was isolated)`);
        } catch (radiusErr: any) {
          console.error(`[AUTO_RENEWAL] RADIUS restore error for ${user.username}:`, radiusErr?.message);
        }
      }

      renewed++;
      console.log(`[AUTO_RENEWAL] Renewed ${user.username} until ${newExpiredAt.toISOString()}`);

      // Admin notification feed — auto-renewal is a real payment event (drawn
      // from prepaid balance) that previously never showed up in /admin/notifications.
      try {
        const { NotificationService } = await import('@/server/services/notifications/dispatcher.service');
        await NotificationService.notifyPaymentReceived({
          amount,
          customerName: user.name || user.username,
          customerUsername: user.username,
          gateway: 'auto-renewal',
        });
      } catch (e: any) {
        console.error(`[AUTO_RENEWAL] Admin notification failed for ${user.username}:`, e?.message || e);
      }

      // Send WhatsApp notification about successful auto-renewal
      const renewalCompany = await prisma.company.findFirst({ select: { name: true, phone: true } });
      if (user.phone) {
        const { sendAutoRenewalSuccess } = await import('@/server/services/notifications/whatsapp-templates.service');
        await sendAutoRenewalSuccess({
          customerName: user.name || user.username,
          customerPhone: user.phone,
          customerId: user.customerId || undefined,
          username: user.username,
          profileName: (user.profile as any).name || '-',
          area: (user as any).area?.name,
          address: user.address || undefined,
          amount,
          newBalance: user.balance - amount,
          expiredDate: newExpiredAt,
        }).catch((e) => console.error(`[AUTO_RENEWAL] WhatsApp failed for ${user.username}:`, e?.message || e));
      }

      // Send push notification about successful auto-renewal
      await sendPushToUser(user.id, 'auto-renewal-success', {
        customerName: user.name || user.username,
        customerAddress: user.address || undefined,
        username: user.username,
        amount,
        profileName: (user.profile as any).name || '',
        newBalance: user.balance - amount,
        expiredDate: newExpiredAt,
        companyName: renewalCompany?.name || '',
        companyPhone: renewalCompany?.phone || '',
      }).catch((e) => console.error(`[AUTO_RENEWAL] Push failed for ${user.username}:`, e?.message || e));
    } catch (err: any) {
      errors.push(`${user.username}: ${err?.message || err}`);
    }
  }

  console.log(`[AUTO_RENEWAL] renewed=${renewed} skipped=${skipped} errors=${errors.length}`);
  return { renewed, skipped, total: users.length, errors };
}

/**
 * Disconnect Sessions — kick stop/blocked users (NOT isolated, they stay online in isolir).
 */
export async function runDisconnectSessions(): Promise<{ disconnected: number; total: number; errors: string[] }> {
  const { kickPppoeSession } = await import('@/server/services/mikrotik/ppp-secret.service');
  const { disconnectPPPoEUser } = await import('@/server/services/radius/coa-handler.service');

  const offlineUsers = await prisma.pppoeUser.findMany({
    where: { status: { in: ['stop', 'blocked'] } },
    select: { id: true, username: true, status: true, routerId: true, router: { select: { id: true, authMode: true } } },
  });

  let disconnected = 0;
  const errors: string[] = [];

  for (const user of offlineUsers) {
    if (!user.router?.id) continue;
    const authMode = user.router?.authMode || 'local';

    if (authMode !== 'radius') {
      try {
        const kicked = await kickPppoeSession(user.router.id, user.username);
        if (kicked > 0) {
          disconnected++;
          console.log(`[DISCONNECT] Kicked ${user.username} (status=${user.status})`);
        }
      } catch (e: any) {
        errors.push(`${user.username}: ${e?.message || e}`);
      }
    }

    try {
      await disconnectPPPoEUser(user.username);
    } catch { /* non-fatal */ }
  }

  return { disconnected, total: offlineUsers.length, errors };
}

/**
 * Suspend Check — process approved manual suspend requests.
 * Postpaid auto-isolir is handled by runAutoIsolir.
 *
 * This does the SAME RADIUS + MikroTik sync as a manual status change to
 * 'isolated' — without it, the user's DB status changes but their MikroTik
 * session stays on the normal profile (no actual isolation).
 */
export async function runSuspendCheck(): Promise<{ suspended: number; total: number; errors: string[] }> {
  const { managePppSecret, shouldManagePppSecretForSuspend, kickPppoeSession } = await import('@/server/services/mikrotik/ppp-secret.service');
  const { disconnectPPPoEUser } = await import('@/server/services/radius/coa-handler.service');

  let suspended = 0;
  const errors: string[] = [];

  const now = await nowWIBAsync();
  const approved = await prisma.suspendRequest.findMany({
    where: { status: 'APPROVED', startDate: { lte: now } },
    include: {
      user: {
        select: {
          id: true, username: true, password: true, ipAddress: true,
          connectionType: true,
          profile: { select: { groupName: true } },
          router: { select: { id: true, authMode: true } },
        },
      },
    },
  });

  for (const req of approved) {
    try {
      const user = req.user;
      if (!user) {
        errors.push(`suspend_${req.id}: user not found`);
        continue;
      }

      // Idempotency: skip if user is already isolated (this request was
      // already processed by a previous cron run)
      const currentUser = await prisma.pppoeUser.findUnique({
        where: { id: req.userId },
        select: { status: true },
      });
      if (currentUser?.status === 'isolated') {
        continue;
      }

      const nasIdentifier = user.router?.id || null;

      // 1. Update DB status to isolated
      await prisma.pppoeUser.update({ where: { id: req.userId }, data: { status: 'isolated' } });

      // 2. Sync RADIUS tables — move to isolir group
      await prisma.radcheck.deleteMany({
        where: { username: user.username, attribute: 'Auth-Type', ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}) },
      });
      await prisma.radcheck.deleteMany({
        where: { username: user.username, attribute: 'NAS-IP-Address', ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}) },
      });
      await prisma.radreply.deleteMany({
        where: { username: user.username, attribute: 'Reply-Message', ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}) },
      });
      await prisma.$executeRaw`
        INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
        VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasIdentifier})
        ON DUPLICATE KEY UPDATE value = ${user.password}
      `;
      await prisma.$executeRaw`
        DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
      `;
      await prisma.$executeRaw`
        INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
        VALUES (${user.username}, 'isolir', 1, ${nasIdentifier})
      `;
      await prisma.$executeRaw`
        DELETE FROM radreply WHERE username = ${user.username} AND attribute = 'Framed-IP-Address' AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
      `;

      // 3. MikroTik sync — change PPP secret profile to isolir + kick active session
      if (user.router?.id && shouldManagePppSecretForSuspend(user.router.authMode)) {
        const connType = user.connectionType || 'PPPOE';
        if (connType === 'HOTSPOT') {
          try {
            const { manageHotspotUser, kickHotspotSession } = await import('@/server/services/mikrotik/arp-hotspot.service');
            await manageHotspotUser(user.router.id, 'update', {
              username: user.username, password: user.password, disabled: true, comment: 'Manual suspend',
            });
            await kickHotspotSession(user.router.id, user.username);
          } catch (e: any) {
            errors.push(`suspend_${req.id} hotspot: ${e?.message || e}`);
          }
        } else {
          try {
            await managePppSecret(user.router.id, 'enable', {
              username: user.username, password: user.password, profile: 'isolir',
            });
            await kickPppoeSession(user.router.id, user.username);
          } catch (e: any) {
            errors.push(`suspend_${req.id} pppoe: ${e?.message || e}`);
          }
        }
      }

      // 4. CoA disconnect
      try { await disconnectPPPoEUser(user.username); } catch { /* non-fatal */ }

      suspended++;
      console.log(`[SUSPEND_CHECK] Manual suspend applied for user ${user.username} (req ${req.id})`);
    } catch (e: any) {
      errors.push(`suspend_${req.id}: ${e?.message || e}`);
    }
  }

  return { suspended, total: approved.length, errors };
}
