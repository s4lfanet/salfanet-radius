import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import bcrypt from 'bcryptjs';
import { requirePermission } from '@/server/middleware/api-auth';

/**
 * GET /api/admin/users - Get all admin users
 */
export async function GET(request: NextRequest) {
  // Check permission
  const authCheck = await requirePermission('users.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const users = await prisma.adminUser.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
        lastLogin: true,
        userPermissions: {
          select: {
            permission: {
              select: {
                key: true,
              },
            },
          },
        },
      },
    });

    // Transform to include permissions array
    const usersWithPermissions = users.map(user => ({
      ...user,
      permissions: user.userPermissions.map(up => up.permission.key),
      userPermissions: undefined,
    }));

    return NextResponse.json({
      success: true,
      users: usersWithPermissions,
    });
  } catch (error: any) {
    console.error('Get admin users error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/users - Create new admin user
 */
export async function POST(request: NextRequest) {
  // Check permission
  const authCheck = await requirePermission('users.create');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const body = await request.json();
    const { username, email, password, name, role, phone, isActive, permissions } = body;

    // Validate required fields
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
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

    // Check if username already exists
    const existing = await prisma.adminUser.findUnique({
      where: { username },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Username already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with permissions
    const user = await prisma.adminUser.create({
      data: {
        username,
        email: email || null,
        password: hashedPassword,
        name: name || username,
        role: role || 'OPERATOR',
        phone: formattedPhone || null,
        isActive: isActive !== undefined ? isActive : true,
      },
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

    // Add custom permissions if provided
    if (permissions && Array.isArray(permissions) && permissions.length > 0) {
      const permissionRecords = await prisma.permission.findMany({
        where: { key: { in: permissions } },
        select: { id: true },
      });

      await prisma.userPermission.createMany({
        data: permissionRecords.map(p => ({
          userId: user.id,
          permissionId: p.id,
        })),
      });
    }

    return NextResponse.json({
      success: true,
      user: { ...user, permissions: permissions || [] },
    });
  } catch (error: any) {
    console.error('Create admin user error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
