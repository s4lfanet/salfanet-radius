/**
 * Agent portal API client.
 * Uses Bearer token from localStorage('agentToken').
 */
import { apiAgent } from './client';

export const agentApi = {
  /** Get agent profile */
  me(): Promise<any> {
    return apiAgent('/api/agent/me');
  },

  /** List agent vouchers */
  vouchers(): Promise<any> {
    return apiAgent('/api/agent/vouchers');
  },

  /** List agent sessions */
  sessions(): Promise<any> {
    return apiAgent('/api/agent/sessions');
  },

  /** Get agent notifications */
  notifications(limit?: number): Promise<any> {
    const query = limit ? `?limit=${limit}` : '';
    return apiAgent(`/api/agent/notifications${query}`);
  },

  /** Mark notification as read */
  markNotificationRead(id: string): Promise<any> {
    return apiAgent('/api/agent/notifications', {
      method: 'PUT',
      body: JSON.stringify({ id }),
    });
  },

  /** Delete notification */
  deleteNotification(id: string): Promise<any> {
    return apiAgent(`/api/agent/notifications?id=${id}`, { method: 'DELETE' });
  },
};
