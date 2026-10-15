import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { sendVoucherOrderMessage } from '@/server/services/notifications/voucher-order-notify.service';
import { requirePermission } from '@/server/middleware/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission('invoices.approve');
    if (!auth.authorized) return auth.response;
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

    const sent = await sendVoucherOrderMessage('purchase', order, order.vouchers.map(v => v.code));
    const label = { sent: 'terkirim', failed: 'gagal', skipped: 'tidak ada kontak' } as const;
    const summary = `WhatsApp ${label[sent.whatsapp]}, email ${label[sent.email]}`;

    if (sent.whatsapp !== 'sent' && sent.email !== 'sent') {
      return NextResponse.json(
        { success: false, error: `Voucher tidak terkirim (${summary}). ${sent.errors.join('; ')}`.trim(), result: sent },
        { status: 502 }
      );
    }
    return NextResponse.json({ success: true, message: `Voucher dikirim ulang: ${summary}.`, result: sent });
  } catch (error: any) {
    console.error('Resend voucher error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
