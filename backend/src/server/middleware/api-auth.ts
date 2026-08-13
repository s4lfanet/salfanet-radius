import 'server-only'
import { getServerSession, Session } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { hasPermission, isSuperAdmin } from '@/server/auth/permissions';
import { NextResponse } from 'next/server';

// Type definitions for auth check results
type AuthorizedResult = {
  authorized: true;
  session: Session;
  userId: string;
  response?: never;
};

type UnauthorizedResult = {
  authorized: false;
  response: NextResponse;
  session?: never;
  userId?: never;
};

export type AuthCheckResult = AuthorizedResult | UnauthorizedResult;

/**
 * Check if user is authenticated
 */
export async function checkAuth(): Promise<AuthCheckResult> {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  return {
    authorized: true,
    session,
    userId: (session.user as any).id,
  };
}

// Permission check result types
type PermissionGrantedResult = {
  authorized: true;
  response?: never;
};

type PermissionDeniedResult = {
  authorized: false;
  response: NextResponse;
};

type PermissionCheckResult = PermissionGrantedResult | PermissionDeniedResult;

/**
 * Check if user has required permission
 * Super Admin bypasses all permission checks
 */
export async function checkPermission(userId: string, permissionKey: string): Promise<PermissionCheckResult> {
  // Check if Super Admin (has all permissions)
  const isSuper = await isSuperAdmin(userId);
  if (isSuper) {
    return { authorized: true };
  }

  // Check specific permission
  const hasAccess = await hasPermission(userId, permissionKey);
  
  if (!hasAccess) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      ),
    };
  }

  return { authorized: true };
}

/**
 * Combined check: Auth + Permission
 * Usage in API routes:
 * 
 * const authCheck = await requirePermission('users.create');
 * if (!authCheck.authorized) return authCheck.response;
 */
export async function requirePermission(permissionKey: string): Promise<AuthCheckResult> {
  // First check authentication
  const authCheck = await checkAuth();
  if (!authCheck.authorized) {
    return authCheck;
  }

  // Then check permission
  const permCheck = await checkPermission(authCheck.userId, permissionKey);
  if (!permCheck.authorized) {
    return {
      authorized: false,
      response: permCheck.response,
    };
  }

  return {
    authorized: true,
    session: authCheck.session,
    userId: authCheck.userId,
  };
}
