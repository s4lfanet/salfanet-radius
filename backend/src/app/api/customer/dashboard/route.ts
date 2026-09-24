import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { listPppActiveDetailed, parseUptime } from '@/server/services/mikrotik/active-sessions.service';
import { cacheAside } from '@/server/cache/redis';



/**
 * Get Customer Dashboard Data
 * GET /api/customer/dashboard
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find session by token
    const session = await prisma.customerSession.findFirst({
      where: {
        token,
        verified: true,
        expiresAt: { gte: new Date() },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Get user data
    const user = await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        username: true,
        customerId: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        expiredAt: true,
        balance: true,
        autoRenewal: true,
        routerId: true,
        profile: {
          select: {
            id: true,
            name: true,
            downloadSpeed: true,
            uploadSpeed: true,
            price: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      );
    }

    // Fetch dashboard data
    const dashboardData = await (async () => {

    // Get active session from RADIUS
    const activeSession = await prisma.radacct.findFirst({
      where: {
        username: user.username,
        acctstoptime: null,
      },
      orderBy: {
        acctstarttime: 'desc',
      },
      select: {
        framedipaddress: true,
        acctstarttime: true,
        acctinputoctets: true,
        acctoutputoctets: true,
      },
    });

    // RADIUS accounting often records a session with no Framed-IP-Address
    // (interim updates that omit the attribute), so an empty string here is
    // just as useless as no session at all.
    const radiusIp = activeSession?.framedipaddress?.trim() || null;

    // Ask the router itself when RADIUS has no session, or has one without an
    // address. /ppp/active/print carries both the assigned IP and the uptime,
    // which is what the customer app shows as "terhubung selama".
    // Cached per router for 20s: the customer dashboard polls every 30s, and
    // without this every customer on a router would open its own API session.
    let mikrotikOnline = false;
    let mikrotikIp: string | null = null;
    let mikrotikUptimeSeconds = 0;

    if (user.routerId && (!activeSession || !radiusIp)) {
      try {
        const sessions = await cacheAside(
          `mikrotik:ppp-active:${user.routerId}`,
          20,
          () => listPppActiveDetailed(user.routerId!),
        );
        const own = sessions.find((s) => s.username === user.username);
        if (own) {
          mikrotikOnline = true;
          mikrotikIp = own.ipAddress?.trim() || null;
          mikrotikUptimeSeconds = parseUptime(own.uptime);
        }
      } catch {
        // Router unreachable — fall back to whatever RADIUS knows.
      }
    }

    // A radacct row with no address is an incomplete record, so its
    // acctstarttime is not trustworthy either — observed in production as a
    // row claiming the session began hours ago while the router reported four
    // days of uptime. When we had to ask the router anyway, believe the router.
    const sessionStartTime = mikrotikUptimeSeconds > 0 && !radiusIp
      ? new Date(Date.now() - mikrotikUptimeSeconds * 1000).toISOString()
      : activeSession?.acctstarttime
        ? activeSession.acctstarttime.toISOString()
        : null;

    // Get usage stats for current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const usageStats = await prisma.radacct.aggregate({
      where: {
        username: user.username,
        acctstarttime: {
          gte: startOfMonth,
        },
      },
      _sum: {
        acctinputoctets: true,
        acctoutputoctets: true,
      },
    });

    const downloadBytes = Number(usageStats._sum.acctoutputoctets || 0);
    const uploadBytes = Number(usageStats._sum.acctinputoctets || 0);
    const totalBytes = downloadBytes + uploadBytes;

    // Get invoice summary
    const unpaidInvoices = await prisma.invoice.count({
      where: {
        userId: user.id,
        status: {
          in: ['PENDING', 'OVERDUE'],
        },
      },
    });

    const unpaidTotal = await prisma.invoice.aggregate({
      where: {
        userId: user.id,
        status: {
          in: ['PENDING', 'OVERDUE'],
        },
      },
      _sum: {
        amount: true,
      },
    });

    // Get next due date
    const nextInvoice = await prisma.invoice.findFirst({
      where: {
        userId: user.id,
        status: {
          in: ['PENDING', 'OVERDUE'],
        },
      },
      orderBy: {
        dueDate: 'asc',
      },
      select: {
        dueDate: true,
      },
    });

    return {
      user: {
        id: user.id.toString(),
        customerId: user.customerId || '',
        username: user.username,
        name: user.name || user.username,
        email: user.email || '',
        phone: user.phone || '',
        status: user.status,
        profileName: user.profile?.name || 'Unknown',
        expiredAt: user.expiredAt?.toISOString() || null,
        balance: user.balance || 0,
        autoRenewal: user.autoRenewal || false,
        packagePrice: user.profile?.price || 0,
      },
      session: {
        isOnline: !!activeSession || mikrotikOnline,
        ipAddress: radiusIp ?? mikrotikIp,
        startTime: sessionStartTime,
      },
      usage: {
        upload: uploadBytes,
        download: downloadBytes,
        total: totalBytes,
      },
      invoice: {
        unpaidCount: unpaidInvoices,
        totalUnpaid: Number(unpaidTotal._sum?.amount || 0),
        nextDueDate: nextInvoice?.dueDate?.toISOString() || null,
      },
    };

      } // end fetcher
    )(); // end async IIFE

    return NextResponse.json({
      success: true,
      data: dashboardData,
    });
  } catch (error: any) {
    console.error('Get customer dashboard error:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan', error: error.message },
      { status: 500 }
    );
  }
}
