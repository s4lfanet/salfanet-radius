/**
 * Agent portal API types.
 *
 * @see backend/src/app/api/agent/dashboard/route.ts
 * @see backend/src/app/api/agent/notifications/route.ts
 */

import type { ID, ISODateString, HotspotVoucherStatus } from './common';

// === Agent Profile ===
// GET /api/agent/dashboard returns agent profile + dashboard data
export interface AgentProfile {
  id: ID;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  balance: number;
  commissionRate: number;
  isActive: boolean;
  [key: string]: unknown;
}

export interface AgentDashboardResponse {
  success: boolean;
  agent: AgentProfile;
  stats?: {
    totalSales: number;
    totalCommission: number;
    activeVouchers: number;
    soldVouchers: number;
    [key: string]: unknown;
  };
  vouchers?: AgentVoucher[];
  sessions?: unknown[];
  [key: string]: unknown;
}

// === Agent Voucher ===
export interface AgentVoucher {
  id: ID;
  code: string;
  password: string | null;
  profileId: ID;
  status: HotspotVoucherStatus;
  createdAt: ISODateString;
  expiresAt: ISODateString | null;
  sellingPrice?: number;
  profileName?: string;
  [key: string]: unknown;
}

// === Agent Notification ===
export interface AgentNotification {
  id: ID;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: ISODateString;
  [key: string]: unknown;
}

export interface AgentNotificationListResponse {
  success: boolean;
  notifications: AgentNotification[];
  [key: string]: unknown;
}

export interface AgentNotificationActionResponse {
  success: boolean;
  message?: string;
  [key: string]: unknown;
}
