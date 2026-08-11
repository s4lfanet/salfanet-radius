import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC, nowWIB } from '@/lib/timezone';
import { notifyAdminsViaWhatsApp } from '@/server/services/notifications/whatsapp-templates.service';

// GET - Get all manual payment submissions
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const status = searchParams.get('status');
    const monthParam = searchParams.get('month'); // YYYY-MM
    
    const where: any = {};
    
    if (userId) {
      where.userId = userId;
    }
    
    if (status && status !== 'ALL') {
      where.status = status;
    }

    // Month filter on createdAt
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number);
      where.createdAt = {
        gte: startOfDayWIBtoUTC(new Date(Date.UTC(y, m - 1, 1))),
        lte: endOfDayWIBtoUTC(new Date(Date.UTC(y, m, 0))),
      };
    }
    
    const manualPayments = await prisma.manualPayment.findMany({
      where,
      include: {
        invoice: {
          select: {
            invoiceNumber: true,
            amount: true,
            dueDate: true,
            status: true,
          },
        },
        user: {
          select: {
            id: true,
            customerId: true,
            username: true,
            name: true,
            phone: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    return NextResponse.json({
      success: true,
      data: manualPayments,
    });
  } catch (error) {
    console.error('Get manual payments error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch manual payments' },
      { status: 500 }
    );
  }
}

// POST - Submit new manual payment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      invoiceId,
      userId,
      amount,
      bankName,
      accountNumber,
      accountName,
      paymentDate,
      receiptImage,
      notes,
    } = body;
    
    // Validate required fields
    if (!invoiceId || !userId || !amount || !bankName || !accountName || !paymentDate || !receiptImage) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Check if invoice exists and is pending
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    
    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }
    
    if (invoice.status === 'PAID') {
      return NextResponse.json(
        { success: false, error: 'Invoice already paid' },
        { status: 400 }
      );
    }
    
    // Check for existing pending manual payment for this invoice
    const existingPayment = await prisma.manualPayment.findFirst({
      where: {
        invoiceId,
        status: 'PENDING',
      },
    });
    
    if (existingPayment) {
      return NextResponse.json(
        { success: false, error: 'You already have a pending manual payment for this invoice' },
        { status: 400 }
      );
    }
    
    // Create manual payment record
    const manualPayment = await prisma.manualPayment.create({
      data: {
        userId,
        invoiceId,
        amount: parseFloat(amount),
        bankName,
        accountNumber: accountNumber || null,
        accountName,
        paymentDate: new Date(paymentDate),
        receiptImage,
        notes,
        status: 'PENDING',
      },
      include: {
        user: {
          select: {
            name: true,
            username: true,
          },
        },
        invoice: {
          select: {
            invoiceNumber: true,
            amount: true,
          },
        },
      },
    });
    
    // Create notification for admin
    await prisma.notification.create({
      data: {
        type: 'manual_payment_submitted',
        title: 'Pembayaran Manual Baru',
        message: `${manualPayment.user.name} (${manualPayment.user.username}) mengirim bukti pembayaran untuk invoice ${manualPayment.invoice.invoiceNumber}`,
        link: `/admin/manual-payments`,
        createdAt: nowWIB(),
      },
    });

    // Notify all admins via WhatsApp (fire-and-forget)
    const approvalUrl = (await prisma.company.findFirst({ select: { baseUrl: true } }))?.baseUrl || '';
    const waMessage =
      `💳 *Pembayaran Manual Baru Masuk!*\n\n` +
      `👤 Pelanggan: *${manualPayment.user.name}*\n` +
      `🔐 Username: *${manualPayment.user.username}*\n` +
      `🧾 Invoice: *${manualPayment.invoice.invoiceNumber}*\n` +
      `💰 Jumlah: *Rp ${Number(manualPayment.amount).toLocaleString('id-ID')}*\n` +
      `🏦 Bank: *${bankName}*${accountNumber ? ` (${accountNumber})` : ''}\n` +
      `👤 A/N: *${accountName}*\n\n` +
      `Silakan verifikasi dan setujui di:\n${approvalUrl}/admin/manual-payments`;
    notifyAdminsViaWhatsApp(waMessage).catch(() => {});
    
    return NextResponse.json({
      success: true,
      message: 'Manual payment submitted successfully',
      data: manualPayment,
    });
  } catch (error) {
    console.error('Submit manual payment error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit manual payment' },
      { status: 500 }
    );
  }
}
