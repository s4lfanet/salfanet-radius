import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { checkAuth } from '@/server/middleware/api-auth';
import { notifyCollector, fmtRupiah } from '@/server/services/collector-notification.service';

/** Tell the collector who uploaded a transfer proof how admin ruled on it. */
async function notifyProofReview(proof: { collectorId: string | null; invoiceId: string; amount: number; username: string }, approved: boolean, reason?: string) {
  if (!proof.collectorId) return;
  const inv = await prisma.invoice.findUnique({ where: { id: proof.invoiceId }, select: { invoiceNumber: true, customerName: true } });
  const who = `${inv?.customerName || proof.username} (${inv?.invoiceNumber || 'invoice'}, ${fmtRupiah(proof.amount)})`;
  await notifyCollector(proof.collectorId, approved
    ? { type: 'proof_approved', title: 'Bukti transfer disetujui', message: `${who} sudah diperiksa admin.`, link: '/collector/proofs' }
    : { type: 'proof_rejected', title: 'Bukti transfer ditolak', message: `${who} kembali belum lunas. Alasan: ${reason}`, link: '/collector/billing' });
}

// PUT - approve or reject a payment proof
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await checkAuth();
  if (!authCheck.authorized) return authCheck.response;

  const role = (authCheck.session.user as any).role;
  if (role !== 'SUPER_ADMIN' && role !== 'FINANCE') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { action, rejectReason } = await req.json();

    if (!id || !action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const proof = await prisma.paymentProof.findUnique({
      where: { id },
    });

    if (!proof) {
      return NextResponse.json({ error: 'Bukti tidak ditemukan' }, { status: 404 });
    }

    if (proof.status !== 'pending') {
      return NextResponse.json({ error: 'Bukti sudah diverifikasi' }, { status: 400 });
    }

    if (action === 'approve') {
      // Approve: update proof status, keep invoice as PAID
      await prisma.paymentProof.update({
        where: { id },
        data: {
          status: 'approved',
          reviewedById: authCheck.userId,
          reviewedAt: new Date(),
        },
      });

      await notifyProofReview(proof, true);
      return NextResponse.json({ success: true, message: 'Bukti transfer disetujui. Invoice tetap lunas.' });
    } else {
      // Wrap proof rejection + invoice revert in a transaction so they
      // either both succeed or both roll back — prevents a proof being
      // marked rejected while the invoice remains PAID if the revert fails.
      await prisma.$transaction(async (tx) => {
        await tx.paymentProof.update({
          where: { id },
          data: {
            status: 'rejected',
            rejectReason: rejectReason || 'Ditolak oleh admin',
            reviewedById: authCheck.userId,
            reviewedAt: new Date(),
          },
        });

        await tx.invoice.update({
          where: { id: proof.invoiceId },
          data: {
            status: 'PENDING',
            paidAt: null,
            paidById: null,
            paymentMethod: null,
            collectorProof: null,
          },
        });
      });

      await notifyProofReview(proof, false, rejectReason || 'Ditolak oleh admin');
      return NextResponse.json({ success: true, message: 'Bukti transfer ditolak. Invoice dikembalikan ke belum lunas.' });
    }
  } catch (error) {
    console.error('Verify proof error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
