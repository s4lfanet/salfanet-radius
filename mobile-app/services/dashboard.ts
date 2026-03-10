/**
 * Dashboard Service
 */

import { apiClient } from './api';
import { API_CONFIG } from '@/constants';

export interface DashboardData {
  user: {
    username: string;
    name: string;
    status: string;
    profileName: string;
    expiredAt: string | null;
    balance: number;
    autoRenewal: boolean;
    packagePrice: number;
  };
  usage: {
    upload: number;
    download: number;
    total: number;
  };
  invoice: {
    unpaidCount: number;
    totalUnpaid: number;
    nextDueDate: string | null;
  };
  session: {
    isOnline: boolean;
    ipAddress: string | null;
    startTime: string | null;
  };
}

export class DashboardService {
  /**
   * Get dashboard data
   */
  static async getDashboard(): Promise<DashboardData> {
    const response = await apiClient.get<{ success: boolean; data: DashboardData }>(
      API_CONFIG.ENDPOINTS.DASHBOARD
    );
    return response.data;
  }

  /**
   * Get usage statistics
   */
  static async getUsage(period: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<any> {
    const response = await apiClient.get(
      `${API_CONFIG.ENDPOINTS.USAGE}?period=${period}`
    );
    return response;
  }

  /**
   * Toggle auto-renewal
   */
  static async toggleAutoRenewal(enabled: boolean): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      API_CONFIG.ENDPOINTS.AUTO_RENEWAL,
      { enabled }
    );
    return response;
  }
}
