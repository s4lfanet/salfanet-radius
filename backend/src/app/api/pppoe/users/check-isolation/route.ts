import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

// PUBLIC endpoint — called from /isolated page by isolated customers (no admin session)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    const ip = searchParams.get('ip');

    // Need either username or IP
    if (!username && !ip) {
      return NextResponse.json({
        success: false,
        error: 'Username or IP is required'
      }, { status: 400 });
    }

    let user;

    // If IP provided, try to find user from active session
    if (ip && !username) {
      console.log('[CHECK-ISOLATION] Looking up user by IP:', ip);
      
      // Find active session with this IP.
      // Fallback: also check recently stopped sessions (within last 10 min) to handle
      // the race window where user just reconnected but radacct start hasn't been written yet.
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const session = await prisma.radacct.findFirst({
        where: {
          framedipaddress: ip,
          OR: [
            { acctstoptime: null },                          // active session
            { acctstarttime: { gte: tenMinutesAgo } },       // very recent session (reconnecting)
          ],
        },
        select: {
          username: true,
        },
        orderBy: {
          acctstarttime: 'desc',
        },
      });

      if (session?.username) {
        console.log('[CHECK-ISOLATION] Found username from IP:', session.username);
        
        // Now find the user
        user = await prisma.pppoeUser.findUnique({
          where: { username: session.username },
          select: {
            id: true,
            username: true,
            name: true,
            phone: true,
            email: true,
            address: true,
            customerId: true,
            status: true,
            expiredAt: true,
            profile: {
              select: {
                name: true,
                price: true,
              }
            },
            area: {
              select: { name: true }
            },
          }
        });
      }
    } else if (username) {
      // Find user by username
      user = await prisma.pppoeUser.findUnique({
        where: { username },
        select: {
          id: true,
          username: true,
          name: true,
          phone: true,
          email: true,
          address: true,
          customerId: true,
          status: true,
          expiredAt: true,
          profile: {
            select: {
              name: true,
              price: true,
            }
          },
          area: {
            select: { name: true }
          },
        }
      });
    }

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 });
    }

    // Check if user is isolated
    if (user.status !== 'isolated') {
      return NextResponse.json({
        success: true,
        isolated: false,
        message: 'User is not isolated'
      });
    }

    // Get unpaid invoices
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        userId: user.id,
        status: {
          in: ['PENDING', 'OVERDUE']
        }
      },
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        dueDate: true,
        paymentLink: true,
      },
      orderBy: {
        dueDate: 'asc'
      }
    });

    // Get active payment gateways for the isolated page PG selector
    const activeGateways = await prisma.paymentGateway.findMany({
      where:  { isActive: true },
      select: { provider: true, name: true },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      success: true,
      isolated: true,
      availableGateways: activeGateways,
      data: {
        username: user.username,
        name: user.name,
        phone: user.phone,
        email: user.email,
        address: (user as any).address ?? null,
        customerId: (user as any).customerId ?? null,
        area: (user as any).area?.name ?? null,
        expiredAt: user.expiredAt,
        profileName: user.profile?.name,
        profilePrice: user.profile?.price ?? null,
        unpaidInvoices: unpaidInvoices
      }
    });
  } catch (error: any) {
    console.error('Check isolation error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
