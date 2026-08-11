import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find session by token
    const session = await prisma.customerSession.findFirst({
      where: {
        token,
        verified: true,
        expiresAt: { gte: new Date() },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status'); // paid, unpaid, overdue
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      userId: session.userId,
    };

    if (status) {
      const s = status.toUpperCase();
      if (s === 'PENDING' || s === 'UNPAID') {
        where.status = {
          in: ['PENDING', 'OVERDUE'],
        };
      } else {
        where.status = s;
      }
    }

    // Get user invoices
    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: {
        dueDate: 'desc',
      },
      skip,
      take: limit,
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        status: true,
        dueDate: true,
        paidAt: true,
        paymentToken: true,
        paymentLink: true,
        createdAt: true,
        invoiceType: true,
        user: {
          select: {
            profile: { select: { name: true, price: true } },
          },
        },
        payments: {
          orderBy: { paidAt: 'desc' },
          take: 1,
          select: {
            id: true,
            amount: true,
            method: true,
            status: true,
            paidAt: true,
          },
        },
        manualPayments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            bankName: true,
            createdAt: true,
            approvedAt: true,
            rejectionReason: true,
          },
        },
      },
    });

    const total = await prisma.invoice.count({ where });

    return NextResponse.json({
      success: true,
      data: {
        invoices: invoices.map(inv => {
          const gatewayPayment = inv.payments[0] ?? null;
          const manualPayment = inv.manualPayments[0] ?? null;

          // Determine payment source
          let paymentSource: string | null = null;
          if (gatewayPayment && inv.status === 'PAID') {
            paymentSource = 'gateway';
          } else if (manualPayment?.status === 'APPROVED') {
            paymentSource = 'manual';
          } else if (inv.status === 'PAID' && !gatewayPayment && !manualPayment) {
            paymentSource = 'admin';
          }

          return {
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            amount: Number(inv.amount),
            status: inv.status,
            dueDate: inv.dueDate.toISOString(),
            paidAt: inv.paidAt?.toISOString() || null,
            paymentToken: inv.paymentToken,
            paymentLink: inv.paymentLink,
            createdAt: inv.createdAt.toISOString(),
            invoiceType: inv.invoiceType || 'MONTHLY',
            profileName: inv.user?.profile?.name || null,
            paymentSource,
            manualPaymentStatus: manualPayment?.status?.toLowerCase() || null,
            manualPaymentBank: manualPayment?.bankName || null,
            payments: inv.payments,
          };
        }),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error: any) {
    console.error('Get invoices error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
