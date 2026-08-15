import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import type { Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission('users.view');
    if (!auth.authorized) return auth.response;

    const searchParams = req.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const isActive = searchParams.get('isActive');

    // Build where clause
    const where: Prisma.technicianWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phoneNumber: { contains: search } },
        { email: { contains: search } },
      ];
    }

    if (isActive !== null && isActive !== '') {
      where.isActive = isActive === 'true';
    }

    // Get technicians with work order count
    const technicians = await prisma.technician.findMany({
      where,
      include: {
        _count: {
          select: {
            workOrders: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(technicians);
  } catch (error) {
    console.error('Get technicians error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch technicians' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission('users.create');
    if (!auth.authorized) return auth.response;

    const { name, phoneNumber, email, isActive, requireOtp } = await req.json();

    if (!name || !phoneNumber) {
      return NextResponse.json(
        { error: 'Name and phone number are required' },
        { status: 400 }
      );
    }

    // Normalize phone number
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    const formattedPhone = normalizedPhone.startsWith('62')
      ? normalizedPhone
      : normalizedPhone.startsWith('0')
      ? '62' + normalizedPhone.substring(1)
      : '62' + normalizedPhone;

    // Check if phone number already exists
    const existing = await prisma.technician.findUnique({
      where: { phoneNumber: formattedPhone },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Phone number already registered' },
        { status: 400 }
      );
    }

    // Create technician
    const technician = await prisma.technician.create({
      data: {
        name,
        phoneNumber: formattedPhone,
        email: email || null,
        isActive: isActive !== undefined ? isActive : true,
        requireOtp: requireOtp !== undefined ? requireOtp : true,
      },
    });

    return NextResponse.json(technician);
  } catch (error) {
    console.error('Create technician error:', error);
    return NextResponse.json(
      { error: 'Failed to create technician' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requirePermission('users.edit');
    if (!auth.authorized) return auth.response;

    const { id, name, phoneNumber, email, isActive, requireOtp } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Technician ID is required' },
        { status: 400 }
      );
    }

    // Check if technician exists
    const existing = await prisma.technician.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Technician not found' },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: Prisma.technicianUpdateInput = {};

    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email || null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (requireOtp !== undefined) updateData.requireOtp = requireOtp;

    if (phoneNumber !== undefined && phoneNumber !== existing.phoneNumber) {
      // Normalize phone number
      const normalizedPhone = phoneNumber.replace(/\D/g, '');
      const formattedPhone = normalizedPhone.startsWith('62')
        ? normalizedPhone
        : normalizedPhone.startsWith('0')
        ? '62' + normalizedPhone.substring(1)
        : '62' + normalizedPhone;

      // Check if new phone number already exists
      const phoneExists = await prisma.technician.findUnique({
        where: { phoneNumber: formattedPhone },
      });

      if (phoneExists && phoneExists.id !== id) {
        return NextResponse.json(
          { error: 'Phone number already registered' },
          { status: 400 }
        );
      }

      updateData.phoneNumber = formattedPhone;
    }

    // Update technician
    const technician = await prisma.technician.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(technician);
  } catch (error) {
    console.error('Update technician error:', error);
    return NextResponse.json(
      { error: 'Failed to update technician' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requirePermission('users.delete');
    if (!auth.authorized) return auth.response;

    const searchParams = req.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Technician ID is required' },
        { status: 400 }
      );
    }

    // Check if technician has active work orders
    const workOrderCount = await prisma.workOrder.count({
      where: {
        technicianId: id,
        status: {
          in: ['ASSIGNED', 'IN_PROGRESS'],
        },
      },
    });

    if (workOrderCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete technician with active work orders' },
        { status: 400 }
      );
    }

    // Delete technician (will cascade delete OTPs)
    await prisma.technician.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete technician error:', error);
    return NextResponse.json(
      { error: 'Failed to delete technician' },
      { status: 500 }
    );
  }
}
