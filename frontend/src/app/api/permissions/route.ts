import { NextRequest, NextResponse } from 'next/server';
import { getAllPermissionsGrouped } from '@/server/auth/permissions';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

/**
 * GET /api/permissions - Get all permissions grouped by category
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
