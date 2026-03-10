/**
 * Package Service
 * Handles package/profile operations
 */

import { apiClient } from './api';
import { API_CONFIG } from '@/constants';

export interface Package {
  id: string;
  name: string;
  downloadSpeed: number;
  uploadSpeed: number;
  price: number;
  description?: string;
}

interface PackagesResponse {
  success: boolean;
  packages: Package[];
  error?: string;
}

interface UpgradeResponse {
  success: boolean;
  invoice?: {
    id: string;
    invoiceNumber: string;
    amount: number;
    dueDate: string;
    paymentLink: string;
  };
  paymentLink?: string;
  error?: string;
}

export const PackageService = {
  /**
   * Get all available packages
   */
  async getPackages(): Promise<Package[]> {
    try {
      const response = await apiClient.get<PackagesResponse>(
        API_CONFIG.ENDPOINTS.PACKAGES
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch packages');
      }

      return response.packages || [];
    } catch (error: any) {
      console.error('Get packages error:', error);
      return [];
    }
  },

  /**
   * Request package upgrade
   * Creates an invoice for the package upgrade
   */
  async requestUpgrade(packageId: string): Promise<UpgradeResponse> {
    try {
      const response = await apiClient.post<UpgradeResponse>(
        API_CONFIG.ENDPOINTS.UPGRADE_PACKAGE,
        { packageId }
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to request upgrade');
      }

      return response;
    } catch (error: any) {
      console.error('Request upgrade error:', error);
      throw error;
    }
  },

  /**
   * Format speed for display
   */
  formatSpeed(speed: number): string {
    if (speed >= 1000) {
      return `${speed / 1000} Gbps`;
    }
    return `${speed} Mbps`;
  },
};
