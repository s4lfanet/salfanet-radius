import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission('invoices.approve');
    if (!auth.authorized) return auth.response;
    const { id } = await params;

    // Get transaction (for display purposes — the actual status check is atomic below)
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: { category: true }
    });

    if (!transaction) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
    }

    // ─── ATOMIC CONDITIONAL UPDATE ─────────────────────────────────────────────
    // Atomically check status = PENDING and update to FAILED in a single SQL statement.
    // This prevents the TOCTOU race condition where two concurrent requests (e.g.,
    // approve + reject, or two rejects) both see PENDING and both proceed.
    const rejectedAtISO = new Date().toISOString();

    const atomicResult = await prisma.$executeRaw`
      UPDATE transactions
      SET notes = JSON_SET(
        notes,
        '$.status', 'FAILED',
        '$.rejectedAt', ${rejectedAtISO},
        '$.rejectedBy', 'admin'
      )
      WHERE id = ${id}
        AND JSON_EXTRACT(notes, '$.status') = 'PENDING'
    `;

    if (atomicResult === 0) {
      const currentData = transaction.notes ? JSON.parse(transaction.notes) : {};
      const currentStatus = currentData.status || 'UNKNOWN';
      return NextResponse.json(
        { error: `Transaksi sudah diproses (status: ${currentStatus})` },
        { status: 409 }
      );
    }

    // No balance increment on reject — just status change (already done above)
    // No financial transaction record needed for rejected requests

    return NextResponse.json({
      success: true,
      message: 'Permintaan top-up ditolak',
      transaction: {
        id: transaction.id,
        amount: Number(transaction.amount),
        status: 'FAILED'
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
