import { RouterOSAPI } from 'node-routeros';

export interface HotspotRouterConnection {
  id: string;
  name: string;
  nasname: string;
  ipAddress?: string | null;
  port?: number | null;
  username: string;
  password: string;
}

export interface LiveHotspotTraffic {
  username: string;
  uploadBytes: number;
  downloadBytes: number;
  ipAddress: string | null;
  macAddress: string | null;
  sessionId: string | null;
  uptimeSeconds: number;
  routerId: string;
  routerName: string;
}

function parseCounter(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseUptime(uptime: string): number {
  let seconds = 0;
  const weeks = uptime.match(/(\d+)w/);
  const days = uptime.match(/(\d+)d/);
  const hours = uptime.match(/(\d+)h/);
  const minutes = uptime.match(/(\d+)m/);
  const secs = uptime.match(/(\d+)s/);

  if (weeks) seconds += Number.parseInt(weeks[1], 10) * 7 * 24 * 3600;
  if (days) seconds += Number.parseInt(days[1], 10) * 24 * 3600;
  if (hours) seconds += Number.parseInt(hours[1], 10) * 3600;
  if (minutes) seconds += Number.parseInt(minutes[1], 10) * 60;
  if (secs) seconds += Number.parseInt(secs[1], 10);
  return seconds;
}

function pickBetterTraffic(
  current: LiveHotspotTraffic | undefined,
  candidate: LiveHotspotTraffic,
): LiveHotspotTraffic {
  if (!current) return candidate;
  const currentTotal = current.uploadBytes + current.downloadBytes;
  const candidateTotal = candidate.uploadBytes + candidate.downloadBytes;
  return candidateTotal >= currentTotal ? candidate : current;
}

export async function fetchLiveHotspotTrafficMap(
  routers: HotspotRouterConnection[],
  targetUsernames?: Set<string>,
): Promise<Map<string, LiveHotspotTraffic>> {
  const trafficByUsername = new Map<string, LiveHotspotTraffic>();

  await Promise.all(
    routers.map(async (router) => {
      const api = new RouterOSAPI({
        host: router.ipAddress || router.nasname,
        port: router.port || 8728,
        user: router.username,
        password: router.password,
        timeout: 10,
      });

      try {
        await api.connect();
        const activeUsers = await api.write('/ip/hotspot/active/print');

        for (const user of activeUsers as any[]) {
          const username = String(user.user || user.username || '').trim();
          if (!username) continue;
          if (targetUsernames && !targetUsernames.has(username)) continue;

          const candidate: LiveHotspotTraffic = {
            username,
            uploadBytes: parseCounter(user['bytes-in']),
            downloadBytes: parseCounter(user['bytes-out']),
            ipAddress: user.address ? String(user.address) : null,
            macAddress: user['mac-address'] ? String(user['mac-address']) : null,
            sessionId: user['session-id'] ? String(user['session-id']) : null,
            uptimeSeconds: parseUptime(String(user.uptime || '0s')),
            routerId: router.id,
            routerName: router.name,
          };

          trafficByUsername.set(
            username,
            pickBetterTraffic(trafficByUsername.get(username), candidate),
          );
        }
      } catch (error) {
        console.error(
          `[live-hotspot] failed to query router ${router.name} (${router.ipAddress || router.nasname})`,
          error,
        );
      } finally {
        try {
          await api.close();
        } catch {
          // Ignore close errors from unstable router connections.
        }
      }
    }),
  );

  return trafficByUsername;
}