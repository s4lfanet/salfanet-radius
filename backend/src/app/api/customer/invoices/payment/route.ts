import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { randomBytes } from 'crypto';

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

/**
 * GET /api/customer/invoices/payment?invoiceId=...
 *
 * The payment token and the operator's /pay/{token} link for one of the
 * signed-in customer's unpaid invoices. The app creates the actual
 * payment with /api/payment/create, which needs this token.
 *
 * This used to create a Midtrans transaction itself and overwrite the
 * invoice's paymentLink with Midtrans' URL, which broke the /pay link
 * used by reminders and the web portal. It now creates nothing at a
 * gateway, and puts the /pay link back when it finds it overwritten.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyCustomerToken(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const invoiceId = new URL(request.url).searchParams.get('invoiceId');
    if (!invoiceId) {
      return NextResponse.json({ success: false, error: 'Invoice ID is required' }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, userId: user.id, status: { in: ['PENDING', 'OVERDUE'] } },
      select: { id: true, invoiceNumber: true, amount: true, dueDate: true, paymentToken: true, paymentLink: true },
    });
    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Tagihan tidak ditemukan atau sudah lunas' }, { status: 404 });
    }

    const company = await prisma.company.findFirst({ select: { baseUrl: true } });
    const baseUrl = (company?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');

    let paymentToken = invoice.paymentToken;
    if (!paymentToken) {
      paymentToken = randomBytes(32).toString('hex');
    }
    const paymentLink = `${baseUrl}/pay/${paymentToken}`;
    if (paymentToken !== invoice.paymentToken || invoice.paymentLink !== paymentLink) {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { paymentToken, paymentLink } });
    }

    return NextResponse.json({
      success: true,
      paymentToken,
      paymentLink,
      invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: invoice.amount, dueDate: invoice.dueDate },
    });
  } catch (error) {
    console.error('[customer/invoices/payment] error:', error);
    return NextResponse.json({ success: false, error: 'Gagal menyiapkan pembayaran' }, { status: 500 });
  }
}
