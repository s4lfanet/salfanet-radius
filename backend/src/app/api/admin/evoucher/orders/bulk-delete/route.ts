import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { logActivity } from '@/server/services/activity-log.service';
import { requirePermission } from '@/server/middleware/api-auth';

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission('invoices.delete');
    if (!auth.authorized) return auth.response;

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
    const sessionUser = auth.session?.user as { id?: string; username?: string; role?: string } | undefined;
    await logActivity({
      userId: auth.userId,
      username: sessionUser?.username || 'admin',
      userRole: sessionUser?.role || 'ADMIN',
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
