import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { createMidtransPayment } from '@/server/services/payment/midtrans.service';
import { createXenditInvoice } from '@/server/services/payment/xendit.service';
import { createDuitkuClient } from '@/server/services/payment/duitku.service';
import { createTripayClient } from '@/server/services/payment/tripay.service';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * GET handler to prevent 500 errors from browser prefetch
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to create payment.' },
    { status: 405 }
  );
}

/**
 * Create Payment Transaction
 * POST /api/payment/create
 * Body: { invoiceId, gateway }
 */
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, RateLimitPresets.strict);
    if (limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    // Parse body with error handling
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('[Payment Create] Failed to parse request body:', parseError);
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { invoiceId, orderNumber, amount, gateway, type, paymentMethod } = body;

    console.log('[Payment Create] Request:', { invoiceId, orderNumber, amount, gateway, type, paymentMethod });

    // For voucher orders
    if (type === 'voucher') {
      if (!orderNumber || !amount || !gateway) {
        return NextResponse.json(
          { error: 'Order number, amount and gateway are required for voucher orders' },
          { status: 400 }
        );
      }

      const order = await prisma.voucherOrder.findFirst({
        where: { orderNumber },
        include: { profile: true }
      });

      if (!order) {
        return NextResponse.json({ error: 'Voucher order not found' }, { status: 404 });
      }

      if (order.status === 'PAID') {
        return NextResponse.json({ error: 'Order already paid' }, { status: 400 });
      }

      return await createVoucherPayment(order, gateway);
    }

    // For invoices (PPPoE)
    if (!invoiceId || !gateway) {
      return NextResponse.json(
        { error: 'Invoice ID and gateway are required' },
        { status: 400 }
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        user: {
          include: {
            profile: true
          }
        }
      }
    });

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    if (invoice.status === 'PAID') {
      return NextResponse.json(
        { error: 'Invoice already paid' },
        { status: 400 }
      );
    }

    if (!invoice.paymentToken) {
      return NextResponse.json(
        { error: 'Invoice payment token not found' },
        { status: 400 }
      );
    }

    // Check if payment gateway is active
    const gatewayConfig = await prisma.paymentGateway.findUnique({
      where: { provider: gateway }
    });

    if (!gatewayConfig || !gatewayConfig.isActive) {
      return NextResponse.json(
        { error: 'Payment gateway not available' },
        { status: 400 }
      );
    }

    // Skip checking for existing pending payment for now
    // User can create new payment attempt if needed

    // Get customer info (use snapshot if user deleted)
    const customerName = invoice.user?.name || invoice.customerName || 'Customer';
    const customerPhone = invoice.user?.phone || invoice.customerPhone || '08123456789';
    const customerEmail = invoice.user?.email || `invoice-${invoice.invoiceNumber}@example.com`;

    // Generate unique order ID (invoiceNumber already contains INV- prefix)
    const orderId = `${invoice.invoiceNumber}-${Date.now()}`;

    // Compute base URL for callbacks/return URLs
    // Priority: company.baseUrl → request Host header → env → localhost
    const companyForBase = await prisma.company.findFirst({ select: { baseUrl: true } });
    const _proto = request.headers.get('x-forwarded-proto') || 'http';
    const _host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
    const _inferred = _host ? `${_proto}://${_host}` : '';
    const appBaseUrl = (companyForBase?.baseUrl && !companyForBase.baseUrl.includes('localhost'))
      ? companyForBase.baseUrl
      : (_inferred && !_inferred.includes('localhost'))
        ? _inferred
        : companyForBase?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    let paymentUrl = '';
    let snapToken = '';
    let transactionId = '';
    let qrString = ''; // For Duitku QRIS

    // ============================================
    // CREATE PAYMENT VIA GATEWAY
    // ============================================

    if (gateway === 'midtrans') {
      try {
        const result = await createMidtransPayment({
          orderId,
          amount: invoice.amount,
          customerName,
          customerEmail,
          customerPhone,
          invoiceToken: invoice.paymentToken,
          baseUrl: appBaseUrl,
          items: [
            {
              id: invoice.id,
              name: `Invoice ${invoice.invoiceNumber}`,
              price: invoice.amount,
              quantity: 1
            }
          ]
        });

        snapToken = result.token;
        paymentUrl = result.redirect_url || '';
      } catch (error) {
        console.error('[Midtrans] Payment creation error:', error);
        return NextResponse.json(
          { error: 'Failed to create Midtrans payment', details: error instanceof Error ? error.message : 'Unknown error' },
          { status: 500 }
        );
      }
    } else if (gateway === 'xendit') {
      try {
        const result = await createXenditInvoice({
          externalId: orderId,
          amount: invoice.amount,
          payerEmail: customerEmail,
          description: `Payment for Invoice ${invoice.invoiceNumber}`,
          customerName,
          customerPhone,
          invoiceToken: invoice.paymentToken,
          baseUrl: appBaseUrl,
        });

        console.log('[Xendit] Response:', JSON.stringify(result, null, 2));
        
        transactionId = result.id || '';
        paymentUrl = (result as any).invoice_url || result.invoiceUrl || '';
        
        if (!paymentUrl) {
          console.error('[Xendit] No payment URL in response:', result);
        }
      } catch (error) {
        console.error('[Xendit] Payment creation error:', error);
        return NextResponse.json(
          { error: 'Failed to create Xendit payment', details: error instanceof Error ? error.message : 'Unknown error' },
          { status: 500 }
        );
      }
    } else if (gateway === 'duitku') {
      try {
        const duitku = createDuitkuClient(
          gatewayConfig.duitkuMerchantCode || '',
          gatewayConfig.duitkuApiKey || '',
          `${appBaseUrl}/api/payment/webhook`,
          `${appBaseUrl}/pay/${invoice.paymentToken}`,
          gatewayConfig.duitkuEnvironment === 'sandbox'
        );

        const result = await duitku.createInvoice({
          invoiceId: orderId,
          amount: invoice.amount,
          customerName,
          customerEmail,
          customerPhone,
          description: `Payment for Invoice ${invoice.invoiceNumber}`,
          expiryMinutes: 1440, // 24 hours
          paymentMethod: paymentMethod || 'SP', // Use selected method or default to ShopeePay QRIS
        });

        transactionId = result.reference;
        paymentUrl = result.paymentUrl;
        qrString = result.qrString || ''; // Store QR string for frontend
        
        console.log('[Duitku] Payment created:', result.reference);
      } catch (error) {
        console.error('[Duitku] Payment creation error:', error);
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        // Return 400 for Duitku business errors (min amount, channel unavailable)
        const isBusinessError = errMsg.includes('Minimum Payment') || errMsg.includes('not available');
        return NextResponse.json(
          { error: isBusinessError ? errMsg : 'Gagal membuat pembayaran Duitku', details: errMsg },
          { status: isBusinessError ? 400 : 500 }
        );
      }
    } else if (gateway === 'tripay') {
      try {
        const tripay = createTripayClient(
          gatewayConfig.tripayMerchantCode || '',
          gatewayConfig.tripayApiKey || '',
          gatewayConfig.tripayPrivateKey || '',
          gatewayConfig.tripayEnvironment === 'sandbox'
        );

        const result = await tripay.createTransaction({
          method: 'QRIS', // Default QRIS, bisa dikustomisasi
          merchantRef: orderId,
          amount: invoice.amount,
          customerName,
          customerEmail,
          customerPhone,
          orderItems: [
            {
              name: `Invoice ${invoice.invoiceNumber}`,
              price: invoice.amount,
              quantity: 1,
            },
          ],
          returnUrl: `${appBaseUrl}/pay/${invoice.paymentToken}`,
          expiredTime: 86400, // 24 hours
        });

        if (result.success && result.data) {
          transactionId = result.data.reference;
          paymentUrl = result.data.checkout_url || result.data.pay_url || '';
          qrString = result.data.qr_code || '';
          
          console.log('[Tripay] Payment created:', result.data.reference);
          console.log('[Tripay] Payment URL:', paymentUrl);
        }
      } catch (error) {
        console.error('[Tripay] Payment creation error:', error);
        return NextResponse.json(
          { error: 'Failed to create Tripay payment', details: error instanceof Error ? error.message : 'Unknown error' },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Unsupported payment gateway' },
        { status: 400 }
      );
    }

    // ============================================
    // SAVE PAYMENT TO DATABASE
    // ============================================

    const payment = await prisma.payment.create({
      data: {
        id: crypto.randomUUID(),
        invoiceId: invoice.id,
        amount: invoice.amount,
        method: `${gateway}_${gateway === 'midtrans' ? 'snap' : 'invoice'}`,
        gatewayId: gatewayConfig.id,
        status: 'pending'
      }
    });

    console.log(`✅ Payment created: ${orderId} via ${gateway.toUpperCase()}`);
    
    // Create webhook log for pending payment
    try {
      await prisma.webhookLog.create({
        data: {
          id: crypto.randomUUID(),
          gateway,
          orderId,
          status: 'pending',
          transactionId: transactionId || null,
          amount: invoice.amount,
          payload: JSON.stringify({ type: 'invoice', invoiceId: invoice.id, createdAt: new Date() }),
          response: JSON.stringify({ paymentUrl, snapToken: snapToken || null }),
          success: true
        }
      });
      console.log(`✅ Webhook log created for ${orderId}`);
    } catch (logError) {
      console.error('Failed to create webhook log:', logError);
    }

    return NextResponse.json({
      success: true,
      payment,
      orderId,
      paymentUrl,
      snapToken,
      qrString: qrString || undefined // Include QR string if available (Duitku QRIS)
    });

  } catch (error) {
    console.error('❌ Payment creation error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create payment',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Create payment for voucher order
async function createVoucherPayment(order: any, gateway: string) {
  // Check if payment gateway is active
  const gatewayConfig = await prisma.paymentGateway.findUnique({
    where: { provider: gateway }
  });

  if (!gatewayConfig || !gatewayConfig.isActive) {
    return NextResponse.json(
      { error: 'Payment gateway not available' },
      { status: 400 }
    );
  }

  const customerName = order.customerName;
  const customerPhone = order.customerPhone;
  const customerEmail = order.customerEmail || `order-${order.orderNumber}@example.com`;
  const orderId = `${order.orderNumber}-${Date.now()}`;

  let paymentUrl = '';
  let snapToken = '';
  let qrString = ''; // For Duitku QRIS

  // Get base URL for return redirect
  const company = await prisma.company.findFirst();
  const baseUrl = company?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  if (gateway === 'midtrans') {
    try {
      const snap = new (await import('midtrans-client')).default.Snap({
        isProduction: gatewayConfig.midtransEnvironment === 'production',
        serverKey: gatewayConfig.midtransServerKey!,
        clientKey: gatewayConfig.midtransClientKey!
      });

      const parameter = {
        transaction_details: {
          order_id: orderId,
          gross_amount: order.totalAmount
        },
        customer_details: {
          first_name: customerName,
          email: customerEmail,
          phone: customerPhone
        },
        item_details: [
          {
            id: order.id,
            name: `Voucher ${order.profile.name} (${order.quantity}x)`,
            price: order.totalAmount,
            quantity: 1
          }
        ],
        callbacks: {
          finish: `${baseUrl}/evoucher/pay/${order.paymentToken}?status=success`,
          error: `${baseUrl}/evoucher/pay/${order.paymentToken}?status=failed`,
          pending: `${baseUrl}/evoucher/pay/${order.paymentToken}?status=pending`
        }
      };

      const transaction = await snap.createTransaction(parameter);
      snapToken = transaction.token;
      paymentUrl = transaction.redirect_url;
    } catch (error) {
      console.error('[Midtrans] Payment creation error:', error);
      return NextResponse.json(
        { error: 'Failed to create Midtrans payment', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }
  } else if (gateway === 'xendit') {
    try {
      const { Xendit } = await import('xendit-node');
      const xendit = new Xendit({ secretKey: gatewayConfig.xenditApiKey! });
      const { Invoice } = xendit;
      
      const invoice = await Invoice.createInvoice({
        data: {
          externalId: orderId,
          amount: order.totalAmount,
          payerEmail: customerEmail,
          description: `Payment for Voucher Order ${order.orderNumber}`,
          customer: {
            givenNames: customerName,
            mobileNumber: customerPhone
          },
          invoiceDuration: 86400,
          currency: 'IDR',
          reminderTime: 1,
          successRedirectUrl: `${baseUrl}/evoucher/pay/${order.paymentToken}?status=success`,
          failureRedirectUrl: `${baseUrl}/evoucher/pay/${order.paymentToken}?status=failed`
        }
      });

      console.log('[Xendit Voucher] Response:', JSON.stringify(invoice, null, 2));
      paymentUrl = (invoice as any).invoice_url || (invoice as any).invoiceUrl || '';
    } catch (error) {
      console.error('[Xendit] Payment creation error:', error);
      return NextResponse.json(
        { error: 'Failed to create Xendit payment', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }
  } else if (gateway === 'duitku') {
    try {
      const duitku = createDuitkuClient(
        gatewayConfig.duitkuMerchantCode || '',
        gatewayConfig.duitkuApiKey || '',
        `${baseUrl}/api/payment/webhook`,
        `${baseUrl}/evoucher/pay/${order.paymentToken}`,
        gatewayConfig.duitkuEnvironment === 'sandbox'
      );

      const result = await duitku.createInvoice({
        invoiceId: orderId,
        amount: order.totalAmount,
        customerName,
        customerEmail,
        customerPhone,
        description: `Payment for Voucher Order ${order.orderNumber}`,
        expiryMinutes: 1440, // 24 hours
        paymentMethod: 'SP', // Default QRIS
      });

      paymentUrl = result.paymentUrl;
      qrString = result.qrString || '';
      console.log('[Duitku Voucher] Payment created:', result.reference);
    } catch (error) {
      console.error('[Duitku] Payment creation error:', error);
      return NextResponse.json(
        { error: 'Failed to create Duitku payment', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }
  } else if (gateway === 'tripay') {
    try {
      const tripay = createTripayClient(
        gatewayConfig.tripayMerchantCode || '',
        gatewayConfig.tripayApiKey || '',
        gatewayConfig.tripayPrivateKey || '',
        gatewayConfig.tripayEnvironment === 'sandbox'
      );

      const result = await tripay.createTransaction({
        method: 'QRIS', // Default QRIS, bisa dikustomisasi
        merchantRef: orderId,
        amount: order.totalAmount,
        customerName,
        customerEmail,
        customerPhone,
        orderItems: [
          {
            name: `Voucher ${order.profile.name}`,
            price: order.totalAmount,
            quantity: 1,
          },
        ],
        returnUrl: `${baseUrl}/evoucher/pay/${order.paymentToken}`,
        expiredTime: 86400, // 24 hours
      });

      if (result.success && result.data) {
        paymentUrl = result.data.checkout_url || result.data.pay_url || '';
        qrString = result.data.qr_code || '';
        
        console.log('[Tripay Voucher] Payment created:', result.data.reference);
        console.log('[Tripay Voucher] Payment URL:', paymentUrl);
      }
    } catch (error) {
      console.error('[Tripay] Payment creation error:', error);
      return NextResponse.json(
        { error: 'Failed to create Tripay payment', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }
  } else {
    return NextResponse.json(
      { error: 'Unsupported payment gateway' },
      { status: 400 }
    );
  }

  console.log(`✅ Voucher payment created: ${orderId} via ${gateway.toUpperCase()}`);
  
  // Create webhook log for pending payment
  try {
    await prisma.webhookLog.create({
      data: {
        id: crypto.randomUUID(),
        gateway,
        orderId,
        status: 'pending',
        transactionId: null,
        amount: order.totalAmount,
        payload: JSON.stringify({ type: 'voucher', orderId: order.id, orderNumber: order.orderNumber, createdAt: new Date() }),
        response: JSON.stringify({ paymentUrl, snapToken: snapToken || null }),
        success: true
      }
    });
    console.log(`✅ Webhook log created for voucher ${orderId}`);
  } catch (logError) {
    console.error('Failed to create webhook log:', logError);
  }

  return NextResponse.json({
    success: true,
    orderId,
    paymentUrl,
    snapToken,
    qrString: qrString || undefined // Include QR string if available (Duitku QRIS)
  });
}
