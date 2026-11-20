import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';
import {
  getConnectivitySnapshot,
  loadPaymentStatus,
  TECH_CUSTOMER_SELECT,
} from '@/server/services/technician/connectivity.service';

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

/**
 * Online customers = RADIUS sessions (non-stale) plus live router sessions
 * (local-auth or missing accounting). Same rule as Offline / Isolir / Monitor,
 * see technician/connectivity.service. Each row says where it was seen
 * (`source`: radius | mikrotik) and carries the full customer record.
 */
export async function GET(req: NextRequest) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get('search') || '').toLowerCase();
  const routerFilter = searchParams.get('routerId') || '';
  const sourceFilter = searchParams.get('source') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '50', 10));

  const snap = await getConnectivitySnapshot();
  const usernames = [...snap.sessions.keys()];

  // Only registered customers are listed (router-only secrets without a
  // customer record are not "customers").
  const customers = usernames.length
    ? await prisma.pppoeUser.findMany({
        where: { username: { in: usernames } },
        select: TECH_CUSTOMER_SELECT,
      })
    : [];
  const customerByUsername = new Map(customers.map((c) => [c.username, c]));
  const payment = await loadPaymentStatus(customers.map((c) => c.id));

  let rows = [...snap.sessions.values()]
    .filter((s) => customerByUsername.has(s.username))
    .map((s) => {
      const c = customerByUsername.get(s.username)!;
      const routerId = s.routerId ?? c.router?.id ?? null;
      const routerName = s.routerName ?? c.router?.name ?? null;
      return {
        id: `${s.source}-${s.username}`,
        username: s.username,
        source: s.source,
        sessionId: s.sessionId,
        framedIpAddress: s.ip ?? '',
        macAddress: s.mac ?? '',
        startTime: s.startTime ?? '',
        duration: s.uptimeSec,
        durationFormatted: fmtDuration(s.uptimeSec),
        uploadFormatted: fmtBytes(s.rxBytes),
        downloadFormatted: fmtBytes(s.txBytes),
        totalFormatted: fmtBytes(s.rxBytes + s.txBytes),
        router: routerId ? { id: routerId, name: routerName ?? '' } : null,
        status: c.status,
        user: {
          id: c.id,
          customerId: c.customerId,
          name: c.name ?? '',
          phone: c.phone ?? '',
          profile: c.profile?.name ?? '',
          area: c.area ?? null,
        },
        customer: { ...c, paymentStatus: payment.get(c.id) ?? 'paid' },
      };
    })
    .sort((a, b) => (a.user.name || a.username).localeCompare(b.user.name || b.username));

  const counts = {
    radius: rows.filter((r) => r.source === 'radius').length,
    mikrotik: rows.filter((r) => r.source === 'mikrotik').length,
    isolated: rows.filter((r) => r.status === 'isolated' || r.status === 'suspended').length,
  };

  if (search) {
    rows = rows.filter(
      (s) =>
        s.username.toLowerCase().includes(search) ||
        s.user.name.toLowerCase().includes(search) ||
        s.user.phone.includes(search) ||
        (s.user.customerId ?? '').toLowerCase().includes(search) ||
        (s.customer.address ?? '').toLowerCase().includes(search) ||
        s.framedIpAddress.includes(search) ||
        s.macAddress.toLowerCase().includes(search),
    );
  }
  if (routerFilter) rows = rows.filter((s) => s.router?.id === routerFilter);
  if (sourceFilter === 'radius' || sourceFilter === 'mikrotik') rows = rows.filter((s) => s.source === sourceFilter);

  const total = rows.length;
  const totalPages = Math.ceil(total / limit);
  const paged = rows.slice((page - 1) * limit, page * limit);

  return NextResponse.json({
    sessions: paged,
    pagination: { total, page, limit, totalPages },
    summary: { ...counts, unreachableRouters: snap.unreachableRouters },
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
