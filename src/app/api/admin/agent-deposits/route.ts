import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { nowWIB } from '@/lib/timezone';

/**
 * GET /api/admin/agent-deposits
 * List agent deposits. Intended for admin verification page.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = (searchParams.get('status') || 'ALL').toUpperCase();

    const where: any = {
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
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    if (action === 'approve') {
      const result = await prisma.$transaction(async (tx) => {
        const updatedDeposit = await tx.agentDeposit.update({
          where: { id: depositId },
          data: {
            status: 'PAID',
            paidAt: nowWIB(),
          },
        });

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
            message: `Permintaan deposit ${deposit.agent.name} sebesar Rp ${deposit.amount.toLocaleString('id-ID')} telah disetujui`,
            link: '/admin/hotspot/agent/deposits',
            createdAt: nowWIB(),
          },
        });

        return { updatedDeposit, updatedAgent };
      });

      return NextResponse.json({
        success: true,
        message: 'Deposit berhasil disetujui',
        deposit: result.updatedDeposit,
        agent: { id: result.updatedAgent.id, balance: result.updatedAgent.balance },
      });
    }

    const updatedDeposit = await prisma.agentDeposit.update({
      where: { id: depositId },
      data: {
        status: 'CANCELLED',
      },
    });

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
        message: `Permintaan deposit ${deposit.agent.name} sebesar Rp ${deposit.amount.toLocaleString('id-ID')} ditolak`,
        link: '/admin/hotspot/agent/deposits',
        createdAt: nowWIB(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Deposit ditolak',
      deposit: updatedDeposit,
    });
  } catch (error) {
    console.error('Update admin agent deposit status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
