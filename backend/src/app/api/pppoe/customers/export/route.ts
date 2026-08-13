import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { generateExcelBuffer } from '@/lib/utils/export';
import { checkAuth } from '@/server/middleware/api-auth';
import { formatWIB } from '@/lib/timezone';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';

export async function GET(req: NextRequest) {
  const auth = await checkAuth();
  if (!auth.authorized) {
    return auth.response;
  }

  const limited = await rateLimit(req, RateLimitPresets.strict);
  if (limited) {
    return NextResponse.json({ error: 'Too many export requests' }, { status: 429 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
    const requestedLimit = Math.max(parseInt(searchParams.get('limit') || '5000', 10), 1);
    const limit = Math.min(requestedLimit, 5000);
    const skip = (page - 1) * limit;

    const customers = await (prisma as any).pppoeCustomer.findMany({
      skip,
      take: limit,
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
      no: skip + idx + 1,
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
        'X-Export-Page': String(page),
        'X-Export-Limit': String(limit),
        'X-Export-Count': String(customers.length),
      },
    });
  } catch (error) {
    console.error('Customer export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
