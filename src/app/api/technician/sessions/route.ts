import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { getTimezoneOffsetMs } from '@/lib/timezone';

async function verifyTechnician(req: NextRequest) {
  const token = req.cookies.get('technician-token')?.value;
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
    );
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

  // Get active sessions from radacct
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

  // Cross-reference with pppoeUser data
  const usernames = onlineSessions.map((s) => s.username);
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

  const TZ_OFFSET_MS = getTimezoneOffsetMs();
  const now = Date.now() + TZ_OFFSET_MS; // WIB-as-UTC for duration calc

  let sessions = onlineSessions.map((s) => {
    const pUser = userMap.get(s.username);
    const startMs = s.acctstarttime
      ? new Date(s.acctstarttime).getTime()
      : now;
    const durationSec = Math.max(0, Math.floor((now - startMs) / 1000));

    const hours = Math.floor(durationSec / 3600);
    const mins = Math.floor((durationSec % 3600) / 60);
    const secs = durationSec % 60;
    const durationFormatted = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    const dl = Number(s.acctoutputoctets ?? 0);
    const ul = Number(s.acctinputoctets ?? 0);
    const total = dl + ul;
    const fmtBytes = (b: number) => {
      if (b > 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
      if (b > 1048576) return `${(b / 1048576).toFixed(1)} MB`;
      if (b > 1024) return `${(b / 1024).toFixed(1)} KB`;
      return `${b} B`;
    };

    return {
      id: s.acctuniqueid ?? String(s.radacctid),
      username: s.username,
      sessionId: s.acctsessionid ?? '',
      framedIpAddress: s.framedipaddress ?? '',
      macAddress: s.callingstationid ?? '',
      startTime: s.acctstarttime ? new Date(s.acctstarttime).toISOString() : '',
      duration: durationSec,
      durationFormatted,
      uploadFormatted: fmtBytes(ul),
      downloadFormatted: fmtBytes(dl),
      totalFormatted: fmtBytes(total),
      router: pUser?.router ?? null,
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
