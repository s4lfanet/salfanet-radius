import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import QRCode from 'qrcode';

export const dynamic = 'force-dynamic';

/**
 * GET /api/payment/qris-status — Check QRIS pending status (for frontend polling)
 * Query: ?orderId=xxx or ?invoiceId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const invoiceId = searchParams.get('invoiceId');

    if (!orderId && !invoiceId) {
      return NextResponse.json(
        { error: 'orderId atau invoiceId wajib diisi' },
        { status: 400 }
      );
    }

    const where: any = {};
    if (orderId) {
      where.orderId = orderId;
    } else {
      where.invoiceId = invoiceId;
    }

    const pending = await prisma.qrisPending.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (!pending) {
      return NextResponse.json(
        { error: 'QRIS pending not found' },
        { status: 404 }
      );
    }

    // While it can still be paid, include the QR itself, rendered here so
    // the payment payload is never sent to a third-party QR image service.
    const payable = pending.status === 'pending' && pending.expiresAt > new Date();
    const qrImage = payable
      ? await QRCode.toDataURL(pending.qrString, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
      : null;

    return NextResponse.json({
      success: true,
      status: payable || pending.status !== 'pending' ? pending.status : 'expired',
      qrString: payable ? pending.qrString : null,
      qrImage,
      invoiceId: pending.invoiceId,
      orderId: pending.orderId,
      baseAmount: pending.baseAmount,
      uniqueAmount: pending.uniqueAmount,
      expiresAt: pending.expiresAt,
      paidAt: pending.paidAt,
      sourceApp: pending.sourceApp,
    });
  } catch (error) {
    console.error('[QRIS Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check QRIS status' },
      { status: 500 }
    );
  }
}
