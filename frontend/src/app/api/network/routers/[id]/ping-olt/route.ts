import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
const RouterOSAPI = require('node-routeros').RouterOSAPI;

interface PingResult {
  oltId: string;
  oltName: string;
  oltIp: string;
  uplinkPort: string | null;
  status: 'success' | 'failed' | 'timeout' | 'error';
  avgRtt: number | null;
  minRtt: number | null;
  maxRtt: number | null;
  packetLoss: number;
  sent: number;
  received: number;
  error?: string;
}

// POST - Ping OLT from specific router via Mikrotik API
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: routerId } = await params;
    const body = await request.json();
    const { oltId, count = 4, size = 56, timeout = 1000 } = body;

    // Get router info
    const router = await prisma.router.findUnique({
      where: { id: routerId },
      include: {
        oltRouters: {
          include: {
            olt: true,
          },
          where: oltId ? { oltId } : undefined,
        },
      },
    });

    if (!router) {
      return NextResponse.json({ error: 'Router not found' }, { status: 404 });
    }

    if (!router.isActive) {
      return NextResponse.json({ error: 'Router is not active' }, { status: 400 });
    }

    // Connect to Mikrotik
    const conn = new RouterOSAPI({
      host: router.ipAddress,
      user: router.username,
      password: router.password,
      port: router.port || 8728,
      timeout: 30,
      tls: false,
    });

    try {
      await conn.connect();
    } catch (connError: any) {
      return NextResponse.json(
        { 
          error: 'Failed to connect to router',
          details: connError.message,
        },
        { status: 503 }
      );
    }

    const results: PingResult[] = [];

    // Ping each OLT
    for (const oltRouter of router.oltRouters) {
      const olt = oltRouter.olt;
      
      try {
        // Build ping command with optional interface
        const pingParams: string[] = [
          `=address=${olt.ipAddress}`,
          `=count=${count}`,
          `=size=${size}`,
          `=interval=${timeout}ms`,
        ];

        // If uplink port specified, use it as src-address or interface
        if (oltRouter.uplinkPort) {
          pingParams.push(`=interface=${oltRouter.uplinkPort}`);
        }

        // Execute ping on Mikrotik
        const pingResult = await conn.write('/ping', pingParams);

        // Parse results
        let totalTime = 0;
        let minTime = Infinity;
        let maxTime = 0;
        let received = 0;

        for (const result of pingResult) {
          if (result.time) {
            const rtt = parseInt(result.time.replace('ms', ''), 10);
            totalTime += rtt;
            minTime = Math.min(minTime, rtt);
            maxTime = Math.max(maxTime, rtt);
            received++;
          }
        }

        const sent = pingResult.length;
        const packetLoss = sent > 0 ? ((sent - received) / sent) * 100 : 100;

        results.push({
          oltId: olt.id,
          oltName: olt.name,
          oltIp: olt.ipAddress,
          uplinkPort: oltRouter.uplinkPort,
          status: received > 0 ? 'success' : 'timeout',
          avgRtt: received > 0 ? Math.round(totalTime / received) : null,
          minRtt: received > 0 && minTime !== Infinity ? minTime : null,
          maxRtt: received > 0 && maxTime > 0 ? maxTime : null,
          packetLoss: Math.round(packetLoss),
          sent,
          received,
        });
      } catch (pingError: any) {
        results.push({
          oltId: olt.id,
          oltName: olt.name,
          oltIp: olt.ipAddress,
          uplinkPort: oltRouter.uplinkPort,
          status: 'error',
          avgRtt: null,
          minRtt: null,
          maxRtt: null,
          packetLoss: 100,
          sent: 0,
          received: 0,
          error: pingError.message,
        });
      }
    }

    conn.close();

    return NextResponse.json({
      success: true,
      router: {
        id: router.id,
        name: router.name,
        ipAddress: router.ipAddress,
      },
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Ping OLT error:', error);
    return NextResponse.json(
      { error: 'Failed to ping OLT', details: error.message },
      { status: 500 }
    );
  }
}

// GET - Get ping status for all connected OLTs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: routerId } = await params;

    // Get router with OLT connections
    const router = await prisma.router.findUnique({
      where: { id: routerId },
      include: {
        oltRouters: {
          include: {
            olt: true,
          },
          orderBy: { priority: 'asc' },
        },
      },
    });

    if (!router) {
      return NextResponse.json({ error: 'Router not found' }, { status: 404 });
    }

    return NextResponse.json({
      router: {
        id: router.id,
        name: router.name,
        ipAddress: router.ipAddress,
        latitude: router.latitude,
        longitude: router.longitude,
      },
      connections: router.oltRouters.map((oltRouter: typeof router.oltRouters[0]) => ({
        oltId: oltRouter.olt.id,
        oltName: oltRouter.olt.name,
        oltIp: oltRouter.olt.ipAddress,
        oltLatitude: oltRouter.olt.latitude,
        oltLongitude: oltRouter.olt.longitude,
        uplinkPort: oltRouter.uplinkPort,
        priority: oltRouter.priority,
        isActive: oltRouter.isActive,
      })),
    });
  } catch (error: any) {
    console.error('Get OLT connections error:', error);
    return NextResponse.json(
      { error: 'Failed to get OLT connections', details: error.message },
      { status: 500 }
    );
  }
}
