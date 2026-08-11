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

    // Start transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update transaction status to SUCCESS in notes
      const updatedRequestData = {
        ...requestData,
        status: 'SUCCESS',
        approvedAt: new Date().toISOString(),
        approvedBy: 'admin' // TODO: Get from session
      };

      const updatedTransaction = await tx.transaction.update({
        where: { id },
        data: { 
          notes: JSON.stringify(updatedRequestData)
        }
      });

      // Add balance to pppoe user
      const pppoeUserId = requestData.pppoeUserId;
      if (!pppoeUserId) {
        throw new Error('PPPoE User ID not found in request data');
      }

      const updatedUser = await tx.pppoeUser.update({
        where: { id: pppoeUserId },
        data: {
          balance: {
            increment: Number(transaction.amount)
          }
        }
      });

      return { transaction: updatedTransaction, user: updatedUser, requestData: updatedRequestData };
    });

    // TODO: Send WhatsApp/Email notification to user

    return NextResponse.json({
      success: true,
      message: 'Permintaan top-up berhasil disetujui',
      transaction: {
        id: result.transaction.id,
        amount: Number(result.transaction.amount),
        status: result.requestData.status
      },
      user: {
        id: result.user.id,
        username: result.user.username,
        newBalance: Number(result.user.balance)
      }
    });

  } catch (error) {
    console.error('Approve top-up error:', error);
    return NextResponse.json(
      { error: 'Gagal menyetujui permintaan top-up' },
      { status: 500 }
    );
  }
}
