import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const moduleName = searchParams.get('module') || 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';

    const where: any = {
      // Exclude cron/automated system actions from activity log display
      NOT: {
        action: { in: ['health_check', 'auto_restart', 'auto_restart_failed'] },
      },
    };

    if (moduleName !== 'all') {
      where.module = moduleName;
    }

    if (search) {
      where.OR = [
        { username: { contains: search } },
        { description: { contains: search } },
        { action: { contains: search } },
        { ipAddress: { contains: search } },
      ];
    }

    const [activities, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          userRole: true,
          action: true,
          description: true,
          module: true,
          status: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
      prisma.activityLog.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      activities: activities.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
      total,
      hasMore: offset + limit < total,
    });
  } catch (error: any) {
    console.error('[Activity Logs API Error]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
