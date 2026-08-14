/**
 * Customer portal API types.
 *
 * @see backend/src/app/api/customer/me/route.ts
 * @see backend/src/app/api/customer/invoices/route.ts
 * @see backend/src/app/api/customer/wifi/route.ts
 */

import type { ID, ISODateString, InvoiceStatus, InvoiceType } from './common';

// === Customer Profile ===
// GET /api/customer/me returns { success: true, user: {...} }
export interface CustomerUser {
  id: ID;
  username: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  status: string;
  profileId: ID;
  profileName?: string;
  profilePrice?: number;
  expiredAt: ISODateString | null;
  balance: number;
  routerId: ID | null;
  areaId: ID | null;
  ipAddress: string | null;
  subscriptionType: string;
  connectionType: string;
  pppoeCustomerId?: string | null;
  [key: string]: unknown;
}

export interface CustomerMeResponse {
  success: boolean;
  user: CustomerUser;
}

// === Customer Invoice ===
export interface CustomerInvoice {
  id: ID;
  invoiceNumber: string;
  amount: number;
  status: InvoiceStatus;
  dueDate: ISODateString;
  paidAt: ISODateString | null;
  createdAt: ISODateString;
  invoiceType: InvoiceType;
  customerName: string | null;
  customerPhone: string | null;
  paymentLink: string | null;
  [key: string]: unknown;
}

export interface CustomerInvoiceListResponse {
  success: boolean;
  data: {
    invoices: CustomerInvoice[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

// === Customer WiFi ===
export interface CustomerWifiInfo {
  ssid: string | null;
  password: string | null;
  interface: string | null;
  band: string | null;
  channel: string | null;
  security: string | null;
  [key: string]: unknown;
}

export interface CustomerWifiResponse {
  success: boolean;
  wifi?: CustomerWifiInfo;
  [key: string]: unknown;
}

// === Customer Actions ===
export interface CustomerActionResponse {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

export interface CustomerRenewPayload {
  profileId?: ID;
  paymentMethod?: string;
  [key: string]: unknown;
}

export interface CustomerUpgradePayload {
  profileId: ID;
  [key: string]: unknown;
}

export interface CustomerTopupDirectPayload {
  amount: number;
  paymentMethod?: string;
  [key: string]: unknown;
}

export interface CustomerTopupRequestPayload {
  amount: number;
  notes?: string;
  [key: string]: unknown;
}

// === Customer Notification ===
export interface CustomerNotification {
  id: ID;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: ISODateString;
  [key: string]: unknown;
}

export interface CustomerNotificationListResponse {
  success: boolean;
  notifications: CustomerNotification[];
  [key: string]: unknown;
}
