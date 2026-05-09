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

    // Log that sync has been queued
    await prisma.oltMonitoringLog.create({
      data: {
        id: crypto.randomUUID(),
        oltId: id,
        logType: 'poll',
        severity: 'info',
        message: `Manual sync queued by ${triggeredBy}`,
        data: { triggeredBy, mode: 'sync' },
      },
    }).catch(() => {});

    // Run sync in background — do NOT await so Cloudflare doesn't time out (524).
    // pollOLTWithOptions can take >100s for large OLTs (Telnet per-ONU optical info).
    Promise.resolve().then(() =>
      pollOLTWithOptions(id, { ignoreMonitoringDisabled: true }).catch((err) => {
        console.error('[OLT Sync Background]', err);
      })
    );

    return NextResponse.json({
      success: true,
      background: true,
      message: `OLT ${olt.name} sync started — data will refresh in ~30 seconds`,
    });
  } catch (error: any) {
    console.error('[OLT Sync POST]', error);
    return NextResponse.json({ error: error.message ?? 'Failed to sync OLT' }, { status: 500 });
  }
}