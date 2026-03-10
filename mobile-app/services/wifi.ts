/**
 * WiFi Self-Service
 * Customer can change their SSID and WiFi password via GenieACS TR-069
 */

import { apiClient } from './api';
import { API_CONFIG } from '@/constants';

export interface WLANConfig {
  index: number;
  ssid: string;
  enabled: boolean;
  securityMode: string;
  channel?: string;
  standard?: string;
  totalAssociations?: number;
}

export interface WiFiDeviceInfo {
  deviceId: string;
  serialNumber?: string;
  manufacturer?: string;
  modelName?: string;
  softwareVersion?: string;
  uptime?: number;
  wlanConfigs: WLANConfig[];
}

interface WiFiGetResponse {
  success: boolean;
  device?: WiFiDeviceInfo;
  error?: string;
  reason?: string;
}

interface WiFiUpdateResponse {
  success: boolean;
  message?: string;
  taskId?: string;
  error?: string;
}

export const WifiService = {
  /**
   * Get raw response — distinguishes 400 (GenieACS not configured) from no device
   */
  async getDeviceInfoRaw(): Promise<{ device: WiFiDeviceInfo | null; notConfigured: boolean }> {
    try {
      const response = await apiClient.get<WiFiGetResponse>(
        API_CONFIG.ENDPOINTS.WIFI
      );
      if (!response.success) {
        // API returns HTTP 200 with reason:'not_configured' when GenieACS is not set up
        if (response.reason === 'not_configured') {
          return { device: null, notConfigured: true };
        }
        return { device: null, notConfigured: false };
      }
      return { device: response.device || null, notConfigured: false };
    } catch (error: any) {
      // Fallback: some API versions may return 400 for not_configured
      const status = error?.response?.status ?? error?.status;
      if (status === 400) {
        return { device: null, notConfigured: true };
      }
      console.error('WifiService error:', error);
      return { device: null, notConfigured: false };
    }
  },

  /**
   * Get customer's ONT device and WiFi configuration
   */
  async getDeviceInfo(): Promise<WiFiDeviceInfo | null> {
    const result = await this.getDeviceInfoRaw();
    return result.device;
  },

  /**
   * Update WiFi SSID and/or password
   * @param wlanIndex - 1 = 2.4GHz, 2 = 5GHz, etc
   */
  async updateWifi(params: {
    wlanIndex: number;
    ssid: string;
    password?: string;
  }): Promise<WiFiUpdateResponse> {
    try {
      const response = await apiClient.post<WiFiUpdateResponse>(
        API_CONFIG.ENDPOINTS.WIFI,
        params
      );
      return response;
    } catch (error: any) {
      console.error('WifiService.updateWifi error:', error);
      throw error;
    }
  },

  /**
   * Get friendly band label for WLAN index
   */
  getBandLabel(index: number): string {
    switch (index) {
      case 1: return '2.4 GHz';
      case 2: return '5 GHz';
      case 3: return 'Guest';
      default: return `WLAN ${index}`;
    }
  },
};
