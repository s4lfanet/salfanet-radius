import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC, formatWIB } from '@/lib/timezone';
import ExcelJS from 'exceljs';

function formatRupiahRaw(amount: number) {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

export async function GET(req: NextRequest) {
  try {
    const authCheck = await requirePermission('reports.export');
    if (!authCheck.authorized) return authCheck.response;

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId');
    const profileId = searchParams.get('profileId');
    const monthParam = searchParams.get('month');
    const dateParam  = searchParams.get('date');
    const weekParam  = searchParams.get('week');

    const hasPeriodFilter = !!(dateParam || weekParam || monthParam);

    // Build date range
    let gte: Date | null = null;
    let lte: Date | null = null;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      gte = startOfDayWIBtoUTC(dateParam);
      lte = endOfDayWIBtoUTC(dateParam);
    } else if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
      const weekStart = new Date(weekParam + 'T00:00:00Z');
      const weekEnd   = new Date(weekParam + 'T00:00:00Z');
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      gte = startOfDayWIBtoUTC(weekStart);
      lte = endOfDayWIBtoUTC(weekEnd);
    } else if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number);
      gte = startOfDayWIBtoUTC(new Date(Date.UTC(y, m - 1, 1)));
      lte = endOfDayWIBtoUTC(new Date(Date.UTC(y, m, 0)));
    }

    const baseFilter: any = {
      ...(agentId && agentId !== 'all' ? { agentId } : {}),
      ...(profileId && profileId !== 'all' ? { profileId } : {}),
    };

    let rekapData: Array<any> = [];

    if (hasPeriodFilter && gte && lte) {
      // PERIOD MODE: by firstLoginAt
      const soldVouchers = await prisma.hotspotVoucher.findMany({
        where: { ...baseFilter, firstLoginAt: { gte, lte, not: null } },
        select: {
          code: true, batchCode: true, status: true, firstLoginAt: true,
          profile: { select: { name: true, sellingPrice: true, costPrice: true, resellerFee: true } },
          agent: { select: { id: true, name: true, phone: true } },
          router: { select: { name: true } },
          agentId: true,
        },
        orderBy: { firstLoginAt: 'desc' },
      });

      // Group by batch
      const byBatch = new Map<string, any[]>();
      for (const v of soldVouchers) {
        const bc = v.batchCode || 'no-batch';
        if (!byBatch.has(bc)) byBatch.set(bc, []);
        byBatch.get(bc)!.push(v);
      }

      rekapData = Array.from(byBatch.entries()).map(([batchCode, vouchers]) => {
        const sample = vouchers[0];
        const active = vouchers.filter(v => v.status === 'ACTIVE').length;
        const expired = vouchers.filter(v => v.status === 'EXPIRED').length;
        const sold = vouchers.length;
        const sellingPrice = sample?.profile?.sellingPrice ?? 0;
        const costPrice = sample?.profile?.costPrice ?? 0;
        const resellerFee = sample?.profile?.resellerFee ?? 0;
        const agentData = sample?.agent ?? (sample?.agentId ? { id: sample.agentId, name: 'Agent (dihapus)', phone: '-' } : null);

        return {
          batchCode,
          createdAt: sample?.firstLoginAt ?? new Date(),
          agentName: agentData ? agentData.name : 'Admin',
          agentPhone: agentData ? agentData.phone : '-',
          agentId: agentData ? (agentData as any).id : null,
          profileName: sample?.profile?.name ?? 'Unknown',
          routerName: sample?.router?.name ?? '-',
          totalQty: sold,
          stock: 0,
          active,
          expired,
          sold,
          sellingPrice,
          totalRevenue: sold * sellingPrice,
          agentProfit: agentData ? sold * resellerFee : 0,
          adminEarnings: agentData ? sold * costPrice : sold * sellingPrice,
        };
      });
    } else {
      // ALL MODE: by createdAt
      let dateRangeFilter: any = {};
      if (gte && lte) dateRangeFilter = { createdAt: { gte, lte } };

      const batchGroups = await prisma.hotspotVoucher.groupBy({
        by: ['batchCode'],
        where: { batchCode: { not: null }, ...baseFilter, ...dateRangeFilter },
        _min: { createdAt: true },
        orderBy: { _min: { createdAt: 'desc' } },
      });

      rekapData = await Promise.all(
        batchGroups.map(async (batch: any) => {
          const batchCode = batch.batchCode as string;
          const sample = await prisma.hotspotVoucher.findFirst({
            where: { batchCode },
            orderBy: { agentId: 'desc' },
            select: {
              agentId: true,
              profile: { select: { name: true, sellingPrice: true, costPrice: true, resellerFee: true } },
              agent: { select: { id: true, name: true, phone: true } },
              router: { select: { name: true } },
            },
          });

          const [waiting, active, expired] = await Promise.all([
            prisma.hotspotVoucher.count({ where: { batchCode, status: 'WAITING' } }),
            prisma.hotspotVoucher.count({ where: { batchCode, status: 'ACTIVE' } }),
            prisma.hotspotVoucher.count({ where: { batchCode, status: 'EXPIRED' } }),
          ]);

          const sellingPrice = sample?.profile?.sellingPrice ?? 0;
          const costPrice = sample?.profile?.costPrice ?? 0;
          const resellerFee = sample?.profile?.resellerFee ?? 0;
          const sold = active + expired;
          const totalQty = waiting + active + expired;
          const rawAgentId = sample?.agentId ?? null;
          const agentData = sample?.agent ?? (rawAgentId ? { id: rawAgentId, name: 'Agent (dihapus)', phone: '-' } : null);

          return {
            batchCode,
            createdAt: batch._min.createdAt ?? new Date(),
            agentName: agentData ? agentData.name : 'Admin',
            agentPhone: agentData ? agentData.phone : '-',
            agentId: agentData ? (agentData as any).id : null,
            profileName: sample?.profile?.name ?? 'Unknown',
            routerName: sample?.router?.name ?? '-',
            totalQty,
            stock: waiting,
            active,
            expired,
            sold,
            sellingPrice,
            totalRevenue: sold * sellingPrice,
            agentProfit: agentData ? sold * resellerFee : 0,
            adminEarnings: agentData ? sold * costPrice : sold * sellingPrice,
          };
        })
      );
    }

    // ── Build workbook ──
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Rekap Voucher');
    ws.columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Kode Batch', key: 'batch', width: 16 },
      { header: 'Tanggal', key: 'date', width: 20 },
      { header: 'Mitra/Agen', key: 'agent', width: 22 },
      { header: 'Telepon', key: 'phone', width: 15 },
      { header: 'Profile', key: 'profile', width: 15 },
      { header: 'Router', key: 'router', width: 15 },
      { header: 'Qty', key: 'qty', width: 8 },
      { header: 'Stok', key: 'stock', width: 8 },
      { header: 'Terjual', key: 'sold', width: 8 },
      { header: 'Aktif', key: 'active', width: 8 },
      { header: 'Expired', key: 'expired', width: 8 },
      { header: 'Harga/pcs', key: 'price', width: 15 },
      { header: 'Pendapatan', key: 'revenue', width: 18 },
      { header: 'Profit Agent', key: 'agentProfit', width: 18 },
    ];

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    rekapData.forEach((item, index) => {
      const d = new Date(item.createdAt);
      const formattedDate = formatWIB(d, 'dd/MM/yyyy HH:mm');
      ws.addRow({
        no: index + 1,
        batch: item.batchCode,
        date: formattedDate,
        agent: item.agentName,
        phone: item.agentPhone,
        profile: item.profileName,
        router: item.routerName,
        qty: item.totalQty,
        stock: item.stock,
        sold: item.sold,
        active: item.active,
        expired: item.expired,
        price: item.sellingPrice > 0 ? formatRupiahRaw(item.sellingPrice) : '-',
        revenue: item.totalRevenue > 0 ? formatRupiahRaw(item.totalRevenue) : '-',
        agentProfit: item.agentProfit > 0 ? formatRupiahRaw(item.agentProfit) : '-',
      });
    });

    const totalRow = ws.addRow({
      no: '', batch: '', date: '', agent: 'TOTAL', phone: '', profile: '', router: '',
      qty: rekapData.reduce((s, i) => s + i.totalQty, 0),
      stock: rekapData.reduce((s, i) => s + i.stock, 0),
      sold: rekapData.reduce((s, i) => s + i.sold, 0),
      active: rekapData.reduce((s, i) => s + i.active, 0),
      expired: rekapData.reduce((s, i) => s + i.expired, 0),
      price: '',
      revenue: formatRupiahRaw(rekapData.reduce((s, i) => s + i.totalRevenue, 0)),
      agentProfit: formatRupiahRaw(rekapData.reduce((s, i) => s + i.agentProfit, 0)),
    });
    totalRow.font = { bold: true };

    // Sheet 2 — Per-agent summary
    const agentMap = new Map<string, { name: string; batches: number; sold: number; profit: number }>();
    rekapData.forEach(item => {
      if (!item.agentId) return;
      const prev = agentMap.get(item.agentId) ?? { name: item.agentName, batches: 0, sold: 0, profit: 0 };
      agentMap.set(item.agentId, { name: prev.name, batches: prev.batches + 1, sold: prev.sold + item.sold, profit: prev.profit + item.agentProfit });
    });

    if (agentMap.size > 0) {
      const ws2 = workbook.addWorksheet('Per Agent');
      ws2.columns = [
        { header: 'No', key: 'no', width: 5 },
        { header: 'Nama Agent', key: 'name', width: 25 },
        { header: 'Jumlah Batch', key: 'batches', width: 14 },
        { header: 'Total Terjual', key: 'sold', width: 14 },
        { header: 'Profit Agent', key: 'profit', width: 20 },
      ];
      ws2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

      let i = 1;
      agentMap.forEach(a => {
        ws2.addRow({ no: i++, name: a.name, batches: a.batches, sold: a.sold, profit: formatRupiahRaw(a.profit) });
      });

      const totalRow2 = ws2.addRow({
        no: '', name: 'TOTAL',
        batches: Array.from(agentMap.values()).reduce((s, a) => s + a.batches, 0),
        sold: Array.from(agentMap.values()).reduce((s, a) => s + a.sold, 0),
        profit: formatRupiahRaw(Array.from(agentMap.values()).reduce((s, a) => s + a.profit, 0)),
      });
      totalRow2.font = { bold: true };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `Rekap-Voucher-${new Date().toISOString().split('T')[0]}.xlsx`;
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export rekap voucher error:', error);
    return NextResponse.json({ error: 'Failed to export rekap voucher' }, { status: 500 });
  }
}
