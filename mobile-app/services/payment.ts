/**
 * Payment Service
 */

import { apiClient } from './api';
import { API_CONFIG } from '@/constants';

export interface Payment {
  id: string;
  userId: string;
  invoiceId: string;
  invoiceNumber?: string;
  amount: number;
  method: string;
  paymentProof: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
  proofUrl?: string | null;
}

export interface CreatePaymentData {
  invoiceId: string;
  amount: number;
  paymentMethod: string;
  accountNumber?: string;
  accountName?: string;
  notes?: string;
}

export interface PaymentListResponse {
  payments: Payment[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class PaymentService {
  /**
   * Get payment list
   */
  static async getPayments(
    page: number = 1,
    limit: number = 10
  ): Promise<PaymentListResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    const response = await apiClient.get<{ success: boolean; data: PaymentListResponse }>(
      `${API_CONFIG.ENDPOINTS.PAYMENTS}?${params}`
    );
    return response.data;
  }

  /**
   * Create new manual payment
   * POST /api/customer/payments
   */
  static async createPayment(data: CreatePaymentData): Promise<Payment> {
    const response = await apiClient.post<{ success: boolean; data: Payment; message: string }>(
      API_CONFIG.ENDPOINTS.PAYMENTS,
      {
        invoiceId: data.invoiceId,
        amount: data.amount,
        method: data.paymentMethod,
        accountNumber: data.accountNumber,
        accountName: data.accountName,
        notes: data.notes,
      }
    );
    return response.data;
  }

  /**
   * Upload payment proof (React Native compatible)
   * Uses URI-based FormData for image upload
   */
  static async uploadPaymentProof(
    paymentId: string,
    imageUri: string,
    fileName?: string
  ): Promise<string> {
    const name = fileName || imageUri.split('/').pop() || 'proof.jpg';
    const match = /\.(\w+)$/.exec(name);
    const ext = match ? match[1].toLowerCase() : 'jpg';
    const type = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      name,
      type,
    } as any);

    const response = await apiClient.post<{ success: boolean; data: { proofUrl: string }; message: string }>(
      `/api/customer/payments/${paymentId}/proof`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data?.proofUrl || '';
  }
}
