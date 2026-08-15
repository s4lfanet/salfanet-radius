import { NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { pollOLTWithOptions } from '@/lib/olt/poller';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission('network.edit');
  if (!authCheck.authorized) return authCheck.response;
  const session = authCheck.session;

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
        data: { triggeredBy, mode: 'background' },
      },
    }).catch(() => {});

    // Fire-and-forget — do NOT await; ZTE SNMP+Telnet discovery can take >100s
    // and Cloudflare/reverse-proxy will kill the request with a 524 timeout.
    // The frontend handles `background: true` by auto-refreshing after 30s.
    pollOLTWithOptions(id, {
      ignoreMonitoringDisabled: true,
      skipOpticalInfo: true,
    }).catch((err) => {
      console.error(`[OLT Sync background] oltId=${id}`, err);
    });

    return NextResponse.json({
      success: true,
      background: true,
      message: `Sync OLT ${olt.name} berjalan di background. Data akan diperbarui otomatis dalam ~30 detik.`,
    }, { status: 202 });
  } catch (error: any) {
    console.error('[OLT Sync POST]', error);
    return NextResponse.json({ error: error.message ?? 'Failed to sync OLT' }, { status: 500 });
  }
}