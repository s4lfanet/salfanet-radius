import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';

// GET - OLT detail + ONU list
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const onuStatus = searchParams.get('onuStatus'); // 'online' | 'offline' | null

    const olt = await prisma.networkOLT.findUnique({
      where: { id },
      include: {
        routers: {
          include: { router: { select: { id: true, name: true, ipAddress: true } } },
          orderBy: { priority: 'asc' },
        },
        onuStatuses: {
          where: onuStatus ? { status: onuStatus as any } : {},
          include: {
            customer: { select: { id: true, username: true, name: true, phone: true } },
          },
          orderBy: [{ status: 'asc' }, { port: 'asc' }, { onuId: 'asc' }],
        },
        alerts: {
          where: { isResolved: false },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        performanceMetrics: {
          orderBy: { recordedAt: 'desc' },
          take: 48, // Last 48 data points
        },
        monitoringLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!olt) {
      return NextResponse.json({ error: 'OLT not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      olt: {
        ...olt,
        uptime: Number(olt.uptime),
        performanceMetrics: olt.performanceMetrics.map(m => ({
          ...m,
          uptime: m.uptime != null ? Number(m.uptime) : null,
          rxBytes: Number(m.rxBytes),
          txBytes: Number(m.txBytes),
          rxErrors: Number(m.rxErrors),
          txErrors: Number(m.txErrors),
        })),
        onuStatuses: olt.onuStatuses.map(s => ({
          ...s,
          bandwidthUp: Number(s.bandwidthUp),
          bandwidthDown: Number(s.bandwidthDown),
        })),
      },
    });
  } catch (error: any) {
    console.error('[OLT Detail GET]', error);
    return NextResponse.json({ error: 'Failed to fetch OLT', details: error.message }, { status: 500 });
  }
}

// PUT - Update OLT monitoring settings
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const body = await request.json();

    const {
      vendor, model, firmwareVersion,
      snmpEnabled, snmpCommunity, snmpPort,
      telnetEnabled, telnetPort,
      sshEnabled, sshPort,
      username, password,
      monitoringEnabled, pollingInterval,
      routerIds,
    } = body;

    const olt = await prisma.networkOLT.update({
      where: { id },
      data: {
        ...(vendor !== undefined && { vendor }),
        ...(model !== undefined && { model }),
        ...(firmwareVersion !== undefined && { firmwareVersion }),
        ...(snmpEnabled !== undefined && { snmpEnabled }),
        ...(snmpCommunity !== undefined && { snmpCommunity }),
        ...(snmpPort !== undefined && { snmpPort }),
        ...(telnetEnabled !== undefined && { telnetEnabled }),
        ...(telnetPort !== undefined && { telnetPort }),
        ...(sshEnabled !== undefined && { sshEnabled }),
        ...(sshPort !== undefined && { sshPort }),
        ...(username !== undefined && { username }),
        ...(password !== undefined && { password }),
        ...(monitoringEnabled !== undefined && { monitoringEnabled }),
        ...(pollingInterval !== undefined && { pollingInterval }),
      },
    });

    // Update router assignments if provided
    if (routerIds !== undefined && Array.isArray(routerIds)) {
      await prisma.networkOLTRouter.deleteMany({ where: { oltId: id } });
      if (routerIds.length > 0) {
        await prisma.networkOLTRouter.createMany({
          data: routerIds.map((routerId: string, index: number) => ({
            id: crypto.randomUUID(),
            oltId: id,
            routerId,
            priority: index,
            isActive: true,
          })),
        });
      }
    }

    return NextResponse.json({ success: true, olt: { ...olt, uptime: Number(olt.uptime) } });
  } catch (error: any) {
    console.error('[OLT Detail PUT]', error);
    return NextResponse.json({ error: 'Failed to update OLT', details: error.message }, { status: 500 });
  }
}
