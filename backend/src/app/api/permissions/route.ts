import { NextRequest, NextResponse } from 'next/server';
import { getAllPermissionsGrouped } from '@/server/auth/permissions';
import { requirePermission } from '@/server/middleware/api-auth';

/**
 * GET /api/permissions - Get all permissions grouped by category
 */
export async function GET(request: NextRequest) {
  try {
    const authCheck = await requirePermission('users.permissions');
    if (!authCheck.authorized) return authCheck.response;

    const grouped = await getAllPermissionsGrouped();

    return NextResponse.json({
      success: true,
      permissions: grouped,
    });
  } catch (error: any) {
    console.error('Get permissions error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
