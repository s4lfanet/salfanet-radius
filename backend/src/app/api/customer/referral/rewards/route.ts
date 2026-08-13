import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

// GET - Get my referral rewards history
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const session = await prisma.customerSession.findFirst({
      where: { token, verified: true, expiresAt: { gte: new Date() } },
    });
    if (!session) {
      return NextResponse.json({ success: false, error: 'Invalid or expired token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    const [rewards, total] = await Promise.all([
      prisma.referralReward.findMany({
        where: { referrerId: session.userId },
        include: {
          referred: {
            select: { id: true, name: true, createdAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.referralReward.count({ where: { referrerId: session.userId } }),
    ]);

    return NextResponse.json({
      success: true,
      rewards,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Get referral rewards error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
