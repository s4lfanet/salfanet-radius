import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';

// POST - mark invoice as paid by collector
export async function POST(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { invoiceId, paymentMethod, collectorProof } = await req.json();

    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, status: true, amount: true, userId: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice tidak ditemukan' }, { status: 404 });
    }

    if (invoice.status === 'PAID') {
      return NextResponse.json({ error: 'Invoice sudah lunas' }, { status: 400 });
    }

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paidById: collector.id,
        paymentMethod: paymentMethod || 'cash',
        collectorProof: collectorProof || null,
      },
    });

    return NextResponse.json({ success: true, message: 'Invoice berhasil ditandai lunas' });
  } catch (error) {
    console.error('Mark paid error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
