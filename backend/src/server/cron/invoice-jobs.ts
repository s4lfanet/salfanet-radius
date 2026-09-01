import { prisma } from '@/server/db/client';
import { nowWIB, nowWIBAsync, WIB_TIMEZONE } from '@/lib/timezone';
import { formatInTimeZone } from 'date-fns-tz';
import { generateInvoiceNumber } from '@/server/services/billing/invoice.service';
import { nanoid } from 'nanoid';
import { randomBytes } from 'crypto';
import { shouldManagePppSecretForSuspend } from '@/server/services/mikrotik/ppp-secret.service';
import { sendPushToUser } from '@/server/services/notifications/push-templates.service';

/**
 * Invoice Generate — generate monthly invoices for active/isolated users.
 * PREPAID: invoiceType=RENEWAL, dueDate=expiredAt
 * POSTPAID: invoiceType=MONTHLY, dueDate=billingDay of current month
 */
export async function runInvoiceGenerate(): Promise<{ generated: number; skipped: number; total: number; errors: string[] }> {
  // Refresh timezone from DB — company might have changed it
  const now = await nowWIBAsync();
  const errors: string[] = [];

  const company = await prisma.company.findFirst({
    select: { invoiceGenerateDays: true, baseUrl: true, name: true, phone: true },
  });
  const baseUrl = company?.baseUrl || 'http://localhost:3000';

  const wibMonthStr = formatInTimeZone(now, WIB_TIMEZONE, 'yyyy-MM');
  const year = parseInt(wibMonthStr.substring(0, 4));
  const month = parseInt(wibMonthStr.substring(5, 7));
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const users = await prisma.pppoeUser.findMany({
    where: { status: { in: ['active', 'isolated'] } },
    include: {
      profile: { select: { id: true, name: true, price: true, ppnActive: true, ppnRate: true } },
    },
  });

  // Batch fetch existing invoices for this month to avoid duplicates
  const existingInvoices = await prisma.invoice.findMany({
    where: {
      userId: { in: users.map(u => u.id) },
      invoiceType: { in: ['MONTHLY', 'RENEWAL'] },
      dueDate: { gte: monthStart, lte: monthEnd },
      status: { not: 'CANCELLED' },
    },
    select: { userId: true },
  });
  const usersWithInvoice = new Set(existingInvoices.map(i => i.userId).filter(Boolean) as string[]);

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
      if (usersWithInvoice.has(user.id)) {
        skipped++;
        continue;
      }

      if (!user.profile) {
        errors.push(`${user.username}: profile not found`);
        continue;
      }

      const subscriptionType = (user as any).subscriptionType || 'POSTPAID';
      let dueDate: Date;
      let invoiceType: string;

      if (subscriptionType === 'PREPAID') {
        if (!user.expiredAt) { skipped++; continue; }
        dueDate = user.expiredAt;
        invoiceType = 'RENEWAL';
      } else {
        const billingDay = (user as any).billingDay ?? 1;
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const day = Math.min(billingDay, daysInMonth);
        dueDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
        invoiceType = 'MONTHLY';
      }

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
              invoiceType: invoiceType as any,
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
  return { generated, skipped, total: users.length, errors };
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
 * Invoice Reminder — send WA reminders for PENDING/OVERDUE invoices.
 * Uses sendInvoiceReminder from whatsapp-templates.service (available in server context).
 */
export async function runInvoiceReminder(): Promise<{ sent: number; skipped: number; total: number; errors: string[] }> {
  const now = await nowWIBAsync();
  const errors: string[] = [];

  const remindBefore = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ['PENDING', 'OVERDUE'] },
      dueDate: { lte: remindBefore },
      customerPhone: { not: null },
    },
    select: {
      id: true, invoiceNumber: true, amount: true, dueDate: true, status: true,
      customerName: true, customerPhone: true, customerUsername: true,
      paymentLink: true, sentReminders: true, userId: true,
    },
  });

  // Phase 7: Parallelize independent queries
  const [waProviders, company] = await Promise.all([
    prisma.whatsapp_providers.findMany({ where: { isActive: true } }),
    prisma.company.findFirst({ select: { name: true, phone: true } }),
  ]);
  const waAvailable = waProviders.length > 0;

  let sent = 0;
  let skipped = 0;

  for (const inv of invoices) {
    try {
      if (!waAvailable || !inv.customerPhone) {
        skipped++;
        continue;
      }

      let sentDays: number[] = [];
      try { sentDays = inv.sentReminders ? JSON.parse(inv.sentReminders) : []; } catch {}
      const daysUntilDue = Math.ceil((inv.dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      if (sentDays.includes(daysUntilDue)) {
        skipped++;
        continue;
      }

      // ─── Idempotency: atomically claim this reminder BEFORE sending ───────
      // Update sentReminders first — if another instance already claimed it,
      // the update will be a no-op (we re-check sentDays inside transaction).
      let claimed = false;
      try {
        await prisma.$transaction(async (tx) => {
          const current = await tx.invoice.findUnique({
            where: { id: inv.id },
            select: { sentReminders: true },
          });
          let currentDays: number[] = [];
          try { currentDays = current?.sentReminders ? JSON.parse(current.sentReminders) : []; } catch {}
          if (currentDays.includes(daysUntilDue)) {
            // Another instance already sent this reminder — skip
            return;
          }
          currentDays.push(daysUntilDue);
          await tx.invoice.update({
            where: { id: inv.id },
            data: { sentReminders: JSON.stringify(currentDays) },
          });
          claimed = true;
        });
      } catch {
        // If transaction fails (e.g., row locked), skip this invoice
        skipped++;
        continue;
      }

      if (!claimed) {
        skipped++;
        continue;
      }

      const { sendInvoiceReminder } = await import('@/server/services/notifications/whatsapp-templates.service');
      await sendInvoiceReminder({
        phone: inv.customerPhone!,
        customerName: inv.customerName || inv.customerUsername || 'Customer',
        customerUsername: inv.customerUsername || undefined,
        invoiceNumber: inv.invoiceNumber,
        amount: inv.amount,
        dueDate: inv.dueDate,
        paymentLink: inv.paymentLink || '',
        companyName: company?.name || '',
        companyPhone: company?.phone || '',
        isOverdue: inv.status === 'OVERDUE' || inv.dueDate < now,
        daysOverdue: inv.dueDate < now ? Math.ceil((now.getTime() - inv.dueDate.getTime()) / (24 * 60 * 60 * 1000)) : 0,
      });

      // Send web push notification alongside WhatsApp
      if (inv.userId) {
        const isOverdue = inv.status === 'OVERDUE' || inv.dueDate < now;
        await sendPushToUser(inv.userId, isOverdue ? 'invoice-overdue' : 'invoice-reminder', {
          customerName: inv.customerName || inv.customerUsername || 'Pelanggan',
          invoiceNumber: inv.invoiceNumber,
          amount: inv.amount,
          dueDate: inv.dueDate,
          companyName: company?.name || '',
          companyPhone: company?.phone || '',
          isOverdue,
          daysOverdue: isOverdue ? Math.ceil((now.getTime() - inv.dueDate.getTime()) / (24 * 60 * 60 * 1000)) : 0,
        }).catch((e) => console.error(`[INVOICE_REMINDER] Push failed for ${inv.invoiceNumber}:`, e?.message || e));
      }

      sent++;
    } catch (err: any) {
      errors.push(`${inv.invoiceNumber}: ${err?.message || err}`);
    }
  }

  console.log(`[INVOICE_REMINDER] sent=${sent} skipped=${skipped} errors=${errors.length}`);
  return { sent, skipped, total: invoices.length, errors };
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

      // Send push notification about successful auto-renewal
      const renewalCompany = await prisma.company.findFirst({ select: { name: true, phone: true } });
      await sendPushToUser(user.id, 'auto-renewal-success', {
        customerName: user.name || user.username,
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
 */
export async function runSuspendCheck(): Promise<{ suspended: number; total: number; errors: string[] }> {
  let suspended = 0;
  const errors: string[] = [];

  const now = await nowWIBAsync();
  const approved = await prisma.suspendRequest.findMany({
    where: { status: 'APPROVED', startDate: { lte: now } },
  });
  for (const req of approved) {
    try {
      await prisma.pppoeUser.update({ where: { id: req.userId }, data: { status: 'isolated' } });
      suspended++;
      console.log(`[SUSPEND_CHECK] Manual suspend applied for user ${req.userId}`);
    } catch (e: any) {
      errors.push(`suspend_${req.id}: ${e?.message || e}`);
    }
  }

  return { suspended, total: approved.length, errors };
}
