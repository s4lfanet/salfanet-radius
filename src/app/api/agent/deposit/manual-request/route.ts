import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { nowWIB } from '@/lib/timezone';

/**
 * POST /api/agent/deposit/manual-request
 * Agent requests manual deposit top-up that must be approved by admin.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, amount, note } = body;

    if (!agentId || !amount) {
      return NextResponse.json({ error: 'Agent ID and amount are required' }, { status: 400 });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 10000) {
      return NextResponse.json({ error: 'Minimum deposit amount is Rp 10.000' }, { status: 400 });
    }

    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (!agent.isActive) {
      return NextResponse.json({ error: 'Agent account is inactive' }, { status: 403 });
    }

    const existingPending = await prisma.agentDeposit.findFirst({
      where: {
        agentId,
        paymentGateway: 'manual',
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingPending) {
      return NextResponse.json(
        { error: 'Masih ada permintaan deposit manual yang menunggu persetujuan admin' },
        { status: 400 }
      );
    }

    const token = `MANREQ-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const deposit = await prisma.agentDeposit.create({
      data: {
        id: crypto.randomUUID(),
        agentId,
        amount: parsedAmount,
        status: 'PENDING',
        paymentGateway: 'manual',
        paymentToken: token,
        transactionId: note ? `NOTE:${String(note).slice(0, 120)}` : null,
      },
    });

    await prisma.notification.create({
      data: {
        id: Math.random().toString(36).substring(2, 15),
        type: 'agent_deposit_request',
        title: 'Permintaan Deposit Agent',
        message: `${agent.name} meminta top up manual sebesar Rp ${parsedAmount.toLocaleString('id-ID')}`,
        link: '/admin/hotspot/agent/deposits',
        createdAt: nowWIB(),
      },
    });

    await prisma.agentNotification.create({
      data: {
        id: Math.random().toString(36).substring(2, 15),
        agentId,
        type: 'deposit_request_submitted',
        title: 'Permintaan Deposit Dikirim',
        message: `Permintaan deposit manual Rp ${parsedAmount.toLocaleString('id-ID')} telah dikirim dan menunggu persetujuan admin`,
        link: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Permintaan deposit manual berhasil dikirim',
      deposit,
    });
  } catch (error) {
    console.error('Create manual agent deposit request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
