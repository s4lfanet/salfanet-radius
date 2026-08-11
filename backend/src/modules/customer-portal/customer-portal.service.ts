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

  // ==================== INVOICE PAYMENT ====================

  async getInvoicePaymentLink(userId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, userId },
      include: { user: true },
    });
    if (!invoice) throw new HttpException('Invoice not found', HttpStatus.NOT_FOUND);
    if (invoice.status === 'PAID') throw new HttpException('Invoice already paid', HttpStatus.BAD_REQUEST);

    const gateways = await this.prisma.paymentGateway.findMany({ where: { isActive: true } });
    if (gateways.length === 0) throw new HttpException('No active payment gateway', HttpStatus.BAD_REQUEST);

    // Payment link generation deferred to payment-gateway module integration
    // Return invoice details and available gateways
    return {
      invoice: {
        id: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: invoice.amount,
        status: invoice.status, dueDate: invoice.dueDate,
      },
      gateways: gateways.map((g) => ({ id: g.id, name: g.name, provider: g.provider })),
      paymentLink: null,
      note: 'Payment link generation deferred to payment-gateway integration.',
    };
  }

  // ==================== TOPUP DIRECT ====================

  async createTopup(userId: string, body: { amount: number; gateway?: string; paymentChannel?: string }) {
    if (!body.amount || body.amount < 1000) throw new HttpException('Minimum topup amount is 1000', HttpStatus.BAD_REQUEST);

    const user = await this.prisma.pppoeUser.findUnique({ where: { id: userId } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const company = await this.prisma.company.findFirst();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const count = await this.prisma.invoice.count({ where: { invoiceNumber: { startsWith: `TOP-${year}${month}-` } } });
    const invoiceNumber = `TOP-${year}${month}-${String(count + 1).padStart(4, '0')}`;

    const invoice = await this.prisma.invoice.create({
      data: {
        id: nanoid(),
        userId, invoiceNumber,
        amount: body.amount,
        status: 'PENDING',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        invoiceType: 'TOPUP' as never,
      },
    });

    // Payment gateway integration deferred
    return {
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      paymentUrl: null,
      note: 'Payment URL generation deferred to payment-gateway integration.',
    };
  }

  // ==================== UPGRADE PACKAGE ====================

  async createUpgrade(userId: string, body: { newProfileId: string; gateway?: string }) {
    const user = await this.prisma.pppoeUser.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const newProfile = await this.prisma.pppoeProfile.findUnique({ where: { id: body.newProfileId } });
    if (!newProfile) throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);
    if (user.profileId === body.newProfileId) throw new HttpException('Already on this package', HttpStatus.BAD_REQUEST);

    // Calculate upgrade fee (price difference)
    const currentPrice = user.profile?.price || 0;
    const upgradeFee = Math.max(0, newProfile.price - currentPrice);

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const count = await this.prisma.invoice.count({ where: { invoiceNumber: { startsWith: `UPG-${year}${month}-` } } });
    const invoiceNumber = `UPG-${year}${month}-${String(count + 1).padStart(4, '0')}`;

    const invoice = await this.prisma.invoice.create({
      data: {
        id: nanoid(),
        userId, invoiceNumber,
        amount: upgradeFee,
        status: 'PENDING',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        invoiceType: 'ADDON' as never,
        notes: `Upgrade to ${newProfile.name}`,
      },
    });

    return {
      invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: invoice.amount },
      newProfile: { id: newProfile.id, name: newProfile.name, price: newProfile.price },
      paymentUrl: null,
      note: 'Payment URL generation deferred to payment-gateway integration.',
    };
  }

  // ==================== RENEWAL ====================

  async checkRenewal(userId: string) {
    const user = await this.prisma.pppoeUser.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const unpaidInvoices = await this.prisma.invoice.count({
      where: { userId, status: { in: ['PENDING', 'OVERDUE'] } },
    });

    if (unpaidInvoices > 0) {
      return { canRenew: false, reason: 'You have unpaid invoices', unpaidCount: unpaidInvoices };
    }

    return {
      canRenew: true,
      currentProfile: user.profile ? { id: user.profile.id, name: user.profile.name, price: user.profile.price } : null,
      expiredAt: user.expiredAt,
    };
  }

  async createRenewal(userId: string, body: { newProfileId?: string }) {
    const user = await this.prisma.pppoeUser.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const unpaidInvoices = await this.prisma.invoice.count({
      where: { userId, status: { in: ['PENDING', 'OVERDUE'] } },
    });
    if (unpaidInvoices > 0) throw new HttpException('You have unpaid invoices', HttpStatus.BAD_REQUEST);

    const profile = body.newProfileId
      ? await this.prisma.pppoeProfile.findUnique({ where: { id: body.newProfileId } })
      : user.profile;
    if (!profile) throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const count = await this.prisma.invoice.count({ where: { invoiceNumber: { startsWith: `INV-${year}${month}-` } } });
    const invoiceNumber = `INV-${year}${month}-${String(count + 1).padStart(4, '0')}`;

    // Calculate new expiry
    const baseDate = user.expiredAt && user.expiredAt > now ? user.expiredAt : now;
    const newExpiredAt = new Date(baseDate);
    if (profile.validityUnit === 'DAYS') newExpiredAt.setDate(newExpiredAt.getDate() + profile.validityValue);
    else if (profile.validityUnit === 'MONTHS') newExpiredAt.setMonth(newExpiredAt.getMonth() + profile.validityValue);
    else newExpiredAt.setMonth(newExpiredAt.getMonth() + 1); // Default 1 month

    const invoice = await this.prisma.invoice.create({
      data: {
        id: nanoid(),
        userId, invoiceNumber,
        amount: profile.price,
        status: 'PENDING',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invoiceType: 'RENEWAL' as never,
        notes: `Renewal ${profile.name} until ${newExpiredAt.toLocaleDateString('id-ID')}`,
      },
    });

    // WhatsApp/Email notifications deferred

    return {
      invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: invoice.amount },
      newExpiredDate: newExpiredAt,
      paymentLink: null,
      note: 'Payment link generation deferred to payment-gateway integration.',
    };
  }

  // ==================== ONT (GenieACS) ====================

  async getOntInfo(userId: string) {
    const user = await this.prisma.pppoeUser.findUnique({ where: { id: userId }, select: { username: true } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const settings = await this.prisma.genieacsSettings.findFirst({ where: { isActive: true } });
    if (!settings) throw new HttpException('GenieACS not configured', HttpStatus.NOT_FOUND);

    try {
      const authHeader = 'Basic ' + Buffer.from(`${settings.username}:${settings.password}`).toString('base64');
      const response = await fetch(`${settings.host}/devices?query=${encodeURIComponent(JSON.stringify({ 'InternetGatewayDevice.ManagementServer.ConnectionRequestURL': { $regex: user.username } }))}`, {
        headers: { Authorization: authHeader },
      });
      if (!response.ok) throw new HttpException('GenieACS error', HttpStatus.BAD_GATEWAY);
      const devices = await response.json() as any[];
      if (devices.length === 0) return { device: null, message: 'No ONT device found for this user' };

      const device = devices[0];
      const params = device._params || {};
      return {
        device: {
          _id: device._id,
          serialNumber: params['Device.DeviceInfo.SerialNumber'] || '',
          manufacturer: params['Device.DeviceInfo.Manufacturer'] || '',
          model: params['Device.DeviceInfo.ModelName'] || '',
          pppoeUsername: user.username,
          ipAddress: params['Device.ManagementServer.ConnectionRequestURL'] || '',
          rxPower: null, txPower: null, temperature: null, uptime: null,
          wifiSSID: null, wifiPassword: null, wifiEnabled: null,
          connectedHosts: [],
        },
      };
    } catch {
      throw new HttpException('Failed to fetch ONT info from GenieACS', HttpStatus.BAD_GATEWAY);
    }
  }

  // ==================== WIFI (GenieACS) ====================

  async getWifiInfo(userId: string) {
    return this.getOntInfo(userId); // Same GenieACS data, WiFi extraction deferred
  }

  async updateWifiConfig(userId: string, body: { deviceId: string; wlanIndex?: number; ssid?: string; password?: string; securityMode?: string; enabled?: boolean }) {
    const settings = await this.prisma.genieacsSettings.findFirst({ where: { isActive: true } });
    if (!settings) throw new HttpException('GenieACS not configured', HttpStatus.NOT_FOUND);

    // GenieACS parameter update via API deferred
    return {
      success: true,
      message: 'WiFi config update deferred to GenieACS integration.',
      requested: body,
    };
  }
}
