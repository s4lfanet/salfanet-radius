/**
 * Invoice & Billing API client.
 */
import { apiAdmin } from './client';
import type {
  Invoice,
  InvoiceListResponse,
  InvoiceResponse,
  InvoiceDeleteResponse,
  InvoiceGenerateResponse,
  InvoiceSendReminderResponse,
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
  delete(id: string): Promise<InvoiceDeleteResponse & { error?: string }> {
    return apiAdmin<InvoiceDeleteResponse & { error?: string }>(`/api/invoices?id=${id}`, { method: 'DELETE' });
  },

  /** Send invoice reminder */
  sendReminder(payload: Record<string, unknown>): Promise<InvoiceSendReminderResponse & { error?: string }> {
    return apiAdmin<InvoiceSendReminderResponse & { error?: string }>('/api/invoices/send-reminder', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Get invoice PDF data (for printing) */
  getPdf(id: string): Promise<InvoicePdfResponse> {
    return apiAdmin<InvoicePdfResponse>(`/api/invoices/${id}/pdf`);
  },

  /** Generate invoices */
  generate(payload: Record<string, unknown>): Promise<InvoiceGenerateResponse & { error?: string }> {
    return apiAdmin<InvoiceGenerateResponse & { error?: string }>('/api/invoices/generate', {
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

  /** Approve manual payment — backend uses PATCH /api/manual-payments/[id] with { action: 'APPROVE' } */
  approveManualPayment(id: string): Promise<ManualPaymentResponse> {
    return apiAdmin<ManualPaymentResponse>(`/api/manual-payments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'APPROVE' }),
    });
  },

  /** Reject manual payment — backend uses PATCH /api/manual-payments/[id] with { action: 'REJECT', rejectionReason } */
  rejectManualPayment(id: string, reason?: string): Promise<ManualPaymentResponse> {
    return apiAdmin<ManualPaymentResponse>(`/api/manual-payments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'REJECT', rejectionReason: reason }),
    });
  },

  /** List transactions (keuangan) — backend endpoint is /api/keuangan/transactions */
  listTransactions(params?: Record<string, string>): Promise<TransactionListResponse> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiAdmin<TransactionListResponse>(`/api/keuangan/transactions${query}`);
  },
};
