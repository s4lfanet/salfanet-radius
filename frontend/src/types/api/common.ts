/**
 * Common API response types — shared across all domain modules.
 *
 * Backend uses `ok(data)` / `created(data)` helpers which return data directly
 * (no `success` wrapper). Error responses use `{ error: string }`.
 *
 * @see backend/src/lib/api-response.ts
 */

// === Error Responses ===

export interface ApiErrorResponse {
  error: string;
  errors?: Record<string, string[]>;
  message?: string;
}

// === Success Response Shapes ===
// Backend `ok<T>(data: T)` returns `T` directly (no wrapper).
// Some endpoints wrap with `success: true` — keep both shapes supported.

export interface SuccessResponse<T = unknown> {
  success: true;
  data?: T;
  message?: string;
}

export interface DataResponse<T = unknown> {
  data: T;
}

export interface ListResponse<T = unknown> {
  [key: string]: T[] | number | undefined;
}

// === Pagination ===

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
  page?: number;
  totalPages?: number;
}

export interface PaginatedData<T = unknown> {
  data: T[];
  pagination: Pagination;
}

// === Common Field Types ===

export type ISODateString = string; // e.g. "2026-08-14T12:00:00.000Z"
export type ID = string;

// === Enums (mirrors of Prisma enums) ===

export type AdminUserRole =
  | 'SUPER_ADMIN'
  | 'FINANCE'
  | 'CUSTOMER_SERVICE'
  | 'TECHNICIAN'
  | 'MARKETING'
  | 'VIEWER';

export type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type InvoiceType = 'MONTHLY' | 'REGISTRATION' | 'ADDON' | 'MANUAL';

export type HotspotVoucherStatus = 'WAITING' | 'ACTIVE' | 'EXPIRED' | 'SOLD';

export type TransactionType = 'INCOME' | 'EXPENSE';

export type ManualPaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type PppoeSubscriptionType = 'POSTPAID' | 'PREPAID';
export type PppoeConnectionType = 'PPPOE' | 'HOTSPOT' | 'STATIC_IP';

export type PppoeProfileValidityUnit = 'MONTHS' | 'DAYS' | 'HOURS';

export type UserStatus = 'active' | 'isolated' | 'suspended' | 'blocked' | 'expired';
