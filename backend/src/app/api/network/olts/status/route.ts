import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';

// POST - Batch check OLT online status from DB
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { oltIds } = await request.json();

    if (!Array.isArray(oltIds) || oltIds.length === 0) {
      return NextResponse.json({ statusMap: {} });
    }

    const olts = await prisma.networkOLT.findMany({
      where: { id: { in: oltIds } },
      select: {
        id: true,
        isOnline: true,
        sshEnabled: true,
        telnetEnabled: true,
        snmpEnabled: true,
      },
    });

    const statusMap: Record<string, {
      id: string;
      online: boolean;
      details?: { telnet: boolean; ssh: boolean; http: boolean; icmp: boolean };
    }> = {};

    for (const olt of olts) {
      statusMap[olt.id] = {
        id: olt.id,
        online: olt.isOnline,
        details: {
          telnet: olt.isOnline && olt.telnetEnabled,
          ssh: olt.isOnline && olt.sshEnabled,
          http: false,
          icmp: olt.isOnline,
        },
      };
    }

    return NextResponse.json({ statusMap });
  } catch (error: any) {
    console.error('OLT status check error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
