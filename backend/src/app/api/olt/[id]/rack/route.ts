import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { readRack } from '@/lib/olt/rack';

/** GET /api/olt/[id]/rack: port map of an OLT that has no ZTE chassis. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authCheck = await requirePermission('network.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { id } = await params;
    const olt = await prisma.networkOLT.findUnique({
      where: { id },
      include: { onuStatuses: { select: { slot: true, port: true, status: true, rxPower: true } } },
    });
    if (!olt) return NextResponse.json({ error: 'OLT not found' }, { status: 404 });

    return NextResponse.json({ success: true, rack: await readRack(olt, olt.onuStatuses) });
  } catch (error: any) {
    console.error('[OLT Rack GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
