import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createMidtransPayment,
  createXenditInvoice,
  createDuitkuClient,
  createTripayClient,
} from './gateway-clients';

@Injectable()
export class PaymentCreateService {
  private readonly logger = new Logger(PaymentCreateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create payment transaction — ported from /api/payment/create (522 lines).
   * Supports invoice and voucher order payments via Midtrans/Xendit/Duitku/Tripay.
   */
  async createPayment(body: {
    invoiceId?: string;
    orderNumber?: string;
    amount?: number;
    gateway: string;
    type?: string;
    paymentMethod?: string;
  }) {
    const { invoiceId, orderNumber, amount, gateway, type, paymentMethod } = body;

    if (type === 'voucher') {
      if (!orderNumber || !amount || !gateway) {
        throw new HttpException('Order number, amount and gateway are required for voucher orders', HttpStatus.BAD_REQUEST);
      }
      return this.createVoucherPayment(orderNumber, gateway, amount);
    }

    if (!invoiceId || !gateway) {
      throw new HttpException('Invoice ID and gateway are required', HttpStatus.BAD_REQUEST);
    }

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { user: { include: { profile: true } } },
    });

    if (!invoice) throw new HttpException('Invoice not found', HttpStatus.NOT_FOUND);
    if (invoice.status === 'PAID') throw new HttpException('Invoice already paid', HttpStatus.BAD_REQUEST);
    if (!invoice.paymentToken) throw new HttpException('Invoice payment token not found', HttpStatus.BAD_REQUEST);

    const gatewayConfig = await this.prisma.paymentGateway.findUnique({ where: { provider: gateway } });
    if (!gatewayConfig || !gatewayConfig.isActive) {
      throw new HttpException('Payment gateway not available', HttpStatus.BAD_REQUEST);
    }

    const customerName = invoice.user?.name || invoice.customerName || 'Customer';
    const customerPhone = invoice.user?.phone || invoice.customerPhone || '08123456789';
    const customerEmail = invoice.user?.email || `invoice-${invoice.invoiceNumber}@example.com`;
    const orderId = `${invoice.invoiceNumber}-${Date.now()}`;

    // Compute base URL
    const companyForBase = await this.prisma.company.findFirst({ select: { baseUrl: true } });
    const appBaseUrl = (companyForBase?.baseUrl && !companyForBase.baseUrl.includes('localhost'))
      ? companyForBase.baseUrl
      : companyForBase?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    let paymentUrl = '';
    let snapToken = '';
    let transactionId = '';
    let qrString = '';

    if (gateway === 'midtrans') {
      try {
        const result = await createMidtransPayment(
          {
            orderId, amount: invoice.amount, customerName, customerEmail, customerPhone,
            invoiceToken: invoice.paymentToken, baseUrl: appBaseUrl,
            items: [{ id: invoice.id, name: `Invoice ${invoice.invoiceNumber}`, price: invoice.amount, quantity: 1 }],
          },
          {
            midtransServerKey: gatewayConfig.midtransServerKey!,
            midtransClientKey: gatewayConfig.midtransClientKey!,
            midtransEnvironment: gatewayConfig.midtransEnvironment,
          },
          appBaseUrl,
        );
        snapToken = result.token;
        paymentUrl = result.redirect_url || '';
      } catch (error) {
        this.logger.error('[Midtrans] Payment creation error:', error);
        throw new HttpException(
          { error: 'Failed to create Midtrans payment', details: error instanceof Error ? error.message : 'Unknown error' },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    } else if (gateway === 'xendit') {
      try {
        const result = await createXenditInvoice(
          {
            externalId: orderId, amount: invoice.amount, payerEmail: customerEmail,
            description: `Payment for Invoice ${invoice.invoiceNumber}`,
            customerName, customerPhone, invoiceToken: invoice.paymentToken, baseUrl: appBaseUrl,
          },
          gatewayConfig.xenditApiKey!,
        );
        transactionId = result.id || '';
        paymentUrl = (result as any).invoice_url || result.invoiceUrl || '';
      } catch (error) {
        this.logger.error('[Xendit] Payment creation error:', error);
        throw new HttpException(
          { error: 'Failed to create Xendit payment', details: error instanceof Error ? error.message : 'Unknown error' },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    } else if (gateway === 'duitku') {
      try {
        const duitku = createDuitkuClient(
          gatewayConfig.duitkuMerchantCode || '',
          gatewayConfig.duitkuApiKey || '',
          `${appBaseUrl}/api/v1/payment/webhook`,
          `${appBaseUrl}/pay/${invoice.paymentToken}`,
          gatewayConfig.duitkuEnvironment === 'sandbox',
        );
        const result = await duitku.createInvoice({
          invoiceId: orderId, amount: invoice.amount, customerName, customerEmail, customerPhone,
          description: `Payment for Invoice ${invoice.invoiceNumber}`,
          expiryMinutes: 1440, paymentMethod: paymentMethod || 'SP',
        });
        transactionId = result.reference;
        paymentUrl = result.paymentUrl;
        qrString = result.qrString || '';
      } catch (error) {
        this.logger.error('[Duitku] Payment creation error:', error);
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        const isBusinessError = errMsg.includes('Minimum Payment') || errMsg.includes('not available');
        throw new HttpException(
          { error: isBusinessError ? errMsg : 'Gagal membuat pembayaran Duitku', details: errMsg },
          isBusinessError ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    } else if (gateway === 'tripay') {
      try {
        const tripay = createTripayClient(
          gatewayConfig.tripayMerchantCode || '',
          gatewayConfig.tripayApiKey || '',
          gatewayConfig.tripayPrivateKey || '',
          gatewayConfig.tripayEnvironment === 'sandbox',
        );
        const result = await tripay.createTransaction({
          method: 'QRIS', merchantRef: orderId, amount: invoice.amount,
          customerName, customerEmail, customerPhone,
          orderItems: [{ name: `Invoice ${invoice.invoiceNumber}`, price: invoice.amount, quantity: 1 }],
          returnUrl: `${appBaseUrl}/pay/${invoice.paymentToken}`,
          expiredTime: 86400,
        });
        if (result.success && result.data) {
          transactionId = result.data.reference;
          paymentUrl = result.data.checkout_url || result.data.pay_url || '';
          qrString = result.data.qr_code || '';
        }
      } catch (error) {
        this.logger.error('[Tripay] Payment creation error:', error);
        throw new HttpException(
          { error: 'Failed to create Tripay payment', details: error instanceof Error ? error.message : 'Unknown error' },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    } else {
      throw new HttpException('Unsupported payment gateway', HttpStatus.BAD_REQUEST);
    }

    // Save payment to database
    const payment = await this.prisma.payment.create({
      data: {
        id: crypto.randomUUID(), invoiceId: invoice.id, amount: invoice.amount,
        method: `${gateway}_${gateway === 'midtrans' ? 'snap' : 'invoice'}`,
        gatewayId: gatewayConfig.id, status: 'pending',
      },
    });

    // Create webhook log
    try {
      await this.prisma.webhookLog.create({
        data: {
          id: crypto.randomUUID(), gateway, orderId, status: 'pending',
          transactionId: transactionId || null, amount: invoice.amount,
          payload: JSON.stringify({ type: 'invoice', invoiceId: invoice.id, createdAt: new Date() }),
          response: JSON.stringify({ paymentUrl, snapToken: snapToken || null }), success: true,
        },
      });
    } catch (logError) {
      this.logger.error('Failed to create webhook log:', logError);
    }

    return { success: true, payment, orderId, paymentUrl, snapToken, qrString: qrString || undefined };
  }

  private async createVoucherPayment(orderNumber: string, gateway: string, amount: number) {
    const order = await this.prisma.voucherOrder.findFirst({ where: { orderNumber }, include: { profile: true } });
    if (!order) throw new HttpException('Voucher order not found', HttpStatus.NOT_FOUND);
    if (order.status === 'PAID') throw new HttpException('Order already paid', HttpStatus.BAD_REQUEST);

    const gatewayConfig = await this.prisma.paymentGateway.findUnique({ where: { provider: gateway } });
    if (!gatewayConfig || !gatewayConfig.isActive) {
      throw new HttpException('Payment gateway not available', HttpStatus.BAD_REQUEST);
    }

    const customerName = order.customerName;
    const customerPhone = order.customerPhone;
    const customerEmail = order.customerEmail || `order-${order.orderNumber}@example.com`;
    const orderId = `${order.orderNumber}-${Date.now()}`;

    const company = await this.prisma.company.findFirst();
    const baseUrl = company?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    let paymentUrl = '';
    let snapToken = '';
    let qrString = '';

    if (gateway === 'midtrans') {
      const midtransClient = await import('midtrans-client');
      const snap = new midtransClient.default.Snap({
        isProduction: gatewayConfig.midtransEnvironment === 'production',
        serverKey: gatewayConfig.midtransServerKey!,
        clientKey: gatewayConfig.midtransClientKey!,
      });
      const transaction = await snap.createTransaction({
        transaction_details: { order_id: orderId, gross_amount: order.totalAmount },
        customer_details: { first_name: customerName, email: customerEmail, phone: customerPhone },
        item_details: [{ id: order.id, name: `Voucher ${order.profile.name} (${order.quantity}x)`, price: order.totalAmount, quantity: 1 }],
        callbacks: {
          finish: `${baseUrl}/evoucher/pay/${order.paymentToken}?status=success`,
          error: `${baseUrl}/evoucher/pay/${order.paymentToken}?status=failed`,
          pending: `${baseUrl}/evoucher/pay/${order.paymentToken}?status=pending`,
        },
      });
      snapToken = transaction.token;
      paymentUrl = transaction.redirect_url;
    } else if (gateway === 'xendit') {
      const result = await createXenditInvoice(
        {
          externalId: orderId, amount: order.totalAmount, payerEmail: customerEmail,
          description: `Payment for Voucher Order ${order.orderNumber}`,
          customerName, customerPhone, invoiceToken: order.paymentToken || '', baseUrl,
        },
        gatewayConfig.xenditApiKey!,
      );
      paymentUrl = (result as any).invoice_url || (result as any).invoiceUrl || '';
    } else if (gateway === 'duitku') {
      const duitku = createDuitkuClient(
        gatewayConfig.duitkuMerchantCode || '', gatewayConfig.duitkuApiKey || '',
        `${baseUrl}/api/v1/payment/webhook`, `${baseUrl}/evoucher/pay/${order.paymentToken}`,
        gatewayConfig.duitkuEnvironment === 'sandbox',
      );
      const result = await duitku.createInvoice({
        invoiceId: orderId, amount: order.totalAmount, customerName, customerEmail, customerPhone,
        description: `Payment for Voucher Order ${order.orderNumber}`, expiryMinutes: 1440, paymentMethod: 'SP',
      });
      paymentUrl = result.paymentUrl;
      qrString = result.qrString || '';
    } else if (gateway === 'tripay') {
      const tripay = createTripayClient(
        gatewayConfig.tripayMerchantCode || '', gatewayConfig.tripayApiKey || '',
        gatewayConfig.tripayPrivateKey || '', gatewayConfig.tripayEnvironment === 'sandbox',
      );
      const result = await tripay.createTransaction({
        method: 'QRIS', merchantRef: orderId, amount: order.totalAmount,
        customerName, customerEmail, customerPhone,
        orderItems: [{ name: `Voucher ${order.profile.name}`, price: order.totalAmount, quantity: 1 }],
        returnUrl: `${baseUrl}/evoucher/pay/${order.paymentToken}`, expiredTime: 86400,
      });
      if (result.success && result.data) {
        paymentUrl = result.data.checkout_url || result.data.pay_url || '';
        qrString = result.data.qr_code || '';
      }
    } else {
      throw new HttpException('Unsupported payment gateway', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.prisma.webhookLog.create({
        data: {
          id: crypto.randomUUID(), gateway, orderId, status: 'pending', transactionId: null,
          amount: order.totalAmount,
          payload: JSON.stringify({ type: 'voucher', orderId: order.id, orderNumber: order.orderNumber, createdAt: new Date() }),
          response: JSON.stringify({ paymentUrl, snapToken: snapToken || null }), success: true,
        },
      });
    } catch (logError) {
      this.logger.error('Failed to create webhook log:', logError);
    }

    return { success: true, orderId, paymentUrl, snapToken, qrString: qrString || undefined };
  }
}
