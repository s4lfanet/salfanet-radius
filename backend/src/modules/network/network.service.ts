import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { nanoid } from 'nanoid';
import * as os from 'os';

function getServerIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function getRadiusServerIp(): string {
  return process.env.RADIUS_SERVER_IP || process.env.VPS_IP || getServerIp();
}

@Injectable()
export class NetworkService {
  private readonly logger = new Logger(NetworkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  // ==================== Routers ====================

  async getRouters() {
    const radiusServerIp = getRadiusServerIp();
    const routers = await this.prisma.router.findMany({
      include: { vpnClient: { select: { id: true, name: true, vpnIp: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const vpnClients = await this.prisma.vpnClient.findMany({
      select: { id: true, name: true, vpnIp: true, isRadiusServer: true, apiUsername: true, apiPassword: true },
      orderBy: { name: 'asc' },
    });

    const clientIds = vpnClients.map((c) => c.id);
    const nasEntries = clientIds.length > 0
      ? await this.prisma.router.findMany({
          where: { vpnClientId: { in: clientIds } },
          select: { vpnClientId: true, secret: true, username: true, password: true },
        })
      : [];
    const nasMap = new Map(nasEntries.map((n: any) => [n.vpnClientId, n]));

    const vpnClientsWithSecret = vpnClients.map((c: any) => {
      const nas = nasMap.get(c.id);
      return {
        ...c,
        nasSecret: nas?.secret ?? null,
        resolvedUsername: c.apiUsername ?? nas?.username ?? null,
        resolvedPassword: c.apiPassword ?? nas?.password ?? null,
      };
    });

    const routersWithServer = routers.map((router: any) => ({
      ...router,
      radiusServerIp,
      ports: router.ports || 1812,
    }));

    return { routers: routersWithServer, vpnClients: vpnClientsWithSecret, radiusServerIp };
  }

  async createRouter(body: Record<string, unknown>, user?: { id?: string; username?: string; role?: string }) {
    const { name, ipAddress, nasIpAddress, username, password, port, apiPort, secret, latitude, longitude, vpnClientId, type } = body as any;

    if (!name || !ipAddress) throw new HttpException('Name and IP address are required', HttpStatus.BAD_REQUEST);

    const isGateway = type === 'gateway' || name.toLowerCase().includes('gateway');
    if (!isGateway && (!username || !password)) {
      throw new HttpException('Username and password are required for MikroTik routers', HttpStatus.BAD_REQUEST);
    }

    const portInt = parseInt(port) || 8728;
    const apiPortInt = parseInt(apiPort) || 8729;
    const shortname = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nasname = nasIpAddress || ipAddress;

    const existingRouter = await this.prisma.router.findFirst({
      where: { nasname, ports: 1812, secret: secret || 'secret123' },
    });
    if (existingRouter) {
      throw new HttpException(
        `Router dengan kombinasi IP, Port RADIUS, dan Secret yang sama sudah ada. Existing: ${existingRouter.name}`,
        HttpStatus.CONFLICT,
      );
    }

    // Note: MikroTik connection test is deferred to integration batch
    // (requires node-routeros which is a frontend dependency)

    const router = await this.prisma.router.create({
      data: {
        id: crypto.randomUUID(), name, nasname, shortname,
        type: type || 'mikrotik', ipAddress,
        username: username || '', password: password || '',
        port: portInt, apiPort: apiPortInt,
        secret: secret || 'secret123', ports: 1812,
        description: isGateway ? `Gateway - ${name}` : `MikroTik Router - ${name}`,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        vpnClientId: vpnClientId || null, isActive: true,
      },
    });

    // reloadFreeRadius deferred to integration batch

    await this.activityLog.logActivity({
      userId: user?.id, username: user?.username || 'Admin', userRole: user?.role,
      action: 'ADD_ROUTER', description: `Added new router: ${name}`,
      module: 'network', status: 'success',
      metadata: { routerId: router.id, routerName: name, ipAddress, nasIpAddress: nasname },
    });

    return {
      success: true, router,
      message: isGateway ? 'Gateway added successfully' : 'Router added (connection test deferred)',
    };
  }

  async updateRouter(body: Record<string, unknown>, user?: { id?: string; username?: string; role?: string }) {
    const { id, name, type, ipAddress, nasIpAddress, nasname: nasnameFromBody, username, password, port, secret, isActive, latitude, longitude, vpnClientId } = body as any;
    if (!id) throw new HttpException('Router ID is required', HttpStatus.BAD_REQUEST);

    const currentRouter = await this.prisma.router.findUnique({ where: { id } });
    if (!currentRouter) throw new HttpException('Router not found', HttpStatus.NOT_FOUND);

    const shortname = name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') : undefined;
    const nasname = nasIpAddress || nasnameFromBody || ipAddress || undefined;

    const router = await this.prisma.router.update({
      where: { id },
      data: {
        ...(name && { name }), ...(shortname && { shortname }),
        ...(type && { type }), ...(nasname && { nasname }),
        ...(ipAddress && { ipAddress }), ...(username && { username }),
        ...(password && { password }), ...(port && { port: parseInt(port.toString()) }),
        ...(secret && { secret }), ...(isActive !== undefined && { isActive }),
        ...(latitude !== undefined && { latitude: latitude ? parseFloat(latitude) : null }),
        ...(longitude !== undefined && { longitude: longitude ? parseFloat(longitude) : null }),
        ...(vpnClientId !== undefined && { vpnClientId: vpnClientId || null }),
      },
    });

    await this.activityLog.logActivity({
      userId: user?.id, username: user?.username || 'Admin', userRole: user?.role,
      action: 'UPDATE_ROUTER', description: `Updated router: ${router.name}`,
      module: 'network', status: 'success',
      metadata: { routerId: router.id, routerName: router.name },
    });

    const updatedRouter = await this.prisma.router.findUnique({
      where: { id },
      include: { vpnClient: { select: { id: true, name: true, vpnIp: true } } },
    });
    return { success: true, router: updatedRouter ?? router, vpnClientChanged: vpnClientId !== undefined };
  }

  async deleteRouter(id: string, user?: { id?: string; username?: string; role?: string }) {
    if (!id) throw new HttpException('Router ID is required', HttpStatus.BAD_REQUEST);
    const router = await this.prisma.router.findUnique({ where: { id }, select: { id: true, name: true, ipAddress: true } });
    if (!router) throw new HttpException('Router not found', HttpStatus.NOT_FOUND);

    await this.prisma.router.delete({ where: { id } });

    await this.activityLog.logActivity({
      userId: user?.id, username: user?.username || 'Admin', userRole: user?.role,
      action: 'DELETE_ROUTER', description: `Deleted router: ${router.name}`,
      module: 'network', status: 'success',
      metadata: { routerId: id, routerName: router.name },
    });

    return { success: true, message: 'Router deleted successfully' };
  }

  // ==================== OLTs ====================

  async getOlts() {
    const olts = await this.prisma.networkOLT.findMany({
      include: {
        routers: { include: { router: { select: { id: true, name: true, nasname: true, ipAddress: true } } }, orderBy: { priority: 'asc' } },
        _count: { select: { odps: true, onuStatuses: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      olts: olts.map((olt: any) => ({
        ...olt,
        uptime: Number(olt.uptime),
        _count: { ...olt._count, olt_onu_status: olt._count.onuStatuses },
        onu_stats: { online: olt.onlineOnu, offline: olt.offlineOnu, los: 0, dying_gasp: 0, unconfig: 0 },
      })),
    };
  }

  async createOlt(body: Record<string, unknown>) {
    const { name, ipAddress, latitude, longitude, status, routerIds, followRoad, vendor, model, firmwareVersion, username, password, snmpCommunity, sshEnabled, telnetEnabled, sshPort, telnetPort, snmpPort } = body as any;

    if (!name || !ipAddress || latitude === undefined || longitude === undefined) {
      throw new HttpException('Name, IP address, latitude, and longitude are required', HttpStatus.BAD_REQUEST);
    }

    const oltId = crypto.randomUUID();
    const olt = await this.prisma.networkOLT.create({
      data: {
        id: oltId, name, ipAddress,
        latitude: parseFloat(latitude), longitude: parseFloat(longitude),
        status: status || 'active', followRoad: followRoad || false,
        ...(vendor && { vendor }), ...(model && { model }),
        ...(firmwareVersion !== undefined && firmwareVersion !== '' && { firmwareVersion }),
        ...(username && { username }), ...(password && { password }),
        snmpCommunity: snmpCommunity || 'public',
        ...(sshEnabled !== undefined && { sshEnabled }), ...(telnetEnabled !== undefined && { telnetEnabled }),
        ...(sshPort !== undefined && sshPort !== '' && { sshPort: parseInt(String(sshPort)) || 22 }),
        ...(telnetPort !== undefined && telnetPort !== '' && { telnetPort: parseInt(String(telnetPort)) || 23 }),
        ...(snmpPort !== undefined && snmpPort !== '' && { snmpPort: parseInt(String(snmpPort)) || 161 }),
      },
    });

    if (routerIds && Array.isArray(routerIds) && routerIds.length > 0) {
      await this.prisma.networkOLTRouter.createMany({
        data: routerIds.map((routerId: string, index: number) => ({
          id: crypto.randomUUID(), oltId, routerId, priority: index, isActive: true,
        })),
      });
    }

    return { success: true, olt: { ...olt, uptime: Number(olt.uptime) } };
  }

  async updateOlt(body: Record<string, unknown>) {
    const { id, name, ipAddress, latitude, longitude, status, routerIds, followRoad, vendor, model, firmwareVersion, username, password, snmpCommunity, sshEnabled, telnetEnabled, sshPort, telnetPort, snmpPort } = body as any;
    if (!id) throw new HttpException('OLT ID is required', HttpStatus.BAD_REQUEST);

    const olt = await this.prisma.networkOLT.update({
      where: { id },
      data: {
        ...(name && { name }), ...(ipAddress && { ipAddress }),
        ...(latitude !== undefined && { latitude: parseFloat(latitude) }),
        ...(longitude !== undefined && { longitude: parseFloat(longitude) }),
        ...(status && { status }), ...(followRoad !== undefined && { followRoad }),
        ...(vendor !== undefined && { vendor }), ...(model !== undefined && { model }),
        ...(firmwareVersion !== undefined && { firmwareVersion: firmwareVersion || null }),
        ...(username !== undefined && { username }), ...(password !== undefined && { password }),
        ...(snmpCommunity !== undefined && { snmpCommunity }),
        ...(sshEnabled !== undefined && { sshEnabled }), ...(telnetEnabled !== undefined && { telnetEnabled }),
        ...(sshPort !== undefined && sshPort !== '' && { sshPort: parseInt(String(sshPort)) || 22 }),
        ...(telnetPort !== undefined && telnetPort !== '' && { telnetPort: parseInt(String(telnetPort)) || 23 }),
        ...(snmpPort !== undefined && snmpPort !== '' && { snmpPort: parseInt(String(snmpPort)) || 161 }),
      },
    });

    if (routerIds && Array.isArray(routerIds)) {
      await this.prisma.networkOLTRouter.deleteMany({ where: { oltId: id } });
      if (routerIds.length > 0) {
        await this.prisma.networkOLTRouter.createMany({
          data: routerIds.map((routerId: string, index: number) => ({
            id: crypto.randomUUID(), oltId: id, routerId, priority: index, isActive: true,
          })),
        });
      }
    }

    return { success: true, olt: { ...olt, uptime: Number(olt.uptime) } };
  }

  async deleteOlt(id: string) {
    if (!id) throw new HttpException('OLT ID is required', HttpStatus.BAD_REQUEST);
    // Unlink network_otbs records (no onDelete cascade)
    await (this.prisma as any).network_otbs.updateMany({ where: { oltId: id }, data: { oltId: null } });
    await this.prisma.networkOLT.delete({ where: { id } });
    return { success: true, message: 'OLT deleted successfully' };
  }

  // ==================== ODPs ====================

  async getOdps() {
    const odps = await this.prisma.networkODP.findMany({
      include: {
        olt: { select: { name: true, ipAddress: true } },
        odc: { select: { name: true } },
        parentOdp: { select: { name: true } },
        _count: { select: { childOdps: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, odps };
  }

  async createOdp(body: Record<string, unknown>) {
    const { name, latitude, longitude, odcId, parentOdpId, ponPort, oltId, portCount, followRoad } = body as any;
    if (!name || !latitude || !longitude || !ponPort || !oltId) {
      throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
    }
    if (!odcId && !parentOdpId) {
      throw new HttpException('Either odcId or parentOdpId is required', HttpStatus.BAD_REQUEST);
    }

    const odp = await this.prisma.networkODP.create({
      data: {
        id: nanoid(), name,
        latitude: parseFloat(latitude), longitude: parseFloat(longitude),
        oltId, ponPort: parseInt(ponPort),
        portCount: portCount ? parseInt(portCount) : 8,
        odcId: odcId || null, parentOdpId: parentOdpId || null,
        followRoad: followRoad || false, status: 'active',
      },
      include: { olt: true, odc: true, parentOdp: true },
    });
    return { success: true, odp };
  }

  async updateOdp(body: Record<string, unknown>) {
    const { id, name, latitude, longitude, odcId, parentOdpId, ponPort, oltId, portCount, followRoad, status } = body as any;
    if (!id) throw new HttpException('ODP ID is required', HttpStatus.BAD_REQUEST);

    const existingOdp = await this.prisma.networkODP.findUnique({ where: { id } });
    if (!existingOdp) throw new HttpException('ODP not found', HttpStatus.NOT_FOUND);

    const odp = await this.prisma.networkODP.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(latitude && { latitude: parseFloat(latitude) }),
        ...(longitude && { longitude: parseFloat(longitude) }),
        ...(oltId && { oltId }), ...(ponPort !== undefined && { ponPort: parseInt(ponPort) }),
        ...(portCount !== undefined && { portCount: parseInt(portCount) }),
        ...(odcId !== undefined && { odcId: odcId || null }),
        ...(parentOdpId !== undefined && { parentOdpId: parentOdpId || null }),
        ...(followRoad !== undefined && { followRoad }), ...(status && { status }),
      },
      include: { olt: true, odc: true, parentOdp: true },
    });
    return { success: true, odp };
  }

  async deleteOdp(id: string) {
    if (!id) throw new HttpException('ODP ID is required', HttpStatus.BAD_REQUEST);
    const existingOdp = await this.prisma.networkODP.findUnique({
      where: { id },
      include: { _count: { select: { childOdps: true } } },
    });
    if (!existingOdp) throw new HttpException('ODP not found', HttpStatus.NOT_FOUND);
    if (existingOdp._count.childOdps > 0) {
      throw new HttpException(`Cannot delete ODP with ${existingOdp._count.childOdps} child ODP(s)`, HttpStatus.BAD_REQUEST);
    }
    await this.prisma.networkODP.delete({ where: { id } });
    return { success: true, message: 'ODP deleted successfully' };
  }

  // ==================== ODCs ====================

  async getOdcs() {
    const odcs = await this.prisma.networkODC.findMany({
      include: {
        olt: { select: { id: true, name: true, ipAddress: true } },
        _count: { select: { odps: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, odcs };
  }

  async createOdc(body: Record<string, unknown>) {
    const { name, latitude, longitude, oltId, ponPort, portCount, followRoad } = body as any;
    if (!name || !latitude || !longitude || !oltId || ponPort === undefined) {
      throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
    }
    const olt = await this.prisma.networkOLT.findUnique({ where: { id: oltId } });
    if (!olt) throw new HttpException('OLT not found', HttpStatus.NOT_FOUND);

    const odc = await this.prisma.networkODC.create({
      data: {
        id: nanoid(), name,
        latitude: parseFloat(latitude), longitude: parseFloat(longitude),
        oltId, ponPort: parseInt(ponPort),
        portCount: portCount ? parseInt(portCount) : 8,
        followRoad: followRoad || false, status: 'active',
      },
      include: { olt: { select: { id: true, name: true, ipAddress: true } } },
    });
    return { success: true, odc };
  }

  async updateOdc(body: Record<string, unknown>) {
    const { id, name, latitude, longitude, oltId, ponPort, portCount, followRoad, status } = body as any;
    if (!id) throw new HttpException('ODC ID is required', HttpStatus.BAD_REQUEST);
    const existing = await this.prisma.networkODC.findUnique({ where: { id } });
    if (!existing) throw new HttpException('ODC not found', HttpStatus.NOT_FOUND);

    const odc = await this.prisma.networkODC.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(latitude && { latitude: parseFloat(latitude) }),
        ...(longitude && { longitude: parseFloat(longitude) }),
        ...(oltId && { oltId }), ...(ponPort !== undefined && { ponPort: parseInt(ponPort) }),
        ...(portCount !== undefined && { portCount: parseInt(portCount) }),
        ...(followRoad !== undefined && { followRoad }), ...(status && { status }),
      },
      include: { olt: { select: { id: true, name: true, ipAddress: true } } },
    });
    return { success: true, odc };
  }

  async deleteOdc(id: string) {
    if (!id) throw new HttpException('ODC ID is required', HttpStatus.BAD_REQUEST);
    const existing = await this.prisma.networkODC.findUnique({
      where: { id },
      include: { _count: { select: { odps: true } } },
    });
    if (!existing) throw new HttpException('ODC not found', HttpStatus.NOT_FOUND);
    if (existing._count.odps > 0) {
      throw new HttpException(`Cannot delete ODC with ${existing._count.odps} connected ODP(s)`, HttpStatus.BAD_REQUEST);
    }
    await this.prisma.networkODC.delete({ where: { id } });
    return { success: true, message: 'ODC deleted successfully' };
  }

  // ==================== OTBs ====================

  async getOtbs(params: { page?: number; limit?: number; search?: string; status?: string; oltId?: string; sortBy?: string; sortOrder?: string }) {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const skip = (page - 1) * limit;
    const sortBy = params.sortBy || 'createdAt';
    const sortOrder = params.sortOrder || 'desc';

    const where: Record<string, unknown> = {};
    if (params.search) {
      where.OR = [
        { name: { contains: params.search } },
        { code: { contains: params.search } },
        { address: { contains: params.search } },
      ];
    }
    if (params.status) where.status = params.status;
    if (params.oltId) where.oltId = params.oltId;

    const [otbs, total] = await Promise.all([
      (this.prisma as any).network_otbs.findMany({
        where, skip, take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          olt: { select: { id: true, name: true, ipAddress: true } },
          odcs: { select: { id: true, name: true, portCount: true } },
        },
      }),
      (this.prisma as any).network_otbs.count({ where }),
    ]);

    return {
      otbs,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async createOtb(body: Record<string, unknown>) {
    const { name, code, latitude, longitude, address, oltId, portCount, cableType, feederCable, hasSplitter, splitterRatio, coverageRadiusKm, installDate, status, notes, metadata, incomingCableId, spliceTrayCount, totalSpliceCapacity } = body as any;

    if (!name || !code || !latitude || !longitude) {
      throw new HttpException('Name, code, latitude, and longitude are required', HttpStatus.BAD_REQUEST);
    }

    const existing = await (this.prisma as any).network_otbs.findUnique({ where: { code } });
    if (existing) throw new HttpException('OTB code already exists', HttpStatus.CONFLICT);

    let resolvedPortCount = portCount;
    if (incomingCableId) {
      const cable = await (this.prisma as any).fiber_cables.findUnique({
        where: { id: incomingCableId },
        select: { id: true, totalCores: true },
      });
      if (!cable) throw new HttpException(`Feeder cable '${incomingCableId}' not found`, HttpStatus.BAD_REQUEST);
      if (!portCount && cable.totalCores) resolvedPortCount = cable.totalCores;
    }

    const finalPortCount: number = resolvedPortCount || 24;

    const otb = await (this.prisma as any).network_otbs.create({
      data: {
        id: nanoid(), name, code,
        latitude: parseFloat(latitude), longitude: parseFloat(longitude),
        address,
        ...(oltId ? { olt: { connect: { id: oltId } } } : {}),
        portCount: finalPortCount, usedPorts: 0,
        cableType, feederCable, hasSplitter: hasSplitter ?? true,
        splitterRatio, coverageRadiusKm: parseFloat(coverageRadiusKm || 3.0),
        installDate: installDate ? new Date(installDate) : null,
        status: status || 'ACTIVE', notes, metadata,
        incomingCableId: incomingCableId || null,
        spliceTrayCount: parseInt(spliceTrayCount?.toString() || '1'),
        totalSpliceCapacity: parseInt(totalSpliceCapacity?.toString() || '24'),
      },
      include: { olt: { select: { id: true, name: true, ipAddress: true } } },
    });

    // Auto-sync to network_nodes
    try {
      const nodeStatus = (otb.status || 'active').toLowerCase() as any;
      await (this.prisma as any).network_nodes.upsert({
        where: { code: otb.code },
        create: {
          id: otb.id, type: 'OTB', code: otb.code, name: otb.name,
          latitude: otb.latitude, longitude: otb.longitude,
          address: otb.address ?? undefined, status: nodeStatus,
          upstreamId: otb.oltId ?? undefined, metadata: otb.metadata ?? undefined,
        },
        update: {
          name: otb.name, latitude: otb.latitude, longitude: otb.longitude,
          address: otb.address ?? undefined, status: nodeStatus,
          upstreamId: otb.oltId ?? undefined,
        },
      });
    } catch (syncError: any) {
      this.logger.error('Failed to sync OTB to network_nodes:', syncError.message);
    }

    return otb;
  }

  // ==================== Nodes ====================

  async getNodes(params: { type?: string; status?: string; page?: number; limit?: number; search?: string }) {
    const page = params.page || 1;
    const limit = params.limit || 100;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (params.type) where.type = params.type;
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { code: { contains: params.search } },
        { name: { contains: params.search } },
        { address: { contains: params.search } },
      ];
    }

    const [nodes, total] = await Promise.all([
      (this.prisma as any).network_nodes.findMany({
        where, skip, take: limit,
        orderBy: [{ type: 'asc' }, { code: 'asc' }],
      }),
      (this.prisma as any).network_nodes.count({ where }),
    ]);

    return {
      success: true,
      data: nodes.map((node: any) => ({
        id: node.id, type: node.type, code: node.code, name: node.name,
        latitude: node.latitude, longitude: node.longitude,
        address: node.address, status: node.status,
        upstreamId: node.upstreamId, metadata: node.metadata,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ==================== Servers ====================

  async getServers() {
    const servers = await this.prisma.networkServer.findMany({
      include: { router: { select: { name: true, nasname: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, servers };
  }

  async createServer(body: Record<string, unknown>) {
    const { name, ipAddress, latitude, longitude, status, routerId } = body as any;
    if (!name || !ipAddress || latitude === undefined || longitude === undefined) {
      throw new HttpException('Name, IP address, latitude, and longitude are required', HttpStatus.BAD_REQUEST);
    }
    const server = await this.prisma.networkServer.create({
      data: {
        id: crypto.randomUUID(), name, ipAddress,
        latitude: parseFloat(latitude), longitude: parseFloat(longitude),
        status: status || 'active', routerId: routerId || null,
      },
    });
    return { success: true, server };
  }

  async updateServer(body: Record<string, unknown>) {
    const { id, name, ipAddress, latitude, longitude, status, routerId } = body as any;
    if (!id) throw new HttpException('Server ID is required', HttpStatus.BAD_REQUEST);
    const server = await this.prisma.networkServer.update({
      where: { id },
      data: {
        ...(name && { name }), ...(ipAddress && { ipAddress }),
        ...(latitude !== undefined && { latitude: parseFloat(latitude) }),
        ...(longitude !== undefined && { longitude: parseFloat(longitude) }),
        ...(status && { status }), ...(routerId !== undefined && { routerId: routerId || null }),
      },
    });
    return { success: true, server };
  }

  async deleteServer(id: string) {
    if (!id) throw new HttpException('Server ID is required', HttpStatus.BAD_REQUEST);
    await this.prisma.networkServer.delete({ where: { id } });
    return { success: true, message: 'Server deleted successfully' };
  }
}
