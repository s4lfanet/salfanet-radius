/**
 * Auth API types — matches backend admin auth responses.
 *
 * @see backend/src/app/api/admin/auth/verify/route.ts
 */

import type { AdminUserRole, ID, ISODateString } from './common';

// === Auth Verify ===

export interface AuthVerifyResponse {
  id: ID;
  username: string;
  email: string | null;
  name: string;
  role: AdminUserRole;
  twoFactorRequired?: boolean;
  twoFactorPendingId?: string;
}

export interface AuthVerify2faResponse {
  success: true;
  id: ID;
  username: string;
  role: AdminUserRole;
  name: string;
  email: string | null;
}

export interface AuthVerifyError {
  error: string;
}

// === Session (NextAuth) ===

export interface AdminSession {
  user: {
    id: ID;
    username: string;
    role: AdminUserRole;
    name?: string;
    email?: string | null;
  };
  expires: ISODateString;
}

// === Admin User (from /api/admin/users) ===

export interface AdminUser {
  id: ID;
  username: string;
  email: string | null;
  name: string;
  role: AdminUserRole;
  isActive: boolean;
  phone: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  lastLogin: ISODateString | null;
  twoFactorEnabled: boolean;
}

// GET /api/admin/users returns { success: true, users }
export interface AdminUserListResponse {
  success?: boolean;
  users: AdminUser[];
}

// POST/PUT /api/admin/users returns { success: true, user }
export interface AdminUserResponse {
  success?: boolean;
  user: AdminUser;
}

// === Permissions ===

export interface UserPermission {
  id: ID;
  userId: ID;
  permission: string;
}

export interface UserPermissionsResponse {
  success: boolean;
  permissions: string[];
}
