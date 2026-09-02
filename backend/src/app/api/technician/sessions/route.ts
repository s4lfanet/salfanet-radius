import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { getTimezoneOffsetMs } from '@/lib/timezone';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';
import { RouterOSAPI } from 'node-routeros';

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

function fmtBytes(b: number): string {
  if (b > 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
  if (b > 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  if (b > 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

// Fetch live PPPoE sessions from MikroTik /ppp/active for local-auth routers.
// Also fetches /interface/print to get actual rx-byte/tx-byte counters,
// since /ppp/active/print does NOT include byte counters on RouterOS v6.
async function getMikrotikPppoeSessions(router: { id: string; name: string; nasname: string; ipAddress?: string | null; port?: number | null; username: string; password: string }) {
  const api = new RouterOSAPI({
    host: router.ipAddress || router.nasname,
    port: router.port || 8728,
    user: router.username,
    password: router.password,
    timeout: 15,
  });
  try {
    await Promise.race([
      api.connect(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('connect timeout')), 15000)),
    ]);

    // 1. Fetch active PPPoE sessions (username, IP, MAC, uptime)
    const active = await api.write('/ppp/active/print') as Array<any>;

    // 2. Fetch all interfaces to get byte counters (rx-byte/tx-byte)
    //    PPPoE interfaces have type="pppoe-in" and name="<pppoe-{username}>"
    let byteMap = new Map<string, { rx: number; tx: number }>();
    try {
      const ifaces = await api.write('/interface/print') as Array<any>;
      for (const iface of ifaces) {
        if (iface.type === 'pppoe-in' && iface.name) {
          // Extract username from interface name: <pppoe-username> → username
          const match = iface.name.match(/^<pppoe-(.+)>$/);
          if (match) {
            byteMap.set(match[1], {
              rx: Number(iface['rx-byte'] || 0),
              tx: Number(iface['tx-byte'] || 0),
            });
          }
        }
      }
    } catch (e: any) {
      console.error(`[TechSessions] Interface byte fetch failed for ${router.name}:`, e?.message || e);
    }

    return active.map((s) => {
      const username = s.name || s.user || '';
      const bytes = byteMap.get(username);
      // On MikroTik: rx-byte = traffic FROM client (upload), tx-byte = traffic TO client (download)
      return {
        username,
        framedIpAddress: s.address || s['local-address'] || '',
        macAddress: s['caller-id'] || '',
        uptimeSeconds: parseUptime(s.uptime || '0s'),
        uploadBytes: bytes?.rx ?? 0,
        downloadBytes: bytes?.tx ?? 0,
        sessionId: s['session-id'] || s['.id'] || '',
        routerId: router.id,
        routerName: router.name,
      };
    });
  } catch (e: any) {
    console.error(`[TechSessions] MikroTik PPP active fetch failed for ${router.name}:`, e?.message || e);
    return [];
  } finally {
    try { await api.close(); } catch { /* ignore */ }
  }
}

async function verifyTechnician(req: NextRequest) {
  const token = req.cookies.get('technician-token')?.value;
  if (!token) return null;
  try {
    const secret = TECH_JWT_SECRET;
    const { payload } = await jwtVerify(token, secret);
    if (payload.type === 'admin_user') {
      const adminUser = await prisma.adminUser.findUnique({
        where: { id: payload.id as string },
        select: { id: true, isActive: true, role: true },
      });
      if (!adminUser?.isActive || adminUser.role !== 'TECHNICIAN') return null;
      return { id: adminUser.id, isActive: true };
    }
    const tech = await prisma.technician.findUnique({
      where: { id: payload.id as string },
      select: { id: true, isActive: true },
    });
    return tech?.isActive ? tech : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const routerFilter = searchParams.get('routerId') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '50', 10));

  // 1. Get all active routers to determine which need MikroTik API polling
  const routerWhere: { isActive: boolean; id?: string } = { isActive: true };
  if (routerFilter) routerWhere.id = routerFilter;

  const routers = await prisma.router.findMany({
    where: routerWhere,
    select: { id: true, name: true, nasname: true, ipAddress: true, port: true, username: true, password: true, authMode: true },
  });

  const localRouters = routers.filter(r => (r.authMode || 'local') !== 'radius');

  // 2. Get RADIUS accounting sessions from radacct (for radius-auth routers)
  const onlineSessions = await prisma.radacct.findMany({
    where: { acctstoptime: null },
    select: {
      radacctid: true,
      acctuniqueid: true,
      acctsessionid: true,
      username: true,
      framedipaddress: true,
      callingstationid: true,
      nasipaddress: true,
      acctstarttime: true,
      acctinputoctets: true,
      acctoutputoctets: true,
    },
    orderBy: { acctstarttime: 'desc' },
    take: 1000,
  });

  // 3. Fetch live PPPoE sessions from MikroTik for local-auth routers
  const mikrotikSessions = localRouters.length > 0
    ? (await Promise.all(localRouters.map(r => getMikrotikPppoeSessions(r)))).flat()
    : [];

  const TZ_OFFSET_MS = getTimezoneOffsetMs();
  const now = Date.now() + TZ_OFFSET_MS; // WIB-as-UTC for duration calc

  // Build router map for local sessions
  const routerMap = new Map(routers.map(r => [r.id, { id: r.id, name: r.name }]));

  // 4. Merge radacct + MikroTik sessions into a unified format
  type MergedSession = {
    id: string;
    username: string;
    sessionId: string;
    framedIpAddress: string;
    macAddress: string;
    startTime: string;
    duration: number;
    durationFormatted: string;
    uploadFormatted: string;
    downloadFormatted: string;
    totalFormatted: string;
    router: { id: string; name: string } | null;
    user: { id: string; customerId: string; name: string; phone: string; profile: string; area: { id: string; name: string } | null } | null;
  };

  const radacctSessions: MergedSession[] = onlineSessions.map((s) => {
    const startMs = s.acctstarttime ? new Date(s.acctstarttime).getTime() : now;
    const durationSec = Math.max(0, Math.floor((now - startMs) / 1000));
    const hours = Math.floor(durationSec / 3600);
    const mins = Math.floor((durationSec % 3600) / 60);
    const secs = durationSec % 60;
    const dl = Number(s.acctoutputoctets ?? 0);
    const ul = Number(s.acctinputoctets ?? 0);
    return {
      id: s.acctuniqueid ?? String(s.radacctid),
      username: s.username,
      sessionId: s.acctsessionid ?? '',
      framedIpAddress: s.framedipaddress ?? '',
      macAddress: s.callingstationid ?? '',
      startTime: s.acctstarttime ? new Date(s.acctstarttime).toISOString() : '',
      duration: durationSec,
      durationFormatted: `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`,
      uploadFormatted: fmtBytes(ul),
      downloadFormatted: fmtBytes(dl),
      totalFormatted: fmtBytes(ul + dl),
      router: null, // will be enriched from userMap below
      user: null,   // will be enriched from userMap below
    };
  });

  const mikrotikMerged: MergedSession[] = mikrotikSessions.map((s) => {
    const durationSec = s.uptimeSeconds;
    const hours = Math.floor(durationSec / 3600);
    const mins = Math.floor((durationSec % 3600) / 60);
    const secs = durationSec % 60;
    return {
      id: `mt-${s.routerId}-${s.username}`,
      username: s.username,
      sessionId: s.sessionId,
      framedIpAddress: s.framedIpAddress,
      macAddress: s.macAddress,
      startTime: new Date(Date.now() - durationSec * 1000).toISOString(),
      duration: durationSec,
      durationFormatted: `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`,
      uploadFormatted: fmtBytes(s.uploadBytes),
      downloadFormatted: fmtBytes(s.downloadBytes),
      totalFormatted: fmtBytes(s.uploadBytes + s.downloadBytes),
      router: routerMap.get(s.routerId) ?? null,
      user: null, // will be enriched from userMap below
    };
  });

  // Deduplicate: prefer radacct for RADIUS-auth routers, MikroTik for local-auth
  const seenUsernames = new Set<string>();
  let sessions: MergedSession[] = [];

  // First add radacct sessions (RADIUS-auth routers)
  for (const s of radacctSessions) {
    if (!seenUsernames.has(s.username)) {
      seenUsernames.add(s.username);
      sessions.push(s);
    }
  }
  // Then add MikroTik sessions (local-auth routers), skipping duplicates
  for (const s of mikrotikMerged) {
    if (!seenUsernames.has(s.username)) {
      seenUsernames.add(s.username);
      sessions.push(s);
    }
  }

  // 5. Cross-reference with pppoeUser data to enrich all sessions
  const usernames = sessions.map((s) => s.username);
  const pppoeUsers = usernames.length
    ? await prisma.pppoeUser.findMany({
        where: { username: { in: usernames } },
        select: {
          id: true,
          username: true,
          customerId: true,
          name: true,
          phone: true,
          profile: { select: { id: true, name: true } },
          area: { select: { id: true, name: true } },
          router: { select: { id: true, name: true } },
        },
      })
    : [];

  const userMap = new Map(pppoeUsers.map((u) => [u.username, u]));

  // Enrich sessions with user data and router info
  sessions = sessions.map((s) => {
    const pUser = userMap.get(s.username);
    return {
      ...s,
      router: s.router ?? pUser?.router ?? null,
      user: pUser
        ? {
            id: pUser.id,
            customerId: pUser.customerId,
            name: pUser.name ?? '',
            phone: pUser.phone ?? '',
            profile: pUser.profile?.name ?? '',
            area: pUser.area ?? null,
          }
        : null,
    };
  });

  // Apply filters
  if (search) {
    const q = search.toLowerCase();
    sessions = sessions.filter(
      (s) =>
        s.username.toLowerCase().includes(q) ||
        (s.user?.name?.toLowerCase().includes(q)) ||
        s.framedIpAddress.includes(q) ||
        s.macAddress.toLowerCase().includes(q),
    );
  }
  if (routerFilter) {
    sessions = sessions.filter((s) => s.router?.id === routerFilter);
  }

  const total = sessions.length;
  const totalPages = Math.ceil(total / limit);
  const paged = sessions.slice((page - 1) * limit, page * limit);

  return NextResponse.json({
    sessions: paged,
    pagination: { total, page, limit, totalPages },
  });
}
