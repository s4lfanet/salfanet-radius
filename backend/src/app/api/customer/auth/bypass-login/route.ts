import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { nanoid } from 'nanoid';

/**
 * Bypass login endpoint
 * Allows customer login when OTP is disabled or WhatsApp service is unavailable
 * Only works if OTP is disabled in settings
 */
export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Check if OTP is disabled - only allow bypass if OTP is disabled
    const settings = await prisma.whatsapp_reminder_settings.findFirst();
    const otpEnabled = settings?.otpEnabled ?? false;

    if (otpEnabled) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'OTP is required. Please contact admin if WhatsApp service is unavailable.' 
        },
        { status: 403 }
      );
    }

    // Clean phone number
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.substring(1);
    }
    if (!cleanPhone.startsWith('62') && cleanPhone.length > 8) {
      cleanPhone = '62' + cleanPhone;
    }

    // Find user by phone
    const user = await prisma.pppoeUser.findFirst({
      where: {
        OR: [
          { phone: phone },
          { phone: cleanPhone },
          { phone: '0' + cleanPhone.substring(2) }, // 08xxx format
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
        balance: true,
        subscriptionType: true,
        profile: {
          select: {
            name: true,
            downloadSpeed: true,
            uploadSpeed: true,
            price: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Phone number not registered' },
        { status: 404 }
      );
    }

    // Create verified session without OTP
    const token = nanoid(64);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await prisma.customerSession.create({
      data: {
        userId: user.id,
        phone: cleanPhone,
        token,
        expiresAt,
        verified: true,
        otpCode: null,
        otpExpiry: null,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        username: user.username,
        module: 'customer_auth',
        action: 'bypass_login',
        description: `Customer ${user.username} logged in without OTP (OTP disabled)`,
        metadata: JSON.stringify({ phone: cleanPhone }),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    }).catch(err => console.error('Activity log error:', err));

    return NextResponse.json({
      success: true,
      token,
      user,
    });
  } catch (error: any) {
    console.error('Bypass login error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Login failed' },
      { status: 500 }
    );
  }
}
