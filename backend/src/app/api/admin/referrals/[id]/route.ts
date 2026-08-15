import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

// POST - Manually credit a pending reward or expire it
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission('customers.edit');
    if (!authCheck.authorized) return authCheck.response;

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
      // Credit the reward: atomically transition PENDING → CREDITED, then increment balance
      // Uses updateMany with status condition to prevent double-credit under concurrent requests.
      const result = await prisma.$transaction(async (tx) => {
        // Atomic conditional update — only succeeds if status is still PENDING
        const claimResult = await tx.referralReward.updateMany({
          where: { id, status: 'PENDING' },
          data: { status: 'CREDITED', creditedAt: new Date() },
        });

        if (claimResult.count === 0) {
          return { alreadyProcessed: true as const };
        }

        // Increment referrer balance — only runs if we claimed the reward
        const updatedUser = await tx.pppoeUser.update({
          where: { id: reward.referrerId },
          data: { balance: { increment: reward.amount } },
        });

        return { alreadyProcessed: false as const, updatedUser };
      });

      if (result.alreadyProcessed) {
        return NextResponse.json({
          success: false,
          error: `Reward sudah ${reward.status}`,
        }, { status: 409 });
      }

      return NextResponse.json({
        success: true,
        message: `Reward Rp ${reward.amount.toLocaleString('id-ID')} berhasil dikreditkan ke ${reward.referrer.name}`,
      });
    } else {
      // Expire the reward — atomic conditional update
      const claimResult = await prisma.referralReward.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });

      if (claimResult.count === 0) {
        return NextResponse.json({
          success: false,
          error: `Reward sudah ${reward.status}`,
        }, { status: 409 });
      }

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
