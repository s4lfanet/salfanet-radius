import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';

async function verifyTechnician(req: NextRequest) {
  const token = req.cookies.get('technician-token')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, TECH_JWT_SECRET);
    if (payload.type === 'admin_user') {
      const adminUser = await prisma.adminUser.findUnique({
        where: { id: payload.id as string },
        select: { id: true, name: true, isActive: true, role: true },
      });
      if (!adminUser?.isActive || adminUser.role !== 'TECHNICIAN') return null;
      return { id: adminUser.id, name: adminUser.name ?? '', type: 'admin_user' as const };
    }
    const tech = await prisma.technician.findUnique({
      where: { id: payload.id as string },
      select: { id: true, name: true, isActive: true },
    });
    return tech?.isActive ? { ...tech, type: 'technician' as const } : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const since = searchParams.get('since');
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const notifications: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    link: string;
    createdAt: string;
    priority: string;
  }> = [];

  // 1. New tickets assigned to this technician
  const assignedTickets = await prisma.ticket.findMany({
    where: {
      assignedToId: tech.id,
      assignedToType: tech.type === 'admin_user' ? 'ADMIN' : 'TECHNICIAN',
      updatedAt: { gte: sinceDate },
      status: { in: ['OPEN', 'IN_PROGRESS'] },
    },
    select: {
      id: true,
      ticketNumber: true,
      subject: true,
      customerName: true,
      priority: true,
      status: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });

  for (const t of assignedTickets) {
    notifications.push({
      id: `ticket-${t.id}`,
      type: 'ticket_assigned',
      title: `Tiket ${t.ticketNumber}`,
      message: `${t.subject}${t.customerName ? ` — ${t.customerName}` : ''}`,
      link: `/technician/tickets?mine=true`,
      createdAt: t.updatedAt.toISOString(),
      priority: t.priority || 'NORMAL',
    });
  }

  // 2. ONT removal tasks assigned to this technician
  const ontTasks = await prisma.ontRemovalTask.findMany({
    where: {
      assignedToId: tech.id,
      assignedToType: tech.type === 'admin_user' ? 'ADMIN' : 'TECHNICIAN',
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      updatedAt: { gte: sinceDate },
    },
    select: {
      id: true,
      customerName: true,
      customerAddress: true,
      status: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });

  for (const task of ontTasks) {
    notifications.push({
      id: `ont-${task.id}`,
      type: 'ont_task',
      title: 'Tugas Lepas ONT',
      message: `${task.customerName}${task.customerAddress ? ` — ${task.customerAddress}` : ''}`,
      link: `/technician/ont-removal-tasks`,
      createdAt: task.updatedAt.toISOString(),
      priority: 'NORMAL',
    });
  }

  // Sort by most recent
  notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({
    success: true,
    notifications: notifications.slice(0, 20),
    count: notifications.length,
  });
}
