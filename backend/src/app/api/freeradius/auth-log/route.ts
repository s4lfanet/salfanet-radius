import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.view');
    if (!authCheck.authorized) return authCheck.response;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';
    const replyFilter = searchParams.get('reply') || 'all'; // all | accept | reject

    const where: any = {};
    if (search) {
      where.OR = [
        { username: { contains: search } },
      ];
    }
    if (replyFilter === 'accept') {
      where.reply = 'Access-Accept';
    } else if (replyFilter === 'reject') {
      where.reply = 'Access-Reject';
    }

    const [entries, total] = await Promise.all([
      prisma.radpostauth.findMany({
        where,
        orderBy: { authdate: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          username: true,
          reply: true,
          authdate: true,
          nasipaddress: true,
          nasportid: true,
        },
      }),
      prisma.radpostauth.count({ where }),
    ]);

    // Stats for today
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [acceptToday, rejectToday, totalAll] = await Promise.all([
      prisma.radpostauth.count({
        where: { reply: 'Access-Accept', authdate: { gte: startOfDay } },
      }),
      prisma.radpostauth.count({
        where: { reply: 'Access-Reject', authdate: { gte: startOfDay } },
      }),
      prisma.radpostauth.count(),
    ]);

    return NextResponse.json({
      success: true,
      entries,
      total,
      stats: {
        acceptToday,
        rejectToday,
        totalAll,
      },
    });
  } catch (error: any) {
    console.error('Error fetching RADIUS auth log:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch auth log' },
      { status: 500 }
    );
  }
}
