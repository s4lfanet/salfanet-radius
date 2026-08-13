import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';
import { pollOLT } from '@/lib/olt/poller';

// GET - List all OLTs with monitoring status
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status'); // 'online' | 'offline' | null

    const olts = await prisma.networkOLT.findMany({
      where: {
        AND: [
          search
            ? {
                OR: [
                  { name: { contains: search } },
                  { ipAddress: { contains: search } },
                ],
              }
            : {},
          status === 'online'  ? { isOnline: true }  : {},
          status === 'offline' ? { isOnline: false } : {},
        ],
      },
      include: {
        alerts: {
          where: { isResolved: false },
          select: { id: true },
        },
      },
      orderBy: [{ isOnline: 'desc' }, { name: 'asc' }],
    });

    return NextResponse.json({
      success: true,
      olts: olts.map((olt) => {
        const { alerts, ...rest } = olt;
        return { ...rest, uptime: Number(rest.uptime), unresolvedAlerts: alerts.length };
      }),
    });
  } catch (error: any) {
    console.error('[OLT Monitoring GET]', error);
    return NextResponse.json({ error: 'Failed to fetch OLTs', details: error.message }, { status: 500 });
  }
}

// POST - Manually trigger poll for a specific OLT
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { oltId } = await request.json();
    if (!oltId) {
      return NextResponse.json({ error: 'oltId is required' }, { status: 400 });
    }

    const olt = await prisma.networkOLT.findUnique({ where: { id: oltId } });
    if (!olt) {
      return NextResponse.json({ error: 'OLT not found' }, { status: 404 });
    }

    // Run poll
    const result = await pollOLT(oltId);

    // Log manual trigger
    await prisma.oltMonitoringLog.create({
      data: {
        id: crypto.randomUUID(),
        oltId,
        logType: 'poll',
        severity: 'info',
        message: `Manual poll triggered by ${(session as any).user?.email ?? 'unknown'}`,
        data: { triggeredBy: (session as any).user?.email ?? 'unknown' },
      },
    });

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error('[OLT Monitoring POST]', error);
    return NextResponse.json({ error: 'Failed to poll OLT', details: error.message }, { status: 500 });
  }
}
