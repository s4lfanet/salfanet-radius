import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { SignJWT } from 'jose';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, RateLimitPresets.strict);
    if (limited) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    }

    const { phoneNumber, otpCode, skipOtp } = await req.json();

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    if (!skipOtp && !otpCode) {
      return NextResponse.json(
        { error: 'OTP code is required' },
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
        { error: 'Technician not found' },
        { status: 404 }
      );
    }

    if (!technician.isActive) {
      return NextResponse.json(
        { error: 'Technician account is inactive' },
        { status: 403 }
      );
    }

    // Skip OTP verification if not required
    if (!skipOtp) {
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
          { error: 'Invalid or expired OTP code' },
          { status: 401 }
        );
      }

      // Mark OTP as used
      await prisma.technicianOtp.update({
        where: { id: otpToken.id },
        data: { isUsed: true },
      });
    }

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
      token,
    });

    // Set HTTP-only cookie
    response.cookies.set('technician-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
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
