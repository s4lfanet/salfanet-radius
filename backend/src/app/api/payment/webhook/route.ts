import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { settleOrder } from '@/server/services/payment/order-settlement.service';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/** Constant-time comparison for webhook signatures and tokens. */
function safeEqual(received: unknown, expected: string): boolean {
  if (typeof received !== 'string' || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Some Midtrans account/merchant configurations resolve the browser's post-payment
 * redirect to this notification URL instead of the per-transaction `callbacks.finish`
 * (`/payment/success`) — Snap's dashboard-level Finish Redirect URL can take
 * precedence depending on payment method. Rather than 405 the customer, bounce them
 * to the real result page with the same query string; the server-to-server webhook
 * (POST, below) is what actually settles the invoice.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get('order_id');

  // request.url reflects the internal origin behind the reverse proxy
  // (e.g. http://localhost:3001) — build the redirect against the public
  // base URL instead, same as every other outward-facing link this route
  // generates (paymentLink, etc.).
  const company = await prisma.company.findFirst({ select: { baseUrl: true } });
  const baseUrl = company?.baseUrl || url.origin;

  if (!orderId) {
    return NextResponse.redirect(new URL('/', baseUrl));
  }

  const dest = new URL('/payment/success', baseUrl);
  url.searchParams.forEach((value, key) => dest.searchParams.set(key, value));
  return NextResponse.redirect(dest);
}

/**
 * Unified Payment Webhook Handler
 * Supports: Midtrans & Xendit
 * Single endpoint: /api/payment/webhook
 */
export async function POST(request: Request) {
  let webhookLogId: string | undefined;
  try {
    const contentType = request.headers.get('content-type') || '';
    let body: any;
    let rawBody: string = '';

    // Duitku sends form-urlencoded, others send JSON
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.text();
      rawBody = formData;
      body = Object.fromEntries(new URLSearchParams(formData));
    } else {
      rawBody = await request.text();
      body = JSON.parse(rawBody);
    }

    const signature = request.headers.get('x-callback-token') || request.headers.get('x-signature') || request.headers.get('x-callback-signature');

    // Log webhook receipt — do NOT log raw body (may contain PII) or full signature.
    console.log('=== PAYMENT WEBHOOK RECEIVED ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Content-Type:', contentType);
    console.log('Signature:', signature ? `${signature.substring(0, 16)}...` : 'none');

    // Normalize payload (e.g., Xendit invoice events send { event, data })
    const payload: any = (body && body.event && body.data) ? body.data : body;

    let gateway = 'unknown';
    let orderId = '';
    let status = '';
    let transactionId = '';
    let paymentType = '';
    let paidAt: Date | null = null;
    let amount: number | undefined;

    // ============================================
    // DETECT PAYMENT GATEWAY
    // ============================================

    // MIDTRANS Detection
    if (payload.order_id && payload.transaction_status) {
      gateway = 'midtrans';
      orderId = payload.order_id;
      transactionId = payload.transaction_id || '';
      paymentType = payload.payment_type || '';
      amount = payload.gross_amount ? parseInt(payload.gross_amount) : undefined;

      const transactionStatus = payload.transaction_status;
      const fraudStatus = payload.fraud_status;

      // Map Midtrans status
      if (transactionStatus === 'capture') {
        status = fraudStatus === 'accept' ? 'settlement' : 'pending';
        if (fraudStatus === 'accept') paidAt = new Date();
      } else if (transactionStatus === 'settlement') {
        status = 'settlement';
        paidAt = new Date();
      } else if (['cancel', 'deny', 'expire'].includes(transactionStatus)) {
        status = transactionStatus;
      } else {
        status = 'pending';
      }

      // Verify Midtrans signature
      const gatewayConfig = await prisma.paymentGateway.findUnique({
        where: { provider: 'midtrans' }
      });

      if (gatewayConfig?.midtransServerKey) {
        const signatureKey = payload.signature_key;
        const expectedSignature = crypto
          .createHash('sha512')
          .update(orderId + payload.status_code + payload.gross_amount + gatewayConfig.midtransServerKey)
          .digest('hex');

        console.log('[Midtrans] Signature validation:', {
          received: signatureKey?.substring(0, 20) + '...',
          expected: expectedSignature.substring(0, 20) + '...',
          match: safeEqual(signatureKey, expectedSignature)
        });

        if (!safeEqual(signatureKey, expectedSignature)) {
          console.error('[Midtrans] Invalid signature');
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
      } else if (process.env.NODE_ENV === 'production') {
        console.error('[Midtrans] Missing server key configuration in production');
        return NextResponse.json({ error: 'Webhook misconfigured' }, { status: 500 });
      }

      console.log('[Midtrans] Webhook processed - OrderID:', orderId, 'Status:', status);

      console.log('[Midtrans] Webhook processed');
    }
    // XENDIT Detection
    else if (payload.external_id && (payload.status || (body.event && payload.status))) {
      gateway = 'xendit';
      orderId = payload.external_id;
      transactionId = payload.id || '';
      paymentType = payload.payment_channel || payload.payment_method || '';
      amount = payload.amount ? parseInt(payload.amount) : undefined;

      const xenditStatus = (payload.status || '').toLowerCase();

      // Map Xendit status
      if (xenditStatus === 'paid') {
        status = 'settlement';
        paidAt = body.paid_at ? new Date(body.paid_at) : new Date();
      } else if (xenditStatus === 'expired') {
        status = 'expire';
      } else if (xenditStatus === 'pending') {
        status = 'pending';
      } else {
        status = xenditStatus;
      }

      // Verify Xendit callback token
      const gatewayConfig = await prisma.paymentGateway.findUnique({
        where: { provider: 'xendit' }
      });

      if (gatewayConfig?.xenditWebhookToken && gatewayConfig.xenditWebhookToken.trim() !== '') {
        if (!safeEqual(signature, gatewayConfig.xenditWebhookToken)) {
          console.error('[Xendit] Invalid or missing webhook token');
          return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }
      } else if (process.env.NODE_ENV === 'production') {
        console.error('[Xendit] Missing webhook token configuration in production');
        return NextResponse.json({ error: 'Webhook misconfigured' }, { status: 500 });
      }

      console.log('[Xendit] Webhook processed');
    }
    // XENDIT FVA (Fixed Virtual Account) Detection
    else if (payload.payment_id && payload.external_id && payload.bank_code) {
      gateway = 'xendit';
      orderId = payload.external_id;
      transactionId = payload.payment_id || payload.id || '';
      paymentType = `va_${payload.bank_code}`;
      amount = payload.amount ? parseInt(payload.amount) : undefined;

      // FVA callback means payment is successful
      status = 'settlement';
      paidAt = payload.transaction_timestamp ? new Date(payload.transaction_timestamp) : new Date();

      // Verify Xendit callback token
      const gatewayConfig = await prisma.paymentGateway.findUnique({
        where: { provider: 'xendit' }
      });

      if (gatewayConfig?.xenditWebhookToken && gatewayConfig.xenditWebhookToken.trim() !== '') {
        if (!safeEqual(signature, gatewayConfig.xenditWebhookToken)) {
          console.error('[Xendit FVA] Invalid or missing webhook token');
          return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }
      } else if (process.env.NODE_ENV === 'production') {
        console.error('[Xendit FVA] Missing webhook token configuration in production');
        return NextResponse.json({ error: 'Webhook misconfigured' }, { status: 500 });
      }

      console.log('[Xendit FVA] Webhook processed');
    }
    // DUITKU Detection
    else if (payload.merchantOrderId && payload.resultCode) {
      gateway = 'duitku';
      orderId = payload.merchantOrderId;
      transactionId = payload.reference || '';
      paymentType = payload.paymentMethod || '';
      amount = payload.amount ? parseInt(payload.amount) : undefined;

      const duitkuStatus = payload.resultCode;

      // Map Duitku status
      if (duitkuStatus === '00') {
        status = 'settlement';
        paidAt = new Date();
      } else if (duitkuStatus === '01') {
        status = 'pending';
      } else {
        status = 'failed';
      }

      // Verify Duitku signature
      const gatewayConfig = await prisma.paymentGateway.findUnique({
        where: { provider: 'duitku' }
      });

      if (gatewayConfig?.duitkuApiKey) {
        const receivedSignature = payload.signature;
        // Formula: MD5(merchantCode + amount + merchantOrderId + apiKey)
        const expectedSignature = crypto
          .createHash('md5')
          .update(`${gatewayConfig.duitkuMerchantCode}${payload.amount}${orderId}${gatewayConfig.duitkuApiKey}`)
          .digest('hex');

        if (!safeEqual(receivedSignature, expectedSignature)) {
          console.error('[Duitku] Invalid signature');
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
      }

      console.log('[Duitku] Webhook processed');
    }
    // TRIPAY Detection - Check for X-Callback-Event header or payload structure
    else if (request.headers.get('x-callback-event') === 'payment_status' || (payload.merchant_ref && payload.reference && payload.status)) {
      gateway = 'tripay';
      orderId = payload.merchant_ref;
      transactionId = payload.reference || '';
      paymentType = payload.payment_method || '';
      amount = payload.total_amount ? parseInt(payload.total_amount.toString()) : undefined;

      const tripayStatus = (payload.status || '').toUpperCase();

      // Map Tripay status
      // UNPAID, PAID, FAILED, EXPIRED, REFUND
      if (tripayStatus === 'PAID') {
        status = 'settlement';
        paidAt = payload.paid_at ? new Date(payload.paid_at * 1000) : new Date();
      } else if (tripayStatus === 'EXPIRED') {
        status = 'expire';
      } else if (tripayStatus === 'FAILED') {
        status = 'failed';
      } else if (tripayStatus === 'UNPAID') {
        status = 'pending';
      } else {
        status = tripayStatus.toLowerCase();
      }

      // Verify Tripay signature
      const gatewayConfig = await prisma.paymentGateway.findUnique({
        where: { provider: 'tripay' }
      });

      if (gatewayConfig?.tripayPrivateKey) {
        const receivedSignature = request.headers.get('x-callback-signature');

        if (!receivedSignature) {
          console.error('[Tripay] Missing signature header');
          return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
        }

        // Formula: HMAC-SHA256(raw JSON body, privateKey)
        const expectedSignature = crypto
          .createHmac('sha256', gatewayConfig.tripayPrivateKey)
          .update(rawBody)
          .digest('hex');

        console.log('[Tripay] Signature validation:', {
          received: receivedSignature.substring(0, 16) + '...',
          expected: expectedSignature.substring(0, 16) + '...',
          match: safeEqual(receivedSignature, expectedSignature)
        });

        if (!safeEqual(receivedSignature, expectedSignature)) {
          console.error('[Tripay] Invalid signature');
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
      }

      console.log('[Tripay] Webhook processed - Status:', tripayStatus);
    }
    else {
      console.error('Unknown webhook payload format');
      return NextResponse.json({ error: 'Unknown webhook provider' }, { status: 400 });
    }

    console.log(`Processing: ${gateway.toUpperCase()} | Order: ${orderId} | Status: ${status}`);

    // Idempotency guard for successful callbacks.
    // Prevent duplicate webhook replays from re-running payment side-effects.
    if (status === 'settlement' || status === 'capture') {
      // Only treat already-successful PAID callbacks as duplicates.
      // Do NOT let an older UNPAID/PENDING callback block a later PAID callback.
      const duplicateWebhook = await prisma.webhookLog.findFirst({
        where: transactionId
          ? {
              gateway,
              transactionId,
              success: true,
              status: { in: ['settlement', 'capture'] }
            }
          : {
              gateway,
              orderId,
              success: true,
              status: { in: ['settlement', 'capture'] }
            },
        orderBy: { createdAt: 'desc' }
      });

      if (duplicateWebhook) {
        console.log(`[Webhook] Duplicate callback ignored for ${gateway}:${transactionId || orderId}`);
        try {
          const { logPaymentDuplicateCallback } = await import('@/server/services/monitoring.service');
          logPaymentDuplicateCallback(gateway, transactionId || orderId);
        } catch { /* monitoring is best-effort */ }
        return NextResponse.json({
          success: true,
          gateway,
          status,
          orderId,
          message: 'Duplicate webhook ignored'
        });
      }
    }

    // Find existing log for this order or create new
    const existingLog = await prisma.webhookLog.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' }
    });

    if (existingLog) {
      // Update existing log
      const webhookLog = await prisma.webhookLog.update({
        where: { id: existingLog.id },
        data: {
          gateway,
          status,
          transactionId,
          amount,
          payload: JSON.stringify(body),
          success: true
        }
      });
      webhookLogId = webhookLog.id;
      console.log(`✅ Updated existing webhook log for ${orderId}`);
    } else {
      // Create new log
      const webhookLog = await prisma.webhookLog.create({
        data: {
          id: crypto.randomUUID(),
          gateway,
          orderId,
          status,
          transactionId,
          amount,
          payload: JSON.stringify(body),
          success: true
        }
      });
      webhookLogId = webhookLog.id;
      console.log(`✅ Created new webhook log for ${orderId}`);
    }

    // ============================================
    // DETECT ORDER TYPE (Invoice, Voucher Order, Agent Deposit, or Top-Up)
    // ============================================

    console.log(`[Webhook] Detecting order type for: ${orderId}`);

    await settleOrder(orderId, status, gateway, paymentType, paidAt, transactionId, amount);

    // Update webhook log with success response
    if (webhookLogId) {
      await prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: {
          response: JSON.stringify({ success: true, gateway, status, orderId })
        }
      });
    }

    return NextResponse.json({
      success: true,
      gateway,
      status,
      orderId,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);

    // Log the error in webhook log
    if (webhookLogId) {
      try {
        await prisma.webhookLog.update({
          where: { id: webhookLogId },
          data: {
            success: false,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            response: JSON.stringify({ error: 'Webhook processing failed' })
          }
        });
      } catch (logError) {
        console.error('Failed to update webhook log:', logError);
      }
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    const amountMismatch = message.includes('AMOUNT_MISMATCH');

    return NextResponse.json(
      {
        error: amountMismatch ? 'Amount mismatch' : 'Webhook processing failed',
        details: message
      },
      { status: amountMismatch ? 400 : 500 }
    );
  }
}
