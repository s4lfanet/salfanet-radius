import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Server-side amount extraction from raw notification text.
 * Same patterns as QrisNotificationListener.kt PAYMENT_PATTERNS.
 * Used as fallback when Android app can't parse amount (e.g. new DANA Bisnis format).
 */
const PAYMENT_PATTERNS: RegExp[] = [
  /(?:menerima|diterima|masuk|received|transfer\s+masuk|pembayaran\s+masuk)[^Rp0-9]*[Rp\s]*(\d{1,3}(?:[.,]\d{3})*)/iu,
  /Rp\s*(\d{1,3}(?:[.,]\d{3})*)(?:\s*telah\s*diterima|\s*berhasil\s*diterima)/iu,
  /Rp\s*(\d{1,3}(?:[.,]\d{3})*)\s+dari\s+\S+\s+berhasil\s+diterima/iu,
  /berhasil\s+diterima\s+Rp\s*(\d{1,3}(?:[.,]\d{3})*)/iu,
  /(?:kamu|anda)?\s*menerima\s+[Rp\s]*(\d{1,3}(?:[.,]\d{3})*)/iu,
  /Rp\s*(\d{1,3}(?:[.,]\d{3})*)\s+diterima\b/iu,
];

function extractAmountFromText(text: string): number | null {
  for (const pattern of PAYMENT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const cleaned = match[1].replace(/[.,]/g, '');
      const val = parseInt(cleaned, 10);
      if (val > 0) return val;
    }
  }
  return null;
}

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
    const { device_key, source_app, raw_text, timestamp } = body;
    let amount = typeof body.amount === 'number' ? body.amount : 0;

    // Server-side fallback: if amount not sent or 0, parse from raw_text
    // (same as PHP qris_notify.php — supports MacroDroid/Tasker and cases
    //  where Android app regex didn't match the notification format)
    if ((!amount || amount <= 0) && raw_text) {
      amount = extractAmountFromText(raw_text) ?? 0;
    }

    if (!device_key || !amount || amount <= 0) {
      return NextResponse.json(
        { error: 'device_key dan amount wajib diisi (langsung atau lewat raw_text yang bisa di-parse)' },
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
