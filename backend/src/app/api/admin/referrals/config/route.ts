import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// GET - Get referral settings
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const company = await prisma.company.findFirst({
      select: {
        referralEnabled: true,
        referralRewardAmount: true,
        referralRewardType: true,
        referralRewardBoth: true,
        referralReferredAmount: true,
      },
    });

    if (!company) {
      return NextResponse.json({ success: false, error: 'Company settings not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      config: {
        enabled: company.referralEnabled ?? false,
        rewardAmount: company.referralRewardAmount ?? 10000,
        rewardType: company.referralRewardType ?? 'FIRST_PAYMENT',
        rewardBoth: company.referralRewardBoth ?? false,
        referredAmount: company.referralReferredAmount ?? 0,
      },
    });
  } catch (error: any) {
    console.error('Get referral config error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT - Update referral settings
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { enabled, rewardAmount, rewardType, rewardBoth, referredAmount } = body;

    // Validate
    if (rewardAmount !== undefined && (typeof rewardAmount !== 'number' || rewardAmount < 0)) {
      return NextResponse.json({ success: false, error: 'Jumlah reward tidak valid' }, { status: 400 });
    }
    if (rewardType && !['REGISTRATION', 'FIRST_PAYMENT'].includes(rewardType)) {
      return NextResponse.json({ success: false, error: 'Tipe reward tidak valid' }, { status: 400 });
    }

    const existingCompany = await prisma.company.findFirst();
    if (!existingCompany) {
      return NextResponse.json({ success: false, error: 'Company settings not found' }, { status: 404 });
    }

    const updated = await prisma.company.update({
      where: { id: existingCompany.id },
      data: {
        referralEnabled: enabled ?? existingCompany.referralEnabled,
        referralRewardAmount: rewardAmount ?? existingCompany.referralRewardAmount,
        referralRewardType: rewardType ?? existingCompany.referralRewardType,
        referralRewardBoth: rewardBoth ?? existingCompany.referralRewardBoth,
        referralReferredAmount: referredAmount ?? existingCompany.referralReferredAmount,
      },
      select: {
        referralEnabled: true,
        referralRewardAmount: true,
        referralRewardType: true,
        referralRewardBoth: true,
        referralReferredAmount: true,
      },
    });

    return NextResponse.json({
      success: true,
      config: {
        enabled: updated.referralEnabled,
        rewardAmount: updated.referralRewardAmount,
        rewardType: updated.referralRewardType,
        rewardBoth: updated.referralRewardBoth,
        referredAmount: updated.referralReferredAmount,
      },
    });
  } catch (error: any) {
    console.error('Update referral config error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
