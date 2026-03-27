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
        select: { id: true, name: true, phone: true, isActive: true, role: true },
      });
      if (!adminUser?.isActive || adminUser.role !== 'TECHNICIAN') return null;
      return { id: adminUser.id, name: adminUser.name ?? '', phoneNumber: adminUser.phone ?? '', isActive: true };
    }
    const tech = await prisma.technician.findUnique({
      where: { id: payload.id as string },
      select: { id: true, name: true, phoneNumber: true, isActive: true },
    });
    return tech?.isActive ? tech : null;
  } catch {
    return null;
  }
}

// GET — list tickets: open/unassigned OR assigned to this technician
export async function GET(req: NextRequest) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || undefined;
  const priority = searchParams.get('priority') || undefined;
  const mine = searchParams.get('mine') === 'true';
  const search = searchParams.get('search') || undefined;

  const where: Record<string, unknown> = {};

  if (mine) {
    where.assignedToId = tech.id;
    where.assignedToType = 'TECHNICIAN';
  } else {
    where.OR = [
      { assignedToId: null },
      { assignedToId: tech.id, assignedToType: 'TECHNICIAN' },
    ];
  }

  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (search) {
    where.OR = [
      { ticketNumber: { contains: search } },
      { subject: { contains: search } },
      { customerName: { contains: search } },
      { customerPhone: { contains: search } },
    ];
  }

  const tickets = await prisma.ticket.findMany({
    where,
    include: {
      category: { select: { id: true, name: true, color: true } },
      customer: { select: { id: true, username: true, name: true, phone: true } },
      _count: { select: { messages: true } },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });

  return NextResponse.json({ tickets });
}

// PATCH — assign, update status, or add reply
export async function PATCH(req: NextRequest) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { ticketId, action, status, message } = body as {
    ticketId: string;
    action: 'claim' | 'update_status' | 'reply';
    status?: string;
    message?: string;
  };

  if (!ticketId || !action) {
    return NextResponse.json({ error: 'ticketId dan action wajib diisi' }, { status: 400 });
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return NextResponse.json({ error: 'Tiket tidak ditemukan' }, { status: 404 });

  if (action === 'claim') {
    if (ticket.assignedToId && ticket.assignedToId !== tech.id) {
      return NextResponse.json({ error: 'Tiket sudah diklaim teknisi lain' }, { status: 409 });
    }
    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        assignedToId: tech.id,
        assignedToType: 'TECHNICIAN',
        status: 'IN_PROGRESS',
      },
    });
    await prisma.ticketMessage.create({
      data: {
        id: crypto.randomUUID(),
        ticketId,
        senderType: 'TECHNICIAN',
        senderId: tech.id,
        senderName: tech.name,
        message: `Tiket diklaim dan ditangani oleh teknisi ${tech.name}.`,
        isInternal: false,
      },
    });
    return NextResponse.json({ ticket: updated });
  }

  if (action === 'update_status') {
    if (!status) return NextResponse.json({ error: 'status wajib' }, { status: 400 });
    const validStatuses = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Status tidak valid' }, { status: 400 });
    }
    const data: Record<string, unknown> = { status };
    if (status === 'RESOLVED') data.resolvedAt = new Date();
    if (status === 'CLOSED') data.closedAt = new Date();
    const updated = await prisma.ticket.update({ where: { id: ticketId }, data });
    await prisma.ticketMessage.create({
      data: {
        id: crypto.randomUUID(),
        ticketId,
        senderType: 'SYSTEM',
        senderName: 'System',
        message: `Status tiket diubah menjadi ${status} oleh ${tech.name}.`,
        isInternal: false,
      },
    });
    return NextResponse.json({ ticket: updated });
  }

  if (action === 'reply') {
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Pesan tidak boleh kosong' }, { status: 400 });
    }
    const msg = await prisma.ticketMessage.create({
      data: {
        id: crypto.randomUUID(),
        ticketId,
        senderType: 'TECHNICIAN',
        senderId: tech.id,
        senderName: tech.name,
        message: message.trim(),
        isInternal: false,
      },
    });
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { lastResponseAt: new Date() },
    });
    return NextResponse.json({ message: msg });
  }

  return NextResponse.json({ error: 'Action tidak dikenal' }, { status: 400 });
}
