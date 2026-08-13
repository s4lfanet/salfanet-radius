import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { generateExcelBuffer, formatCurrencyExport, formatDateExport, generatePDFBuffer, generateVoucherCardsPDF } from '@/lib/utils/export';
import { checkAuth } from '@/server/middleware/api-auth';
import { formatWIB } from '@/lib/timezone';

export async function GET(req: NextRequest) {
  const auth = await checkAuth();
  if (!auth.authorized) {
    return auth.response;
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'excel';
  const profileId = searchParams.get('profileId');
  const routerId = searchParams.get('routerId');
  const agentId = searchParams.get('agentId');
  const batchCode = searchParams.get('batchCode');
  const status = searchParams.get('status');
  const voucherIds = searchParams.get('ids'); // comma-separated IDs for selected vouchers

  try {
    // Build query filters
    const where: any = {};
    
    if (voucherIds) {
      where.id = { in: voucherIds.split(',') };
    } else {
      if (profileId && profileId !== 'all') {
        where.profileId = profileId;
      }
      
      if (routerId && routerId !== 'all') {
        where.routerId = routerId;
      }
      
      if (agentId && agentId !== 'all') {
        where.agentId = agentId;
      }
      
      if (batchCode && batchCode !== 'all') {
        where.batchCode = batchCode;
      }
      
      if (status && status !== 'all') {
        where.status = status;
      }
    }

    // Fetch vouchers with relations
    const vouchers = await prisma.hotspotVoucher.findMany({
      where,
      include: {
        profile: {
          select: { name: true, sellingPrice: true, validityValue: true, validityUnit: true }
        },
        router: {
          select: { id: true, name: true, shortname: true }
        },
        agent: {
          select: { id: true, name: true, phone: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate stats
    const stats = {
      total: vouchers.length,
      waiting: vouchers.filter(v => v.status === 'WAITING').length,
      active: vouchers.filter(v => v.status === 'ACTIVE').length,
      expired: vouchers.filter(v => v.status === 'EXPIRED').length,
      totalValue: vouchers.filter(v => v.status === 'WAITING').reduce((sum, v) => sum + v.profile.sellingPrice, 0)
    };

    if (format === 'pdf') {
      // Generate PDF data for client-side rendering
      const headers = ['No', 'Code', 'Profile', 'Price', 'Status', 'Router', 'Agent', 'Batch'];
      const rows = vouchers.map((v, idx) => [
        idx + 1,
        v.code,
        v.profile.name,
        formatCurrencyExport(v.profile.sellingPrice),
        v.status === 'WAITING' ? 'Menunggu' : v.status === 'ACTIVE' ? 'Aktif' : 'Expired',
        v.router?.name || 'Global',
        v.agent?.name || '-',
        v.batchCode || '-'
      ]);

      const summary = [
        { label: 'Total Voucher', value: stats.total.toString() },
        { label: 'Menunggu', value: stats.waiting.toString() },
        { label: 'Aktif', value: stats.active.toString() },
        { label: 'Expired', value: stats.expired.toString() },
        { label: 'Total Nilai', value: formatCurrencyExport(stats.totalValue) }
      ];

      return NextResponse.json({
        pdfData: {
          title: 'Daftar Voucher Hotspot - SALFANET RADIUS',
          headers,
          rows,
          summary,
          generatedAt: formatWIB(new Date())
        }
      });
    }

    // Voucher cards PDF for printing
    if (format === 'voucher-cards') {
      // Get company name
      const company = await prisma.company.findFirst();
      
      const vouchersForPrint = vouchers
        .filter(v => v.status === 'WAITING') // Only print unused vouchers
        .map(v => ({
          code: v.code,
          password: v.password || v.code,
          profileName: v.profile.name,
          price: v.profile.sellingPrice,
          validity: `${v.profile.validityValue} ${v.profile.validityUnit.toLowerCase()}`,
          batchCode: v.batchCode || undefined
        }));

      if (vouchersForPrint.length === 0) {
        return NextResponse.json({ error: 'No waiting vouchers to print' }, { status: 400 });
      }

      const pdfBuffer = generateVoucherCardsPDF(vouchersForPrint, company?.name || 'SALFANET RADIUS');

      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="Voucher-Cards-${new Date().toISOString().split('T')[0]}.pdf"`
        }
      });
    }

    // Excel export
    const columns = [
      { key: 'no', header: 'No', width: 6 },
      { key: 'code', header: 'Code', width: 15 },
      { key: 'password', header: 'Password', width: 15 },
      { key: 'profile', header: 'Profile', width: 20 },
      { key: 'price', header: 'Harga', width: 15 },
      { key: 'validity', header: 'Masa Aktif', width: 15 },
      { key: 'status', header: 'Status', width: 12 },
      { key: 'router', header: 'Router', width: 15 },
      { key: 'agent', header: 'Agent', width: 15 },
      { key: 'batch', header: 'Batch', width: 18 },
      { key: 'firstLogin', header: 'First Login', width: 18 },
      { key: 'expiresAt', header: 'Expires', width: 18 },
      { key: 'createdAt', header: 'Created', width: 15 }
    ];

    const data = vouchers.map((v, idx) => ({
      no: idx + 1,
      code: v.code,
      password: v.password || v.code,
      profile: v.profile.name,
      price: v.profile.sellingPrice,
      validity: `${v.profile.validityValue} ${v.profile.validityUnit.toLowerCase()}`,
      status: v.status === 'WAITING' ? 'Menunggu' : v.status === 'ACTIVE' ? 'Aktif' : 'Expired',
      router: v.router?.name || 'Global',
      agent: v.agent?.name || '',
      batch: v.batchCode || '',
      firstLogin: v.firstLoginAt ? formatDateExport(v.firstLoginAt) : '',
      expiresAt: v.expiresAt ? formatDateExport(v.expiresAt) : '',
      createdAt: formatDateExport(v.createdAt)
    }));

    const excelBuffer = await generateExcelBuffer(data, columns, 'Vouchers');

    const filename = `Vouchers-${new Date().toISOString().split('T')[0]}.xlsx`;
    
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
