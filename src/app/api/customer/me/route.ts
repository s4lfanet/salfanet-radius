import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { cacheGetOrSet, RedisKeys } from '@/server/cache/redis';

// Profile data cached 60 detik per user (jarang berubah)
const ME_CACHE_TTL = 60;

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
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
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Get user data — cached per userId 60 detik (profile jarang berubah)
    const user = await cacheGetOrSet(
      RedisKeys.customerMe(session.userId),
      ME_CACHE_TTL,
      () => prisma.pppoeUser.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          username: true,
          name: true,
          phone: true,
          email: true,
          status: true,
          expiredAt: true,
          balance: true,
          autoRenewal: true,
          profileId: true,
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
      })
    );

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error: any) {
    console.error('Get customer data error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
