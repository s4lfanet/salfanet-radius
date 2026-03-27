import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { logActivity } from '@/server/services/activity-log.service';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { orderIds } = await req.json();

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid order IDs' },
        { status: 400 }
      );
    }

    // Delete vouchers associated with orders first
    await prisma.hotspotVoucher.deleteMany({
      where: {
        orderId: {
          in: orderIds,
        },
      },
    });

    // Delete orders
    const result = await prisma.voucherOrder.deleteMany({
      where: {
        id: {
          in: orderIds,
        },
      },
    });

    // Log activity
    await logActivity({
      userId: session.user.id,
      username: session.user.username,
      userRole: session.user.role,
      action: 'BULK_DELETE_ORDERS',
      description: `Bulk deleted ${result.count} e-voucher order(s)`,
      module: 'voucher',
      status: 'success',
      metadata: { orderIds, count: result.count },
    });

    return NextResponse.json({
      success: true,
      deleted: result.count,
    });
  } catch (error: any) {
    console.error('Bulk delete orders error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
