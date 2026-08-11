import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// node-routeros is a CommonJS module — use require to avoid ESM issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RouterOSAPI } = require('node-routeros');

function parseUptime(uptime: string): number {
  let seconds = 0;
  const weeks = uptime.match(/(\d+)w/);
  const days = uptime.match(/(\d+)d/);
  const hours = uptime.match(/(\d+)h/);
  const minutes = uptime.match(/(\d+)m/);
  const secs = uptime.match(/(\d+)s/);
  if (weeks) seconds += parseInt(weeks[1]) * 7 * 24 * 3600;
  if (days) seconds += parseInt(days[1]) * 24 * 3600;
  if (hours) seconds += parseInt(hours[1]) * 3600;
  if (minutes) seconds += parseInt(minutes[1]) * 60;
  if (secs) seconds += parseInt(secs[1]);
  return seconds;
}

function makeApi(router: { ipAddress?: string | null; nasname: string; port?: number | null; username: string; password: string }) {
  return new RouterOSAPI({
    host: router.ipAddress || router.nasname,
    port: router.port || 8728,
    user: router.username,
    password: router.password,
    timeout: 10000,
  });
}

@Injectable()
export class MikrotikService {
  private readonly logger = new Logger(MikrotikService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Test connection to a MikroTik router — ported from /api/network/routers POST/PUT.
   */
  async testConnection(params: { host: string; user: string; password: string; port?: number }): Promise<{ success: boolean; identity?: string; error?: string }> {
    try {
      const conn = new RouterOSAPI({
        host: params.host,
        user: params.user,
        password: params.password,
        port: params.port || 8728,
        timeout: 5000,
        tls: false,
      });
      await conn.connect();
      const identity = await conn.write('/system/identity/print');
      conn.close();
      return { success: true, identity: identity?.[0]?.name };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get live hotspot sessions from MikroTik API — ported from /api/sessions/realtime.
   */
  async getHotspotSessions(routerId?: string): Promise<{ sessions: any[]; errors: string[] }> {
    const routerWhere: Record<string, unknown> = { isActive: true };
    if (routerId) routerWhere.id = routerId;

    const routers = await this.prisma.router.findMany({
      where: routerWhere as never,
      select: { id: true, name: true, nasname: true, ipAddress: true, username: true, password: true, port: true },
    });

    const allSessions: any[] = [];
    const errors: string[] = [];

    for (const router of routers) {
      if (!router.username || !router.password) continue;
      try {
        const api = makeApi(router as never);
        await api.connect();
        const activeUsers = await api.write('/ip/hotspot/active/print');
        await api.close();

        for (const user of activeUsers) {
          allSessions.push({
            routerId: router.id,
            routerName: router.name,
            type: 'hotspot',
            username: user.user || user.username || '',
            macAddress: user['mac-address'] || '',
            ipAddress: user.address || '',
            uptime: user.uptime || '0s',
            uptimeSeconds: parseUptime(user.uptime || '0s'),
            uploadBytes: parseInt(user['bytes-in'] || '0'),
            downloadBytes: parseInt(user['bytes-out'] || '0'),
            packetsIn: parseInt(user['packets-in'] || '0'),
            packetsOut: parseInt(user['packets-out'] || '0'),
            server: user.server || '',
            sessionId: user['session-id'] || '',
          });
        }
      } catch (error: any) {
        errors.push(`${router.name}: ${error.message}`);
        this.logger.error(`[realtime] Hotspot fetch failed for ${router.name}:`, error.message);
      }
    }

    return { sessions: allSessions, errors };
  }

  /**
   * Get live PPPoE sessions from MikroTik API.
   */
  async getPppoeSessions(routerId?: string): Promise<{ sessions: any[]; errors: string[] }> {
    const routerWhere: Record<string, unknown> = { isActive: true };
    if (routerId) routerWhere.id = routerId;

    const routers = await this.prisma.router.findMany({
      where: routerWhere as never,
      select: { id: true, name: true, nasname: true, ipAddress: true, username: true, password: true, port: true },
    });

    const allSessions: any[] = [];
    const errors: string[] = [];

    for (const router of routers) {
      if (!router.username || !router.password) continue;
      try {
        const api = makeApi(router as never);
        await api.connect();
        const activeUsers = await api.write('/ppp/active/print');
        await api.close();

        for (const user of activeUsers) {
          allSessions.push({
            routerId: router.id,
            routerName: router.name,
            type: 'pppoe',
            username: user.name || '',
            service: user.service || 'pppoe',
            macAddress: user['caller-id'] || '',
            ipAddress: user.address || '',
            uptime: user.uptime || '0s',
            uptimeSeconds: parseUptime(user.uptime || '0s'),
            encoding: user.encoding || '',
            sessionId: user['session-id'] || '',
          });
        }
      } catch (error: any) {
        errors.push(`${router.name}: ${error.message}`);
        this.logger.error(`[realtime] PPPoE fetch failed for ${router.name}:`, error.message);
      }
    }

    return { sessions: allSessions, errors };
  }

  /**
   * Get live traffic for specific hotspot usernames — ported from fetchLiveHotspotTrafficMap.
   */
  async getLiveHotspotTraffic(routerId: string, usernames: Set<string>): Promise<Map<string, any>> {
    const result = new Map<string, any>();
    if (usernames.size === 0) return result;

    const router = await this.prisma.router.findUnique({
      where: { id: routerId },
      select: { id: true, name: true, nasname: true, ipAddress: true, username: true, password: true, port: true },
    });
    if (!router || !router.username || !router.password) return result;

    try {
      const api = makeApi(router as never);
      await api.connect();
      const activeUsers = await api.write('/ip/hotspot/active/print');
      await api.close();

      for (const user of activeUsers) {
        const username = user.user || user.username || '';
        if (usernames.has(username)) {
          result.set(username, {
            username,
            macAddress: user['mac-address'] || '',
            ipAddress: user.address || '',
            uploadBytes: parseInt(user['bytes-in'] || '0'),
            downloadBytes: parseInt(user['bytes-out'] || '0'),
            sessionId: user['session-id'] || '',
            uptime: user.uptime || '0s',
          });
        }
      }
    } catch (error: any) {
      this.logger.error(`[live-traffic] Failed for ${router.name}:`, error.message);
    }

    return result;
  }

  /**
   * Send CoA disconnect to a MikroTik router — ported from coa-handler.service.
   * Uses MikroTik API to terminate active sessions.
   */
  async disconnectUser(username: string, routerId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const routerWhere: Record<string, unknown> = { isActive: true };
      if (routerId) routerWhere.id = routerId;
      const routers = await this.prisma.router.findMany({
        where: routerWhere as never,
        select: { id: true, name: true, nasname: true, ipAddress: true, username: true, password: true, port: true },
      });

      for (const router of routers) {
        if (!router.username || !router.password) continue;
        try {
          const api = makeApi(router as never);
          await api.connect();
          // For hotspot: disconnect active user
          await api.write('/ip/hotspot/active/remove', [`=.id=${username}`]);
          await api.close();
          return { success: true };
        } catch {
          // Try PPPoE
          try {
            const api = makeApi(router as never);
            await api.connect();
            await api.write('/ppp/active/remove', [`=.id=${username}`]);
            await api.close();
            return { success: true };
          } catch {
            continue;
          }
        }
      }
      return { success: false, error: 'No active session found or all routers failed' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
