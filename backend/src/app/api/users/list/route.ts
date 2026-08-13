import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

export async function GET(request: NextRequest) {
  // Check authentication
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const profileId = searchParams.get('profileId');
    const routerId = searchParams.get('routerId');
    const address = searchParams.get('address');
    const name = searchParams.get('name'); // search by customer name
    const search = searchParams.get('search'); // generic search (name/username/address)
    const odpIds = searchParams.get('odpIds'); // comma-separated ODP IDs

    // Build where clause
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (profileId) {
      where.profileId = profileId;
    }

    if (routerId) {
      where.routerId = routerId;
    }

    // Search by name only
    if (name) {
      where.name = {
        contains: name,
      };
    }

    // Search by address only  
    if (address) {
      where.address = {
        contains: address,
      };
    }

    // Generic search (name OR username OR address)
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { username: { contains: search } },
        { address: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    // Filter by ODP - get customer IDs first
    if (odpIds) {
      const odpIdArray = odpIds.split(',').filter(Boolean);
      if (odpIdArray.length > 0) {
        const odpAssignments = await prisma.odpCustomerAssignment.findMany({
          where: { odpId: { in: odpIdArray } },
          select: { customerId: true },
        });
        const customerIds = odpAssignments.map(a => a.customerId);
        if (customerIds.length > 0) {
          where.id = { in: customerIds };
        } else {
          // No customers in these ODPs
          where.id = { in: [] };
        }
      }
    }

    // Fetch users with filters
    const users = await prisma.pppoeUser.findMany({
      where,
      select: {
        id: true,
        name: true,
        username: true,
        phone: true,
        email: true,
        address: true,
        status: true,
        profileId: true,
        routerId: true,
        profile: {
          select: {
            name: true,
          },
        },
        router: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Get ODP assignments separately for users that have them
    const userIds = users.map(u => u.id);
    const odpAssignments = userIds.length > 0 
      ? await prisma.odpCustomerAssignment.findMany({
          where: { customerId: { in: userIds } },
          select: {
            customerId: true,
            odp: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })
      : [];

    // Map assignments to users
    const assignmentMap = new Map(odpAssignments.map(a => [a.customerId, a]));
    const usersWithAssignments = users.map(user => ({
      ...user,
      odpAssignment: assignmentMap.get(user.id) || null,
    }));

    // Get profiles and routers for filter options
    const profiles = await prisma.pppoeProfile.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });

    const routers = await prisma.router.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });

    // Get ODPs for filter options
    const odps = await prisma.networkODP.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      success: true,
      users: usersWithAssignments,
      filters: {
        profiles,
        routers,
        statuses: ['active', 'isolated', 'blocked'],
        odps,
      },
    });
  } catch (error: any) {
    console.error('Get users list error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
