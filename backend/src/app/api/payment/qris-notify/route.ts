import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payment/qris-notify — Webhook dari Android QrisListener app
 * Public endpoint (no auth) but protected by device_key
 * Body: { device_key, amount, source_app, raw_text, timestamp }
 */
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, RateLimitPresets.strict);
    if (limited) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { device_key, amount, source_app, raw_text, timestamp } = body;

    if (!device_key || !amount || amount <= 0) {
      return NextResponse.json(
        { error: 'device_key dan amount wajib diisi' },
        { status: 400 }
      );
    }

    // Validate device_key
    const company = await prisma.company.findFirst();
    if (!company || !company.qrisDeviceKey || company.qrisDeviceKey !== device_key) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find matching pending QRIS by unique_amount
    const now = new Date();
    const pending = await prisma.qrisPending.findFirst({
      where: {
        uniqueAmount: amount,
        status: 'pending',
        expiresAt: { gt: now },
      },
    });

    if (!pending) {
      return NextResponse.json({
        success: false,
        error: 'Tidak ada invoice pending yang cocok dengan nominal tersebut (mungkin expired)',
      });
    }

    // Mark as paid
    await prisma.qrisPending.update({
      where: { id: pending.id },
      data: {
        status: 'paid',
        sourceApp: source_app || 'unknown',
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

        // Extend subscription
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
      message: 'Pembayaran QRIS berhasil diverifikasi otomatis',
      invoiceId: pending.invoiceId,
      amount: pending.baseAmount,
    });
  } catch (error) {
    console.error('[QRIS Notify] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process QRIS notification' },
      { status: 500 }
    );
  }
}
