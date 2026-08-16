import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

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

    return NextResponse.json({
      success: true,
      status: pending.status,
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
