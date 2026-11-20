import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';
import {
  getConnectivitySnapshot,
  offlineWhere,
  loadPaymentStatus,
  loadLastOnline,
  TECH_CUSTOMER_SELECT,
} from '@/server/services/technician/connectivity.service';

export const dynamic = 'force-dynamic';

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

// Returns PPPoE users that are NOT currently online (no active radacct session or MikroTik active session)
/**
 * Registered, active customers that are not online (same rule as the Online
 * page). `connection` is 'offline' when the customer's router answered, or
 * 'unknown' when it could not be queried. Isolated customers live on the
 * Isolir page; router-only secrets without a customer record are not listed.
 * Paging is done in the database.
 */
export async function GET(req: NextRequest) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const stateParam = searchParams.get('state');
  const state: 'offline' | 'unknown' | 'all' = stateParam === 'offline' || stateParam === 'unknown' ? stateParam : 'all';
  const routerId = searchParams.get('routerId') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(200, parseInt(searchParams.get('limit') || '50', 10));

  const snap = await getConnectivitySnapshot();

  const and: Prisma.pppoeUserWhereInput[] = [offlineWhere(snap, state)];
  if (routerId) and.push({ routerId });
  if (search) {
    and.push({
      OR: [
        { name: { contains: search } },
        { username: { contains: search } },
        { phone: { contains: search } },
        { customerId: { contains: search } },
        { address: { contains: search } },
      ],
    });
  }
  const where = { AND: and };

  const [users, total, offlineTotal, unknownTotal] = await Promise.all([
    prisma.pppoeUser.findMany({
      where,
      select: TECH_CUSTOMER_SELECT,
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.pppoeUser.count({ where }),
    prisma.pppoeUser.count({ where: offlineWhere(snap, 'offline') }),
    prisma.pppoeUser.count({ where: offlineWhere(snap, 'unknown') }),
  ]);

  const [payment, lastOnline] = await Promise.all([
    loadPaymentStatus(users.map((u) => u.id)),
    loadLastOnline(users.map((u) => u.username)),
  ]);
  const bad = new Set(snap.unreachableRouterIds);

  const data = users.map((u) => ({
    ...u,
    paymentStatus: payment.get(u.id) ?? 'paid',
    connection: u.routerId && bad.has(u.routerId) ? 'unknown' : 'offline',
    lastOnlineAt: lastOnline.get(u.username) ?? null,
  }));

  const totalPages = Math.ceil(total / limit);
  return NextResponse.json({
    users: data,
    total,
    pagination: { total, page, limit, totalPages },
    summary: { offline: offlineTotal, unknown: unknownTotal, unreachableRouters: snap.unreachableRouters },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
