import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { SignJWT } from 'jose';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';
import { isSecureRequest } from '@/server/auth/portal-cookie';

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, RateLimitPresets.strict);
    if (limited) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    }

    const { phoneNumber, otpCode } = await req.json();

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Nomor HP wajib diisi' },
        { status: 400 }
      );
    }

    // Normalize phone number
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    const formattedPhone = normalizedPhone.startsWith('62') 
      ? normalizedPhone 
      : normalizedPhone.startsWith('0')
      ? '62' + normalizedPhone.substring(1)
      : '62' + normalizedPhone;

    // Find technician
    const technician = await prisma.technician.findUnique({
      where: { phoneNumber: formattedPhone },
    });

    if (!technician) {
      return NextResponse.json(
        { error: 'Nomor ini belum terdaftar sebagai teknisi.' },
        { status: 404 }
      );
    }

    if (!technician.isActive) {
      return NextResponse.json(
        { error: 'Akun teknisi ini dinonaktifkan.' },
        { status: 403 }
      );
    }

    // Every sign-in needs the WhatsApp code. Technician accounts have no
    // password, so the old "OTP off" option let anyone who knew the phone
    // number in with nothing else.
    if (!otpCode || typeof otpCode !== 'string') {
      return NextResponse.json(
        { error: 'Kode OTP wajib diisi' },
        { status: 400 }
      );
    }

    // Find valid OTP
    const otpToken = await prisma.technicianOtp.findFirst({
      where: {
        technicianId: technician.id,
        otpCode,
        isUsed: false,
        expiresAt: {
          gte: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!otpToken) {
      return NextResponse.json(
        { error: 'Kode OTP salah atau sudah kedaluwarsa.' },
        { status: 401 }
      );
    }

    // Mark OTP as used
    await prisma.technicianOtp.update({
      where: { id: otpToken.id },
      data: { isUsed: true },
    });

    // Update last login
    await prisma.technician.update({
      where: { id: technician.id },
      data: { lastLoginAt: new Date() },
    });

    // Create JWT token
    const secret = TECH_JWT_SECRET;

    const token = await new SignJWT({
      id: technician.id,
      phoneNumber: technician.phoneNumber,
      name: technician.name,
      role: 'technician',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    // Create response with token in cookie
    const response = NextResponse.json({
      success: true,
      message: 'Login successful',
      technician: {
        id: technician.id,
        name: technician.name,
        phoneNumber: technician.phoneNumber,
        email: technician.email,
      },
    });

    // Set HTTP-only cookie
    response.cookies.set('technician-token', token, {
      httpOnly: true,
      secure: isSecureRequest(req),
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Verify OTP error:', error);
    return NextResponse.json(
      { error: 'Failed to verify OTP' },
      { status: 500 }
    );
  }
}
