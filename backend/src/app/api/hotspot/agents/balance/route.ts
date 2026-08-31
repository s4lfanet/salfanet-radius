import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { nowWIB } from '@/lib/timezone';
import { prisma } from '@/server/db/client';
import { createAgentNotificationAndPush } from '@/server/services/agent-notification.service';

/**
 * POST /api/hotspot/agents/balance
 * Manual adjustment of agent balance by admin
 */
export async function POST(request: NextRequest) {
  try {
    const authCheck = await requirePermission('hotspot.manage');
    if (!authCheck.authorized) return authCheck.response;

    const body = await request.json();
    const { agentId, amount, type, note } = body;

    // Validate input
    if (!agentId || !amount || !type) {
      return NextResponse.json(
        { error: 'Agent ID, amount, and type are required' },
        { status: 400 }
      );
    }

    if (!['add', 'subtract'].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be either "add" or "subtract"' },
        { status: 400 }
      );
    }

    // Get current agent
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    // ─── ATOMIC: balance adjustment + deposit record in $transaction ──────────
    // Use atomic increment/decrement instead of read-modify-write to prevent
    // lost update race condition under concurrent adjustments.
    const adjustAmount = type === 'add' ? amount : -amount;

    const result = await prisma.$transaction(async (tx) => {
      // Atomic conditional update — only decrements if balance stays >= 0
      let updatedAgent;
      if (type === 'subtract') {
        // For subtract: use updateMany with balance condition to prevent negative
        const claimResult = await tx.agent.updateMany({
          where: { id: agentId, balance: { gte: amount } },
          data: { balance: { decrement: amount } },
        });

        if (claimResult.count === 0) {
          return { insufficientBalance: true as const };
        }

        updatedAgent = await tx.agent.findUnique({ where: { id: agentId } });
      } else {
        // For add: simple increment
        updatedAgent = await tx.agent.update({
          where: { id: agentId },
          data: { balance: { increment: amount } },
        });
      }

      // Create manual deposit record for tracking
      await tx.agentDeposit.create({
        data: {
          id: crypto.randomUUID(),
          agentId: agentId,
          amount: adjustAmount,
          status: 'PAID',
          paymentGateway: 'manual',
          paymentToken: `MANUAL-${Date.now()}`,
          transactionId: `MANUAL-${type.toUpperCase()}-${Date.now()}`,
          paidAt: new Date(),
        },
      });

      return { insufficientBalance: false as const, updatedAgent: updatedAgent! };
    });

    if (result.insufficientBalance) {
      return NextResponse.json(
        { error: 'Insufficient balance. Cannot subtract more than current balance.' },
        { status: 400 }
      );
    }

    const updatedAgent = result.updatedAgent!;
    const newBalance = updatedAgent.balance;

    // Create notification for agent
    const notificationMessage = type === 'add' 
      ? `Saldo Anda ditambah Rp ${amount.toLocaleString('id-ID')} oleh admin. Saldo baru: Rp ${newBalance.toLocaleString('id-ID')}`
      : `Saldo Anda dikurangi Rp ${amount.toLocaleString('id-ID')} oleh admin. Saldo baru: Rp ${newBalance.toLocaleString('id-ID')}`;
    
    const notificationTitle = type === 'add' ? 'Saldo Ditambahkan' : 'Saldo Dikurangi';

    await createAgentNotificationAndPush(agentId, {
      type: type === 'add' ? 'balance_added' : 'balance_deducted',
      title: notificationTitle,
      message: note ? `${notificationMessage}\n\nCatatan: ${note}` : notificationMessage,
    });

    // Create notification for admin
    await prisma.notification.create({
      data: {
        id: Math.random().toString(36).substring(2, 15),
        type: 'agent_balance_adjustment',
        title: 'Penyesuaian Saldo Agent',
        message: `Saldo ${agent.name} ${type === 'add' ? 'ditambah' : 'dikurangi'} Rp ${amount.toLocaleString('id-ID')}. Saldo baru: Rp ${newBalance.toLocaleString('id-ID')}`,
        link: '/admin/hotspot/agent',
        createdAt: nowWIB(),
      },
    });

    return NextResponse.json({
      success: true,
      agent: {
        id: updatedAgent.id,
        name: updatedAgent.name,
        balance: updatedAgent.balance,
        adjustment: {
          type,
          amount,
          previousBalance: agent.balance,
          newBalance: updatedAgent.balance,
          note: note || null,
        },
      },
    });
  } catch (error) {
    console.error('Adjust agent balance error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
