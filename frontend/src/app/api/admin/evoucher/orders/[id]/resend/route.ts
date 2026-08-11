import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { sendVoucherPurchaseSuccess } from '@/server/services/notifications/whatsapp-templates.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    // Get order with vouchers
    const order = await prisma.voucherOrder.findUnique({
      where: { id },
      include: {
        profile: true,
        vouchers: true,
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      );
    }

    if (order.status !== 'PAID') {
      return NextResponse.json(
        { success: false, error: 'Only paid orders can resend vouchers' },
        { status: 400 }
      );
    }

    if (order.vouchers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No vouchers found for this order' },
        { status: 400 }
      );
    }

    // Get company info
    const company = await prisma.company.findFirst();

    // Resend WhatsApp notification
    try {
      await sendVoucherPurchaseSuccess({
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        profileName: order.profile.name,
        quantity: order.quantity,
        orderNumber: order.orderNumber,
        voucherCodes: order.vouchers.map(v => v.code),
        validityValue: order.profile.validityValue,
        validityUnit: order.profile.validityUnit,
      });

      console.log(`✅ Vouchers resent for order ${order.orderNumber}`);

      return NextResponse.json({
        success: true,
        message: 'Vouchers resent successfully',
      });
    } catch (waError) {
      console.error('WhatsApp send error:', waError);
      return NextResponse.json(
        { success: false, error: 'Failed to send WhatsApp notification' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Resend voucher error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
