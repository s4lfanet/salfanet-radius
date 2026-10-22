import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import bcrypt from 'bcryptjs';
import { requirePermission } from '@/server/middleware/api-auth';
import { cleanRouterIds, parseRouterIds, NO_SCOPE_ERROR } from '@/server/auth/collector-scope';
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
    const { email, password, name, role, phone, isActive, permissions, areaId, collectorRouterIds } = body;

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
    // TECHNICIAN stays valid for accounts that already have it, but no other
    // account can be switched to it; new technicians go in Kelola Teknisi.
    const allowedRoles = ['FINANCE', 'CUSTOMER_SERVICE', 'TECHNICIAN', 'MARKETING', 'SUPER_ADMIN', 'VIEWER', 'COLLECTOR'];
    if (role !== undefined && !allowedRoles.includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Invalid role' },
        { status: 400 }
      );
    }
    if (role === 'TECHNICIAN' && existing.role !== 'TECHNICIAN') {
      return NextResponse.json({ success: false, error: 'Akun teknisi dibuat di menu Teknisi (Kelola Teknisi), bukan di Admin & Role.' }, { status: 400 });
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
    // Fields left out of the request keep their value; sending them empty
    // clears them. (A status toggle used to wipe email and phone.)
    const updateData: Prisma.adminUserUpdateInput = {};
    if (email !== undefined) updateData.email = email || null;
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = formattedPhone || null;
    if (areaId !== undefined) updateData.area = areaId ? { connect: { id: areaId } } : { disconnect: true };

    // Collector scope after this change must still name an area or a router.
    if ((role ?? existing.role) === 'COLLECTOR') {
      const routerIds = await cleanRouterIds(collectorRouterIds);
      if (routerIds !== undefined) updateData.collectorRouterIds = routerIds;
      const nextArea = areaId !== undefined ? areaId : existing.areaId;
      const nextRouters = routerIds ?? parseRouterIds(existing.collectorRouterIds);
      if (!nextArea && !nextRouters.length) {
        return NextResponse.json({ success: false, error: NO_SCOPE_ERROR }, { status: 400 });
      }
    }
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

    // Invoices keep the collector only as an id (paidById). Deleting one who
    // already collected would drop those payments from the settlement recap,
    // so such a collector is deactivated instead.
    if (existing.role === 'COLLECTOR') {
      const collected = await prisma.invoice.count({ where: { paidById: id } });
      if (collected > 0) {
        return NextResponse.json(
          { success: false, error: `Kolektor ini sudah menagih ${collected} tagihan. Nonaktifkan saja agar riwayat setorannya tetap tercatat.` },
          { status: 409 }
        );
      }
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
