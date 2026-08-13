import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { nanoid } from 'nanoid';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';

/**
 * Customer Login for Mobile App
 * POST /api/customer/login
 * Uses phone number or customer ID (consistent with web login)
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 attempts per 15 minutes per IP (brute force protection)
    const limited = await rateLimit(request, { max: 10, windowMs: 15 * 60 * 1000 });
    if (limited) {
      return NextResponse.json(
        { success: false, message: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' },
        { status: 429 }
      );
    }

    const { identifier } = await request.json();

    if (!identifier) {
      return NextResponse.json(
        { success: false, message: 'Nomor HP atau Customer ID harus diisi' },
        { status: 400 }
      );
    }

    console.log('[Mobile Login] Input:', identifier);

    // Clean phone number
    let cleanPhone = identifier.replace(/[^0-9]/g, '');
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
          { phone: identifier },
          { phone: cleanPhone },
          { phone: '0' + cleanPhone.substring(2) }, // 08xxx format
          { customerId: identifier }, // Support 8-digit customer ID
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
        autoRenewal: true,
        profile: {
          select: {
            id: true,
            name: true,
            downloadSpeed: true,
            uploadSpeed: true,
            price: true,
          },
        },
      },
    });

    console.log('[Mobile Login] User found:', user ? 'Yes' : 'No', user?.customerId);

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Nomor HP atau Customer ID tidak terdaftar' },
        { status: 404 }
      );
    }

    // Check if user is suspended or blocked
    if (user.status === 'blocked') {
      return NextResponse.json(
        { success: false, message: 'Akun Anda telah diblokir. Silakan hubungi customer service.' },
        { status: 403 }
      );
    }

    // Create session token
    const token = nanoid(64);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Use user's phone for session
    const userPhone = user.phone || cleanPhone;

    // Create or update customer session (delete old session if exists, create new one)
    await prisma.customerSession.deleteMany({
      where: { userId: user.id },
    });
    
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
      token,
      user: {
        id: user.id.toString(),
        username: user.username,
        name: user.name || user.username,
        email: user.email || '',
        phone: user.phone || '',
        status: user.status,
        profileName: user.profile?.name || 'Unknown',
        expiredAt: user.expiredAt?.toISOString() || null,
        balance: user.balance || 0,
      },
    });
  } catch (error: any) {
    console.error('Mobile customer login error:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan saat login' },
      { status: 500 }
    );
  }
}
