import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/config";
import { prisma } from "@/server/db/client";

// Disable caching - always fetch fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all active routers
    const routers = await prisma.router.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        nasname: true,
        ipAddress: true,
      },
    });

    if (routers.length === 0) {
      return NextResponse.json({
        success: true,
        routers: [],
        message: 'No active routers found',
      });
    }

    // Aggregate active session bytes per NAS IP from radacct (Full RADIUS — no RouterOS connection)
    const sessionAggs = await prisma.radacct.groupBy({
      by: ['nasipaddress'],
      where: { acctstoptime: null },
      _sum: {
        acctinputoctets: true,
        acctoutputoctets: true,
      },
      _count: { radacctid: true },
    });

    // Build map: nasipaddress → aggregated stats
    const aggByNas = new Map<string, { rxBytes: number; txBytes: number; sessions: number }>();
    for (const agg of sessionAggs) {
      aggByNas.set(agg.nasipaddress, {
        // From NAS perspective: inputOctets = bytes received from user (user upload)
        //                       outputOctets = bytes sent to user (user download)
        rxBytes: Number(agg._sum.acctoutputoctets ?? 0), // user download
        txBytes: Number(agg._sum.acctinputoctets ?? 0),  // user upload
        sessions: agg._count.radacctid,
      });
    }

    // Build response in the same format as the original RouterOSAPI-based route
    // so frontend components (TrafficMonitor, TrafficChartMonitor) work without changes.
    const routerTraffic = routers.map((router) => {
      const stats =
        aggByNas.get(router.nasname) ||
        aggByNas.get(router.ipAddress) ||
        { rxBytes: 0, txBytes: 0, sessions: 0 };

      return {
        routerId: router.id,
        routerName: router.name,
        interfaces: [
          {
            name: 'active-sessions',
            rxBytes: stats.rxBytes,
            txBytes: stats.txBytes,
            rxRate: 0, // calculated on frontend between polls
            txRate: 0,
            rxPackets: 0,
            txPackets: 0,
            running: stats.sessions > 0,
          },
        ],
      };
    });

    return NextResponse.json({
      success: true,
      routers: routerTraffic,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Traffic] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch traffic data",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
