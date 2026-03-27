import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as any)?.role;
    const allowedRoles = ['SUPER_ADMIN', 'FINANCE', 'CUSTOMER_SERVICE'];
    if (!role || !allowedRoles.includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get deposit category
    const depositCategory = await prisma.transactionCategory.findFirst({
      where: { name: 'DEPOSIT_REQUEST', type: 'INCOME' }
    });

    if (!depositCategory) {
      return NextResponse.json({ success: true, requests: [] });
    }

    const requests = await prisma.transaction.findMany({
      where: {
        categoryId: depositCategory.id,
        type: 'INCOME',
      },
      include: {
        category: true,
      },
      orderBy: [
        { createdAt: 'desc' }
      ]
    });

    // Parse notes to extract request data
    const formattedRequests = requests.map(req => {
      const requestData = req.notes ? JSON.parse(req.notes) : {};
      
      return {
        id: req.id,
        amount: req.amount,
        description: req.description,
        createdAt: req.createdAt.toISOString(),
        reference: req.reference,
        status: requestData.status || 'PENDING',
        paymentMethod: requestData.paymentMethod || '-',
        metadata: {
          note: requestData.note || '',
          proofPath: requestData.proofPath || null,
          requestedBy: requestData.requestedBy || '',
          requestedAt: requestData.requestedAt || req.createdAt.toISOString(),
          approvedAt: requestData.approvedAt || null,
          approvedBy: requestData.approvedBy || null,
          rejectedAt: requestData.rejectedAt || null,
          rejectedBy: requestData.rejectedBy || null,
        },
        user: {
          id: requestData.pppoeUserId || '',
          username: requestData.pppoeUsername || '',
          name: requestData.requestedBy || '',
          phone: '-',
        }
      };
    });

    // Filter by status if needed
    const filteredRequests = formattedRequests.filter(r => 
      r.status === 'PENDING' || r.status === 'SUCCESS' || r.status === 'FAILED'
    );

    return NextResponse.json({
      success: true,
      requests: filteredRequests
    });

  } catch (error) {
    console.error('Get top-up requests error:', error);
    return NextResponse.json(
      { error: 'Gagal memuat permintaan top-up' },
      { status: 500 }
    );
  }
}
