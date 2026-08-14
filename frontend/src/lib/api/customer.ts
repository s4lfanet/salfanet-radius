/**
 * Customer portal API client.
 * Uses Bearer token from localStorage('customer_token').
 */
import { apiCustomer } from './client';
import type {
  CustomerMeResponse,
  CustomerInvoiceListResponse,
  CustomerWifiResponse,
  CustomerActionResponse,
  CustomerRenewPayload,
  CustomerUpgradePayload,
  CustomerTopupDirectPayload,
  CustomerTopupRequestPayload,
  CustomerNotificationListResponse,
} from '@/types/api';

export const customerApi = {
  /** Get current customer profile */
  me(): Promise<CustomerMeResponse> {
    return apiCustomer<CustomerMeResponse>('/api/customer/me');
  },

  /** Get customer invoices */
  invoices(): Promise<CustomerInvoiceListResponse> {
    return apiCustomer<CustomerInvoiceListResponse>('/api/customer/invoices');
  },

  /** Get customer WiFi info */
  wifi(): Promise<CustomerWifiResponse> {
    return apiCustomer<CustomerWifiResponse>('/api/customer/wifi');
  },

  /** Renew subscription */
  renew(payload: CustomerRenewPayload): Promise<CustomerActionResponse> {
    return apiCustomer<CustomerActionResponse>('/api/customer/renewal', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Upgrade package */
  upgrade(payload: CustomerUpgradePayload): Promise<CustomerActionResponse> {
    return apiCustomer<CustomerActionResponse>('/api/customer/upgrade', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Topup direct */
  topupDirect(payload: CustomerTopupDirectPayload): Promise<CustomerActionResponse> {
    return apiCustomer<CustomerActionResponse>('/api/customer/topup-direct', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Topup request */
  topupRequest(payload: CustomerTopupRequestPayload): Promise<CustomerActionResponse> {
    return apiCustomer<CustomerActionResponse>('/api/customer/topup-request', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Suspend subscription */
  suspend(): Promise<CustomerActionResponse> {
    return apiCustomer<CustomerActionResponse>('/api/customer/suspend', { method: 'POST' });
  },

  /** Get notifications */
  notifications(): Promise<CustomerNotificationListResponse> {
    return apiCustomer<CustomerNotificationListResponse>('/api/customer/notifications');
  },
};
