import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/server/db/client';
import { logActivity } from '@/server/services/activity-log.service';
import { nowWIB } from '@/lib/timezone';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';

/**
 * Verify credentials and return user info for NextAuth authorize().
 *
 * This endpoint is called by the frontend NextAuth CredentialsProvider
 * so the frontend does not need direct database access.
 *
 * Flow:
 *   1. Frontend login page calls /api/admin/auth/pre-login (check credentials + 2FA)
 *   2. If no 2FA: frontend calls signIn() → NextAuth authorize() → calls this endpoint
 *   3. This endpoint verifies credentials again and returns user info
 *
 * Returns:
 *   200 { id, username, email, name, role }
 *   401 { error: 'Invalid username or password' }
 *   401 { error: 'Account is inactive' }
 *   400 { error: 'Username and password are required' }
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, RateLimitPresets.auth);
  if (limited) {
    return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
  }
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 },
      );
    }

    const user = await prisma.adminUser.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        password: true,
        isActive: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 },
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Account is inactive' },
        { status: 401 },
      );
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 },
      );
    }

    // If 2FA is enabled, reject — must go through verify-2fa endpoint
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      return NextResponse.json(
        { error: '2FA required', requires2FA: true },
        { status: 403 },
      );
    }

    // Update last login
    await prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLogin: nowWIB() },
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
        request: req,
      });
    } catch (logError) {
      console.error('[AUTH/VERIFY] Activity log error:', logError);
    }

    // Return user info (without password)
    return NextResponse.json({
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (error) {
    console.error('[AUTH/VERIFY] Error:', error);
    return NextResponse.json(
      { error: 'Authentication error' },
      { status: 500 },
    );
  }
}
