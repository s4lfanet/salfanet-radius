import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';

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
  const status = searchParams.get('status') || undefined;
  const routerId = searchParams.get('routerId') || undefined;
  const areaId = searchParams.get('areaId') || undefined;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '30', 10));
  const skip = (page - 1) * limit;

  // Field technicians must scope their query to a router or area
  if (!tech.isAdminUser && !routerId && !areaId) {
    return NextResponse.json(
      { error: 'routerId or areaId parameter is required' },
      { status: 400 },
    );
  }

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

  const [users, total] = await Promise.all([
    prisma.pppoeUser.findMany({
      where,
      select: {
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
        profile: { select: { id: true, name: true, price: true, downloadSpeed: true, uploadSpeed: true } },
        area: { select: { id: true, name: true } },
        router: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.pppoeUser.count({ where }),
  ]);

  return NextResponse.json({ users, total, page, limit, pages: Math.ceil(total / limit) });
}
