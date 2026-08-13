import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { logActivity } from '@/server/services/activity-log.service';
import { nowWIB } from '@/lib/timezone';
import crypto from 'crypto';

/**
 * POST /api/agent/deposit/webhook
 * Handle payment webhook for agent deposits
 */
export async function POST(request: NextRequest) {
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
    
    console.log('[Agent Deposit Webhook] Received:', JSON.stringify(body, null, 2));
    
    // Normalize payload (e.g., Xendit invoice events send { event, data })
    const payload: any = (body && body.event && body.data) ? body.data : body;
    
    // Determine which gateway sent the webhook
    let orderId: string | null = null;
    let status: string | null = null;
    let transactionId: string | null = null;
    let gateway: string | null = null;

    const signature = request.headers.get('x-callback-token') || request.headers.get('x-signature') || request.headers.get('x-callback-signature');

    // Midtrans webhook format
    if (payload.order_id && payload.transaction_status) {
      orderId = payload.order_id;
      const txStatus = payload.transaction_status;
      transactionId = payload.transaction_id;
      gateway = 'midtrans';
      
      // Map Midtrans status to our status
      if (['capture', 'settlement'].includes(txStatus)) {
        status = 'PAID';
      } else if (['pending'].includes(txStatus)) {
        status = 'PENDING';
      } else if (['deny', 'expire', 'cancel'].includes(txStatus)) {
        status = 'FAILED';
      }

      const gatewayConfig = await prisma.paymentGateway.findUnique({
        where: { provider: 'midtrans' }
      });

      if (gatewayConfig?.midtransServerKey) {
        const signatureKey = payload.signature_key;
        const expectedSignature = crypto
          .createHash('sha512')
          .update(`${orderId}${payload.status_code}${payload.gross_amount}${gatewayConfig.midtransServerKey}`)
          .digest('hex');

        if (!signatureKey || signatureKey !== expectedSignature) {
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
      } else if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Webhook misconfigured' }, { status: 500 });
      }
    }
    // Xendit webhook format
    else if (payload.external_id && payload.status) {
      orderId = payload.external_id;
      const xenditStatus = payload.status;
      transactionId = payload.id;
      gateway = 'xendit';
      
      // Map Xendit status
      if (xenditStatus === 'PAID') {
        status = 'PAID';
      } else if (xenditStatus === 'PENDING') {
        status = 'PENDING';
      } else if (['EXPIRED', 'FAILED'].includes(xenditStatus)) {
        status = 'FAILED';
      }

      const gatewayConfig = await prisma.paymentGateway.findUnique({
        where: { provider: 'xendit' }
      });

      if (gatewayConfig?.xenditWebhookToken && gatewayConfig.xenditWebhookToken.trim() !== '') {
        if (!signature || signature !== gatewayConfig.xenditWebhookToken) {
          return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }
      } else if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Webhook misconfigured' }, { status: 500 });
      }
    }
    // Duitku webhook format
    else if (payload.merchantOrderId && payload.resultCode) {
      orderId = payload.merchantOrderId;
      transactionId = payload.reference;
      gateway = 'duitku';
      
      // Map Duitku status
      if (payload.resultCode === '00') {
        status = 'PAID';
      } else {
        status = 'FAILED';
      }

      const gatewayConfig = await prisma.paymentGateway.findUnique({
        where: { provider: 'duitku' }
      });

      if (gatewayConfig?.duitkuApiKey) {
        const receivedSignature = payload.signature;
        const expectedSignature = crypto
          .createHash('md5')
          .update(`${gatewayConfig.duitkuMerchantCode}${payload.amount}${orderId}${gatewayConfig.duitkuApiKey}`)
          .digest('hex');

        if (!receivedSignature || receivedSignature !== expectedSignature) {
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
      } else if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Webhook misconfigured' }, { status: 500 });
      }
    }
    // Tripay webhook format
    else if (request.headers.get('x-callback-event') === 'payment_status' || (payload.merchant_ref && payload.reference && payload.status)) {
      orderId = payload.merchant_ref;
      transactionId = payload.reference;
      gateway = 'tripay';
      
      const tripayStatus = (payload.status || '').toUpperCase();
      
      // Map Tripay status
      if (tripayStatus === 'PAID') {
        status = 'PAID';
      } else if (tripayStatus === 'EXPIRED') {
        status = 'FAILED';
      } else if (tripayStatus === 'FAILED') {
        status = 'FAILED';
      } else if (tripayStatus === 'UNPAID') {
        status = 'PENDING';
      }

      const gatewayConfig = await prisma.paymentGateway.findUnique({
        where: { provider: 'tripay' }
      });

      if (gatewayConfig?.tripayPrivateKey) {
        const receivedSignature = request.headers.get('x-callback-signature');
        const expectedSignature = crypto
          .createHmac('sha256', gatewayConfig.tripayPrivateKey)
          .update(rawBody)
          .digest('hex');

        if (!receivedSignature || receivedSignature !== expectedSignature) {
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
      } else if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Webhook misconfigured' }, { status: 500 });
      }
      
      console.log('[Tripay] Webhook - Status:', tripayStatus, '-> Mapped:', status);
    }

    if (!orderId || !status) {
      console.error('[Agent Deposit Webhook] Invalid data - orderId:', orderId, 'status:', status);
      return NextResponse.json(
        { error: 'Invalid webhook data' },
        { status: 400 }
      );
    }
    
    console.log('[Agent Deposit Webhook] Processing:', { gateway, orderId, status });

    // ── Idempotency: reject duplicate successful webhooks ─────────────────
    if (transactionId) {
      const duplicate = await prisma.webhookLog.findFirst({
        where: { orderId, transactionId, success: true },
      });
      if (duplicate) {
        return NextResponse.json({ success: true, message: 'Already processed' });
      }
    }

    // Create webhook log (marked failed until processing completes)
    const wLog = await prisma.webhookLog.create({
      data: {
        id: crypto.randomUUID(),
        gateway: gateway!,
        orderId,
        status: status!,
        transactionId,
        payload: JSON.stringify(body),
        success: false,
      },
    });

    // Find deposit by ID
    const deposit = await prisma.agentDeposit.findUnique({
      where: { id: orderId },
      include: { agent: true },
    });

    if (!deposit) {
      console.error('Deposit not found:', orderId);
      await prisma.webhookLog.update({ where: { id: wLog.id }, data: { errorMessage: 'Deposit not found' } });
      return NextResponse.json(
        { error: 'Deposit not found' },
        { status: 404 }
      );
    }

    // Only process if current status is PENDING
    if (deposit.status !== 'PENDING') {
      await prisma.webhookLog.update({ where: { id: wLog.id }, data: { success: true } });
      return NextResponse.json({
        success: true,
        message: 'Deposit already processed',
      });
    }

    // Update deposit status
    await prisma.agentDeposit.update({
      where: { id: deposit.id },
      data: {
        status,
        transactionId: transactionId || deposit.transactionId,
        paidAt: status === 'PAID' ? new Date() : null,
      },
    });

    // If payment successful, add balance to agent
    if (status === 'PAID') {
      const updatedAgent = await prisma.agent.update({
        where: { id: deposit.agentId },
        data: {
          balance: {
            increment: deposit.amount,
          },
        },
      });

      console.log(`Agent ${deposit.agent.name} balance increased by ${deposit.amount}`);

      // Create notification for agent
      await prisma.agentNotification.create({
        data: {
          id: Math.random().toString(36).substring(2, 15),
          agentId: deposit.agentId,
          type: 'deposit_success',
          title: 'Deposit Berhasil',
          message: `Deposit sebesar Rp ${deposit.amount.toLocaleString('id-ID')} berhasil. Saldo baru: Rp ${updatedAgent.balance.toLocaleString('id-ID')}`,
          link: null,
        },
      });

      // Create notification for admin
      await prisma.notification.create({
        data: {
          id: Math.random().toString(36).substring(2, 15),
          type: 'agent_deposit',
          title: 'Agent Deposit',
          message: `${deposit.agent.name} deposit Rp ${deposit.amount.toLocaleString('id-ID')} via ${gateway}`,
          link: '/admin/hotspot/agent',
          createdAt: nowWIB(),
        },
      });

      // Log activity
      try {
        await logActivity({
          username: deposit.agent.name,
          userRole: 'AGENT',
          action: 'AGENT_DEPOSIT',
          description: `Agent ${deposit.agent.name} deposited Rp ${deposit.amount.toLocaleString('id-ID')}`,
          module: 'agent',
          status: 'success',
          metadata: {
            agentId: deposit.agentId,
            amount: deposit.amount,
            paymentGateway: gateway,
            transactionId,
            newBalance: updatedAgent.balance,
          },
        });
      } catch (logError) {
        console.error('Activity log error:', logError);
      }
    }

    // Mark webhook log as successfully processed
    await prisma.webhookLog.update({
      where: { id: wLog.id },
      data: { success: true, response: JSON.stringify({ success: true, gateway, status, orderId }) },
    });

    console.log('[Agent Deposit Webhook] Success - Gateway:', gateway, 'Status:', status, 'Balance updated:', status === 'PAID');

    return NextResponse.json({
      success: true,
      gateway,
      status,
      orderId,
      message: 'Webhook processed successfully',
    });
  } catch (error) {
    console.error('Agent deposit webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
