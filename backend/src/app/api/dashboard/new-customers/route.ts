import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { nowWIB, WIB_TIMEZONE } from '@/lib/timezone';
import { formatInTimeZone } from 'date-fns-tz';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/dashboard/new-customers?month=YYYY-MM
// List of pppoeUser records created within the given calendar month — the
// per-customer detail behind /api/dashboard/analytics?type=users' `growth`
// count. Uses the same UTC month-bucket boundaries as that endpoint's
// `newUsers` count (Date.UTC(year, month, 1) .. end of month) so the two
// numbers always agree for the same month.
export async function GET(request: NextRequest) {
  try {
    const authCheck = await requirePermission('dashboard.view');
    if (!authCheck.authorized) return authCheck.response;

    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get('month');

    let year: number;
    let month: number; // 0-based
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      year = parseInt(monthParam.substring(0, 4), 10);
      month = parseInt(monthParam.substring(5, 7), 10) - 1;
    } else {
      const wibNow = nowWIB();
      const wibMonthStr = formatInTimeZone(wibNow, WIB_TIMEZONE, 'yyyy-MM');
      year = parseInt(wibMonthStr.substring(0, 4), 10);
      month = parseInt(wibMonthStr.substring(5, 7), 10) - 1;
    }

    const startOfMonth = new Date(Date.UTC(year, month, 1));
    const endOfMonth = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));

    const customers = await prisma.pppoeUser.findMany({
      where: { createdAt: { gte: startOfMonth, lte: endOfMonth } },
      select: {
        id: true,
        name: true,
        username: true,
        phone: true,
        status: true,
        createdAt: true,
        subscriptionType: true,
        profile: { select: { name: true } },
        area: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      month: `${year}-${String(month + 1).padStart(2, '0')}`,
      count: customers.length,
      customers,
    });
  } catch (error) {
    console.error('Error fetching new customers:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch new customers' },
      { status: 500 }
    );
  }
}
