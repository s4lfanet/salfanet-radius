import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

/**
 * Customer Payments API
 * GET /api/customer/payments - Get payment history
 * POST /api/customer/payments - Create payment
 */

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
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

// GET - Get customer payment history
export async function GET(request: NextRequest) {
  try {
    const user = await verifyCustomerToken(request);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    // Fetch from invoice table (covers ALL payment methods: gateway, admin mark-paid, manual transfer)
    // Show: PAID invoices + any invoice that has a manualPayment (pending/rejected transfers)
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          userId: user.id,
          OR: [
            { status: 'PAID' },
            { manualPayments: { some: {} } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          invoiceNumber: true,
          amount: true,
          status: true,
          dueDate: true,
          paidAt: true,
          createdAt: true,
          invoiceType: true,
          user: {
            select: {
              profile: { select: { name: true, price: true } },
            },
          },
          // Gateway payments
          payments: {
            orderBy: { paidAt: 'desc' },
            take: 1,
            select: {
              id: true,
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
              bankName: true,
              accountNumber: true,
              accountName: true,
              status: true,
              notes: true,
              receiptImage: true,
              createdAt: true,
              approvedAt: true,
              rejectionReason: true,
            },
          },
        },
      }),
      prisma.invoice.count({
        where: {
          userId: user.id,
          OR: [
            { status: 'PAID' },
            { manualPayments: { some: {} } },
          ],
        },
      }),
    ]);

    const mapped = invoices.map(inv => {
      const manual = inv.manualPayments[0] ?? null;
      const gateway = inv.payments[0] ?? null;
      const isPaid = inv.status === 'PAID';

      // Determine exact payment source (used for display label)
      // gateway: paid via payment gateway (Midtrans/Xendit/etc)
      // manual: paid via manual transfer approved by admin
      // admin: mark-paid directly by admin (no gateway/manual record)
      let paymentSource: string;
      let methodLabel: string;
      let bankNameDisplay: string | null = null;

      if (gateway && isPaid) {
        paymentSource = 'gateway';
        methodLabel = gateway.method
          ? gateway.method.charAt(0).toUpperCase() + gateway.method.slice(1).replace(/_/g, ' ')
          : 'Payment Gateway';
      } else if (manual && (manual.status === 'APPROVED' || isPaid)) {
        paymentSource = 'manual';
        methodLabel = manual.bankName || 'Transfer Bank';
        bankNameDisplay = manual.bankName || null;
      } else if (manual) {
        // Still pending/rejected
        paymentSource = 'manual';
        methodLabel = manual.bankName || 'Transfer Bank';
        bankNameDisplay = manual.bankName || null;
      } else if (isPaid) {
        paymentSource = 'admin';
        methodLabel = 'Dikonfirmasi Admin';
      } else {
        paymentSource = 'unknown';
        methodLabel = 'Transfer Bank';
      }

      // Determine display status
      let status: string;
      if (isPaid && (paymentSource === 'gateway' || paymentSource === 'admin')) {
        status = 'paid';
      } else if (isPaid && manual?.status === 'APPROVED') {
        status = 'approved';
      } else if (manual) {
        status = manual.status.toLowerCase();
      } else {
        status = 'pending';
      }

      return {
        id: manual?.id || inv.id,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: Number(inv.amount),
        method: methodLabel,
        paymentSource,
        bankName: bankNameDisplay,
        accountNumber: manual?.accountNumber || null,
        accountName: manual?.accountName || null,
        status,
        invoiceStatus: inv.status,
        invoicePaidAt: inv.paidAt?.toISOString() || null,
        invoiceDueDate: inv.dueDate?.toISOString() || null,
        invoiceType: inv.invoiceType || null,
        packageName: inv.user?.profile?.name || null,
        notes: manual?.notes || null,
        proofUrl: manual?.receiptImage || null,
        createdAt: (manual?.createdAt || inv.createdAt).toISOString(),
        confirmedAt: manual?.approvedAt?.toISOString() || inv.paidAt?.toISOString() || null,
        rejectedAt: (manual?.status === 'REJECTED' && manual?.approvedAt)
          ? manual.approvedAt.toISOString()
          : null,
        rejectionReason: manual?.rejectionReason || null,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        payments: mapped,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error: any) {
    console.error('Get payments error:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan', error: error.message },
      { status: 500 }
    );
  }
}

// POST - Create payment
export async function POST(request: NextRequest) {
  try {
    const user = await verifyCustomerToken(request);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { invoiceId, amount, method, accountNumber, accountName, notes } = await request.json();

    if (!invoiceId || !amount || !method) {
      return NextResponse.json(
        { success: false, message: 'Invoice ID, amount, dan metode pembayaran harus diisi' },
        { status: 400 }
      );
    }

    if (!accountName) {
      return NextResponse.json(
        { success: false, message: 'Nama lengkap pengirim harus diisi' },
        { status: 400 }
      );
    }

    // Verify invoice belongs to user
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        userId: user.id,
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { success: false, message: 'Invoice tidak ditemukan' },
        { status: 404 }
      );
    }

    // Create manual payment
    const payment = await prisma.manualPayment.create({
      data: {
        userId: user.id,
        invoiceId,
        amount: parseFloat(amount),
        bankName: method || 'Bank Transfer',
        accountNumber: accountNumber || null,
        accountName: accountName || user.name || 'Customer',
        paymentDate: new Date(),
        status: 'PENDING',
        notes: notes || null,
      },
      select: {
        id: true,
        invoiceId: true,
        amount: true,
        bankName: true,
        accountNumber: true,
        accountName: true,
        status: true,
        notes: true,
        createdAt: true,
        invoice: {
          select: {
            invoiceNumber: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Pembayaran berhasil dibuat. Menunggu konfirmasi admin.',
      data: {
        id: payment.id,
        invoiceId: payment.invoiceId,
        invoiceNumber: payment.invoice?.invoiceNumber || 'N/A',
        amount: Number(payment.amount),
        method: payment.bankName,
        status: payment.status.toLowerCase(),
        notes: payment.notes,
        createdAt: payment.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Create payment error:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan', error: error.message },
      { status: 500 }
    );
  }
}
