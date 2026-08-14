/**
 * Settings & Admin API client.
 */
import { apiAdmin } from './client';
import type {
  CompanyResponse,
  SettingsResponse,
  SettingsUpdateResponse,
  AdminUserListResponse,
  AdminUserResponse,
  UserPermissionsResponse,
  CronStatusResponse,
  CronHistoryResponse,
} from '@/types/api';

export const settingsApi = {
  /** Get company info (public, no auth) */
  getCompanyInfo(): Promise<CompanyResponse> {
    return apiAdmin<CompanyResponse>('/api/company');
  },

  /** Get company settings (admin) */
  getSettings(): Promise<SettingsResponse> {
    return apiAdmin<SettingsResponse>('/api/settings');
  },

  /** Update settings */
  updateSettings(payload: Record<string, unknown>): Promise<SettingsUpdateResponse> {
    return apiAdmin<SettingsUpdateResponse>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  /** Get admin users */
  listAdminUsers(): Promise<AdminUserListResponse> {
    return apiAdmin<AdminUserListResponse>('/api/admin/users');
  },

  /** Get admin user by ID */
  getAdminUser(id: string): Promise<AdminUserResponse> {
    return apiAdmin<AdminUserResponse>(`/api/admin/users/${id}`);
  },

  /** Get user permissions */
  getUserPermissions(userId: string): Promise<UserPermissionsResponse> {
    return apiAdmin<UserPermissionsResponse>(`/api/admin/users/${userId}/permissions`);
  },

  /** Get cron status */
  getCronStatus(): Promise<CronStatusResponse> {
    return apiAdmin<CronStatusResponse>('/api/cron/status');
  },

  /** Get cron history */
  getCronHistory(params?: Record<string, string>): Promise<CronHistoryResponse> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiAdmin<CronHistoryResponse>(`/api/cron/history${query}`);
  },
};

export const adminApi = {
  /** Get admin user renewal info */
  getUserRenewal(id: string): Promise<{ renewal: unknown }> {
    return apiAdmin<{ renewal: unknown }>(`/api/admin/users/${id}/renewal`);
  },
};
