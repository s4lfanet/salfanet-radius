declare module 'midtrans-client' {
  interface CoreApiOptions {
    isProduction: boolean;
    serverKey: string;
    clientKey?: string;
  }

  interface SnapOptions {
    isProduction: boolean;
    serverKey: string;
    clientKey?: string;
  }

  interface TransactionDetails {
    order_id: string;
    gross_amount: number;
  }

  interface CustomerDetails {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  }

  interface ItemDetails {
    id?: string;
    price: number;
    quantity: number;
    name: string;
  }

  interface SnapParameter {
    transaction_details: TransactionDetails;
    customer_details?: CustomerDetails;
    item_details?: ItemDetails[];
    enabled_payments?: string[];
    credit_card?: {
      secure?: boolean;
      channel?: string;
      bank?: string;
      installment?: {
        required?: boolean;
        terms?: Record<string, number[]>;
      };
    };
    callbacks?: {
      finish?: string;
      error?: string;
      pending?: string;
    };
    expiry?: {
      start_time?: string;
      unit: string;
      duration: number;
    };
    custom_field1?: string;
    custom_field2?: string;
    custom_field3?: string;
  }

  interface SnapTransaction {
    token: string;
    redirect_url: string;
  }

  interface TransactionStatus {
    transaction_id: string;
    order_id: string;
    gross_amount: string;
    payment_type: string;
    transaction_status: string;
    fraud_status?: string;
    status_code: string;
    status_message: string;
    signature_key: string;
    transaction_time: string;
    settlement_time?: string;
    approval_code?: string;
  }

  class Snap {
    constructor(options: SnapOptions);
    createTransaction(parameter: SnapParameter): Promise<SnapTransaction>;
    createTransactionToken(parameter: SnapParameter): Promise<string>;
    createTransactionRedirectUrl(parameter: SnapParameter): Promise<string>;
  }

  class CoreApi {
    constructor(options: CoreApiOptions);
    transaction: {
      status(orderId: string): Promise<TransactionStatus>;
      approve(orderId: string): Promise<any>;
      deny(orderId: string): Promise<any>;
      cancel(orderId: string): Promise<any>;
      expire(orderId: string): Promise<any>;
      refund(orderId: string, parameter?: any): Promise<any>;
      notification(notificationJson: any): Promise<TransactionStatus>;
    };
  }

  export { Snap, CoreApi, SnapOptions, CoreApiOptions, SnapParameter, SnapTransaction, TransactionStatus };
}
