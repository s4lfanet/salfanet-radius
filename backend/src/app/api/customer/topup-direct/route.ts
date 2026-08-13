import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { createMidtransPayment } from '@/server/services/payment/midtrans.service';
import { createXenditInvoice } from '@/server/services/payment/xendit.service';
import { createDuitkuClient } from '@/server/services/payment/duitku.service';
import { createTripayClient } from '@/server/services/payment/tripay.service';

// Helper to verify customer token
async function verifyCustomerToken(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return null;

    const session = await prisma.customerSession.findFirst({
      where: {
        token,
        verified: true,
        expiresAt: { gte: new Date() },
      },
    });

    if (!session) return null;

    return await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        phone: true,
        balance: true
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify customer token
    const pppoeUser = await verifyCustomerToken(request);
    if (!pppoeUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { amount, gateway, paymentChannel } = body;

    // Validate input
    if (!amount || amount < 10000) {
      return NextResponse.json(
        { error: 'Minimal top-up adalah Rp 10.000' },
        { status: 400 }
      );
    }

    if (!gateway) {
      return NextResponse.json(
        { error: 'Metode pembayaran harus dipilih' },
        { status: 400 }
      );
    }

    // Verify payment gateway is active
    const gatewayConfig = await prisma.paymentGateway.findFirst({
      where: {
        provider: gateway,
        isActive: true
      }
    });

    if (!gatewayConfig) {
      return NextResponse.json(
        { error: 'Payment gateway tidak tersedia' },
        { status: 400 }
      );
    }

    // Create invoice first so every gateway callback/redirect has stable token + orderId
    let paymentUrl: string | null = null;
    const customerEmail = pppoeUser.email || `${pppoeUser.username}@customer.com`;

    const invoiceCount = await prisma.invoice.count();
    const invoiceNumber = `TOPUP-${Date.now()}-${(invoiceCount + 1).toString().padStart(5, '0')}`;
    const paymentToken = `pay-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);

    const invoice = await prisma.invoice.create({
      data: {
        id: `inv-topup-${Date.now()}`,
        userId: pppoeUser.id,
        invoiceNumber,
        amount,
        dueDate,
        status: 'PENDING',
        paymentToken,
        paymentLink: null,
        customerName: pppoeUser.name,
        customerPhone: pppoeUser.phone,
        customerEmail,
        customerUsername: pppoeUser.username,
        invoiceType: 'TOPUP',
        baseAmount: amount
      }
    });

    // Keep orderId aligned with invoiceNumber so webhook can resolve deterministically
    const orderId = invoice.invoiceNumber;

    // Compute base URL for callbacks/return URLs
    const companyForBase = await prisma.company.findFirst({ select: { baseUrl: true } });
    const _proto = request.headers.get('x-forwarded-proto') || 'http';
    const _host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
    const _inferred = _host ? `${_proto}://${_host}` : '';
    const appBaseUrl = (companyForBase?.baseUrl && !companyForBase.baseUrl.includes('localhost'))
      ? companyForBase.baseUrl
      : (_inferred && !_inferred.includes('localhost'))
        ? _inferred
        : companyForBase?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    console.log('[Top-Up Direct] Creating payment for gateway:', gateway);
    console.log('[Top-Up Direct] Amount:', amount);
    console.log('[Top-Up Direct] Customer:', pppoeUser.name, pppoeUser.phone);

    try {
      if (gateway === 'midtrans') {
        console.log('[Top-Up Direct] Calling Midtrans API...');
        const midtransResult = await createMidtransPayment({
          orderId,
          amount: amount,
          customerName: pppoeUser.name,
          customerEmail: customerEmail,
          customerPhone: pppoeUser.phone,
          invoiceToken: paymentToken,
          baseUrl: appBaseUrl,
          items: [{
            id: 'topup',
            name: `Top-Up Saldo`,
            price: amount,
            quantity: 1
          }]
        });
        paymentUrl = midtransResult.redirect_url;
        console.log('[Top-Up Direct] Midtrans payment URL:', paymentUrl);
        
      } else if (gateway === 'xendit') {
        console.log('[Top-Up Direct] Calling Xendit API...');
        const xenditResult = await createXenditInvoice({
          externalId: orderId,
          amount: amount,
          payerEmail: customerEmail,
          description: `Top-Up Saldo`,
          customerName: pppoeUser.name,
          customerPhone: pppoeUser.phone,
          invoiceToken: paymentToken,
          baseUrl: appBaseUrl,
        });
        paymentUrl = xenditResult.invoiceUrl;
        console.log('[Top-Up Direct] Xendit payment URL:', paymentUrl);
        
      } else if (gateway === 'duitku') {
        console.log('[Top-Up Direct] Calling Duitku API...');
        console.log('[Top-Up Direct] Duitku Config:', {
          merchantCode: gatewayConfig.duitkuMerchantCode,
          hasApiKey: !!gatewayConfig.duitkuApiKey,
          environment: gatewayConfig.duitkuEnvironment
        });

        const duitku = createDuitkuClient(
          gatewayConfig.duitkuMerchantCode || '',
          gatewayConfig.duitkuApiKey || '',
          `${appBaseUrl}/api/payment/webhook`,
          `${appBaseUrl}/payment/pending?token=${paymentToken}`,
          gatewayConfig.duitkuEnvironment === 'sandbox'
        );

        const result = await duitku.createInvoice({
          invoiceId: orderId,
          amount: amount,
          customerName: pppoeUser.name,
          customerEmail: customerEmail,
          customerPhone: pppoeUser.phone,
          description: `Top-Up Saldo`,
          expiryMinutes: 1440, // 24 hours
          paymentMethod: paymentChannel || 'VC', // Use selected channel, fallback VA BCA
        });

        paymentUrl = result.paymentUrl;
        console.log('[Top-Up Direct] Duitku payment URL:', paymentUrl);
        
      } else if (gateway === 'tripay') {
        console.log('[Top-Up Direct] Calling Tripay API...');
        console.log('[Top-Up Direct] Tripay Config:', {
          merchantCode: gatewayConfig.tripayMerchantCode,
          hasApiKey: !!gatewayConfig.tripayApiKey,
          hasPrivateKey: !!gatewayConfig.tripayPrivateKey,
          environment: gatewayConfig.tripayEnvironment
        });

        const tripay = createTripayClient(
          gatewayConfig.tripayMerchantCode || '',
          gatewayConfig.tripayApiKey || '',
          gatewayConfig.tripayPrivateKey || '',
          gatewayConfig.tripayEnvironment === 'sandbox'
        );

        console.log('[Top-Up Direct] Tripay transaction params:', {
          method: 'QRIS',
          merchantRef: orderId,
          amount: amount,
          customerName: pppoeUser.name,
          customerEmail: customerEmail,
          customerPhone: pppoeUser.phone
        });

        const result = await tripay.createTransaction({
          method: 'QRIS',
          merchantRef: orderId,
          amount: amount,
          customerName: pppoeUser.name,
          customerEmail: customerEmail,
          customerPhone: pppoeUser.phone,
          orderItems: [
            {
              name: `Top-Up Saldo`,
              price: amount,
              quantity: 1,
            },
          ],
          callbackUrl: `${appBaseUrl}/api/payment/webhook`,
          returnUrl: `${appBaseUrl}/payment/pending?token=${paymentToken}`,
          expiredTime: 86400, // 24 hours
        });

        console.log('[Top-Up Direct] Tripay result:', JSON.stringify(result, null, 2));

        if (result.success && result.data) {
          paymentUrl = result.data.checkout_url || result.data.pay_url || '';
          console.log('[Top-Up Direct] Tripay payment URL:', paymentUrl);
          console.log('[Top-Up Direct] Tripay reference:', result.data.reference);
        } else {
          console.error('[Top-Up Direct] Tripay failed:', result);
          throw new Error(result.message || 'Failed to create Tripay payment');
        }
      }

      // Validate payment URL was generated
      if (!paymentUrl) {
        throw new Error('Payment URL tidak di-generate oleh payment gateway');
      }

      console.log('[Top-Up Direct] Payment created successfully, URL:', paymentUrl);

    } catch (paymentError: any) {
      console.error('[Top-Up Direct] Payment creation error:', paymentError);
      console.error('[Top-Up Direct] Error stack:', paymentError.stack);

      // Rollback invoice if payment gateway request failed
      await prisma.invoice.delete({ where: { id: invoice.id } }).catch(() => null);
      
      return NextResponse.json(
        { 
          success: false,
          error: `Gagal membuat pembayaran: ${paymentError.message || 'Unknown error'}`,
          details: paymentError.message,
          gateway: gateway
        },
        { status: 500 }
      );
    }

    // Update invoice with generated payment link
    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { paymentLink: paymentUrl }
    });

    console.log('[Top-Up Direct] Invoice created:', updatedInvoice.invoiceNumber);
    console.log('[Top-Up Direct] Invoice has payment link:', !!updatedInvoice.paymentLink);

    console.log('[Top-Up Direct] Sending response with payment URL:', paymentUrl);

    return NextResponse.json({
      success: true,
      message: 'Invoice top-up berhasil dibuat',
      invoiceNumber: updatedInvoice.invoiceNumber,
      amount: updatedInvoice.amount,
      paymentUrl: paymentUrl,
      invoice: {
        id: updatedInvoice.id,
        invoiceNumber: updatedInvoice.invoiceNumber,
        amount: updatedInvoice.amount,
        status: updatedInvoice.status,
        dueDate: updatedInvoice.dueDate,
        paymentToken: updatedInvoice.paymentToken,
        paymentLink: paymentUrl
      }
    });

  } catch (error: any) {
    console.error('Top-up direct error:', error);
    return NextResponse.json(
      { error: error.message || 'Gagal membuat invoice top-up' },
      { status: 500 }
    );
  }
}
