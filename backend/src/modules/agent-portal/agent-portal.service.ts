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
}
