import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

// Generate a unique 8-char alphanumeric referral code
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// GET - Get my referral info (code + stats)
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

    // Get user with referral data
    const user = await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        referralCode: true,
        referredById: true,
        referredBy: {
          select: { id: true, name: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Get referral settings
    const company = await prisma.company.findFirst({
      select: {
        referralEnabled: true,
        referralRewardAmount: true,
        referralRewardType: true,
        referralRewardBoth: true,
        referralReferredAmount: true,
        baseUrl: true,
        adminPhone: true,
      },
    });

    // Get referral stats
    const [totalReferred, totalRewards, pendingRewards] = await Promise.all([
      prisma.pppoeUser.count({ where: { referredById: user.id } }),
      prisma.referralReward.aggregate({
        where: { referrerId: user.id, status: 'CREDITED' },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.referralReward.aggregate({
        where: { referrerId: user.id, status: 'PENDING' },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    // Get recent referrals
    const recentReferrals = await prisma.pppoeUser.findMany({
      where: { referredById: user.id },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      success: true,
      referral: {
        code: user.referralCode,
        referredBy: user.referredBy,
        shareUrl: user.referralCode
          ? `${company?.baseUrl || 'http://localhost:3000'}/daftar?ref=${user.referralCode}`
          : null,
        stats: {
          totalReferred,
          totalRewardsCredited: totalRewards._sum.amount || 0,
          totalRewardsCount: totalRewards._count || 0,
          pendingRewardsAmount: pendingRewards._sum.amount || 0,
          pendingRewardsCount: pendingRewards._count || 0,
        },
        recentReferrals,
      },
      config: {
        enabled: company?.referralEnabled ?? false,
        rewardAmount: company?.referralRewardAmount ?? 10000,
        rewardType: company?.referralRewardType ?? 'FIRST_PAYMENT',
        rewardBoth: company?.referralRewardBoth ?? false,
        referredAmount: company?.referralReferredAmount ?? 0,
        adminPhone: company?.adminPhone ?? null,
      },
    });
  } catch (error: any) {
    console.error('Get referral info error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST - Generate referral code (if not exists)
export async function POST(request: NextRequest) {
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

    // Check if referral system is enabled
    const company = await prisma.company.findFirst({
      select: { referralEnabled: true, baseUrl: true },
    });
    if (!company?.referralEnabled) {
      return NextResponse.json({ success: false, error: 'Sistem referral belum diaktifkan' }, { status: 400 });
    }

    const user = await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
      select: { id: true, referralCode: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Already has code
    if (user.referralCode) {
      return NextResponse.json({
        success: true,
        referralCode: user.referralCode,
        shareUrl: `${company.baseUrl || 'http://localhost:3000'}/daftar?ref=${user.referralCode}`,
      });
    }

    // Generate unique code with retry
    let code = '';
    let attempts = 0;
    while (attempts < 10) {
      code = generateReferralCode();
      const existing = await prisma.pppoeUser.findUnique({ where: { referralCode: code } });
      if (!existing) break;
      attempts++;
    }

    if (!code) {
      return NextResponse.json({ success: false, error: 'Gagal generate kode referral' }, { status: 500 });
    }

    // Update user with referral code
    const updated = await prisma.pppoeUser.update({
      where: { id: session.userId },
      data: { referralCode: code },
      select: { referralCode: true },
    });

    return NextResponse.json({
      success: true,
      referralCode: updated.referralCode,
      shareUrl: `${company.baseUrl || 'http://localhost:3000'}/daftar?ref=${updated.referralCode}`,
    });
  } catch (error: any) {
    console.error('Generate referral code error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
