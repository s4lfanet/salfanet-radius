import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { TOTP } from 'otpauth';
import { prisma } from '@/server/db/client';
import { logActivity } from '@/server/services/activity-log.service';
import { nowWIB } from '@/lib/timezone';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';

/**
 * Verify 2FA code and return user info for NextAuth authorize().
 *
 * This endpoint is called by the frontend NextAuth CredentialsProvider
 * when 2FA is required, so the frontend does not need direct database
 * access or TOTP verification logic.
 *
 * Flow:
 *   1. Frontend login page calls /api/admin/auth/pre-login (check credentials + 2FA)
 *   2. If 2FA required: frontend prompts for 2FA code
 *   3. Frontend calls signIn() with tfaToken + tfaCode
 *      → NextAuth authorize() → calls this endpoint
 *
 * Returns:
 *   200 { id, username, email, name, role }
 *   401 { error: '2FA session expired...' }
 *   401 { error: 'Invalid authenticator code...' }
 *   400 { error: 'tfaToken and tfaCode are required' }
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, RateLimitPresets.auth);
  if (limited) {
    return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
  }
  try {
    const { tfaToken, tfaCode } = await req.json();

    if (!tfaToken || !tfaCode) {
      return NextResponse.json(
        { error: 'tfaToken and tfaCode are required' },
        { status: 400 },
      );
    }

    const pending = await prisma.adminTwoFactorPending.findUnique({
      where: { token: tfaToken },
    });

    if (!pending || pending.expiresAt < new Date()) {
      return NextResponse.json(
        { error: '2FA session expired. Please log in again.' },
        { status: 401 },
      );
    }

    const user = await prisma.adminUser.findUnique({
      where: { id: pending.userId },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        twoFactorSecret: true,
      },
    });

    if (!user || !user.twoFactorSecret) {
      return NextResponse.json(
        { error: 'Invalid 2FA session.' },
        { status: 401 },
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Account is inactive' },
        { status: 401 },
      );
    }

    // Verify TOTP code
    const totp = new TOTP({
      secret: user.twoFactorSecret,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
    const delta = totp.validate({
      token: tfaCode.replace(/\s/g, ''),
      window: 1,
    });
    if (delta === null) {
      return NextResponse.json(
        { error: 'Invalid authenticator code. Please try again.' },
        { status: 401 },
      );
    }

    // Consume the pending token
    await prisma.adminTwoFactorPending.delete({
      where: { token: tfaToken },
    });

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
        description: `User logged in (2FA): ${user.username} (${user.role})`,
        module: 'auth',
        status: 'success',
        request: req,
      });
    } catch (logError) {
      console.error('[AUTH/VERIFY-2FA] Activity log error:', logError);
    }

    // Return user info
    return NextResponse.json({
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (error) {
    console.error('[AUTH/VERIFY-2FA] Error:', error);
    return NextResponse.json(
      { error: 'Authentication error' },
      { status: 500 },
    );
  }
}
