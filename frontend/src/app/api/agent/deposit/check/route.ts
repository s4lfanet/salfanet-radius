import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

/**
 * GET /api/agent/deposit/check
 * Check agent deposit status by token or orderId
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');
    const orderId = searchParams.get('orderId');

    if (!token && !orderId) {
      return NextResponse.json(
        { error: 'Token or orderId is required' },
        { status: 400 }
      );
    }

    let deposit;

    if (orderId) {
      // Find by deposit ID (order_id from Midtrans is the deposit UUID)
      deposit = await prisma.agentDeposit.findUnique({
        where: { id: orderId },
        include: { agent: true },
      });
    } else if (token) {
      // Find by payment token
      deposit = await prisma.agentDeposit.findFirst({
        where: { paymentToken: token },
        include: { agent: true },
      });
    }

    if (!deposit) {
      return NextResponse.json(
        { error: 'Deposit tidak ditemukan' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      deposit: {
        id: deposit.id,
        amount: deposit.amount,
        status: deposit.status,
        paidAt: deposit.paidAt,
        agentName: deposit.agent.name,
        newBalance: deposit.agent.balance,
      },
    });
  } catch (error) {
    console.error('Check agent deposit error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
