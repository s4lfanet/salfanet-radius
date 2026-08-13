import 'server-only'
import crypto from 'crypto';

interface TripayConfig {
  merchantCode: string;
  apiKey: string;
  privateKey: string;
  sandbox?: boolean;
}

interface CreateTransactionParams {
  method: string; // Payment channel code
  merchantRef: string; // Unique reference from merchant
  amount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  orderItems: Array<{
    name: string;
    price: number;
    quantity: number;
  }>;
  callbackUrl?: string; // Custom callback URL (optional, overrides dashboard setting)
  returnUrl?: string;
  expiredTime?: number; // in seconds, default 24 hours
}

interface TripayResponse {
  success: boolean;
  message: string;
  data?: {
    reference: string;
    merchant_ref: string;
    payment_selection_type: string;
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
    this.baseUrl = config.sandbox
      ? 'https://tripay.co.id/api-sandbox'
      : 'https://tripay.co.id/api';
  }

  /**
   * Generate signature for Tripay request
   * Formula: HMAC-SHA256(merchantCode + merchantRef + amount, privateKey)
   */
  private generateSignature(merchantRef: string, amount: number): string {
    const data = `${this.config.merchantCode}${merchantRef}${amount}`;
    return crypto
      .createHmac('sha256', this.config.privateKey)
      .update(data)
      .digest('hex');
  }

  /**
   * Validate callback signature from Tripay
   * Formula: HMAC-SHA256(merchantCode + merchantRef + amount, privateKey)
   */
  public validateCallbackSignature(
    merchantRef: string,
    amount: number,
    signature: string
  ): boolean {
    const calculatedSignature = this.generateSignature(merchantRef, amount);
    return calculatedSignature === signature;
  }

  /**
   * Get available payment channels
   */
  async getPaymentChannels(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/merchant/payment-channel`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to get payment channels');
      }

      return data;
    } catch (error) {
      console.error('[Tripay] Get payment channels error:', error);
      throw error;
    }
  }

  /**
   * Create closed payment transaction
   */
  async createTransaction(params: CreateTransactionParams): Promise<TripayResponse> {
    const {
      method,
      merchantRef,
      amount,
      customerName,
      customerEmail,
      customerPhone,
      orderItems,
      callbackUrl,
      returnUrl,
      expiredTime = 86400, // 24 hours default
    } = params;

    // Generate signature
    const signature = this.generateSignature(merchantRef, amount);

    const payload: Record<string, any> = {
      method,
      merchant_ref: merchantRef,
      amount,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      order_items: orderItems.map(item => ({
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
      return_url: returnUrl,
      // Include callback_url only if provided (overrides dashboard setting)
      ...(callbackUrl && { callback_url: callbackUrl }),
      expired_time: Math.floor(Date.now() / 1000) + expiredTime,
      signature,
    };

    try {
      console.log('[Tripay] Request URL:', `${this.baseUrl}/transaction/create`);
      console.log('[Tripay] Payload:', JSON.stringify(payload, null, 2));

      const response = await fetch(`${this.baseUrl}/transaction/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data: TripayResponse = await response.json();

      console.log('[Tripay] Response:', JSON.stringify(data, null, 2));

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to create Tripay transaction');
      }

      return data;
    } catch (error) {
      console.error('[Tripay] Create transaction error:', error);
      throw error;
    }
  }

  /**
   * Get transaction detail
   */
  async getTransactionDetail(reference: string): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/transaction/detail?reference=${reference}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to get transaction detail');
      }

      return data;
    } catch (error) {
      console.error('[Tripay] Get transaction detail error:', error);
      throw error;
    }
  }
}

/**
 * Helper function to initialize Tripay
 */
export function createTripayClient(
  merchantCode: string,
  apiKey: string,
  privateKey: string,
  sandbox: boolean = false
): TripayPayment {
  return new TripayPayment({
    merchantCode,
    apiKey,
    privateKey,
    sandbox,
  });
}
