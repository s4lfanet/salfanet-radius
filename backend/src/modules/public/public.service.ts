import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompanyInfo() {
    const company = await this.prisma.company.findFirst({
      select: { id: true, name: true, logo: true, phone: true, email: true, address: true, baseUrl: true },
    });
    return { success: true, company };
  }

  async getAreas() {
    const areas = await this.prisma.pppoeArea.findMany({
      where: { isActive: true },
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    });
    return { success: true, areas };
  }

  async getProfiles() {
    const profiles = await this.prisma.pppoeProfile.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, description: true, price: true,
        downloadSpeed: true, uploadSpeed: true,
        validityValue: true, validityUnit: true,
      },
      orderBy: { price: 'asc' },
    });
    return { success: true, profiles };
  }

  async getStats() {
    const [totalUsers, activeUsers, totalVouchers] = await Promise.all([
      this.prisma.pppoeUser.count(),
      this.prisma.pppoeUser.count({ where: { status: 'active' } }),
      this.prisma.hotspotVoucher.count(),
    ]);

    // Round for privacy — no revenue data
    return {
      success: true,
      stats: {
        totalUsers: Math.round(totalUsers / 10) * 10,
        activeUsers: Math.round(activeUsers / 10) * 10,
        totalVouchers: Math.round(totalVouchers / 10) * 10,
      },
    };
  }

  async getPaymentGateways() {
    const gateways = await this.prisma.paymentGateway.findMany({
      where: { isActive: true },
      select: { id: true, name: true, provider: true },
      orderBy: { name: 'asc' },
    });
    return { success: true, gateways };
  }
}
