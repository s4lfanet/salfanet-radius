import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');

    const where: any = {};
    if (customerId) {
      where.customerId = customerId;
    }

    // Count by status
    const [
      totalTickets,
      openTickets,
      inProgressTickets,
      waitingCustomerTickets,
      resolvedTickets,
      closedTickets,
    ] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.count({ where: { ...where, status: 'OPEN' } }),
      prisma.ticket.count({ where: { ...where, status: 'IN_PROGRESS' } }),
      prisma.ticket.count({ where: { ...where, status: 'WAITING_CUSTOMER' } }),
      prisma.ticket.count({ where: { ...where, status: 'RESOLVED' } }),
      prisma.ticket.count({ where: { ...where, status: 'CLOSED' } }),
    ]);

    // Count by priority
    const [
      lowPriority,
      mediumPriority,
      highPriority,
      urgentPriority,
    ] = await Promise.all([
      prisma.ticket.count({ where: { ...where, priority: 'LOW' } }),
      prisma.ticket.count({ where: { ...where, priority: 'MEDIUM' } }),
      prisma.ticket.count({ where: { ...where, priority: 'HIGH' } }),
      prisma.ticket.count({ where: { ...where, priority: 'URGENT' } }),
    ]);

    // Count unassigned
    const unassignedTickets = await prisma.ticket.count({
      where: {
        ...where,
        assignedToId: null,
        status: { notIn: ['CLOSED', 'RESOLVED'] },
      },
    });

    // Count by category
    const categoryStats = await prisma.ticketCategory.findMany({
      include: {
        _count: {
          select: {
            tickets: {
              where: customerId ? { customerId } : undefined,
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Get recent tickets
    const recentTickets = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        category: true,
        customer: {
          select: {
            id: true,
            username: true,
            name: true,
            phone: true,
            email: true,
          },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    // Calculate average response time (in hours)
    const ticketsWithResponse = await prisma.ticket.findMany({
      where: {
        ...where,
        lastResponseAt: { not: null },
      },
      select: {
        createdAt: true,
        lastResponseAt: true,
      },
    });

    let avgResponseTimeHours = 0;
    if (ticketsWithResponse.length > 0) {
      const totalResponseTime = ticketsWithResponse.reduce((sum, ticket) => {
        if (ticket.lastResponseAt) {
          const diff = ticket.lastResponseAt.getTime() - ticket.createdAt.getTime();
          return sum + diff;
        }
        return sum;
      }, 0);
      avgResponseTimeHours = totalResponseTime / ticketsWithResponse.length / (1000 * 60 * 60);
    }

    return NextResponse.json({
      total: totalTickets,
      byStatus: {
        open: openTickets,
        inProgress: inProgressTickets,
        waitingCustomer: waitingCustomerTickets,
        resolved: resolvedTickets,
        closed: closedTickets,
      },
      byPriority: {
        low: lowPriority,
        medium: mediumPriority,
        high: highPriority,
        urgent: urgentPriority,
      },
      unassigned: unassignedTickets,
      byCategory: categoryStats.map((cat) => ({
        id: cat.id,
        name: cat.name,
        color: cat.color,
        ticketCount: cat._count.tickets,
      })),
      avgResponseTimeHours: Math.round(avgResponseTimeHours * 100) / 100,
      recentTickets,
    });
  } catch (error) {
    console.error('Error fetching ticket stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ticket stats' },
      { status: 500 }
    );
  }
}
