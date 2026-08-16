import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';

export async function GET(request: NextRequest) {
  try {
    const authCheck = await requirePermission('notifications.view');
    if (!authCheck.authorized) return authCheck.response;

    // Allow any authenticated admin user - removed strict role check
    // Most admin users in this system don't have explicit 'ADMIN' role in session

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};
    if (status && status !== 'all') {
      where.status = status;
    }

    // Get total count
    const total = await prisma.emailHistory.count({ where });

    // Get email history
    const history = await prisma.emailHistory.findMany({
      where,
      orderBy: {
        sentAt: 'desc',
      },
      skip,
      take: limit,
    });

    return NextResponse.json({
      success: true,
      history,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Email history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email history' },
      { status: 500 }
    );
  }
}
