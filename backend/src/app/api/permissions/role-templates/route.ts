import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { AdminRole } from '@prisma/client';
import { requirePermission } from '@/server/middleware/api-auth';

/**
 * GET /api/permissions/role-templates
 * Get permission templates for all roles
 */
export async function GET() {
  try {
    const authCheck = await requirePermission('users.permissions');
    if (!authCheck.authorized) return authCheck.response;

    // Fetch all role permissions grouped by role
    const rolePermissions = await prisma.rolePermission.findMany({
      include: {
        permission: {
          select: {
            id: true,
            key: true,
            name: true,
            category: true,
          },
        },
      },
    });

    // Group by role
    const templates: Record<AdminRole, string[]> = {
      SUPER_ADMIN: [],
      FINANCE: [],
      CUSTOMER_SERVICE: [],
      TECHNICIAN: [],
      MARKETING: [],
      VIEWER: [],
    };

    rolePermissions.forEach((rp) => {
      templates[rp.role].push(rp.permission.key);
    });

    return NextResponse.json({
      success: true,
      templates,
    });
  } catch (error) {
    console.error('Error fetching role templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch role templates' },
      { status: 500 }
    );
  }
}
