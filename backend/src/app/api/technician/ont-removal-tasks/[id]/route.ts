import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { jwtVerify } from 'jose';
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

// PATCH — technician completes or cancels their own ONT removal task
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const { action, notes } = await req.json() as { action: 'complete' | 'cancel'; notes?: string };

    if (!action || !['complete', 'cancel'].includes(action)) {
      return NextResponse.json({ error: 'action harus complete atau cancel' }, { status: 400 });
    }

    const task = await prisma.ontRemovalTask.findUnique({ where: { id } });
    if (!task) {
      return NextResponse.json({ error: 'Task tidak ditemukan' }, { status: 404 });
    }

    // Ownership check — a technician may only act on their own assigned tasks.
    if (task.assignedTechnicianId !== tech.id) {
      return NextResponse.json({ error: 'Anda tidak ditugaskan pada task ini' }, { status: 403 });
    }
    if (task.status !== 'PENDING') {
      return NextResponse.json({ error: 'Task sudah tidak pending' }, { status: 400 });
    }

    const updated = await prisma.ontRemovalTask.update({
      where: { id },
      data: action === 'complete'
        ? { status: 'COMPLETED', completedAt: new Date(), completedNotes: notes || null }
        : { status: 'CANCELLED', cancelledBy: tech.id, cancelledAt: new Date(), cancelReason: notes || null },
    });

    return NextResponse.json({ success: true, task: updated });
  } catch (error) {
    console.error('Technician ONT removal task update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
