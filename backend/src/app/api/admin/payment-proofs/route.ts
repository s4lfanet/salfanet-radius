import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { checkAuth } from '@/server/middleware/api-auth';

// GET - list all payment proofs for admin
export async function GET(req: NextRequest) {
  const authCheck = await checkAuth();
  if (!authCheck.authorized) return authCheck.response;

  const role = (authCheck.session.user as any).role;
  if (role !== 'SUPER_ADMIN' && role !== 'FINANCE') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get('filter') || 'pending';

  try {
    const proofs = await prisma.paymentProof.findMany({
      where: { status: filter },
      select: {
        id: true,
        invoiceId: true,
        username: true,
        amount: true,
        proofImage: true,
        status: true,
        rejectReason: true,
        reviewedAt: true,
        collectorId: true,
        createdAt: true,
        invoice: {
          select: {
            invoiceNumber: true,
            customerName: true,
            user: {
              select: { name: true, phone: true },
            },
          },
        },
        collector: {
          select: { name: true, username: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      proofs: proofs.map(p => ({
        id: p.id,
        invoice_id: p.invoiceId,
        invoice_number: p.invoice?.invoiceNumber || '',
        amount: p.amount,
        status: p.status,
        reject_reason: p.rejectReason,
        reviewed_at: p.reviewedAt,
        proof_image: p.proofImage,
        submitted_at: p.createdAt,
        fullname: p.invoice?.customerName || p.invoice?.user?.name || p.username,
        username: p.username,
        phone: p.invoice?.user?.phone || '',
        collector_name: p.collector?.name || '',
        collector_username: p.collector?.username || '',
      })),
    });
  } catch (error) {
    console.error('Admin payment proofs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
