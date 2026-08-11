import 'server-only'
import crypto from 'crypto';

interface DuitkuConfig {
  merchantCode: string;
  apiKey: string;
  callbackUrl: string;
  returnUrl: string;
  sandbox?: boolean;
}

interface CreateInvoiceParams {
  invoiceId: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  description: string;
  expiryMinutes?: number;
  paymentMethod?: string; // e.g., 'SP' for QRIS (ShopeePay), 'OV' for OVO, etc.
  customerPhone?: string;
}

interface DuitkuResponse {
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
    // API v2 endpoint
    this.baseUrl = config.sandbox
      ? 'https://sandbox.duitku.com/webapi/api/merchant'
      : 'https://passport.duitku.com/webapi/api/merchant';
  }

  /**
   * Generate signature untuk request Duitku
   */
  private generateSignature(
    merchantCode: string,
    merchantOrderId: string,
    amount: number,
    apiKey: string
  ): string {
    const signatureString = `${merchantCode}${merchantOrderId}${amount}${apiKey}`;
    return crypto.createHash('md5').update(signatureString).digest('hex');
  }

  /**
   * Validate callback signature dari Duitku
   */
  public validateCallbackSignature(
    merchantCode: string,
    amount: string,
    merchantOrderId: string,
    apiKey: string,
    signature: string
  ): boolean {
    const calculatedSignature = crypto
      .createHash('md5')
      .update(`${merchantCode}${amount}${merchantOrderId}${apiKey}`)
      .digest('hex');
    return calculatedSignature === signature;
  }

  /**
   * Create payment request
   */
  async createInvoice(params: CreateInvoiceParams): Promise<DuitkuResponse> {
    const {
      invoiceId,
      amount,
      customerName,
      customerEmail,
      description,
      expiryMinutes = 1440, // 24 hours default
      paymentMethod, // If provided, will use direct payment method (e.g., 'SP' for QRIS)
      customerPhone = '08123456789',
    } = params;

    // Generate signature
    const signature = this.generateSignature(
      this.config.merchantCode,
      invoiceId,
      amount,
      this.config.apiKey
    );

    const payload: any = {
      merchantCode: this.config.merchantCode,
      paymentAmount: amount,
      merchantOrderId: invoiceId,
      productDetails: description,
      customerVaName: customerName,
      email: customerEmail,
      phoneNumber: customerPhone,
      itemDetails: [
        {
          name: description,
          price: amount,
          quantity: 1
        }
      ],
      customerDetail: {
        firstName: customerName.split(' ')[0] || 'Customer',
        lastName: customerName.split(' ').slice(1).join(' ') || 'Name',
        email: customerEmail,
        phoneNumber: customerPhone
      },
      callbackUrl: this.config.callbackUrl,
      returnUrl: this.config.returnUrl,
      signature: signature,
      expiryPeriod: expiryMinutes,
    };

    // If payment method specified, use Direct Payment API
    if (paymentMethod) {
      payload.paymentMethod = paymentMethod;
    }

    try {
      // API v2 tidak menggunakan header-based authentication seperti POP
      console.log('[Duitku] Request URL:', `${this.baseUrl}/v2/inquiry`);
      console.log('[Duitku] Request payload:', JSON.stringify(payload, null, 2));
      
      const response = await fetch(`${this.baseUrl}/v2/inquiry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      
      console.log('[Duitku] API Response:', JSON.stringify(data, null, 2));
      console.log('[Duitku] Payment URL:', data.paymentUrl);
      console.log('[Duitku] Payment Method:', paymentMethod);
      console.log('[Duitku] Reference:', data.reference);

      if (!response.ok || data.statusCode !== '00') {
        const msg = data.statusMessage || data.Message || JSON.stringify(data);
        throw new Error(`Duitku error [${data.statusCode || response.status}]: ${msg}`);
      }

      return data;
    } catch (error) {
      console.error('Duitku create invoice error:', error);
      throw error;
    }
  }

  /**
   * Check transaction status
   */
  async checkTransactionStatus(merchantOrderId: string): Promise<any> {
    // Signature untuk status check: md5(merchantCode + merchantOrderId + apiKey)
    const signatureString = `${this.config.merchantCode}${merchantOrderId}${this.config.apiKey}`;
    const signature = crypto.createHash('md5').update(signatureString).digest('hex');

    try {
      const response = await fetch(
        `${this.baseUrl}/merchant/transactionStatus`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            merchantCode: this.config.merchantCode,
            merchantOrderId: merchantOrderId,
            signature: signature,
          }),
        }
      );

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Duitku check status error:', error);
      throw error;
    }
  }

  /**
   * Get available payment methods
   */
  async getPaymentMethods(amount: number): Promise<any> {
    // Duitku v2 requires datetime in signature: MD5(merchantCode + amount + datetime + apiKey)
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const datetime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const signature = crypto
      .createHash('md5')
      .update(`${this.config.merchantCode}${amount}${datetime}${this.config.apiKey}`)
      .digest('hex');

    try {
      const response = await fetch(
        `${this.baseUrl}/paymentmethod/getpaymentmethod`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            merchantcode: this.config.merchantCode,
            amount: amount,
            datetime: datetime,
            signature: signature,
          }),
        }
      );

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Duitku get payment methods error:', error);
      throw error;
    }
  }
}

/**
 * Helper function to initialize Duitku
 */
export function createDuitkuClient(
  merchantCode: string,
  apiKey: string,
  callbackUrl: string,
  returnUrl: string,
  sandbox: boolean = false
): DuitkuPayment {
  return new DuitkuPayment({
    merchantCode,
    apiKey,
    callbackUrl,
    returnUrl,
    sandbox,
  });
}
