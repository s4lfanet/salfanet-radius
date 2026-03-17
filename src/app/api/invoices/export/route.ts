import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { generateExcelBuffer, formatCurrencyExport, formatDateExport, generatePDFBuffer, generateInvoicePDF } from '@/lib/utils/export';
import { checkAuth } from '@/server/middleware/api-auth';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC, formatWIB } from '@/lib/timezone';

export async function GET(req: NextRequest) {
  const auth = await checkAuth();
  if (!auth.authorized) {
    return auth.response;
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'excel';
  const status = searchParams.get('status');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const invoiceIds = searchParams.get('ids'); // comma-separated IDs for batch export

  try {
    // Build query filters
    const where: any = {};
    
    if (invoiceIds) {
      where.id = { in: invoiceIds.split(',') };
    } else {
      if (status && status !== 'all') {
        where.status = status;
      }
      
      if (startDate && endDate) {
        where.createdAt = {
          gte: startOfDayWIBtoUTC(startDate),
          lte: endOfDayWIBtoUTC(endDate),
        };
      }
    }

    // Fetch invoices with relations
    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            username: true,
            profile: { select: { name: true, price: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate stats
    const stats = {
      total: invoices.length,
      pending: invoices.filter(i => i.status === 'PENDING').length,
      paid: invoices.filter(i => i.status === 'PAID').length,
      overdue: invoices.filter(i => i.status === 'OVERDUE').length,
      totalAmount: invoices.reduce((sum, i) => sum + i.amount, 0),
      totalPaid: invoices.filter(i => i.status === 'PAID').reduce((sum, i) => sum + i.amount, 0),
      totalUnpaid: invoices.filter(i => i.status !== 'PAID').reduce((sum, i) => sum + i.amount, 0)
    };

    if (format === 'pdf') {
      // Generate PDF data for client-side rendering
      const headers = ['No', 'Invoice #', 'Customer', 'Package', 'Amount', 'Status', 'Due Date', 'Paid At'];
      const rows = invoices.map((inv, idx) => [
        idx + 1,
        inv.invoiceNumber,
        inv.user?.name || inv.customerName || 'Deleted',
        inv.user?.profile?.name || '-',
        formatCurrencyExport(inv.amount),
        inv.status === 'PAID' ? 'Lunas' : inv.status === 'PENDING' ? 'Pending' : inv.status === 'OVERDUE' ? 'Jatuh Tempo' : 'Dibatalkan',
        formatDateExport(inv.dueDate),
        inv.paidAt ? formatDateExport(inv.paidAt) : '-'
      ]);

      const summary = [
        { label: 'Total Invoice', value: stats.total.toString() },
        { label: 'Lunas', value: `${stats.paid} (${formatCurrencyExport(stats.totalPaid)})` },
        { label: 'Belum Bayar', value: `${stats.pending + stats.overdue} (${formatCurrencyExport(stats.totalUnpaid)})` }
      ];

      return NextResponse.json({
        pdfData: {
          title: 'Daftar Invoice - SALFANET RADIUS',
          headers,
          rows,
          summary,
          generatedAt: formatWIB(new Date())
        }
      });
    }

    // Single invoice PDF export
    if (format === 'invoice-pdf' && invoiceIds) {
      const invoiceId = invoiceIds.split(',')[0];
      const invoice = invoices.find(i => i.id === invoiceId);
      
      if (!invoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }

      // Get company info
      const company = await prisma.company.findFirst();

      const pdfBuffer = generateInvoicePDF({
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.user?.name || invoice.customerName || 'Unknown',
        customerAddress: invoice.user?.email || '',
        customerPhone: invoice.user?.phone || invoice.customerPhone || '',
        items: [
          { 
            description: `Layanan Internet - ${invoice.user?.profile?.name || 'Paket Internet'}`,
            amount: invoice.amount
          }
        ],
        subtotal: invoice.amount,
        total: invoice.amount,
        dueDate: invoice.dueDate,
        status: invoice.status,
        companyInfo: {
          name: company?.name || 'SALFANET RADIUS',
          address: company?.address || undefined,
          phone: company?.phone || undefined,
          email: company?.email || undefined
        }
      });

      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`
        }
      });
    }

    // Excel export
    const columns = [
      { key: 'no', header: 'No', width: 6 },
      { key: 'invoiceNumber', header: 'Invoice #', width: 20 },
      { key: 'customerName', header: 'Customer', width: 25 },
      { key: 'customerPhone', header: 'Telepon', width: 15 },
      { key: 'username', header: 'Username', width: 18 },
      { key: 'package', header: 'Package', width: 15 },
      { key: 'amount', header: 'Jumlah', width: 15 },
      { key: 'status', header: 'Status', width: 12 },
      { key: 'dueDate', header: 'Due Date', width: 15 },
      { key: 'paidAt', header: 'Paid At', width: 15 },
      { key: 'createdAt', header: 'Created', width: 15 }
    ];

    const data = invoices.map((inv, idx) => ({
      no: idx + 1,
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.user?.name || inv.customerName || 'Deleted',
      customerPhone: inv.user?.phone || inv.customerPhone || '',
      username: inv.user?.username || inv.customerUsername || '',
      package: inv.user?.profile?.name || '',
      amount: inv.amount,
      status: inv.status === 'PAID' ? 'Lunas' : inv.status === 'PENDING' ? 'Pending' : inv.status === 'OVERDUE' ? 'Jatuh Tempo' : 'Dibatalkan',
      dueDate: formatDateExport(inv.dueDate),
      paidAt: inv.paidAt ? formatDateExport(inv.paidAt) : '',
      createdAt: formatDateExport(inv.createdAt)
    }));

    const excelBuffer = await generateExcelBuffer(data, columns, 'Invoices');

    const filename = `Invoices-${new Date().toISOString().split('T')[0]}.xlsx`;
    
    return new NextResponse(Buffer.from(excelBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
