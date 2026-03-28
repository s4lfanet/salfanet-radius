import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { createMidtransPayment } from '@/server/services/payment/midtrans.service';
import { parseBody } from '@/lib/parse-body';
import { agentDepositCreateSchema } from '@/features/agents/schemas';

/**
 * POST /api/agent/deposit/create
 * Create deposit request for agent via payment gateway
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, agentDepositCreateSchema);
    if (parsed.error) return parsed.error;
    const { agentId, amount, gateway, paymentMethod: selectedPaymentMethod } = parsed.data;

    // Check agent exists
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Check if agent is active
    if (!agent.isActive) {
      return NextResponse.json(
        { error: 'Agent account is inactive' },
        { status: 403 }
      );
    }

    // Get payment gateway config
    const gatewayConfig = await prisma.paymentGateway.findUnique({
      where: { provider: gateway },
    });

    if (!gatewayConfig || !gatewayConfig.isActive) {
      return NextResponse.json(
        { error: 'Payment gateway not available' },
        { status: 400 }
      );
    }

    // Create unique token
    const token = `DEP-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
    
    // Create deposit record
    const deposit = await prisma.agentDeposit.create({
      data: {
        id: crypto.randomUUID(),
        agentId: agent.id,
        amount,
        status: 'PENDING',
        paymentGateway: gateway,
        paymentToken: token,
        expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // Create payment link based on gateway
    let paymentResult;
    const orderDetails = {
      orderId: deposit.id,
      amount,
      customerName: agent.name,
      customerEmail: agent.email || `${agent.phone}@noemail.com`,
      customerPhone: agent.phone,
      invoiceToken: token,
      items: [{
        id: crypto.randomUUID(),
        name: 'Deposit Saldo Agent',
        price: amount,
        quantity: 1,
      }],
    };

    try {
      switch (gateway) {
        case 'midtrans':
          {
            const midtransResult = await createMidtransPayment(orderDetails);
            // Midtrans Snap returns { token, redirect_url }
            paymentResult = {
              paymentUrl: midtransResult.redirect_url,
              transactionId: midtransResult.token, // Snap token
            };
          }
          break;
        case 'xendit':
          {
            // For xendit, use createXenditInvoice
            const { createXenditInvoice } = await import('@/server/services/payment/xendit.service');
            const xenditResult = await createXenditInvoice({
              externalId: deposit.id,
              amount,
              customerName: agent.name,
              payerEmail: agent.email || undefined,
              customerPhone: agent.phone,
              description: 'Deposit Saldo Agent',
              invoiceToken: token,
            });
            paymentResult = {
              paymentUrl: xenditResult.invoiceUrl,
              transactionId: xenditResult.id,
            };
          }
          break;
        case 'duitku':
          {
            // For duitku, get config first
            const gatewayConfig = await prisma.paymentGateway.findUnique({
              where: { provider: 'duitku' },
            });
            
            if (!gatewayConfig?.duitkuMerchantCode || !gatewayConfig?.duitkuApiKey) {
              throw new Error('Duitku not configured');
            }

            const company = await prisma.company.findFirst();
            const baseUrl = company?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

            const { DuitkuPayment } = await import('@/server/services/payment/duitku.service');
            const duitku = new DuitkuPayment({
              merchantCode: gatewayConfig.duitkuMerchantCode,
              apiKey: gatewayConfig.duitkuApiKey,
              callbackUrl: `${baseUrl}/api/agent/deposit/webhook`,
              returnUrl: `${baseUrl}/agent/dashboard`,
              sandbox: gatewayConfig.duitkuEnvironment === 'sandbox',
            });

            // Use selected payment method from frontend, or fetch first available, or fallback to 'VA'
            let duitkuPaymentMethod = selectedPaymentMethod || 'VA';
            if (!selectedPaymentMethod) {
              try {
                const methodsData = await duitku.getPaymentMethods(amount);
                if (methodsData?.paymentFee?.length > 0) {
                  duitkuPaymentMethod = methodsData.paymentFee[0].paymentMethod;
                }
              } catch {
                // fallback to VA
              }
            }
            
            const invoiceParams = {
              invoiceId: deposit.id,
              amount,
              customerName: agent.name,
              customerEmail: agent.email || `${agent.phone}@noemail.com`,
              customerPhone: agent.phone,
              description: 'Deposit Saldo Agent',
              expiryMinutes: 1440, // 24 hours
              paymentMethod: duitkuPaymentMethod,
            };

            let duitkuResult;
            try {
              duitkuResult = await duitku.createInvoice(invoiceParams);
            } catch (channelError: any) {
              // If selected channel not available, retry without specifying method
              if (selectedPaymentMethod && channelError.message?.includes('404')) {
                duitkuResult = await duitku.createInvoice({ ...invoiceParams, paymentMethod: undefined });
              } else {
                throw channelError;
              }
            }

            paymentResult = {
              paymentUrl: duitkuResult.paymentUrl,
              transactionId: duitkuResult.reference,
            };
          }
          break;
        case 'tripay':
          {
            // For tripay, get config first
            const gatewayConfig = await prisma.paymentGateway.findUnique({
              where: { provider: 'tripay' },
            });
            
            if (!gatewayConfig?.tripayMerchantCode || !gatewayConfig?.tripayApiKey || !gatewayConfig?.tripayPrivateKey) {
              throw new Error('Tripay not configured');
            }

            const company = await prisma.company.findFirst();
            const baseUrl = company?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

            const { TripayPayment } = await import('@/server/services/payment/tripay.service');
            const tripay = new TripayPayment({
              merchantCode: gatewayConfig.tripayMerchantCode,
              apiKey: gatewayConfig.tripayApiKey,
              privateKey: gatewayConfig.tripayPrivateKey,
              sandbox: gatewayConfig.tripayEnvironment === 'sandbox',
            });
            
            // Use selected payment method from frontend, or pick QRIS/first available
            let paymentMethod = selectedPaymentMethod || 'QRIS';
            if (!selectedPaymentMethod) {
              const channels = await tripay.getPaymentChannels();
              if (channels?.data?.length > 0) {
                const qris = channels.data.find((ch: any) => ch.code === 'QRIS' || ch.code === 'QRISC');
                paymentMethod = qris ? qris.code : channels.data[0].code;
              }
            }
            
            const tripayResult = await tripay.createTransaction({
              method: paymentMethod,
              merchantRef: deposit.id,
              amount,
              customerName: agent.name,
              customerEmail: agent.email || `${agent.phone}@noemail.com`,
              customerPhone: agent.phone,
              orderItems: [{
                name: 'Deposit Saldo Agent',
                price: amount,
                quantity: 1,
              }],
              callbackUrl: `${baseUrl}/api/agent/deposit/webhook`, // Agent deposit webhook
              returnUrl: `${baseUrl}/agent/dashboard`,
              expiredTime: 24 * 60 * 60, // 24 hours
            });
            
            if (!tripayResult.success || !tripayResult.data) {
              throw new Error(tripayResult.message || 'Tripay transaction failed');
            }
            
            paymentResult = {
              paymentUrl: tripayResult.data.checkout_url || tripayResult.data.pay_url,
              transactionId: tripayResult.data.reference,
            };
          }
          break;
        default:
          throw new Error('Invalid payment gateway');
      }

      // Update deposit with payment URL
      await prisma.agentDeposit.update({
        where: { id: deposit.id },
        data: {
          paymentUrl: paymentResult.paymentUrl,
          transactionId: paymentResult.transactionId,
        },
      });

      return NextResponse.json({
        success: true,
        deposit: {
          id: deposit.id,
          token: deposit.paymentToken,
          amount: deposit.amount,
          paymentUrl: paymentResult.paymentUrl,
          expiredAt: deposit.expiredAt,
        },
      });
    } catch (paymentError: any) {
      // Update deposit status to FAILED
      await prisma.agentDeposit.update({
        where: { id: deposit.id },
        data: { status: 'FAILED' },
      });

      console.error('Payment creation error:', paymentError);
      return NextResponse.json(
        { error: `Failed to create payment: ${paymentError.message}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Create agent deposit error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
