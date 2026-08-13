import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import bcrypt from 'bcryptjs';
import { requirePermission } from '@/server/middleware/api-auth';

/**
 * PUT /api/admin/users/[id] - Update admin user
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check permission
  const authCheck = await requirePermission('users.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const { email, password, name, role, phone, isActive, permissions } = body;

    // Check if user exists
    const existing = await prisma.adminUser.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Format phone number to ensure it starts with 62
    let formattedPhone = phone;
    if (phone) {
      const normalized = phone.replace(/\D/g, '');
      formattedPhone = normalized.startsWith('62')
        ? normalized
        : normalized.startsWith('0')
        ? '62' + normalized.substring(1)
        : '62' + normalized;
    }

    // Prepare update data
    const updateData: any = {
      email: email || null,
      name,
      role,
      phone: formattedPhone || null,
      isActive,
    };

    // Only update password if provided
    if (password && password.trim() !== '') {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Update user
    const user = await prisma.adminUser.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        phone: true,
        createdAt: true,
      },
    });

    // Update custom permissions if provided
    if (permissions && Array.isArray(permissions)) {
      // Delete existing custom permissions
      await prisma.userPermission.deleteMany({
        where: { userId: id },
      });

      // Add new custom permissions
      if (permissions.length > 0) {
        const permissionRecords = await prisma.permission.findMany({
          where: { key: { in: permissions } },
          select: { id: true },
        });

        await prisma.userPermission.createMany({
          data: permissionRecords.map(p => ({
            userId: id,
            permissionId: p.id,
          })),
        });
      }
    }

    return NextResponse.json({
      success: true,
      user: { ...user, permissions: permissions || [] },
    });
  } catch (error: any) {
    console.error('Update admin user error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/users/[id] - Delete admin user
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check permission
  const authCheck = await requirePermission('users.delete');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { id } = await params;

    // Check if user exists
    const existing = await prisma.adminUser.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Prevent deleting super admin
    if (existing.username === 'superadmin') {
      return NextResponse.json(
        { success: false, error: 'Cannot delete super admin' },
        { status: 403 }
      );
    }

    // Delete user
    await prisma.adminUser.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete admin user error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
