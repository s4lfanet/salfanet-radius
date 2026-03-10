import { apiClient } from './api';
import { API_CONFIG } from '@/constants';

export type SuspendStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';

export interface SuspendRequest {
  id: string;
  status: SuspendStatus;
  reason: string | null;
  startDate: string;
  endDate: string;
  adminNotes: string | null;
  requestedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
}

export interface CreateSuspendData {
  startDate: string; // ISO date string YYYY-MM-DD
  endDate: string;
  reason?: string;
}

export class SuspendService {
  /**
   * Get current (latest) suspend request for logged-in customer
   */
  static async getCurrent(): Promise<SuspendRequest | null> {
    try {
      const response = await apiClient.get<{ success: boolean; data: SuspendRequest | null }>(
        API_CONFIG.ENDPOINTS.SUSPEND_REQUEST
      );
      return response.data ?? null;
    } catch (error) {
      console.error('Get suspend request error:', error);
      return null;
    }
  }

  /**
   * Create a new suspend request
   */
  static async create(data: CreateSuspendData): Promise<{ success: boolean; message?: string; data?: SuspendRequest }> {
    try {
      const response = await apiClient.post<{ success: boolean; message?: string; data?: SuspendRequest }>(
        API_CONFIG.ENDPOINTS.SUSPEND_REQUEST,
        data
      );
      return response;
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Gagal mengirim permintaan suspend';
      return { success: false, message: msg };
    }
  }

  /**
   * Cancel a PENDING suspend request
   */
  static async cancel(id: string): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.delete<{ success: boolean; message?: string }>(
        `${API_CONFIG.ENDPOINTS.SUSPEND_REQUEST}?id=${id}`
      );
      return response;
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Gagal membatalkan permintaan';
      return { success: false, message: msg };
    }
  }
}
