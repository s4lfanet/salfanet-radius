import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { nowWIB } from '@/lib/timezone';
import { requirePermission } from '@/server/middleware/api-auth';
import type { Prisma } from '@prisma/client';

/**
 * GET /api/admin/agent-deposits
 * List agent deposits. Intended for admin verification page.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('invoices.approve');
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const status = (searchParams.get('status') || 'ALL').toUpperCase();

    const where: Prisma.agentDepositWhereInput = {
      paymentGateway: 'manual',
    };

    if (status !== 'ALL') {
      where.status = status;
    }

    const deposits = await prisma.agentDeposit.findMany({
      where,
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return NextResponse.json({
      success: true,
      deposits,
    });
  } catch (error) {
    console.error('Get admin agent deposits error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/agent-deposits
 * Approve or reject a pending manual agent deposit request.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requirePermission('invoices.approve');
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { depositId, action } = body as { depositId?: string; action?: 'approve' | 'reject' };

    if (!depositId || !action) {
      return NextResponse.json({ error: 'depositId and action are required' }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const deposit = await prisma.agentDeposit.findUnique({
      where: { id: depositId },
      include: { agent: true },
    });

    if (!deposit || deposit.paymentGateway !== 'manual') {
      return NextResponse.json({ error: 'Deposit manual tidak ditemukan' }, { status: 404 });
    }

    if (deposit.status !== 'PENDING') {
      return NextResponse.json({ error: 'Permintaan ini sudah diproses' }, { status: 400 });
    }

    const targetBankLabel = deposit.targetBankName || 'manual';

    if (action === 'approve') {
      // ─── ATOMIC: updateMany with status condition + balance increment ─────────
      // Prevents double-approval under concurrent requests.
      const result = await prisma.$transaction(async (tx) => {
        // Atomic conditional update — only succeeds if status is still PENDING
        const claimResult = await tx.agentDeposit.updateMany({
          where: { id: depositId, status: 'PENDING' },
          data: {
            status: 'PAID',
            paidAt: nowWIB(),
          },
        });

        if (claimResult.count === 0) {
          return { alreadyProcessed: true as const };
        }

        // Increment agent balance — only if we claimed the deposit
        const updatedAgent = await tx.agent.update({
          where: { id: deposit.agentId },
          data: {
            balance: {
              increment: deposit.amount,
            },
          },
        });

        await tx.agentNotification.create({
          data: {
            id: Math.random().toString(36).substring(2, 15),
            agentId: deposit.agentId,
            type: 'deposit_success',
            title: 'Deposit Disetujui',
            message: `Top up manual Rp ${deposit.amount.toLocaleString('id-ID')} disetujui. Saldo baru: Rp ${updatedAgent.balance.toLocaleString('id-ID')}`,
            link: null,
          },
        });

        await tx.notification.create({
          data: {
            id: Math.random().toString(36).substring(2, 15),
            type: 'agent_deposit_approved',
            title: 'Deposit Agent Disetujui',
            message: `Permintaan deposit ${deposit.agent.name} Rp ${deposit.amount.toLocaleString('id-ID')} (${targetBankLabel}) telah disetujui`,
            link: '/admin/hotspot/agent/deposits',
            createdAt: nowWIB(),
          },
        });

        return { alreadyProcessed: false as const, updatedAgent };
      });

      if (result.alreadyProcessed) {
        return NextResponse.json(
          { error: 'Permintaan ini sudah diproses' },
          { status: 409 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Deposit berhasil disetujui',
        agent: { id: result.updatedAgent!.id, balance: result.updatedAgent!.balance },
      });
    }

    // ─── REJECT: atomic conditional update ─────────────────────────────────────
    const claimResult = await prisma.agentDeposit.updateMany({
      where: { id: depositId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    if (claimResult.count === 0) {
      return NextResponse.json(
        { error: 'Permintaan ini sudah diproses' },
        { status: 409 }
      );
    }

    await prisma.agentNotification.create({
      data: {
        id: Math.random().toString(36).substring(2, 15),
        agentId: deposit.agentId,
        type: 'deposit_rejected',
        title: 'Deposit Ditolak',
        message: `Permintaan top up manual Rp ${deposit.amount.toLocaleString('id-ID')} ditolak oleh admin`,
        link: null,
      },
    });

    await prisma.notification.create({
      data: {
        id: Math.random().toString(36).substring(2, 15),
        type: 'agent_deposit_rejected',
        title: 'Deposit Agent Ditolak',
        message: `Permintaan deposit ${deposit.agent.name} Rp ${deposit.amount.toLocaleString('id-ID')} (${targetBankLabel}) ditolak`,
        link: '/admin/hotspot/agent/deposits',
        createdAt: nowWIB(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Deposit ditolak',
      deposit: { id: depositId, status: 'CANCELLED' },
    });
  } catch (error) {
    console.error('Update admin agent deposit status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
