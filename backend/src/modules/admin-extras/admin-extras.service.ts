import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { nowWIB, startOfDayWIBtoUTC } from '../../common/utils/timezone';

@Injectable()
export class AdminExtrasService {
  private readonly logger = new Logger(AdminExtrasService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== ANALYTICS ====================

  async getAnalytics(params: { year?: number; month?: number }) {
    const now = new Date();
    const year = params.year || now.getFullYear();
    const month = params.month || now.getMonth() + 1;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const [invoices, newUsers, churnedUsers, totalUsers, profileBreakdown, areaBreakdown] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { createdAt: { gte: startDate, lt: endDate }, status: 'PAID' },
        select: { amount: true, invoiceType: true },
      }),
      this.prisma.pppoeUser.count({ where: { createdAt: { gte: startDate, lt: endDate } } }),
      this.prisma.pppoeUser.count({ where: { status: 'EXPIRED', updatedAt: { gte: startDate, lt: endDate } } }),
      this.prisma.pppoeUser.count(),
      this.prisma.pppoeUser.groupBy({
        by: ['profileId'], _count: true,
        where: { status: { in: ['ACTIVE', 'ISOLATED'] } },
      }),
      this.prisma.pppoeUser.groupBy({
        by: ['areaId'], _count: true,
        where: { status: { in: ['ACTIVE', 'ISOLATED'] } },
      }),
    ]);

    const revenue = invoices.reduce((sum, inv) => sum + inv.amount, 0);
    const arpu = totalUsers > 0 ? Math.round(revenue / totalUsers) : 0;

    const profileIds = profileBreakdown.map((p) => p.profileId).filter(Boolean) as string[];
    const profiles = profileIds.length > 0 ? await this.prisma.pppoeProfile.findMany({ where: { id: { in: profileIds } }, select: { id: true, name: true } }) : [];
    const profileMap = new Map(profiles.map((p) => [p.id, p.name]));

    const areaIds = areaBreakdown.map((a) => a.areaId).filter(Boolean) as string[];
    const areas = areaIds.length > 0 ? await this.prisma.pppoeArea.findMany({ where: { id: { in: areaIds } }, select: { id: true, name: true } }) : [];
    const areaMap = new Map(areas.map((a) => [a.id, a.name]));

    return {
      period: { year, month },
      revenue,
      arpu,
      newUsers,
      churnedUsers,
      totalUsers,
      profileBreakdown: profileBreakdown.map((p) => ({ profileId: p.profileId, name: profileMap.get(p.profileId || '') || 'Unknown', count: p._count })),
      areaBreakdown: areaBreakdown.map((a) => ({ areaId: a.areaId, name: areaMap.get(a.areaId || '') || 'Unknown', count: a._count })),
    };
  }

  // ==================== LAPORAN ====================

  async getLaporan(params: { type?: string; startDate?: string; endDate?: string }) {
    const type = params.type || 'invoice';
    const start = params.startDate ? new Date(params.startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = params.endDate ? new Date(params.endDate) : new Date();

    if (type === 'invoice') {
      const invoices = await this.prisma.invoice.findMany({
        where: { createdAt: { gte: start, lt: end } },
        include: { user: { select: { username: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });
      const total = invoices.reduce((s, i) => s + i.amount, 0);
      const paid = invoices.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.amount, 0);
      return { type, period: { start, end }, total, paid, unpaid: total - paid, count: invoices.length, data: invoices };
    }

    if (type === 'payment') {
      const payments = await this.prisma.payment.findMany({
        where: { createdAt: { gte: start, lt: end } },
        orderBy: { createdAt: 'desc' },
      });
      const total = payments.reduce((s, p) => s + p.amount, 0);
      return { type, period: { start, end }, total, count: payments.length, data: payments };
    }

    if (type === 'customer') {
      const users = await this.prisma.pppoeUser.findMany({
        where: { createdAt: { gte: start, lt: end } },
        include: { profile: { select: { name: true } }, area: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return { type, period: { start, end }, count: users.length, data: users };
    }

    throw new HttpException('Invalid report type', HttpStatus.BAD_REQUEST);
  }

  // ==================== ISOLATED USERS ====================

  async listIsolatedUsers() {
    const users = await this.prisma.pppoeUser.findMany({
      where: { status: 'ISOLATED' },
      include: {
        profile: { select: { name: true } },
        area: { select: { name: true } },
        invoices: { where: { status: { in: ['PENDING', 'OVERDUE'] } }, select: { amount: true, status: true, dueDate: true }, take: 5 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Enrich with active sessions
    const usernames = users.map((u) => u.username);
    const sessions = usernames.length > 0 ? await this.prisma.radacct.findMany({
      where: { username: { in: usernames }, acctstoptime: null },
      select: { username: true, nasipaddress: true, framedipaddress: true, acctstarttime: true },
    }) : [];
    const sessionMap = new Map(sessions.map((s) => [s.username, s]));

    return users.map((u) => ({
      ...u,
      activeSession: sessionMap.get(u.username) || null,
      unpaidTotal: u.invoices.reduce((s, i) => s + i.amount, 0),
    }));
  }

  async isolateUser(body: { userId: string }) {
    const user = await this.prisma.pppoeUser.findUnique({ where: { id: body.userId } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    await this.prisma.pppoeUser.update({ where: { id: body.userId }, data: { status: 'ISOLATED' as never } });

    // RADIUS isolation sync deferred
    return { success: true, message: 'User isolated. RADIUS sync deferred to session-sync integration.' };
  }

  // ==================== AGENT DEPOSITS ====================

  async listAgentDeposits(params: { status?: string; page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 200);
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;

    const [deposits, total] = await Promise.all([
      this.prisma.agentDeposit.findMany({
        where: where as never,
        include: { agent: { select: { id: true, name: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit, skip: (page - 1) * limit,
      }),
      this.prisma.agentDeposit.count({ where: where as never }),
    ]);

    return { deposits, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async approveAgentDeposit(id: string, body: { action: 'approve' | 'reject'; adminNotes?: string }) {
    const deposit = await this.prisma.agentDeposit.findUnique({ where: { id } });
    if (!deposit) throw new HttpException('Deposit not found', HttpStatus.NOT_FOUND);
    if (deposit.status !== 'PENDING') throw new HttpException('Deposit already processed', HttpStatus.BAD_REQUEST);

    if (body.action === 'approve') {
      return this.prisma.$transaction(async (tx) => {
        await tx.agentDeposit.update({ where: { id }, data: { status: 'SUCCESS', paidAt: new Date() } });
        await tx.agent.update({ where: { id: deposit.agentId }, data: { balance: { increment: deposit.amount } } });
        await tx.agentNotification.create({
          data: {
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            agentId: deposit.agentId, type: 'deposit_approved',
            title: 'Deposit Approved', message: `Your deposit of ${deposit.amount} has been approved.`,
          },
        });
        return { success: true, message: 'Deposit approved' };
      });
    } else {
      await this.prisma.agentDeposit.update({ where: { id }, data: { status: 'FAILED' } });
      return { success: true, message: 'Deposit rejected' };
    }
  }

  // ==================== TOPUP REQUESTS ====================

  async listTopupRequests(params: { status?: string }) {
    // Topup requests are stored as invoices with invoiceType TOPUP
    const where: Record<string, unknown> = { invoiceType: 'TOPUP' };
    if (params.status) where.status = params.status;
    return this.prisma.invoice.findMany({
      where: where as never,
      include: { user: { select: { id: true, username: true, name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveTopupRequest(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new HttpException('Topup request not found', HttpStatus.NOT_FOUND);
    if (invoice.status !== 'PENDING') throw new HttpException('Topup already processed', HttpStatus.BAD_REQUEST);

    return this.prisma.$transaction(async (prisma) => {
      await prisma.invoice.update({ where: { id }, data: { status: 'PAID' as never, paidAt: nowWIB() } });
      if (invoice.userId) {
        await prisma.pppoeUser.update({ where: { id: invoice.userId }, data: { balance: { increment: invoice.amount } } });
      }
      return { success: true, message: 'Topup approved' };
    });
  }

  async rejectTopupRequest(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new HttpException('Topup request not found', HttpStatus.NOT_FOUND);
    await this.prisma.invoice.update({ where: { id }, data: { status: 'CANCELLED' as never } });
    return { success: true, message: 'Topup rejected' };
  }

  // ==================== SUSPEND REQUESTS ====================

  async listSuspendRequests(params: { status?: string }) {
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    return this.prisma.suspendRequest.findMany({
      where: where as never,
      include: { user: { select: { id: true, username: true, name: true, phone: true } } },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async processSuspendRequest(id: string, body: { action: 'approve' | 'reject'; adminNotes?: string }) {
    const request = await this.prisma.suspendRequest.findUnique({ where: { id } });
    if (!request) throw new HttpException('Suspend request not found', HttpStatus.NOT_FOUND);
    if (request.status !== 'PENDING') throw new HttpException('Request already processed', HttpStatus.BAD_REQUEST);

    if (body.action === 'approve') {
      await this.prisma.suspendRequest.update({
        where: { id },
        data: { status: 'APPROVED', approvedAt: nowWIB(), approvedBy: 'admin', adminNotes: body.adminNotes || null },
      });
      // Suspend user
      await this.prisma.pppoeUser.update({ where: { id: request.userId }, data: { status: 'SUSPENDED' as never } });
      return { success: true, message: 'Suspend request approved' };
    } else {
      await this.prisma.suspendRequest.update({
        where: { id },
        data: { status: 'REJECTED', approvedAt: nowWIB(), approvedBy: 'admin', adminNotes: body.adminNotes || null },
      });
      return { success: true, message: 'Suspend request rejected' };
    }
  }

  // ==================== REFERRALS ====================

  async listReferrals() {
    const rewards = await this.prisma.referralReward.findMany({
      include: {
        referrer: { select: { id: true, username: true, name: true } },
        referred: { select: { id: true, username: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const stats = {
      total: rewards.length,
      pending: rewards.filter((r) => r.status === 'PENDING').length,
      credited: rewards.filter((r) => r.status === 'CREDITED').length,
      expired: rewards.filter((r) => r.status === 'EXPIRED').length,
      totalAmount: rewards.filter((r) => r.status === 'CREDITED').reduce((s, r) => s + r.amount, 0),
    };

    return { rewards, stats };
  }

  async processReferral(id: string, body: { action: 'credit' | 'expire' }) {
    const reward = await this.prisma.referralReward.findUnique({ where: { id } });
    if (!reward) throw new HttpException('Referral reward not found', HttpStatus.NOT_FOUND);
    if (reward.status !== 'PENDING') throw new HttpException('Reward already processed', HttpStatus.BAD_REQUEST);

    if (body.action === 'credit') {
      return this.prisma.$transaction(async (tx) => {
        await tx.referralReward.update({ where: { id }, data: { status: 'CREDITED', creditedAt: nowWIB() } });
        await tx.pppoeUser.update({ where: { id: reward.referrerId }, data: { balance: { increment: reward.amount } } });
        return { success: true, message: 'Reward credited to referrer balance' };
      });
    } else {
      await this.prisma.referralReward.update({ where: { id }, data: { status: 'EXPIRED' } });
      return { success: true, message: 'Reward expired' };
    }
  }

  async getReferralConfig() {
    const company = await this.prisma.company.findFirst({
      select: { referralEnabled: true, referralRewardAmount: true, baseUrl: true },
    });
    return company || { referralEnabled: false, referralRewardAmount: 0, baseUrl: null };
  }

  async updateReferralConfig(body: { referralEnabled?: boolean; referralRewardAmount?: number }) {
    const existing = await this.prisma.company.findFirst();
    if (!existing) throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
    const data: Record<string, unknown> = {};
    if (body.referralEnabled !== undefined) data.referralEnabled = body.referralEnabled;
    if (body.referralRewardAmount !== undefined) data.referralRewardAmount = body.referralRewardAmount;
    return this.prisma.company.update({ where: { id: existing.id }, data: data as never });
  }

  // ==================== TECHNICIANS ====================

  async listTechnicians() {
    return this.prisma.technician.findMany({
      include: { _count: { select: { workOrders: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTechnician(body: { name: string; phoneNumber: string; email?: string; isActive?: boolean; requireOtp?: boolean }) {
    const existing = await this.prisma.technician.findUnique({ where: { phoneNumber: body.phoneNumber } });
    if (existing) throw new HttpException('Phone number already registered', HttpStatus.BAD_REQUEST);

    return this.prisma.technician.create({
      data: {
        name: body.name, phoneNumber: body.phoneNumber,
        email: body.email || null, isActive: body.isActive ?? true,
        requireOtp: body.requireOtp ?? true,
      },
    });
  }

  async updateTechnician(id: string, body: Record<string, unknown>) {
    try {
      return await this.prisma.technician.update({ where: { id }, data: body as never });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Technician not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteTechnician(id: string) {
    const tech = await this.prisma.technician.findUnique({ where: { id }, include: { _count: { select: { workOrders: true } } } });
    if (!tech) throw new HttpException('Technician not found', HttpStatus.NOT_FOUND);
    if (tech._count.workOrders > 0) throw new HttpException('Cannot delete technician with active work orders', HttpStatus.BAD_REQUEST);
    await this.prisma.technician.delete({ where: { id } });
    return { success: true };
  }

  // ==================== PPPoE SYNC ALL RADIUS ====================

  async syncAllRadius() {
    const users = await this.prisma.pppoeUser.findMany({
      where: { status: { in: ['ACTIVE', 'ISOLATED'] } },
      select: { id: true, username: true, password: true, profileId: true },
      take: 500,
    });

    let synced = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        // Update radcheck
        await this.prisma.radcheck.upsert({
          where: { username_attribute: { username: user.username, attribute: 'Cleartext-Password' } },
          create: { username: user.username, attribute: 'Cleartext-Password', op: ':=', value: user.password },
          update: { value: user.password },
        });

        // Update radusergroup
        if (user.profileId) {
          const profile = await this.prisma.pppoeProfile.findUnique({ where: { id: user.profileId }, select: { name: true } });
          if (profile) {
            await this.prisma.radusergroup.upsert({
              where: { username_groupname: { username: user.username, groupname: profile.name } },
              create: { username: user.username, groupname: profile.name, priority: 1 },
              update: { priority: 1 },
            });
          }
        }
        synced++;
      } catch (err: any) {
        errors.push(`${user.username}: ${err.message}`);
      }
    }

    return { synced, total: users.length, errors: errors.slice(0, 20) };
  }

  // ==================== USER DEPOSIT ====================

  async addUserDeposit(userId: string, body: { amount: number; note?: string }) {
    const user = await this.prisma.pppoeUser.findUnique({ where: { id: userId } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    if (!body.amount || body.amount <= 0) throw new HttpException('Amount must be positive', HttpStatus.BAD_REQUEST);

    // Find or create "Top Up" category
    let category = await this.prisma.transactionCategory.findFirst({ where: { name: 'Top Up' } });
    if (!category) {
      category = await this.prisma.transactionCategory.create({ data: { id: `cat_${Date.now()}`, name: 'Top Up', type: 'INCOME' as never } });
    }

    const tx = await this.prisma.transaction.create({
      data: {
        id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        categoryId: category.id,
        amount: body.amount, type: 'INCOME' as never,
        description: body.note || `Admin deposit for ${user.username}`,
        reference: user.username,
      },
    });

    await this.prisma.pppoeUser.update({ where: { id: userId }, data: { balance: { increment: body.amount } } });

    return { success: true, transaction: tx };
  }

  async getUserDepositHistory(userId: string) {
    const user = await this.prisma.pppoeUser.findUnique({ where: { id: userId }, select: { username: true } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    const category = await this.prisma.transactionCategory.findFirst({ where: { name: 'Top Up' } });
    if (!category) return { deposits: [] };
    return this.prisma.transaction.findMany({
      where: { reference: user.username, categoryId: category.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==================== USER RENEWAL (admin) ====================

  async createUserRenewal(userId: string, body: { newProfileId?: string }) {
    const user = await this.prisma.pppoeUser.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const profile = body.newProfileId
      ? await this.prisma.pppoeProfile.findUnique({ where: { id: body.newProfileId } })
      : user.profile;
    if (!profile) throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const count = await this.prisma.invoice.count({ where: { invoiceNumber: { startsWith: `INV-${year}${month}-` } } });
    const invoiceNumber = `INV-${year}${month}-${String(count + 1).padStart(4, '0')}`;

    const baseDate = user.expiredAt && user.expiredAt > now ? user.expiredAt : now;
    const newExpiredAt = new Date(baseDate);
    if (profile.validityUnit === 'DAYS') newExpiredAt.setDate(newExpiredAt.getDate() + profile.validityValue);
    else newExpiredAt.setMonth(newExpiredAt.getMonth() + profile.validityValue);

    const invoice = await this.prisma.invoice.create({
      data: {
        id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId, invoiceNumber, amount: profile.price,
        status: 'PENDING', dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invoiceType: 'RENEWAL' as never,
        notes: `Admin renewal: ${profile.name} until ${newExpiredAt.toLocaleDateString('id-ID')}`,
      },
    });

    return { success: true, invoice, newExpiredDate: newExpiredAt };
  }

  // ==================== CLOUDFLARE TUNNEL ====================

  async getCloudflareTunnel() {
    const company = await this.prisma.company.findFirst({ select: { baseUrl: true } });
    return { baseUrl: company?.baseUrl || null, tunnelId: null, domain: null, note: 'Cloudflare tunnel fields not in company model' };
  }

  async updateCloudflareTunnel(body: { tunnelId?: string; domain?: string }) {
    // Cloudflare tunnel fields not in company model — deferred
    return { success: true, message: 'Cloudflare tunnel config deferred (fields not in company model)', ...body };
  }

  // ==================== SYSTEM INFO ====================

  async getSystemInfo() {
    return {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    };
  }

  // ==================== OLT TEST CONNECTION ====================

  async testOltConnection(body: { host: string; port?: number; protocol?: string; username?: string; password?: string }) {
    // TCP connection test only — Telnet/SSH deferred
    const port = body.port || 23;
    try {
      const { Socket } = await import('net');
      return new Promise((resolve) => {
        const socket = new Socket();
        const timeout = 5000;
        socket.setTimeout(timeout);
        socket.on('connect', () => {
          socket.destroy();
          resolve({ success: true, host: body.host, port, message: 'TCP connection successful' });
        });
        socket.on('timeout', () => {
          socket.destroy();
          resolve({ success: false, host: body.host, port, error: 'Connection timeout' });
        });
        socket.on('error', (err) => {
          resolve({ success: false, host: body.host, port, error: err.message });
        });
        socket.connect(port, body.host);
      });
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ==================== OLT MODEL PROFILES ====================

  async getOltModelProfiles() {
    // Placeholder — return empty list
    return [];
  }

  // ==================== INVOICE IMPORT ====================

  async getInvoiceImportTemplate() {
    return {
      headers: ['invoiceNumber', 'username', 'amount', 'status', 'dueDate', 'invoiceType'],
      sample: [
        { invoiceNumber: 'INV-202401-0001', username: 'user001', amount: 150000, status: 'PENDING', dueDate: '2024-01-31', invoiceType: 'MONTHLY' },
      ],
    };
  }

  async importInvoices(body: { invoices: Array<Record<string, unknown>> }) {
    let imported = 0;
    const errors: string[] = [];

    for (const item of body.invoices) {
      try {
        const username = item.username as string;
        const user = await this.prisma.pppoeUser.findUnique({ where: { username }, select: { id: true } });
        if (!user) { errors.push(`${username}: user not found`); continue; }

        await this.prisma.invoice.create({
          data: {
            id: `inv_${Date.now()}_${imported}_${Math.random().toString(36).slice(2, 6)}`,
            userId: user.id,
            invoiceNumber: item.invoiceNumber as string,
            amount: item.amount as number,
            status: (item.status as never) || 'PENDING',
            dueDate: new Date(item.dueDate as string),
            invoiceType: (item.invoiceType as never) || 'MONTHLY',
          },
        });
        imported++;
      } catch (err: any) {
        errors.push(`${item.invoiceNumber}: ${err.message}`);
      }
    }

    return { imported, errors: errors.slice(0, 20) };
  }

  // ==================== 2FA ====================

  async get2faStatus(userId: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { id: userId }, select: { id: true, twoFactorEnabled: true, twoFactorSecret: true } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    return { enabled: user.twoFactorEnabled, hasSecret: !!user.twoFactorSecret };
  }

  async setup2fa(userId: string) {
    // TOTP secret generation deferred — requires otplib
    const secret = Math.random().toString(36).slice(2, 18).toUpperCase();
    await this.prisma.adminUser.update({ where: { id: userId }, data: { twoFactorSecret: secret } as never });
    return { secret, otpauthUrl: `otpauth://totp/SalfaNet:${userId}?secret=${secret}&issuer=SalfaNet`, note: 'TOTP verification deferred to otplib integration.' };
  }

  async disable2fa(userId: string) {
    await this.prisma.adminUser.update({ where: { id: userId }, data: { twoFactorEnabled: false, twoFactorSecret: null } as never });
    return { success: true };
  }

  // ==================== EVOUCHER ORDERS (admin) ====================

  async listEvoucherOrders(params: { status?: string; page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 200);
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;

    const [orders, total] = await Promise.all([
      this.prisma.voucherOrder.findMany({
        where: where as never,
        include: { profile: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit, skip: (page - 1) * limit,
      }),
      this.prisma.voucherOrder.count({ where: where as never }),
    ]);

    return { orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async cancelEvoucherOrder(id: string) {
    const order = await this.prisma.voucherOrder.findUnique({ where: { id } });
    if (!order) throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    if (order.status !== 'PENDING') throw new HttpException('Only pending orders can be cancelled', HttpStatus.BAD_REQUEST);
    await this.prisma.voucherOrder.update({ where: { id }, data: { status: 'CANCELLED' as never } });
    return { success: true };
  }

  async resendEvoucherOrder(id: string) {
    const order = await this.prisma.voucherOrder.findUnique({ where: { id }, include: { profile: true } });
    if (!order) throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    if (order.status !== 'PAID') throw new HttpException('Only paid orders can be resent', HttpStatus.BAD_REQUEST);
    // WhatsApp resend deferred
    return { success: true, message: 'WhatsApp resend deferred to whatsapp integration.' };
  }

  async bulkDeleteEvoucherOrders(body: { ids: string[] }) {
    const result = await this.prisma.voucherOrder.deleteMany({ where: { id: { in: body.ids } } });
    return { success: true, deleted: result.count };
  }
}
