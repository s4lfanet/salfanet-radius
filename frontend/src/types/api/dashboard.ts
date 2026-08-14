/**
 * Dashboard API types.
 *
 * @see backend/src/app/api/dashboard/stats/route.ts
 * @see backend/src/app/api/dashboard/analytics/route.ts
 * @see backend/src/app/api/admin/activity-logs/route.ts
 */

import type { ID, ISODateString } from './common';

// === Dashboard Stats ===

export interface DashboardStats {
  totalPppoeUsers: number;
  activePppoeUsers: number;
  isolatedUsers: number;
  suspendedUsers: number;
  blockedUsers: number;
  activePppoeSessions: number;
  activeHotspotSessions: number;
  pendingRegistrations: number;
  unusedVouchers: number;
  pendingInvoices: number;
  overdueInvoices: number;
  totalRevenue: number;
  invoiceRevenue: number;
  voucherRevenue: number;
  monthlyRevenue: number;
}

// === Activity Log ===

export interface ActivityLog {
  id: ID;
  userId: ID;
  username: string;
  action: string;
  description: string | null;
  status: 'OK' | 'FAILED';
  ipAddress: string | null;
  createdAt: ISODateString;
}

export interface ActivityLogListResponse {
  logs: ActivityLog[];
  total?: number;
}

// === Dashboard Analytics ===

export interface DashboardAnalytics {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color?: string;
  }>;
}
