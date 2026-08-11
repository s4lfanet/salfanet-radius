import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';

function generateCustomerId(prefix = ''): string {
  return prefix + Math.floor(10000000 + Math.random() * 90000000).toString();
}
function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

@Injectable()
export class PppoeService {
  private readonly logger = new Logger(PppoeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  // ==================== Customers ====================

  async getCustomers(params: { search?: string; status?: string; id?: string; session?: string }) {
    if (params.id) {
      const customer = await (this.prisma as any).pppoeCustomer.findUnique({
        where: { id: params.id },
        include: {
          pppoeUsers: {
            select: { id: true, username: true, status: true, customerId: true, expiredAt: true,
              profile: { select: { name: true, downloadSpeed: true, uploadSpeed: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      if (!customer) throw new HttpException('Not found', HttpStatus.NOT_FOUND);
      return { customer };
    }

    const where: Record<string, unknown> = {};
    if (params.search) {
      where.OR = [
        { name: { contains: params.search } },
        { phone: { contains: params.search } },
        { email: { contains: params.search } },
        { customerId: { contains: params.search } },
      ];
    }
    if (params.status === 'active') where.isActive = true;
    if (params.status === 'inactive') where.isActive = false;

    const customers = await (this.prisma as any).pppoeCustomer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { pppoeUsers: true } },
        area: { select: { id: true, name: true } },
        pppoeUsers: { select: { username: true } },
      },
    });

    // Enrich with session status
    const allUsernames: string[] = customers.flatMap((c: any) => c.pppoeUsers.map((u: any) => u.username));
    const activeSet = new Set<string>();
    if (allUsernames.length > 0) {
      const activeSessions = await (this.prisma as any).radacct.findMany({
        where: { username: { in: allUsernames }, acctstoptime: null },
        select: { username: true },
        distinct: ['username'],
      });
      activeSessions.forEach((s: any) => activeSet.add(s.username));
    }

    let enriched = customers.map((c: any) => {
      const usernames: string[] = c.pppoeUsers.map((u: any) => u.username);
      const onlineCount = usernames.filter((u: string) => activeSet.has(u)).length;
      const total = usernames.length;
      const sessionStatus = total === 0 || onlineCount === 0 ? 'offline' : onlineCount === total ? 'online' : 'partial';
      return { ...c, sessionStatus, onlineCount };
    });

    if (params.session === 'online') enriched = enriched.filter((c: any) => c.onlineCount > 0);
    if (params.session === 'offline') enriched = enriched.filter((c: any) => c.onlineCount === 0);

    return { customers: enriched };
  }

  async createCustomer(body: { name: string; phone: string; email?: string; address?: string; idCardNumber?: string; customerId?: string; areaId?: string }) {
    if (!body.name || !body.phone) throw new HttpException('Nama dan No. HP wajib diisi', HttpStatus.BAD_REQUEST);

    const existing = await (this.prisma as any).pppoeCustomer.findFirst({ where: { phone: body.phone } });
    if (existing) throw new HttpException('No. HP sudah terdaftar', HttpStatus.CONFLICT);

    const co = await this.prisma.company.findFirst({ select: { customerIdPrefix: true } });
    const prefix = (co as any)?.customerIdPrefix?.trim() || '';
    let customerId = body.customerId || generateCustomerId(prefix);
    let tries = 0;
    while (tries < 10) {
      const dup = await (this.prisma as any).pppoeCustomer.findUnique({ where: { customerId } });
      if (!dup) break;
      customerId = generateCustomerId(prefix);
      tries++;
    }

    const customer = await (this.prisma as any).pppoeCustomer.create({
      data: {
        id: generateId(), customerId,
        name: body.name.trim(), phone: body.phone.trim(),
        email: body.email?.trim() || null, address: body.address?.trim() || null,
        idCardNumber: body.idCardNumber?.trim() || null, areaId: body.areaId || null,
        isActive: true,
      },
    });
    return { success: true, customer };
  }

  async updateCustomer(body: { id: string; name?: string; phone?: string; email?: string; address?: string; idCardNumber?: string; isActive?: boolean; areaId?: string }) {
    if (!body.id) throw new HttpException('Customer ID wajib diisi', HttpStatus.BAD_REQUEST);
    if (body.phone) {
      const existing = await (this.prisma as any).pppoeCustomer.findFirst({ where: { phone: body.phone, NOT: { id: body.id } } });
      if (existing) throw new HttpException('No. HP sudah dipakai customer lain', HttpStatus.CONFLICT);
    }
    try {
      const customer = await (this.prisma as any).pppoeCustomer.update({
        where: { id: body.id },
        data: {
          ...(body.name && { name: body.name.trim() }),
          ...(body.phone && { phone: body.phone.trim() }),
          email: body.email?.trim() || null, address: body.address?.trim() || null,
          idCardNumber: body.idCardNumber?.trim() || null,
          ...(body.areaId !== undefined && { areaId: body.areaId || null }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      });
      return { success: true, customer };
    } catch (error: any) {
      if (error?.code === 'P2025') throw new HttpException('Customer tidak ditemukan', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteCustomer(id: string) {
    if (!id) throw new HttpException('Customer ID wajib diisi', HttpStatus.BAD_REQUEST);
    const userCount = await (this.prisma as any).pppoeUser.count({ where: { pppoeCustomerId: id } });
    if (userCount > 0) throw new HttpException(`Customer memiliki ${userCount} langganan PPPoE aktif. Hapus atau pindahkan langganan terlebih dahulu.`, HttpStatus.BAD_REQUEST);
    try {
      await (this.prisma as any).pppoeCustomer.delete({ where: { id } });
      return { success: true };
    } catch (error: any) {
      if (error?.code === 'P2025') throw new HttpException('Customer tidak ditemukan', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  // ==================== Profiles ====================

  async getProfiles() {
    const profiles = await this.prisma.pppoeProfile.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true } } },
    });
    return {
      profiles: profiles.map((p) => ({ ...p, userCount: p._count?.users || 0, _count: undefined })),
      count: profiles.length,
    };
  }

  async createProfile(body: Record<string, unknown>) {
    const { name, description, groupName, ipPoolName, price, downloadSpeed: rawDownload, uploadSpeed: rawUpload, rateLimit, validityValue, validityUnit, sharedUser, hpp, ppnActive, ppnRate } = body as any;

    let downloadSpeed = rawDownload;
    let uploadSpeed = rawUpload;
    if (rateLimit && !downloadSpeed && !uploadSpeed) {
      const speedPart = String(rateLimit).split(' ')[0];
      const [dl, ul] = speedPart.split('/');
      if (dl && ul) {
        downloadSpeed = parseInt(dl.replace(/[^0-9]/g, '')) || 0;
        uploadSpeed = parseInt(ul.replace(/[^0-9]/g, '')) || 0;
        if (dl.toLowerCase().includes('k')) downloadSpeed = Math.ceil(downloadSpeed / 1000);
        if (ul.toLowerCase().includes('k')) uploadSpeed = Math.ceil(uploadSpeed / 1000);
      }
    }

    if (!name || !groupName || !price || !downloadSpeed || !uploadSpeed || !validityValue || !validityUnit) {
      throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
    }

    const finalGroupName = String(groupName).trim();
    const finalIpPoolName = typeof ipPoolName === 'string' ? ipPoolName.trim() || null : null;

    const profile = await this.prisma.pppoeProfile.create({
      data: {
        id: crypto.randomUUID(), name, description: description || null,
        groupName: finalGroupName, mikrotikProfileName: finalGroupName, ipPoolName: finalIpPoolName,
        price: parseInt(price), downloadSpeed: parseInt(downloadSpeed), uploadSpeed: parseInt(uploadSpeed),
        rateLimit: rateLimit || `${downloadSpeed}M/${uploadSpeed}M`,
        validityValue: parseInt(validityValue), validityUnit,
        sharedUser: sharedUser !== undefined ? sharedUser : true, isActive: true,
        hpp: hpp !== undefined ? parseInt(hpp) || null : null,
        ppnActive: ppnActive === true, ppnRate: ppnRate !== undefined ? parseInt(ppnRate) || 11 : 11,
      },
    });

    // Sync to FreeRADIUS in background
    void (async () => {
      try {
        const finalRateLimit = rateLimit || `${downloadSpeed}M/${uploadSpeed}M`;
        const existingGroup = await this.prisma.radgroupreply.findFirst({
          where: { groupname: finalGroupName, attribute: 'Mikrotik-Group' },
        });
        if (!existingGroup) {
          await this.prisma.radgroupreply.createMany({
            data: [
              { groupname: finalGroupName, attribute: 'Mikrotik-Group', op: ':=', value: finalGroupName },
              { groupname: finalGroupName, attribute: 'Mikrotik-Rate-Limit', op: ':=', value: finalRateLimit },
            ],
          });
          if (sharedUser !== false) {
            await this.prisma.radgroupcheck.create({
              data: { groupname: finalGroupName, attribute: 'Simultaneous-Use', op: ':=', value: '1' },
            });
          }
        }
        await this.prisma.pppoeProfile.update({ where: { id: profile.id }, data: { syncedToRadius: true, lastSyncAt: new Date() } });
      } catch (e) {
        this.logger.error('[BG] RADIUS sync error (create):', e);
      }
    })();

    return { success: true, profile: { ...profile, syncedToRadius: true } };
  }

  async updateProfile(body: Record<string, unknown>) {
    const { id, name, description, groupName, ipPoolName, price, downloadSpeed: rawDownload, uploadSpeed: rawUpload, rateLimit: bodyRateLimit, validityValue, validityUnit, sharedUser, isActive, hpp, ppnActive, ppnRate } = body as any;
    if (!id) throw new HttpException('Profile ID is required', HttpStatus.BAD_REQUEST);

    const currentProfile = await this.prisma.pppoeProfile.findUnique({ where: { id } });
    if (!currentProfile) throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);

    let downloadSpeed = rawDownload;
    let uploadSpeed = rawUpload;
    if (bodyRateLimit && (!rawDownload || !rawUpload)) {
      const speedPart = String(bodyRateLimit).split(' ')[0];
      const [dl, ul] = speedPart.split('/');
      if (dl && ul) {
        if (!rawDownload) { downloadSpeed = parseInt(dl.replace(/[^0-9]/g, '')) || 0; if (dl.toLowerCase().includes('k')) downloadSpeed = Math.ceil(downloadSpeed / 1000); }
        if (!rawUpload) { uploadSpeed = parseInt(ul.replace(/[^0-9]/g, '')) || 0; if (ul.toLowerCase().includes('k')) uploadSpeed = Math.ceil(uploadSpeed / 1000); }
      }
    }

    const normalizedGroupName = typeof groupName === 'string' ? groupName.trim() : undefined;
    const normalizedIpPoolName = typeof ipPoolName === 'string' ? ipPoolName.trim() || null : undefined;

    if (normalizedGroupName && normalizedGroupName !== currentProfile.groupName) {
      const existingProfile = await this.prisma.pppoeProfile.findFirst({ where: { groupName: normalizedGroupName } });
      if (existingProfile) throw new HttpException(`Group name "${normalizedGroupName}" already exists.`, HttpStatus.BAD_REQUEST);
    }

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (normalizedGroupName) { updateData.groupName = normalizedGroupName; updateData.mikrotikProfileName = normalizedGroupName; }
    if (normalizedIpPoolName !== undefined) updateData.ipPoolName = normalizedIpPoolName;
    if (price) updateData.price = parseInt(price);
    if (downloadSpeed !== undefined) updateData.downloadSpeed = parseInt(String(downloadSpeed));
    if (uploadSpeed !== undefined) updateData.uploadSpeed = parseInt(String(uploadSpeed));
    if (bodyRateLimit !== undefined) updateData.rateLimit = bodyRateLimit;
    if (validityValue) updateData.validityValue = parseInt(validityValue);
    if (validityUnit) updateData.validityUnit = validityUnit;
    if (sharedUser !== undefined) updateData.sharedUser = sharedUser;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (hpp !== undefined) updateData.hpp = hpp !== null ? parseInt(hpp) || null : null;
    if (ppnActive !== undefined) updateData.ppnActive = ppnActive === true;
    if (ppnRate !== undefined) updateData.ppnRate = ppnRate !== null ? parseInt(ppnRate) || 11 : 11;

    const profile = await this.prisma.pppoeProfile.update({ where: { id }, data: updateData });

    // RADIUS re-sync in background
    if (normalizedGroupName || bodyRateLimit || sharedUser !== undefined) {
      void (async () => {
        try {
          const oldGroupName = currentProfile.groupName;
          const newGroupName = normalizedGroupName || currentProfile.groupName;
          const newDownload = downloadSpeed !== undefined ? downloadSpeed : currentProfile.downloadSpeed;
          const newUpload = uploadSpeed !== undefined ? uploadSpeed : currentProfile.uploadSpeed;
          const rateLimitVal = bodyRateLimit || `${newDownload}M/${newUpload}M`;
          await this.prisma.radgroupreply.deleteMany({ where: { groupname: oldGroupName } });
          await this.prisma.radgroupcheck.deleteMany({ where: { groupname: oldGroupName, attribute: 'Simultaneous-Use' } });
          await this.prisma.radgroupreply.createMany({
            data: [
              { groupname: newGroupName, attribute: 'Mikrotik-Group', op: ':=', value: newGroupName },
              { groupname: newGroupName, attribute: 'Mikrotik-Rate-Limit', op: ':=', value: rateLimitVal },
            ],
          });
          const finalSharedUser = sharedUser !== undefined ? sharedUser : currentProfile.sharedUser;
          if (finalSharedUser) {
            await this.prisma.radgroupcheck.create({ data: { groupname: newGroupName, attribute: 'Simultaneous-Use', op: ':=', value: '1' } });
          }
          await this.prisma.pppoeProfile.update({ where: { id }, data: { syncedToRadius: true, lastSyncAt: new Date() } });
        } catch (syncError) {
          this.logger.error('[BG] RADIUS re-sync error (update):', syncError);
        }
      })();
    }

    return { success: true, profile };
  }

  async deleteProfile(id: string) {
    if (!id) throw new HttpException('Profile ID is required', HttpStatus.BAD_REQUEST);
    const profile = await this.prisma.pppoeProfile.findUnique({ where: { id } });
    if (!profile) throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);

    const userCount = await this.prisma.pppoeUser.count({ where: { profileId: id } });
    if (userCount > 0) throw new HttpException(`Cannot delete profile. ${userCount} user(s) are using this profile.`, HttpStatus.BAD_REQUEST);

    const regCount = await this.prisma.registrationRequest.count({ where: { profileId: id } });
    if (regCount > 0) throw new HttpException(`Cannot delete profile. ${regCount} registration request(s) are linked.`, HttpStatus.BAD_REQUEST);

    try { await this.prisma.radgroupreply.deleteMany({ where: { groupname: profile.groupName } }); } catch (e) { this.logger.error('RADIUS cleanup error:', e); }
    await this.prisma.pppoeProfile.delete({ where: { id } });
    return { success: true, message: 'Profile deleted successfully' };
  }

  // ==================== Areas ====================

  async getAreas() {
    const areas = await this.prisma.pppoeArea.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
    return {
      areas: areas.map((a: any) => ({ ...a, userCount: a._count.users })),
      count: areas.length,
    };
  }

  async createArea(body: { name: string; description?: string; isActive?: boolean }, user?: { name?: string; role?: string }) {
    if (!body.name) throw new HttpException('Nama area wajib diisi', HttpStatus.BAD_REQUEST);
    const existing = await this.prisma.pppoeArea.findUnique({ where: { name: body.name } });
    if (existing) throw new HttpException(`Area "${body.name}" sudah ada`, HttpStatus.BAD_REQUEST);

    const area = await this.prisma.pppoeArea.create({
      data: { id: crypto.randomUUID(), name: body.name, description: body.description || null, isActive: body.isActive !== false },
    });

    await this.activityLog.logActivity({
      username: user?.name || 'System', userRole: user?.role,
      action: 'CREATE_AREA', description: `Area "${area.name}" dibuat`,
      module: 'pppoe', status: 'success', metadata: { areaId: area.id, areaName: area.name },
    });
    return { area, success: true };
  }

  async updateArea(body: { id: string; name: string; description?: string; isActive?: boolean }, user?: { name?: string; role?: string }) {
    if (!body.id) throw new HttpException('ID area wajib diisi', HttpStatus.BAD_REQUEST);
    if (!body.name) throw new HttpException('Nama area wajib diisi', HttpStatus.BAD_REQUEST);

    const existingArea = await this.prisma.pppoeArea.findUnique({ where: { id: body.id } });
    if (!existingArea) throw new HttpException('Area tidak ditemukan', HttpStatus.NOT_FOUND);

    if (body.name !== existingArea.name) {
      const conflict = await this.prisma.pppoeArea.findUnique({ where: { name: body.name } });
      if (conflict) throw new HttpException(`Area "${body.name}" sudah ada`, HttpStatus.BAD_REQUEST);
    }

    const area = await this.prisma.pppoeArea.update({
      where: { id: body.id },
      data: { name: body.name, description: body.description || null, isActive: body.isActive !== false },
    });

    await this.activityLog.logActivity({
      username: user?.name || 'System', userRole: user?.role,
      action: 'UPDATE_AREA', description: `Area "${area.name}" diperbarui`,
      module: 'pppoe', status: 'success', metadata: { areaId: area.id, areaName: area.name },
    });
    return { area, success: true };
  }

  async deleteArea(id: string, user?: { name?: string; role?: string }) {
    if (!id) throw new HttpException('ID area wajib diisi', HttpStatus.BAD_REQUEST);
    const area = await this.prisma.pppoeArea.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!area) throw new HttpException('Area tidak ditemukan', HttpStatus.NOT_FOUND);
    if (area._count.users > 0) throw new HttpException(`Tidak dapat menghapus area "${area.name}" karena masih memiliki ${area._count.users} pelanggan`, HttpStatus.BAD_REQUEST);

    await this.prisma.pppoeArea.delete({ where: { id } });
    await this.activityLog.logActivity({
      username: user?.name || 'System', userRole: user?.role,
      action: 'DELETE_AREA', description: `Area "${area.name}" dihapus`,
      module: 'pppoe', status: 'success', metadata: { areaId: id, areaName: area.name },
    });
    return { success: true, message: 'Area berhasil dihapus' };
  }
}
