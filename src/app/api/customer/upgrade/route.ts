import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { createMidtransPayment } from '@/server/services/payment/midtrans.service';
import { createXenditInvoice } from '@/server/services/payment/xendit.service';
import { createDuitkuClient } from '@/server/services/payment/duitku.service';
import { createTripayClient } from '@/server/services/payment/tripay.service';

// Helper to verify customer token (same as topup-direct)
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
      include: {
        profile: true
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

    const { newProfileId, gateway } = await request.json();

    if (!newProfileId || !gateway) {
      return NextResponse.json({ error: 'Profile ID and gateway are required' }, { status: 400 });
    }

    // Get new profile
    const newProfile = await prisma.pppoeProfile.findUnique({
      where: { id: newProfileId }
    });

    if (!newProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Check if same profile
    if (pppoeUser.profileId === newProfileId) {
      return NextResponse.json({ error: 'Paket yang dipilih sama dengan paket saat ini' }, { status: 400 });
    }

    // Check payment gateway
    const gatewayConfig = await prisma.paymentGateway.findUnique({
      where: { provider: gateway }
    });

    if (!gatewayConfig || !gatewayConfig.isActive) {
      return NextResponse.json({ error: 'Payment gateway not available' }, { status: 400 });
    }

    // Create invoice for upgrade with package metadata
    const invoiceNumber = `INV-UPG-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
    const paymentToken = `PAY-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;

    // Calculate due date (7 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    // Calculate PPN if enabled on profile
    const upgradeBaseAmount = newProfile.price;
    let upgradeAmount = upgradeBaseAmount;
    let upgradeTaxRate: number | null = null;
    if (newProfile.ppnActive && newProfile.ppnRate > 0) {
      upgradeTaxRate = newProfile.ppnRate;
      upgradeAmount = Math.round(upgradeBaseAmount + (upgradeBaseAmount * upgradeTaxRate / 100));
    }

    // Store package upgrade metadata in additionalFees
    const additionalFees = {
      items: [
        {
          name: `Upgrade ke ${newProfile.name}`,
          amount: upgradeAmount,
          metadata: {
            type: 'package_upgrade',
            oldPackageId: pppoeUser.profileId,
            oldPackageName: pppoeUser.profile?.name || 'Unknown',
            newPackageId: newProfileId,
            newPackageName: newProfile.name
          }
        }
      ]
    };

    const invoice = await prisma.invoice.create({
      data: {
        id: `inv-${Date.now()}`,
        userId: pppoeUser.id,
        invoiceNumber: invoiceNumber,
        amount: upgradeAmount,
        dueDate: dueDate,
        status: 'PENDING',
        paymentToken: paymentToken,
        customerName: pppoeUser.name,
        customerPhone: pppoeUser.phone,
        customerEmail: pppoeUser.email || `${pppoeUser.username}@customer.com`,
        customerUsername: pppoeUser.username,
        invoiceType: 'ADDON',
        baseAmount: upgradeBaseAmount,
        ...(upgradeTaxRate !== null && { taxRate: upgradeTaxRate }),
        additionalFees: additionalFees
      }
    });

    // Create payment based on gateway
    let paymentUrl = null;
    // Use INV- prefix so webhook can detect it properly
    const orderId = `INV-${invoice.invoiceNumber}-${Date.now()}`;

    try {
      const customerEmail = pppoeUser.email || `${pppoeUser.username}@customer.com`;
      const token = invoice.paymentToken || '';

      if (gateway === 'midtrans') {
        const midtransResult = await createMidtransPayment({
          orderId,
          amount: invoice.amount,
          customerName: pppoeUser.name,
          customerEmail: customerEmail,
          customerPhone: pppoeUser.phone,
          invoiceToken: token,
          items: [{
            id: newProfile.id,
            name: `Upgrade ke ${newProfile.name}`,
            price: newProfile.price,
            quantity: 1
          }]
        });
        paymentUrl = midtransResult.redirect_url;
      } else if (gateway === 'xendit') {
        const xenditResult = await createXenditInvoice({
          externalId: orderId,
          amount: invoice.amount,
          payerEmail: customerEmail,
          description: `Upgrade ke ${newProfile.name}`,
          customerName: pppoeUser.name,
          customerPhone: pppoeUser.phone,
          invoiceToken: token
        });
        paymentUrl = xenditResult.invoiceUrl;
      } else if (gateway === 'duitku') {
        const duitku = createDuitkuClient(
          gatewayConfig.duitkuMerchantCode || '',
          gatewayConfig.duitkuApiKey || '',
          `${process.env.NEXT_PUBLIC_APP_URL}/api/payment/webhook`,
          `${process.env.NEXT_PUBLIC_APP_URL}/customer`,
          gatewayConfig.duitkuEnvironment === 'sandbox'
        );

        const result = await duitku.createInvoice({
          invoiceId: orderId,
          amount: invoice.amount,
          customerName: pppoeUser.name,
          customerEmail: customerEmail,
          customerPhone: pppoeUser.phone,
          description: `Upgrade ke ${newProfile.name}`,
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
          orderItems: [
            {
              name: `Upgrade ke ${newProfile.name}`,
              price: newProfile.price,
              quantity: 1,
            },
          ],
          returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/customer`,
          expiredTime: 86400,
        });

        if (result.success && result.data) {
          paymentUrl = result.data.checkout_url || result.data.pay_url || '';
        } else {
          throw new Error(result.message || 'Failed to create Tripay payment');
        }
      }

      // Update invoice with payment URL
      if (paymentUrl) {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { paymentLink: paymentUrl }
        });
      }

    } catch (paymentError: any) {
      console.error('Payment creation error:', paymentError);
      // Don't fail the whole request, just log the error
      // User can still pay manually
    }

    return NextResponse.json({
      success: true,
      message: 'Permintaan upgrade berhasil dibuat',
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        paymentToken: invoice.paymentToken
      },
      paymentUrl: paymentUrl
    });

  } catch (error: any) {
    console.error('Upgrade error:', error);
    return NextResponse.json(
      { error: error.message || 'Gagal memproses permintaan upgrade' },
      { status: 500 }
    );
  }
}
