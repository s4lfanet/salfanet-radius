import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';

// GET - Performance metrics for an OLT
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const oltId = searchParams.get('oltId');
    const hours = parseInt(searchParams.get('hours') || '24');
    const limit = parseInt(searchParams.get('limit') || '100');

    if (!oltId) {
      return NextResponse.json({ error: 'oltId is required' }, { status: 400 });
    }

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const metrics = await prisma.oltPerformanceMetric.findMany({
      where: {
        oltId,
        recordedAt: { gte: since },
      },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      metrics: metrics.map(m => ({
        ...m,
        uptime: m.uptime != null ? Number(m.uptime) : null,
        rxBytes: Number(m.rxBytes),
        txBytes: Number(m.txBytes),
        rxErrors: Number(m.rxErrors),
        txErrors: Number(m.txErrors),
      })),
    });
  } catch (error: any) {
    console.error('[OLT Metrics GET]', error);
    return NextResponse.json({ error: 'Failed to fetch metrics', details: error.message }, { status: 500 });
  }
}
