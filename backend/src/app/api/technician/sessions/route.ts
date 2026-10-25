import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { getTimezoneOffsetMs } from '@/lib/timezone';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';
import { listPppActiveDetailed } from '@/server/services/mikrotik/active-sessions.service';

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

  // Only RADIUS-connected PPPoE sessions: an open radacct row proves the
  // session authenticated through this app's FreeRADIUS. Hotspot vouchers
  // and local-auth MikroTik sessions never appear here because their
  // usernames are not pppoeUser rows.
  const radacctSessions = await prisma.radacct.findMany({
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
    take: 2000,
  });

  const usernames = [...new Set(radacctSessions.map((s) => s.username))];
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

  // Live byte counters: radacct octets only refresh on interim-update/stop,
  // so overlay the real counters from each router's pppoe-in interface stats.
  // Router comes from the session's nasipaddress (authoritative) with the
  // customer's assigned router as fallback — an unassigned router must not
  // silently kill the overlay.
  const nasIps = [...new Set(radacctSessions.map((s) => s.nasipaddress).filter(Boolean))] as string[];
  const nasRouters = nasIps.length
    ? await prisma.router.findMany({
        where: { OR: [{ ipAddress: { in: nasIps } }, { nasname: { in: nasIps } }] },
        select: { id: true, ipAddress: true, nasname: true },
      })
    : [];
  const routerByNas = new Map<string, string>();
  for (const r of nasRouters) {
    if (r.ipAddress) routerByNas.set(r.ipAddress, r.id);
    if (r.nasname) routerByNas.set(r.nasname, r.id);
  }

  const routerIds = [...new Set(
    radacctSessions
      .map((s) => (s.nasipaddress ? routerByNas.get(s.nasipaddress) : undefined))
      .filter((id): id is string => Boolean(id)),
  )];
  const liveBytes = new Map<string, { rx: number; tx: number }>();
  await Promise.all(routerIds.map(async (routerId) => {
    try {
      const active = await listPppActiveDetailed(routerId);
      for (const s of active) {
        liveBytes.set(`${routerId}:${s.username}`, { rx: s.rxBytes ?? 0, tx: s.txBytes ?? 0 });
      }
    } catch { /* router unreachable — fall back to radacct counters */ }
  }));

  const TZ_OFFSET_MS = getTimezoneOffsetMs();
  const now = Date.now() + TZ_OFFSET_MS; // WIB-as-UTC for duration calc

  // Keep the newest open session per PPPoE customer (rows are already
  // ordered by acctstarttime desc).
  const seen = new Set<string>();
  let sessions = radacctSessions
    .filter((s) => {
      if (!userMap.has(s.username) || seen.has(s.username)) return false;
      seen.add(s.username);
      return true;
    })
    .map((s) => {
      const pUser = userMap.get(s.username)!;
      const startMs = s.acctstarttime ? new Date(s.acctstarttime).getTime() : now;
      const durationSec = Math.max(0, Math.floor((now - startMs) / 1000));
      const liveRouterId = (s.nasipaddress ? routerByNas.get(s.nasipaddress) : undefined) ?? pUser.router?.id;
      const live = liveRouterId ? liveBytes.get(`${liveRouterId}:${s.username}`) : undefined;
      const dl = live?.tx ?? Number(s.acctoutputoctets ?? 0);
      const ul = live?.rx ?? Number(s.acctinputoctets ?? 0);
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
        router: pUser.router ?? null,
        user: {
          id: pUser.id,
          customerId: pUser.customerId,
          name: pUser.name ?? '',
          phone: pUser.phone ?? '',
          profile: pUser.profile?.name ?? '',
          area: pUser.area ?? null,
        },
      };
    });

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
