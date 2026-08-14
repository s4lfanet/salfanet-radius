/**
 * Settings & Admin API client.
 */
import { apiAdmin } from './client';

export const settingsApi = {
  /** Get company info (public, no auth) */
  getCompanyInfo(): Promise<any> {
    return apiAdmin('/api/company');
  },

  /** Get company settings (admin) */
  getSettings(): Promise<any> {
    return apiAdmin('/api/settings');
  },

  /** Update settings */
  updateSettings(payload: Record<string, any>): Promise<any> {
    return apiAdmin('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  /** Get admin users */
  listAdminUsers(): Promise<any> {
    return apiAdmin('/api/admin/users');
  },

  /** Get admin user by ID */
  getAdminUser(id: string): Promise<any> {
    return apiAdmin(`/api/admin/users/${id}`);
  },

  /** Get user permissions */
  getUserPermissions(userId: string): Promise<any> {
    return apiAdmin(`/api/admin/users/${userId}/permissions`);
  },
};

export const adminApi = {
  /** Get admin user renewal info */
  getUserRenewal(id: string): Promise<any> {
    return apiAdmin(`/api/admin/users/${id}/renewal`);
  },
};
