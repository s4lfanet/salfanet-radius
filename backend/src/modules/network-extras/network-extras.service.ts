import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NetworkExtrasService {
  private readonly logger = new Logger(NetworkExtrasService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== ROUTERS ====================

  async listRouters(params: { search?: string; isActive?: boolean }) {
    const where: Record<string, unknown> = {};
    if (params.isActive !== undefined) where.isActive = params.isActive;
    if (params.search) {
      where.OR = [
        { name: { contains: params.search } },
        { nasname: { contains: params.search } },
        { shortname: { contains: params.search } },
      ];
    }
    return this.prisma.router.findMany({
      where: where as never,
      include: {
        _count: { select: { users: true, vouchers: true } },
        vpnClient: { select: { id: true, name: true, vpnIp: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRouter(id: string) {
    const router = await this.prisma.router.findUnique({
      where: { id },
      include: { _count: { select: { users: true, vouchers: true, agents: true } }, vpnClient: true },
    });
    if (!router) throw new HttpException('Router not found', HttpStatus.NOT_FOUND);
    return router;
  }

  async createRouter(body: Record<string, unknown>) {
    const id = `router_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return this.prisma.router.create({ data: { id, ...body } as never });
  }

  async updateRouter(id: string, body: Record<string, unknown>) {
    try {
      return await this.prisma.router.update({ where: { id }, data: body as never });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Router not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteRouter(id: string) {
    try {
      await this.prisma.router.delete({ where: { id } });
      return { success: true };
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Router not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async getRouterStatus() {
    const routers = await this.prisma.router.findMany({ select: { id: true, name: true, nasname: true, isActive: true } });
    // TCP ping deferred
    return routers.map((r) => ({ ...r, online: r.isActive, latency: null }));
  }

  async testRouter(body: { host: string; port?: number }) {
    try {
      const { Socket } = await import('net');
      const port = body.port || 8728;
      return new Promise((resolve) => {
        const socket = new Socket();
        socket.setTimeout(5000);
        socket.on('connect', () => { socket.destroy(); resolve({ success: true, host: body.host, port, latency: 0 }); });
        socket.on('timeout', () => { socket.destroy(); resolve({ success: false, host: body.host, port, error: 'Timeout' }); });
        socket.on('error', (err) => { resolve({ success: false, host: body.host, port, error: err.message }); });
        socket.connect(port, body.host);
      });
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async testGateway(body: { host: string }) {
    // Gateway test deferred — would use MikroTik API
    return { success: true, host: body.host, message: 'Gateway test deferred to MikroTik API integration' };
  }

  async detectPublicIp(id: string) {
    const router = await this.prisma.router.findUnique({ where: { id }, select: { id: true, name: true, nasname: true } });
    if (!router) throw new HttpException('Router not found', HttpStatus.NOT_FOUND);
    // MikroTik API call deferred
    return { routerId: id, publicIp: null, message: 'Public IP detection deferred to MikroTik API integration' };
  }

  async getRouterInterfaces(id: string) {
    const router = await this.prisma.router.findUnique({ where: { id } });
    if (!router) throw new HttpException('Router not found', HttpStatus.NOT_FOUND);
    // MikroTik API call deferred
    return { routerId: id, interfaces: [], message: 'Interface list deferred to MikroTik API integration' };
  }

  async getRouterUplinks(id: string) {
    const router = await this.prisma.router.findUnique({ where: { id } });
    if (!router) throw new HttpException('Router not found', HttpStatus.NOT_FOUND);
    return { routerId: id, uplinks: [], message: 'Uplink info deferred to MikroTik API integration' };
  }

  async pingOlt(id: string, body: { oltIp: string }) {
    const router = await this.prisma.router.findUnique({ where: { id } });
    if (!router) throw new HttpException('Router not found', HttpStatus.NOT_FOUND);
    // MikroTik ping deferred
    return { routerId: id, oltIp: body.oltIp, alive: null, message: 'Ping deferred to MikroTik API integration' };
  }

  async setupIsolir(id: string) {
    const router = await this.prisma.router.findUnique({ where: { id } });
    if (!router) throw new HttpException('Router not found', HttpStatus.NOT_FOUND);
    // MikroTik isolation setup deferred
    return { routerId: id, success: true, message: 'Isolation setup deferred to MikroTik API integration' };
  }

  async setupRadius(id: string) {
    const router = await this.prisma.router.findUnique({ where: { id } });
    if (!router) throw new HttpException('Router not found', HttpStatus.NOT_FOUND);
    // MikroTik RADIUS setup deferred
    return { routerId: id, success: true, message: 'RADIUS setup deferred to MikroTik API integration' };
  }

  // ==================== NETWORK NODES ====================

  async listNodes(params: { type?: string; status?: string; search?: string }) {
    const where: Record<string, unknown> = {};
    if (params.type) where.type = params.type;
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [{ code: { contains: params.search } }, { name: { contains: params.search } }];
    }
    return this.prisma.network_nodes.findMany({ where: where as never, orderBy: { createdAt: 'desc' } });
  }

  async getNode(id: string) {
    const node = await this.prisma.network_nodes.findUnique({ where: { id } });
    if (!node) throw new HttpException('Node not found', HttpStatus.NOT_FOUND);
    return node;
  }

  async createNode(body: Record<string, unknown>) {
    return this.prisma.network_nodes.create({ data: body as never });
  }

  async updateNode(id: string, body: Record<string, unknown>) {
    try {
      return await this.prisma.network_nodes.update({ where: { id }, data: body as never });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Node not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteNode(id: string) {
    try {
      await this.prisma.network_nodes.delete({ where: { id } });
      return { success: true };
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Node not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  // ==================== ODCs ====================

  async listOdcs(params: { oltId?: string; search?: string }) {
    const where: Record<string, unknown> = {};
    if (params.oltId) where.oltId = params.oltId;
    if (params.search) where.name = { contains: params.search };
    return this.prisma.networkODC.findMany({
      where: where as never,
      include: { olt: { select: { id: true, name: true } }, _count: { select: { odps: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOdc(body: Record<string, unknown>) {
    const id = `odc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return this.prisma.networkODC.create({ data: { id, ...body } as never });
  }

  // ==================== ODPs ====================

  async listOdps(params: { oltId?: string; odcId?: string; search?: string }) {
    const where: Record<string, unknown> = {};
    if (params.oltId) where.oltId = params.oltId;
    if (params.odcId) where.odcId = params.odcId;
    if (params.search) where.name = { contains: params.search };
    return this.prisma.networkODP.findMany({
      where: where as never,
      include: {
        olt: { select: { id: true, name: true } },
        odc: { select: { id: true, name: true } },
        _count: { select: { customers: true, childOdps: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOdp(body: Record<string, unknown>) {
    const id = `odp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return this.prisma.networkODP.create({ data: { id, ...body } as never });
  }

  // ==================== OTBs ====================

  async listOtbs(params: { oltId?: string; search?: string }) {
    const where: Record<string, unknown> = {};
    if (params.oltId) where.oltId = params.oltId;
    if (params.search) where.OR = [{ name: { contains: params.search } }, { code: { contains: params.search } }];
    return this.prisma.network_otbs.findMany({
      where: where as never,
      include: { olt: { select: { id: true, name: true } }, _count: { select: { odcs: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOtb(id: string) {
    const otb = await this.prisma.network_otbs.findUnique({ where: { id } });
    if (!otb) throw new HttpException('OTB not found', HttpStatus.NOT_FOUND);
    return otb;
  }

  async createOtb(body: Record<string, unknown>) {
    const id = `otb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return this.prisma.network_otbs.create({ data: { id, ...body } as never });
  }

  async updateOtb(id: string, body: Record<string, unknown>) {
    try {
      return await this.prisma.network_otbs.update({ where: { id }, data: body as never });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('OTB not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteOtb(id: string) {
    try {
      await this.prisma.network_otbs.delete({ where: { id } });
      return { success: true };
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('OTB not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async getOtbStats() {
    const [total, active, byOlt] = await Promise.all([
      this.prisma.network_otbs.count(),
      this.prisma.network_otbs.count({ where: { status: 'ACTIVE' } }),
      this.prisma.network_otbs.groupBy({ by: ['oltId'], _count: true }),
    ]);
    return { total, active, byOlt };
  }

  async getOtbFeederCables(id: string) {
    const otb = await this.prisma.network_otbs.findUnique({ where: { id } });
    if (!otb) throw new HttpException('OTB not found', HttpStatus.NOT_FOUND);
    // Feeder cables lookup deferred
    return { otbId: id, feederCables: [] };
  }

  async getOtbSegments(id: string) {
    const otb = await this.prisma.network_otbs.findUnique({ where: { id } });
    if (!otb) throw new HttpException('OTB not found', HttpStatus.NOT_FOUND);
    const segments = await this.prisma.cable_segments.findMany({
      where: { OR: [{ fromDeviceType: 'OTB', fromDeviceId: id }, { toDeviceType: 'OTB', toDeviceId: id }] },
    });
    return segments;
  }

  // ==================== NETWORK SERVERS ====================

  async listServers() {
    return this.prisma.networkServer.findMany({
      include: { router: { select: { id: true, name: true, nasname: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createServer(body: Record<string, unknown>) {
    const id = `srv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return this.prisma.networkServer.create({ data: { id, ...body } as never });
  }

  // ==================== CONNECTIONS ====================

  async listConnections() {
    // Connections derived from cable_segments
    return this.prisma.cable_segments.findMany({
      include: { cable: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==================== CORES ====================

  async listCores(params: { cableId?: string; tubeId?: string; status?: string; assignedToType?: string }) {
    const where: Record<string, unknown> = {};
    if (params.tubeId) where.tubeId = params.tubeId;
    if (params.status) where.status = params.status;
    if (params.assignedToType) where.assignedToType = params.assignedToType;
    if (params.cableId) where.tube = { cableId: params.cableId };
    return this.prisma.fiber_cores.findMany({
      where: where as never,
      include: { tube: { include: { cable: { select: { id: true, code: true, name: true } } } } },
      orderBy: [{ tubeId: 'asc' }, { coreNumber: 'asc' }],
      take: 500,
    });
  }

  // ==================== OLTs (network/olts) ====================

  async listOlts() {
    return this.prisma.networkOLT.findMany({
      select: { id: true, name: true, ipAddress: true, status: true, vendor: true, model: true, isOnline: true, lastPollAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOltsStatus() {
    const olts = await this.prisma.networkOLT.findMany({
      select: { id: true, name: true, ipAddress: true, isOnline: true, lastPollAt: true, status: true },
    });
    return {
      total: olts.length,
      online: olts.filter((o) => o.isOnline).length,
      offline: olts.filter((o) => !o.isOnline).length,
      olts,
    };
  }

  async importOlts(body: { olts: Array<Record<string, unknown>> }) {
    let imported = 0;
    const errors: string[] = [];
    for (const item of body.olts) {
      try {
        const id = `olt_imp_${Date.now()}_${imported}_${Math.random().toString(36).slice(2, 6)}`;
        await this.prisma.networkOLT.create({ data: { id, ...item } as never });
        imported++;
      } catch (err: any) {
        errors.push(`${item.name || 'unknown'}: ${err.message}`);
      }
    }
    return { imported, errors: errors.slice(0, 20) };
  }

  async getOltsTemplate() {
    return {
      headers: ['name', 'ipAddress', 'vendor', 'model', 'status', 'latitude', 'longitude'],
      sample: [{ name: 'OLT-001', ipAddress: '192.168.1.1', vendor: 'zte', model: 'C320', status: 'active', latitude: -7.07, longitude: 108.04 }],
    };
  }

  // ==================== OLTs (network/olts) — joint closures import/template ====================

  async importJointClosures(body: { items: Array<Record<string, unknown>> }) {
    let imported = 0;
    const errors: string[] = [];
    for (const item of body.items) {
      try {
        const id = `jc_imp_${Date.now()}_${imported}_${Math.random().toString(36).slice(2, 6)}`;
        await this.prisma.network_joint_closures.create({ data: { id, ...item } as never });
        imported++;
      } catch (err: any) {
        errors.push(`${item.name || 'unknown'}: ${err.message}`);
      }
    }
    return { imported, errors: errors.slice(0, 20) };
  }

  async getJointClosuresTemplate() {
    return {
      headers: ['name', 'code', 'type', 'latitude', 'longitude', 'cableType', 'fiberCount', 'closureType'],
      sample: [{ name: 'JC-001', code: 'JC001', type: 'straight', latitude: -7.07, longitude: 108.04, cableType: 'SM_G652', fiberCount: 24, closureType: 'STRAIGHT' }],
    };
  }

  // ==================== ODP CUSTOMER ASSIGN ====================

  async assignOdpCustomer(body: { odpId: string; customerId: string; portNumber: number; distance?: number; notes?: string }) {
    const odp = await this.prisma.networkODP.findUnique({ where: { id: body.odpId } });
    if (!odp) throw new HttpException('ODP not found', HttpStatus.NOT_FOUND);
    const customer = await this.prisma.pppoeUser.findUnique({ where: { id: body.customerId } });
    if (!customer) throw new HttpException('Customer not found', HttpStatus.NOT_FOUND);

    // Check if port is available
    const existing = await this.prisma.odpCustomerAssignment.findUnique({
      where: { odpId_portNumber: { odpId: body.odpId, portNumber: body.portNumber } },
    });
    if (existing) throw new HttpException('Port already assigned', HttpStatus.BAD_REQUEST);

    // Check if customer already assigned
    const existingCustomer = await this.prisma.odpCustomerAssignment.findUnique({
      where: { customerId: body.customerId },
    });
    if (existingCustomer) throw new HttpException('Customer already assigned to another ODP', HttpStatus.BAD_REQUEST);

    return this.prisma.odpCustomerAssignment.create({
      data: {
        id: `assign_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        odpId: body.odpId, customerId: body.customerId,
        portNumber: body.portNumber, distance: body.distance || null, notes: body.notes || null,
      },
    });
  }

  // ==================== VPN ROUTING ====================

  async getVpnRouting() {
    // VPN routing info deferred
    return { routes: [], message: 'VPN routing info deferred to MikroTik API integration' };
  }

  // ==================== VPN SERVER EXTRAS ====================

  async setupVpnServer(id: string) {
    const server = await this.prisma.vpnServer.findUnique({ where: { id } });
    if (!server) throw new HttpException('VPN server not found', HttpStatus.NOT_FOUND);
    return { serverId: id, success: true, message: 'VPN server setup deferred to MikroTik API integration' };
  }

  async testVpnServer(id: string) {
    const server = await this.prisma.vpnServer.findUnique({ where: { id } });
    if (!server) throw new HttpException('VPN server not found', HttpStatus.NOT_FOUND);
    return this.testRouter({ host: server.host, port: server.apiPort });
  }

  async l2tpControl(id: string, body: { action: 'enable' | 'disable' }) {
    const server = await this.prisma.vpnServer.findUnique({ where: { id } });
    if (!server) throw new HttpException('VPN server not found', HttpStatus.NOT_FOUND);
    return { serverId: id, action: body.action, success: true, message: 'L2TP control deferred to MikroTik API integration' };
  }

  async pptpControl(id: string, body: { action: 'enable' | 'disable' }) {
    const server = await this.prisma.vpnServer.findUnique({ where: { id } });
    if (!server) throw new HttpException('VPN server not found', HttpStatus.NOT_FOUND);
    return { serverId: id, action: body.action, success: true, message: 'PPTP control deferred to MikroTik API integration' };
  }

  async sstpControl(id: string, body: { action: 'enable' | 'disable' }) {
    const server = await this.prisma.vpnServer.findUnique({ where: { id } });
    if (!server) throw new HttpException('VPN server not found', HttpStatus.NOT_FOUND);
    return { serverId: id, action: body.action, success: true, message: 'SSTP control deferred to MikroTik API integration' };
  }

  // ==================== VPS INFO ====================

  async getVpsInfo() {
    return {
      hostname: require('os').hostname(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpus: require('os').cpus().length,
    };
  }

  async getVpsL2tpInfo() {
    // L2TP info deferred — would read from system config
    return { enabled: false, message: 'VPS L2TP info deferred to system integration' };
  }

  async getVpsL2tpPeer() {
    return { peers: [], message: 'VPS L2TP peers deferred to system integration' };
  }

  async getVpsWgPeer() {
    return { peers: [], message: 'VPS WireGuard peers deferred to system integration' };
  }
}
