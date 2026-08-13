import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { RouterOSAPI } from 'node-routeros';

// Helper to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper to format duration
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

// Parse MikroTik uptime format (e.g., "1h30m45s", "5m20s", "30s")
function parseUptime(uptime: string): number {
  let seconds = 0;
  const weeks   = uptime.match(/(\d+)w/);
  const days    = uptime.match(/(\d+)d/);
  const hours   = uptime.match(/(\d+)h/);
  const minutes = uptime.match(/(\d+)m/);
  const secs    = uptime.match(/(\d+)s/);
  if (weeks)   seconds += parseInt(weeks[1])   * 7 * 24 * 3600;
  if (days)    seconds += parseInt(days[1])    * 24 * 3600;
  if (hours)   seconds += parseInt(hours[1])   * 3600;
  if (minutes) seconds += parseInt(minutes[1]) * 60;
  if (secs)    seconds += parseInt(secs[1]);
  return seconds;
}

// Connect to MikroTik router
function makeApi(router: { ipAddress?: string | null; nasname: string; port?: number | null; username: string; password: string }) {
  return new RouterOSAPI({
    host: router.ipAddress || router.nasname,
    port: router.port || 8728,
    user: router.username,
    password: router.password,
    timeout: 10,
  });
}

// Get live hotspot sessions from MikroTik API
async function getHotspotSessionsFromMikrotik(router: any): Promise<any[]> {
  const api = makeApi(router);
  try {
    await api.connect();
    const activeUsers = await api.write('/ip/hotspot/active/print');
    await api.close();
    return activeUsers.map((user: any) => ({
      type: 'hotspot',
      username: user.user || user.username || '',
      macAddress: user['mac-address'] || '',
      ipAddress: user.address || '',
      uptime: user.uptime || '0s',
      uptimeSeconds: parseUptime(user.uptime || '0s'),
      // MikroTik hotspot: bytes-in = bytes received FROM user (user's upload)
      //                   bytes-out = bytes sent TO user (user's download)
      uploadBytes: parseInt(user['bytes-in'] || '0'),
      downloadBytes: parseInt(user['bytes-out'] || '0'),
      packetsIn:  parseInt(user['packets-in']  || '0'),
      packetsOut: parseInt(user['packets-out'] || '0'),
      server: user.server || '',
      sessionId: user['session-id'] || '',
    }));
  } catch (error) {
    console.error(`[realtime] Hotspot fetch failed for ${router.name}:`, error);
    return [];
  }
}

// Get live PPPoE sessions from MikroTik API
async function getPPPoESessionsFromMikrotik(router: any): Promise<any[]> {
  const api = makeApi(router);
  try {
    await api.connect();
    const activePPP = await api.write('/ppp/active/print');
    await api.close();
    return activePPP.map((user: any) => ({
      type: 'pppoe',
      username: user.name || user.username || '',
      macAddress: user['caller-id'] || '',
      ipAddress:  user.address  || user['local-address']  || '',
      uptime: user.uptime || '0s',
      uptimeSeconds: parseUptime(user.uptime || '0s'),
      // PPPoE: bytes-in = upload (from client), bytes-out = download (to client)
      uploadBytes:   parseInt(user['bytes-in']  || '0'),
      downloadBytes: parseInt(user['bytes-out'] || '0'),
      packetsIn:  parseInt(user['packets-in']  || '0'),
      packetsOut: parseInt(user['packets-out'] || '0'),
      sessionId:  user['session-id'] || user['.id'] || '',
      service: user.service || '',
    }));
  } catch (error) {
    console.error(`[realtime] PPPoE fetch failed for ${router.name}:`, error);
    return [];
  }
}

/**
 * GET /api/sessions/realtime
 *
 * Query live traffic directly from MikroTik API.
 * Does NOT require FreeRADIUS interim-update to be enabled.
 *
 * Query params:
 *  routerId  - filter to one router (optional)
 *  type      - "hotspot" | "pppoe" | "" (default = both)
 *  search    - search username or IP
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const searchParams = request.nextUrl.searchParams;
    const routerId = searchParams.get('routerId');
    const typeFilter = searchParams.get('type'); // hotspot | pppoe | null
    const search = searchParams.get('search');

    const routerWhere: any = { isActive: true };
    if (routerId) routerWhere.id = routerId;

    const routers = await prisma.router.findMany({
      where: routerWhere,
      select: {
        id: true,
        name: true,
        nasname: true,
        ipAddress: true,
        username: true,
        password: true,
        port: true,
      },
    });

    if (routers.length === 0) {
      return NextResponse.json({
        sessions: [],
        stats: { total: 0, hotspot: 0, pppoe: 0, totalBandwidth: 0, totalBandwidthFormatted: '0 B' },
        source: 'mikrotik-api',
        note: 'No active routers found',
      });
    }

    // Fetch from each router in parallel
    const allSessions: any[] = [];
    await Promise.all(routers.map(async (router) => {
      const fetchHotspot = !typeFilter || typeFilter === 'hotspot';
      const fetchPPPoE   = !typeFilter || typeFilter === 'pppoe';

      const [hotspotSessions, pppoeSessions] = await Promise.all([
        fetchHotspot ? getHotspotSessionsFromMikrotik(router) : Promise.resolve([]),
        fetchPPPoE   ? getPPPoESessionsFromMikrotik(router)   : Promise.resolve([]),
      ]);

      const combined = [...hotspotSessions, ...pppoeSessions];

      for (const session of combined) {
        // Apply search filter
        if (search) {
          const q = search.toLowerCase();
          if (!session.username.toLowerCase().includes(q) &&
              !session.ipAddress?.toLowerCase().includes(q) &&
              !session.macAddress?.toLowerCase().includes(q)) {
            continue;
          }
        }

        const totalBytes = session.uploadBytes + session.downloadBytes;

        // Enrich with db info
        let userInfo: any = null;
        let voucherInfo: any = null;
        if (session.type === 'pppoe') {
          userInfo = await prisma.pppoeUser.findFirst({
            where: { username: session.username },
            select: { id: true, name: true, phone: true, profile: { select: { name: true } } },
          }).catch(() => null);
        } else {
          voucherInfo = await prisma.hotspotVoucher.findUnique({
            where: { code: session.username },
            select: { id: true, status: true, profile: { select: { name: true } } },
          }).catch(() => null);
        }

        allSessions.push({
          id: `${router.id}-${session.username}`,
          username: session.username,
          sessionId: session.sessionId,
          type: session.type,
          nasIpAddress: router.ipAddress || router.nasname,
          framedIpAddress: session.ipAddress,
          macAddress: session.macAddress,
          startTime: new Date(Date.now() - session.uptimeSeconds * 1000).toISOString(),
          duration: session.uptimeSeconds,
          durationFormatted: formatDuration(session.uptimeSeconds),
          uploadBytes: session.uploadBytes,
          downloadBytes: session.downloadBytes,
          totalBytes,
          uploadFormatted: formatBytes(session.uploadBytes),
          downloadFormatted: formatBytes(session.downloadBytes),
          totalFormatted: formatBytes(totalBytes),
          router: { id: router.id, name: router.name },
          user: userInfo,
          voucher: voucherInfo,
          source: 'realtime',
        });
      }
    }));

    const stats = {
      total:    allSessions.length,
      hotspot:  allSessions.filter(s => s.type === 'hotspot').length,
      pppoe:    allSessions.filter(s => s.type === 'pppoe').length,
      totalUpload:   allSessions.reduce((sum, s) => sum + s.uploadBytes, 0),
      totalDownload: allSessions.reduce((sum, s) => sum + s.downloadBytes, 0),
      totalBandwidth: allSessions.reduce((sum, s) => sum + s.totalBytes, 0),
      totalBandwidthFormatted: formatBytes(allSessions.reduce((sum, s) => sum + s.totalBytes, 0)),
    };

    return NextResponse.json({
      sessions: allSessions,
      stats,
      source: 'mikrotik-api',
      note: 'Live data from MikroTik API — no interim-update required',
      routersQueried: routers.length,
    });
  } catch (error) {
    console.error('[realtime] Error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
