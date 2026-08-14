import 'server-only'
import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV !== 'production' ? 'salfanet-radius-secret-change-in-production' : undefined);

if (!NEXTAUTH_SECRET) {
  throw new Error('NEXTAUTH_SECRET is required in production.');
}

/**
 * Backend API URL for auth verification.
 * Frontend calls backend instead of accessing database directly.
 */
const BACKEND_URL = process.env.SERVER_API_URL || process.env.BACKEND_URL || 'http://localhost:3001';

/**
 * Typed HTTP error — thrown by requireAuth/requireAdmin/requireStaff/requireRole.
 * Catch blocks can inspect `.status` to return the correct HTTP status code
 * instead of a generic 500.
 *
 * Usage in route handler:
 *   } catch (error) {
 *     return handleRouteError(error);
 *   }
 */
export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Drop-in catch-block helper.
 * Returns 401/403/500 based on the error type.
 */
export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const msg = error instanceof Error ? error.message : 'Internal server error';
  console.error('[Route Error]', error);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
        tfaToken: { label: '2FA Token', type: 'text' },
        tfaCode: { label: '2FA Code', type: 'text' },
      },
      async authorize(credentials) {
        // -- Branch A: Two-Factor verification step --------------------------
        if (credentials?.tfaToken && credentials?.tfaCode) {
          const res = await fetch(`${BACKEND_URL}/api/admin/auth/verify-2fa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tfaToken: credentials.tfaToken,
              tfaCode: credentials.tfaCode,
            }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({ error: '2FA verification failed' }));
            throw new Error(data.error || '2FA verification failed');
          }

          return res.json();
        }

        // -- Branch B: Initial credential check ------------------------------
        if (!credentials?.username || !credentials?.password) {
          throw new Error('Username and password are required');
        }

        const res = await fetch(`${BACKEND_URL}/api/admin/auth/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: credentials.username,
            password: credentials.password,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Invalid username or password' }));
          throw new Error(data.error || 'Invalid username or password');
        }

        return res.json();
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Add user data to token on sign in
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      // Add user data to session
      if (token && session.user) {
        session.user.id = token.id;
        session.user.username = token.username;
        session.user.role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: '/admin/login',
    error: '/admin/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 60 * 60, // Update session every hour
  },
  secret: NEXTAUTH_SECRET,
};

/**
 * Verify authentication from request headers.
 * Used for API route protection.
 *
 * Note: This function is kept for backward compatibility but is NOT
 * used by any frontend route other than the auth routes themselves.
 * Backend API routes have their own auth verification.
 *
 * @param request - NextRequest object from API route
 * @returns User data if authenticated, null otherwise
 */
export async function verifyAuth(request: NextRequest | Request) {
  try {
    const nextRequest = request as NextRequest;

    // Check NextAuth JWT token from cookies
    const token = await getToken({
      req: nextRequest,
      secret: NEXTAUTH_SECRET
    });

    if (token && token.id && token.username && token.role) {
      return {
        authenticated: true,
        id: token.id as string,
        username: token.username as string,
        email: token.email as string,
        name: token.name as string,
        role: token.role as string,
      };
    }

    return null;
  } catch (error) {
    console.error('[AUTH] Verification error:', error);
    return null;
  }
}

/**
 * Verify and require authentication
 * Throws error if not authenticated
 */
export async function requireAuth(request: NextRequest | Request) {
  const user = await verifyAuth(request);

  if (!user) {
    throw new HttpError(401, 'Unauthorized');
  }

  return user;
}

/**
 * Verify and require specific role
 * Throws error if not authenticated or insufficient role
 */
export async function requireRole(request: NextRequest | Request, allowedRoles: string[]) {
  const user = await requireAuth(request);

  if (!allowedRoles.includes(user.role)) {
    throw new HttpError(403, 'Forbidden: Insufficient permissions');
  }

  return user;
}

/**
 * Check if user has admin privileges
 * SUPER_ADMIN has full access
 */
export async function requireAdmin(request: NextRequest | Request) {
  const user = await requireAuth(request);

  if (user.role !== 'SUPER_ADMIN') {
    throw new HttpError(403, 'Forbidden: Admin access required');
  }

  return user;
}

/**
 * Check if user has staff-level privileges or higher
 * Includes: SUPER_ADMIN, FINANCE, CUSTOMER_SERVICE, TECHNICIAN, MARKETING
 */
export async function requireStaff(request: NextRequest | Request) {
  const user = await requireAuth(request);

  const staffRoles = ['SUPER_ADMIN', 'FINANCE', 'CUSTOMER_SERVICE', 'TECHNICIAN', 'MARKETING'];

  if (!staffRoles.includes(user.role)) {
    throw new HttpError(403, 'Forbidden: Staff access required');
  }

  return user;
}
