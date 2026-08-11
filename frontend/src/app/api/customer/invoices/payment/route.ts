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

// GET - Generate payment link for unpaid invoice
export async function GET(request: NextRequest) {
  try {
    const user = await verifyCustomerToken(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const invoiceId = searchParams.get('invoiceId');

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: 'Invoice ID is required' },
        { status: 400 }
      );
    }

    // Find invoice
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        userId: user.id,
        status: {
          in: ['PENDING', 'OVERDUE']
        }
      }
    });

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found or already paid' },
        { status: 404 }
      );
    }

    // Check payment gateway settings
    const paymentSettings = await prisma.paymentGateway.findFirst({
      where: { isActive: true }
    });

    if (!paymentSettings) {
      return NextResponse.json(
        { success: false, error: 'No active payment gateway configured. Please contact admin.' },
        { status: 503 }
      );
    }

    // Generate payment link based on gateway
    let paymentLink = '';
    
    if (paymentSettings.provider === 'midtrans') {
      // Midtrans implementation
      const midtransUrl = paymentSettings.midtransEnvironment === 'sandbox'
        ? 'https://app.sandbox.midtrans.com/snap/v1/transactions'
        : 'https://app.midtrans.com/snap/v1/transactions';
      
      const auth = Buffer.from((paymentSettings.midtransServerKey || '') + ':').toString('base64');
      
      const payload = {
        transaction_details: {
          order_id: invoice.invoiceNumber,
          gross_amount: invoice.amount
        },
        customer_details: {
          first_name: user.name,
          phone: user.phone,
          email: user.email || `${user.phone}@customer.com`
        },
        item_details: [{
          id: invoice.id,
          price: invoice.amount,
          quantity: 1,
          name: `Internet Package - ${user.profile.name}`
        }]
      };

      const response = await fetch(midtransUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        paymentLink = data.redirect_url || '';
      } else {
        const errorData = await response.json();
        console.error('Midtrans error:', errorData);
        return NextResponse.json(
          { success: false, error: 'Failed to generate payment link. Please try again later.' },
          { status: 500 }
        );
      }
    } else if (paymentSettings.provider === 'xendit') {
      // Xendit implementation
      const xenditUrl = 'https://api.xendit.co/v2/invoices';
      
      const payload = {
        external_id: invoice.invoiceNumber,
        amount: invoice.amount,
        payer_email: user.email || `${user.phone}@customer.com`,
        description: `Internet Package - ${user.profile.name}`,
        customer: {
          given_names: user.name,
          mobile_number: user.phone
        },
        success_redirect_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/customer?payment=success`,
        failure_redirect_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/customer?payment=failed`
      };

      const response = await fetch(xenditUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from((paymentSettings.xenditApiKey || '') + ':').toString('base64')}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        paymentLink = data.invoice_url || '';
      } else {
        const errorData = await response.json();
        console.error('Xendit error:', errorData);
        return NextResponse.json(
          { success: false, error: 'Failed to generate payment link. Please try again later.' },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Unsupported payment gateway' },
        { status: 400 }
      );
    }

    // Update invoice with payment link
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { paymentLink }
    });

    return NextResponse.json({
      success: true,
      paymentLink,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        dueDate: invoice.dueDate
      }
    });

  } catch (error: any) {
    console.error('Payment link generation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
