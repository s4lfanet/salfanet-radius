import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/server/db/client';

/**
 * Pre-login check: validates credentials and checks if 2FA is required.
 * Called BEFORE signIn() so we can redirect to the 2FA page if needed,
 * avoiding the NextAuth v4 limitation where custom authorize() errors are
 * sanitized to "CredentialsSignin" on the client.
 */
export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const user = await prisma.adminUser.findUnique({
      where: { username },
      select: {
        id: true,
        password: true,
        isActive: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    // Credentials are valid — check if 2FA is required
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const token = crypto.randomUUID().replace(/-/g, '');
      await prisma.adminTwoFactorPending.create({
        data: {
          token,
          userId: user.id,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        },
      });

      return NextResponse.json({ requires2FA: true, token });
    }

    // No 2FA — let the client proceed with normal signIn()
    return NextResponse.json({ requires2FA: false });
  } catch (error) {
    console.error('[PRE-LOGIN] Error:', error);
    return NextResponse.json({ error: 'Authentication error' }, { status: 500 });
  }
}
