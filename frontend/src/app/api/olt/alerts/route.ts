import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';

// GET - List alerts
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const resolved = searchParams.get('resolved');
    const severity = searchParams.get('severity');
    const type = searchParams.get('type');
    const oltId = searchParams.get('oltId');
    const limit = parseInt(searchParams.get('limit') || '50');

    const alerts = await prisma.oltAlert.findMany({
      where: {
        ...(resolved === 'true'  && { isResolved: true }),
        ...(resolved === 'false' && { isResolved: false }),
        ...(severity && { severity: severity as any }),
        ...(type    && { alertType: type as any }),
        ...(oltId   && { oltId }),
      },
      include: {
        olt: {
          select: { id: true, name: true, ipAddress: true },
        },
        onu: {
          select: {
            id: true, serialNumber: true, macAddress: true,
            frame: true, slot: true, port: true, onuId: true,
            customer: { select: { username: true, name: true, phone: true } },
          },
        },
      },
      orderBy: [
        { isResolved: 'asc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });

    return NextResponse.json({ success: true, alerts });
  } catch (error: any) {
    console.error('[OLT Alerts GET]', error);
    return NextResponse.json({ error: 'Failed to fetch alerts', details: error.message }, { status: 500 });
  }
}
