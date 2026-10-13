import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { syncVoucherToRadius } from '@/server/services/radius/hotspot-sync.service';
import { sendPaymentSuccess, sendVoucherPurchaseSuccess } from '@/server/services/notifications/whatsapp-templates.service';
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';
import { getCurrentTimezone } from '@/lib/timezone';
import { formatInTimeZone } from 'date-fns-tz';
import { logActivity } from '@/server/services/activity-log.service';
import { syncVoucherToAssignedRouter } from '@/server/services/mikrotik/hotspot-voucher.service';
import { handleInvoicePayment } from '@/server/services/payment/invoice-payment.service';
import crypto from 'crypto';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';

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
          match: signatureKey === expectedSignature
        });

        if (signatureKey !== expectedSignature) {
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
        if (!signature || signature !== gatewayConfig.xenditWebhookToken) {
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
        if (!signature || signature !== gatewayConfig.xenditWebhookToken) {
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

        if (receivedSignature !== expectedSignature) {
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
          match: receivedSignature === expectedSignature
        });

        if (receivedSignature !== expectedSignature) {
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

    // Check order type by prefix or UUID format
    if (orderId.startsWith('EVC-')) {
      // Handle E-Voucher Order
      console.log(`[Webhook] Order type: E-Voucher`);
      await handleVoucherOrder(orderId, status, gateway, paymentType, paidAt, amount);
    } else if (orderId.startsWith('TOPUP-')) {
      // Handle Customer Top-Up (Balance)
      console.log(`[Webhook] Order type: Customer Top-Up`);
      await handleCustomerTopUp(orderId, status, gateway, transactionId, paidAt, amount);
    } else if (orderId.startsWith('INV-')) {
      // Handle PPPoE Invoice
      console.log(`[Webhook] Order type: Invoice`);
      await handleInvoicePayment(orderId, status, gateway, paymentType, paidAt, transactionId, amount);
    } else {
      // Check if it's an agent deposit (UUID format)
      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      console.log(`[Webhook] Checking if order is Agent Deposit...`);

      const agentDeposit = await prisma.agentDeposit.findUnique({
        where: { id: orderId }
      });

      console.log(`[Webhook] Agent Deposit lookup result:`, agentDeposit ? `Found (Agent: ${agentDeposit.agentId})` : 'Not found');

      if (agentDeposit) {
        // Handle Agent Deposit
        console.log(`[Webhook] Order type: Agent Deposit`);
        await handleAgentDeposit(orderId, status, gateway, transactionId, paidAt, amount);
      } else {
        // Fallback to invoice payment (for legacy orders without INV- prefix)
        console.log(`[Webhook] Order type: Legacy Invoice (fallback)`);
        await handleInvoicePayment(orderId, status, gateway, paymentType, paidAt, transactionId, amount);
      }
    }

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

// ============================================
// HANDLE VOUCHER ORDER PAYMENT
// ============================================
async function handleVoucherOrder(
  orderId: string,
  status: string,
  gateway: string,
  paymentType: string,
  paidAt: Date | null,
  webhookAmount?: number
) {
  // Extract order number from orderId
  // Format bisa: EVC-20251028-0001 atau EVC-20251028-0001-timestamp
  let orderNumber = orderId;

  // Jika ada timestamp, ambil 3 bagian pertama
  const parts = orderId.split('-');
  if (parts.length > 3) {
    orderNumber = parts.slice(0, 3).join('-'); // EVC-20251028-0001
  }

  console.log(`Looking for voucher order: ${orderNumber} (from orderId: ${orderId})`);

  const order = await prisma.voucherOrder.findFirst({
    where: { orderNumber },
    include: {
      profile: true
    }
  });

  if (!order) {
    console.error(`❌ Voucher order not found: ${orderNumber}`);
    console.error(`Original orderId: ${orderId}`);

    // Try to find by partial match as fallback
    const allOrders = await prisma.voucherOrder.findMany({
      where: {
        orderNumber: {
          contains: parts[0] + '-' + parts[1] // EVC-20251028
        }
      },
      select: { orderNumber: true, status: true }
    });

    console.log(`Found similar orders:`, allOrders);
    throw new Error(`Voucher order not found: ${orderNumber}`);
  }

  console.log(`✅ Voucher order found: ${order.orderNumber}`);

  if (status === 'settlement' || status === 'capture') {
    // ─── AMOUNT VALIDATION ────────────────────────────────────────────────────
    if (typeof webhookAmount === 'number' && Number.isFinite(webhookAmount) && webhookAmount !== order.totalAmount) {
      console.error(
        `[Voucher Order] AMOUNT_MISMATCH for ${order.orderNumber}: expected ${order.totalAmount}, got ${webhookAmount}`
      );
      throw new Error('AMOUNT_MISMATCH');
    }

    // ─── ATOMIC IDEMPOTENCY GUARD ────────────────────────────────────────────
    // Use updateMany with status condition — only one concurrent webhook
    // will get count > 0 and proceed to settlement + voucher generation.
    const markPaid = await prisma.voucherOrder.updateMany({
      where: { id: order.id, status: { not: 'PAID' } },
      data: {
        status: 'PAID',
        paidAt: paidAt || new Date(),
      },
    });

    if (markPaid.count === 0) {
      console.log(`[Voucher Order] ⏭️  Order ${order.orderNumber} already PAID — skipping duplicate settlement`);
      try {
        const { logPaymentIdempotencyHit } = await import('@/server/services/monitoring.service');
        logPaymentIdempotencyHit(gateway, order.orderNumber);
      } catch { /* monitoring is best-effort */ }
      return;
    }

    console.log(`✅ Order ${order.orderNumber} marked as PAID`);
    try {
      const { logPaymentSettlementSuccess } = await import('@/server/services/monitoring.service');
      logPaymentSettlementSuccess(order.orderNumber, order.totalAmount);
    } catch { /* monitoring is best-effort */ }

    // Create notification using NotificationService
    try {
      const { NotificationService } = await import('@/server/services/notifications/dispatcher.service');
      await NotificationService.notifyPaymentReceived({
        amount: order.totalAmount,
        customerName: order.customerName,
        gateway: gateway
      });
    } catch (notifError) {
      console.error('[Voucher Order] Notification error:', notifError);
    }

    // ============================================
    // AUTO-GENERATE VOUCHERS
    // ============================================
    // Secondary idempotency check: if vouchers already exist for this order
    // (e.g., from a race that somehow passed the guard), skip generation.
    const existingVouchers = await prisma.hotspotVoucher.findMany({
      where: { orderId: order.id },
      select: { id: true, code: true },
    });

    const vouchers: { id: string; code: string }[] = [];

    if (existingVouchers.length > 0) {
      console.log(`[Voucher Order] ⏭️  ${existingVouchers.length} vouchers already exist for ${order.orderNumber} — skipping generation`);
      vouchers.push(...existingVouchers);
    } else {
      for (let i = 0; i < order.quantity; i++) {
        // Generate unique voucher code
        let voucherCode = '';
        let isUnique = false;

        while (!isUnique) {
          voucherCode = generateVoucherCode(8);
          const existing = await prisma.hotspotVoucher.findUnique({
            where: { code: voucherCode }
          });
          if (!existing) {
            isUnique = true;
          }
        }

        // Create voucher
        const voucher = await prisma.hotspotVoucher.create({
          data: {
            id: crypto.randomUUID(),
            code: voucherCode,
            batchCode: order.orderNumber,
            profileId: order.profileId,
            orderId: order.id,
            status: 'WAITING'
          }
        });

        vouchers.push(voucher);

        // Sync to RADIUS using proper sync function
        try {
          await syncVoucherToRadius(voucher.id);
          console.log(`✅ Voucher ${voucherCode} synced to RADIUS`);
        } catch (radiusError) {
          console.error(`RADIUS sync error for ${voucherCode}:`, radiusError);
        }

        // Sync to MikroTik local NAS (creates /ip/hotspot/user via API)
        // If voucher has no routerId, syncs to ALL active local-mode routers (multi-NAS support)
        try {
          const mtResult = await syncVoucherToAssignedRouter(voucher.id);
          if (mtResult.success > 0) {
            console.log(`✅ Voucher ${voucherCode} synced to MikroTik (${mtResult.success}/${mtResult.total} routers)`);
          } else if (mtResult.total > 0) {
            console.error(`❌ Voucher ${voucherCode} failed to sync to MikroTik (${mtResult.failed}/${mtResult.total} failed)`);
          }
        } catch (mtError) {
          console.error(`MikroTik sync error for ${voucherCode}:`, mtError);
        }
      }

      console.log(`✅ Generated ${vouchers.length} vouchers for order ${order.orderNumber}`);
    }

      // ============================================
      // AUTO-SYNC TO KEUANGAN TRANSACTIONS
      // ============================================
      try {
        const hotspotCategory = await prisma.transactionCategory.findFirst({
          where: { name: 'Pembayaran Hotspot', type: 'INCOME' },
        });

        if (hotspotCategory) {
          // Use INSERT IGNORE for race-safe idempotency (MySQL)
          await prisma.$executeRaw`
            INSERT IGNORE INTO transactions (id, categoryId, type, amount, description, date, reference, notes, createdAt, updatedAt)
            VALUES (${nanoid()}, ${hotspotCategory.id}, 'INCOME', ${order.totalAmount},
                    ${`Voucher ${order.profile.name} (${order.quantity}x) - ${order.customerName}`}, NOW(),
                    ${order.orderNumber},
                    ${`Auto-synced from voucher order payment`}, NOW(), NOW())
          `;
          console.log(`✅ Transaction synced to Keuangan: ${order.orderNumber}`);
        }
      } catch (keuanganError) {
        console.error('Keuangan sync error:', keuanganError);
      }

      // Send WhatsApp notification with voucher codes
      try {
        await sendVoucherPurchaseSuccess({
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          orderNumber: order.orderNumber,
          profileName: order.profile.name,
          quantity: order.quantity,
          voucherCodes: vouchers.map(v => v.code),
          validityValue: order.profile.validityValue,
          validityUnit: order.profile.validityUnit,
        });
        console.log(`✅ WhatsApp voucher notification sent to ${order.customerPhone}`);
      } catch (waError) {
        console.error('WhatsApp voucher notification error:', waError);
      }

      // Send Email notification for voucher purchase
      if (order.customerEmail) {
        try {
          const emailSettings = await prisma.emailSettings.findFirst();
          if (emailSettings?.enabled) {
            const emailTemplate = await prisma.emailTemplate.findFirst({
              where: { type: 'voucher-purchase', isActive: true }
            });

            if (emailTemplate) {
              const company = await prisma.company.findFirst();
              const validityUnit: { [key: string]: string } = {
                MINUTES: 'Menit', HOURS: 'Jam', DAYS: 'Hari', MONTHS: 'Bulan'
              };
              const duration = `${order.profile.validityValue} ${validityUnit[order.profile.validityUnit] || order.profile.validityUnit}`;

              const variables: Record<string, string> = {
                customerId: '',
                customerName: order.customerName,
                phone: order.customerPhone,
                profileName: order.profile.name,
                duration: duration,
                price: `Rp ${(order.totalAmount / order.quantity).toLocaleString('id-ID')}`,
                quantity: order.quantity.toString(),
                totalAmount: `Rp ${order.totalAmount.toLocaleString('id-ID')}`,
                voucherCodes: vouchers.map(v => v.code).join(', '),
                purchaseDate: formatInTimeZone(new Date(), getCurrentTimezone(), 'dd MMMM yyyy'),
                expiryDate: '-',
                companyName: company?.name || 'ISP',
                companyPhone: company?.phone || '-',
              };

              let subject = emailTemplate.subject;
              let htmlBody = emailTemplate.htmlBody;
              Object.entries(variables).forEach(([key, value]) => {
                const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                subject = subject.replace(regex, value);
                htmlBody = htmlBody.replace(regex, value);
              });

              const nodemailer = require('nodemailer');
              const transporter = nodemailer.createTransport({
                host: emailSettings.smtpHost,
                port: emailSettings.smtpPort,
                secure: emailSettings.smtpSecure,
                auth: { user: emailSettings.smtpUser, pass: emailSettings.smtpPassword },
              });

              await transporter.sendMail({
                from: `"${emailSettings.fromName}" <${emailSettings.fromEmail}>`,
                to: order.customerEmail,
                subject: subject,
                html: htmlBody,
              });

              // Log to email history
              await prisma.emailHistory.create({
                data: {
                  id: nanoid(),
                  toEmail: order.customerEmail,
                  toName: order.customerName,
                  subject: subject,
                  body: htmlBody,
                  status: 'sent',
                },
              });
              console.log(`✅ Email voucher notification sent to ${order.customerEmail}`);
            }
          }
        } catch (emailError) {
          console.error('Email voucher notification error:', emailError);
        }
      }
    }
  }

// Generate random voucher code
function generateVoucherCode(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============================================
// HANDLE AGENT DEPOSIT PAYMENT
// ============================================
async function handleAgentDeposit(
  depositId: string,
  status: string,
  gateway: string,
  transactionId: string,
  paidAt: Date | null,
  webhookAmount?: number
) {
  console.log(`[Agent Deposit] Processing deposit: ${depositId}, Status: ${status}`);

  const deposit = await prisma.agentDeposit.findUnique({
    where: { id: depositId },
    include: { agent: true }
  });

  if (!deposit) {
    console.error(`[Agent Deposit] Deposit not found: ${depositId}`);
    throw new Error(`Agent deposit not found: ${depositId}`);
  }

  console.log(`[Agent Deposit] Found deposit for agent: ${deposit.agent.name}, Amount: ${deposit.amount}`);

  // Only process if current status is PENDING
  if (deposit.status !== 'PENDING') {
    console.log(`[Agent Deposit] Deposit ${depositId} already processed (status: ${deposit.status})`);
    return;
  }

  // Map webhook status to deposit status
  let depositStatus: 'PENDING' | 'PAID' | 'FAILED' = 'PENDING';

  if (status === 'settlement' || status === 'capture') {
    depositStatus = 'PAID';
  } else if (['expire', 'cancel', 'deny', 'failed'].includes(status)) {
    depositStatus = 'FAILED';
  }

  // ─── ATOMIC: deposit status + balance increment in one transaction ─────────
  // Use updateMany with status condition for idempotency — only one concurrent
  // webhook will get count > 0 and proceed to increment the balance.
  let updatedBalance: number | null = null;
  if (depositStatus === 'PAID') {
    // ─── AMOUNT VALIDATION ────────────────────────────────────────────────────
    if (typeof webhookAmount === 'number' && Number.isFinite(webhookAmount) && webhookAmount !== deposit.amount) {
      console.error(
        `[Agent Deposit] AMOUNT_MISMATCH for ${depositId}: expected ${deposit.amount}, got ${webhookAmount}`
      );
      throw new Error('AMOUNT_MISMATCH');
    }

    const result = await prisma.$transaction(async (tx) => {
      const markPaid = await tx.agentDeposit.updateMany({
        where: { id: deposit.id, status: 'PENDING' },
        data: {
          status: 'PAID',
          transactionId: transactionId || deposit.transactionId,
          paidAt: paidAt || new Date(),
        },
      });

      if (markPaid.count === 0) {
        console.log(`[Agent Deposit] ⏭️  Deposit ${depositId} already processed — skipping`);
        return null;
      }

      const updatedAgent = await tx.agent.update({
        where: { id: deposit.agentId },
        data: {
          balance: {
            increment: deposit.amount,
          },
        },
      });

      return updatedAgent.balance;
    });

    if (result === null) {
      return; // Already processed by a concurrent webhook
    }
    updatedBalance = result;
    console.log(`[Agent Deposit] ✅ Agent ${deposit.agent.name} balance increased by Rp ${deposit.amount.toLocaleString('id-ID')}`);
    console.log(`[Agent Deposit] New balance: Rp ${updatedBalance.toLocaleString('id-ID')}`);
  } else {
    // Non-PAID status: just update deposit status
    await prisma.agentDeposit.update({
      where: { id: deposit.id },
      data: {
        status: depositStatus,
        transactionId: transactionId || deposit.transactionId,
        paidAt: null,
      },
    });
    console.log(`[Agent Deposit] Updated deposit status to: ${depositStatus}`);
  }

  // If payment successful, send notifications
  if (depositStatus === 'PAID' && updatedBalance !== null) {

    // Log activity
    try {
      await logActivity({
        username: deposit.agent.name,
        userRole: 'AGENT',
        action: 'AGENT_DEPOSIT',
        description: `Agent ${deposit.agent.name} deposited Rp ${deposit.amount.toLocaleString('id-ID')} via ${gateway}`,
        module: 'agent',
        status: 'success',
        metadata: {
          agentId: deposit.agentId,
          depositId: deposit.id,
          amount: deposit.amount,
          paymentGateway: gateway,
          transactionId,
          newBalance: updatedBalance,
        },
      });
    } catch (logError) {
      console.error('[Agent Deposit] Activity log error:', logError);
    }

    // ============================================
    // SEND WHATSAPP NOTIFICATION TO AGENT
    // ============================================
    if (deposit.agent.phone) {
      try {
        const company = await prisma.company.findFirst();
        const message = `Halo ${deposit.agent.name},\n\nTop-up saldo agent Anda berhasil!\n\nJumlah: Rp ${deposit.amount.toLocaleString('id-ID')}\nSaldo baru: Rp ${updatedBalance.toLocaleString('id-ID')}\nGateway: ${gateway}\n\nTerima kasih!\n${company?.name || 'ISP'}`;

        await WhatsAppService.sendMessage({
          phone: deposit.agent.phone,
          message: message
        });
        console.log(`[Agent Deposit] ✅ WhatsApp notification sent to ${deposit.agent.phone}`);
      } catch (waError) {
        console.error('[Agent Deposit] WhatsApp error:', waError);
      }
    }

    // ============================================
    // SEND EMAIL NOTIFICATION TO AGENT
    // ============================================
    if (deposit.agent.email) {
      try {
        const emailSettings = await prisma.emailSettings.findFirst();
        if (emailSettings?.enabled) {
          const company = await prisma.company.findFirst();

          const nodemailer = require('nodemailer');
          const transporter = nodemailer.createTransport({
            host: emailSettings.smtpHost,
            port: emailSettings.smtpPort,
            secure: emailSettings.smtpSecure,
            auth: { user: emailSettings.smtpUser, pass: emailSettings.smtpPassword },
          });

          const htmlBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #16a34a;">Top-Up Saldo Berhasil!</h2>
              <p>Halo <strong>${deposit.agent.name}</strong>,</p>
              <p>Top-up saldo agent Anda telah berhasil diproses.</p>
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd;"><strong>Jumlah Top-Up</strong></td>
                  <td style="padding: 10px; border: 1px solid #ddd;">Rp ${deposit.amount.toLocaleString('id-ID')}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd;"><strong>Saldo Baru</strong></td>
                  <td style="padding: 10px; border: 1px solid #ddd;">Rp ${updatedBalance.toLocaleString('id-ID')}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd;"><strong>Metode Pembayaran</strong></td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${gateway.toUpperCase()}</td>
                </tr>
              </table>
              <p>Terima kasih telah menggunakan layanan kami.</p>
              <p style="color: #666; font-size: 12px;">Salam,<br/>${company?.name || 'ISP'}</p>
            </div>
          `;

          await transporter.sendMail({
            from: `"${emailSettings.fromName}" <${emailSettings.fromEmail}>`,
            to: deposit.agent.email,
            subject: `Top-Up Saldo Agent Berhasil - Rp ${deposit.amount.toLocaleString('id-ID')}`,
            html: htmlBody,
          });

          await prisma.emailHistory.create({
            data: {
              id: nanoid(),
              toEmail: deposit.agent.email,
              toName: deposit.agent.name,
              subject: `Top-Up Saldo Agent Berhasil - Rp ${deposit.amount.toLocaleString('id-ID')}`,
              body: htmlBody,
              status: 'sent',
            },
          });
          console.log(`[Agent Deposit] ✅ Email notification sent to ${deposit.agent.email}`);
        }
      } catch (emailError) {
        console.error('[Agent Deposit] Email error:', emailError);
      }
    }
  } else if (depositStatus === 'FAILED') {
    console.log(`[Agent Deposit] ❌ Deposit ${depositId} marked as FAILED`);
  }
}

// ============================================
// HANDLE CUSTOMER TOP-UP (BALANCE)
// ============================================
async function handleCustomerTopUp(
  orderId: string,
  status: string,
  gateway: string,
  transactionId: string,
  paidAt: Date | null,
  amount?: number
) {
  console.log(`[Customer Top-Up] Processing: ${orderId}, Status: ${status}`);

  // Try multiple strategies to find the invoice
  let invoice = null;

  // Strategy 1: Try exact invoice number match
  // Format: TOPUP-{timestamp}-{sequence}
  const invoiceNumber = orderId.split('-').slice(0, 3).join('-');
  invoice = await prisma.invoice.findFirst({
    where: { invoiceNumber },
    include: { user: { include: { area: { select: { name: true } } } } }
  });

  // Strategy 2: If orderId is TOPUP-TEMP-xxx, find the most recent PENDING TOPUP invoice
  // This handles the case where payment is created before invoice (topup-direct flow)
  if (!invoice && orderId.startsWith('TOPUP-TEMP-')) {
    console.log(`[Customer Top-Up] Trying fallback: finding recent PENDING TOPUP invoice`);

    // Extract timestamp from TOPUP-TEMP-{timestamp}
    const timestamp = parseInt(orderId.replace('TOPUP-TEMP-', ''));
    const searchWindow = new Date(timestamp);
    searchWindow.setMinutes(searchWindow.getMinutes() - 5); // 5 minute window

    invoice = await prisma.invoice.findFirst({
      where: {
        invoiceType: 'TOPUP',
        status: 'PENDING',
        amount: amount, // Match by amount if available
        createdAt: { gte: searchWindow }
      },
      orderBy: { createdAt: 'desc' },
      include: { user: { include: { area: { select: { name: true } } } } }
    });

    if (invoice) {
      console.log(`[Customer Top-Up] Found matching invoice by timestamp: ${invoice.invoiceNumber}`);
    }
  }

  if (!invoice) {
    console.error(`[Customer Top-Up] Invoice not found for orderId: ${orderId}`);
    // Don't throw error - just log and return gracefully
    console.log(`[Customer Top-Up] Skipping - will retry on next webhook`);
    return;
  }

  console.log(`[Customer Top-Up] Found invoice: ${invoice.invoiceNumber}, User: ${invoice.user?.username}`);

  if (status === 'settlement' || status === 'capture') {
    // ─── AMOUNT VALIDATION ────────────────────────────────────────────────────
    if (typeof amount === 'number' && Number.isFinite(amount) && amount !== invoice.amount) {
      console.error(
        `[Customer Top-Up] AMOUNT_MISMATCH for ${invoice.invoiceNumber}: expected ${invoice.amount}, got ${amount}`
      );
      // Flag mismatch in payment attempt if exists
      try {
        const attempt = await prisma.paymentAttempt.findFirst({ where: { orderId } });
        if (attempt) {
          await prisma.paymentAttempt.update({
            where: { id: attempt.id },
            data: { mismatchFlagged: true, gatewayAmount: amount, status: 'FAILED', errorMessage: `Amount mismatch: expected ${invoice.amount}, got ${amount}` },
          });
        }
      } catch { /* best-effort */ }
      throw new Error('AMOUNT_MISMATCH');
    }

    // ─── ATOMIC IDEMPOTENCY GUARD + BALANCE INCREMENT ────────────────────────
    // Invoice mark-paid and user balance increment are wrapped in a single
    // transaction so they either both succeed or both roll back.
    let topupAmount = 0;
    let updatedUserBalance = 0;

    const txResult = await prisma.$transaction(async (tx) => {
      const markPaid = await tx.invoice.updateMany({
        where: { id: invoice.id, status: { not: 'PAID' } },
        data: { status: 'PAID', paidAt: paidAt || new Date() },
      });

      if (markPaid.count === 0) {
        console.log(`[Customer Top-Up] ⏭️  Invoice ${invoice.invoiceNumber} already PAID — skipping duplicate notification`);
        return null;
      }

      console.log(`[Customer Top-Up] ✅ Invoice ${invoice.invoiceNumber} marked as PAID`);

      if (invoice.user) {
        topupAmount = amount || invoice.amount;
        const updatedUser = await tx.pppoeUser.update({
          where: { id: invoice.user.id },
          data: {
            balance: {
              increment: topupAmount
            }
          }
        });
        updatedUserBalance = updatedUser.balance;
        console.log(`[Customer Top-Up] ✅ User ${invoice.user.username} balance increased by Rp ${topupAmount.toLocaleString('id-ID')}`);
        console.log(`[Customer Top-Up] New balance: Rp ${updatedUserBalance.toLocaleString('id-ID')}`);
      }

      return { topupAmount, updatedUserBalance };
    });

    if (txResult === null) {
      return; // Already processed by a concurrent webhook
    }

    // Send notifications outside the transaction (best-effort)
    if (invoice.user) {

      // Create notification using NotificationService
      try {
        const { NotificationService } = await import('@/server/services/notifications/dispatcher.service');
        await NotificationService.notifyPaymentReceived({
          amount: topupAmount,
          invoiceId: invoice.id,
          customerName: invoice.user.name,
          customerUsername: invoice.user.username,
          gateway: gateway
        });
      } catch (notifError) {
        console.error('[Customer Top-Up] Notification error:', notifError);
      }

      // Log activity
      try {
        await logActivity({
          username: invoice.user.username,
          userRole: 'CUSTOMER',
          action: 'CUSTOMER_TOPUP',
          description: `Customer ${invoice.user.name} topped up Rp ${topupAmount.toLocaleString('id-ID')} via ${gateway}`,
          module: 'payment',
          status: 'success',
          metadata: {
            userId: invoice.userId,
            invoiceNumber: invoice.invoiceNumber,
            amount: topupAmount,
            paymentGateway: gateway,
            transactionId,
            newBalance: updatedUserBalance,
          },
        });
      } catch (logError) {
        console.error('[Customer Top-Up] Activity log error:', logError);
      }

      // Sync to Keuangan
      try {
        const topupCategory = await prisma.transactionCategory.findFirst({
          where: { name: 'Top-Up Saldo', type: 'INCOME' },
        });

        // If category doesn't exist, try to find a general income category
        const category = topupCategory || await prisma.transactionCategory.findFirst({
          where: { type: 'INCOME' },
        });

        if (category) {
          // Use INSERT IGNORE for race-safe idempotency (MySQL)
          await prisma.$executeRaw`
            INSERT IGNORE INTO transactions (id, categoryId, type, amount, description, date, reference, notes, createdAt, updatedAt)
            VALUES (${nanoid()}, ${category.id}, 'INCOME', ${topupAmount}, 
                    ${`Top-Up Saldo - ${invoice.user.name}`}, NOW(), 
                    ${`TOPUP-${invoice.invoiceNumber}`}, 
                    ${`Payment via ${gateway}`}, NOW(), NOW())
          `;
          console.log(`[Customer Top-Up] ✅ Transaction synced to Keuangan`);
        }
      } catch (keuanganError) {
        console.error('[Customer Top-Up] Keuangan sync error:', keuanganError);
      }

      // Send WhatsApp notification for top-up success
      try {
        await sendPaymentSuccess({
          customerName: invoice.user.name,
          customerPhone: invoice.user.phone,
          customerId: (invoice.user as any).customerId || undefined,
          username: invoice.user.username,
          password: invoice.user.password,
          profileName: 'Top-Up Saldo',
          area: (invoice.user as any).area?.name,
          address: invoice.user.address || undefined,
          invoiceNumber: invoice.invoiceNumber,
          amount: topupAmount,
        });
        console.log(`[Customer Top-Up] ✅ WhatsApp notification sent`);
      } catch (waError) {
        console.error('[Customer Top-Up] WhatsApp error:', waError);
      }

      // ============================================
      // SEND EMAIL NOTIFICATION FOR TOP-UP SUCCESS
      // ============================================
      const customerEmail = invoice.customerEmail || invoice.user.email;
      if (customerEmail) {
        try {
          const emailSettings = await prisma.emailSettings.findFirst();
          if (emailSettings?.enabled) {
            const company = await prisma.company.findFirst();

            const nodemailer = require('nodemailer');
            const transporter = nodemailer.createTransport({
              host: emailSettings.smtpHost,
              port: emailSettings.smtpPort,
              secure: emailSettings.smtpSecure,
              auth: { user: emailSettings.smtpUser, pass: emailSettings.smtpPassword },
            });

            const htmlBody = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #16a34a;">Top-Up Saldo Berhasil!</h2>
                <p>Halo <strong>${invoice.user.name}</strong>,</p>
                <p>Top-up saldo Anda telah berhasil diproses.</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>No. Invoice</strong></td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${invoice.invoiceNumber}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>Jumlah Top-Up</strong></td>
                    <td style="padding: 10px; border: 1px solid #ddd;">Rp ${topupAmount.toLocaleString('id-ID')}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>Saldo Baru</strong></td>
                    <td style="padding: 10px; border: 1px solid #ddd;">Rp ${updatedUserBalance.toLocaleString('id-ID')}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>Metode Pembayaran</strong></td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${gateway.toUpperCase()}</td>
                  </tr>
                </table>
                <p>Saldo dapat digunakan untuk perpanjangan langganan otomatis.</p>
                <p>Terima kasih telah menggunakan layanan kami.</p>
                <p style="color: #666; font-size: 12px;">Salam,<br/>${company?.name || 'ISP'}</p>
              </div>
            `;

            await transporter.sendMail({
              from: `"${emailSettings.fromName}" <${emailSettings.fromEmail}>`,
              to: customerEmail,
              subject: `Top-Up Saldo Berhasil - Rp ${topupAmount.toLocaleString('id-ID')}`,
              html: htmlBody,
            });

            await prisma.emailHistory.create({
              data: {
                id: nanoid(),
                toEmail: customerEmail,
                toName: invoice.user.name,
                subject: `Top-Up Saldo Berhasil - Rp ${topupAmount.toLocaleString('id-ID')}`,
                body: htmlBody,
                status: 'sent',
              },
            });
            console.log(`[Customer Top-Up] ✅ Email notification sent to ${customerEmail}`);
          }
        } catch (emailError) {
          console.error('[Customer Top-Up] Email error:', emailError);
        }
      }
    }
  } else if (['expire', 'cancel', 'deny', 'failed'].includes(status)) {
    // Update invoice status to match payment status
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'CANCELLED' }
    });
    console.log(`[Customer Top-Up] ❌ Invoice ${invoice.invoiceNumber} marked as CANCELLED`);
  }
}
