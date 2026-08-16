import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';

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

    // Mark as paid
    await prisma.qrisPending.update({
      where: { id: pending.id },
      data: {
        status: 'paid',
        sourceApp: sourceApp || 'test.simulation',
        paidAt: now,
      },
    });

    // Update invoice
    if (pending.invoiceId) {
      const invoice = await prisma.invoice.findUnique({ where: { id: pending.invoiceId } });
      if (invoice && invoice.status !== 'PAID') {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'PAID', paidAt: now },
        });

        // Extend subscription if user exists
        if (invoice.userId) {
          const user = await prisma.pppoeUser.findUnique({
            where: { id: invoice.userId },
            include: { profile: true },
          });

          if (user && user.profile) {
            let newExpiry = user.expiredAt || now;
            const validity = user.profile.validityValue || 1;
            if (user.profile.validityUnit === 'MONTHS') {
              newExpiry = new Date(newExpiry.setMonth(newExpiry.getMonth() + validity));
            } else {
              newExpiry = new Date(newExpiry.setDate(newExpiry.getDate() + validity));
            }

            await prisma.pppoeUser.update({
              where: { id: user.id },
              data: {
                expiredAt: newExpiry,
                lastPaymentDate: now,
                status: 'active',
              },
            });
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Simulasi pembayaran QRIS berhasil',
      invoiceId: pending.invoiceId,
      orderId: pending.orderId,
      baseAmount: pending.baseAmount,
      uniqueAmount: pending.uniqueAmount,
      sourceApp: sourceApp || 'test.simulation',
    });
  } catch (error) {
    console.error('[QRIS Test] Error:', error);
    return NextResponse.json(
      { error: 'Failed to simulate QRIS payment', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
