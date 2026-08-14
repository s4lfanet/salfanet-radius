/**
 * PPPoE API client — all PPPoE-related endpoints.
 *
 * Usage:
 *   import { pppoeApi } from '@/lib/api/pppoe';
 *   const users = await pppoeApi.listUsers();
 *   await pppoeApi.createUser(payload);
 */

import { apiAdmin } from './client';
import type {
  PppoeUser,
  PppoeUserListResponse,
  PppoeUserResponse,
  PppoeUserCreateResponse,
  PppoeProfile,
  PppoeProfileListResponse,
  PppoeProfileResponse,
  PppoeArea,
  PppoeAreaListResponse,
  PppoeAreaResponse,
  PppoeOnlineStatusResponse,
  SyncPreviewResponse,
  Router,
} from '@/types/api';

// Re-export types for backward compatibility
export type {
  PppoeUser,
  PppoeProfile,
  PppoeArea,
};

export interface CreatePppoeUserPayload {
  username?: string;
  password?: string;
  profile?: string;
  profileId?: string;
  routerId?: string;
  areaId?: string;
  registeredAt?: string;
  name?: string;
  phone?: string;
  pppoeCustomerId?: string;
  noPppoeAccount?: boolean;
  idCardPhoto?: string;
  latitude?: number | string;
  longitude?: number | string;
  expiredAt?: string;
  firstInvoice?: 'none' | 'full' | 'prorate';
  createPppSecret?: boolean;
  discount?: number;
  connectionType?: 'PPPOE' | 'HOTSPOT' | 'STATIC_IP';
  [key: string]: unknown;
}

export interface UpdatePppoeUserPayload {
  id: string;
  [key: string]: unknown;
}

// ─── API ────────────────────────────────────────────────────────────

export const pppoeApi = {
  // ── Users ──────────────────────────────────────────────────────────

  /** List PPPoE users with optional filters */
  listUsers(params?: Record<string, string | undefined>): Promise<PppoeUserListResponse> {
    const query = params ? '?' + new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null) as [string, string][]
    ).toString() : '';
    return apiAdmin<PppoeUserListResponse>(`/api/pppoe/users${query}`);
  },

  /** Get single PPPoE user by ID */
  getUser(id: string): Promise<PppoeUserResponse> {
    return apiAdmin<PppoeUserResponse>(`/api/pppoe/users/${id}`);
  },

  /** Create new PPPoE user */
  createUser(payload: CreatePppoeUserPayload): Promise<PppoeUserCreateResponse> {
    return apiAdmin<PppoeUserCreateResponse>('/api/pppoe/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Update PPPoE user */
  updateUser(payload: UpdatePppoeUserPayload): Promise<PppoeUserResponse> {
    return apiAdmin<PppoeUserResponse>('/api/pppoe/users', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  /** Delete PPPoE user */
  deleteUser(id: string): Promise<void> {
    return apiAdmin(`/api/pppoe/users?id=${id}`, { method: 'DELETE' });
  },

  /** Update user status (active, suspended, stop, etc.) */
  updateStatus(userId: string, status: string): Promise<void> {
    return apiAdmin('/api/pppoe/users/status', {
      method: 'PUT',
      body: JSON.stringify({ userId, status }),
    });
  },

  /** Bulk update status for multiple users */
  bulkUpdateStatus(userIds: string[], status: string): Promise<void> {
    return apiAdmin('/api/pppoe/users/bulk-status', {
      method: 'PUT',
      body: JSON.stringify({ userIds, status }),
    });
  },

  /** Bulk delete users (calls /api/pppoe/users/bulk-delete) */
  bulkDelete(userIds: string[]): Promise<{ deleted: number }> {
    return apiAdmin('/api/pppoe/users/bulk-delete', {
      method: 'DELETE',
      body: JSON.stringify({ userIds }),
    });
  },

  /** Sync user to RADIUS */
  syncRadius(userId: string): Promise<void> {
    return apiAdmin(`/api/pppoe/users/${userId}/sync-radius`, { method: 'POST' });
  },

  /** Mark user as paid */
  markPaid(userId: string, payload?: Record<string, any>): Promise<void> {
    return apiAdmin(`/api/pppoe/users/${userId}/mark-paid`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  /** Extend user subscription */
  extend(userId: string, payload: Record<string, any>): Promise<void> {
    return apiAdmin(`/api/pppoe/users/${userId}/extend`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Send notification to user */
  sendNotification(payload: Record<string, any>): Promise<void> {
    return apiAdmin('/api/pppoe/users/send-notification', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Get online status for multiple users */
  getOnlineStatus(usernames: string): Promise<PppoeOnlineStatusResponse> {
    return apiAdmin<PppoeOnlineStatusResponse>(`/api/pppoe/users/online-status?usernames=${encodeURIComponent(usernames)}`);
  },

  /** Sync users from MikroTik router */
  syncMikrotik(routerId?: string): Promise<void> {
    if (routerId) {
      return apiAdmin(`/api/pppoe/users/sync-mikrotik?routerId=${routerId}`);
    }
    return apiAdmin('/api/pppoe/users/sync-mikrotik', { method: 'POST' });
  },

  /** Export users (returns blob) */
  async exportUsers(params: Record<string, string>): Promise<Blob> {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`/api/pppoe/users/export?${query}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Export failed: ${res.status}`);
    return res.blob();
  },

  /** Bulk operation (template upload, etc.) */
  async bulkUpload(formData: FormData): Promise<any> {
    const res = await fetch('/api/pppoe/users/bulk', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`Bulk upload failed: ${res.status}`);
    return res.json();
  },

  /** Upload PPPoE customer file (id card, installation photo) */
  async uploadFile(formData: FormData): Promise<{ url: string }> {
    const res = await fetch('/api/upload/pppoe-customer', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(err.message || `Upload failed: ${res.status}`);
    }
    return res.json();
  },

  // ── Profiles ───────────────────────────────────────────────────────

  /** List PPPoE profiles */
  listProfiles(): Promise<PppoeProfileListResponse> {
    return apiAdmin<PppoeProfileListResponse>('/api/pppoe/profiles');
  },

  /** Create or update profile (PUT if id present, POST if new) */
  saveProfile(payload: Record<string, unknown>): Promise<PppoeProfileResponse> {
    const method = payload.id ? 'PUT' : 'POST';
    return apiAdmin<PppoeProfileResponse>('/api/pppoe/profiles', {
      method,
      body: JSON.stringify(payload),
    });
  },

  /** Delete profile */
  deleteProfile(id: string): Promise<void> {
    return apiAdmin(`/api/pppoe/profiles?id=${id}`, { method: 'DELETE' });
  },

  /** Sync profiles to MikroTik */
  syncMikrotikProfiles(payload?: Record<string, any>): Promise<any> {
    if (payload) {
      return apiAdmin('/api/pppoe/profiles/sync-mikrotik', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    return apiAdmin('/api/pppoe/profiles/sync-mikrotik', { method: 'POST' });
  },

  /** Sync profiles to RADIUS */
  syncRadiusProfiles(): Promise<any> {
    return apiAdmin('/api/pppoe/profiles/sync-radius', { method: 'POST' });
  },

  // ── Areas ──────────────────────────────────────────────────────────

  /** List PPPoE areas */
  listAreas(): Promise<PppoeAreaListResponse> {
    return apiAdmin<PppoeAreaListResponse>('/api/pppoe/areas');
  },

  /** Create or update area (PUT if id present, POST if new) */
  saveArea(payload: Record<string, unknown>): Promise<PppoeAreaResponse> {
    const method = payload.id ? 'PUT' : 'POST';
    return apiAdmin<PppoeAreaResponse>('/api/pppoe/areas', {
      method,
      body: JSON.stringify(payload),
    });
  },

  /** Delete area */
  deleteArea(id: string): Promise<void> {
    return apiAdmin(`/api/pppoe/areas?id=${id}`, { method: 'DELETE' });
  },
};
