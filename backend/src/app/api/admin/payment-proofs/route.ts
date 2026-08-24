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
  const rawFilter = searchParams.get('filter') || 'pending';
  const filter = ['pending', 'approved', 'rejected'].includes(rawFilter) ? rawFilter : 'pending';

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
      },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch invoice details separately
    const invoiceIds = proofs.map(p => p.invoiceId);
    const invoices = await prisma.invoice.findMany({
      where: { id: { in: invoiceIds } },
      select: { id: true, invoiceNumber: true, customerName: true, userId: true },
    });
    const invoiceMap = new Map(invoices.map(i => [i.id, i]));

    // Fetch user details
    const userIds = invoices.map(i => i.userId).filter(Boolean) as string[];
    const users = await prisma.pppoeUser.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, phone: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Fetch collector details
    const collectorIds = proofs.map(p => p.collectorId).filter(Boolean) as string[];
    const collectors = await prisma.adminUser.findMany({
      where: { id: { in: collectorIds } },
      select: { id: true, name: true, username: true },
    });
    const collectorMap = new Map(collectors.map(c => [c.id, c]));

    return NextResponse.json({
      proofs: proofs.map(p => {
        const inv = invoiceMap.get(p.invoiceId);
        const usr = inv?.userId ? userMap.get(inv.userId) : undefined;
        const col = p.collectorId ? collectorMap.get(p.collectorId) : undefined;
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
          collector_name: col?.name || '',
          collector_username: col?.username || '',
        };
      }),
    });
  } catch (error) {
    console.error('Admin payment proofs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
