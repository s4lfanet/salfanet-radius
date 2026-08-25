/**
 * Centralized API client — barrel export (client-side safe).
 *
 * Usage:
 *   import { pppoeApi, invoiceApi, customerApi } from '@/lib/api';
 *
 * For server-side fetch (SSR, generateMetadata):
 *   import { apiFetch, getCompanyInfo } from '@/lib/api/server';
 */

// Client-side API functions (safe for browser)
export { apiCall, apiAdmin, apiCustomer, apiAgent, apiTechnician, apiFetchAuth, ApiError, buildUrl, onUnauthorized } from './client';
export type { AuthMode } from './client';

// Domain-specific API modules (all client-side safe)
export { pppoeApi } from './pppoe';
export type { PppoeUser, PppoeProfile, PppoeArea, CreatePppoeUserPayload, UpdatePppoeUserPayload } from './pppoe';

export { invoiceApi, billingApi } from './billing';
export type { Invoice } from './billing';

export { customerApi } from './customer';
export { agentApi } from './agent';
export { networkApi, dashboardApi } from './network';
export { settingsApi, adminApi } from './settings';

// Re-export all API contract types
export type * from '@/types/api';
