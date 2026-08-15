import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

export async function GET() {
  try {
    const authCheck = await requirePermission('invoices.view');
    if (!authCheck.authorized) return authCheck.response;
    const session = authCheck.session;

    const orders = await prisma.voucherOrder.findMany({
      include: {
        profile: {
          select: {
            name: true,
            speed: true,
            validityValue: true,
            validityUnit: true,
          },
        },
        vouchers: {
          select: {
            id: true,
            code: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      orders,
    });
  } catch (error: any) {
    console.error('Get orders error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
