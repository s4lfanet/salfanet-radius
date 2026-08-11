import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { nowWIB } from '../../common/utils/timezone';
import { nanoid } from 'nanoid';
import * as crypto from 'crypto';

@Injectable()
export class AgentPortalService {
  private readonly logger = new Logger(AgentPortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  // ==================== AUTH ====================

  async login(body: { phone: string }) {
    if (!body.phone) throw new HttpException('Phone number required', HttpStatus.BAD_REQUEST);
    const agent = await this.prisma.agent.findUnique({
      where: { phone: body.phone },
      select: { id: true, name: true, phone: true, email: true, isActive: true },
    });
    if (!agent) throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    if (!agent.isActive) throw new HttpException('Agent account is inactive', HttpStatus.FORBIDDEN);

    await this.prisma.agent.update({ where: { id: agent.id }, data: { lastLogin: new Date() } });
    const token = await this.authService.signAgentToken(agent.id, agent.phone);

    return {
      success: true, token, expiresIn: '7d',
      agent: { id: agent.id, name: agent.name, phone: agent.phone, email: agent.email },
    };
  }

  // ==================== DASHBOARD ====================

  async getDashboard(agentId: string, params: { page?: number; limit?: number; status?: string; search?: string; profileId?: string }) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, name: true, phone: true, email: true, balance: true, minBalance: true, lastLogin: true, routerId: true },
    });
    if (!agent) throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);

    const page = params.page || 1;
    const limit = params.limit || 10;

    // Voucher filters
    const voucherWhere: Record<string, unknown> = { agentId };
    if (params.status) voucherWhere.status = params.status;
    if (params.profileId) voucherWhere.profileId = params.profileId;
    if (params.search) voucherWhere.OR = [{ code: { contains: params.search } }, { batchCode: { contains: params.search } }];

    const [vouchers, totalVouchers] = await Promise.all([
      this.prisma.hotspotVoucher.findMany({
        where: voucherWhere as never,
        include: { profile: { select: { name: true, costPrice: true, sellingPrice: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit, skip: (page - 1) * limit,
      }),
      this.prisma.hotspotVoucher.count({ where: voucherWhere as never }),
    ]);

    // Stats
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [monthSales, allTimeSales, todaySales, generated, waiting, sold, used] = await Promise.all([
      this.prisma.agentSale.aggregate({ where: { agentId, createdAt: { gte: monthStart } }, _sum: { amount: true }, _count: true }),
      this.prisma.agentSale.aggregate({ where: { agentId }, _sum: { amount: true }, _count: true }),
      this.prisma.agentSale.aggregate({ where: { agentId, createdAt: { gte: todayStart } }, _sum: { amount: true }, _count: true }),
      this.prisma.hotspotVoucher.count({ where: { agentId } }),
      this.prisma.hotspotVoucher.count({ where: { agentId, status: 'WAITING' } }),
      this.prisma.hotspotVoucher.count({ where: { agentId, status: 'SOLD' } }),
      this.prisma.hotspotVoucher.count({ where: { agentId, status: 'ACTIVE' } }),
    ]);

    // Profiles with agentAccess
    const profiles = await this.prisma.hotspotProfile.findMany({
      where: { agentAccess: true, isActive: true },
      select: { id: true, name: true, costPrice: true, sellingPrice: true, validityValue: true, validityUnit: true },
    });

    // Recent deposits
    const deposits = await this.prisma.agentDeposit.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // Active payment gateways
    const paymentGateways = await this.prisma.paymentGateway.findMany({
      where: { isActive: true },
      select: { id: true, name: true, provider: true },
    });

    // Voucher stock count
    const voucherStock = await this.prisma.hotspotVoucher.count({ where: { agentId, status: 'WAITING' } });

    return {
      agent: { ...agent, voucherStock },
      stats: {
        currentMonth: { income: monthSales._sum.amount || 0, count: monthSales._count },
        allTime: { income: allTimeSales._sum.amount || 0, count: allTimeSales._count },
        today: { income: todaySales._sum.amount || 0, count: todaySales._count },
        generated, waiting, sold, used,
      },
      profiles, deposits, paymentGateways,
      vouchers,
      pagination: { page, limit, total: totalVouchers, totalPages: Math.ceil(totalVouchers / limit) },
    };
  }

  // ==================== DEPOSIT ====================

  async createDeposit(agentId: string, body: { amount: number; gateway: string; paymentMethod?: string }) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId }, select: { id: true, name: true, isActive: true } });
    if (!agent) throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    if (!agent.isActive) throw new HttpException('Agent inactive', HttpStatus.FORBIDDEN);
    if (!body.amount || body.amount < 10000) throw new HttpException('Minimum deposit is Rp 10,000', HttpStatus.BAD_REQUEST);

    const gatewayConfig = await this.prisma.paymentGateway.findUnique({ where: { provider: body.gateway } });
    if (!gatewayConfig || !gatewayConfig.isActive) throw new HttpException('Payment gateway not available', HttpStatus.BAD_REQUEST);

    const paymentToken = crypto.randomUUID();
    const deposit = await this.prisma.agentDeposit.create({
      data: {
        id: crypto.randomUUID(), agentId, amount: body.amount,
        paymentGateway: body.gateway, paymentToken,
        status: 'PENDING',
      },
    });

    // Payment URL generation deferred to payment-gateway integration
    // For now, return deposit with token for frontend to initiate payment
    return {
      success: true,
      deposit: { id: deposit.id, token: paymentToken, amount: deposit.amount, paymentUrl: null, expiredAt: null },
    };
  }

  async checkDeposit(params: { token?: string; orderId?: string }) {
    const where: Record<string, unknown> = {};
    if (params.token) where.paymentToken = params.token;
    else if (params.orderId) where.id = params.orderId;
    else throw new HttpException('token or orderId required', HttpStatus.BAD_REQUEST);

    const deposit = await this.prisma.agentDeposit.findFirst({
      where: where as never,
      include: { agent: { select: { name: true, balance: true } } },
    });
    if (!deposit) throw new HttpException('Deposit not found', HttpStatus.NOT_FOUND);

    return {
      success: true,
      deposit: {
        id: deposit.id, amount: deposit.amount, status: deposit.status,
        paidAt: deposit.paidAt, agentName: deposit.agent.name, newBalance: deposit.agent.balance,
      },
    };
  }

  // ==================== NOTIFICATIONS ====================

  async getNotifications(agentId: string, limit?: number) {
    const take = limit || 20;
    const [notifications, unreadCount] = await Promise.all([
      this.prisma.agentNotification.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' }, take }),
      this.prisma.agentNotification.count({ where: { agentId, isRead: false } }),
    ]);
    return { success: true, notifications, unreadCount };
  }

  async markNotificationsRead(agentId: string, body: { notificationIds?: string[]; markAll?: boolean }) {
    if (body.markAll) {
      await this.prisma.agentNotification.updateMany({ where: { agentId, isRead: false }, data: { isRead: true } });
    } else if (body.notificationIds?.length) {
      await this.prisma.agentNotification.updateMany({
        where: { id: { in: body.notificationIds }, agentId },
        data: { isRead: true },
      });
    }
    return { success: true };
  }

  async deleteNotification(agentId: string, id: string) {
    const notif = await this.prisma.agentNotification.findUnique({ where: { id } });
    if (!notif || notif.agentId !== agentId) throw new HttpException('Notification not found', HttpStatus.NOT_FOUND);
    await this.prisma.agentNotification.delete({ where: { id } });
    return { success: true };
  }

  // ==================== SESSIONS ====================

  async getSessions(agentId: string) {
    const vouchers = await this.prisma.hotspotVoucher.findMany({
      where: { agentId, status: 'ACTIVE' },
      select: { code: true, profileId: true, routerId: true, firstLoginAt: true, expiresAt: true, profile: { select: { name: true } } },
    });

    if (vouchers.length === 0) return { sessions: [] };

    const codes = vouchers.map((v) => v.code);
    const activeSessions = await this.prisma.radacct.findMany({
      where: { username: { in: codes }, acctstoptime: null },
    });

    const sessionMap = new Map(activeSessions.map((s) => [s.username, s]));
    const routerIds = [...new Set(vouchers.map((v) => v.routerId).filter(Boolean))] as string[];
    const routers = await this.prisma.router.findMany({ where: { id: { in: routerIds } }, select: { id: true, name: true } });
    const routerMap = new Map(routers.map((r) => [r.id, r.name]));

    const sessions = vouchers.map((v) => {
      const acct = sessionMap.get(v.code);
      return {
        id: v.code,
        username: v.code,
        nasIpAddress: acct?.nasipaddress || null,
        framedIpAddress: acct?.framedipaddress || null,
        callingStationId: acct?.callingstationid || null,
        acctStartTime: acct?.acctstarttime || v.firstLoginAt,
        acctInputOctets: Number(acct?.acctinputoctets ?? 0),
        acctOutputOctets: Number(acct?.acctoutputoctets ?? 0),
        duration: acct?.acctsessiontime ? Number(acct.acctsessiontime) : 0,
        expiresAt: v.expiresAt,
        profileName: v.profile?.name || null,
        routerName: v.routerId ? routerMap.get(v.routerId) || null : null,
      };
    });

    return { sessions };
  }

  // ==================== GENERATE VOUCHER ====================

  async generateVoucher(agentId: string, body: { profileId: string; quantity: number; codeLength?: number; codeType?: string; prefix?: string }) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);

    const profile = await this.prisma.hotspotProfile.findUnique({ where: { id: body.profileId } });
    if (!profile) throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);

    const quantity = Math.min(body.quantity || 1, 100);
    const cost = profile.sellingPrice * quantity;

    if (agent.balance < cost) {
      throw new HttpException('Insufficient balance', HttpStatus.BAD_REQUEST);
    }

    const codeLength = body.codeLength || 8;
    const prefix = body.prefix || '';
    const batchCode = `BATCH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const vouchers: any[] = [];
    return this.prisma.$transaction(async (tx) => {
      // Deduct balance
      await tx.agent.update({ where: { id: agentId }, data: { balance: { decrement: cost } } });

      for (let i = 0; i < quantity; i++) {
        const code = prefix + Math.random().toString(36).slice(2, 2 + codeLength).toUpperCase();
        const voucher = await tx.hotspotVoucher.create({
          data: {
            id: `vch_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            code, password: code,
            profileId: profile.id,
            status: 'ACTIVE',
            agentId,
            batchCode,
          },
        });
        vouchers.push({ id: voucher.id, code: voucher.code });

        // Record sale
        await tx.agentSale.create({
          data: {
            id: `sale_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            agentId,
            voucherCode: code,
            profileName: profile.name,
            amount: profile.sellingPrice,
            paymentStatus: 'PAID',
            paymentDate: new Date(),
            paidAmount: profile.sellingPrice,
          },
        });
      }

      // Create notification
      await tx.agentNotification.create({
        data: {
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          agentId,
          type: 'voucher_generated',
          title: 'Voucher Generated',
          message: `${quantity} voucher(s) generated for ${profile.name}. Cost: ${cost}`,
        },
      });

      const updatedAgent = await tx.agent.findUnique({ where: { id: agentId }, select: { balance: true } });

      return {
        vouchers,
        batchCode,
        cost,
        newBalance: updatedAgent?.balance || 0,
        note: 'RADIUS sync deferred to session-sync integration.',
      };
    });
  }

  // ==================== RECORD SALES (cron) ====================

  async recordSales() {
    // Find ACTIVE vouchers with batch codes that don't have sales records
    const vouchers = await this.prisma.hotspotVoucher.findMany({
      where: { status: 'ACTIVE', agentId: { not: null }, batchCode: { not: null } },
      include: { profile: true },
      take: 500,
    });

    let recorded = 0;
    const errors: string[] = [];

    for (const voucher of vouchers) {
      if (!voucher.agentId) continue;
      const existingSale = await this.prisma.agentSale.findFirst({
        where: { voucherCode: voucher.code },
      });
      if (existingSale) continue;

      try {
        await this.prisma.agentSale.create({
          data: {
            id: `sale_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            agentId: voucher.agentId,
            voucherCode: voucher.code,
            profileName: voucher.profile?.name || 'Unknown',
            amount: voucher.profile?.sellingPrice || 0,
            paymentStatus: 'PAID',
            paymentDate: new Date(),
            paidAmount: voucher.profile?.sellingPrice || 0,
          },
        });
        recorded++;
      } catch (err: any) {
        errors.push(`${voucher.code}: ${err.message}`);
      }
    }

    return { recorded, errors };
  }

  // ==================== DEPOSIT PAYMENT METHODS ====================

  async getDepositPaymentMethods(gateway?: string, amount?: number) {
    const where: Record<string, unknown> = { isActive: true };
    if (gateway) where.provider = gateway;

    const gateways = await this.prisma.paymentGateway.findMany({ where: where as never });
    const company = await this.prisma.company.findFirst();

    const methods: any[] = [];
    for (const g of gateways) {
      // Payment method retrieval deferred to payment-gateway integration
      methods.push({
        gateway: g.provider,
        gatewayName: g.name,
        code: `${g.provider}_default`,
        name: `${g.name} Default`,
        fee: 0,
        iconUrl: null,
      });
    }

    return { methods, note: 'Detailed payment method retrieval deferred to payment-gateway integration.' };
  }

  // ==================== MANUAL DEPOSIT REQUEST ====================

  async createManualDepositRequest(agentId: string, body: {
    amount: number; note?: string;
    targetBankName?: string; targetBankAccountNumber?: string; targetBankAccountName?: string;
    senderAccountName?: string; senderAccountNumber?: string; receiptImage?: string;
  }) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    if (!body.amount || body.amount < 10000) throw new HttpException('Minimum deposit is 10000', HttpStatus.BAD_REQUEST);

    const deposit = await this.prisma.agentDeposit.create({
      data: {
        id: `dep_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        agentId,
        amount: body.amount,
        status: 'PENDING',
        note: body.note || null,
        targetBankName: body.targetBankName || null,
        targetBankAccountNumber: body.targetBankAccountNumber || null,
        targetBankAccountName: body.targetBankAccountName || null,
        senderAccountName: body.senderAccountName || null,
        senderAccountNumber: body.senderAccountNumber || null,
        receiptImage: body.receiptImage || null,
      },
    });

    // Create notifications
    await this.prisma.agentNotification.create({
      data: {
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        agentId,
        type: 'deposit_request',
        title: 'Deposit Request Submitted',
        message: `Your deposit request for ${body.amount} has been submitted and is pending admin approval.`,
      },
    });

    await this.prisma.notification.create({
      data: {
        type: 'agent_deposit_request',
        title: 'Agent Deposit Request',
        message: `Agent ${agent.name} requested a deposit of ${body.amount}`,
        link: '/admin/agent-deposits',
      },
    });

    return { success: true, deposit };
  }

  // ==================== DEPOSIT WEBHOOK ====================

  async handleDepositWebhook(body: any, headers: Record<string, string>) {
    // Gateway-specific signature verification deferred to payment-gateway integration
    // Log webhook for now
    this.logger.log(`Agent deposit webhook received: ${JSON.stringify(body).slice(0, 200)}`);

    // Try to extract order ID and status from common webhook formats
    const orderId = body.order_id || body.external_id || body.merchantOrderId || body.transaction_id;
    const status = body.transaction_status || body.status || body.result?.status;

    if (!orderId) return { success: false, message: 'No order ID found in webhook' };

    const deposit = await this.prisma.agentDeposit.findFirst({
      where: { paymentToken: orderId },
    });

    if (!deposit) return { success: false, message: 'Deposit not found' };

    if (status === 'success' || status === 'PAID' || status === 'settlement' || status === 'capture') {
      return this.prisma.$transaction(async (tx) => {
        await tx.agentDeposit.update({
          where: { id: deposit.id },
          data: { status: 'SUCCESS', paidAt: new Date() },
        });
        await tx.agent.update({
          where: { id: deposit.agentId },
          data: { balance: { increment: deposit.amount } },
        });

        await tx.agentNotification.create({
          data: {
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            agentId: deposit.agentId,
            type: 'deposit_success',
            title: 'Deposit Success',
            message: `Your deposit of ${deposit.amount} has been confirmed. New balance updated.`,
          },
        });

        return { success: true, status: 'SUCCESS', orderId };
      });
    }

    if (status === 'failed' || status === 'FAILED' || status === 'expire' || status === 'denied') {
      await this.prisma.agentDeposit.update({
        where: { id: deposit.id },
        data: { status: 'FAILED' },
      });
      return { success: true, status: 'FAILED', orderId };
    }

    return { success: true, status: 'PENDING', orderId };
  }
}
