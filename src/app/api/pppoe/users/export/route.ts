import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { generateExcelBuffer, formatCurrencyExport, formatDateExport, generatePDFBuffer } from '@/lib/utils/export';
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
  const status = searchParams.get('status');

  try {
    // Build query filters
    const where: any = {};
    
    if (profileId) {
      where.profileId = profileId;
    }
    
    if (routerId) {
      if (routerId === 'global') {
        where.routerId = null;
      } else {
        where.routerId = routerId;
      }
    }
    
    if (status) {
      where.status = status;
    }

    // Fetch PPPoE users with relations
    const users = await prisma.pppoeUser.findMany({
      where,
      include: {
        profile: true,
        router: {
          select: { id: true, name: true, nasname: true }
        },
        area: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (format === 'pdf') {
      // Generate PDF data for client-side rendering
      const headers = ['No', 'Username', 'Nama', 'Phone', 'Profile', 'Status', 'Expired', 'Router'];
      const rows = users.map((u, idx) => [
        idx + 1,
        u.username,
        u.name,
        u.phone,
        u.profile.name,
        u.status === 'active' ? 'Aktif' : u.status === 'isolated' ? 'Isolir' : u.status === 'blocked' ? 'Block' : 'Stop',
        u.expiredAt ? formatDateExport(u.expiredAt) : '-',
        u.router?.name || 'Global'
      ]);

      const summary = [
        { label: 'Total Pelanggan', value: users.length.toString() },
        { label: 'Aktif', value: users.filter(u => u.status === 'active').length.toString() },
        { label: 'Isolir', value: users.filter(u => u.status === 'isolated').length.toString() },
        { label: 'Block', value: users.filter(u => u.status === 'blocked').length.toString() },
        { label: 'Stop', value: users.filter(u => u.status === 'stop').length.toString() }
      ];

      return NextResponse.json({
        pdfData: {
          title: 'Daftar Pelanggan PPPoE - SALFANET RADIUS',
          headers,
          rows,
          summary,
          generatedAt: formatWIB(new Date())
        }
      });
    }

    // Excel export
    const columns = [
      { key: 'no', header: 'No', width: 6 },
      { key: 'username', header: 'Username', width: 20 },
      { key: 'name', header: 'Nama', width: 25 },
      { key: 'phone', header: 'Telepon', width: 15 },
      { key: 'email', header: 'Email', width: 25 },
      { key: 'address', header: 'Alamat', width: 35 },
      { key: 'area', header: 'Area', width: 18 },
      { key: 'profile', header: 'Profile', width: 15 },
      { key: 'subscriptionType', header: 'Tipe Langganan', width: 15 },
      { key: 'status', header: 'Status', width: 12 },
      { key: 'ipAddress', header: 'IP Address', width: 15 },
      { key: 'macAddress', header: 'MAC Address', width: 18 },
      { key: 'billingDay', header: 'Hari Tagihan', width: 12 },
      { key: 'expiredAt', header: 'Expired', width: 15 },
      { key: 'comment', header: 'Komentar', width: 25 },
      { key: 'router', header: 'Router', width: 15 },
      { key: 'createdAt', header: 'Created', width: 15 }
    ];

    const data = users.map((u, idx) => ({
      no: idx + 1,
      username: u.username,
      name: u.name,
      phone: u.phone,
      email: u.email || '',
      address: u.address || '',
      area: (u as any).area?.name || '',
      profile: u.profile.name,
      subscriptionType: u.subscriptionType || 'POSTPAID',
      status: u.status === 'active' ? 'Aktif' : u.status === 'isolated' ? 'Isolir' : u.status === 'blocked' ? 'Block' : 'Stop',
      ipAddress: u.ipAddress || '',
      macAddress: (u as any).macAddress || '',
      billingDay: u.billingDay?.toString() || '',
      expiredAt: u.expiredAt ? formatDateExport(u.expiredAt) : '',
      comment: (u as any).comment || '',
      router: u.router?.name || 'Global',
      createdAt: formatDateExport(u.createdAt)
    }));

    const excelBuffer = await generateExcelBuffer(data, columns, 'PPPoE Users');

    const filename = `PPPoE-Users-${new Date().toISOString().split('T')[0]}.xlsx`;
    
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
