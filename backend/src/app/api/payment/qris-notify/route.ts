import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/server/db/client';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';
import { verifyQrisSignature, claimNonce } from '@/lib/qris-signature';
import { settleOrder } from '@/server/services/payment/order-settlement.service';

export const dynamic = 'force-dynamic';

/**
 * Server-side amount extraction from raw notification text.
 * Same patterns as QrisNotificationListener.kt PAYMENT_PATTERNS.
 */
const PAYMENT_PATTERNS: RegExp[] = [
  // "Kamu dapat/terima pembayaran|transfer Rp..." (merchant apps, transfers).
  /(?:dapat|terima)\s+(?:pembayaran|transfer|uang|dana)\s*(?:sebesar\s*)?Rp\.?\s*(\d{1,3}(?:[.,]\d{3})*)/iu,
  /(?:menerima|diterima|masuk|received|transfer\s+masuk|pembayaran\s+masuk)[^Rp0-9]*[Rp\s]*(\d{1,3}(?:[.,]\d{3})*)/iu,
  /Rp\s*(\d{1,3}(?:[.,]\d{3})*)(?:\s*telah\s*diterima|\s*berhasil\s*diterima)/iu,
  /Rp\s*(\d{1,3}(?:[.,]\d{3})*)\s+dari\s+\S+\s+berhasil\s+diterima/iu,
  /berhasil\s+diterima\s+Rp\s*(\d{1,3}(?:[.,]\d{3})*)/iu,
  /(?:kamu|anda)?\s*menerima\s+[Rp\s]*(\d{1,3}(?:[.,]\d{3})*)/iu,
  /Rp\s*(\d{1,3}(?:[.,]\d{3})*)\s+diterima\b/iu,
];

// Money going out ("Pesanan diterima Rp…", "Transfer ke …") also says
// "diterima"/"masuk"; such text must never settle an invoice.
const OUTGOING_HINTS = [
  'transfer ke', 'kirim ke', 'bayar ke', 'berhasil bayar', 'pembayaran berhasil ke', 'pembelian', 'belanja',
  'pesanan', 'kamu membayar', 'anda membayar', 'transaksi keluar', 'debit', 'top up ke', 'tarik tunai',
];

function isOutgoing(text: string) {
  const lower = text.toLowerCase();
  return OUTGOING_HINTS.some((h) => lower.includes(h));
}

function extractAmountFromText(text: string): number | null {
  if (isOutgoing(text)) return null;
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

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Every notification that did not settle anything is kept for manual reconciliation. */
async function logNotification(status: string, amount: number | null, detail: Record<string, unknown>, success: boolean, errorMessage?: string) {
  try {
    await prisma.webhookLog.create({
      data: {
        id: crypto.randomUUID(),
        gateway: 'qris_own',
        orderId: String(detail.orderId ?? `QRIS-${status.toUpperCase()}-${Date.now()}`),
        status,
        amount,
        payload: JSON.stringify(detail).slice(0, 2000),
        success,
        errorMessage: errorMessage ?? null,
      },
    });
  } catch (e) {
    console.error('[QRIS Notify] webhook log failed:', e);
  }
}

/**
 * POST /api/payment/qris-notify — called by the QRIS listener app when a
 * payment notification arrives on the merchant phone.
 *
 * Body: { device_key, amount, source_app, raw_text, timestamp, nonce, signature }
 * signature = hex HMAC-SHA256(device_secret, "device_key|amount|timestamp|nonce").
 *
 * The signature is required: the device key alone is a static value that
 * ships inside the listener APK, so it cannot prove a notification is real.
 */
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, RateLimitPresets.strict);
    if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const body = await request.json();
    const { device_key, source_app, raw_text, nonce, signature } = body;
    const rawText = typeof raw_text === 'string' ? raw_text.slice(0, 255) : '';
    let amount = typeof body.amount === 'number' ? Math.round(body.amount) : 0;
    const timestamp = typeof body.timestamp === 'number' ? body.timestamp : 0;

    if (rawText && isOutgoing(rawText)) {
      return NextResponse.json({ success: false, ignored: true, error: 'Notifikasi uang keluar diabaikan' });
    }
    if ((!amount || amount <= 0) && rawText) {
      amount = extractAmountFromText(rawText) ?? 0;
    }
    if (typeof device_key !== 'string' || !device_key || !amount || amount <= 0) {
      return NextResponse.json({ error: 'device_key dan amount wajib diisi' }, { status: 400 });
    }

    const company = await prisma.company.findFirst({ select: { qrisDeviceKey: true, qrisDeviceSecret: true } });
    if (!company?.qrisDeviceKey || !safeEqual(company.qrisDeviceKey, device_key)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!company.qrisDeviceSecret) {
      return NextResponse.json(
        { error: 'Device secret belum dibuat. Buka Payment Gateway → QRIS Mandiri, buat device secret, lalu isi di aplikasi listener.' },
        { status: 401 },
      );
    }
    if (!signature) {
      return NextResponse.json(
        { error: 'Notifikasi wajib ditandatangani. Isi Device Secret di aplikasi listener.', reason: 'signature_required' },
        { status: 401 },
      );
    }
    const verify = verifyQrisSignature(company.qrisDeviceSecret, device_key, amount, timestamp, nonce || '', signature);
    if (!verify.valid || !claimNonce(device_key, nonce || '')) {
      console.error('[QRIS Notify] Signature rejected:', verify.valid ? 'nonce_replay' : verify.reason);
      return NextResponse.json({ error: 'Invalid signature', reason: verify.valid ? 'nonce_replay' : verify.reason }, { status: 401 });
    }

    const now = new Date();
    const candidates = await prisma.qrisPending.findMany({
      where: { uniqueAmount: amount, status: 'pending', expiresAt: { gt: now } },
      take: 2,
    });

    if (candidates.length === 0) {
      // The same payment notified twice (Android repeats notifications) is
      // not a missing payment.
      const recent = await prisma.qrisPending.findFirst({
        where: { uniqueAmount: amount, status: 'paid', paidAt: { gt: new Date(now.getTime() - 30 * 60 * 1000) } },
        select: { invoiceId: true },
      });
      if (recent) {
        return NextResponse.json({ success: true, paid: true, message: 'Pembayaran sudah diproses sebelumnya', invoiceId: recent.invoiceId });
      }
      await logNotification('unmatched', amount, { sourceApp: source_app, rawText }, false, 'Tidak ada QRIS pending dengan nominal ini (mungkin kedaluwarsa)');
      return NextResponse.json({
        success: false,
        error: `Tidak ada tagihan QRIS yang menunggu Rp${amount.toLocaleString('id-ID')} (mungkin kedaluwarsa). Dicatat di log webhook untuk dicek admin.`,
      });
    }

    if (candidates.length > 1) {
      await logNotification('ambiguous', amount, { sourceApp: source_app, rawText, pendingIds: candidates.map((c) => c.id) }, false, 'Lebih dari satu QRIS pending dengan nominal sama');
      return NextResponse.json({ success: false, error: 'Nominal cocok dengan lebih dari satu tagihan; dicatat untuk dicek admin.' });
    }

    const pending = candidates[0];

    // Claim the pending row first: only one concurrent notification wins.
    const claimed = await prisma.qrisPending.updateMany({
      where: { id: pending.id, status: 'pending' },
      data: { status: 'paid', sourceApp: typeof source_app === 'string' ? source_app.slice(0, 100) : 'unknown', paidAt: now },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ success: true, paid: true, message: 'Pembayaran sudah diproses sebelumnya', invoiceId: pending.invoiceId });
    }

    // Settle exactly like a gateway payment, by order type: invoices
    // (payment, Keuangan, isolation lifted, CoA), voucher orders, balance
    // top-ups and agent deposits.
    try {
      await settleOrder(pending.orderId, 'settlement', 'qris_own', String(source_app || 'listener'), now, pending.id, pending.baseAmount);
    } catch (e) {
      console.error('[QRIS Notify] Settlement error:', e);
      await logNotification('error', amount, { orderId: pending.orderId, sourceApp: source_app }, false, e instanceof Error ? e.message : String(e));
      return NextResponse.json({ success: false, error: 'Pembayaran diterima tapi gagal diproses; dicatat untuk dicek admin.' }, { status: 500 });
    }

    await logNotification('settlement', amount, { orderId: pending.orderId, sourceApp: source_app, invoiceId: pending.invoiceId }, true);
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
    return NextResponse.json({ error: 'Failed to process QRIS notification' }, { status: 500 });
  }
}
