import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

// Helper to verify customer token
async function verifyCustomerToken(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return null;

    const session = await prisma.customerSession.findFirst({
      where: {
        token,
        verified: true,
        expiresAt: { gte: new Date() },
      },
    });

    if (!session) return null;

    return await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
      include: { profile: true }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

// GET - Get customer payment history (all invoices)
export async function GET(request: NextRequest) {
  try {
    const user = await verifyCustomerToken(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all invoices for this user
    const invoices = await prisma.invoice.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
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
        additionalFees: true,
        payments: {
          orderBy: { paidAt: 'desc' },
          take: 1,
          select: { id: true, method: true, status: true },
        },
        manualPayments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            bankName: true,
            accountName: true,
            status: true,
            rejectionReason: true,
          },
        },
      }
    });

    return NextResponse.json({
      success: true,
      payments: invoices.map(inv => {
        const manual = inv.manualPayments[0] ?? null;
        const gateway = inv.payments[0] ?? null;
        const isPaid = inv.status === 'PAID';

        let paymentSource: string | null = null;
        if (gateway && isPaid) paymentSource = 'gateway';
        else if (manual && (manual.status === 'APPROVED' || isPaid)) paymentSource = 'manual';
        else if (isPaid) paymentSource = 'admin';

        // Detect package change from additionalFees metadata
        let isPackageChange = false;
        let packageChangeDescription: string | null = null;
        try {
          const fees = inv.additionalFees as any;
          const item = fees?.items?.[0];
          if (item?.metadata?.type === 'package_change') {
            isPackageChange = true;
            packageChangeDescription = item.description || `Ganti Paket ke ${item.metadata?.newPackageName || ''}`;
          }
        } catch { /* ignore */ }

        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amount: inv.amount,
          status: inv.status,
          dueDate: inv.dueDate.toISOString(),
          paidAt: inv.paidAt?.toISOString() || null,
          paymentToken: inv.paymentToken,
          paymentLink: inv.paymentLink,
          createdAt: inv.createdAt.toISOString(),
          invoiceType: inv.invoiceType,
          isPackageChange,
          packageChangeDescription,
          manualPaymentId: manual?.id || null,
          manualPaymentStatus: manual?.status?.toLowerCase() || null,
          manualPaymentBank: manual?.bankName || null,
          manualPaymentAccountName: manual?.accountName || null,
          manualPaymentRejectionReason: manual?.rejectionReason || null,
          paymentSource,
        };
      })
    });

  } catch (error: any) {
    console.error('Payment history error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
