import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class VpnService {
  private readonly logger = new Logger(VpnService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== VPN SERVERS ====================

  async listServers() {
    const servers = await this.prisma.vpnServer.findMany({
      include: { _count: { select: { vpnClients: true } } },
      orderBy: { createdAt: 'desc' },
    });
    // Exclude VPS built-in servers (filter by ID prefix if needed)
    return servers.filter((s) => !s.id.startsWith('vps-builtin-'));
  }

  async createServer(body: {
    name: string; host: string; username: string; password: string;
    apiPort?: number; subnet: string; poolStart?: number; poolEnd?: number;
    gateway?: string; l2tpEnabled?: boolean; sstpEnabled?: boolean;
    pptpEnabled?: boolean; wgEnabled?: boolean; wgPublicKey?: string; wgPort?: number;
    openVpnEnabled?: boolean; openVpnPort?: number;
  }) {
    if (!body.name || !body.host || !body.username || !body.password || !body.subnet) {
      throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
    }

    return this.prisma.vpnServer.create({
      data: {
        id: crypto.randomUUID(),
        name: body.name, host: body.host, username: body.username,
        password: body.password, // Note: encryption deferred
        apiPort: body.apiPort || 8728,
        subnet: body.subnet,
        poolStart: body.poolStart || 10,
        poolEnd: body.poolEnd || 254,
        gateway: body.gateway || null,
        l2tpEnabled: body.l2tpEnabled || false,
        sstpEnabled: body.sstpEnabled || false,
        pptpEnabled: body.pptpEnabled || false,
        wgEnabled: body.wgEnabled || false,
        wgPublicKey: body.wgPublicKey || null,
        wgPort: body.wgPort || 51820,
        openVpnEnabled: body.openVpnEnabled || false,
        openVpnPort: body.openVpnPort || 1194,
      },
    });
  }

  async updateServer(id: string, body: Record<string, unknown>) {
    try {
      return await this.prisma.vpnServer.update({ where: { id }, data: body as never });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('VPN server not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteServer(id: string) {
    try {
      await this.prisma.vpnServer.delete({ where: { id } });
      return { success: true, message: 'VPN server deleted' };
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('VPN server not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  // ==================== VPN CLIENTS ====================

  async listClients() {
    const clients = await this.prisma.vpnClient.findMany({
      include: {
        vpnServer: { select: { id: true, name: true, host: true, subnet: true } },
        routers: { select: { id: true, name: true, nasname: true, secret: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Add NAS secret from router table
    const clientsWithNasSecret = clients.map((c) => ({
      ...c,
      nasSecret: c.routers[0]?.secret || null,
    }));

    const vpnServers = await this.prisma.vpnServer.findMany({ select: { id: true, name: true, subnet: true } });
    const radiusServerClient = await this.prisma.vpnClient.findFirst({ where: { isRadiusServer: true } });

    return {
      clients: clientsWithNasSecret,
      vpnServers,
      radiusServerIp: radiusServerClient?.vpnIp || null,
    };
  }

  async createClient(body: {
    name: string; description?: string; vpnServerId: string;
    vpnType?: string; customVpnIp?: string;
  }) {
    if (!body.name || !body.vpnServerId) {
      throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
    }

    const server = await this.prisma.vpnServer.findUnique({ where: { id: body.vpnServerId } });
    if (!server) throw new HttpException('VPN server not found', HttpStatus.NOT_FOUND);

    // Generate VPN IP from subnet pool
    let vpnIp = body.customVpnIp;
    if (!vpnIp) {
      const existingClients = await this.prisma.vpnClient.findMany({ where: { vpnServerId: server.id } });
      const usedIps = new Set(existingClients.map((c) => c.vpnIp));
      const subnetBase = server.subnet.split('/')[0].split('.').slice(0, 3).join('.');
      for (let i = server.poolStart; i <= server.poolEnd; i++) {
        const candidate = `${subnetBase}.${i}`;
        if (!usedIps.has(candidate)) { vpnIp = candidate; break; }
      }
      if (!vpnIp) throw new HttpException('No available IP in pool', HttpStatus.BAD_REQUEST);
    }

    // Generate credentials
    const username = `vpn_${Date.now().toString(36)}`;
    const password = crypto.randomBytes(12).toString('base64').slice(0, 16);
    const winboxPort = Math.floor(Math.random() * 10000) + 10000;
    const apiUsername = `api_${username}`;
    const apiPassword = crypto.randomBytes(12).toString('base64').slice(0, 16);

    // WireGuard keys (if WG type)
    let clientPublicKey: string | null = null;
    let clientPrivateKey: string | null = null;
    if (body.vpnType === 'WIREGUARD') {
      // WireGuard key generation deferred — requires wireguard library
      clientPublicKey = null;
      clientPrivateKey = null;
    }

    const nasSecret = crypto.randomBytes(8).toString('hex');

    // MikroTik API connection deferred — create DB record only
    const client = await this.prisma.vpnClient.create({
      data: {
        id: crypto.randomUUID(),
        name: body.name,
        vpnServerId: server.id,
        vpnIp,
        username, password,
        vpnType: body.vpnType || 'L2TP',
        description: body.description || null,
        winboxPort,
        apiUsername, apiPassword,
        clientPublicKey, clientPrivateKey,
      },
    });

    // Auto-create NAS entry for RADIUS
    const routerId = `nas_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    await this.prisma.router.create({
      data: {
        id: routerId,
        name: `NAS-${body.name}`,
        nasname: vpnIp,
        shortname: body.name,
        type: 'mikrotik',
        ipAddress: vpnIp,
        username: apiUsername,
        password: apiPassword,
        secret: nasSecret,
        ports: 1812,
        vpnClientId: client.id,
      },
    });

    return {
      client,
      credentials: {
        username, password, vpnIp, winboxPort,
        apiUsername, apiPassword,
        clientPublicKey, clientPrivateKey,
        nasSecret,
      },
      nasSetupScript: `# Add to RADIUS NAS table\n# nasname: ${vpnIp}\n# secret: ${nasSecret}\n# Note: MikroTik API connection deferred. Configure manually on CHR.`,
      note: 'MikroTik API connection deferred. DB record and NAS entry created.',
    };
  }

  async updateClientIp(id: string, vpnIp: string) {
    const client = await this.prisma.vpnClient.findUnique({ where: { id } });
    if (!client) throw new HttpException('VPN client not found', HttpStatus.NOT_FOUND);

    // Check IP uniqueness within server
    const existing = await this.prisma.vpnClient.findFirst({
      where: { vpnServerId: client.vpnServerId, vpnIp, NOT: { id } },
    });
    if (existing) throw new HttpException('IP already in use', HttpStatus.BAD_REQUEST);

    const updated = await this.prisma.vpnClient.update({ where: { id }, data: { vpnIp } });

    // Update NAS entry
    await this.prisma.router.updateMany({
      where: { vpnClientId: id },
      data: { nasname: vpnIp, ipAddress: vpnIp },
    });

    return updated;
  }
}
