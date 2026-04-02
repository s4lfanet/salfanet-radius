import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

function generateCustomerId(): string {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// GET - List all customers
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const id = searchParams.get('id') || '';

    if (id) {
      const customer = await (prisma as any).pppoeCustomer.findUnique({
        where: { id },
        include: {
          pppoeUsers: {
            select: {
              id: true, username: true, status: true, customerId: true, expiredAt: true,
              profile: { select: { name: true, downloadSpeed: true, uploadSpeed: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ customer });
    }

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { customerId: { contains: search } },
      ];
    }
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;

    const sessionFilter = searchParams.get('session') || ''; // 'online' | 'offline' | ''

    const customers = await (prisma as any).pppoeCustomer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { pppoeUsers: true } },
        area: { select: { id: true, name: true } },
        pppoeUsers: { select: { username: true } }, // needed for session lookup
      },
    });

    // Collect all PPPoE usernames from these customers
    const allUsernames: string[] = customers.flatMap((c: any) =>
      c.pppoeUsers.map((u: any) => u.username)
    );

    // Query radacct for active sessions (acctstoptime IS NULL)
    const activeSet = new Set<string>();
    if (allUsernames.length > 0) {
      const activeSessions = await (prisma as any).radacct.findMany({
        where: { username: { in: allUsernames }, acctstoptime: null },
        select: { username: true },
        distinct: ['username'],
      });
      activeSessions.forEach((s: any) => activeSet.add(s.username));
    }

    // Enrich each customer with session info
    let enriched = customers.map((c: any) => {
      const usernames: string[] = c.pppoeUsers.map((u: any) => u.username);
      const onlineCount = usernames.filter((u: string) => activeSet.has(u)).length;
      const total = usernames.length;
      const sessionStatus: 'online' | 'offline' | 'partial' =
        total === 0 || onlineCount === 0 ? 'offline'
        : onlineCount === total ? 'online'
        : 'partial';
      return { ...c, sessionStatus, onlineCount };
    });

    // Apply session filter
    if (sessionFilter === 'online') enriched = enriched.filter((c: any) => c.onlineCount > 0);
    if (sessionFilter === 'offline') enriched = enriched.filter((c: any) => c.onlineCount === 0);

    return NextResponse.json({ customers: enriched });
  } catch (error) {
    console.error('Get customers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create customer
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, phone, email, address, idCardNumber, customerId: providedId, areaId } = body;

    if (!name || !phone) {
      return NextResponse.json({ error: 'Nama dan No. HP wajib diisi' }, { status: 400 });
    }

    // Check phone duplicate
    const existing = await (prisma as any).pppoeCustomer.findFirst({ where: { phone } });
    if (existing) {
      return NextResponse.json({ error: 'No. HP sudah terdaftar' }, { status: 409 });
    }

    // Ensure unique customerId
    let customerId = providedId || generateCustomerId();
    let tries = 0;
    while (tries < 10) {
      const dup = await (prisma as any).pppoeCustomer.findUnique({ where: { customerId } });
      if (!dup) break;
      customerId = generateCustomerId();
      tries++;
    }

    const customer = await (prisma as any).pppoeCustomer.create({
      data: {
        id: generateId(),
        customerId,
        name: name.trim(),
        phone: phone.trim(),
        email: email?.trim() || null,
        address: address?.trim() || null,
        idCardNumber: idCardNumber?.trim() || null,
        areaId: areaId || null,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, customer }, { status: 201 });
  } catch (error) {
    console.error('Create customer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update customer
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { id, name, phone, email, address, idCardNumber, isActive, areaId } = body;
    if (!id) return NextResponse.json({ error: 'Customer ID wajib diisi' }, { status: 400 });

    // Check phone duplicate (exclude self)
    if (phone) {
      const existing = await (prisma as any).pppoeCustomer.findFirst({
        where: { phone, NOT: { id } },
      });
      if (existing) return NextResponse.json({ error: 'No. HP sudah dipakai customer lain' }, { status: 409 });
    }

    const customer = await (prisma as any).pppoeCustomer.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(phone && { phone: phone.trim() }),
        email: email?.trim() || null,
        address: address?.trim() || null,
        idCardNumber: idCardNumber?.trim() || null,
        ...(areaId !== undefined && { areaId: areaId || null }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json({ success: true, customer });
  } catch (error: any) {
    if (error?.code === 'P2025') return NextResponse.json({ error: 'Customer tidak ditemukan' }, { status: 404 });
    console.error('Update customer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete customer
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Customer ID wajib diisi' }, { status: 400 });

    // Check if customer has pppoe users
    const userCount = await (prisma as any).pppoeUser.count({ where: { pppoeCustomerId: id } });
    if (userCount > 0) {
      return NextResponse.json({
        error: `Customer memiliki ${userCount} langganan PPPoE aktif. Hapus atau pindahkan langganan terlebih dahulu.`,
      }, { status: 400 });
    }

    await (prisma as any).pppoeCustomer.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === 'P2025') return NextResponse.json({ error: 'Customer tidak ditemukan' }, { status: 404 });
    console.error('Delete customer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
