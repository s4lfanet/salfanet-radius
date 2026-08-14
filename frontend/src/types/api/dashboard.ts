/**
 * Dashboard API types.
 *
 * @see backend/src/app/api/dashboard/stats/route.ts
 * @see backend/src/app/api/dashboard/analytics/route.ts
 * @see backend/src/app/api/admin/activity-logs/route.ts
 */

import type { ID, ISODateString } from './common';

// === Dashboard Stats ===
// GET /api/dashboard/stats returns large stats object (no success field)
export interface DashboardStats {
  totalPppoeUsers: number;
  activePppoeUsers: number;
  isolatedUsers: number;
  isolatedCount?: number;
  suspendedUsers: number;
  suspendedCount?: number;
  blockedUsers: number;
  activePppoeSessions: number;
  activeSessionsPPPoE?: number;
  activeHotspotSessions: number;
  activeSessionsHotspot?: number;
  pendingRegistrations: number;
  unusedVouchers: number;
  pendingInvoices: number;
  overdueInvoices: number;
  totalRevenue: number;
  invoiceRevenue: number;
  voucherRevenue: number;
  monthlyRevenue: number;
  monthlyNewUsers?: number;
  recentActivities?: ActivityLog[];
  [key: string]: unknown;
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

// GET /api/admin/activity-logs returns { success, activities, total, hasMore }
export interface ActivityLogListResponse {
  success?: boolean;
  activities: ActivityLog[];
  total: number;
  hasMore?: boolean;
}

// === Dashboard Analytics ===
// GET /api/dashboard/analytics returns { success, data: { revenue, users, hotspot, sessions, financial } }
export interface DashboardAnalytics {
  success?: boolean;
  data?: {
    revenue?: { monthly: unknown[]; byCategory: unknown[] };
    users?: { byStatus: unknown[]; growth: unknown[] };
    hotspot?: { salesByProfile: unknown[]; byStatus: unknown[] };
    sessions?: { hourly: unknown[]; bandwidth: unknown[] };
    financial?: { incomeExpense: unknown[]; topSources: unknown[] };
  };
  [key: string]: unknown;
}
