import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';

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
      return { id: adminUser.id, isActive: true, isAdminUser: true as const };
    }
    const tech = await prisma.technician.findUnique({
      where: { id: payload.id as string },
      select: { id: true, isActive: true },
    });
    return tech?.isActive ? { ...tech, isAdminUser: false as const } : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || undefined;
  const validStatuses = ['active', 'isolated', 'suspended', 'stopped'];
  const status = (validStatuses.includes(searchParams.get('status') || '') ? searchParams.get('status')! : undefined);
  const routerId = searchParams.get('routerId') || undefined;
  const areaId = searchParams.get('areaId') || undefined;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '30', 10));
  const skip = (page - 1) * limit;

  // routerId/areaId are optional filters. Technicians have no assigned
  // area; requiring one made the page (which sends neither) always fail.
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (routerId) where.routerId = routerId;
  if (areaId) where.areaId = areaId;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { username: { contains: search } },
      { phone: { contains: search } },
      { address: { contains: search } },
    ];
  }

  const select = {
    id: true,
    username: true,
    customerId: true,
    name: true,
    phone: true,
    email: true,
    address: true,
    status: true,
    subscriptionType: true,
    expiredAt: true,
    createdAt: true,
    latitude: true,
    longitude: true,
    connectionType: true,
    installDate: true,
    profile: { select: { id: true, name: true, price: true, downloadSpeed: true, uploadSpeed: true } },
    area: { select: { id: true, name: true } },
    router: { select: { id: true, name: true } },
  } as const;

  // ?map=1: every matching customer that has coordinates (not one page), so
  // the map can show them all and open any one's details.
  if (searchParams.get('map') === '1') {
    const points = await prisma.pppoeUser.findMany({
      where: { ...where, latitude: { not: null }, longitude: { not: null } },
      select,
      take: 5000,
    });
    return NextResponse.json({ points });
  }

  const [users, total] = await Promise.all([
    prisma.pppoeUser.findMany({
      where,
      select,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.pppoeUser.count({ where }),
  ]);

  // Payment status per customer, same concept as the collector table:
  // 'overdue' = an unpaid invoice past its due date, 'unpaid' = an unpaid
  // invoice not yet due, 'paid' = no outstanding invoice.
  const userIds = users.map((u) => u.id);
  const openInvoices = userIds.length
    ? await prisma.invoice.findMany({
        where: { userId: { in: userIds }, status: { in: ['pending', 'unpaid', 'overdue'] } },
        select: { userId: true, status: true, dueDate: true },
        orderBy: { dueDate: 'desc' },
      })
    : [];
  const now = new Date();
  const paymentMap = new Map<string, 'overdue' | 'unpaid'>();
  for (const inv of openInvoices) {
    if (!inv.userId || paymentMap.get(inv.userId) === 'overdue') continue;
    const overdue = inv.status === 'overdue' || (inv.dueDate !== null && new Date(inv.dueDate) < now);
    paymentMap.set(inv.userId, overdue ? 'overdue' : 'unpaid');
  }
  const enriched = users.map((u) => ({
    ...u,
    paymentStatus: paymentMap.get(u.id) ?? 'paid',
  }));

  return NextResponse.json({ users: enriched, total, page, limit, pages: Math.ceil(total / limit) });
}
