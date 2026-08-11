import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HotspotService {
  private readonly logger = new Logger(HotspotService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== Profiles ====================

  async getProfiles() {
    const profiles = await this.prisma.hotspotProfile.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return {
      profiles: profiles.map((p) => ({
        ...p,
        usageQuota: p.usageQuota ? Number(p.usageQuota) : null,
      })),
    };
  }

  async createProfile(body: Record<string, unknown>) {
    const { name, costPrice, resellerFee, speed, groupProfile, sharedUsers, validityValue, validityUnit, usageQuota, usageDuration, usageDurationUnit, agentAccess, eVoucherAccess } = body as any;

    if (!name || !costPrice || !speed || !validityValue || !validityUnit) {
      throw new HttpException('Required fields missing', HttpStatus.BAD_REQUEST);
    }

    const sellingPrice = parseInt(costPrice) + (parseInt(resellerFee) || 0);

    try {
      const profile = await this.prisma.hotspotProfile.create({
        data: {
          id: crypto.randomUUID(), name,
          costPrice: parseInt(costPrice), resellerFee: parseInt(resellerFee) || 0,
          sellingPrice, speed, groupProfile,
          sharedUsers: parseInt(sharedUsers) || 1,
          validityValue: parseInt(validityValue), validityUnit,
          usageQuota: usageQuota ? BigInt(usageQuota) : null,
          usageDuration: usageDuration ? parseInt(usageDuration) : null,
          usageDurationUnit: usageDurationUnit || 'HOURS',
          agentAccess: agentAccess ?? true, eVoucherAccess: eVoucherAccess ?? true,
        },
      });
      return { profile };
    } catch (error: any) {
      if (error.code === 'P2002') throw new HttpException('Profile name already exists', HttpStatus.BAD_REQUEST);
      throw error;
    }
  }

  async updateProfile(body: Record<string, unknown>) {
    const { id, name, costPrice, resellerFee, speed, groupProfile, sharedUsers, validityValue, validityUnit, usageQuota, usageDuration, usageDurationUnit, agentAccess, eVoucherAccess, isActive } = body as any;
    if (!id) throw new HttpException('Profile ID required', HttpStatus.BAD_REQUEST);

    const sellingPrice = parseInt(costPrice) + (parseInt(resellerFee) || 0);

    try {
      const profile = await this.prisma.hotspotProfile.update({
        where: { id },
        data: {
          name, costPrice: parseInt(costPrice), resellerFee: parseInt(resellerFee) || 0,
          sellingPrice, speed, groupProfile, sharedUsers: parseInt(sharedUsers) || 1,
          validityValue: parseInt(validityValue), validityUnit,
          usageQuota: usageQuota ? BigInt(usageQuota) : null,
          usageDuration: usageDuration ? parseInt(usageDuration) : null,
          usageDurationUnit: usageDurationUnit || 'HOURS',
          agentAccess, eVoucherAccess, isActive,
        },
      });
      return { profile };
    } catch (error: any) {
      if (error.code === 'P2002') throw new HttpException('Profile name already exists', HttpStatus.BAD_REQUEST);
      if (error.code === 'P2025') throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteProfile(id: string) {
    if (!id) throw new HttpException('Profile ID required', HttpStatus.BAD_REQUEST);
    const voucherCount = await this.prisma.hotspotVoucher.count({ where: { profileId: id } });
    if (voucherCount > 0) throw new HttpException(`Cannot delete profile with ${voucherCount} associated voucher(s)`, HttpStatus.BAD_REQUEST);

    try {
      await this.prisma.hotspotProfile.delete({ where: { id } });
      return { message: 'Profile deleted successfully' };
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  // ==================== Vouchers ====================

  async listVouchers(params: {
    profileId?: string; batchCode?: string; status?: string;
    routerId?: string; agentId?: string; page?: number; limit?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (params.profileId) where.profileId = params.profileId;
    if (params.batchCode) where.batchCode = params.batchCode;
    if (params.status) where.status = params.status;
    if (params.routerId) where.routerId = params.routerId;
    if (params.agentId) where.agentId = params.agentId;

    const page = params.page || 1;
    const limit = params.limit || 100;
    const skip = (page - 1) * limit;

    const [vouchers, total] = await Promise.all([
      this.prisma.hotspotVoucher.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take: limit,
        include: {
          profile: { select: { id: true, name: true, speed: true, validityValue: true, validityUnit: true } },
          router: { select: { id: true, name: true } },
          agent: { select: { id: true, name: true } },
        },
      }),
      this.prisma.hotspotVoucher.count({ where }),
    ]);

    return {
      vouchers, total,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async generateVouchers(body: {
    quantity: number; profileId: string; routerId?: string; agentId?: string;
    batchCode?: string; usernamePrefix?: string; passwordLength?: number;
  }) {
    if (!body.quantity || !body.profileId) {
      throw new HttpException('Quantity and Profile are required', HttpStatus.BAD_REQUEST);
    }
    if (body.quantity > 25000) {
      throw new HttpException('Maximum 25,000 vouchers per request', HttpStatus.BAD_REQUEST);
    }

    const profile = await this.prisma.hotspotProfile.findUnique({ where: { id: body.profileId } });
    if (!profile) throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);

    const batchCode = body.batchCode || `BATCH-${Date.now()}`;
    const codeLength = body.passwordLength || 8;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const vouchers: any[] = [];

    for (let i = 0; i < body.quantity; i++) {
      const code = (body.usernamePrefix || 'V') + Math.floor(100000 + Math.random() * 900000).toString();
      let password = '';
      for (let j = 0; j < codeLength; j++) password += chars[Math.floor(Math.random() * chars.length)];

      vouchers.push({
        id: crypto.randomUUID(),
        code, password,
        profileId: body.profileId,
        routerId: body.routerId || null,
        agentId: body.agentId || null,
        batchCode,
        status: 'WAITING',
        voucherType: 'same',
        codeType: 'alphanumeric',
        createdAt: new Date(),
      });
    }

    // Insert in batches of 1000
    for (let i = 0; i < vouchers.length; i += 1000) {
      await this.prisma.hotspotVoucher.createMany({ data: vouchers.slice(i, i + 1000) });
    }

    return { count: vouchers.length, batchCode };
  }

  async deleteVouchers(params: { id?: string; batchCode?: string }) {
    if (!params.id && !params.batchCode) throw new HttpException('Voucher ID or Batch Code required', HttpStatus.BAD_REQUEST);
    let result;
    if (params.id) {
      result = await this.prisma.hotspotVoucher.deleteMany({ where: { id: params.id } });
    } else {
      result = await this.prisma.hotspotVoucher.deleteMany({ where: { batchCode: params.batchCode } });
    }
    if (result.count === 0) throw new HttpException('Voucher not found', HttpStatus.NOT_FOUND);
    return { count: result.count };
  }

  async patchVouchers(ids: string[], body: {
    profileId?: string; routerId?: string | null; agentId?: string | null;
    clearAgent?: boolean; clearRouter?: boolean;
  }) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) throw new HttpException('ids is required', HttpStatus.BAD_REQUEST);

    const updateData: Record<string, unknown> = {};
    if (body.profileId) updateData.profileId = body.profileId;
    if (body.routerId !== undefined) updateData.routerId = body.routerId;
    if (body.agentId !== undefined) updateData.agentId = body.agentId;
    if (body.clearAgent) updateData.agentId = null;
    if (body.clearRouter) updateData.routerId = null;

    const result = await this.prisma.hotspotVoucher.updateMany({
      where: { id: { in: ids } },
      data: updateData,
    });
    return { updated: result.count };
  }

  async deleteExpired() {
    const now = new Date();
    const result = await this.prisma.hotspotVoucher.deleteMany({
      where: { status: 'EXPIRED', expiresAt: { lt: now } },
    });
    return { count: result.count, message: `${result.count} expired vouchers deleted` };
  }

  async bulkDelete(ids: string[]) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) throw new HttpException('ids is required', HttpStatus.BAD_REQUEST);
    const result = await this.prisma.hotspotVoucher.deleteMany({ where: { id: { in: ids } } });
    return { count: result.count, message: `${result.count} vouchers deleted` };
  }
}
