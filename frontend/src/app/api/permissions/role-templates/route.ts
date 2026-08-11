import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { AdminRole } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

/**
 * GET /api/permissions/role-templates
 * Get permission templates for all roles
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
