import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

/**
 * Get Customer Profile
 * GET /api/customer/profile
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find session by token
    const session = await prisma.customerSession.findFirst({
      where: {
        token,
        verified: true,
        expiresAt: { gte: new Date() },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Get fresh user data
    const user = await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
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

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id.toString(),
        customerId: user.customerId || '',
        username: user.username,
        name: user.name || user.username,
        email: user.email || '',
        phone: user.phone || '',
        status: user.status,
        profileName: user.profile?.name || 'Unknown',
        profileId: user.profile?.id || '',
        price: user.profile?.price || 0,
        downloadSpeed: user.profile?.downloadSpeed || 0,
        uploadSpeed: user.profile?.uploadSpeed || 0,
        expiredAt: user.expiredAt?.toISOString() || null,
        balance: user.balance || 0,
      },
    });
  } catch (error: any) {
    console.error('Get customer profile error:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Update Customer Profile — DISABLED
 * Customers are not permitted to edit their own profile data (name, phone, email).
 * Any changes must be requested through an admin.
 * PATCH /api/customer/profile
 */
export async function PATCH(_request: NextRequest) {
  return NextResponse.json(
    { success: false, message: 'Perubahan data profil hanya dapat dilakukan oleh admin. Silakan hubungi admin.' },
    { status: 403 }
  );
}
