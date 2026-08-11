import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const userIds = searchParams.get('userIds')?.split(',').filter(Boolean);

    if (!userIds || userIds.length === 0) {
      return NextResponse.json(
        { error: 'User IDs are required' },
        { status: 400 }
      );
    }

    // Get unpaid invoice counts for each user
    const invoiceCounts = await prisma.invoice.groupBy({
      by: ['userId'],
      where: {
        userId: { in: userIds },
        status: { in: ['PENDING', 'OVERDUE'] },
      },
      _count: {
        id: true,
      },
    });

    // Convert to map for easier lookup
    const countsMap: Record<string, number> = {};
    invoiceCounts.forEach(item => {
      if (item.userId) {
        countsMap[item.userId] = item._count.id;
      }
    });

    return NextResponse.json({
      success: true,
      counts: countsMap,
    });
  } catch (error: any) {
    console.error('Get invoice counts error:', error);
    return NextResponse.json(
      { error: 'Failed to get invoice counts' },
      { status: 500 }
    );
  }
}
