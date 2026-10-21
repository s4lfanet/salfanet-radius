import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { getTimezoneOffsetMs, refreshTimezoneFromDB, todayWIBStr } from '@/lib/timezone';

export const dynamic = 'force-dynamic';

/**
 * radpostauth is written by FreeRADIUS, which stores authdate as the
 * server's local wall-clock time (company timezone). Prisma reads a DATETIME
 * as UTC, so the raw value is the local time with a Z: shown as-is it was
 * 7 hours ahead in WIB, and "today" counted from 07:00 the day before.
 * Values are converted to real instants for the response, and filters are
 * built in the same wall-clock form the column uses.
 */
export async function GET(request: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.view');
    if (!authCheck.authorized) return authCheck.response;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';
    const replyFilter = searchParams.get('reply') || 'all'; // all | accept | reject

    await refreshTimezoneFromDB().catch(() => {});
    const tzOffsetMs = getTimezoneOffsetMs();

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
        },
      }),
      prisma.radpostauth.count({ where }),
    ]);

    // Midnight today in the company timezone, written the way the column stores it.
    const startOfDay = new Date(`${todayWIBStr()}T00:00:00.000Z`);
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
      entries: entries.map((e) => ({ ...e, authdate: new Date(e.authdate.getTime() - tzOffsetMs) })),
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
