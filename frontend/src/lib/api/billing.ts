/**
 * Invoice & Billing API client.
 */
import { apiAdmin } from './client';

export interface Invoice {
  id: string;
  invoiceNumber?: string;
  userId?: string;
  username?: string;
  amount: number;
  status: string;
  dueDate?: string;
  createdAt?: string;
  [key: string]: any;
}

export const invoiceApi = {
  /** List invoices with optional filters */
  list(params?: Record<string, string | undefined>): Promise<{ invoices: Invoice[]; total?: number }> {
    const query = params ? '?' + new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null) as [string, string][]
    ).toString() : '';
    return apiAdmin(`/api/invoices${query}`);
  },

  /** Update invoice */
  update(payload: Record<string, any>): Promise<{ invoice: Invoice }> {
    return apiAdmin('/api/invoices', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  /** Delete invoice */
  delete(id: string): Promise<void> {
    return apiAdmin(`/api/invoices?id=${id}`, { method: 'DELETE' });
  },

  /** Send invoice reminder */
  sendReminder(payload: Record<string, any>): Promise<void> {
    return apiAdmin('/api/invoices/send-reminder', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

export const billingApi = {
  /** List manual payments */
  listManualPayments(params?: Record<string, string>): Promise<any> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiAdmin(`/api/manual-payments${query}`);
  },

  /** Approve manual payment */
  approveManualPayment(id: string): Promise<any> {
    return apiAdmin(`/api/manual-payments/${id}/approve`, { method: 'POST' });
  },

  /** Reject manual payment */
  rejectManualPayment(id: string, reason?: string): Promise<any> {
    return apiAdmin(`/api/manual-payments/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  /** List transactions (keuangan) */
  listTransactions(params?: Record<string, string>): Promise<any> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiAdmin(`/api/transactions${query}`);
  },
};
