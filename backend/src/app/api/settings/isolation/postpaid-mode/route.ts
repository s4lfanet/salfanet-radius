import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { applyPostpaidIsolirMode, isIsolirMode } from '@/server/services/billing/postpaid-isolir.service';

/** GET: how many POSTPAID customers are on each mode, for the confirmation. */
export async function GET() {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;

  const groups = await prisma.pppoeUser.groupBy({
    by: ['postpaidIsolirMode'],
    where: { subscriptionType: 'POSTPAID' },
    _count: { _all: true },
  });
  const count = (mode: string) => groups.find((g) => g.postpaidIsolirMode === mode)?._count._all ?? 0;
  return NextResponse.json({ success: true, dueDate: count('DUE_DATE'), paymentDate: count('PAYMENT_DATE') });
}

/** POST { mode }: moves every POSTPAID customer to that mode. */
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('settings.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { mode } = await request.json();
    if (!isIsolirMode(mode)) return NextResponse.json({ success: false, error: 'Pilihan tanggal isolir tidak dikenal' }, { status: 400 });
    return NextResponse.json({ success: true, updated: await applyPostpaidIsolirMode(mode) });
  } catch (error) {
    console.error('[Isolation] Apply postpaid mode failed:', error);
    return NextResponse.json({ success: false, error: 'Gagal menerapkan ke pelanggan' }, { status: 500 });
  }
}
