import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import * as crypto from 'crypto';
import { nanoid } from 'nanoid';

function generateVoucherCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /**
   * Process incoming webhook — ported from /api/payment/webhook (1472 lines).
   * Detects gateway, verifies signature, dispatches to order-type handler.
   */
  async processWebhook(rawBody: string, contentType: string, headers: Record<string, string>): Promise<{
    status: number;
    body: Record<string, unknown>;
  }> {
    let webhookLogId: string | undefined;

    try {
      let body: any;
      if (contentType.includes('application/x-www-form-urlencoded')) {
        body = Object.fromEntries(new URLSearchParams(rawBody));
      } else {
        body = JSON.parse(rawBody);
      }

      const signature = headers['x-callback-token'] || headers['x-signature'] || headers['x-callback-signature'];
      const payload: any = body && body.event && body.data ? body.data : body;

      let gateway = 'unknown';
      let orderId = '';
      let status = '';
      let transactionId = '';
      let paymentType = '';
      let paidAt: Date | null = null;
      let amount: number | undefined;

      // ==================== MIDTRANS ====================
      if (payload.order_id && payload.transaction_status) {
        gateway = 'midtrans';
        orderId = payload.order_id;
        transactionId = payload.transaction_id || '';
        paymentType = payload.payment_type || '';
        amount = payload.gross_amount ? parseInt(payload.gross_amount) : undefined;

        const ts = payload.transaction_status;
        const fraud = payload.fraud_status;
        if (ts === 'capture') {
          status = fraud === 'accept' ? 'settlement' : 'pending';
          if (fraud === 'accept') paidAt = new Date();
        } else if (ts === 'settlement') {
          status = 'settlement';
          paidAt = new Date();
        } else if (['cancel', 'deny', 'expire'].includes(ts)) {
          status = ts;
        } else {
          status = 'pending';
        }

        const gw = await this.prisma.paymentGateway.findUnique({ where: { provider: 'midtrans' } });
        if (gw?.midtransServerKey) {
          const expected = crypto.createHash('sha512').update(orderId + payload.status_code + payload.gross_amount + gw.midtransServerKey).digest('hex');
          if (payload.signature_key !== expected) {
            return { status: 401, body: { error: 'Invalid signature' } };
          }
        }
      }
      // ==================== XENDIT ====================
      else if (payload.external_id && (payload.status || (body.event && payload.status))) {
        gateway = 'xendit';
        orderId = payload.external_id;
        transactionId = payload.id || '';
        paymentType = payload.payment_channel || payload.payment_method || '';
        amount = payload.amount ? parseInt(payload.amount) : undefined;

        const xs = (payload.status || '').toLowerCase();
        if (xs === 'paid') { status = 'settlement'; paidAt = body.paid_at ? new Date(body.paid_at) : new Date(); }
        else if (xs === 'expired') status = 'expire';
        else if (xs === 'pending') status = 'pending';
        else status = xs;

        const gw = await this.prisma.paymentGateway.findUnique({ where: { provider: 'xendit' } });
        if (gw?.xenditWebhookToken?.trim()) {
          if (!signature || signature !== gw.xenditWebhookToken) {
            return { status: 401, body: { error: 'Invalid token' } };
          }
        }
      }
      // ==================== XENDIT FVA ====================
      else if (payload.payment_id && payload.external_id && payload.bank_code) {
        gateway = 'xendit';
        orderId = payload.external_id;
        transactionId = payload.payment_id || payload.id || '';
        paymentType = `va_${payload.bank_code}`;
        amount = payload.amount ? parseInt(payload.amount) : undefined;
        status = 'settlement';
        paidAt = payload.transaction_timestamp ? new Date(payload.transaction_timestamp) : new Date();

        const gw = await this.prisma.paymentGateway.findUnique({ where: { provider: 'xendit' } });
        if (gw?.xenditWebhookToken?.trim()) {
          if (!signature || signature !== gw.xenditWebhookToken) {
            return { status: 401, body: { error: 'Invalid token' } };
          }
        }
      }
      // ==================== DUITKU ====================
      else if (payload.merchantOrderId && payload.resultCode) {
        gateway = 'duitku';
        orderId = payload.merchantOrderId;
        transactionId = payload.reference || '';
        paymentType = payload.paymentMethod || '';
        amount = payload.amount ? parseInt(payload.amount) : undefined;

        if (payload.resultCode === '00') { status = 'settlement'; paidAt = new Date(); }
        else if (payload.resultCode === '01') status = 'pending';
        else status = 'failed';

        const gw = await this.prisma.paymentGateway.findUnique({ where: { provider: 'duitku' } });
        if (gw?.duitkuApiKey) {
          const expected = crypto.createHash('md5').update(`${gw.duitkuMerchantCode}${payload.amount}${orderId}${gw.duitkuApiKey}`).digest('hex');
          if (payload.signature !== expected) {
            return { status: 401, body: { error: 'Invalid signature' } };
          }
        }
      }
      // ==================== TRIPAY ====================
      else if (headers['x-callback-event'] === 'payment_status' || (payload.merchant_ref && payload.reference && payload.status)) {
        gateway = 'tripay';
        orderId = payload.merchant_ref;
        transactionId = payload.reference || '';
        paymentType = payload.payment_method || '';
        amount = payload.total_amount ? parseInt(payload.total_amount.toString()) : undefined;

        const ts = (payload.status || '').toUpperCase();
        if (ts === 'PAID') { status = 'settlement'; paidAt = payload.paid_at ? new Date(payload.paid_at * 1000) : new Date(); }
        else if (ts === 'EXPIRED') status = 'expire';
        else if (ts === 'FAILED') status = 'failed';
        else if (ts === 'UNPAID') status = 'pending';
        else status = ts.toLowerCase();

        const gw = await this.prisma.paymentGateway.findUnique({ where: { provider: 'tripay' } });
        if (gw?.tripayPrivateKey) {
          const receivedSig = headers['x-callback-signature'];
          if (!receivedSig) return { status: 401, body: { error: 'Missing signature' } };
          const expected = crypto.createHmac('sha256', gw.tripayPrivateKey).update(rawBody).digest('hex');
          if (receivedSig !== expected) return { status: 401, body: { error: 'Invalid signature' } };
        }
      } else {
        return { status: 400, body: { error: 'Unknown webhook provider' } };
      }

      // Idempotency guard
      if (status === 'settlement' || status === 'capture') {
        const dup = await this.prisma.webhookLog.findFirst({
          where: transactionId
            ? { gateway, transactionId, success: true, status: { in: ['settlement', 'capture'] } }
            : { gateway, orderId, success: true, status: { in: ['settlement', 'capture'] } },
          orderBy: { createdAt: 'desc' },
        });
        if (dup) {
          return { status: 200, body: { success: true, gateway, status, orderId, message: 'Duplicate webhook ignored' } };
        }
      }

      // Update/create webhook log
      const existingLog = await this.prisma.webhookLog.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
      if (existingLog) {
        const updated = await this.prisma.webhookLog.update({
          where: { id: existingLog.id },
          data: { gateway, status, transactionId, amount, payload: JSON.stringify(body), success: true },
        });
        webhookLogId = updated.id;
      } else {
        const created = await this.prisma.webhookLog.create({
          data: {
            id: crypto.randomUUID(), gateway, orderId, status, transactionId, amount,
            payload: JSON.stringify(body), success: true,
          },
        });
        webhookLogId = created.id;
      }

      // Dispatch by order type
      if (orderId.startsWith('EVC-')) {
        await this.handleVoucherOrder(orderId, status, gateway, paymentType, paidAt);
      } else if (orderId.startsWith('TOPUP-')) {
        await this.handleCustomerTopUp(orderId, status, gateway, transactionId, paidAt, amount);
      } else if (orderId.startsWith('INV-')) {
        await this.handleInvoicePayment(orderId, status, gateway, paymentType, paidAt, transactionId, amount);
      } else {
        const agentDeposit = await this.prisma.agentDeposit.findUnique({ where: { id: orderId } });
        if (agentDeposit) {
          await this.handleAgentDeposit(orderId, status, gateway, transactionId, paidAt);
        } else {
          await this.handleInvoicePayment(orderId, status, gateway, paymentType, paidAt, transactionId, amount);
        }
      }

      if (webhookLogId) {
        await this.prisma.webhookLog.update({
          where: { id: webhookLogId },
          data: { response: JSON.stringify({ success: true, gateway, status, orderId }) },
        });
      }

      return { status: 200, body: { success: true, gateway, status, orderId, message: 'Webhook processed successfully' } };
    } catch (error) {
      this.logger.error('Webhook processing error:', error);
      if (webhookLogId) {
        try {
          await this.prisma.webhookLog.update({
            where: { id: webhookLogId },
            data: { success: false, errorMessage: error instanceof Error ? error.message : 'Unknown error', response: JSON.stringify({ error: 'Webhook processing failed' }) },
          });
        } catch {}
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      const amountMismatch = message.includes('AMOUNT_MISMATCH');
      return { status: amountMismatch ? 400 : 500, body: { error: amountMismatch ? 'Amount mismatch' : 'Webhook processing failed', details: message } };
    }
  }

  // ==================== Voucher Order Handler ====================
  private async handleVoucherOrder(orderId: string, status: string, gateway: string, paymentType: string, paidAt: Date | null) {
    let orderNumber = orderId;
    const parts = orderId.split('-');
    if (parts.length > 3) orderNumber = parts.slice(0, 3).join('-');

    const order = await this.prisma.voucherOrder.findFirst({ where: { orderNumber }, include: { profile: true } });
    if (!order) throw new Error(`Voucher order not found: ${orderNumber}`);

    if (status === 'settlement' || status === 'capture') {
      if (order.status !== 'PAID') {
        await this.prisma.voucherOrder.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: paidAt || new Date() } });

        // Generate vouchers
        const vouchers = [];
        for (let i = 0; i < order.quantity; i++) {
          let voucherCode = '';
          let isUnique = false;
          while (!isUnique) {
            voucherCode = generateVoucherCode(8);
            const existing = await this.prisma.hotspotVoucher.findUnique({ where: { code: voucherCode } });
            if (!existing) isUnique = true;
          }
          const voucher = await this.prisma.hotspotVoucher.create({
            data: { id: crypto.randomUUID(), code: voucherCode, batchCode: order.orderNumber, profileId: order.profileId, orderId: order.id, status: 'WAITING' },
          });
          vouchers.push(voucher);
          // RADIUS sync deferred — syncVoucherToRadius not yet ported
        }

        // Sync to Keuangan
        try {
          const hotspotCategory = await this.prisma.transactionCategory.findFirst({ where: { name: 'Pembayaran Hotspot', type: 'INCOME' } });
          if (hotspotCategory) {
            const existingTx = await this.prisma.transaction.findFirst({ where: { reference: order.orderNumber } });
            if (!existingTx) {
              await this.prisma.transaction.create({
                data: {
                  id: nanoid(), categoryId: hotspotCategory.id, type: 'INCOME', amount: order.totalAmount,
                  description: `Voucher ${order.profile.name} (${order.quantity}x) - ${order.customerName}`,
                  date: paidAt || new Date(), reference: order.orderNumber, notes: 'Auto-synced from voucher order payment',
                },
              });
            }
          }
        } catch (keuanganError) {
          this.logger.error('Keuangan sync error:', keuanganError);
        }

        // WhatsApp + Email notifications deferred to integration notification batch
      }
    }
  }

  // ==================== Agent Deposit Handler ====================
  private async handleAgentDeposit(depositId: string, status: string, gateway: string, transactionId: string, paidAt: Date | null) {
    const deposit = await this.prisma.agentDeposit.findUnique({ where: { id: depositId }, include: { agent: true } });
    if (!deposit) throw new Error(`Agent deposit not found: ${depositId}`);
    if (deposit.status !== 'PENDING') return;

    let depositStatus: 'PENDING' | 'PAID' | 'FAILED' = 'PENDING';
    if (status === 'settlement' || status === 'capture') depositStatus = 'PAID';
    else if (['expire', 'cancel', 'deny', 'failed'].includes(status)) depositStatus = 'FAILED';

    await this.prisma.agentDeposit.update({
      where: { id: deposit.id },
      data: { status: depositStatus, transactionId: transactionId || deposit.transactionId, paidAt: depositStatus === 'PAID' ? (paidAt || new Date()) : null },
    });

    if (depositStatus === 'PAID') {
      const updatedAgent = await this.prisma.agent.update({
        where: { id: deposit.agentId },
        data: { balance: { increment: deposit.amount } },
      });

      await this.activityLog.logActivity({
        username: deposit.agent.name, userRole: 'AGENT', action: 'AGENT_DEPOSIT',
        description: `Agent ${deposit.agent.name} deposited Rp ${deposit.amount} via ${gateway}`,
        module: 'agent', status: 'success',
        metadata: { agentId: deposit.agentId, depositId: deposit.id, amount: deposit.amount, paymentGateway: gateway, transactionId, newBalance: updatedAgent.balance },
      });
      // WhatsApp + Email notifications deferred
    }
  }

  // ==================== Customer Top-Up Handler ====================
  private async handleCustomerTopUp(orderId: string, status: string, gateway: string, transactionId: string, paidAt: Date | null, amount?: number) {
    const invoiceNumber = orderId.split('-').slice(0, 3).join('-');
    let invoice = await this.prisma.invoice.findFirst({ where: { invoiceNumber }, include: { user: true } });

    if (!invoice && orderId.startsWith('TOPUP-TEMP-')) {
      const ts = parseInt(orderId.replace('TOPUP-TEMP-', ''));
      if (!Number.isNaN(ts)) {
        const searchWindow = new Date(ts);
        searchWindow.setMinutes(searchWindow.getMinutes() - 5);
        invoice = await this.prisma.invoice.findFirst({
          where: { invoiceType: 'TOPUP', status: 'PENDING', amount, createdAt: { gte: searchWindow } },
          orderBy: { createdAt: 'desc' },
          include: { user: true },
        });
      }
    }

    if (!invoice) return;

    if (status === 'settlement' || status === 'capture') {
      const markPaid = await this.prisma.invoice.updateMany({
        where: { id: invoice.id, status: { not: 'PAID' } },
        data: { status: 'PAID', paidAt: paidAt || new Date() },
      });
      if (markPaid.count === 0) return;

      if (invoice.user) {
        const topupAmount = amount || invoice.amount;
        const updatedUser = await this.prisma.pppoeUser.update({
          where: { id: invoice.user.id },
          data: { balance: { increment: topupAmount } },
        });

        await this.activityLog.logActivity({
          username: invoice.user.username, userRole: 'CUSTOMER', action: 'CUSTOMER_TOPUP',
          description: `Customer ${invoice.user.name} topped up Rp ${topupAmount} via ${gateway}`,
          module: 'payment', status: 'success',
          metadata: { userId: invoice.userId, invoiceNumber: invoice.invoiceNumber, amount: topupAmount, paymentGateway: gateway, transactionId, newBalance: updatedUser.balance },
        });

        // Sync to Keuangan
        try {
          const category = await this.prisma.transactionCategory.findFirst({ where: { name: 'Top-Up Saldo', type: 'INCOME' } })
            || await this.prisma.transactionCategory.findFirst({ where: { type: 'INCOME' } });
          if (category) {
            const existingTx = await this.prisma.transaction.findFirst({ where: { reference: `TOPUP-${invoice.invoiceNumber}` } });
            if (!existingTx) {
              await this.prisma.$executeRaw`INSERT INTO transactions (id, categoryId, type, amount, description, date, reference, notes, createdAt, updatedAt) VALUES (${nanoid()}, ${category.id}, 'INCOME', ${topupAmount}, ${`Top-Up Saldo - ${invoice.user.name}`}, NOW(), ${`TOPUP-${invoice.invoiceNumber}`}, ${`Payment via ${gateway}`}, NOW(), NOW())`;
            }
          }
        } catch (keuanganError) {
          this.logger.error('Keuangan sync error:', keuanganError);
        }
        // WhatsApp + Email notifications deferred
      }
    } else if (['expire', 'cancel', 'deny', 'failed'].includes(status)) {
      await this.prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'CANCELLED' } });
    }
  }

  // ==================== Invoice Payment Handler ====================
  private async handleInvoicePayment(orderId: string, status: string, gateway: string, paymentType: string, paidAt: Date | null, transactionId: string, webhookAmount?: number) {
    const lastHyphenIdx = orderId.lastIndexOf('-');
    const potentialTs = lastHyphenIdx >= 0 ? orderId.substring(lastHyphenIdx + 1) : '';
    const invoiceNumber = (potentialTs && /^\d{10,}$/.test(potentialTs)) ? orderId.substring(0, lastHyphenIdx) : orderId;

    let invoice = await this.prisma.invoice.findFirst({
      where: { invoiceNumber },
      include: { user: { include: { profile: true } } },
    });

    if (!invoice && invoiceNumber.startsWith('INV-INV-')) {
      const trimmed = invoiceNumber.substring(4);
      invoice = await this.prisma.invoice.findFirst({ where: { invoiceNumber: trimmed }, include: { user: { include: { profile: true } } } });
    }

    if (!invoice) return;

    if (status === 'settlement' || status === 'capture') {
      if (typeof webhookAmount === 'number' && Number.isFinite(webhookAmount) && webhookAmount !== invoice.amount) {
        throw new Error('AMOUNT_MISMATCH');
      }

      const markPaid = await this.prisma.invoice.updateMany({
        where: { id: invoice.id, status: { not: 'PAID' } },
        data: { status: 'PAID', paidAt: paidAt || new Date() },
      });
      if (markPaid.count === 0) return;

      // Create payment record
      const existingPayment = await this.prisma.payment.findFirst({ where: { invoiceId: invoice.id } });
      if (!existingPayment) {
        await this.prisma.payment.create({
          data: { id: crypto.randomUUID(), invoiceId: invoice.id, amount: invoice.amount, method: `${gateway}_${paymentType}`, status: 'completed', paidAt: paidAt || new Date() },
        });
      }

      await this.activityLog.logActivity({
        username: invoice.user?.username || invoice.customerUsername || 'Customer',
        action: 'PAYMENT_RECEIVED',
        description: `Payment received for invoice ${invoice.invoiceNumber} - Rp ${invoice.amount}`,
        module: 'payment', status: 'success',
        metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: invoice.amount, paymentGateway: gateway, paymentType, transactionId },
      });

      // Sync to Keuangan
      try {
        const pppoeCategory = await this.prisma.transactionCategory.findFirst({ where: { name: 'Pembayaran PPPoE', type: 'INCOME' } });
        if (pppoeCategory) {
          const existingTx = await this.prisma.transaction.findFirst({ where: { reference: `INV-${invoice.invoiceNumber}` } });
          if (!existingTx) {
            const customerName = invoice.customerName || invoice.user?.name || 'Unknown';
            const profileName = invoice.user?.profile?.name || 'Unknown';
            await this.prisma.$executeRaw`INSERT INTO transactions (id, categoryId, type, amount, description, date, reference, notes, createdAt, updatedAt) VALUES (${nanoid()}, ${pppoeCategory.id}, 'INCOME', ${invoice.amount}, ${`Pembayaran ${profileName} - ${customerName}`}, NOW(), ${`INV-${invoice.invoiceNumber}`}, ${`Payment via ${gateway} (${paymentType})`}, NOW(), NOW())`;
          }
        }
      } catch (keuanganError) {
        this.logger.error('Keuangan sync error:', keuanganError);
      }

      // Activate user & extend expiry
      const user = invoice.user;
      if (user && user.profile) {
        const profile = user.profile;
        const now = new Date();
        const normalizedStatus = (user.status || '').toLowerCase();

        let newExpiredAt: Date | null = null;
        let baseDate = user.expiredAt ? new Date(user.expiredAt) : now;
        if (baseDate < now) baseDate = now;
        newExpiredAt = new Date(baseDate);
        switch (profile.validityUnit) {
          case 'DAYS': newExpiredAt.setDate(newExpiredAt.getDate() + profile.validityValue); break;
          case 'MONTHS': newExpiredAt.setMonth(newExpiredAt.getMonth() + profile.validityValue); break;
          case 'HOURS': newExpiredAt.setHours(newExpiredAt.getHours() + profile.validityValue); break;
          case 'MINUTES': newExpiredAt.setMinutes(newExpiredAt.getMinutes() + profile.validityValue); break;
        }

        const wasDisabled = ['isolated', 'suspended', 'blocked', 'stop'].includes(normalizedStatus);
        const newStatus = wasDisabled ? 'active' : normalizedStatus || 'active';

        // Package change detection
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
            }
          }
        }

        const finalExpiredAt = isPackageChange ? user.expiredAt : newExpiredAt;

        await this.prisma.pppoeUser.update({
          where: { id: user.id },
          data: { expiredAt: finalExpiredAt, status: newStatus, profileId: newProfileId },
        });

        // RADIUS sync for reactivation
        if (wasDisabled) {
          try {
            await this.prisma.radcheck.deleteMany({ where: { username: user.username, attribute: 'Auth-Type' } });
            await this.prisma.radcheck.deleteMany({ where: { username: user.username, attribute: 'NAS-IP-Address' } });
            await this.prisma.$executeRaw`INSERT INTO radcheck (username, attribute, op, value) VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}) ON DUPLICATE KEY UPDATE value = ${user.password}`;
            await this.prisma.$executeRaw`DELETE FROM radusergroup WHERE username = ${user.username}`;
            await this.prisma.$executeRaw`INSERT INTO radusergroup (username, groupname, priority) VALUES (${user.username}, ${profile.groupName}, 0) ON DUPLICATE KEY UPDATE groupname = ${profile.groupName}`;
            await this.prisma.radreply.deleteMany({ where: { username: user.username, attribute: 'Reply-Message' } });
            if (user.ipAddress) {
              await this.prisma.$executeRaw`INSERT INTO radreply (username, attribute, op, value) VALUES (${user.username}, 'Framed-IP-Address', ':=', ${user.ipAddress}) ON DUPLICATE KEY UPDATE value = ${user.ipAddress}`;
            }

            // Update registration status
            const registration = await this.prisma.registrationRequest.findFirst({ where: { pppoeUserId: user.id, status: 'INSTALLED' } });
            if (registration) {
              await this.prisma.registrationRequest.update({ where: { id: registration.id }, data: { status: 'ACTIVE' } });
            }

            // CoA disconnect deferred — disconnectPPoEUser not yet ported
          } catch (radiusError) {
            this.logger.error('RADIUS sync error:', radiusError);
          }
        }

        // Referral bonus
        try {
          const fullUser = await this.prisma.pppoeUser.findUnique({ where: { id: user.id }, select: { id: true, referredById: true, name: true } });
          if (fullUser?.referredById) {
            const companyRef = await this.prisma.company.findFirst({ select: { referralEnabled: true, referralRewardAmount: true, referralRewardType: true } });
            if (companyRef?.referralEnabled && companyRef.referralRewardType === 'FIRST_PAYMENT') {
              const existingReward = await this.prisma.referralReward.findFirst({ where: { referrerId: fullUser.referredById, referredId: user.id } });
              if (!existingReward) {
                const paidInvoiceCount = await this.prisma.invoice.count({ where: { userId: user.id, status: 'PAID' } });
                if (paidInvoiceCount <= 1) {
                  const rewardAmount = companyRef.referralRewardAmount ?? 10000;
                  await this.prisma.referralReward.create({
                    data: { referrerId: fullUser.referredById, referredId: user.id, amount: rewardAmount, status: 'CREDITED', type: 'FIRST_PAYMENT', creditedAt: new Date() },
                  });
                }
              }
            }
          }
        } catch (referralError) {
          this.logger.error('Referral bonus error:', referralError);
        }

        // WhatsApp + Email + Push notifications deferred to notification integration batch
      }
    } else if (['expire', 'cancel', 'deny', 'failed'].includes(status)) {
      if (invoice.status !== 'PAID' && invoice.status !== 'CANCELLED') {
        await this.prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'CANCELLED' } });
      }
    }
  }
}
