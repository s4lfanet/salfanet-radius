import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// POST - Manually credit a pending reward or expire it
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action } = body; // 'credit' or 'expire'

    if (!['credit', 'expire'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Action tidak valid (credit/expire)' }, { status: 400 });
    }

    const reward = await prisma.referralReward.findUnique({
      where: { id },
      include: {
        referrer: { select: { id: true, name: true, balance: true } },
        referred: { select: { id: true, name: true } },
      },
    });

    if (!reward) {
      return NextResponse.json({ success: false, error: 'Reward tidak ditemukan' }, { status: 404 });
    }

    if (reward.status !== 'PENDING') {
      return NextResponse.json({ success: false, error: `Reward sudah ${reward.status}` }, { status: 400 });
    }

    if (action === 'credit') {
      // Credit the reward: update status + add balance to referrer
      await prisma.$transaction([
        prisma.referralReward.update({
          where: { id },
          data: { status: 'CREDITED', creditedAt: new Date() },
        }),
        prisma.pppoeUser.update({
          where: { id: reward.referrerId },
          data: { balance: { increment: reward.amount } },
        }),
      ]);

      return NextResponse.json({
        success: true,
        message: `Reward Rp ${reward.amount.toLocaleString('id-ID')} berhasil dikreditkan ke ${reward.referrer.name}`,
      });
    } else {
      // Expire the reward
      await prisma.referralReward.update({
        where: { id },
        data: { status: 'EXPIRED' },
      });

      return NextResponse.json({
        success: true,
        message: `Reward berhasil di-expire`,
      });
    }
  } catch (error: any) {
    console.error('Process referral reward error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
