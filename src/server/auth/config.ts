import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { TOTP } from 'otpauth';
import { prisma } from '@/server/db/client';
import { logActivity } from '@/server/services/activity-log.service';

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV !== 'production' ? 'salfanet-radius-secret-change-in-production' : undefined);

if (!NEXTAUTH_SECRET) {
  throw new Error('NEXTAUTH_SECRET is required in production.');
}

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
        // ── Branch A: Two-Factor verification step ──────────────────────────
        if (credentials?.tfaToken && credentials?.tfaCode) {
          const pending = await prisma.adminTwoFactorPending.findUnique({
            where: { token: credentials.tfaToken },
          });

          if (!pending || pending.expiresAt < new Date()) {
            throw new Error('2FA session expired. Please log in again.');
          }

          const user = await prisma.adminUser.findUnique({
            where: { id: pending.userId },
          });

          if (!user || !user.twoFactorSecret) {
            throw new Error('Invalid 2FA session.');
          }

          // Verify TOTP code
          const totp = new TOTP({ secret: user.twoFactorSecret, algorithm: 'SHA1', digits: 6, period: 30 });
          const delta = totp.validate({ token: credentials.tfaCode.replace(/\s/g, ''), window: 1 });
          if (delta === null) {
            throw new Error('Invalid authenticator code. Please try again.');
          }

          // Consume the pending token
          await prisma.adminTwoFactorPending.delete({ where: { token: credentials.tfaToken } });

          // Update last login + log
          await prisma.adminUser.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
          try {
            await logActivity({
              userId: user.id, username: user.username, userRole: user.role,
              action: 'LOGIN', description: `User logged in (2FA): ${user.username} (${user.role})`,
              module: 'auth', status: 'success',
            });
          } catch {}

          return { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role };
        }

        // ── Branch B: Initial credential check ──────────────────────────────
        if (!credentials?.username || !credentials?.password) {
          throw new Error('Username and password are required');
        }

        // Find user
        const user = await prisma.adminUser.findUnique({
          where: { username: credentials.username },
        });

        if (!user) {
          throw new Error('Invalid username or password');
        }

        // Check if user is active
        if (!user.isActive) {
          throw new Error('Account is inactive');
        }

        // Verify password
        const isValid = await bcrypt.compare(credentials.password, user.password);

        if (!isValid) {
          throw new Error('Invalid username or password');
        }

        // ── 2FA gate: if enabled, block direct signIn() bypass ───────────────
        // The 2FA pending token is created by /api/admin/auth/pre-login.
        // If someone tries to call signIn() directly (bypassing pre-login),
        // we block the login by returning null.
        if (user.twoFactorEnabled && user.twoFactorSecret) {
          return null;
        }

        // Update last login
        await prisma.adminUser.update({
          where: { id: user.id },
          data: { lastLogin: new Date() },
        });

        // Log login activity
        try {
          await logActivity({
            userId: user.id,
            username: user.username,
            userRole: user.role,
            action: 'LOGIN',
            description: `User logged in: ${user.username} (${user.role})`,
            module: 'auth',
            status: 'success',
          });
        } catch (logError) {
          console.error('Activity log error:', logError);
        }

        // Return user data (without password)
        return {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Add user data to token on sign in
      if (user) {
        token.id = user.id;
        token.username = (user as any).username;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      // Add user data to session
      if (token && session.user) {
        (session.user as any).id = token.id;
        (session.user as any).username = token.username;
        (session.user as any).role = token.role;
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
    maxAge: 2 * 60 * 60, // 2 hours - session expires after 2 hours
    updateAge: 15 * 60, // Update session setiap 15 menit
  },
  secret: NEXTAUTH_SECRET,
};

/**
 * Verify authentication from request headers
 * Used for API route protection
 * 
 * @param request - NextRequest object from API route
 * @returns User data if authenticated, null otherwise
 */
export async function verifyAuth(request: NextRequest | Request) {
  try {
    // Convert Request to NextRequest if needed
    const nextRequest = request as NextRequest;
    
    // Method 1: Check NextAuth JWT token from cookies
    const token = await getToken({ 
      req: nextRequest,
      secret: NEXTAUTH_SECRET
    });
    
    if (token && token.id && token.username && token.role) {
      // Verify user still exists and is active
      const user = await prisma.adminUser.findUnique({
        where: { id: token.id as string },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      });
      
      if (!user || !user.isActive) {
        return null;
      }
      
      return {
        authenticated: true,
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
      };
    }
    
    // Method 2: Check Authorization header (for API token auth)
    const authHeader = request.headers.get('authorization');
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const apiToken = authHeader.substring(7);
      
      // Validate API token (if you implement API token system)
      // For now, this is a placeholder for future API token implementation
      // You can add API token validation here
      
      return null; // Not implemented yet
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
