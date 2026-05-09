import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';

function serializeOnuAssignment(onu: {
  id: string;
  oltId: string;
  onuIndex: number;
  frame: number;
  slot: number;
  port: number;
  onuId: number;
  macAddress: string | null;
  serialNumber: string | null;
  description: string | null;
  status: string;
  rxPower: number | null;
  txPower: number | null;
  distance: number | null;
  temperature: number | null;
  voltage: number | null;
  biasCurrent: number | null;
  lastDeregReason: string | null;
  ipAddress: string | null;
  vlanId: number | null;
  bandwidthUp: bigint;
  bandwidthDown: bigint;
  customerId: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date | null;
  lastOfflineAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  customer: { id: string; username: string; name: string; phone: string | null; customerId: string } | null;
}) {
  return {
    ...onu,
    bandwidthUp: Number(onu.bandwidthUp),
    bandwidthDown: Number(onu.bandwidthDown),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; onuId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { id, onuId } = await params;
    const q = request.nextUrl.searchParams.get('q')?.trim();

    const onu = await prisma.oltOnuStatus.findFirst({
      where: { id: onuId, oltId: id },
      include: { customer: { select: { id: true, username: true, name: true, phone: true, customerId: true } } },
    });
    if (!onu) return NextResponse.json({ error: 'ONU not found' }, { status: 404 });

    const customers = await prisma.pppoeUser.findMany({
      where: {
        status: { in: ['active', 'ACTIVE'] },
        ...(q ? {
          OR: [
            { name: { contains: q } },
            { username: { contains: q } },
            { phone: { contains: q } },
            { customerId: { contains: q } },
          ],
        } : {}),
      },
      select: { id: true, username: true, name: true, phone: true, customerId: true, status: true },
      orderBy: { name: 'asc' },
      take: 100,
    });

    return NextResponse.json({ success: true, currentCustomer: onu.customer, customers });
  } catch (error: any) {
    console.error('[ONU Assign GET]', error);
    return NextResponse.json({ error: error.message ?? 'Failed to load customers' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; onuId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { id, onuId } = await params;
    const { customerId } = await request.json();

    const onu = await prisma.oltOnuStatus.findFirst({ where: { id: onuId, oltId: id } });
    if (!onu) return NextResponse.json({ error: 'ONU not found' }, { status: 404 });

    if (customerId) {
      const customer = await prisma.pppoeUser.findUnique({ where: { id: customerId } });
      if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const updated = await prisma.oltOnuStatus.update({
      where: { id: onu.id },
      data: { customerId: customerId || null },
      include: { customer: { select: { id: true, username: true, name: true, phone: true, customerId: true } } },
    });

    await prisma.oltMonitoringLog.create({
      data: {
        oltId: id,
        logType: 'command',
        severity: 'info',
        message: `ONU ${updated.serialNumber ?? `${updated.frame}/${updated.slot}/${updated.port}:${updated.onuId}`} assigned to ${updated.customer?.username ?? 'none'}`,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, onu: serializeOnuAssignment(updated) });
  } catch (error: any) {
    console.error('[ONU Assign POST]', error);
    return NextResponse.json({ error: error.message ?? 'Failed to assign customer' }, { status: 500 });
  }
}