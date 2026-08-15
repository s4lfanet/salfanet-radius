import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission('invoices.approve');
    if (!authCheck.authorized) return authCheck.response;
    const { id } = await params;

    // Get transaction (for reading pppoeUserId and amount)
    // The actual status check is atomic inside the transaction below.
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: { category: true }
    });

    if (!transaction) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
    }

    const requestData = transaction.notes ? JSON.parse(transaction.notes) : {};
    const pppoeUserId = requestData.pppoeUserId;
    if (!pppoeUserId) {
      return NextResponse.json({ error: 'PPPoE User ID not found in request data' }, { status: 400 });
    }

    const approvedAtISO = new Date().toISOString();

    // ─── ALL-OR-NOTHING: atomic status update + balance + financial tx ─────────
    // Single $transaction ensures:
    //   1. Status PENDING → SUCCESS (atomic conditional, prevents double approve)
    //   2. Balance increment (only if status transition succeeded)
    //   3. Financial transaction record (only if status transition succeeded)
    // If any step fails, the entire transaction rolls back — status stays PENDING.
    const result = await prisma.$transaction(async (tx) => {
      // ── Step 1: Atomic conditional status update ─────────────────────────────
      // Only updates if status is still PENDING. If another concurrent request
      // already claimed it, affectedRows = 0 and we abort.
      const atomicResult = await tx.$executeRaw`
        UPDATE transactions
        SET notes = JSON_SET(
          notes,
          '$.status', 'SUCCESS',
          '$.approvedAt', ${approvedAtISO},
          '$.approvedBy', 'admin'
        )
        WHERE id = ${id}
          AND JSON_EXTRACT(notes, '$.status') = 'PENDING'
      `;

      if (atomicResult === 0) {
        return { alreadyProcessed: true as const };
      }

      // ── Step 2: Increment user balance ───────────────────────────────────────
      const updatedUser = await tx.pppoeUser.update({
        where: { id: pppoeUserId },
        data: {
          balance: {
            increment: Number(transaction.amount)
          }
        }
      });

      // ── Step 3: Create financial transaction record ──────────────────────────
      // Use a deterministic reference to detect duplicates. Since the atomic
      // status update already prevents double execution, this create will only
      // run once. The try/catch handles edge cases (e.g., crash recovery).
      const reference = `TOPUP-APPROVED-${id}`;
      const existing = await tx.transaction.findFirst({ where: { reference } });
      if (!existing) {
        await tx.transaction.create({
          data: {
            id: `fin-${id}`,
            categoryId: transaction.categoryId,
            amount: transaction.amount,
            type: 'INCOME',
            description: `Top-up approved for ${requestData.pppoeUsername || pppoeUserId}`,
            reference,
            notes: JSON.stringify({
              source: 'topup_request_approval',
              originalTransactionId: id,
              pppoeUserId,
              approvedAt: approvedAtISO,
            }),
          },
        });
      }

      return { alreadyProcessed: false as const, user: updatedUser };
    });

    if (result.alreadyProcessed) {
      const currentData = transaction.notes ? JSON.parse(transaction.notes) : {};
      const currentStatus = currentData.status || 'UNKNOWN';
      return NextResponse.json(
        { error: `Transaksi sudah diproses (status: ${currentStatus})` },
        { status: 409 }
      );
    }

    // TODO: Send WhatsApp/Email notification to user

    return NextResponse.json({
      success: true,
      message: 'Permintaan top-up berhasil disetujui',
      transaction: {
        id: transaction.id,
        amount: Number(transaction.amount),
        status: 'SUCCESS'
      },
      user: {
        id: result.user!.id,
        username: result.user!.username,
        newBalance: Number(result.user!.balance)
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
