import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { handleInvoicePayment } from '@/server/services/payment/invoice-payment.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payment/qris-test — Simulasi pembayaran QRIS (admin only, for testing)
 * Body: { orderId } or { uniqueAmount } + optional { sourceApp }
 */
export async function POST(request: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.payment');
    if (!authCheck.authorized) return authCheck.response;

    const body = await request.json();
    const { orderId, uniqueAmount, sourceApp } = body;

    if (!orderId && (!uniqueAmount || uniqueAmount <= 0)) {
      return NextResponse.json(
        { error: 'orderId atau uniqueAmount wajib diisi' },
        { status: 400 }
      );
    }

    const now = new Date();

    const where: any = { status: 'pending' };
    if (orderId) {
      where.orderId = orderId;
    } else {
      where.uniqueAmount = uniqueAmount;
    }

    const pending = await prisma.qrisPending.findFirst({ where });

    if (!pending) {
      return NextResponse.json(
        { success: false, error: 'Tidak ada QRIS pending yang cocok. Pastikan invoice belum expired.' },
        { status: 404 }
      );
    }

    if (now > pending.expiresAt) {
      return NextResponse.json(
        { success: false, error: 'QRIS pending sudah expired', expiredAt: pending.expiresAt },
        { status: 400 }
      );
    }

    // Same path as a real listener notification, so the simulation tests
    // what customers will actually get: payment record, Keuangan, isolation
    // lifted, notifications.
    const claimed = await prisma.qrisPending.updateMany({
      where: { id: pending.id, status: 'pending' },
      data: { status: 'paid', sourceApp: sourceApp || 'test.simulation', paidAt: now },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ success: true, message: 'Sudah diproses sebelumnya', invoiceId: pending.invoiceId });
    }
    await handleInvoicePayment(pending.orderId, 'settlement', 'qris_own', 'simulation', now, pending.id);

    return NextResponse.json({
      success: true,
      message: 'Simulasi pembayaran QRIS berhasil',
      invoiceId: pending.invoiceId,
      amount: pending.uniqueAmount,
      paidAt: now.toISOString(),
    });
  } catch (error) {
    console.error('[QRIS Test] Error:', error);
    return NextResponse.json(
      { error: 'Failed to simulate QRIS payment', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
