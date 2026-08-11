import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { nanoid } from 'nanoid';

export async function POST(request: NextRequest) {
  try {
    const { phone, identifier } = await request.json();
    
    // Accept either phone or identifier
    const input = identifier || phone;
    console.log('[Customer Login] Input:', input);

    if (!input) {
      return NextResponse.json(
        { success: false, error: 'Phone number or customer ID is required' },
        { status: 400 }
      );
    }

    // Check if OTP is enabled
    const settings = await prisma.whatsapp_reminder_settings.findFirst();
    const otpEnabled = settings?.otpEnabled ?? false;

    // Clean phone number
    let cleanPhone = input.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.substring(1);
    }
    if (!cleanPhone.startsWith('62') && cleanPhone.length > 8) {
      cleanPhone = '62' + cleanPhone;
    }

    // Find user by phone or customerId (8-digit ID)
    const user = await prisma.pppoeUser.findFirst({
      where: {
        OR: [
          { phone: input },
          { phone: cleanPhone },
          { phone: '0' + cleanPhone.substring(2) }, // 08xxx format
          { customerId: input }, // Support 8-digit customer ID
        ],
      },
      select: {
        id: true,
        username: true,
        customerId: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        expiredAt: true,
        profile: {
          select: {
            name: true,
            downloadSpeed: true,
            uploadSpeed: true,
          },
        },
      },
    });

    console.log('[Customer Login] User found:', user ? 'Yes' : 'No', user?.phone);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Phone number or customer ID not registered' },
        { status: 404 }
      );
    }

    // Use user's phone for session
    const userPhone = user.phone || cleanPhone;
    console.log('[Customer Login] OTP Enabled:', otpEnabled, 'Phone:', userPhone);

    // If OTP is disabled, create session and return token
    if (!otpEnabled) {
      const token = nanoid(64);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await prisma.customerSession.create({
        data: {
          userId: user.id,
          phone: userPhone,
          token,
          expiresAt,
          verified: true,
          otpCode: null,
          otpExpiry: null,
        },
      });

      return NextResponse.json({
        success: true,
        otpEnabled: false,
        requireOTP: false,
        user,
        token,
      });
    }

    // If OTP is enabled, just return that OTP is required
    return NextResponse.json({
      success: true,
      otpEnabled: true,
      requireOTP: true,
      user: {
        phone: userPhone,
      },
      token: null,
    });
  } catch (error: any) {
    console.error('Login check error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
