import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import bcrypt from 'bcryptjs';
import { requirePermission } from '@/server/middleware/api-auth';
import { isSuperAdmin } from '@/server/auth/permissions';
import type { Prisma } from '@prisma/client';

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

    // Validate role against allowlist if provided
    const allowedRoles = ['OPERATOR', 'FINANCE', 'CUSTOMER_SERVICE', 'TECHNICIAN', 'MARKETING', 'SUPER_ADMIN'];
    if (role !== undefined && !allowedRoles.includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Invalid role' },
        { status: 400 }
      );
    }

    // Prevent SUPER_ADMIN escalation unless caller is SUPER_ADMIN
    if (role === 'SUPER_ADMIN' && existing.role !== 'SUPER_ADMIN') {
      const callerIsSuper = await isSuperAdmin(authCheck.userId);
      if (!callerIsSuper) {
        return NextResponse.json(
          { success: false, error: 'Cannot grant SUPER_ADMIN role' },
          { status: 403 }
        );
      }
    }

    // Prevent deactivating or demoting the superadmin account
    if (existing.username === 'superadmin') {
      if (role !== undefined && role !== 'SUPER_ADMIN') {
        return NextResponse.json(
          { success: false, error: 'Cannot demote superadmin' },
          { status: 403 }
        );
      }
      if (isActive === false) {
        return NextResponse.json(
          { success: false, error: 'Cannot deactivate superadmin' },
          { status: 403 }
        );
      }
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

    // Prepare update data with explicit typing
    const updateData: Prisma.adminUserUpdateInput = {
      email: email || null,
      name,
      phone: formattedPhone || null,
    };
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;

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
