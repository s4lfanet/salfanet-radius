import { apiClient } from './api';
import { API_CONFIG } from '@/constants';

export interface PaymentGateway {
  id: string;
  name: string;
  provider: string;
  isActive: boolean;
}

export interface PaymentChannel {
  code: string;
  name: string;
  totalFee?: number;
  iconUrl?: string | null;
}

export interface TopUpRequest {
  amount: number;
  gateway: string;
  paymentChannel?: string;
}

export interface TopUpResponse {
  success: boolean;
  invoice?: {
    id: string;
    invoiceNumber: string;
    paymentLink: string;
  };
  error?: string;
}

export class TopUpService {
  /**
   * Get available payment gateways
   */
  static async getPaymentGateways(): Promise<PaymentGateway[]> {
    try {
      const response = await apiClient.get<{ success: boolean; gateways: PaymentGateway[] }>(
        API_CONFIG.ENDPOINTS.PAYMENT_GATEWAYS
      );
      
      if (response.success && response.gateways) {
        return response.gateways;
      }
      
      return [];
    } catch (error) {
      console.error('Get payment gateways error:', error);
      return [];
    }
  }

  /**
   * Get available payment channels for a gateway
   */
  static async getPaymentChannels(gateway: string, amount: number): Promise<PaymentChannel[]> {
    try {
      const response = await apiClient.get<{ success: boolean; methods: PaymentChannel[] }>(
        `${API_CONFIG.ENDPOINTS.PAYMENT_METHODS}?gateway=${gateway}&amount=${amount}`
      );
      if (response.success && response.methods) {
        return response.methods;
      }
      return [];
    } catch (error) {
      console.error('Get payment channels error:', error);
      return [];
    }
  }

  /**
   * Create top-up payment
   */
  static async createTopUp(data: TopUpRequest): Promise<TopUpResponse> {
    try {
      const response = await apiClient.post<TopUpResponse>(
        API_CONFIG.ENDPOINTS.TOPUP_DIRECT,
        data
      );
      
      return response;
    } catch (error: any) {
      console.error('Create top-up error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Gagal membuat top-up',
      };
    }
  }
}
