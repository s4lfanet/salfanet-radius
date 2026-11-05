import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { formatWIB, nowWIB } from '@/lib/timezone';
import { buildRegulatoryReport } from '@/server/services/billing/regulatory-report.service';

/** GET /api/keuangan/kewajiban?year=YYYY: revenue base, BHP, USO and PPN of one book year. */
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('keuangan.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const param = Number(new URL(request.url).searchParams.get('year'));
    const year = Number.isInteger(param) && param >= 2000 && param <= 2100 ? param : Number(formatWIB(nowWIB(), 'yyyy'));
    return NextResponse.json({ success: true, ...(await buildRegulatoryReport(year)) });
  } catch (error) {
    console.error('[Kewajiban] Report failed:', error);
    return NextResponse.json({ success: false, error: 'Gagal menyusun laporan kewajiban' }, { status: 500 });
  }
}
