import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';

export async function GET(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get('filter') || 'pending'; // pending, approved, rejected

  try {
    const adminUser = await prisma.adminUser.findUnique({
      where: { id: collector.id },
      select: { areaId: true },
    });

    if (!adminUser?.areaId) {
      return NextResponse.json({ proofs: [] });
    }

    // Get payment proofs for users in this collector's area
    const proofs = await prisma.paymentProof.findMany({
      where: {
        status: filter,
        invoice: {
          user: { areaId: adminUser.areaId },
        },
      },
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
        is_my_upload: p.collectorId === collector.id,
      })),
    });
  } catch (error) {
    console.error('Collector proofs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
