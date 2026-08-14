/**
 * Invoice & Billing API client.
 */
import { apiAdmin } from './client';
import type {
  Invoice,
  InvoiceListResponse,
  InvoiceResponse,
  InvoiceGenerateResponse,
  InvoicePdfResponse,
  ManualPayment,
  ManualPaymentListResponse,
  ManualPaymentResponse,
  Transaction,
  TransactionListResponse,
  TransactionResponse,
} from '@/types/api';

export type { Invoice };

export const invoiceApi = {
  /** List invoices with optional filters */
  list(params?: Record<string, string | undefined>): Promise<InvoiceListResponse> {
    const query = params ? '?' + new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null) as [string, string][]
    ).toString() : '';
    return apiAdmin<InvoiceListResponse>(`/api/invoices${query}`);
  },

  /** Update invoice */
  update(payload: Record<string, unknown>): Promise<InvoiceResponse> {
    return apiAdmin<InvoiceResponse>('/api/invoices', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  /** Delete invoice */
  delete(id: string): Promise<void> {
    return apiAdmin<void>(`/api/invoices?id=${id}`, { method: 'DELETE' });
  },

  /** Send invoice reminder */
  sendReminder(payload: Record<string, unknown>): Promise<{ success: boolean }> {
    return apiAdmin<{ success: boolean }>('/api/invoices/send-reminder', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Get invoice PDF data (for printing) */
  getPdf(id: string): Promise<InvoicePdfResponse> {
    return apiAdmin<InvoicePdfResponse>(`/api/invoices/${id}/pdf`);
  },

  /** Generate invoices */
  generate(payload: Record<string, unknown>): Promise<InvoiceGenerateResponse> {
    return apiAdmin<InvoiceGenerateResponse>('/api/invoices/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

export const billingApi = {
  /** List manual payments */
  listManualPayments(params?: Record<string, string>): Promise<ManualPaymentListResponse> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiAdmin<ManualPaymentListResponse>(`/api/manual-payments${query}`);
  },

  /** Approve manual payment */
  approveManualPayment(id: string): Promise<ManualPaymentResponse> {
    return apiAdmin<ManualPaymentResponse>(`/api/manual-payments/${id}/approve`, { method: 'POST' });
  },

  /** Reject manual payment */
  rejectManualPayment(id: string, reason?: string): Promise<ManualPaymentResponse> {
    return apiAdmin<ManualPaymentResponse>(`/api/manual-payments/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  /** List transactions (keuangan) */
  listTransactions(params?: Record<string, string>): Promise<TransactionListResponse> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiAdmin<TransactionListResponse>(`/api/transactions${query}`);
  },
};
