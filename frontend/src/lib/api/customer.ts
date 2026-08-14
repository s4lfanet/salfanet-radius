/**
 * Customer portal API client.
 * Uses Bearer token from localStorage('customer_token').
 */
import { apiCustomer } from './client';

export const customerApi = {
  /** Get current customer profile */
  me(): Promise<any> {
    return apiCustomer('/api/customer/me');
  },

  /** Get customer invoices */
  invoices(): Promise<any> {
    return apiCustomer('/api/customer/invoices');
  },

  /** Get customer WiFi info */
  wifi(): Promise<any> {
    return apiCustomer('/api/customer/wifi');
  },

  /** Renew subscription */
  renew(payload: Record<string, any>): Promise<any> {
    return apiCustomer('/api/customer/renewal', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Upgrade package */
  upgrade(payload: Record<string, any>): Promise<any> {
    return apiCustomer('/api/customer/upgrade', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Topup direct */
  topupDirect(payload: Record<string, any>): Promise<any> {
    return apiCustomer('/api/customer/topup-direct', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Topup request */
  topupRequest(payload: Record<string, any>): Promise<any> {
    return apiCustomer('/api/customer/topup-request', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Suspend subscription */
  suspend(): Promise<any> {
    return apiCustomer('/api/customer/suspend', { method: 'POST' });
  },

  /** Get notifications */
  notifications(): Promise<any> {
    return apiCustomer('/api/customer/notifications');
  },
};
