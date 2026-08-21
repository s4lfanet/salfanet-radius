import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { checkAuth } from '@/server/middleware/api-auth';

// PUT - approve or reject a payment proof
export async function PUT(req: NextRequest) {
  const authCheck = await checkAuth();
  if (!authCheck.authorized) return authCheck.response;

  const role = (authCheck.session.user as any).role;
  if (role !== 'SUPER_ADMIN' && role !== 'FINANCE') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
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

      return NextResponse.json({ success: true, message: 'Bukti transfer disetujui. Invoice tetap lunas.' });
    } else {
      // Reject: update proof status, revert invoice to unpaid
      await prisma.paymentProof.update({
        where: { id },
        data: {
          status: 'rejected',
          rejectReason: rejectReason || 'Ditolak oleh admin',
          reviewedById: authCheck.userId,
          reviewedAt: new Date(),
        },
      });

      // Revert invoice to PENDING
      await prisma.invoice.update({
        where: { id: proof.invoiceId },
        data: {
          status: 'PENDING',
          paidAt: null,
          paidById: null,
          paymentMethod: null,
          collectorProof: null,
        },
      });

      return NextResponse.json({ success: true, message: 'Bukti transfer ditolak. Invoice dikembalikan ke belum lunas.' });
    }
  } catch (error) {
    console.error('Verify proof error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
