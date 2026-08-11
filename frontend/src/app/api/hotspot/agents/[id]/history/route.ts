import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { formatWIB } from '@/lib/timezone';

// GET - Get agent sales history grouped by month
// Gets data from used vouchers (ACTIVE/EXPIRED) with agentId
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    // Get used vouchers for this agent (ACTIVE or EXPIRED with firstLoginAt)
    const usedVouchers = await prisma.hotspotVoucher.findMany({
      where: {
        agentId: id,
        status: { in: ['ACTIVE', 'EXPIRED'] },
        firstLoginAt: { not: null },
      },
      include: {
        profile: true,
      },
      orderBy: {
        firstLoginAt: 'desc',
      },
    });

    // Transform vouchers to sales format
    const sales = usedVouchers.map((v) => ({
      id: v.id,
      voucherCode: v.code,
      profileName: v.profile.name,
      amount: v.profile.resellerFee, // Agent profit is resellerFee
      createdAt: v.firstLoginAt!,
    }));

    if (month && year) {
      // Get specific month sales
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);

      const monthSales = sales.filter((sale) => {
        const saleDate = new Date(sale.createdAt);
        return (
          saleDate.getMonth() === monthNum &&
          saleDate.getFullYear() === yearNum
        );
      });

      const total = monthSales.reduce((sum, sale) => sum + sale.amount, 0);

      return NextResponse.json({
        month: monthNum,
        year: yearNum,
        total,
        count: monthSales.length,
        sales: monthSales,
      });
    }

    // Group sales by month
    const groupedByMonth: Record<string, any[]> = {};

    sales.forEach((sale) => {
      const saleDate = new Date(sale.createdAt);
      const key = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (!groupedByMonth[key]) {
        groupedByMonth[key] = [];
      }
      groupedByMonth[key].push(sale);
    });

    // Calculate totals for each month
    const monthlyStats = Object.entries(groupedByMonth).map(([key, monthSales]) => {
      const [yearStr, monthStr] = key.split('-');
      const total = monthSales.reduce((sum, sale) => sum + sale.amount, 0);

      return {
        year: parseInt(yearStr),
        month: parseInt(monthStr),
        monthName: formatWIB(new Date(parseInt(yearStr), parseInt(monthStr) - 1), 'MMMM yyyy'),
        total,
        count: monthSales.length,
      };
    });

    // Sort by year and month descending
    monthlyStats.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    return NextResponse.json({
      history: monthlyStats,
    });
  } catch (error) {
    console.error('Get agent history error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
