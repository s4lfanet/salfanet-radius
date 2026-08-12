import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IppoolService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== Pool Listing ====================

  async listPools() {
    const pools = await this.prisma.radippool.groupBy({
      by: ['pool_name'],
      _count: { framedipaddress: true },
      _min: { framedipaddress: true },
      _max: { framedipaddress: true },
      orderBy: { pool_name: 'asc' },
    });
    return pools.map((p) => ({
      pool_name: p.pool_name,
      total_ips: p._count.framedipaddress,
      start_ip: p._min.framedipaddress,
      end_ip: p._max.framedipaddress,
    }));
  }

  async getPoolDetails(poolName: string) {
    const total = await this.prisma.radippool.count({
      where: { pool_name: poolName },
    });
    if (total === 0) throw new NotFoundException(`Pool '${poolName}' not found`);

    const allocated = await this.prisma.radippool.count({
      where: { pool_name: poolName, username: { not: '' } },
    });

    const recent = await this.prisma.radippool.findMany({
      where: { pool_name: poolName, username: { not: '' } },
      orderBy: { expiry_time: 'desc' },
      take: 50,
      select: {
        framedipaddress: true,
        username: true,
        callingstationid: true,
        nasipaddress: true,
        expiry_time: true,
      },
    });

    return {
      pool_name: poolName,
      total_ips: total,
      allocated,
      free: total - allocated,
      recent_allocations: recent,
    };
  }

  // ==================== Pool Management ====================

  async createPool(body: {
    pool_name: string;
    network: string; // e.g. "172.19.200"
    start: number; // e.g. 2
    end: number; // e.g. 254
  }) {
    const { pool_name, network, start, end } = body;
    if (!pool_name || !network || start < 1 || end > 254 || start >= end) {
      throw new BadRequestException('Invalid pool parameters');
    }

    // Check if pool already exists
    const existing = await this.prisma.radippool.count({
      where: { pool_name },
    });
    if (existing > 0) throw new BadRequestException(`Pool '${pool_name}' already exists`);

    // Generate IPs
    const ips: { pool_name: string; framedipaddress: string }[] = [];
    for (let i = start; i <= end; i++) {
      ips.push({ pool_name, framedipaddress: `${network}.${i}` });
    }

    // Batch insert
    await this.prisma.radippool.createMany({ data: ips });

    return {
      pool_name,
      total_ips: ips.length,
      start_ip: `${network}.${start}`,
      end_ip: `${network}.${end}`,
    };
  }

  async expandPool(body: {
    pool_name: string;
    network: string;
    start: number;
    end: number;
  }) {
    const { pool_name, network, start, end } = body;
    if (!pool_name || !network || start < 1 || end > 254 || start >= end) {
      throw new BadRequestException('Invalid expand parameters');
    }

    // Get existing IPs to avoid duplicates
    const existing = await this.prisma.radippool.findMany({
      where: { pool_name },
      select: { framedipaddress: true },
    });
    const existingSet = new Set(existing.map((e) => e.framedipaddress));

    const newIps: { pool_name: string; framedipaddress: string }[] = [];
    for (let i = start; i <= end; i++) {
      const ip = `${network}.${i}`;
      if (!existingSet.has(ip)) {
        newIps.push({ pool_name, framedipaddress: ip });
      }
    }

    if (newIps.length > 0) {
      await this.prisma.radippool.createMany({ data: newIps });
    }

    const total = await this.prisma.radippool.count({
      where: { pool_name },
    });

    return {
      pool_name,
      added: newIps.length,
      total_ips: total,
    };
  }

  async deletePool(poolName: string) {
    // Only delete unallocated IPs
    const allocated = await this.prisma.radippool.count({
      where: { pool_name: poolName, username: { not: '' } },
    });
    if (allocated > 0) {
      throw new BadRequestException(
        `Cannot delete pool '${poolName}': ${allocated} IPs are currently allocated`,
      );
    }

    const result = await this.prisma.radippool.deleteMany({
      where: { pool_name: poolName },
    });

    // Also remove Pool-Name from radgroupreply
    await this.prisma.radgroupreply.deleteMany({
      where: { attribute: 'Pool-Name', value: poolName },
    });

    return { pool_name: poolName, deleted: result.count };
  }

  // ==================== Pool-Profile Mapping ====================

  async mapPoolToGroup(body: {
    groupname: string;
    pool_name: string;
  }) {
    const { groupname, pool_name } = body;

    // Verify pool exists
    const poolExists = await this.prisma.radippool.count({
      where: { pool_name },
    });
    if (poolExists === 0) throw new NotFoundException(`Pool '${pool_name}' not found`);

    // Upsert radgroupreply
    const existing = await this.prisma.radgroupreply.findFirst({
      where: { groupname, attribute: 'Pool-Name' },
    });

    if (existing) {
      await this.prisma.radgroupreply.update({
        where: { id: existing.id },
        data: { value: pool_name, op: ':=' },
      });
    } else {
      await this.prisma.radgroupreply.create({
        data: { groupname, attribute: 'Pool-Name', op: ':=', value: pool_name },
      });
    }

    return { groupname, pool_name, mapped: true };
  }

  async getPoolMappings() {
    const mappings = await this.prisma.radgroupreply.findMany({
      where: { attribute: 'Pool-Name' },
      select: { groupname: true, value: true, id: true },
      orderBy: { groupname: 'asc' },
    });
    return mappings.map((m) => ({ id: m.id, groupname: m.groupname, pool_name: m.value }));
  }

  async deletePoolMapping(id: number) {
    const mapping = await this.prisma.radgroupreply.findUnique({ where: { id } });
    if (!mapping || mapping.attribute !== 'Pool-Name') {
      throw new NotFoundException('Pool mapping not found');
    }
    await this.prisma.radgroupreply.delete({ where: { id } });
    return { id, deleted: true };
  }

  // ==================== Statistics ====================

  async getStats() {
    const totalIps = await this.prisma.radippool.count();
    const allocatedIps = await this.prisma.radippool.count({
      where: { username: { not: '' } },
    });
    const poolCount = await this.prisma.radippool.groupBy({
      by: ['pool_name'],
      _count: { _all: true },
    });

    return {
      total_pools: poolCount.length,
      total_ips: totalIps,
      allocated_ips: allocatedIps,
      free_ips: totalIps - allocatedIps,
      utilization: totalIps > 0 ? ((allocatedIps / totalIps) * 100).toFixed(2) + '%' : '0%',
    };
  }
}
