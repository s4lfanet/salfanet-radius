import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface UserListQuery {
  status?: string;
  profileId?: string;
  routerId?: string;
  address?: string;
  name?: string;
  search?: string;
  odpIds?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get PPPoE users list with filters — ported from /api/users/list
   */
  async getUsersList(query: UserListQuery) {
    const where: Record<string, unknown> = {};

    if (query.status) where.status = query.status;
    if (query.profileId) where.profileId = query.profileId;
    if (query.routerId) where.routerId = query.routerId;
    if (query.name) where.name = { contains: query.name };
    if (query.address) where.address = { contains: query.address };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { username: { contains: query.search } },
        { address: { contains: query.search } },
        { phone: { contains: query.search } },
      ];
    }

    // Filter by ODP
    if (query.odpIds) {
      const odpIdArray = query.odpIds.split(',').filter(Boolean);
      if (odpIdArray.length > 0) {
        const odpAssignments = await this.prisma.odpCustomerAssignment.findMany({
          where: { odpId: { in: odpIdArray } },
          select: { customerId: true },
        });
        const customerIds = odpAssignments.map((a) => a.customerId);
        where.id = { in: customerIds.length > 0 ? customerIds : [] };
      }
    }

    const users = await this.prisma.pppoeUser.findMany({
      where,
      select: {
        id: true, name: true, username: true, phone: true, email: true,
        address: true, status: true, profileId: true, routerId: true,
        profile: { select: { name: true } },
        router: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Get ODP assignments
    const userIds = users.map((u) => u.id);
    const odpAssignments = userIds.length > 0
      ? await this.prisma.odpCustomerAssignment.findMany({
          where: { customerId: { in: userIds } },
          select: { customerId: true, odp: { select: { id: true, name: true } } },
        })
      : [];

    const assignmentMap = new Map(odpAssignments.map((a) => [a.customerId, a]));
    const usersWithAssignments = users.map((user) => ({
      ...user,
      odpAssignment: assignmentMap.get(user.id) || null,
    }));

    // Get filter options
    const [profiles, routers, odps] = await Promise.all([
      this.prisma.pppoeProfile.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.router.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.networkODP.findMany({
        where: { status: 'active' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      success: true,
      users: usersWithAssignments,
      filters: {
        profiles,
        routers,
        statuses: ['active', 'isolated', 'blocked'],
        odps,
      },
    };
  }
}
