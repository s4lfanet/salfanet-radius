/**
 * Agent portal API client.
 * Uses Bearer token from localStorage('agentToken').
 */
import { apiAgent } from './client';
import type {
  AgentDashboardResponse,
  AgentNotificationListResponse,
  AgentNotificationActionResponse,
} from '@/types/api';

export const agentApi = {
  /** Get agent profile + dashboard data */
  me(): Promise<AgentDashboardResponse> {
    return apiAgent<AgentDashboardResponse>('/api/agent/dashboard');
  },

  /** List agent vouchers (from dashboard data) */
  vouchers(): Promise<AgentDashboardResponse> {
    return apiAgent<AgentDashboardResponse>('/api/agent/dashboard');
  },

  /** List agent sessions (from dashboard data) */
  sessions(): Promise<AgentDashboardResponse> {
    return apiAgent<AgentDashboardResponse>('/api/agent/dashboard');
  },

  /** Get agent notifications */
  notifications(limit?: number): Promise<AgentNotificationListResponse> {
    const query = limit ? `?limit=${limit}` : '';
    return apiAgent<AgentNotificationListResponse>(`/api/agent/notifications${query}`);
  },

  /** Mark notification as read */
  markNotificationRead(id: string): Promise<AgentNotificationActionResponse> {
    return apiAgent<AgentNotificationActionResponse>('/api/agent/notifications', {
      method: 'PUT',
      body: JSON.stringify({ id }),
    });
  },

  /** Delete notification */
  deleteNotification(id: string): Promise<AgentNotificationActionResponse> {
    return apiAgent<AgentNotificationActionResponse>(`/api/agent/notifications?id=${id}`, { method: 'DELETE' });
  },
};
