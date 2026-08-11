import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

@Injectable()
export class TechnicianPortalService {
  private readonly logger = new Logger(TechnicianPortalService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== CUSTOMERS ====================

  async listCustomers(technicianId: string, params: { search?: string; status?: string; routerId?: string; areaId?: string; page?: number; limit?: number }) {
    const page = Math.min(params.page || 1, 1);
    const limit = Math.min(params.limit || 30, 100);

    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.routerId) where.routerId = params.routerId;
    if (params.areaId) where.areaId = params.areaId;
    if (params.search) {
      where.OR = [
        { name: { contains: params.search } },
        { username: { contains: params.search } },
        { phone: { contains: params.search } },
        { address: { contains: params.search } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.pppoeUser.findMany({
        where: where as never,
        include: { profile: { select: { name: true } }, area: { select: { name: true } }, router: { select: { name: true } } },
        orderBy: { name: 'asc' },
        take: limit, skip: (page - 1) * limit,
      }),
      this.prisma.pppoeUser.count({ where: where as never }),
    ]);

    return { users, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ==================== FORM DATA ====================

  async getFormData() {
    const [profiles, routers, areas] = await Promise.all([
      this.prisma.pppoeProfile.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      this.prisma.router.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, nasname: true } }),
      this.prisma.pppoeArea.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ]);
    return { profiles, routers, areas };
  }

  // ==================== SESSIONS ====================

  async getSessions(technicianId: string, params: { search?: string; routerId?: string; page?: number; limit?: number }) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);

    const radacctWhere: Record<string, unknown> = { acctstoptime: null };
    if (params.routerId) {
      const router = await this.prisma.router.findUnique({ where: { id: params.routerId }, select: { nasname: true } });
      if (router) radacctWhere.nasipaddress = router.nasname;
    }

    const activeSessions = await this.prisma.radacct.findMany({
      where: radacctWhere as never,
      orderBy: { acctstarttime: 'desc' },
      take: 1000,
    });

    const usernames = activeSessions.map((s) => s.username).filter(Boolean);
    const users = await this.prisma.pppoeUser.findMany({
      where: { username: { in: usernames } },
      include: { profile: { select: { name: true } }, area: { select: { name: true } }, router: { select: { name: true } } },
    });
    const userMap = new Map(users.map((u) => [u.username, u]));

    let sessions = activeSessions.map((s) => {
      const user = userMap.get(s.username);
      return {
        uniqueId: s.radacctid,
        username: s.username,
        framedIp: s.framedipaddress,
        nasIp: s.nasipaddress,
        uptimeSec: s.acctsessiontime ? Number(s.acctsessiontime) : 0,
        uptime: formatDuration(s.acctsessiontime ? Number(s.acctsessiontime) : 0),
        download: formatBytes(Number(s.acctoutputoctets ?? 0)),
        upload: formatBytes(Number(s.acctinputoctets ?? 0)),
        customerName: user?.name || null,
        customerPhone: user?.phone || null,
        profileName: user?.profile?.name || null,
        areaName: user?.area?.name || null,
        routerName: user?.router?.name || null,
      };
    });

    if (params.search) {
      const q = params.search.toLowerCase();
      sessions = sessions.filter((s) =>
        s.username?.toLowerCase().includes(q) ||
        s.customerName?.toLowerCase().includes(q) ||
        s.framedIp?.includes(q) ||
        s.nasIp?.includes(q)
      );
    }

    const total = sessions.length;
    const start = (page - 1) * limit;
    const paged = sessions.slice(start, start + limit);

    return { sessions: paged, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ==================== MONITOR ====================

  async getMonitor() {
    const statusGroups = await this.prisma.pppoeUser.groupBy({
      by: ['status'],
      _count: true,
    });
    const stats: Record<string, number> = { online: 0, isolated: 0, active: 0, stopped: 0, total: 0 };
    for (const g of statusGroups) {
      stats[g.status] = g._count;
      stats.total += g._count;
    }

    const onlineUsernames = await this.prisma.radacct.findMany({
      where: { acctstoptime: null },
      select: { username: true },
      distinct: ['username'],
    });
    stats.online = onlineUsernames.length;

    const activeSessions = await this.prisma.radacct.findMany({
      where: { acctstoptime: null },
      orderBy: { acctstarttime: 'desc' },
      take: 500,
    });

    const usernames = activeSessions.map((s) => s.username).filter(Boolean);
    const users = await this.prisma.pppoeUser.findMany({
      where: { username: { in: usernames } },
      include: { profile: { select: { name: true } }, area: { select: { name: true } }, router: { select: { name: true } } },
    });
    const userMap = new Map(users.map((u) => [u.username, u]));

    const sessions = activeSessions.map((s) => {
      const user = userMap.get(s.username);
      return {
        uniqueId: s.radacctid,
        username: s.username,
        framedIp: s.framedipaddress,
        nasIp: s.nasipaddress,
        uptimeSec: s.acctsessiontime ? Number(s.acctsessiontime) : 0,
        uptime: formatDuration(s.acctsessiontime ? Number(s.acctsessiontime) : 0),
        download: formatBytes(Number(s.acctoutputoctets ?? 0)),
        upload: formatBytes(Number(s.acctinputoctets ?? 0)),
        customerName: user?.name || null,
        customerPhone: user?.phone || null,
        profileName: user?.profile?.name || null,
        areaName: user?.area?.name || null,
        routerName: user?.router?.name || null,
      };
    });

    const isolatedCustomers = await this.prisma.pppoeUser.findMany({
      where: { status: 'isolated' },
      include: { profile: { select: { name: true } }, area: { select: { name: true } } },
      take: 100,
    });

    return { stats, sessions, isolatedCustomers };
  }

  // ==================== OFFLINE ====================

  async getOffline(search?: string) {
    const onlineUsernames = await this.prisma.radacct.findMany({
      where: { acctstoptime: null },
      select: { username: true },
      distinct: ['username'],
    });
    const onlineSet = new Set(onlineUsernames.map((s) => s.username));

    const where: Record<string, unknown> = { status: { in: ['active', 'isolated'] } };
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { username: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const allUsers = await this.prisma.pppoeUser.findMany({
      where: where as never,
      include: { profile: { select: { name: true } }, area: { select: { name: true } }, router: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });

    const offlineUsers = allUsers.filter((u) => !onlineSet.has(u.username));
    return { users: offlineUsers, total: offlineUsers.length };
  }

  // ==================== ISOLATED ====================

  async getIsolated() {
    const isolatedUsers = await this.prisma.pppoeUser.findMany({
      where: { status: 'isolated' },
      include: { profile: { select: { name: true, price: true } }, area: { select: { name: true } } },
    });

    const usernames = isolatedUsers.map((u) => u.username);
    const onlineSessions = await this.prisma.radacct.findMany({
      where: { username: { in: usernames }, acctstoptime: null },
      select: { username: true, framedipaddress: true },
      distinct: ['username'],
    });
    const onlineMap = new Map(onlineSessions.map((s) => [s.username, s]));

    const data = [];
    let totalOnline = 0;
    let totalOffline = 0;
    let totalUnpaidAmount = 0;

    for (const user of isolatedUsers) {
      const unpaidInvoices = await this.prisma.invoice.findMany({
        where: { userId: user.id, status: { in: ['PENDING', 'OVERDUE'] } },
        orderBy: { dueDate: 'asc' },
      });
      const totalUnpaid = unpaidInvoices.reduce((sum, inv) => sum + inv.amount, 0);
      totalUnpaidAmount += totalUnpaid;

      const isOnline = onlineMap.has(user.username);
      if (isOnline) totalOnline++;
      else totalOffline++;

      data.push({
        id: user.id, username: user.username, name: user.name, phone: user.phone,
        status: user.status, profileName: user.profile?.name || null,
        profilePrice: user.profile?.price || 0,
        totalUnpaid, unpaidInvoicesCount: unpaidInvoices.length,
        isOnline, ipAddress: onlineMap.get(user.username)?.framedipaddress || null,
        areaName: user.area?.name || null, unpaidInvoices,
      });
    }

    return {
      success: true, data,
      stats: { totalIsolated: isolatedUsers.length, totalOnline, totalOffline, totalUnpaidAmount },
    };
  }

  // ==================== PROFILE ====================

  async getProfile(technicianId: string) {
    // Try adminUser first, then technician
    const adminUser = await this.prisma.adminUser.findUnique({
      where: { id: technicianId },
      select: { id: true, username: true, name: true, email: true, phone: true, createdAt: true },
    });
    if (adminUser) return { success: true, profile: adminUser };

    const technician = await this.prisma.technician.findUnique({
      where: { id: technicianId },
      select: { id: true, name: true, phoneNumber: true, email: true, createdAt: true },
    });
    if (technician) {
      return {
        success: true,
        profile: { id: technician.id, username: technician.phoneNumber, name: technician.name, email: technician.email, phone: technician.phoneNumber, createdAt: technician.createdAt },
      };
    }
    throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);
  }

  async updateProfile(technicianId: string, body: { name?: string; email?: string; phone?: string; currentPassword?: string; newPassword?: string }) {
    const adminUser = await this.prisma.adminUser.findUnique({ where: { id: technicianId } });
    if (adminUser) {
      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.email !== undefined) updateData.email = body.email;
      if (body.phone !== undefined) updateData.phone = body.phone;

      if (body.newPassword) {
        if (!body.currentPassword) throw new HttpException('Current password required', HttpStatus.BAD_REQUEST);
        const valid = await bcrypt.compare(body.currentPassword, adminUser.password);
        if (!valid) throw new HttpException('Current password incorrect', HttpStatus.BAD_REQUEST);
        updateData.password = await bcrypt.hash(body.newPassword, 10);
      }

      await this.prisma.adminUser.update({ where: { id: technicianId }, data: updateData });
      return { success: true, message: 'Profile updated successfully' };
    }

    const technician = await this.prisma.technician.findUnique({ where: { id: technicianId } });
    if (technician) {
      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.email !== undefined) updateData.email = body.email;
      if (body.phone !== undefined) updateData.phoneNumber = body.phone;
      await this.prisma.technician.update({ where: { id: technicianId }, data: updateData });
      return { success: true, message: 'Profile updated successfully' };
    }

    throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);
  }

  // ==================== TASKS (work orders assigned to technician) ====================

  async getTasks(technicianId: string, status?: string) {
    const where: Record<string, unknown> = { technicianId };
    if (status) where.status = status;
    const tasks = await this.prisma.workOrder.findMany({
      where: where as never,
      orderBy: [{ priority: 'desc' }, { scheduledDate: 'asc' }, { createdAt: 'desc' }],
    });
    return { tasks };
  }

  async updateTask(technicianId: string, body: { id: string; status?: string; technicianNotes?: string }) {
    const task = await this.prisma.workOrder.findUnique({ where: { id: body.id } });
    if (!task) throw new HttpException('Task not found', HttpStatus.NOT_FOUND);
    if (task.technicianId !== technicianId) throw new HttpException('Task not assigned to you', HttpStatus.FORBIDDEN);

    const updateData: Record<string, unknown> = {};
    if (body.status) {
      updateData.status = body.status;
      if (body.status === 'COMPLETED') updateData.completedAt = new Date();
    }
    if (body.technicianNotes !== undefined) updateData.technicianNotes = body.technicianNotes;

    const updated = await this.prisma.workOrder.update({ where: { id: body.id }, data: updateData });
    return { success: true, task: updated };
  }

  // ==================== WORK ORDERS ====================

  async getWorkOrders(technicianId: string, params: { status?: string; priority?: string; mine?: string }) {
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.priority) where.priority = params.priority;
    if (params.mine === 'true') where.technicianId = technicianId;

    const workOrders = await this.prisma.workOrder.findMany({
      where: where as never,
      include: { technician: { select: { id: true, name: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return { success: true, workOrders };
  }

  async performWorkOrderAction(technicianId: string, body: { workOrderId: string; action: string }) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id: body.workOrderId } });
    if (!wo) throw new HttpException('Work order not found', HttpStatus.NOT_FOUND);

    const action = body.action.toUpperCase();
    const updateData: Record<string, unknown> = {};

    switch (action) {
      case 'ASSIGN':
        updateData.technicianId = technicianId;
        updateData.status = 'ASSIGNED';
        updateData.assignedAt = new Date();
        break;
      case 'START':
        if (wo.technicianId !== technicianId) throw new HttpException('Work order not assigned to you', HttpStatus.FORBIDDEN);
        updateData.status = 'IN_PROGRESS';
        break;
      case 'COMPLETE':
        if (wo.technicianId !== technicianId) throw new HttpException('Work order not assigned to you', HttpStatus.FORBIDDEN);
        updateData.status = 'COMPLETED';
        updateData.completedAt = new Date();
        break;
      case 'CANCEL':
        if (wo.technicianId !== technicianId) throw new HttpException('Work order not assigned to you', HttpStatus.FORBIDDEN);
        updateData.technicianId = null;
        updateData.status = 'OPEN';
        break;
      default:
        throw new HttpException('Invalid action', HttpStatus.BAD_REQUEST);
    }

    const updated = await this.prisma.workOrder.update({ where: { id: body.workOrderId }, data: updateData });
    return { success: true, workOrder: updated };
  }

  // ==================== GENIEACS ====================

  async getGenieacsSettings() {
    const settings = await this.prisma.genieacsSettings.findFirst({ where: { isActive: true } });
    if (!settings) return { settings: null };
    return {
      settings: {
        id: settings.id, host: settings.host, isActive: settings.isActive,
        hasPassword: !!settings.password,
      },
    };
  }

  async getGenieacsDevices() {
    const settings = await this.prisma.genieacsSettings.findFirst({ where: { isActive: true } });
    if (!settings) throw new HttpException('GenieACS not configured', HttpStatus.NOT_FOUND);

    const authHeader = 'Basic ' + Buffer.from(`${settings.username}:${settings.password}`).toString('base64');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${settings.host}/devices`, {
        headers: { Authorization: authHeader },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) throw new HttpException(`GenieACS error: ${response.status}`, HttpStatus.BAD_GATEWAY);
      const rawDevices = await response.json() as any[];

      const devices = rawDevices.map((d) => {
        const params = d._params || {};
        const lastInform = d._lastInform || params['Device.ManagementServer.ConnectionRequestURL'];
        const isOnline = lastInform && (Date.now() - new Date(lastInform).getTime()) < 60 * 60 * 1000;

        return {
          _id: d._id,
          serialNumber: params['Device.DeviceInfo.SerialNumber'] || params['InternetGatewayDevice.DeviceInfo.SerialNumber'] || '',
          manufacturer: params['Device.DeviceInfo.Manufacturer'] || params['InternetGatewayDevice.DeviceInfo.Manufacturer'] || '',
          model: params['Device.DeviceInfo.ModelName'] || params['InternetGatewayDevice.DeviceInfo.ModelName'] || '',
          status: isOnline ? 'online' : 'offline',
          lastInform: lastInform || null,
          tags: d._tags || [],
        };
      });

      const online = devices.filter((d) => d.status === 'online').length;
      return {
        success: true, devices,
        count: devices.length,
        statistics: { total: devices.length, online, offline: devices.length - online },
      };
    } catch (err) {
      clearTimeout(timeout);
      throw new HttpException('Failed to connect to GenieACS', HttpStatus.BAD_GATEWAY);
    }
  }
}
