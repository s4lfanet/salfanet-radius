import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { getTimezoneOffsetMs } from '@/lib/timezone';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';
import { batchFetchMikrotikActiveSessions, parseUptime } from '@/server/services/mikrotik/active-sessions.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmtBytes(b: number): string {
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(2)} GB`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(2)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

function fmtDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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

  // 3. Fetch live sessions (PPPoE + hotspot) from MikroTik for local-auth routers
  // Uses the shared batchFetchMikrotikActiveSessions service (same as admin).
  const mikrotikSessions = localRouters.length > 0
    ? await batchFetchMikrotikActiveSessions(localRouters, null)
    : [];

  const TZ_OFFSET_MS = getTimezoneOffsetMs();
  const now = Date.now() + TZ_OFFSET_MS; // WIB-as-UTC for duration calc
  const nowUtc = Date.now(); // True UTC for frontend timestamps

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
      durationFormatted: fmtDuration(durationSec),
      uploadFormatted: fmtBytes(ul),
      downloadFormatted: fmtBytes(dl),
      totalFormatted: fmtBytes(ul + dl),
      router: null, // will be enriched from userMap below
      user: null,   // will be enriched from userMap below
    };
  });

  const mikrotikMerged: MergedSession[] = mikrotikSessions.map((s: any) => {
    const durationSec = parseUptime(s.uptime || '0s');
    const ul = s.rxBytes || 0;   // rx-byte = from client = upload
    const dl = s.txBytes || 0;   // tx-byte = to client = download
    return {
      id: `mt-${s.routerId}-${s.username}-${s.sessionId || s.macAddress || s.ipAddress || ''}`,
      username: s.username,
      sessionId: s.sessionId || '',
      framedIpAddress: s.ipAddress || '',
      macAddress: s.macAddress || '',
      startTime: durationSec > 0 ? new Date(nowUtc - durationSec * 1000).toISOString() : new Date(nowUtc).toISOString(),
      duration: durationSec,
      durationFormatted: fmtDuration(durationSec),
      uploadFormatted: fmtBytes(ul),
      downloadFormatted: fmtBytes(dl),
      totalFormatted: fmtBytes(ul + dl),
      router: routerMap.get(s.routerId) ?? { id: s.routerId, name: s.routerName || 'Unknown' },
      user: null, // will be enriched from userMap below
    };
  });

  // Deduplicate: prefer radacct for RADIUS-auth routers, MikroTik for local-auth
  // Allow multiple MikroTik sessions per username (different devices)
  const seenRadacctUsernames = new Set<string>();
  let sessions: MergedSession[] = [];

  // First add radacct sessions (RADIUS-auth routers)
  for (const s of radacctSessions) {
    if (!seenRadacctUsernames.has(s.username)) {
      seenRadacctUsernames.add(s.username);
      sessions.push(s);
    }
  }
  // Then add ALL MikroTik sessions (local-auth routers), skipping only
  // usernames already in radacct (avoid double-count for RADIUS routers)
  for (const s of mikrotikMerged) {
    if (!seenRadacctUsernames.has(s.username)) {
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
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
