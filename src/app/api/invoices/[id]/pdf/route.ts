import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { formatCurrencyExport, formatDateExport } from '@/lib/utils/export';
import { checkAuth } from '@/server/middleware/api-auth';

// Get single invoice PDF data
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await checkAuth();
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } = await params;
    
    // Fetch invoice with relations
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            username: true,
            address: true,
            customerId: true,
            area: { select: { name: true } },
            profile: { select: { name: true, price: true } }
          }
        }
      }
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Get company info
    const company = await prisma.company.findFirst();

    // Parse bank accounts from company
    const bankAccounts = (() => {
      try {
        if (!company?.bankAccounts) return [];
        const raw = company.bankAccounts as any;
        return (Array.isArray(raw) ? raw : JSON.parse(raw)) as Array<{ bankName: string; accountNumber: string; accountName: string }>;
      } catch { return []; }
    })();

    // Tax breakdown
    const baseAmt = invoice.baseAmount ?? invoice.amount;
    const taxRateNum = invoice.taxRate ? Number(invoice.taxRate) : 0;
    const taxAmt = taxRateNum > 0 ? invoice.amount - baseAmt : 0;

    // Additional fees
    const additionalFees = (() => {
      try {
        if (!invoice.additionalFees) return [];
        const raw = invoice.additionalFees as any;
        return (Array.isArray(raw) ? raw : JSON.parse(raw)) as Array<{ name: string; amount: number }>;
      } catch { return []; }
    })();

    // Prepare invoice data for PDF
    const invoiceData = {
      company: {
        name: company?.name || 'SALFANET RADIUS',
        address: company?.address || '',
        phone: company?.phone || '',
        email: company?.email || '',
        logo: company?.logo || null,
        bankAccounts,
      },
      invoice: {
        number: invoice.invoiceNumber,
        date: formatDateExport(invoice.createdAt, 'long'),
        dueDate: formatDateExport(invoice.dueDate, 'long'),
        status: invoice.status,
        paidAt: invoice.paidAt ? formatDateExport(invoice.paidAt, 'long') : null
      },
      customer: {
        name: invoice.user?.name || invoice.customerName || 'Customer',
        phone: invoice.user?.phone || invoice.customerPhone || '',
        email: invoice.user?.email || '',
        username: invoice.user?.username || invoice.customerUsername || '',
        address: invoice.user?.address || '',
        customerId: (invoice.user as any)?.customerId || null,
        area: (invoice.user as any)?.area?.name || null,
      },
      items: [
        {
          description: `Paket Internet - ${invoice.user?.profile?.name || 'N/A'}`,
          quantity: 1,
          price: baseAmt,
          total: baseAmt
        }
      ],
      additionalFees,
      tax: {
        hasTax: taxRateNum > 0,
        baseAmount: baseAmt,
        taxRate: taxRateNum,
        taxAmount: taxAmt,
      },
      subtotal: baseAmt,
      total: invoice.amount,
      amountFormatted: formatCurrencyExport(invoice.amount),
      paymentLink: invoice.paymentLink
    };

    return NextResponse.json({ success: true, data: invoiceData });

  } catch (error) {
    console.error('Invoice PDF error:', error);
    return NextResponse.json({ error: 'Failed to get invoice data' }, { status: 500 });
  }
}
