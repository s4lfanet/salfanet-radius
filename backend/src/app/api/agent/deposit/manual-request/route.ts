import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { nowWIB } from '@/lib/timezone';
import { requireAgentAuth } from '@/server/middleware/agent-auth';

/**
 * POST /api/agent/deposit/manual-request
 * Agent requests manual deposit top-up that must be approved by admin.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAgentAuth(request);
    if (!auth.authorized) return auth.response;
    const agentId = auth.agentId;

    const body = await request.json();
    const {
      amount,
      note,
      targetBankName,
      targetBankAccountNumber,
      targetBankAccountName,
      senderAccountName,
      senderAccountNumber,
      receiptImage,
    } = body;

    if (!amount) {
      return NextResponse.json({ error: 'Amount is required' }, { status: 400 });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 10000) {
      return NextResponse.json({ error: 'Minimum deposit amount is Rp 10.000' }, { status: 400 });
    }

    if (!targetBankName || !targetBankAccountNumber || !targetBankAccountName) {
      return NextResponse.json(
        { error: 'Rekening tujuan admin wajib dipilih' },
        { status: 400 }
      );
    }

    if (!senderAccountName) {
      return NextResponse.json(
        { error: 'Nama pemilik rekening pengirim wajib diisi' },
        { status: 400 }
      );
    }

    if (!receiptImage) {
      return NextResponse.json(
        { error: 'Bukti transfer wajib diupload' },
        { status: 400 }
      );
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
        targetBankName,
        targetBankAccountNumber,
        targetBankAccountName,
        senderAccountName,
        senderAccountNumber: senderAccountNumber || null,
        receiptImage,
        note: note || null,
      } as any,
    });

    await prisma.notification.create({
      data: {
        id: Math.random().toString(36).substring(2, 15),
        type: 'agent_deposit_request',
        title: 'Permintaan Deposit Agent',
        message: `${agent.name} meminta top up manual Rp ${parsedAmount.toLocaleString('id-ID')} ke ${targetBankName} (${targetBankAccountNumber})`,
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
