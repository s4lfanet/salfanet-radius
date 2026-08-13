import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// GET - Get all referrals with stats (admin)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || ''; // PENDING, CREDITED, EXPIRED
    const skip = (page - 1) * limit;

    // Build where clause for rewards
    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { referrer: { name: { contains: search } } },
        { referrer: { username: { contains: search } } },
        { referred: { name: { contains: search } } },
        { referred: { username: { contains: search } } },
      ];
    }

    const [rewards, total, stats] = await Promise.all([
      prisma.referralReward.findMany({
        where,
        include: {
          referrer: {
            select: { id: true, name: true, username: true, phone: true, referralCode: true },
          },
          referred: {
            select: { id: true, name: true, username: true, phone: true, createdAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.referralReward.count({ where }),
      // Aggregate stats
      Promise.all([
        prisma.referralReward.count(),
        prisma.referralReward.count({ where: { status: 'PENDING' } }),
        prisma.referralReward.count({ where: { status: 'CREDITED' } }),
        prisma.referralReward.aggregate({
          where: { status: 'CREDITED' },
          _sum: { amount: true },
        }),
        prisma.pppoeUser.count({ where: { referralCode: { not: null } } }),
        prisma.pppoeUser.count({ where: { referredById: { not: null } } }),
      ]),
    ]);

    const [totalRewards, pendingRewards, creditedRewards, creditedSum, usersWithCode, referredUsers] = stats;

    return NextResponse.json({
      success: true,
      rewards,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        totalRewards,
        pendingRewards,
        creditedRewards,
        totalCredited: creditedSum._sum.amount || 0,
        usersWithCode,
        referredUsers,
      },
    });
  } catch (error: any) {
    console.error('Get admin referrals error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
