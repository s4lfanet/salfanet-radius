import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { checkAuth } from '@/server/middleware/api-auth';

// POST - confirm settlement for a collector on a date
export async function POST(req: NextRequest) {
  const authCheck = await checkAuth();
  if (!authCheck.authorized) return authCheck.response;

  const role = (authCheck.session.user as any).role;
  if (role !== 'SUPER_ADMIN' && role !== 'FINANCE') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

    return NextResponse.json({ success: true, id: confirmation.id });
  } catch (error) {
    console.error('Confirm settlement error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - unconfirm settlement
export async function DELETE(req: NextRequest) {
  const authCheck = await checkAuth();
  if (!authCheck.authorized) return authCheck.response;

  const role = (authCheck.session.user as any).role;
  if (role !== 'SUPER_ADMIN' && role !== 'FINANCE') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const collectorId = searchParams.get('collectorId');
    const date = searchParams.get('date');

    if (!collectorId || !date) {
      return NextResponse.json({ error: 'collectorId and date are required' }, { status: 400 });
    }

    await prisma.collectorSettlementConfirmation.delete({
      where: {
        collectorId_date: { collectorId, date },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unconfirm settlement error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
