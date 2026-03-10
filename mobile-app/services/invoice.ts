/**
 * Invoice Service
 */

import { apiClient } from './api';
import { API_CONFIG } from '@/constants';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  userId: string;
  amount: number;
  status: 'PAID' | 'UNPAID' | 'PENDING' | 'OVERDUE';
  dueDate: string;
  paidAt: string | null;
  createdAt: string;
  description: string;
  profileName: string;
}

export interface InvoiceListResponse {
  invoices: Invoice[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class InvoiceService {
  /**
   * Get invoice list
   */
  static async getInvoices(
    page: number = 1,
    limit: number = 10,
    status?: string
  ): Promise<InvoiceListResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...(status && { status }),
    });

    const response = await apiClient.get<{ success: boolean; data: InvoiceListResponse }>(
      `${API_CONFIG.ENDPOINTS.INVOICES}?${params}`
    );
    return response.data;
  }

  /**
   * Get invoice detail
   */
  static async getInvoiceDetail(id: string): Promise<Invoice> {
    const response = await apiClient.get<{ invoice: Invoice }>(
      API_CONFIG.ENDPOINTS.INVOICE_DETAIL(id)
    );
    return response.invoice;
  }

  /**
   * Download invoice PDF
   */
  static async downloadInvoice(id: string): Promise<Blob> {
    const response = await apiClient.get(
      `${API_CONFIG.ENDPOINTS.INVOICE_DETAIL(id)}/pdf`,
      { responseType: 'blob' }
    );
    return response;
  }

  /**
   * Regenerate payment link for invoice
   */
  static async regeneratePayment(
    invoiceId: string,
    gateway: string
  ): Promise<{ success: boolean; paymentUrl?: string; error?: string }> {
    try {
      const response = await apiClient.post<{ success: boolean; paymentUrl?: string; error?: string }>(
        API_CONFIG.ENDPOINTS.INVOICE_REGENERATE_PAYMENT,
        { invoiceId, gateway }
      );
      return response;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Gagal membuat link pembayaran',
      };
    }
  }
}
