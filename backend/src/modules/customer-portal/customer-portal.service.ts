import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { nowWIB } from '../../common/utils/timezone';
import { nanoid } from 'nanoid';
import * as crypto from 'crypto';

function normalizePhone(phone: string): string {
  let normalized = phone.trim();
  if (normalized.startsWith('08')) normalized = '628' + normalized.slice(2);
  else if (normalized.startsWith('+62')) normalized = '62' + normalized.slice(3);
  else if (normalized.startsWith('62')) {
    // already correct
  } else if (normalized.startsWith('0')) normalized = '62' + normalized.slice(1);
  return normalized;
}

function generateToken(length = 64): string {
  return crypto.randomBytes(length / 2).toString('hex');
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

@Injectable()
export class CustomerPortalService {
  private readonly logger = new Logger(CustomerPortalService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== AUTH ====================

  async login(body: { phone?: string; identifier?: string }) {
    const raw = body.phone || body.identifier || '';
    if (!raw) throw new HttpException('Phone or customer ID required', HttpStatus.BAD_REQUEST);

    const isCustomerId = /^\d{8}$/.test(raw);
    let user: any = null;

    if (isCustomerId) {
      user = await this.prisma.pppoeUser.findUnique({
        where: { customerId: raw },
        select: { id: true, name: true, phone: true, username: true, customerId: true, status: true },
      });
    } else {
      const normalized = normalizePhone(raw);
      user = await this.prisma.pppoeUser.findFirst({
        where: { phone: normalized },
        select: { id: true, name: true, phone: true, username: true, customerId: true, status: true },
      });
    }

    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const otpSettings = await this.prisma.whatsapp_reminder_settings.findFirst();
    const otpEnabled = otpSettings?.otpEnabled ?? false;

    if (!otpEnabled) {
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await this.prisma.customerSession.create({
        data: { id: nanoid(), userId: user.id, phone: user.phone, token, expiresAt, verified: true },
      });
      return { success: true, otpEnabled: false, requireOTP: false, user, token };
    }

    return { success: true, otpEnabled: true, requireOTP: true, user: { phone: user.phone }, token: null };
  }

  async sendOtp(body: { phone: string }) {
    const phone = normalizePhone(body.phone);
    const user = await this.prisma.pppoeUser.findFirst({ where: { phone }, select: { id: true, name: true } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentOtps = await this.prisma.customerSession.count({
      where: { phone, createdAt: { gte: fifteenMinAgo }, otpCode: { not: null } },
    });
    if (recentOtps >= 3) {
      throw new HttpException('Too many OTP requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const otpCode = generateOtp();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    await this.prisma.customerSession.create({
      data: { id: nanoid(), userId: user.id, phone, otpCode, otpExpiry, verified: false },
    });

    this.logger.log(`[Customer OTP] Generated OTP for ${phone}: ${otpCode} (WA send deferred)`);
    return { success: true, message: 'OTP sent to your WhatsApp', expiresIn: 300 };
  }

  async verifyOtp(body: { phone: string; otpCode: string }) {
    const phone = normalizePhone(body.phone);
    const session = await this.prisma.customerSession.findFirst({
      where: { phone, otpCode: body.otpCode, verified: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) throw new HttpException('Invalid OTP', HttpStatus.BAD_REQUEST);
    if (session.otpExpiry && session.otpExpiry < new Date()) {
      throw new HttpException('OTP expired', HttpStatus.BAD_REQUEST);
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.customerSession.update({
      where: { id: session.id },
      data: { token, expiresAt, verified: true, otpCode: null },
    });

    const user = await this.prisma.pppoeUser.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, phone: true, username: true, customerId: true, status: true },
    });

    return { success: true, message: 'Login successful', token, expiresAt, user };
  }

  // ==================== DASHBOARD ====================

  async getDashboard(userId: string) {
    const user = await this.prisma.pppoeUser.findUnique({
      where: { id: userId },
      include: { profile: true, area: { select: { name: true } } },
    });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const activeSession = await this.prisma.radacct.findFirst({
      where: { username: user.username, acctstoptime: null },
      orderBy: { acctstarttime: 'desc' },
    });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const usageAgg = await this.prisma.radacct.aggregate({
      where: { username: user.username, acctstarttime: { gte: monthStart } },
      _sum: { acctinputoctets: true, acctoutputoctets: true },
    });

    const unpaidInvoices = await this.prisma.invoice.findMany({
      where: { userId, status: { in: ['PENDING', 'OVERDUE'] } },
      orderBy: { dueDate: 'asc' },
    });
    const totalUnpaid = unpaidInvoices.reduce((sum, inv) => sum + inv.amount, 0);

    return {
      success: true,
      data: {
        user: {
          id: user.id, name: user.name, username: user.username, phone: user.phone,
          customerId: user.customerId, status: user.status, expiredAt: user.expiredAt,
          profile: user.profile ? { name: user.profile.name, downloadSpeed: user.profile.downloadSpeed, uploadSpeed: user.profile.uploadSpeed } : null,
          area: user.area?.name || null,
        },
        session: activeSession
          ? { nasIpAddress: activeSession.nasipaddress, framedIpAddress: activeSession.framedipaddress, startTime: activeSession.acctstarttime, duration: activeSession.acctsessiontime }
          : null,
        usage: {
          upload: Number(usageAgg._sum.acctinputoctets ?? 0),
          download: Number(usageAgg._sum.acctoutputoctets ?? 0),
          total: Number(usageAgg._sum.acctinputoctets ?? 0) + Number(usageAgg._sum.acctoutputoctets ?? 0),
        },
        invoice: { unpaidCount: unpaidInvoices.length, totalUnpaid, nextDueDate: unpaidInvoices[0]?.dueDate || null },
      },
    };
  }

  // ==================== PROFILE ====================

  async getProfile(userId: string) {
    const user = await this.prisma.pppoeUser.findUnique({
      where: { id: userId },
      include: { profile: true, area: { select: { name: true } } },
    });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    return { success: true, user };
  }

  async updateProfile(userId: string, body: { name?: string; phone?: string; email?: string }) {
    if (body.name && body.name.length < 2) throw new HttpException('Name must be at least 2 characters', HttpStatus.BAD_REQUEST);
    const user = await this.prisma.pppoeUser.update({
      where: { id: userId },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.phone && { phone: normalizePhone(body.phone) }),
        ...(body.email && { email: body.email }),
      },
      include: { profile: true },
    });
    return { success: true, message: 'Profile updated successfully', user };
  }

  // ==================== INVOICES ====================

  async listInvoices(userId: string, params: { page?: number; limit?: number; status?: string }) {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const where: Record<string, unknown> = { userId };
    if (params.status === 'paid') where.status = 'PAID';
    else if (params.status === 'unpaid') where.status = { in: ['PENDING', 'OVERDUE'] };

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: where as never,
        include: { payments: { orderBy: { paidAt: 'desc' }, take: 1 }, manualPayments: { orderBy: { createdAt: 'desc' }, take: 1 } },
        orderBy: { createdAt: 'desc' },
        take: limit, skip: (page - 1) * limit,
      }),
      this.prisma.invoice.count({ where: where as never }),
    ]);

    return {
      success: true,
      data: {
        invoices: invoices.map((inv) => ({
          ...inv,
          paymentSource: inv.payments.length > 0 ? 'gateway' : inv.manualPayments.length > 0 ? 'manual' : null,
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    };
  }

  // ==================== PAYMENTS ====================

  async listPayments(userId: string, params: { page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { userId, status: 'PAID' },
        include: { payments: { orderBy: { paidAt: 'desc' } }, manualPayments: { orderBy: { createdAt: 'desc' }, where: { status: 'APPROVED' } } },
        orderBy: { paidAt: 'desc' },
        take: limit, skip: (page - 1) * limit,
      }),
      this.prisma.invoice.count({ where: { userId, status: 'PAID' } }),
    ]);

    const payments = invoices.map((inv) => ({
      invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, amount: inv.amount, paidAt: inv.paidAt,
      method: inv.payments[0]?.method || inv.manualPayments[0]?.bankName || 'admin', status: 'paid',
    }));

    return { success: true, data: { payments, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } } };
  }

  // ==================== PACKAGES ====================

  async getPackages(userId: string) {
    const user = await this.prisma.pppoeUser.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user?.profile) return { success: true, packages: [] };
    return {
      success: true,
      packages: [{
        id: user.profile.id, name: user.profile.name,
        downloadSpeed: user.profile.downloadSpeed, uploadSpeed: user.profile.uploadSpeed,
        price: user.profile.price, description: user.profile.description,
      }],
    };
  }

  // ==================== USAGE ====================

  async getUsage(userId: string) {
    const user = await this.prisma.pppoeUser.findUnique({ where: { id: userId }, select: { username: true } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const agg = await this.prisma.radacct.aggregate({
      where: { username: user.username, acctstarttime: { gte: monthStart, lte: monthEnd } },
      _sum: { acctinputoctets: true, acctoutputoctets: true },
    });

    return {
      success: true,
      data: {
        upload: Number(agg._sum.acctinputoctets ?? 0),
        download: Number(agg._sum.acctoutputoctets ?? 0),
        total: Number(agg._sum.acctinputoctets ?? 0) + Number(agg._sum.acctoutputoctets ?? 0),
        period: { start: monthStart, end: monthEnd },
      },
    };
  }

  // ==================== NOTIFICATIONS ====================

  async getNotifications(userId: string, since?: string) {
    const user = await this.prisma.pppoeUser.findUnique({ where: { id: userId }, select: { id: true, username: true, phone: true } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const sinceDate = since ? new Date(since) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const events: Array<{ id: string; type: string; title: string; message: string; timestamp: string }> = [];

    const paidInvoices = await this.prisma.invoice.findMany({
      where: { userId, status: 'PAID', paidAt: { gte: sinceDate } },
      orderBy: { paidAt: 'desc' },
    });
    for (const inv of paidInvoices) {
      events.push({
        id: `inv-paid-${inv.id}`, type: 'invoice_paid',
        title: 'Pembayaran Diterima', message: `Invoice ${inv.invoiceNumber} telah dibayar`,
        timestamp: inv.paidAt?.toISOString() || inv.updatedAt.toISOString(),
      });
    }

    const rejectedPayments = await this.prisma.manualPayment.findMany({
      where: { userId, status: 'REJECTED', updatedAt: { gte: sinceDate } },
      orderBy: { updatedAt: 'desc' },
    });
    for (const mp of rejectedPayments) {
      events.push({
        id: `mp-rejected-${mp.id}`, type: 'payment_rejected',
        title: 'Pembayaran Ditolak', message: mp.rejectionReason || 'Pembayaran manual ditolak',
        timestamp: mp.updatedAt.toISOString(),
      });
    }

    return { success: true, events };
  }

  // ==================== REFERRAL ====================

  async getReferral(userId: string) {
    const user = await this.prisma.pppoeUser.findUnique({
      where: { id: userId },
      select: { id: true, referralCode: true, name: true },
    });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const company = await this.prisma.company.findFirst({ select: { referralEnabled: true, referralRewardAmount: true, baseUrl: true } });
    const referralCount = await this.prisma.pppoeUser.count({ where: { referredById: userId } });
    const rewards = await this.prisma.referralReward.findMany({
      where: { referrerId: userId }, orderBy: { createdAt: 'desc' }, take: 10,
    });

    return {
      success: true,
      referral: {
        code: user.referralCode,
        shareUrl: company?.baseUrl ? `${company.baseUrl}/register?ref=${user.referralCode}` : null,
        stats: { totalReferrals: referralCount, totalRewards: rewards.length, totalAmount: rewards.reduce((s, r) => s + r.amount, 0) },
        recentReferrals: rewards,
      },
      config: { enabled: company?.referralEnabled || false, rewardAmount: company?.referralRewardAmount || 0 },
    };
  }

  async generateReferralCode(userId: string) {
    const user = await this.prisma.pppoeUser.findUnique({ where: { id: userId }, select: { id: true, referralCode: true } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    if (user.referralCode) throw new HttpException('Referral code already exists', HttpStatus.BAD_REQUEST);

    const company = await this.prisma.company.findFirst({ select: { referralEnabled: true, baseUrl: true } });
    if (!company?.referralEnabled) throw new HttpException('Referral system is not enabled', HttpStatus.BAD_REQUEST);

    let code = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      code = generateReferralCode();
      const existing = await this.prisma.pppoeUser.findUnique({ where: { referralCode: code }, select: { id: true } });
      if (!existing) break;
      if (attempt === 9) throw new HttpException('Failed to generate unique referral code', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    await this.prisma.pppoeUser.update({ where: { id: userId }, data: { referralCode: code } });
    return { success: true, referralCode: code, shareUrl: company.baseUrl ? `${company.baseUrl}/register?ref=${code}` : null };
  }

  // ==================== AUTO-RENEWAL ====================

  async toggleAutoRenewal(userId: string, body: { enabled: boolean }) {
    if (typeof body.enabled !== 'boolean') throw new HttpException('enabled must be boolean', HttpStatus.BAD_REQUEST);
    await this.prisma.pppoeUser.update({ where: { id: userId }, data: { autoRenewal: body.enabled } });
    return { success: true, message: 'Auto-renewal setting updated', autoRenewal: body.enabled };
  }

  // ==================== SUSPEND REQUEST ====================

  async getSuspendRequest(userId: string) {
    const request = await this.prisma.suspendRequest.findFirst({ where: { userId }, orderBy: { requestedAt: 'desc' } });
    return { success: true, data: request };
  }

  async createSuspendRequest(userId: string, body: { reason?: string; startDate: string; endDate: string }) {
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    const now = new Date();

    if (startDate < now) throw new HttpException('Start date cannot be in the past', HttpStatus.BAD_REQUEST);
    if (endDate <= startDate) throw new HttpException('End date must be after start date', HttpStatus.BAD_REQUEST);
    if ((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000) > 90) {
      throw new HttpException('Maximum suspend duration is 90 days', HttpStatus.BAD_REQUEST);
    }

    const existing = await this.prisma.suspendRequest.findFirst({ where: { userId, status: { in: ['PENDING', 'APPROVED'] } } });
    if (existing) throw new HttpException('You already have an active suspend request', HttpStatus.BAD_REQUEST);

    const request = await this.prisma.suspendRequest.create({
      data: { id: nanoid(), userId, reason: body.reason || null, startDate, endDate, status: 'PENDING' },
    });
    return { success: true, data: request };
  }

  async cancelSuspendRequest(userId: string, id: string) {
    const request = await this.prisma.suspendRequest.findUnique({ where: { id } });
    if (!request || request.userId !== userId) throw new HttpException('Suspend request not found', HttpStatus.NOT_FOUND);
    if (request.status !== 'PENDING') throw new HttpException('Only pending requests can be cancelled', HttpStatus.BAD_REQUEST);
    await this.prisma.suspendRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
    return { success: true, message: 'Suspend request cancelled' };
  }
}
