/**
 * Network & Router API client.
 */
import { apiAdmin } from './client';

export const networkApi = {
  /** List routers/NAS */
  listRouters(): Promise<any> {
    return apiAdmin('/api/network/routers');
  },

  /** Get router by ID */
  getRouter(id: string): Promise<any> {
    return apiAdmin(`/api/network/routers/${id}`);
  },

  /** List OLTs */
  listOlts(): Promise<any> {
    return apiAdmin('/api/network/olts');
  },

  /** Get OLT by ID */
  getOlt(id: string): Promise<any> {
    return apiAdmin(`/api/network/olts/${id}`);
  },

  /** Get system radius status */
  getRadiusStatus(): Promise<any> {
    return apiAdmin('/api/system/radius');
  },

  /** Restart radius */
  restartRadius(): Promise<any> {
    return apiAdmin('/api/system/radius', { method: 'POST' });
  },
};

export const dashboardApi = {
  /** Get dashboard stats */
  stats(month?: string): Promise<any> {
    const query = month ? `?month=${month}` : '';
    return apiAdmin(`/api/dashboard/stats${query}`);
  },

  /** Get dashboard analytics */
  analytics(type?: string): Promise<any> {
    const query = type ? `?type=${type}` : '';
    return apiAdmin(`/api/dashboard/analytics${query}`);
  },

  /** Get activity logs */
  activityLogs(params?: Record<string, string>): Promise<any> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiAdmin(`/api/admin/activity-logs${query}`);
  },
};
