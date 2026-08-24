import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';

export async function GET(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rawFilter = searchParams.get('filter') || 'pending';
  const filter = ['pending', 'approved', 'rejected'].includes(rawFilter) ? rawFilter : 'pending';

  try {
    const adminUser = await prisma.adminUser.findUnique({
      where: { id: collector.id },
      select: { areaId: true },
    });

    if (!adminUser?.areaId) {
      return NextResponse.json({ proofs: [] });
    }

    // Get payment proofs — query by collectorId first (proofs uploaded by this collector)
    // Also get proofs for users in this collector's area via username matching
    const areaUsers = await prisma.pppoeUser.findMany({
      where: { areaId: adminUser.areaId },
      select: { username: true, name: true, phone: true },
    });
    const areaUsernames = areaUsers.map(u => u.username);

    const proofs = await prisma.paymentProof.findMany({
      where: {
        status: filter,
        OR: [
          { collectorId: collector.id },
          { username: { in: areaUsernames } },
        ],
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
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get invoice details separately
    const invoiceIds = proofs.map(p => p.invoiceId);
    const invoices = await prisma.invoice.findMany({
      where: { id: { in: invoiceIds } },
      select: {
        id: true,
        invoiceNumber: true,
        customerName: true,
      },
    });
    const invoiceMap = new Map(invoices.map(i => [i.id, i]));
    const userMap = new Map(areaUsers.map(u => [u.username, u]));

    return NextResponse.json({
      proofs: proofs.map(p => {
        const inv = invoiceMap.get(p.invoiceId);
        const usr = userMap.get(p.username);
        return {
          id: p.id,
          invoice_id: p.invoiceId,
          invoice_number: inv?.invoiceNumber || '',
          amount: p.amount,
          status: p.status,
          reject_reason: p.rejectReason,
          reviewed_at: p.reviewedAt,
          proof_image: p.proofImage,
          submitted_at: p.createdAt,
          fullname: inv?.customerName || usr?.name || p.username,
          username: p.username,
          phone: usr?.phone || '',
          is_my_upload: p.collectorId === collector.id,
        };
      }),
    });
  } catch (error) {
    console.error('Collector proofs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
