import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

// GET - Get invoice by payment token for manual payment
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Payment token required' },
        { status: 400 }
      );
    }
    
    const invoice = await prisma.invoice.findUnique({
      where: { paymentToken: token },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });
    
    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }
    
    // Check if invoice is already paid
    if (invoice.status === 'PAID') {
      return NextResponse.json(
        { success: false, error: 'Invoice already paid', isPaid: true },
        { status: 400 }
      );
    }
    
    // Get company bank accounts
    const company = await prisma.company.findFirst();
    let bankAccounts = [];
    
    if (company && company.bankAccounts) {
      try {
        bankAccounts = typeof company.bankAccounts === 'string' 
          ? JSON.parse(company.bankAccounts) 
          : company.bankAccounts;
      } catch (e) {
        console.error('Error parsing bank accounts:', e);
      }
    }
    
    // Check if there's already a pending manual payment
    const pendingPayment = await prisma.manualPayment.findFirst({
      where: {
        invoiceId: invoice.id,
        status: 'PENDING',
      },
    });
    
    return NextResponse.json({
      success: true,
      data: {
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
          dueDate: invoice.dueDate,
          status: invoice.status,
          customerName: invoice.customerName,
          customerPhone: invoice.customerPhone,
        },
        user: invoice.user ? {
          id: invoice.user.id,
          name: invoice.user.name,
          username: invoice.user.username,
          phone: invoice.user.phone,
          email: invoice.user.email,
          profileName: invoice.user.profile?.name,
        } : null,
        bankAccounts,
        hasPendingPayment: !!pendingPayment,
        pendingPayment: pendingPayment ? {
          id: pendingPayment.id,
          amount: pendingPayment.amount,
          bankName: pendingPayment.bankName,
          accountName: pendingPayment.accountName,
          paymentDate: pendingPayment.paymentDate,
          status: pendingPayment.status,
          createdAt: pendingPayment.createdAt,
        } : null,
      },
    });
  } catch (error) {
    console.error('Get payment info error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch payment information' },
      { status: 500 }
    );
  }
}
