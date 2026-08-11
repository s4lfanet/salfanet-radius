import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { nowWIB } from '../../common/utils/timezone';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { EmailService } from '../email/email.service';
import { MikrotikService } from '../mikrotik/mikrotik.service';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);
  private runningJobs = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
    private readonly email: EmailService,
    private readonly mikrotik: MikrotikService,
  ) {}

  // ==================== TRIGGER JOB ====================

  async triggerJob(jobType: string) {
    const jobId = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const history = await this.prisma.cronHistory.create({
      data: { id: jobId, jobType, status: 'running', startedAt: nowWIB() },
    });

    try {
      let result: any;

      switch (jobType) {
        case 'hotspot_sync':
          result = await this.runHotspotSync();
          break;
        case 'pppoe_auto_isolir':
          result = await this.runAutoIsolir();
          break;
        case 'agent_sales':
          result = await this.runAgentSales();
          break;
        case 'invoice_generate':
          result = await this.runInvoiceGenerate();
          break;
        case 'invoice_reminder':
          result = await this.runInvoiceReminder();
          break;
        case 'notification_check':
          result = await this.runNotificationCheck();
          break;
        case 'disconnect_sessions':
          result = await this.runDisconnectSessions();
          break;
        case 'auto_renewal':
          result = await this.runAutoRenewal();
          break;
        case 'webhook_log_cleanup':
          result = await this.runWebhookLogCleanup();
          break;
        case 'invoice_status_update':
          result = await this.runInvoiceStatusUpdate();
          break;
        case 'session_monitor':
          result = await this.runSessionMonitor();
          break;
        case 'pppoe_session_sync':
          result = await this.runPppoeSessionSync();
          break;
        case 'suspend_check':
          result = await this.runSuspendCheck();
          break;
        case 'freeradius_health':
          result = await this.runFreeradiusHealth();
          break;
        case 'activity_log_cleanup':
          result = await this.runActivityLogCleanup();
          break;
        case 'olt_poll':
          result = await this.runOltPoll();
          break;
        case 'cron_history_cleanup':
          result = await this.runCronHistoryCleanup();
          break;
        case 'session_recovery':
          result = await this.runSessionRecovery();
          break;
        default:
          throw new HttpException(`Unknown job type: ${jobType}`, HttpStatus.BAD_REQUEST);
      }

      const completedAt = nowWIB();
      const duration = completedAt.getTime() - history.startedAt.getTime();
      await this.prisma.cronHistory.update({
        where: { id: jobId },
        data: { status: 'success', completedAt, duration, result: JSON.stringify(result).slice(0, 1000) },
      });

      return { success: true, jobId, result };
    } catch (err: any) {
      const completedAt = nowWIB();
      const duration = completedAt.getTime() - history.startedAt.getTime();
      await this.prisma.cronHistory.update({
        where: { id: jobId },
        data: { status: 'error', completedAt, duration, error: err.message.slice(0, 1000) },
      });
      throw err;
    }
  }

  // ==================== SCHEDULED CRON TRIGGERS ====================

  @Cron('* * * * *')
  async scheduledHotspotSync() {
    await this.runWithLock('hotspot_sync', () => this.runHotspotSync());
  }

  @Cron('0 * * * *')
  async scheduledAutoIsolir() {
    await this.runWithLock('pppoe_auto_isolir', () => this.runAutoIsolir());
  }

  @Cron('*/5 * * * *')
  async scheduledAgentSales() {
    await this.runWithLock('agent_sales', () => this.runAgentSales());
  }

  @Cron('0 7 * * *')
  async scheduledInvoiceGenerate() {
    await this.runWithLock('invoice_generate', () => this.runInvoiceGenerate());
  }

  @Cron('0 * * * *')
  async scheduledInvoiceReminder() {
    await this.runWithLock('invoice_reminder', () => this.runInvoiceReminder());
  }

  @Cron('0 * * * *')
  async scheduledInvoiceStatusUpdate() {
    await this.runWithLock('invoice_status_update', () => this.runInvoiceStatusUpdate());
  }

  @Cron('0 */6 * * *')
  async scheduledNotificationCheck() {
    await this.runWithLock('notification_check', () => this.runNotificationCheck());
  }

  @Cron('*/15 * * * *')
  async scheduledSessionMonitor() {
    await this.runWithLock('session_monitor', () => this.runSessionMonitor());
  }

  @Cron('*/5 * * * *')
  async scheduledDisconnectSessions() {
    await this.runWithLock('disconnect_sessions', () => this.runDisconnectSessions());
  }

  @Cron('0 2 * * *')
  async scheduledActivityLogCleanup() {
    await this.runWithLock('activity_log_cleanup', () => this.runActivityLogCleanup());
  }

  @Cron('0 8 * * *')
  async scheduledAutoRenewal() {
    await this.runWithLock('auto_renewal', () => this.runAutoRenewal());
  }

  @Cron('0 3 * * *')
  async scheduledWebhookLogCleanup() {
    await this.runWithLock('webhook_log_cleanup', () => this.runWebhookLogCleanup());
  }

  @Cron('*/5 * * * *')
  async scheduledFreeradiusHealth() {
    await this.runWithLock('freeradius_health', () => this.runFreeradiusHealth());
  }

  @Cron('*/5 * * * *')
  async scheduledPppoeSessionSync() {
    await this.runWithLock('pppoe_session_sync', () => this.runPppoeSessionSync());
  }

  @Cron('0 * * * *')
  async scheduledSuspendCheck() {
    await this.runWithLock('suspend_check', () => this.runSuspendCheck());
  }

  @Cron('0 4 * * *')
  async scheduledCronHistoryCleanup() {
    await this.runWithLock('cron_history_cleanup', () => this.runCronHistoryCleanup());
  }

  private async runWithLock(jobType: string, fn: () => Promise<any>) {
    if (this.runningJobs.has(jobType)) {
      this.logger.warn(`Skipping ${jobType} — already running`);
      return;
    }
    this.runningJobs.add(jobType);
    try {
      await this.triggerJob(jobType);
    } catch (err: any) {
      this.logger.error(`Scheduled ${jobType} failed: ${err.message}`);
    } finally {
      this.runningJobs.delete(jobType);
    }
  }

  // ==================== SCHEDULES ====================

  async listSchedules() {
    return this.prisma.cronScheduleConfig.findMany({ orderBy: { jobType: 'asc' } });
  }

  async updateSchedule(jobType: string, body: { schedule?: string; enabled?: boolean; updatedBy?: string }) {
    try {
      return await this.prisma.cronScheduleConfig.update({
        where: { jobType },
        data: body as never,
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        // Create if not exists
        return this.prisma.cronScheduleConfig.create({
          data: { jobType, schedule: body.schedule || '0 * * * *', enabled: body.enabled ?? true, updatedBy: body.updatedBy },
        });
      }
      throw error;
    }
  }

  async deleteSchedule(jobType: string) {
    try {
      await this.prisma.cronScheduleConfig.delete({ where: { jobType } });
      return { success: true };
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Schedule not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  // ==================== STATUS ====================

  async getStatus() {
    const recent = await this.prisma.cronHistory.findMany({
      orderBy: { startedAt: 'desc' },
      take: 50,
    });

    const byJobType = new Map<string, { lastRun: Date; lastStatus: string; count: number }>();
    for (const h of recent) {
      const existing = byJobType.get(h.jobType);
      if (!existing || h.startedAt > existing.lastRun) {
        byJobType.set(h.jobType, { lastRun: h.startedAt, lastStatus: h.status, count: (existing?.count || 0) + 1 });
      } else {
        existing.count++;
      }
    }

    const schedules = await this.prisma.cronScheduleConfig.findMany();
    const scheduleMap = new Map(schedules.map((s) => [s.jobType, s]));

    const jobs = Array.from(byJobType.entries()).map(([jobType, data]) => ({
      jobType,
      lastRun: data.lastRun,
      lastStatus: data.lastStatus,
      schedule: scheduleMap.get(jobType)?.schedule || null,
      enabled: scheduleMap.get(jobType)?.enabled ?? true,
    }));

    return { jobs, totalJobs: jobs.length };
  }

  // ==================== JOB IMPLEMENTATIONS (stubs) ====================

  private async runHotspotSync() {
    // 1. Check WAITING vouchers for first login (WAITING -> ACTIVE)
    const waitingVouchers = await this.prisma.hotspotVoucher.findMany({
      where: { status: 'WAITING' },
      include: { profile: true },
    });

    let activated = 0;
    for (const voucher of waitingVouchers) {
      const activeSession = await this.prisma.radacct.findFirst({
        where: { username: voucher.code, acctstarttime: { not: null } },
        orderBy: { acctstarttime: 'asc' },
      });

      if (activeSession?.acctstarttime) {
        const firstLoginAt = activeSession.acctstarttime;
        let expiresAtMs = firstLoginAt.getTime();
        const v = voucher.profile.validityUnit;
        const n = voucher.profile.validityValue;
        if (v === 'MINUTES') expiresAtMs += n * 60 * 1000;
        else if (v === 'HOURS') expiresAtMs += n * 60 * 60 * 1000;
        else if (v === 'DAYS') expiresAtMs += n * 24 * 60 * 60 * 1000;
        else if (v === 'MONTHS') {
          const d = new Date(firstLoginAt);
          d.setMonth(d.getMonth() + n);
          expiresAtMs = d.getTime();
        }

        const updated = await this.prisma.hotspotVoucher.update({
          where: { id: voucher.id },
          data: { status: 'ACTIVE', firstLoginAt, expiresAt: new Date(expiresAtMs) },
        });

        if (updated.agentId) {
          try {
            await this.prisma.agentNotification.create({
              data: {
                id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                agentId: updated.agentId,
                type: 'voucher_activated',
                title: 'Voucher Digunakan',
                message: `Voucher ${voucher.code} (${voucher.profile.name}) telah digunakan.`,
                link: null,
              },
            });
          } catch { /* ignore */ }
        }
        activated++;
      }
    }

    // 2. Check ACTIVE vouchers for expiry (ACTIVE -> EXPIRED)
    const now = nowWIB();
    const expiredVouchers = await this.prisma.hotspotVoucher.findMany({
      where: { status: 'ACTIVE', expiresAt: { lte: now } },
      include: { profile: { select: { name: true } } },
    });

    let expired = 0;
    for (const voucher of expiredVouchers) {
      const updated = await this.prisma.hotspotVoucher.update({
        where: { id: voucher.id },
        data: { status: 'EXPIRED' },
      });

      if (updated.agentId) {
        try {
          await this.prisma.agentNotification.create({
            data: {
              id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              agentId: updated.agentId,
              type: 'voucher_expired',
              title: 'Voucher Kadaluarsa',
              message: `Voucher ${voucher.code} (${voucher.profile.name}) telah kadaluarsa.`,
              link: null,
            },
          });
        } catch { /* ignore */ }
      }

      // Disconnect active session via MikroTik API
      const session = await this.prisma.radacct.findFirst({
        where: { username: voucher.code, acctstoptime: null },
        select: { radacctid: true, nasipaddress: true, acctsessionid: true },
      });
      if (session) {
        try {
          const router = await this.prisma.router.findFirst({
            where: { OR: [{ nasname: session.nasipaddress }, { ipAddress: session.nasipaddress }] },
            select: { id: true, name: true, nasname: true, ipAddress: true, username: true, password: true, port: true },
          });
          if (router?.username && router?.password) {
            await this.disconnectViaMikrotik(voucher.code, router);
          }
        } catch (err: any) {
          this.logger.warn(`Failed to disconnect ${voucher.code}: ${err.message}`);
        }
        // Mark session stopped in radacct
        await this.prisma.radacct.update({
          where: { radacctid: session.radacctid },
          data: { acctstoptime: now, acctterminatecause: 'Session-Timeout' },
        }).catch(() => {});
      }
      expired++;
    }

    return { success: true, activated, expired };
  }

  private async disconnectViaMikrotik(username: string, router: any) {
    const { RouterOSAPI } = require('node-routeros');
    const host = router.ipAddress || router.nasname;
    const port = router.port || 8728;
    const api = new RouterOSAPI({ host, port, user: router.username, password: router.password, timeout: 5000 });
    try {
      await api.connect();
      // Try hotspot active list
      try {
        const active = await api.write('/ip/hotspot/active/print', [`?user=${username}`]);
        for (const u of active) {
          await api.write('/ip/hotspot/active/remove', [`=.id=${u['.id']}`]);
        }
      } catch { /* not hotspot */ }
      // Try PPPoE active list
      try {
        const ppp = await api.write('/ppp/active/print', [`?name=${username}`]);
        for (const u of ppp) {
          await api.write('/ppp/active/remove', [`=.id=${u['.id']}`]);
        }
      } catch { /* not pppoe */ }
      api.close();
    } catch (err: any) {
      try { api.close(); } catch { /* ignore */ }
      throw err;
    }
  }

  private async runAutoIsolir() {
    const expiredUsers = await this.prisma.pppoeUser.findMany({
      where: { status: 'ACTIVE', expiredAt: { lt: nowWIB() } },
      select: { id: true, username: true },
    });

    let isolated = 0;
    for (const user of expiredUsers) {
      await this.prisma.pppoeUser.update({ where: { id: user.id }, data: { status: 'ISOLATED' as never } });
      isolated++;
    }

    return { isolated, total: expiredUsers.length };
  }

  private async runAgentSales() {
    // Record sales for active vouchers
    const vouchers = await this.prisma.hotspotVoucher.findMany({
      where: { status: 'ACTIVE', agentId: { not: null } },
      include: { profile: true },
      take: 500,
    });

    let recorded = 0;
    for (const v of vouchers) {
      if (!v.agentId) continue;
      const existing = await this.prisma.agentSale.findFirst({ where: { voucherCode: v.code } });
      if (existing) continue;
      await this.prisma.agentSale.create({
        data: {
          id: `sale_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          agentId: v.agentId, voucherCode: v.code,
          profileName: v.profile?.name || 'Unknown',
          amount: v.profile?.sellingPrice || 0,
          paymentStatus: 'PAID', paymentDate: nowWIB(), paidAmount: v.profile?.sellingPrice || 0,
        },
      });
      recorded++;
    }

    return { recorded, total: vouchers.length };
  }

  private async runInvoiceGenerate() {
    // Generate monthly invoices for active users
    const users = await this.prisma.pppoeUser.findMany({
      where: { status: 'ACTIVE', autoRenewal: true },
      include: { profile: true },
    });

    let generated = 0;
    const now = nowWIB();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    for (const user of users) {
      if (!user.profile) continue;
      // Check if invoice already exists for this month
      const existing = await this.prisma.invoice.findFirst({
        where: { userId: user.id, invoiceNumber: { startsWith: `INV-${year}${month}-` } },
      });
      if (existing) continue;

      const count = await this.prisma.invoice.count({ where: { invoiceNumber: { startsWith: `INV-${year}${month}-` } } });
      const invoiceNumber = `INV-${year}${month}-${String(count + 1).padStart(4, '0')}`;

      await this.prisma.invoice.create({
        data: {
          id: `inv_${Date.now()}_${generated}_${Math.random().toString(36).slice(2, 6)}`,
          userId: user.id, invoiceNumber, amount: user.profile.price,
          status: 'PENDING', dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          invoiceType: 'MONTHLY' as never,
        },
      });
      generated++;
    }

    return { generated, total: users.length };
  }

  private async runInvoiceReminder() {
    // Send WhatsApp + Email reminders for overdue/pending invoices
    const overdue = await this.prisma.invoice.findMany({
      where: {
        status: { in: ['OVERDUE', 'PENDING'] },
        dueDate: { lte: nowWIB() },
      },
      include: { user: { select: { phone: true, name: true, email: true, username: true } } },
      take: 100,
    });

    let sent = 0;
    const errors: string[] = [];
    for (const inv of overdue) {
      const phone = inv.user?.phone || inv.customerPhone;
      const name = inv.user?.name || inv.customerName || 'Customer';
      const msg = `Pengingat Tagihan Salfanet\n\nHallo ${name},\nTagihan: ${inv.invoiceNumber}\nJumlah: Rp ${Number(inv.amount).toLocaleString('id-ID')}\nJatuh Tempo: ${inv.dueDate?.toLocaleDateString('id-ID') || '-'}\nStatus: ${inv.status}\n\nMohon segera lakukan pembayaran. Terima kasih.`;

      let waSent = false;
      if (phone) {
        try {
          const waResult = await this.whatsapp.sendMessage(phone, msg);
          waSent = waResult?.success !== false;
        } catch (err: any) {
          errors.push(`${inv.invoiceNumber} WA: ${err.message}`);
        }
      }

      let emailSent = false;
      if (inv.user?.email) {
        emailSent = (await this.email.sendEmail(
          inv.user.email,
          `Pengingat Tagihan ${inv.invoiceNumber}`,
          msg.replace(/\n/g, '<br>'),
          name,
        ))?.success === true;
      }

      if (waSent || emailSent) {
        sent++;
        await this.prisma.invoice.update({
          where: { id: inv.id },
          data: { sentReminders: (Number(inv.sentReminders) || 0) + 1 } as never,
        }).catch(() => {});
      }
    }

    return { success: true, sent, total: overdue.length, errors: errors.slice(0, 10) };
  }

  private async runNotificationCheck() {
    // Check for overdue invoices, expired users, etc.
    const overdueCount = await this.prisma.invoice.count({ where: { status: 'OVERDUE' } });
    const expiredCount = await this.prisma.pppoeUser.count({ where: { status: 'EXPIRED' } });
    return { overdueInvoices: overdueCount, expiredUsers: expiredCount };
  }

  private async runDisconnectSessions() {
    // Disconnect active RADIUS sessions for isolated/expired users via MikroTik API
    const isolated = await this.prisma.pppoeUser.findMany({
      where: { status: { in: ['ISOLATED', 'EXPIRED', 'SUSPENDED'] } },
      select: { username: true },
    });

    let disconnected = 0;
    for (const user of isolated) {
      const session = await this.prisma.radacct.findFirst({
        where: { username: user.username, acctstoptime: null },
        select: { radacctid: true, nasipaddress: true },
      });
      if (!session) continue;

      const router = await this.prisma.router.findFirst({
        where: { OR: [{ nasname: session.nasipaddress }, { ipAddress: session.nasipaddress }] },
        select: { id: true, name: true, nasname: true, ipAddress: true, username: true, password: true, port: true },
      });

      if (router?.username && router?.password) {
        try {
          await this.disconnectViaMikrotik(user.username, router);
          disconnected++;
        } catch (err: any) {
          this.logger.warn(`Failed to disconnect ${user.username}: ${err.message}`);
        }
      }

      // Mark session stopped
      await this.prisma.radacct.update({
        where: { radacctid: session.radacctid },
        data: { acctstoptime: nowWIB(), acctterminatecause: 'Admin-Reset' },
      }).catch(() => {});
    }

    return { success: true, disconnected, isolated: isolated.length };
  }

  private async runAutoRenewal() {
    // Auto-renew users with sufficient balance
    const users = await this.prisma.pppoeUser.findMany({
      where: { autoRenewal: true, status: 'ACTIVE' },
      include: { profile: true },
    });

    let renewed = 0;
    for (const user of users) {
      if (!user.profile || user.balance < user.profile.price) continue;
      // Deduct balance and extend expiry
      const newExpiry = new Date(user.expiredAt || nowWIB());
      if (user.profile.validityUnit === 'DAYS') newExpiry.setDate(newExpiry.getDate() + user.profile.validityValue);
      else newExpiry.setMonth(newExpiry.getMonth() + user.profile.validityValue);

      await this.prisma.pppoeUser.update({
        where: { id: user.id },
        data: { balance: { decrement: user.profile.price }, expiredAt: newExpiry },
      });
      renewed++;
    }

    return { renewed, total: users.length };
  }

  private async runWebhookLogCleanup() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.webhookLog.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } });
    return { deleted: result.count };
  }

  private async runInvoiceStatusUpdate() {
    // Mark overdue invoices
    const result = await this.prisma.invoice.updateMany({
      where: { status: 'PENDING', dueDate: { lt: nowWIB() } },
      data: { status: 'OVERDUE' as never },
    });
    return { updated: result.count };
  }

  private async runSessionMonitor() {
    const activeSessions = await this.prisma.radacct.count({ where: { acctstoptime: null } });
    return { activeSessions };
  }

  private async runPppoeSessionSync() {
    // Sync PPPoE active sessions from MikroTik routers to radacct
    const routers = await this.prisma.router.findMany({
      where: { isActive: true },
      select: { id: true, name: true, nasname: true, ipAddress: true, username: true, password: true, port: true },
    });

    let synced = 0;
    let closed = 0;
    const { RouterOSAPI } = require('node-routeros');

    for (const router of routers) {
      if (!router.username || !router.password) continue;
      const host = router.ipAddress || router.nasname;
      const port = router.port || 8728;

      try {
        const api = new RouterOSAPI({ host, port, user: router.username, password: router.password, timeout: 10000 });
        await api.connect();

        // Get active PPPoE sessions from MikroTik
        const activeSessions = await api.write('/ppp/active/print');
        const mikrotikUsernames = new Set<string>();

        for (const s of activeSessions) {
          const username = s.name;
          mikrotikUsernames.add(username);

          // Check if radacct already has this session
          const existing = await this.prisma.radacct.findFirst({
            where: { username, acctstoptime: null },
          });

          if (!existing) {
            // Create radacct entry
            await this.prisma.radacct.create({
              data: {
                radacctid: 0, // auto-increment in most DBs
                acctsessionid: s['.id'] || `${username}_${Date.now()}`,
                username,
                nasipaddress: host,
                acctstarttime: new Date(),
                acctinputoctets: 0,
                acctoutputoctets: 0,
                framedipaddress: s.address || '',
              } as never,
            }).catch(() => {}); // ignore duplicate key errors
            synced++;
          }
        }

        // Close sessions in radacct that are no longer active on MikroTik
        const dbActiveSessions = await this.prisma.radacct.findMany({
          where: { nasipaddress: host, acctstoptime: null },
          select: { radacctid: true, username: true },
        });

        for (const dbSession of dbActiveSessions) {
          if (!mikrotikUsernames.has(dbSession.username)) {
            // Session no longer active on MikroTik — close it
            await this.prisma.radacct.update({
              where: { radacctid: dbSession.radacctid },
              data: { acctstoptime: nowWIB(), acctterminatecause: 'Lost-Carrier' },
            }).catch(() => {});
            closed++;
          }
        }

        api.close();
      } catch (err: any) {
        this.logger.warn(`Session sync failed for ${router.name}: ${err.message}`);
      }
    }

    return { success: true, synced, closed, routers: routers.length };
  }

  private async runSuspendCheck() {
    // Check suspend requests and apply
    const approved = await this.prisma.suspendRequest.findMany({
      where: { status: 'APPROVED', startDate: { lte: nowWIB() } },
    });
    let suspended = 0;
    for (const req of approved) {
      await this.prisma.pppoeUser.update({ where: { id: req.userId }, data: { status: 'SUSPENDED' as never } });
      suspended++;
    }
    return { suspended };
  }

  private async runFreeradiusHealth() {
    // Check FreeRADIUS service health via systemctl, auto-restart if down
    let running = false;
    let pid: number | null = null;
    let cpu = 0;
    let memory = 0;

    try {
      const { stdout } = await execAsync('systemctl is-active freeradius 2>/dev/null || systemctl is-active radiusd 2>/dev/null || echo inactive');
      running = stdout.trim() === 'active';
    } catch { /* not on linux or systemctl not available */ }

    if (running) {
      try {
        const { stdout: pidOut } = await execAsync('pgrep -x freeradius 2>/dev/null || pgrep -x radiusd 2>/dev/null || echo 0');
        pid = parseInt(pidOut.trim().split('\n')[0], 10) || null;
      } catch { /* ignore */ }

      if (pid) {
        try {
          const { stdout: psOut } = await execAsync(`ps -p ${pid} -o %cpu,%mem --no-headers 2>/dev/null || echo "0 0"`);
          const parts = psOut.trim().split(/\s+/);
          if (parts.length >= 2) {
            cpu = parseFloat(parts[0]) || 0;
            memory = parseFloat(parts[1]) || 0;
          }
        } catch { /* ignore */ }
      }
    }

    let action: string | null = null;
    if (!running) {
      // Auto-restart FreeRADIUS
      try {
        await execAsync('systemctl restart freeradius 2>/dev/null || systemctl restart radiusd 2>/dev/null || service freeradius restart 2>/dev/null || service radiusd restart 2>/dev/null');
        action = 'restarted';
        this.logger.warn('FreeRADIUS was down — auto-restarted');
      } catch (err: any) {
        action = `restart_failed: ${err.message}`;
        this.logger.error(`FreeRADIUS restart failed: ${err.message}`);
      }
    }

    // Ensure isolir radgroupreply exists
    try {
      const isolirReply = await this.prisma.radgroupreply.findFirst({
        where: { groupname: 'isolir', attribute: 'Reply-Message' },
      });
      if (!isolirReply) {
        await this.prisma.radgroupreply.create({
          data: { groupname: 'isolir', attribute: 'Reply-Message', op: ':=', value: 'Akun Anda telah diisolir' },
        });
      }
    } catch { /* ignore */ }

    return { success: true, healthy: running, pid, cpu, memory, action };
  }

  private async runActivityLogCleanup() {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.activityLog.deleteMany({ where: { createdAt: { lt: ninetyDaysAgo } } });
    return { deleted: result.count };
  }

  private async runOltPoll() {
    // Poll OLTs for status — check connectivity and update DB
    const olts = await this.prisma.networkOLT.findMany({
      where: { monitoringEnabled: true },
      include: {
        routers: {
          include: {
            router: { select: { id: true, name: true, ipAddress: true, nasname: true } },
          },
        },
      },
    });

    let polled = 0;
    let online = 0;
    const errors: string[] = [];

    for (const olt of olts) {
      try {
        const host = olt.ipAddress || olt.routers?.[0]?.router?.ipAddress || olt.routers?.[0]?.router?.nasname;
        if (!host) { errors.push(`${olt.name}: no IP`); continue; }

        let reachable = false;
        try {
          const cmd = process.platform === 'win32' ? `ping -n 1 -w 3000 ${host}` : `ping -c 1 -W 3 ${host}`;
          await execAsync(cmd);
          reachable = true;
          online++;
        } catch {
          reachable = false;
        }

        await this.prisma.networkOLT.update({
          where: { id: olt.id },
          data: {
            isOnline: reachable,
            lastPollAt: nowWIB(),
          } as never,
        }).catch(() => {});

        polled++;
      } catch (err: any) {
        errors.push(`${olt.name}: ${err.message}`);
      }
    }

    return { success: true, polled, online, total: olts.length, errors: errors.slice(0, 10) };
  }

  private async runCronHistoryCleanup() {
    // Delete cron history older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.cronHistory.deleteMany({ where: { startedAt: { lt: sevenDaysAgo } } });
    return { deleted: result.count };
  }

  private async runSessionRecovery() {
    // Reopen sessions closed with 'Lost-Carrier' in the last 60 minutes
    // (used on startup to recover sessions incorrectly closed during app restart)
    const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000);
    const result = await this.prisma.$executeRaw`
      UPDATE radacct
      SET acctstoptime = NULL, acctterminatecause = ''
      WHERE acctterminatecause = 'Lost-Carrier'
        AND acctstoptime >= ${sixtyMinutesAgo}
    `;
    return { recovered: result };
  }
}
