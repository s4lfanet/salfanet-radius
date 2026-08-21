import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';
import { verifyQrisSignature, claimNonce } from '@/lib/qris-signature';

export const dynamic = 'force-dynamic';

// Kill-switch for V2 signature verification
const QRIS_V2_ENABLED = true;

/**
 * Server-side amount extraction from raw notification text.
 * Same patterns as QrisNotificationListener.kt PAYMENT_PATTERNS.
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

// ─── In-memory dedup: reject same device_key:amount within 5 minutes ────────
const DEDUP_TTL_MS = 5 * 60 * 1000;
const dedupCache = new Map<string, number>();

function checkDedup(deviceKey: string, amount: number): boolean {
  const key = `${deviceKey}:${amount}`;
  const now = Date.now();
  // Clean expired
  for (const [k, t] of dedupCache.entries()) {
    if (now - t > DEDUP_TTL_MS) dedupCache.delete(k);
  }
  if (dedupCache.has(key)) return true; // duplicate
  dedupCache.set(key, now);
  return false;
}

function removeDedup(deviceKey: string, amount: number) {
  dedupCache.delete(`${deviceKey}:${amount}`);
}

/**
 * POST /api/payment/qris-notify — Webhook dari Android QrisListener app
 * Public endpoint (no auth) but protected by device_key (+ optional V2 HMAC)
 *
 * V1: { device_key, amount, source_app, raw_text, timestamp }
 * V2: above + { nonce, signature } where signature = HMAC-SHA256(device_secret, "device_key|amount|timestamp|nonce")
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
    const { device_key, source_app, raw_text, nonce, signature } = body;
    let amount = typeof body.amount === 'number' ? body.amount : 0;
    const timestamp = typeof body.timestamp === 'number' ? body.timestamp : 0;

    // Server-side fallback: parse amount from raw_text if not sent
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

    // ─── V2 signature verification (opt-in via `signature` field) ──────────
    if (signature && signature !== '') {
      if (!QRIS_V2_ENABLED) {
        return NextResponse.json(
          { error: 'QRIS V2 signature verification is temporarily unavailable' },
          { status: 503 }
        );
      }

      const deviceSecret = company.qrisDeviceSecret || '';
      const verifyResult = verifyQrisSignature(
        deviceSecret,
        device_key,
        amount,
        timestamp,
        nonce || '',
        signature
      );

      if (!verifyResult.valid) {
        console.error('[QRIS Notify V2] Signature rejected:', verifyResult.reason, 'deviceKey=', device_key.substring(0, 8));
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }

      // Nonce replay protection
      if (!claimNonce(device_key, nonce || '')) {
        console.error('[QRIS Notify V2] Nonce replay detected:', device_key.substring(0, 8));
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    }

    // ─── Server-side dedup ──────────────────────────────────────────────────
    if (checkDedup(device_key, amount)) {
      console.log('[QRIS Notify] DEDUP: amount=' + amount + ' deviceKey=' + device_key.substring(0, 8) + ' already processed');
      return NextResponse.json({
        success: true,
        message: 'Already processed (dedup)',
        dedup: true,
      });
    }

    // ─── Find matching pending QRIS by unique_amount ────────────────────────
    const now = new Date();
    const pending = await prisma.qrisPending.findFirst({
      where: {
        uniqueAmount: amount,
        status: 'pending',
        expiresAt: { gt: now },
      },
    });

    if (!pending) {
      removeDedup(device_key, amount);
      return NextResponse.json({
        success: false,
        error: 'Tidak ada invoice pending yang cocok dengan nominal Rp' + amount.toLocaleString('id-ID') + ' (mungkin expired)',
      });
    }

    // ─── Atomic settlement via DB transaction ───────────────────────────────
    // Prevents double-credit from concurrent notifications for the same amount
    const result = await prisma.$transaction(async (tx) => {
      // Re-read under transaction lock — concurrent notification may have already settled
      const freshPending = await tx.qrisPending.findUnique({ where: { id: pending.id } });
      if (!freshPending || freshPending.status === 'paid') {
        return { alreadyPaid: true, pending: freshPending };
      }

      // Mark QRIS pending as paid
      await tx.qrisPending.update({
        where: { id: pending.id },
        data: {
          status: 'paid',
          sourceApp: source_app || 'unknown',
          paidAt: now,
        },
      });

      // Update invoice if exists
      if (pending.invoiceId) {
        const invoice = await tx.invoice.findUnique({ where: { id: pending.invoiceId } });
        if (invoice && invoice.status !== 'PAID') {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { status: 'PAID', paidAt: now },
          });

          // Extend subscription if user exists
          if (invoice.userId) {
            const user = await tx.pppoeUser.findUnique({
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

              await tx.pppoeUser.update({
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

      return { alreadyPaid: false, pending: freshPending };
    });

    if (result.alreadyPaid) {
      return NextResponse.json({
        success: true,
        message: 'Pembayaran sudah diproses sebelumnya',
        invoiceId: pending.invoiceId,
        paid: true,
      });
    }

    console.log('[QRIS Notify] OK invoiceId=' + pending.invoiceId + ' amount=' + amount);

    return NextResponse.json({
      success: true,
      message: 'Pembayaran QRIS berhasil diverifikasi otomatis',
      invoiceId: pending.invoiceId,
      amount: pending.baseAmount,
      paidAt: now.toISOString(),
    });
  } catch (error) {
    console.error('[QRIS Notify] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process QRIS notification' },
      { status: 500 }
    );
  }
}
