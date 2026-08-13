import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { jwtVerify } from 'jose';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';

async function verifyTechnicianAuth(req: NextRequest) {
  try {
    const token = req.cookies.get('technician-token')?.value;
    if (!token) {
      return null;
    }

    const secret = TECH_JWT_SECRET;

    const { payload } = await jwtVerify(token, secret);
    if (payload.type === 'admin_user') {
      const adminUser = await prisma.adminUser.findUnique({
        where: { id: payload.id as string },
        select: { id: true, name: true, phone: true, isActive: true, role: true },
      });
      if (!adminUser?.isActive || adminUser.role !== 'TECHNICIAN') return null;
      return { id: adminUser.id, name: adminUser.name, phoneNumber: adminUser.phone, isActive: true };
    }
    const technician = await prisma.technician.findUnique({
      where: { id: payload.id as string, isActive: true },
    });

    return technician;
  } catch (error) {
    return null;
  }
}

// GET - Get tasks assigned to technician
export async function GET(req: NextRequest) {
  try {
    const technician = await verifyTechnicianAuth(req);
    if (!technician) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const where: any = {
      technicianId: technician.id,
    };

    if (status) {
      where.status = status;
    }

    const tasks = await prisma.workOrder.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { scheduledDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

// PUT - Update task status and add notes
export async function PUT(req: NextRequest) {
  try {
    const technician = await verifyTechnicianAuth(req);
    if (!technician) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id, status, technicianNotes } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      );
    }

    // Verify task belongs to this technician
    const existingTask = await prisma.workOrder.findUnique({
      where: { id },
    });

    if (!existingTask) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    if (existingTask.technicianId !== technician.id) {
      return NextResponse.json(
        { error: 'You are not assigned to this task' },
        { status: 403 }
      );
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (status !== undefined) {
      updateData.status = status;
      if (status === 'COMPLETED' && !existingTask.completedAt) {
        updateData.completedAt = new Date();
      }
    }

    if (technicianNotes !== undefined) {
      updateData.technicianNotes = technicianNotes;
    }

    const task = await prisma.workOrder.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    );
  }
}
