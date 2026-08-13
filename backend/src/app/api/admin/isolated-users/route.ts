import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get isolated users
    const isolatedUsers = await prisma.pppoeUser.findMany({
      where: {
        status: {
          in: ['isolated', 'suspended']
        }
      },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        expiredAt: true,
        createdAt: true,
        customerId: true,
        area: {
          select: { name: true }
        },
        profile: {
          select: {
            name: true,
            price: true,
          }
        },
        // Get unpaid invoices count
        invoices: {
          where: {
            status: {
              in: ['PENDING', 'OVERDUE']
            }
          },
          select: {
            id: true,
            amount: true,
            invoiceNumber: true,
            dueDate: true,
            status: true,
            paymentLink: true,
            paymentToken: true,
          },
          orderBy: { createdAt: 'desc' },
        }
      },
      orderBy: {
        expiredAt: 'desc'
      }
    });

    // Get active sessions for isolated users
    const usernames = isolatedUsers.map((u: any) => u.username);
    const activeSessions = await prisma.radacct.findMany({
      where: {
        username: {
          in: usernames
        },
        acctstoptime: null,
      },
      select: {
        username: true,
        framedipaddress: true,
        acctstarttime: true,
        nasipaddress: true,
      }
    });

    // Map sessions to users
    const sessionsMap = new Map();
    activeSessions.forEach((session: any) => {
      sessionsMap.set(session.username, session);
    });

    // Combine data
    const result = isolatedUsers.map((user: any) => {
      const session = sessionsMap.get(user.username);
      const totalUnpaid = user.invoices.reduce((sum: number, inv: any) => sum + Number(inv.amount), 0);
      
      return {
        id: user.id,
        username: user.username,
        name: user.name,
        phone: user.phone,
        email: user.email,
        status: user.status,
        expiredAt: user.expiredAt,
        createdAt: user.createdAt,
        customerId: user.customerId || null,
        areaName: user.area?.name || null,
        profileName: user.profile?.name,
        profilePrice: user.profile?.price,
        unpaidInvoicesCount: user.invoices.length,
        totalUnpaid: totalUnpaid,
        unpaidInvoices: user.invoices,
        // Session info
        isOnline: !!session,
        ipAddress: session?.framedipaddress || null,
        loginTime: session?.acctstarttime || null,
        nasIp: session?.nasipaddress || null,
      };
    });

    // Statistics
    const stats = {
      totalIsolated: result.length,
      totalOnline: result.filter((u: any) => u.isOnline).length,
      totalOffline: result.filter((u: any) => !u.isOnline).length,
      totalUnpaidAmount: result.reduce((sum: number, u: any) => sum + u.totalUnpaid, 0),
      totalUnpaidInvoices: result.reduce((sum: number, u: any) => sum + u.unpaidInvoicesCount, 0),
    };

    return NextResponse.json({
      success: true,
      data: result,
      stats: stats,
    });

  } catch (error: any) {
    console.error('Get isolated users error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
