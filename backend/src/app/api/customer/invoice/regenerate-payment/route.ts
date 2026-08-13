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
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const pppoeUser = await verifyCustomerToken(request);
    if (!pppoeUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { invoiceId, gateway } = body;

    if (!invoiceId || !gateway) {
      return NextResponse.json(
        { error: 'Invoice ID dan gateway harus dipilih' },
        { status: 400 }
      );
    }

    // Get invoice
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        userId: pppoeUser.id,
        status: 'PENDING'
      }
    });

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice tidak ditemukan atau sudah dibayar' },
        { status: 404 }
      );
    }

    // Get payment gateway config
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

    // Create payment
    let paymentUrl: string | null = null;
    const orderId = `${invoice.invoiceNumber}-${Date.now()}`;
    const customerEmail = pppoeUser.email || `${pppoeUser.username}@customer.com`;

    // Compute base URL with localhost check + request header fallback
    const companyForBase = await prisma.company.findFirst({ select: { baseUrl: true } });
    const _proto = request.headers.get('x-forwarded-proto') || 'http';
    const _host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
    const _inferred = _host ? `${_proto}://${_host}` : '';
    const appBaseUrl = (companyForBase?.baseUrl && !companyForBase.baseUrl.includes('localhost'))
      ? companyForBase.baseUrl
      : (_inferred && !_inferred.includes('localhost'))
        ? _inferred
        : companyForBase?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    console.log('[Regenerate Payment] Creating payment for invoice:', invoice.invoiceNumber);
    console.log('[Regenerate Payment] Gateway:', gateway);

    try {
      if (gateway === 'midtrans') {
        const result = await createMidtransPayment({
          orderId,
          amount: invoice.amount,
          customerName: pppoeUser.name,
          customerEmail: customerEmail,
          customerPhone: pppoeUser.phone,
          invoiceToken: invoice.paymentToken || '',
          baseUrl: appBaseUrl,
          items: [{
            id: invoice.invoiceType || 'topup',
            name: invoice.invoiceType === 'TOPUP' ? 'Top-Up Saldo' : 'Pembayaran Invoice',
            price: invoice.amount,
            quantity: 1
          }]
        });
        paymentUrl = result.redirect_url;
      } else if (gateway === 'xendit') {
        const result = await createXenditInvoice({
          externalId: orderId,
          amount: invoice.amount,
          payerEmail: customerEmail,
          description: invoice.invoiceType === 'TOPUP' ? 'Top-Up Saldo' : 'Pembayaran Invoice',
          customerName: pppoeUser.name,
          customerPhone: pppoeUser.phone,
          invoiceToken: invoice.paymentToken || '',
          baseUrl: appBaseUrl,
        });
        paymentUrl = result.invoiceUrl;
      } else if (gateway === 'duitku') {
        const duitku = createDuitkuClient(
          gatewayConfig.duitkuMerchantCode || '',
          gatewayConfig.duitkuApiKey || '',
          `${appBaseUrl}/api/payment/webhook`,
          `${appBaseUrl}/customer`,
          gatewayConfig.duitkuEnvironment === 'sandbox'
        );

        const result = await duitku.createInvoice({
          invoiceId: orderId,
          amount: invoice.amount,
          customerName: pppoeUser.name,
          customerEmail: customerEmail,
          customerPhone: pppoeUser.phone,
          description: invoice.invoiceType === 'TOPUP' ? 'Top-Up Saldo' : 'Pembayaran Invoice',
          expiryMinutes: 1440,
          paymentMethod: 'SP', // Default QRIS
        });

        paymentUrl = result.paymentUrl;
      } else if (gateway === 'tripay') {
        const tripay = createTripayClient(
          gatewayConfig.tripayMerchantCode || '',
          gatewayConfig.tripayApiKey || '',
          gatewayConfig.tripayPrivateKey || '',
          gatewayConfig.tripayEnvironment === 'sandbox'
        );

        const result = await tripay.createTransaction({
          method: 'QRIS',
          merchantRef: orderId,
          amount: invoice.amount,
          customerName: pppoeUser.name,
          customerEmail: customerEmail,
          customerPhone: pppoeUser.phone,
          orderItems: [{
            name: invoice.invoiceType === 'TOPUP' ? 'Top-Up Saldo' : 'Pembayaran Invoice',
            price: invoice.amount,
            quantity: 1,
          }],
          returnUrl: `${appBaseUrl}/customer`,
          expiredTime: 86400,
        });

        if (result.success && result.data) {
          paymentUrl = result.data.checkout_url || result.data.pay_url || '';
        } else {
          throw new Error(result.message || 'Failed to create Tripay payment');
        }
      }

      if (!paymentUrl) {
        throw new Error('Payment URL tidak di-generate oleh payment gateway');
      }

      // Update invoice with payment link
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { paymentLink: paymentUrl }
      });

      console.log('[Regenerate Payment] Success! Payment URL:', paymentUrl);

      return NextResponse.json({
        success: true,
        paymentUrl: paymentUrl,
        message: 'Link pembayaran berhasil dibuat'
      });

    } catch (error: any) {
      console.error('[Regenerate Payment] Error:', error);
      return NextResponse.json(
        { 
          success: false,
          error: `Gagal membuat pembayaran: ${error.message}`,
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('[Regenerate Payment] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Terjadi kesalahan' },
      { status: 500 }
    );
  }
}
