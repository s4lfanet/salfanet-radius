import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// node-routeros is a CommonJS module — use require to avoid ESM issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RouterOSAPI } = require('node-routeros');

function makeRouterApi(router: { ipAddress: string; username?: string | null; password?: string | null; port: number }) {
  return new RouterOSAPI({
    host: router.ipAddress,
    port: router.port || 8728,
    user: router.username || '',
    password: router.password || '',
    timeout: 10000,
  });
}

async function withMikrotik<T>(
  router: { ipAddress: string; username?: string | null; password?: string | null; port: number },
  fn: (conn: any) => Promise<T>,
): Promise<T> {
  const conn = makeRouterApi(router);
  try {
    await conn.connect();
    const result = await fn(conn);
    return result;
  } finally {
    try { conn.close(); } catch { /* ignore */ }
  }
}

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
    const routers = await this.prisma.router.findMany({
      select: { id: true, name: true, nasname: true, ipAddress: true, username: true, password: true, port: true, isActive: true },
    });
    const results: any[] = [];
    for (const r of routers) {
      if (!r.isActive || !r.username || !r.password) {
        results.push({ ...r, online: false, identity: null, uptime: null, error: 'inactive or no credentials' });
        continue;
      }
      try {
        const identity = await withMikrotik(r, async (conn) => {
          const id = await conn.write('/system/identity/print');
          const res = await conn.write('/system/resource/print');
          return { identity: id?.[0]?.name || null, uptime: res?.[0]?.uptime || null };
        });
        results.push({ ...r, online: true, ...identity });
      } catch (err: any) {
        results.push({ ...r, online: false, identity: null, uptime: null, error: err.message });
      }
    }
    return results;
  }

  async testRouter(body: { host: string; port?: number }) {
    // Try MikroTik API first (most useful), fall back to TCP socket test
    const port = body.port || 8728;
    try {
      const conn = new RouterOSAPI({ host: body.host, port, user: 'admin', password: '', timeout: 5000 });
      await conn.connect();
      conn.close();
      return { success: true, host: body.host, port, message: 'MikroTik API port reachable' };
    } catch {
      // Fall back to raw TCP test
      try {
        const { Socket } = await import('net');
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
  }

  async testGateway(body: { host: string }) {
    // ICMP ping via child_process
    try {
      const { execSync } = await import('child_process');
      const cmd = process.platform === 'win32' ? `ping -n 4 ${body.host}` : `ping -c 4 ${body.host}`;
      const output = execSync(cmd, { timeout: 15000, encoding: 'utf8' });
      const alive = !/100% (packet )?loss/i.test(output);
      const match = output.match(/(?:min|Minimum)[^\d]*(\d+)/);
      return { success: alive, host: body.host, alive, latency: match ? parseInt(match[1]) : null, output };
    } catch (err: any) {
      return { success: false, host: body.host, error: err.message };
    }
  }

  async detectPublicIp(id: string) {
    const router = await this.prisma.router.findUnique({
      where: { id },
      select: { id: true, name: true, nasname: true, ipAddress: true, username: true, password: true, port: true },
    });
    if (!router) throw new HttpException('Router not found', HttpStatus.NOT_FOUND);
    if (!router.username || !router.password) throw new HttpException('Router has no API credentials', HttpStatus.BAD_REQUEST);

    try {
      const publicIp = await withMikrotik(router, async (conn) => {
        // Try /ip/cloud/print first (MikroTik DDNS public IP)
        try {
          const cloud = await conn.write('/ip/cloud/print');
          if (cloud?.[0]?.['public-address']) return cloud[0]['public-address'].split('/')[0];
        } catch { /* cloud not available */ }
        // Try PPPoE client interface
        try {
          const pppoe = await conn.write('/interface/pppoe-client/print');
          if (pppoe?.[0]?.['ip-address']) return pppoe[0]['ip-address'];
        } catch { /* no pppoe */ }
        // Try default route gateway
        try {
          const routes = await conn.write('/ip/route/print', ['?dst-address=0.0.0.0/0']);
          if (routes?.[0]?.['gateway-address']) return routes[0]['gateway-address'];
        } catch { /* no route */ }
        return null;
      });
      return { routerId: id, publicIp };
    } catch (err: any) {
      return { routerId: id, publicIp: null, error: err.message };
    }
  }

  async getRouterInterfaces(id: string) {
    const router = await this.prisma.router.findUnique({
      where: { id },
      select: { id: true, name: true, ipAddress: true, username: true, password: true, port: true, isActive: true },
    });
    if (!router) throw new HttpException('Router not found', HttpStatus.NOT_FOUND);
    if (!router.isActive) throw new HttpException('Router is not active', HttpStatus.BAD_REQUEST);
    if (!router.username || !router.password) throw new HttpException('Router has no API credentials', HttpStatus.BAD_REQUEST);

    try {
      const interfaces = await withMikrotik(router, async (conn) => {
        return await conn.write('/interface/print');
      });
      const result = interfaces.map((iface: any) => ({
        name: iface.name || '',
        type: iface.type || '',
        mtu: iface.mtu || iface['actual-mtu'] || '',
        macAddress: iface['mac-address'] || '',
        running: iface.running === 'true' || iface.running === true,
        disabled: iface.disabled === 'true' || iface.disabled === true,
        comment: iface.comment || '',
      }));
      const relevantTypes = ['ether', 'sfp', 'sfp-sfpplus', 'vlan', 'bridge', 'bonding', 'combo'];
      const filtered = result.filter((iface: any) =>
        relevantTypes.some((t) => iface.type.toLowerCase().includes(t)) ||
        iface.name.toLowerCase().startsWith('ether') ||
        iface.name.toLowerCase().startsWith('sfp') ||
        iface.name.toLowerCase().startsWith('combo'),
      );
      return { routerId: id, interfaces: filtered, allInterfaces: result };
    } catch (err: any) {
      throw new HttpException({ error: 'Failed to get interfaces', details: err.message }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  async getRouterUplinks(id: string) {
    const router = await this.prisma.router.findUnique({ where: { id } });
    if (!router) throw new HttpException('Router not found', HttpStatus.NOT_FOUND);
    // Uplinks are DB-stored via networkOLTRouter
    const connections = await this.prisma.networkOLTRouter.findMany({
      where: { routerId: id },
      include: { olt: true },
      orderBy: { priority: 'asc' },
    });
    return {
      routerId: id,
      uplinks: connections.map((c) => ({
        id: c.id,
        oltId: c.oltId,
        oltName: c.olt.name,
        oltIp: c.olt.ipAddress,
        oltLatitude: c.olt.latitude,
        oltLongitude: c.olt.longitude,
        uplinkPort: c.uplinkPort,
        priority: c.priority,
        isActive: c.isActive,
        createdAt: c.createdAt,
      })),
    };
  }

  async pingOlt(id: string, body: { oltIp: string }) {
    const router = await this.prisma.router.findUnique({
      where: { id },
      select: { id: true, name: true, ipAddress: true, username: true, password: true, port: true },
    });
    if (!router) throw new HttpException('Router not found', HttpStatus.NOT_FOUND);
    if (!router.username || !router.password) throw new HttpException('Router has no API credentials', HttpStatus.BAD_REQUEST);

    try {
      const result = await withMikrotik(router, async (conn) => {
        return await conn.write('/ping', [`=address=${body.oltIp}`, '=count=4']);
      });
      const alive = result.some((r: any) => r.received > 0);
      const latency = result.find((r: any) => r['time-avg'])?.['time-avg'] || null;
      return { routerId: id, oltIp: body.oltIp, alive, latency, raw: result };
    } catch (err: any) {
      return { routerId: id, oltIp: body.oltIp, alive: false, error: err.message };
    }
  }

  async setupIsolir(id: string) {
    const router = await this.prisma.router.findUnique({
      where: { id },
      include: { vpnClient: { include: { vpnServer: true } } },
    });
    if (!router) throw new HttpException('Router not found', HttpStatus.NOT_FOUND);
    if (!router.username || !router.password) throw new HttpException('Router has no API credentials', HttpStatus.BAD_REQUEST);

    // Build isolation script — RADIUS profile-based isolation via address-list
    const vpnIp = router.vpnClient?.vpnIp || router.ipAddress;
    const script = [
      '/ip firewall address-list',
      `add list=ISOLIR address=0.0.0.0/0 comment="Salfanet Isolir"`,
      '/ip firewall filter',
      `add chain=forward src-address-list=ISOLIR action=reject comment="Block isolated users"`,
    ].join('\n');

    try {
      await withMikrotik(router, async (conn) => {
        // Create address-list for isolated users if not exists
        try {
          const existing = await conn.write('/ip/firewall/address-list/print', ['?list=ISOLIR']);
          if (existing.length === 0) {
            await conn.write('/ip/firewall/address-list/add', ['=list=ISOLIR', '=address=0.0.0.0/0', '=comment=Salfanet Isolir']);
          }
        } catch { /* ignore */ }
        // Create filter rule if not exists
        try {
          const existingFilter = await conn.write('/ip/firewall/filter/print', ['?comment=Salfanet Isolir Block']);
          if (existingFilter.length === 0) {
            await conn.write('/ip/firewall/filter/add', [
              '=chain=forward', '=src-address-list=ISOLIR', '=action=reject', '=comment=Salfanet Isolir Block',
            ]);
          }
        } catch { /* ignore */ }
      });
      return { routerId: id, success: true, vpnIp, script };
    } catch (err: any) {
      return { routerId: id, success: false, error: err.message, script };
    }
  }

  async setupRadius(id: string) {
    const router = await this.prisma.router.findUnique({
      where: { id },
      include: { vpnClient: { include: { vpnServer: true } } },
    });
    if (!router) throw new HttpException('Router not found', HttpStatus.NOT_FOUND);
    if (!router.username || !router.password) throw new HttpException('Router has no API credentials', HttpStatus.BAD_REQUEST);

    const vpnIp = router.vpnClient?.vpnIp || router.ipAddress;
    // RADIUS server is typically the VPS running FreeRADIUS via VPN
    const radiusServer = router.vpnClient?.vpnServer?.host || vpnIp;
    const radiusSecret = router.secret || 'secret123';

    try {
      await withMikrotik(router, async (conn) => {
        // Add RADIUS server entry
        try {
          const existing = await conn.write('/radius/print', [`?address=${radiusServer}`]);
          if (existing.length === 0) {
            await conn.write('/radius/add', [
              `=address=${radiusServer}`,
              `=secret=${radiusSecret}`,
              '=service=ppp,login,hotspot,wireless,ipsec',
              `=authentication-port=${router.ports || 1812}`,
              `=accounting-port=${(router.ports || 1812) + 1}`,
            ]);
          }
        } catch { /* ignore */ }
        // Enable RADIUS for PPPoE
        try {
          await conn.write('/ppp/aaa/set', ['=use-radius=yes', '=accounting=yes']);
        } catch { /* ignore */ }
        // Enable RADIUS for Hotspot
        try {
          await conn.write('/ip/hotspot/profile/set', ['=use-radius=yes']);
        } catch { /* ignore */ }
      });
      return { routerId: id, success: true, radiusServer, radiusSecret };
    } catch (err: any) {
      return { routerId: id, success: false, error: err.message };
    }
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
    // VPN routing via SSH to VPS — requires sshpass or key-based auth
    // Returns current routing table from VPS
    try {
      const { execSync } = await import('child_process');
      const output = execSync('ip route show', { timeout: 10000, encoding: 'utf8' });
      const routes = output.split('\n').filter(Boolean).map((line) => {
        const parts = line.split(/\s+/);
        return { destination: parts[0], via: parts[2] || null, dev: parts[4] || null, raw: line };
      });
      return { routes };
    } catch (err: any) {
      return { routes: [], error: err.message, message: 'ip route command failed (may require VPS context)' };
    }
  }

  // ==================== VPN SERVER EXTRAS ====================

  async setupVpnServer(id: string) {
    const server = await this.prisma.vpnServer.findUnique({ where: { id } });
    if (!server) throw new HttpException('VPN server not found', HttpStatus.NOT_FOUND);
    if (!server.username || !server.password) throw new HttpException('VPN server has no API credentials', HttpStatus.BAD_REQUEST);

    const router = { ipAddress: server.host, username: server.username, password: server.password, port: server.apiPort || 8728 };
    try {
      await withMikrotik(router, async (conn) => {
        // Create IP pool
        const subnet = server.subnet || '10.0.0.0/24';
        const [network] = subnet.split('/');
        const parts = network.split('.');
        const base = `${parts[0]}.${parts[1]}.${parts[2]}`;
        try {
          await conn.write('/ip/pool/add', ['=name=vpn-pool', `=ranges=${base}.10-${base}.254`]);
        } catch { /* exists */ }
        // Create PPP profile
        try {
          await conn.write('/ppp/profile/add', [
            '=name=vpn-profile', `=local-address=${base}.1`, '=remote-address=vpn-pool',
            '=dns-server=8.8.8.8,8.8.4.4',
          ]);
        } catch { /* exists */ }
        // Enable L2TP, SSTP, PPTP servers
        await conn.write('/interface/l2tp-server/server/set', [
          '=enabled=yes', '=default-profile=vpn-profile', '=authentication=mschap2', '=use-ipsec=yes', '=ipsec-secret=salfanet-vpn-secret',
        ]);
        await conn.write('/interface/sstp-server/server/set', ['=enabled=yes', '=default-profile=vpn-profile', '=authentication=mschap2']);
        await conn.write('/interface/pptp-server/server/set', ['=enabled=yes', '=default-profile=vpn-profile', '=authentication=mschap2']);
        // NAT masquerade
        try {
          const nat = await conn.write('/ip/firewall/nat/print', ['?comment=VPN NAT']);
          if (nat.length === 0) {
            await conn.write('/ip/firewall/nat/add', ['=chain=srcnat', '=action=masquerade', '=comment=VPN NAT']);
          }
        } catch { /* ignore */ }
      });
      return { serverId: id, success: true, message: 'VPN server setup complete (L2TP/SSTP/PPTP + NAT)' };
    } catch (err: any) {
      return { serverId: id, success: false, error: err.message };
    }
  }

  async testVpnServer(id: string) {
    const server = await this.prisma.vpnServer.findUnique({ where: { id } });
    if (!server) throw new HttpException('VPN server not found', HttpStatus.NOT_FOUND);
    return this.testRouter({ host: server.host, port: server.apiPort });
  }

  async l2tpControl(id: string, body: { action: 'enable' | 'disable' }) {
    const server = await this.prisma.vpnServer.findUnique({ where: { id } });
    if (!server) throw new HttpException('VPN server not found', HttpStatus.NOT_FOUND);
    if (!server.username || !server.password) throw new HttpException('VPN server has no API credentials', HttpStatus.BAD_REQUEST);
    const router = { ipAddress: server.host, username: server.username, password: server.password, port: server.apiPort || 8728 };
    try {
      await withMikrotik(router, async (conn) => {
        await conn.write('/interface/l2tp-server/server/set', [`=enabled=${body.action === 'enable' ? 'yes' : 'no'}`]);
      });
      return { serverId: id, action: body.action, success: true };
    } catch (err: any) {
      return { serverId: id, action: body.action, success: false, error: err.message };
    }
  }

  async pptpControl(id: string, body: { action: 'enable' | 'disable' }) {
    const server = await this.prisma.vpnServer.findUnique({ where: { id } });
    if (!server) throw new HttpException('VPN server not found', HttpStatus.NOT_FOUND);
    if (!server.username || !server.password) throw new HttpException('VPN server has no API credentials', HttpStatus.BAD_REQUEST);
    const router = { ipAddress: server.host, username: server.username, password: server.password, port: server.apiPort || 8728 };
    try {
      await withMikrotik(router, async (conn) => {
        await conn.write('/interface/pptp-server/server/set', [`=enabled=${body.action === 'enable' ? 'yes' : 'no'}`]);
      });
      return { serverId: id, action: body.action, success: true };
    } catch (err: any) {
      return { serverId: id, action: body.action, success: false, error: err.message };
    }
  }

  async sstpControl(id: string, body: { action: 'enable' | 'disable' }) {
    const server = await this.prisma.vpnServer.findUnique({ where: { id } });
    if (!server) throw new HttpException('VPN server not found', HttpStatus.NOT_FOUND);
    if (!server.username || !server.password) throw new HttpException('VPN server has no API credentials', HttpStatus.BAD_REQUEST);
    const router = { ipAddress: server.host, username: server.username, password: server.password, port: server.apiPort || 8728 };
    try {
      await withMikrotik(router, async (conn) => {
        await conn.write('/interface/sstp-server/server/set', [`=enabled=${body.action === 'enable' ? 'yes' : 'no'}`]);
      });
      return { serverId: id, action: body.action, success: true };
    } catch (err: any) {
      return { serverId: id, action: body.action, success: false, error: err.message };
    }
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
