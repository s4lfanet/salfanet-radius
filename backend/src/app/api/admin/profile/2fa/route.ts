import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { TOTP, Secret } from 'otpauth';
import QRCode from 'qrcode';
import { prisma } from '@/server/db/client';
import bcrypt from 'bcryptjs';

// GET - Get 2FA status + generate setup QR (if not enabled)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).id;
  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { searchParams } = new URL(request.url);
  if (searchParams.get('action') === 'setup') {
    // Generate a fresh TOTP secret
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: 'SALFANET RADIUS',
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });
    const otpauthUrl = totp.toString();
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 256, margin: 2 });

    return NextResponse.json({
      enabled: user.twoFactorEnabled,
      secret: secret.base32, // Store this to enable later
      qrCode: qrDataUrl,
      otpauthUrl,
    });
  }

  return NextResponse.json({ enabled: user.twoFactorEnabled });
}

// POST - Enable 2FA (verify code against the provided secret, then save)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).id;
  const { secret, code } = await request.json();

  if (!secret || !code) {
    return NextResponse.json({ error: 'Secret and code are required' }, { status: 400 });
  }

  // Verify the TOTP code against the provided secret
  const totp = new TOTP({ secret, algorithm: 'SHA1', digits: 6, period: 30 });
  const delta = totp.validate({ token: code.replace(/\s/g, ''), window: 1 });

  if (delta === null) {
    return NextResponse.json({ error: 'Invalid code. Please scan the QR code again and retry.' }, { status: 400 });
  }

  // Save the secret and enable 2FA
  await prisma.adminUser.update({
    where: { id: userId },
    data: { twoFactorSecret: secret, twoFactorEnabled: true },
  });

  return NextResponse.json({ success: true, message: '2FA has been enabled for your account.' });
}

// DELETE - Disable 2FA (requires current password + TOTP code)
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).id;
  const { password, code } = await request.json();

  if (!password || !code) {
    return NextResponse.json({ error: 'Password and authenticator code are required' }, { status: 400 });
  }

  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Verify password
  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 400 });
  }

  // Verify TOTP code
  if (!user.twoFactorSecret) {
    return NextResponse.json({ error: '2FA is not enabled' }, { status: 400 });
  }
  const totp = new TOTP({ secret: user.twoFactorSecret, algorithm: 'SHA1', digits: 6, period: 30 });
  const delta = totp.validate({ token: code.replace(/\s/g, ''), window: 1 });
  if (delta === null) {
    return NextResponse.json({ error: 'Invalid authenticator code' }, { status: 400 });
  }

  // Disable 2FA
  await prisma.adminUser.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });

  return NextResponse.json({ success: true, message: '2FA has been disabled.' });
}
