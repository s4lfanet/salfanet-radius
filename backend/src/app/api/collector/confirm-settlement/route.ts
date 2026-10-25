import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { setDayConfirmation } from '@/server/services/settlement.service';

// POST - confirm settlement for a collector on a date
export async function POST(req: NextRequest) {
  const authCheck = await requirePermission('keuangan.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { collectorId, date } = await req.json();

    if (!collectorId || !date) {
      return NextResponse.json({ error: 'collectorId and date are required' }, { status: 400 });
    }

    // Upsert confirmation
    const confirmation = await prisma.collectorSettlementConfirmation.upsert({
      where: {
        collectorId_date: { collectorId, date },
      },
      update: {
        confirmedBy: authCheck.userId,
        confirmedAt: new Date(),
      },
      create: {
        collectorId,
        date,
        confirmedBy: authCheck.userId,
      },
    });

    await setDayConfirmation(collectorId, date, true, authCheck.userId);

    return NextResponse.json({ success: true, id: confirmation.id });
  } catch (error) {
    console.error('Confirm settlement error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - unconfirm settlement
export async function DELETE(req: NextRequest) {
  const authCheck = await requirePermission('keuangan.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { searchParams } = new URL(req.url);
    const collectorId = searchParams.get('collectorId');
    const date = searchParams.get('date');

    if (!collectorId || !date) {
      return NextResponse.json({ error: 'collectorId and date are required' }, { status: 400 });
    }

    // deleteMany: a day confirmed payment by payment has no day row to delete.
    await prisma.collectorSettlementConfirmation.deleteMany({ where: { collectorId, date } });
    await setDayConfirmation(collectorId, date, false, authCheck.userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unconfirm settlement error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
