import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class EvoucherService {
  private readonly logger = new Logger(EvoucherService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listProfiles() {
    const profiles = await this.prisma.hotspotProfile.findMany({
      where: { isActive: true, eVoucherAccess: true },
      select: {
        id: true, name: true, sellingPrice: true, speed: true,
        validityValue: true, validityUnit: true, eVoucherAccess: true,
      },
      orderBy: { sellingPrice: 'asc' },
    });
    return { profiles };
  }

  async getOrderByToken(token: string) {
    if (!token) throw new HttpException('Payment token is required', HttpStatus.BAD_REQUEST);

    const order = await this.prisma.voucherOrder.findUnique({
      where: { paymentToken: token },
      include: {
        profile: { select: { name: true, speed: true, validityValue: true, validityUnit: true } },
        vouchers: { select: { code: true, status: true, createdAt: true } },
      },
    });

    if (!order) throw new HttpException('Order not found or invalid payment link', HttpStatus.NOT_FOUND);

    const [paymentGateways, company] = await Promise.all([
      this.prisma.paymentGateway.findMany({
        where: { isActive: true },
        select: { id: true, name: true, provider: true, isActive: true },
      }),
      this.prisma.company.findFirst({ select: { name: true, address: true, phone: true, email: true } }),
    ]);

    return { order, paymentGateways, company };
  }

  async createPurchase(body: {
    profileId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    notificationMethod?: string;
    quantity?: number;
  }) {
    const { profileId, customerName, customerPhone, customerEmail, quantity = 1 } = body;

    if (!profileId || !customerName || !customerPhone) {
      throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
    }

    const profile = await this.prisma.hotspotProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);
    if (!profile.eVoucherAccess || !profile.isActive) {
      throw new HttpException('Profile not available for e-voucher', HttpStatus.FORBIDDEN);
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const count = await this.prisma.voucherOrder.count({
      where: { orderNumber: { startsWith: `EVC-${year}${month}${day}-` } },
    });
    const orderNumber = `EVC-${year}${month}${day}-${String(count + 1).padStart(4, '0')}`;

    const totalAmount = profile.sellingPrice * quantity;

    const company = await this.prisma.company.findFirst();
    const baseUrl = company?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const paymentToken = crypto.randomBytes(32).toString('hex');
    const paymentLink = `${baseUrl}/evoucher/pay/${paymentToken}`;

    const order = await this.prisma.voucherOrder.create({
      data: {
        id: crypto.randomUUID(),
        orderNumber,
        profileId: profile.id,
        quantity,
        customerName,
        customerPhone,
        customerEmail,
        totalAmount,
        status: 'PENDING',
        paymentToken,
        paymentLink,
      },
      include: {
        profile: { select: { name: true, speed: true, validityValue: true, validityUnit: true } },
      },
    });

    // WhatsApp/Email notifications deferred to notification integration batch

    return {
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        paymentToken: order.paymentToken,
        paymentLink: order.paymentLink,
        totalAmount: order.totalAmount,
        profile: order.profile,
      },
      message: 'Order created successfully. Please proceed to payment.',
    };
  }
}
