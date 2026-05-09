import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';
import { pollOLTWithOptions } from '@/lib/olt/poller';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const olt = await prisma.networkOLT.findUnique({ where: { id }, select: { id: true, name: true } });

    if (!olt) {
      return NextResponse.json({ error: 'OLT not found' }, { status: 404 });
    }

    const triggeredBy = (session as any).user?.email ?? 'unknown';

    // Log that sync has started
    await prisma.oltMonitoringLog.create({
      data: {
        id: crypto.randomUUID(),
        oltId: id,
        logType: 'poll',
        severity: 'info',
        message: `Manual sync started by ${triggeredBy}`,
        data: { triggeredBy, mode: 'sync' },
      },
    }).catch(() => {});

    const result = await pollOLTWithOptions(id, {
      ignoreMonitoringDisabled: true,
      skipOpticalInfo: true,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'Sync failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `OLT ${olt.name} synced successfully`,
    });
  } catch (error: any) {
    console.error('[OLT Sync POST]', error);
    return NextResponse.json({ error: error.message ?? 'Failed to sync OLT' }, { status: 500 });
  }
}