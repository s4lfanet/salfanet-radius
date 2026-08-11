import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = params;

    // Get transaction
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: { category: true }
    });

    if (!transaction) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
    }

    // Parse request data from notes
    const requestData = transaction.notes ? JSON.parse(transaction.notes) : {};

    if (requestData.status !== 'PENDING') {
      return NextResponse.json({ error: 'Transaksi sudah diproses' }, { status: 400 });
    }

    // Update transaction status to FAILED in notes
    const updatedRequestData = {
      ...requestData,
      status: 'FAILED',
      rejectedAt: new Date().toISOString(),
      rejectedBy: 'admin' // TODO: Get from session
    };

    const updatedTransaction = await prisma.transaction.update({
      where: { id },
      data: { 
        notes: JSON.stringify(updatedRequestData)
      }
    });

    // TODO: Send WhatsApp/Email notification to user

    return NextResponse.json({
      success: true,
      message: 'Permintaan top-up ditolak',
      transaction: {
        id: updatedTransaction.id,
        amount: Number(updatedTransaction.amount),
        status: updatedRequestData.status
      }
    });

  } catch (error) {
    console.error('Reject top-up error:', error);
    return NextResponse.json(
      { error: 'Gagal menolak permintaan top-up' },
      { status: 500 }
    );
  }
}
