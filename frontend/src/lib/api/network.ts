/**
 * Network & Router API client.
 */
import { apiAdmin } from './client';
import type {
  RouterListResponse,
  RouterResponse,
  OLTListResponse,
  OLTResponse,
  RadiusStatus,
  DashboardStats,
  DashboardAnalytics,
  ActivityLogListResponse,
} from '@/types/api';

export const networkApi = {
  /** List routers/NAS */
  listRouters(): Promise<RouterListResponse> {
    return apiAdmin<RouterListResponse>('/api/network/routers');
  },

  /** Get router by ID */
  getRouter(id: string): Promise<RouterResponse> {
    return apiAdmin<RouterResponse>(`/api/network/routers/${id}`);
  },

  /** List OLTs */
  listOlts(): Promise<OLTListResponse> {
    return apiAdmin<OLTListResponse>('/api/network/olts');
  },

  /** Get OLT by ID */
  getOlt(id: string): Promise<OLTResponse> {
    return apiAdmin<OLTResponse>(`/api/network/olts/${id}`);
  },

  /** Get system radius status */
  getRadiusStatus(): Promise<RadiusStatus> {
    return apiAdmin<RadiusStatus>('/api/system/radius');
  },

  /** Restart radius */
  restartRadius(): Promise<{ success: boolean }> {
    return apiAdmin<{ success: boolean }>('/api/system/radius', { method: 'POST' });
  },
};

export const dashboardApi = {
  /** Get dashboard stats */
  stats(month?: string): Promise<DashboardStats> {
    const query = month ? `?month=${month}` : '';
    return apiAdmin<DashboardStats>(`/api/dashboard/stats${query}`);
  },

  /** Get dashboard analytics */
  analytics(type?: string): Promise<DashboardAnalytics> {
    const query = type ? `?type=${type}` : '';
    return apiAdmin<DashboardAnalytics>(`/api/dashboard/analytics${query}`);
  },

  /** Get activity logs */
  activityLogs(params?: Record<string, string>): Promise<ActivityLogListResponse> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiAdmin<ActivityLogListResponse>(`/api/admin/activity-logs${query}`);
  },
};
