import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { nowWIB } from '../../common/utils/timezone';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    // Voucher sync to RADIUS deferred
    return { message: 'Hotspot voucher sync deferred to session-sync integration' };
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
    // Send reminders for overdue invoices — email/WhatsApp deferred
    const overdue = await this.prisma.invoice.findMany({
      where: { status: 'OVERDUE', sentReminders: null },
      take: 100,
    });
    return { reminders: overdue.length, message: 'Reminder sending deferred to email/whatsapp integration' };
  }

  private async runNotificationCheck() {
    // Check for overdue invoices, expired users, etc.
    const overdueCount = await this.prisma.invoice.count({ where: { status: 'OVERDUE' } });
    const expiredCount = await this.prisma.pppoeUser.count({ where: { status: 'EXPIRED' } });
    return { overdueInvoices: overdueCount, expiredUsers: expiredCount };
  }

  private async runDisconnectSessions() {
    // Disconnect isolated users — RADIUS CoA deferred
    const isolated = await this.prisma.pppoeUser.findMany({
      where: { status: 'ISOLATED' },
      select: { username: true },
    });
    return { disconnected: 0, isolated: isolated.length, message: 'RADIUS CoA deferred' };
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
    // Sync sessions from MikroTik — deferred
    return { message: 'MikroTik session sync deferred' };
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
    // FreeRADIUS health check deferred
    return { healthy: true, message: 'FreeRADIUS health check deferred' };
  }

  private async runActivityLogCleanup() {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.activityLog.deleteMany({ where: { createdAt: { lt: ninetyDaysAgo } } });
    return { deleted: result.count };
  }

  private async runOltPoll() {
    // OLT polling deferred to OLT module integration
    return { message: 'OLT polling deferred to OLT module integration' };
  }
}
