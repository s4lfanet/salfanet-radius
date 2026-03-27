import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';

export async function GET(req: NextRequest) {
  try {
    // Get token from cookie
    const token = req.cookies.get('technician-token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Verify JWT
    const secret = TECH_JWT_SECRET;

    const { payload } = await jwtVerify(token, secret);
    let technicianId: string;
    if (payload.type === 'admin_user') {
      const adminUser = await prisma.adminUser.findUnique({
        where: { id: payload.id as string },
        select: { id: true, isActive: true, role: true },
      });
      if (!adminUser?.isActive || adminUser.role !== 'TECHNICIAN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      technicianId = adminUser.id;
    } else {
      technicianId = payload.id as string;
    }

    // Get query parameters
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status') || undefined;
    const priority = searchParams.get('priority') || undefined;

    // Build where clause
    const where: any = {};
    
    // Filter by technician if specified, otherwise show unassigned or assigned to this technician
    if (searchParams.get('mine') === 'true') {
      where.technicianId = technicianId;
    } else {
      where.OR = [
        { technicianId: null },
        { technicianId: technicianId },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (priority) {
      where.priority = priority;
    }

    // Get work orders
    const workOrders = await prisma.workOrder.findMany({
      where,
      include: {
        technician: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({
      success: true,
      workOrders,
    });
  } catch (error) {
    console.error('Get work orders error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch work orders' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Get token from cookie
    const token = req.cookies.get('technician-token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Verify JWT
    const secret = TECH_JWT_SECRET;

    const { payload } = await jwtVerify(token, secret);
    let technicianId: string;
    if (payload.type === 'admin_user') {
      const adminUser = await prisma.adminUser.findUnique({
        where: { id: payload.id as string },
        select: { id: true, isActive: true, role: true },
      });
      if (!adminUser?.isActive || adminUser.role !== 'TECHNICIAN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      technicianId = adminUser.id;
    } else {
      technicianId = payload.id as string;
    }

    const { workOrderId, action } = await req.json();

    if (!workOrderId || !action) {
      return NextResponse.json(
        { error: 'Work order ID and action are required' },
        { status: 400 }
      );
    }

    // Get work order
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
    });

    if (!workOrder) {
      return NextResponse.json(
        { error: 'Work order not found' },
        { status: 404 }
      );
    }

    // Handle different actions
    let updatedWorkOrder;

    switch (action) {
      case 'ASSIGN':
        // Assign to technician
        if (workOrder.technicianId && workOrder.technicianId !== technicianId) {
          return NextResponse.json(
            { error: 'Work order already assigned to another technician' },
            { status: 400 }
          );
        }
        updatedWorkOrder = await prisma.workOrder.update({
          where: { id: workOrderId },
          data: {
            technicianId,
            status: 'ASSIGNED',
          },
        });
        break;

      case 'START':
        // Start work
        if (workOrder.technicianId !== technicianId) {
          return NextResponse.json(
            { error: 'You are not assigned to this work order' },
            { status: 403 }
          );
        }
        updatedWorkOrder = await prisma.workOrder.update({
          where: { id: workOrderId },
          data: {
            status: 'IN_PROGRESS',
          },
        });
        break;

      case 'COMPLETE':
        // Complete work
        if (workOrder.technicianId !== technicianId) {
          return NextResponse.json(
            { error: 'You are not assigned to this work order' },
            { status: 403 }
          );
        }
        updatedWorkOrder = await prisma.workOrder.update({
          where: { id: workOrderId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });
        break;

      case 'CANCEL':
        // Cancel assignment
        if (workOrder.technicianId !== technicianId) {
          return NextResponse.json(
            { error: 'You are not assigned to this work order' },
            { status: 403 }
          );
        }
        updatedWorkOrder = await prisma.workOrder.update({
          where: { id: workOrderId },
          data: {
            technicianId: null,
            status: 'OPEN',
          },
        });
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      workOrder: updatedWorkOrder,
    });
  } catch (error) {
    console.error('Update work order error:', error);
    return NextResponse.json(
      { error: 'Failed to update work order' },
      { status: 500 }
    );
  }
}
