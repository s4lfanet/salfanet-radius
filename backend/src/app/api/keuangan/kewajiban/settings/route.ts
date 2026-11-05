import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';

const validRate = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

/** PUT /api/keuangan/kewajiban/settings */
export async function PUT(request: NextRequest) {
  const authCheck = await requirePermission('keuangan.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const body = await request.json();
    const { bhpRate, usoRate, pphFinalRate, revenueBasis, ledgerCategoryIds, npwp, licenseNumber } = body;

    if (![bhpRate, usoRate, pphFinalRate].every(validRate)) {
      return NextResponse.json({ success: false, error: 'Tarif harus berupa angka 0 sampai 100' }, { status: 400 });
    }
    if (revenueBasis !== 'ISSUED' && revenueBasis !== 'COLLECTED') {
      return NextResponse.json({ success: false, error: 'Dasar pendapatan tidak dikenal' }, { status: 400 });
    }
    if (!Array.isArray(ledgerCategoryIds) || ledgerCategoryIds.some((id) => typeof id !== 'string')) {
      return NextResponse.json({ success: false, error: 'Daftar kategori tidak valid' }, { status: 400 });
    }

    const data = {
      bhpRate,
      usoRate,
      pphFinalRate,
      revenueBasis,
      ledgerCategoryIds: ledgerCategoryIds as Prisma.InputJsonValue,
      npwp: String(npwp ?? '').trim().slice(0, 32) || null,
      licenseNumber: String(licenseNumber ?? '').trim().slice(0, 100) || null,
    };
    await prisma.regulatorySetting.upsert({ where: { id: 'default' }, update: data, create: { id: 'default', ...data } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Kewajiban] Settings save failed:', error);
    return NextResponse.json({ success: false, error: 'Gagal menyimpan pengaturan' }, { status: 500 });
  }
}
