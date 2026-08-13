import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token: rawToken } = await context.params;
    const token = decodeURIComponent(rawToken).trim();
    
    console.log('[DEBUG] /api/pay/[token] - Received token:', token);

    // Try by payment token first
    let invoice = await prisma.invoice.findFirst({
      where: { paymentToken: token },
      include: {
        user: {
          select: { id: true, username: true, name: true, phone: true, email: true },
        },
      },
    });
    
    console.log('[DEBUG] Invoice by paymentToken:', invoice ? 'FOUND' : 'NOT FOUND');

    // Fallback: try by invoiceNumber (in case link shared with invoice number)
    if (!invoice) {
      console.log('[DEBUG] Trying fallback search by invoiceNumber:', token);
      invoice = await prisma.invoice.findFirst({
        where: { invoiceNumber: token },
        include: {
          user: {
            select: { id: true, username: true, name: true, phone: true, email: true },
          },
        },
      });
      console.log('[DEBUG] Invoice by invoiceNumber:', invoice ? 'FOUND' : 'NOT FOUND');
    }

    if (!invoice) {
      console.log('[DEBUG] No invoice found for token:', token);
      return NextResponse.json(
        { success: false, error: 'Invoice tidak ditemukan atau token tidak valid' },
        { status: 404 }
      );
    }
    
    console.log('[DEBUG] Invoice found:', invoice.invoiceNumber, 'Status:', invoice.status);

    // If already paid, block manual confirmation
    if (invoice.status === 'PAID') {
      return NextResponse.json(
        { success: false, error: 'Invoice ini sudah lunas' },
        { status: 400 }
      );
    }

    // Check if there's already a pending or approved manual payment for this invoice
    const existingPayment = await prisma.manualPayment.findFirst({
      where: {
        invoiceId: invoice.id,
        status: { in: ['PENDING', 'APPROVED'] },
      },
    });

    if (existingPayment) {
      if (existingPayment.status === 'PENDING') {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Konfirmasi pembayaran untuk invoice ini sedang dalam proses review. Silakan tunggu verifikasi dari admin.' 
          },
          { status: 400 }
        );
      }
      if (existingPayment.status === 'APPROVED') {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Pembayaran untuk invoice ini sudah disetujui sebelumnya.' 
          },
          { status: 400 }
        );
      }
    }

    // Success response
    return NextResponse.json({
      success: true,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        status: invoice.status,
        dueDate: invoice.dueDate,
        paidAt: invoice.paidAt,
        customerName: invoice.customerName || invoice.user?.name || 'Customer',
        customerUsername: invoice.customerUsername || invoice.user?.username || '',
        customerPhone: invoice.customerPhone || invoice.user?.phone || '',
        userId: invoice.userId,
      },
    });
  } catch (error: any) {
    console.error('Get invoice by token error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal memuat invoice' },
      { status: 500 }
    );
  }
}
