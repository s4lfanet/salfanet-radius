import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { syncVoucherToRadius } from '@/server/services/radius/hotspot-sync.service';
import { sendPaymentSuccess, sendVoucherPurchaseSuccess } from '@/server/services/notifications/whatsapp-templates.service';
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';
import { formatWIB } from '@/lib/timezone';
import { formatInTimeZone } from 'date-fns-tz';
import { logActivity } from '@/server/services/activity-log.service';
import { disconnectPPPoEUser } from '@/server/services/radius/coa-handler.service';
import crypto from 'crypto';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';

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
      console.log('[Webhook] Parsed form data:', body);
    } else {
      rawBody = await request.text();
      body = JSON.parse(rawBody);
    }

    const signature = request.headers.get('x-callback-token') || request.headers.get('x-signature') || request.headers.get('x-callback-signature');

    console.log('=== PAYMENT WEBHOOK RECEIVED ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Content-Type:', contentType);
    console.log('Raw Body:', JSON.stringify(body, null, 2));
    console.log('Headers:', {
      signature: signature,
      contentType: contentType,
    });

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
          received: receivedSignature,
          expected: expectedSignature,
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
      await handleVoucherOrder(orderId, status, gateway, paymentType, paidAt);
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
        await handleAgentDeposit(orderId, status, gateway, transactionId, paidAt);
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
  paidAt: Date | null
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
    if (order.status !== 'PAID') {
      // Update order to PAID
      await prisma.voucherOrder.update({
        where: { id: order.id },
        data: {
          status: 'PAID',
          paidAt: paidAt || new Date()
        }
      });

      console.log(`✅ Order ${order.orderNumber} marked as PAID`);

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

      const vouchers = [];
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
      }

      console.log(`✅ Generated ${vouchers.length} vouchers for order ${order.orderNumber}`);

      // ============================================
      // AUTO-SYNC TO KEUANGAN TRANSACTIONS
      // ============================================
      try {
        const hotspotCategory = await prisma.transactionCategory.findFirst({
          where: { name: 'Pembayaran Hotspot', type: 'INCOME' },
        });

        if (hotspotCategory) {
          // Check if transaction already exists
          const existingTransaction = await prisma.transaction.findFirst({
            where: { reference: order.orderNumber },
          });

          if (!existingTransaction) {
            await prisma.transaction.create({
              data: {
                id: nanoid(),
                categoryId: hotspotCategory.id,
                type: 'INCOME',
                amount: order.totalAmount,
                description: `Voucher ${order.profile.name} (${order.quantity}x) - ${order.customerName}`,
                date: paidAt || new Date(),
                reference: order.orderNumber,
                notes: `Auto-synced from voucher order payment`,
              },
            });
            console.log(`✅ Transaction synced to Keuangan: ${order.orderNumber}`);
          }
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
                purchaseDate: formatInTimeZone(new Date(), 'Asia/Jakarta', 'dd MMMM yyyy'),
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

              // eslint-disable-next-line @typescript-eslint/no-require-imports
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
  paidAt: Date | null
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

  // Update deposit status
  await prisma.agentDeposit.update({
    where: { id: deposit.id },
    data: {
      status: depositStatus,
      transactionId: transactionId || deposit.transactionId,
      paidAt: depositStatus === 'PAID' ? (paidAt || new Date()) : null,
    },
  });

  console.log(`[Agent Deposit] Updated deposit status to: ${depositStatus}`);

  // If payment successful, add balance to agent
  if (depositStatus === 'PAID') {
    const updatedAgent = await prisma.agent.update({
      where: { id: deposit.agentId },
      data: {
        balance: {
          increment: deposit.amount,
        },
      },
    });

    console.log(`[Agent Deposit] ✅ Agent ${deposit.agent.name} balance increased by Rp ${deposit.amount.toLocaleString('id-ID')}`);
    console.log(`[Agent Deposit] New balance: Rp ${updatedAgent.balance.toLocaleString('id-ID')}`);

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
          newBalance: updatedAgent.balance,
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
        const message = `Halo ${deposit.agent.name},\n\nTop-up saldo agent Anda berhasil!\n\nJumlah: Rp ${deposit.amount.toLocaleString('id-ID')}\nSaldo baru: Rp ${updatedAgent.balance.toLocaleString('id-ID')}\nGateway: ${gateway}\n\nTerima kasih!\n${company?.name || 'ISP'}`;

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

          // eslint-disable-next-line @typescript-eslint/no-require-imports
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
                  <td style="padding: 10px; border: 1px solid #ddd;">Rp ${updatedAgent.balance.toLocaleString('id-ID')}</td>
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
    include: { user: true }
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
      include: { user: true }
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
    // ─── ATOMIC IDEMPOTENCY GUARD ─────────────────────────────────────────────
    // Only ONE concurrent request will get count > 0; others skip silently.
    const markPaid = await prisma.invoice.updateMany({
      where: { id: invoice.id, status: { not: 'PAID' } },
      data: { status: 'PAID', paidAt: paidAt || new Date() },
    });

    if (markPaid.count === 0) {
      console.log(`[Customer Top-Up] ⏭️  Invoice ${invoice.invoiceNumber} already PAID — skipping duplicate notification`);
      return;
    }

    console.log(`[Customer Top-Up] ✅ Invoice ${invoice.invoiceNumber} marked as PAID`);

    // Add balance to customer
    if (invoice.user) {
      const topupAmount = amount || invoice.amount;

      const updatedUser = await prisma.pppoeUser.update({
        where: { id: invoice.user.id },
        data: {
          balance: {
            increment: topupAmount
          }
        }
      });

      console.log(`[Customer Top-Up] ✅ User ${invoice.user.username} balance increased by Rp ${topupAmount.toLocaleString('id-ID')}`);
      console.log(`[Customer Top-Up] New balance: Rp ${updatedUser.balance.toLocaleString('id-ID')}`);

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
            newBalance: updatedUser.balance,
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
          const existingTransaction = await prisma.transaction.findFirst({
            where: { reference: `TOPUP-${invoice.invoiceNumber}` },
          });

          if (!existingTransaction) {
            await prisma.$executeRaw`
              INSERT INTO transactions (id, categoryId, type, amount, description, date, reference, notes, createdAt, updatedAt)
              VALUES (${nanoid()}, ${category.id}, 'INCOME', ${topupAmount}, 
                      ${`Top-Up Saldo - ${invoice.user.name}`}, NOW(), 
                      ${`TOPUP-${invoice.invoiceNumber}`}, 
                      ${`Payment via ${gateway}`}, NOW(), NOW())
            `;
            console.log(`[Customer Top-Up] ✅ Transaction synced to Keuangan`);
          }
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

            // eslint-disable-next-line @typescript-eslint/no-require-imports
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
                    <td style="padding: 10px; border: 1px solid #ddd;">Rp ${updatedUser.balance.toLocaleString('id-ID')}</td>
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

// ============================================
// HANDLE INVOICE PAYMENT (PPPOE)
// ============================================
async function handleInvoicePayment(
  orderId: string,
  status: string,
  gateway: string,
  paymentType: string,
  paidAt: Date | null,
  transactionId: string = '',
  webhookAmount?: number
) {
  // Order ID formats:
  // 1. From /api/payment/create:        INV-${invoiceNumber}-${timestamp}  → orderId = INV-INV-202604-0001-ts
  // 2. From /api/.../regenerate-payment: ${invoiceNumber}-${timestamp}     → orderId = INV-202604-0001-ts
  // Strategy: strip only the trailing timestamp segment, keep everything before it.
  const lastHyphenIdx = orderId.lastIndexOf('-');
  const potentialTs = lastHyphenIdx >= 0 ? orderId.substring(lastHyphenIdx + 1) : '';
  // Timestamp = long numeric string (≥10 digits)
  const invoiceNumber = (potentialTs && /^\d{10,}$/.test(potentialTs))
    ? orderId.substring(0, lastHyphenIdx)
    : orderId;

  let invoice = await prisma.invoice.findFirst({
    where: { invoiceNumber },
    include: {
      user: {
        include: {
          profile: true
        }
      }
    }
  });

  // Fallback: legacy format INV-INV-{number}-{ts} → extracted as INV-{number}, try without leading INV-
  if (!invoice && invoiceNumber.startsWith('INV-INV-')) {
    const trimmed = invoiceNumber.substring(4); // Remove leading 'INV-'
    invoice = await prisma.invoice.findFirst({
      where: { invoiceNumber: trimmed },
      include: { user: { include: { profile: true } } }
    });
  }

  if (!invoice) {
    console.error('Invoice not found for order:', orderId, 'invoiceNumber:', invoiceNumber);
    // Gracefully ignore unknown payments (e.g., fixed-payment-code) to avoid retries
    return;
  }

  console.log(`✅ Invoice found: ${invoice.invoiceNumber}`);

  if (status === 'settlement' || status === 'capture') {
    if (typeof webhookAmount === 'number' && Number.isFinite(webhookAmount) && webhookAmount !== invoice.amount) {
      console.error(
        `[Webhook] AMOUNT_MISMATCH for ${invoice.invoiceNumber}: expected ${invoice.amount}, got ${webhookAmount}`
      );
      throw new Error('AMOUNT_MISMATCH');
    }

    // ─── ATOMIC IDEMPOTENCY GUARD ────────────────────────────────────────────
    // Use updateMany with status condition so only ONE concurrent request wins.
    // If count === 0 the invoice was already PAID by a previous webhook → skip.
    const markPaid = await prisma.invoice.updateMany({
      where: { id: invoice.id, status: { not: 'PAID' } },
      data: { status: 'PAID', paidAt: paidAt || new Date() },
    });

    if (markPaid.count === 0) {
      console.log(`[Webhook] ⏭️  Invoice ${invoice.invoiceNumber} already PAID — skipping duplicate notification`);
      return;
    }

    console.log(`✅ Invoice ${invoice.invoiceNumber} marked as PAID`);

      // Check if payment already exists (idempotency)
      const existingPayment = await prisma.payment.findFirst({
        where: { invoiceId: invoice.id }
      });

      // Create payment record only if not exists
      if (!existingPayment) {
        await prisma.payment.create({
          data: {
            id: crypto.randomUUID(),
            invoiceId: invoice.id,
            amount: invoice.amount,
            method: `${gateway}_${paymentType}`,
            status: 'completed',
            paidAt: paidAt || new Date()
          }
        });
        console.log(`✅ Payment record created for invoice ${invoice.invoiceNumber}`);
      } else {
        console.log(`⚠️ Payment already exists for invoice ${invoice.invoiceNumber}, skipping duplicate`);
      }

      console.log(`✅ Invoice ${invoice.invoiceNumber} marked as PAID`);

      // Create notification using NotificationService
      try {
        const customerName = invoice.customerName || invoice.user?.name || 'Unknown';
        const { NotificationService } = await import('@/server/services/notifications/dispatcher.service');
        await NotificationService.notifyPaymentReceived({
          amount: invoice.amount,
          invoiceId: invoice.id,
          customerName: customerName,
          customerUsername: invoice.user?.username,
          gateway: gateway
        });
      } catch (notifError) {
        console.error('[Invoice Payment] Notification error:', notifError);
      }

      // Log activity
      try {
        await logActivity({
          username: invoice.user?.username || invoice.customerUsername || 'Customer',
          action: 'PAYMENT_RECEIVED',
          description: `Payment received for invoice ${invoice.invoiceNumber} - Rp ${invoice.amount.toLocaleString('id-ID')}`,
          module: 'payment',
          status: 'success',
          metadata: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.amount,
            paymentGateway: gateway,
            paymentType,
            transactionId,
          },
        });
      } catch (logError) {
        console.error('Activity log error:', logError);
      }

      // ============================================
      // AUTO-SYNC TO KEUANGAN TRANSACTIONS
      // ============================================
      try {
        const pppoeCategory = await prisma.transactionCategory.findFirst({
          where: { name: 'Pembayaran PPPoE', type: 'INCOME' },
        });

        if (pppoeCategory) {
          const user = invoice.user;
          // Check if transaction already exists
          const existingTransaction = await prisma.transaction.findFirst({
            where: { reference: `INV-${invoice.invoiceNumber}` },
          });

          if (!existingTransaction) {
            const customerName = invoice.customerName || user?.name || 'Unknown';
            const profileName = user?.profile?.name || 'Unknown';

            // Use raw SQL with NOW() to avoid timezone conversion
            await prisma.$executeRaw`
                INSERT INTO transactions (id, categoryId, type, amount, description, date, reference, notes, createdAt, updatedAt)
                VALUES (${nanoid()}, ${pppoeCategory.id}, 'INCOME', ${invoice.amount}, 
                        ${`Pembayaran ${profileName} - ${customerName}`}, NOW(), 
                        ${`INV-${invoice.invoiceNumber}`}, 
                        ${`Payment via ${gateway} (${paymentType})`}, NOW(), NOW())
              `;
            console.log(`✅ Transaction synced to Keuangan: ${invoice.invoiceNumber} (Rp ${invoice.amount})`);
          } else {
            console.log(`⏭️  Transaction already exists for: ${invoice.invoiceNumber}`);
          }
        }
      } catch (keuanganError) {
        console.error('Keuangan sync error:', keuanganError);
      }

      // ============================================
      // ACTIVATE USER & EXTEND EXPIRY
      // ============================================

      const user = invoice.user;

      if (user && user.profile) {
        const profile = user.profile;
        const now = new Date();
        const normalizedStatus = (user.status || '').toLowerCase();

        // PREPAID vs POSTPAID logic
        let newExpiredAt: Date | null = null;

        // Both PREPAID and POSTPAID: Extend expiredAt by validity period
        // Base date: use current expiredAt if still in the future, otherwise use now (payment date)
        // This ensures user always gets a full validity period after each payment
        {
          let baseDate = user.expiredAt ? new Date(user.expiredAt) : now;
          if (baseDate < now) {
            baseDate = now; // Expired already → start fresh from payment date
          }

          newExpiredAt = new Date(baseDate);

          switch (profile.validityUnit) {
            case 'DAYS':
              newExpiredAt.setDate(newExpiredAt.getDate() + profile.validityValue);
              break;
            case 'MONTHS':
              newExpiredAt.setMonth(newExpiredAt.getMonth() + profile.validityValue);
              break;
            case 'HOURS':
              newExpiredAt.setHours(newExpiredAt.getHours() + profile.validityValue);
              break;
            case 'MINUTES':
              newExpiredAt.setMinutes(newExpiredAt.getMinutes() + profile.validityValue);
              break;
          }
        }

        // Determine if user should be activated (include blocked status)
        const wasDisabled = ['isolated', 'suspended', 'blocked'].includes(normalizedStatus);
        const newStatus = wasDisabled ? 'active' : normalizedStatus || 'active';

        // Check if this is a package upgrade invoice
        let newProfileId = user.profileId;
        let isPackageChange = false;
        if (invoice.additionalFees && typeof invoice.additionalFees === 'object') {
          const additionalFeesObj = invoice.additionalFees as any;
          if (additionalFeesObj.items && Array.isArray(additionalFeesObj.items)) {
            const upgradeItem = additionalFeesObj.items.find((item: any) =>
              (item.metadata?.type === 'package_upgrade' || item.metadata?.type === 'package_change') && item.metadata?.newPackageId
            );
            if (upgradeItem) {
              newProfileId = upgradeItem.metadata.newPackageId;
              isPackageChange = true;
              console.log(`📦 Package change detected: ${upgradeItem.metadata.oldPackageName} → ${upgradeItem.metadata.newPackageName} (expiry PRESERVED)`);
            }
          }
        }

        // For package change: keep existing expiredAt, do NOT extend
        const finalExpiredAt = isPackageChange ? user.expiredAt : newExpiredAt;

        // Update user
        await prisma.pppoeUser.update({
          where: { id: user.id },
          data: {
            expiredAt: finalExpiredAt,
            status: newStatus,
            profileId: newProfileId
          }
        });

        console.log(`✅ User ${user.username} updated (${user.subscriptionType}):`)
        console.log(`   - Expiry: ${user.expiredAt?.toISOString() || 'null'} → ${finalExpiredAt?.toISOString() || 'null'} ${isPackageChange ? '(package change, preserved)' : ''}`);
        console.log(`   - Status: ${user.status} → ${newStatus}`);
        if (newProfileId !== user.profileId) {
          console.log(`   - Profile: ${user.profileId} → ${newProfileId}`);
        }

        // ============================================
        // SEND WHATSAPP NOTIFICATION (ALWAYS)
        // ============================================
        try {
          await sendPaymentSuccess({
            customerName: user.name,
            customerPhone: user.phone,
            customerId: (user as any).customerId || undefined,
            username: user.username,
            password: user.password,
            profileName: profile.name,
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.amount,
            newExpiredAt: finalExpiredAt ?? undefined,
          });
          console.log(`✅ WhatsApp payment success notification sent`);
        } catch (waError) {
          console.error('WhatsApp notification error:', waError);
        }

        // ============================================
        // SEND WEB PUSH / FCM TO CUSTOMER
        // ============================================
        try {
          const { sendPushToUser } = await import('@/server/services/notifications/push-templates.service');
          await sendPushToUser(user.id, 'payment-success', {
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.amount,
            username: user.username,
            expiredDate: finalExpiredAt ?? undefined,
          });
          console.log(`✅ Push notification (web/FCM) sent to customer ${user.username}`);
        } catch (pushError) {
          console.error('Push notification error:', pushError);
        }

        // ============================================
        // SEND EMAIL NOTIFICATION FOR PAYMENT SUCCESS
        // ============================================
        const customerEmail = invoice.customerEmail || user.email;
        if (customerEmail) {
          try {
            const emailSettings = await prisma.emailSettings.findFirst();
            if (emailSettings?.enabled) {
              const emailTemplate = await prisma.emailTemplate.findFirst({
                where: { type: 'payment-success', isActive: true }
              });

              if (emailTemplate) {
                const company = await prisma.company.findFirst();
                const expiredDateStr = finalExpiredAt
                  ? new Date(finalExpiredAt).toLocaleDateString('id-ID', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })
                  : '-';
                const variables: Record<string, string> = {
                  customerId: user.customerId || '',
                  customerName: user.name || invoice.customerName || 'Pelanggan',
                  username: user.username,
                  profileName: profile.name,
                  invoiceNumber: invoice.invoiceNumber,
                  amount: `Rp ${invoice.amount.toLocaleString('id-ID')}`,
                  expiredDate: expiredDateStr,
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

                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const nodemailer = require('nodemailer');
                const transporter = nodemailer.createTransport({
                  host: emailSettings.smtpHost,
                  port: emailSettings.smtpPort,
                  secure: emailSettings.smtpSecure,
                  auth: { user: emailSettings.smtpUser, pass: emailSettings.smtpPassword },
                });

                await transporter.sendMail({
                  from: `"${emailSettings.fromName}" <${emailSettings.fromEmail}>`,
                  to: customerEmail,
                  subject: subject,
                  html: htmlBody,
                });

                await prisma.emailHistory.create({
                  data: {
                    id: nanoid(),
                    toEmail: customerEmail,
                    toName: user.name || invoice.customerName,
                    subject: subject,
                    body: htmlBody,
                    status: 'sent',
                  },
                });
                console.log(`✅ Email payment success notification sent to ${customerEmail}`);
              }
            }
          } catch (emailError) {
            console.error('Email payment notification error:', emailError);
          }
        }

        // ============================================
        // PROCESS REFERRAL BONUS (FIRST PAYMENT)
        // ============================================
        try {
          // Check if user was referred
          const fullUser = await prisma.pppoeUser.findUnique({
            where: { id: user.id },
            select: { id: true, referredById: true, name: true },
          });

          if (fullUser?.referredById) {
            // Get referral config
            const companyRef = await prisma.company.findFirst({
              select: {
                referralEnabled: true,
                referralRewardAmount: true,
                referralRewardType: true,
              },
            });

            if (companyRef?.referralEnabled && companyRef.referralRewardType === 'FIRST_PAYMENT') {
              // Check if reward already exists (idempotency)
              const existingReward = await prisma.referralReward.findFirst({
                where: { referrerId: fullUser.referredById, referredId: user.id },
              });

              if (!existingReward) {
                // Check if this is the first paid invoice for this user
                const paidInvoiceCount = await prisma.invoice.count({
                  where: { userId: user.id, status: 'PAID' },
                });

                if (paidInvoiceCount <= 1) {
                  const rewardAmount = companyRef.referralRewardAmount ?? 10000;

                  // Create reward and credit referrer balance atomically
                  await prisma.referralReward.create({
                    data: {
                      referrerId: fullUser.referredById,
                      referredId: user.id,
                      amount: rewardAmount,
                      status: 'CREDITED',
                      type: 'FIRST_PAYMENT',
                      creditedAt: new Date(),
                    },
                  });
                  console.log(`✅ Referral reward ${rewardAmount} recorded for referrer ${fullUser.referredById}`);
                }
              }
            }
          }
        } catch (referralError) {
          console.error('Referral bonus error:', referralError);
        }

        if (wasDisabled) {
          console.log(`   - Status: ${user.status} → ${newStatus}`);

          // ============================================
          // RADIUS SYNC FOR REACTIVATION
          // ============================================

          try {
            // Remove forced reject (if any) from previous SUSPENDED state
            await prisma.radcheck.deleteMany({
              where: {
                username: user.username,
                attribute: 'Auth-Type',
              },
            });

            // Remove NAS-IP-Address restriction (can prevent login if NAS-IP differs)
            await prisma.radcheck.deleteMany({
              where: {
                username: user.username,
                attribute: 'NAS-IP-Address',
              },
            });

            // 1. Restore radcheck (username + password)
            await prisma.$executeRaw`
                INSERT INTO radcheck (username, attribute, op, value)
                VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password})
                ON DUPLICATE KEY UPDATE value = ${user.password}
              `;

            // 2. Restore radusergroup — DELETE first to remove 'isolir' row, then insert real group
            await prisma.$executeRaw`
                DELETE FROM radusergroup WHERE username = ${user.username}
              `;
            await prisma.$executeRaw`
                INSERT INTO radusergroup (username, groupname, priority)
                VALUES (${user.username}, ${profile.groupName}, 0)
                ON DUPLICATE KEY UPDATE groupname = ${profile.groupName}
              `;

            // 3. Remove isolated message from radreply
            await prisma.radreply.deleteMany({
              where: {
                username: user.username,
                attribute: 'Reply-Message'
              }
            });
            console.log(`✅ Removed isolated message from radreply for ${user.username}`);

            // 4. Restore radreply (if static IP)
            if (user.ipAddress) {
              await prisma.$executeRaw`
                  INSERT INTO radreply (username, attribute, op, value)
                  VALUES (${user.username}, 'Framed-IP-Address', ':=', ${user.ipAddress})
                  ON DUPLICATE KEY UPDATE value = ${user.ipAddress}
                `;
            }

            console.log(`✅ RADIUS entries restored for ${user.username}`);

            // Update registration status to ACTIVE if this is installation invoice
            const registration = await prisma.registrationRequest.findFirst({
              where: {
                pppoeUserId: user.id,
                status: 'INSTALLED'
              }
            });

            if (registration) {
              await prisma.registrationRequest.update({
                where: { id: registration.id },
                data: { status: 'ACTIVE' }
              });
              console.log(`✅ Registration ${registration.id} status updated to ACTIVE`);
            }

            // 5. Send CoA Disconnect to force re-authentication
            try {
              const coaResult = await disconnectPPPoEUser(user.username);
              if (coaResult.success) {
                console.log(`✅ CoA disconnect sent for ${user.username}`);
              } else {
                console.log(`⚠️ CoA disconnect: ${coaResult.error || 'No active session'}`);
              }
            } catch (coaError) {
              console.error('CoA disconnect failed:', coaError);
            }
          } catch (radiusError) {
            console.error('RADIUS sync error:', radiusError);
          }
        }
      }
  } else if (['expire', 'cancel', 'deny', 'failed'].includes(status)) {
    if (invoice.status !== 'PAID' && invoice.status !== 'CANCELLED') {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'CANCELLED' }
      });
      console.log(`❌ Invoice ${invoice.invoiceNumber} marked as CANCELLED`);
    }
  }
}
