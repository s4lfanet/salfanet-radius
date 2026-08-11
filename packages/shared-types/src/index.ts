/**
 * @salfanet/shared-types
 *
 * Shared TypeScript types between frontend and backend.
 * This package is the single source of truth for API contracts.
 *
 * During migration, types will be extracted here from both
 * frontend and backend code.
 */

// === API Response Wrapper ===
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T = unknown> {
  success: boolean;
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

// === Auth Types ===
export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'AGENT' | 'TECHNICIAN' | 'CUSTOMER';

export interface AuthSession {
  user: {
    id: string;
    username: string;
    role: UserRole;
    name?: string;
    email?: string;
  };
  expires: string;
}

// === Placeholder — types will be added during Phase 2-3 migration ===
