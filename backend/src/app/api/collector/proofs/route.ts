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

    // Get invoices with collector proof in this collector's area
    const invoices = await prisma.invoice.findMany({
      where: {
        user: { areaId: adminUser.areaId },
        collectorProof: { not: null },
        status: filter === 'pending' ? 'PENDING' : filter === 'approved' ? 'PAID' : { in: ['PENDING', 'PAID'] },
      },
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        status: true,
        collectorProof: true,
        dueDate: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const proofs = invoices
      .filter(inv => inv.collectorProof)
      .map(inv => ({
        id: inv.id,
        invoice_id: inv.id,
        invoice_number: inv.invoiceNumber,
        amount: inv.amount,
        status: inv.status,
        proof_image: inv.collectorProof,
        submitted_at: inv.createdAt,
        fullname: inv.user?.name || inv.user?.username,
        username: inv.user?.username,
        phone: inv.user?.phone,
      }));

    return NextResponse.json({ proofs });
  } catch (error) {
    console.error('Collector proofs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
