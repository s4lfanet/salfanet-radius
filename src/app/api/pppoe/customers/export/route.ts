import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { generateExcelBuffer } from '@/lib/utils/export';
import { checkAuth } from '@/server/middleware/api-auth';
import { formatWIB } from '@/lib/timezone';

export async function GET(req: NextRequest) {
  const auth = await checkAuth();
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const customers = await (prisma as any).pppoeCustomer.findMany({
      include: {
        _count: { select: { pppoeUsers: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const columns = [
      { key: 'no', header: 'No', width: 6 },
      { key: 'customerId', header: 'ID Customer', width: 14 },
      { key: 'name', header: 'Nama', width: 28 },
      { key: 'phone', header: 'Telepon', width: 18 },
      { key: 'email', header: 'Email', width: 28 },
      { key: 'address', header: 'Alamat', width: 36 },
      { key: 'idCardNumber', header: 'No. KTP', width: 20 },
      { key: 'pppoeCount', header: 'Jumlah PPPoE', width: 14 },
      { key: 'status', header: 'Status', width: 12 },
      { key: 'createdAt', header: 'Terdaftar', width: 18 },
    ];

    const data = customers.map((c: any, idx: number) => ({
      no: idx + 1,
      customerId: c.customerId,
      name: c.name,
      phone: c.phone,
      email: c.email || '',
      address: c.address || '',
      idCardNumber: c.idCardNumber || '',
      pppoeCount: c._count?.pppoeUsers ?? 0,
      status: c.isActive ? 'Aktif' : 'Tidak Aktif',
      createdAt: formatWIB(new Date(c.createdAt)),
    }));

    const buffer = await generateExcelBuffer(data, columns, 'Data Pelanggan');
    const filename = `Data-Pelanggan-${new Date().toISOString().split('T')[0]}.xlsx`;

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Customer export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
