import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

function parseInvoiceNumberFromOrder(orderId: string): string {
  const lastHyphenIdx = orderId.lastIndexOf('-');
  const potentialTs = lastHyphenIdx >= 0 ? orderId.substring(lastHyphenIdx + 1) : '';
  if (potentialTs && /^\d{10,}$/.test(potentialTs)) {
    return orderId.substring(0, lastHyphenIdx);
  }
  if (orderId.startsWith('TOPUP-')) {
    const parts = orderId.split('-');
    return parts.slice(0, 3).join('-');
  }
  return orderId;
}

function mapInvoiceStatus(status: string): 'settlement' | 'pending' | 'cancel' {
  if (status === 'PAID') return 'settlement';
  if (status === 'CANCELLED' || status === 'OVERDUE') return 'cancel';
  return 'pending';
}

const MIN_AMOUNTS: Record<string, number> = {
  BC: 10000, BV: 10000, M2: 10000, I1: 10000, B1: 10000, A1: 10000, BT: 10000,
  FT: 10000, IR: 10000,
  OV: 100, SP: 100, LK: 100, DA: 100,
};

const ALL_DEFAULTS = [
  { code: 'SP', name: 'ShopeePay (QRIS)', group: 'qris' },
  { code: 'OV', name: 'OVO', group: 'ewallet' },
  { code: 'BC', name: 'BCA Virtual Account', group: 'va' },
  { code: 'M2', name: 'Mandiri Virtual Account', group: 'va' },
  { code: 'I1', name: 'BNI Virtual Account', group: 'va' },
  { code: 'B1', name: 'CIMB VA', group: 'va' },
  { code: 'BV', name: 'BSI Virtual Account', group: 'va' },
  { code: 'A1', name: 'ATM Bersama', group: 'va' },
];

function getDefaultMethods(amount: number) {
  return ALL_DEFAULTS.filter((m) => amount >= (MIN_AMOUNTS[m.code] || 0));
}

function getGroup(code: string): string {
  const qris = ['SP', 'NQ', 'QRIS'];
  const ewallet = ['OV', 'LK', 'SA', 'SL', 'DA', 'AT'];
  const retail = ['FT', 'IR', 'CE'];
  const va = ['BC', 'BV', 'M2', 'I1', 'B1', 'A1', 'BT', 'VA', 'DK'];
  if (qris.includes(code)) return 'qris';
  if (ewallet.includes(code)) return 'ewallet';
  if (retail.includes(code)) return 'retail';
  if (va.includes(code)) return 'va';
  return 'other';
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check order status — ported from /api/payment/check-order
   */
  async checkOrder(orderId: string) {
    if (!orderId) throw new HttpException('orderId is required', HttpStatus.BAD_REQUEST);

    // Check agent deposit
    const deposit = await this.prisma.agentDeposit.findUnique({
      where: { id: orderId },
      include: { agent: true },
    });

    if (deposit) {
      return {
        success: true,
        type: 'agent_deposit',
        status: deposit.status === 'PAID' ? 'settlement' : deposit.status === 'FAILED' ? 'cancel' : 'pending',
        deposit: {
          id: deposit.id, amount: deposit.amount, status: deposit.status,
          paidAt: deposit.paidAt, agentName: deposit.agent.name, newBalance: deposit.agent.balance,
        },
      };
    }

    let invoiceNumber = parseInvoiceNumberFromOrder(orderId);
    let invoice = await this.prisma.invoice.findFirst({
      where: { invoiceNumber },
      include: { user: true },
    });

    // Backward compatibility: old TOPUP-TEMP-{timestamp} order ids
    if (!invoice && orderId.startsWith('TOPUP-TEMP-')) {
      const ts = parseInt(orderId.replace('TOPUP-TEMP-', ''), 10);
      if (!Number.isNaN(ts)) {
        const searchWindow = new Date(ts);
        searchWindow.setMinutes(searchWindow.getMinutes() - 5);
        invoice = await this.prisma.invoice.findFirst({
          where: { invoiceType: 'TOPUP', createdAt: { gte: searchWindow } },
          orderBy: { createdAt: 'desc' },
          include: { user: true },
        });
      }
    }

    if (invoice) {
      return {
        success: true,
        type: invoice.invoiceType === 'TOPUP' ? 'topup' : 'invoice',
        status: mapInvoiceStatus(invoice.status),
        invoice: {
          id: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: invoice.amount,
          status: invoice.status, paidAt: invoice.paidAt, dueDate: invoice.dueDate,
          paymentToken: invoice.paymentToken, paymentLink: invoice.paymentLink,
          customerName: invoice.user?.name || invoice.customerName,
          customerPhone: invoice.user?.phone || invoice.customerPhone,
          customerUsername: invoice.user?.username || invoice.customerUsername,
        },
      };
    }

    // Fallback: webhook logs
    const webhook = await this.prisma.webhookLog.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    if (webhook) {
      return { success: true, type: 'unknown', status: webhook.status, orderId };
    }

    throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
  }

  /**
   * Get Duitku payment methods — ported from /api/payment/duitku-methods
   */
  async getDuitkuMethods(amount: number = 10000) {
    try {
      const gateway = await this.prisma.paymentGateway.findUnique({
        where: { provider: 'duitku' },
        select: { isActive: true, duitkuMerchantCode: true, duitkuApiKey: true, duitkuEnvironment: true },
      });

      if (!gateway || !gateway.isActive) {
        return { methods: [] };
      }

      const merchantCode = gateway.duitkuMerchantCode || '';
      const apiKey = gateway.duitkuApiKey || '';
      const isSandbox = gateway.duitkuEnvironment === 'sandbox';
      const baseUrl = isSandbox
        ? 'https://sandbox.duitku.com/webapi/api/merchant'
        : 'https://passport.duitku.com/webapi/api/merchant';

      const datetime = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const signature = crypto.createHash('md5').update(`${merchantCode}${amount}${datetime}${apiKey}`).digest('hex');

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${baseUrl}/paymentmethod/getpaymentmethod`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ merchantcode: merchantCode, amount, datetime, signature }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const data = await res.json();
        if (res.ok && data?.paymentFee?.length > 0) {
          const methods = data.paymentFee.map((m: any) => ({
            code: m.paymentMethod, name: m.paymentName, fee: m.totalFee || 0, group: getGroup(m.paymentMethod),
          }));
          return { methods };
        }
      } catch (apiErr) {
        this.logger.warn('[Duitku Methods] API error, using defaults');
      }

      return { methods: getDefaultMethods(amount) };
    } catch (error) {
      this.logger.error('[Duitku Methods] Error:', error);
      return { methods: getDefaultMethods(10000) };
    }
  }
}
