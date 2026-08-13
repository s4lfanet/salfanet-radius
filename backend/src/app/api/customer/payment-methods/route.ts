import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

/**
 * GET /api/customer/payment-methods?gateway=duitku&amount=100000
 * Returns available payment channels for a given gateway and amount.
 * No auth required — channel list is not sensitive data.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const gateway = searchParams.get('gateway');
    const amount = parseInt(searchParams.get('amount') || '0');

    if (!gateway || !amount || amount < 10000) {
      return NextResponse.json({ error: 'gateway and amount are required' }, { status: 400 });
    }

    const gatewayConfig = await prisma.paymentGateway.findUnique({
      where: { provider: gateway },
    });

    if (!gatewayConfig || !gatewayConfig.isActive) {
      return NextResponse.json({ error: 'Payment gateway not available' }, { status: 400 });
    }

    const company = await prisma.company.findFirst();
    const baseUrl = company?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    interface PaymentMethodOption {
      code: string;
      name: string;
      totalFee?: number;
      iconUrl?: string | null;
    }

    let methods: PaymentMethodOption[] = [];

    switch (gateway) {
      case 'duitku': {
        if (!gatewayConfig.duitkuMerchantCode || !gatewayConfig.duitkuApiKey) {
          return NextResponse.json({ error: 'Duitku not configured' }, { status: 400 });
        }
        const { DuitkuPayment } = await import('@/server/services/payment/duitku.service');
        const duitku = new DuitkuPayment({
          merchantCode: gatewayConfig.duitkuMerchantCode,
          apiKey: gatewayConfig.duitkuApiKey,
          callbackUrl: `${baseUrl}/api/customer/topup-webhook`,
          returnUrl: `${baseUrl}/customer`,
          sandbox: gatewayConfig.duitkuEnvironment === 'sandbox',
        });
        try {
          const data = await duitku.getPaymentMethods(amount);
          if (data?.paymentFee && Array.isArray(data.paymentFee) && data.paymentFee.length > 0) {
            methods = data.paymentFee.map((m: any) => ({
              code: m.paymentMethod,
              name: m.paymentName,
              totalFee: m.totalFee ?? 0,
              iconUrl: m.paymentImage ?? null,
            }));
            break;
          }
        } catch {
          // fall through to fallback list
        }
        // Fallback: common Duitku payment channels
        methods = [
          { code: 'BC', name: 'BCA Virtual Account',        totalFee: 4000 },
          { code: 'M2', name: 'Mandiri Virtual Account',    totalFee: 4000 },
          { code: 'I1', name: 'BNI Virtual Account',        totalFee: 4000 },
          { code: 'B1', name: 'CIMB Niaga Virtual Account', totalFee: 4000 },
          { code: 'BT', name: 'Permata Virtual Account',    totalFee: 4000 },
          { code: 'OV', name: 'OVO',                        totalFee: 0 },
          { code: 'SP', name: 'ShopeePay',                  totalFee: 0 },
        ];
        break;
      }
      case 'tripay': {
        if (!gatewayConfig.tripayMerchantCode || !gatewayConfig.tripayApiKey || !gatewayConfig.tripayPrivateKey) {
          return NextResponse.json({ error: 'Tripay not configured' }, { status: 400 });
        }
        const { TripayPayment } = await import('@/server/services/payment/tripay.service');
        const tripay = new TripayPayment({
          merchantCode: gatewayConfig.tripayMerchantCode,
          apiKey: gatewayConfig.tripayApiKey,
          privateKey: gatewayConfig.tripayPrivateKey,
          sandbox: gatewayConfig.tripayEnvironment === 'sandbox',
        });
        const data = await tripay.getPaymentChannels();
        if (data?.data && Array.isArray(data.data)) {
          methods = data.data
            .filter((ch: any) => ch.active)
            .map((ch: any) => ({
              code: ch.code,
              name: ch.name,
              totalFee: (ch.fee_flat ?? 0) + Math.round(amount * (ch.fee_percent ?? 0) / 100),
              iconUrl: ch.icon_url ?? null,
            }));
        }
        break;
      }
      case 'midtrans':
        methods = [{ code: 'snap', name: 'Midtrans (Pilih di halaman pembayaran)', totalFee: 0 }];
        break;
      case 'xendit':
        methods = [{ code: 'invoice', name: 'Xendit (Pilih di halaman pembayaran)', totalFee: 0 }];
        break;
      default:
        methods = [{ code: 'default', name: 'Pembayaran Online', totalFee: 0 }];
    }

    return NextResponse.json({ success: true, methods });
  } catch (error) {
    console.error('Get customer payment methods error:', error);
    return NextResponse.json({ error: 'Failed to get payment methods' }, { status: 500 });
  }
}
