import * as crypto from 'crypto';

// ==================== Duitku ====================

export interface DuitkuConfig {
  merchantCode: string;
  apiKey: string;
  callbackUrl: string;
  returnUrl: string;
  sandbox?: boolean;
}

export interface DuitkuCreateParams {
  invoiceId: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  description: string;
  expiryMinutes?: number;
  paymentMethod?: string;
  customerPhone?: string;
}

export interface DuitkuResponse {
  statusCode: string;
  statusMessage: string;
  reference: string;
  paymentUrl: string;
  vaNumber?: string;
  qrString?: string;
  amount: string;
}

export class DuitkuPayment {
  private config: DuitkuConfig;
  private baseUrl: string;

  constructor(config: DuitkuConfig) {
    this.config = config;
    this.baseUrl = config.sandbox
      ? 'https://sandbox.duitku.com/webapi/api/merchant'
      : 'https://passport.duitku.com/webapi/api/merchant';
  }

  private generateSignature(merchantCode: string, merchantOrderId: string, amount: number, apiKey: string): string {
    return crypto.createHash('md5').update(`${merchantCode}${merchantOrderId}${amount}${apiKey}`).digest('hex');
  }

  validateCallbackSignature(merchantCode: string, amount: string, merchantOrderId: string, apiKey: string, signature: string): boolean {
    const calculated = crypto.createHash('md5').update(`${merchantCode}${amount}${merchantOrderId}${apiKey}`).digest('hex');
    return calculated === signature;
  }

  async createInvoice(params: DuitkuCreateParams): Promise<DuitkuResponse> {
    const { invoiceId, amount, customerName, customerEmail, description, expiryMinutes = 1440, paymentMethod, customerPhone = '08123456789' } = params;
    const signature = this.generateSignature(this.config.merchantCode, invoiceId, amount, this.config.apiKey);

    const payload: Record<string, unknown> = {
      merchantCode: this.config.merchantCode,
      paymentAmount: amount,
      merchantOrderId: invoiceId,
      productDetails: description,
      customerVaName: customerName,
      email: customerEmail,
      phoneNumber: customerPhone,
      itemDetails: [{ name: description, price: amount, quantity: 1 }],
      customerDetail: {
        firstName: customerName.split(' ')[0] || 'Customer',
        lastName: customerName.split(' ').slice(1).join(' ') || 'Name',
        email: customerEmail,
        phoneNumber: customerPhone,
      },
      callbackUrl: this.config.callbackUrl,
      returnUrl: this.config.returnUrl,
      signature,
      expiryPeriod: expiryMinutes,
    };

    if (paymentMethod) payload.paymentMethod = paymentMethod;

    const response = await fetch(`${this.baseUrl}/v2/inquiry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || data.statusCode !== '00') {
      const msg = data.statusMessage || data.Message || JSON.stringify(data);
      throw new Error(`Duitku error [${data.statusCode || response.status}]: ${msg}`);
    }
    return data;
  }

  async checkTransactionStatus(merchantOrderId: string): Promise<any> {
    const signature = crypto.createHash('md5').update(`${this.config.merchantCode}${merchantOrderId}${this.config.apiKey}`).digest('hex');
    const response = await fetch(`${this.baseUrl}/merchant/transactionStatus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantCode: this.config.merchantCode, merchantOrderId, signature }),
    });
    return response.json();
  }

  async getPaymentMethods(amount: number): Promise<any[]> {
    const datetime = new Date().toISOString().replace(/[:T.-]/g, '').slice(0, 14);
    const signature = crypto.createHash('sha256').update(`${this.config.merchantCode}${amount}${datetime}${this.config.apiKey}`).digest('hex');
    const response = await fetch(`${this.baseUrl}/v2/paymentmethod`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        merchantCode: this.config.merchantCode,
        amount,
        datetime,
        signature,
      }),
    });
    const data = await response.json();
    if (!response.ok || data.statusCode !== '00') {
      throw new Error(`Duitku payment methods error: ${data.statusMessage || JSON.stringify(data)}`);
    }
    return data.paymentMethod || [];
  }
}

export function createDuitkuClient(merchantCode: string, apiKey: string, callbackUrl: string, returnUrl: string, sandbox = false): DuitkuPayment {
  return new DuitkuPayment({ merchantCode, apiKey, callbackUrl, returnUrl, sandbox });
}

// ==================== Tripay ====================

export interface TripayConfig {
  merchantCode: string;
  apiKey: string;
  privateKey: string;
  sandbox?: boolean;
}

export interface TripayCreateParams {
  method: string;
  merchantRef: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  orderItems: Array<{ name: string; price: number; quantity: number }>;
  callbackUrl?: string;
  returnUrl?: string;
  expiredTime?: number;
}

export interface TripayResponse {
  success: boolean;
  message: string;
  data?: {
    reference: string;
    merchant_ref: string;
    payment_method: string;
    payment_name: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    callback_url: string;
    return_url: string;
    amount: number;
    fee_merchant: number;
    fee_customer: number;
    total_fee: number;
    amount_received: number;
    pay_code: string;
    pay_url: string;
    checkout_url: string;
    status: string;
    expired_time: number;
    order_items: Array<any>;
    instructions: Array<any>;
    qr_code?: string;
    qr_url?: string;
  };
}

export class TripayPayment {
  private config: TripayConfig;
  private baseUrl: string;

  constructor(config: TripayConfig) {
    this.config = config;
    this.baseUrl = config.sandbox ? 'https://tripay.co.id/api-sandbox' : 'https://tripay.co.id/api';
  }

  private generateSignature(merchantRef: string, amount: number): string {
    const data = `${this.config.merchantCode}${merchantRef}${amount}`;
    return crypto.createHmac('sha256', this.config.privateKey).update(data).digest('hex');
  }

  validateCallbackSignature(merchantRef: string, amount: number, signature: string): boolean {
    return this.generateSignature(merchantRef, amount) === signature;
  }

  async createTransaction(params: TripayCreateParams): Promise<TripayResponse> {
    const { method, merchantRef, amount, customerName, customerEmail, customerPhone, orderItems, callbackUrl, returnUrl, expiredTime = 86400 } = params;
    const signature = this.generateSignature(merchantRef, amount);

    const payload: Record<string, unknown> = {
      method,
      merchant_ref: merchantRef,
      amount,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      order_items: orderItems.map((item) => ({ name: item.name, price: item.price, quantity: item.quantity })),
      return_url: returnUrl,
      ...(callbackUrl && { callback_url: callbackUrl }),
      expired_time: Math.floor(Date.now() / 1000) + expiredTime,
      signature,
    };

    const response = await fetch(`${this.baseUrl}/transaction/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data: TripayResponse = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Failed to create Tripay transaction');
    }
    return data;
  }

  async getTransactionDetail(reference: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/transaction/detail?reference=${reference}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Failed to get transaction detail');
    }
    return data;
  }
}

export function createTripayClient(merchantCode: string, apiKey: string, privateKey: string, sandbox = false): TripayPayment {
  return new TripayPayment({ merchantCode, apiKey, privateKey, sandbox });
}

// ==================== Midtrans ====================

export interface MidtransCreateParams {
  orderId: string;
  amount: number;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  invoiceToken: string;
  baseUrl?: string;
  items: Array<{ id: string; name: string; price: number; quantity: number }>;
}

export async function createMidtransPayment(
  params: MidtransCreateParams,
  config: { midtransServerKey: string; midtransClientKey: string; midtransEnvironment: string },
  baseUrl: string,
): Promise<{ token: string; redirect_url: string }> {
  // Dynamic import to avoid loading midtrans-client when not needed
  const midtransClient = await import('midtrans-client');
  const snap = new midtransClient.default.Snap({
    isProduction: config.midtransEnvironment === 'production',
    serverKey: config.midtransServerKey,
    clientKey: config.midtransClientKey,
  });

  const parameter = {
    transaction_details: { order_id: params.orderId, gross_amount: params.amount },
    customer_details: {
      first_name: params.customerName,
      email: params.customerEmail || `${params.orderId}@customer.local`,
      phone: params.customerPhone,
    },
    item_details: params.items.map((item) => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity })),
    callbacks: {
      finish: `${baseUrl}/payment/success?token=${params.invoiceToken}`,
      error: `${baseUrl}/payment/failed?token=${params.invoiceToken}`,
      pending: `${baseUrl}/payment/pending?token=${params.invoiceToken}`,
    },
  };

  return snap.createTransaction(parameter);
}

// ==================== Xendit ====================

export interface XenditCreateParams {
  externalId: string;
  amount: number;
  payerEmail: string;
  description: string;
  customerName: string;
  customerPhone: string;
  invoiceToken: string;
  baseUrl: string;
}

export async function createXenditInvoice(
  params: XenditCreateParams,
  apiKey: string,
): Promise<{ id: string; invoice_url: string; invoiceUrl?: string }> {
  const { Xendit } = await import('xendit-node');
  const xendit = new Xendit({ secretKey: apiKey });
  const { Invoice } = xendit;

  const invoice = await Invoice.createInvoice({
    data: {
      externalId: params.externalId,
      amount: params.amount,
      payerEmail: params.payerEmail,
      description: params.description,
      customer: { givenNames: params.customerName, mobileNumber: params.customerPhone },
      invoiceDuration: 86400,
      currency: 'IDR',
      reminderTime: 1,
      successRedirectUrl: `${params.baseUrl}/payment/success?token=${params.invoiceToken}`,
      failureRedirectUrl: `${params.baseUrl}/payment/failed?token=${params.invoiceToken}`,
    },
  } as any);

  return invoice as any;
}
