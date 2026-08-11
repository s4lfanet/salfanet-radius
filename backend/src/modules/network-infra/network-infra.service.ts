import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Attenuation constants (dB/km)
const ATTENUATION_PER_KM = {
  SM_G652: 0.35,
  SM_G657: 0.35,
  MM_OM1: 1.0,
  MM_OM2: 0.8,
  MM_OM3: 0.7,
  MM_OM4: 0.6,
};
const SPLICE_LOSS = 0.1; // dB per splice
const CONNECTOR_LOSS = 0.3; // dB per connector
const SPLITTER_LOSS_1_8 = 9.0;
const SPLITTER_LOSS_1_16 = 12.0;
const SPLITTER_LOSS_1_32 = 15.0;
const SPLITTER_LOSS_1_64 = 18.0;

@Injectable()
export class NetworkInfraService {
  private readonly logger = new Logger(NetworkInfraService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== TRACE ====================

  async trace(params: {
    type: string; coreId?: string; customerId?: string; odpId?: string;
    deviceType?: string; deviceId?: string; direction?: string;
  }) {
    // Simplified trace — full trace with splice traversal deferred
    const steps: any[] = [];
    let startCore: any = null;

    if (params.type === 'core' && params.coreId) {
      startCore = await this.prisma.fiber_cores.findUnique({
        where: { id: params.coreId },
        include: { tube: { include: { cable: true } } },
      });
      if (!startCore) throw new HttpException('Core not found', HttpStatus.NOT_FOUND);
      steps.push({ type: 'core', core: startCore });

      // Find splices
      const incomingSplices = await this.prisma.splice_points.findMany({
        where: { incomingCoreId: params.coreId },
        include: { outgoingCore: { include: { tube: { include: { cable: true } } } } },
      });
      for (const splice of incomingSplices) {
        steps.push({ type: 'splice', splice, attenuation: Number(splice.insertionLoss || SPLICE_LOSS) });
        steps.push({ type: 'core', core: splice.outgoingCore });
      }
    } else if (params.type === 'customer' && params.customerId) {
      const assignment = await this.prisma.odpCustomerAssignment.findFirst({
        where: { customerId: params.customerId },
        include: { odp: true, customer: { select: { id: true, name: true, username: true } } },
      });
      if (!assignment) throw new HttpException('Customer ODP assignment not found', HttpStatus.NOT_FOUND);
      steps.push({ type: 'customer', customer: assignment.customer, odp: assignment.odp, port: assignment.portNumber });
    } else if (params.type === 'odp' && params.odpId) {
      const odp = await this.prisma.networkODP.findUnique({ where: { id: params.odpId } });
      if (!odp) throw new HttpException('ODP not found', HttpStatus.NOT_FOUND);
      steps.push({ type: 'odp', odp });
    }

    const totalAttenuation = steps
      .filter((s) => s.attenuation)
      .reduce((sum, s) => sum + s.attenuation, 0);

    const signalBudget = 20 - totalAttenuation; // Assume 20 dBm TX power

    return { startCore, steps, totalAttenuation, signalBudget, visitedDevices: [] };
  }

  // ==================== CABLES ====================

  async listCables(params: { page?: number; limit?: number; search?: string; status?: string; cableType?: string; includeDetails?: boolean }) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 200);

    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.cableType) where.cableType = params.cableType;
    if (params.search) {
      where.OR = [
        { code: { contains: params.search } },
        { name: { contains: params.search } },
      ];
    }

    const [cables, total] = await Promise.all([
      this.prisma.fiber_cables.findMany({
        where: where as never,
        include: params.includeDetails === true ? { tubes: { include: { cores: true } }, segments: true } : { _count: { select: { tubes: true, segments: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit, skip: (page - 1) * limit,
      }),
      this.prisma.fiber_cables.count({ where: where as never }),
    ]);

    // Calculate usage stats
    const cablesWithStats = await Promise.all(cables.map(async (cable) => {
      const tubes = await this.prisma.fiber_tubes.findMany({ where: { cableId: cable.id }, select: { coreCount: true, usedCores: true } });
      const totalCores = tubes.reduce((sum, t) => sum + t.coreCount, 0);
      const usedCores = tubes.reduce((sum, t) => sum + t.usedCores, 0);
      return { ...cable, usageStats: { totalCores, usedCores, availableCores: totalCores - usedCores } };
    }));

    return { cables: cablesWithStats, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getCable(id: string, includeDetails?: boolean) {
    const cable = await this.prisma.fiber_cables.findUnique({
      where: { id },
      include: includeDetails === true ? { tubes: { include: { cores: true } }, segments: true } : { tubes: true },
    });
    if (!cable) throw new HttpException('Cable not found', HttpStatus.NOT_FOUND);

    const tubes = await this.prisma.fiber_tubes.findMany({ where: { cableId: id }, select: { coreCount: true, usedCores: true } });
    const totalCores = tubes.reduce((sum, t) => sum + t.coreCount, 0);
    const usedCores = tubes.reduce((sum, t) => sum + t.usedCores, 0);

    return { ...cable, stats: { totalCores, usedCores, availableCores: totalCores - usedCores } };
  }

  async createCable(body: { code: string; name: string; cableType?: string; tubeCount: number; coresPerTube: number; outerDiameter?: number; manufacturer?: string; partNumber?: string; notes?: string }) {
    if (!body.code || !body.name || !body.tubeCount || !body.coresPerTube) {
      throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
    }

    const totalCores = body.tubeCount * body.coresPerTube;
    const cableId = `cable_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    return this.prisma.$transaction(async (tx) => {
      const cable = await tx.fiber_cables.create({
        data: {
          id: cableId,
          code: body.code, name: body.name,
          cableType: (body.cableType || 'SM_G652') as never,
          tubeCount: body.tubeCount, coresPerTube: body.coresPerTube,
          totalCores,
          outerDiameter: body.outerDiameter || null,
          manufacturer: body.manufacturer || null,
          partNumber: body.partNumber || null,
          notes: body.notes || null,
        },
      });

      // Create tubes and cores
      const tubeColors = ['Blue', 'Orange', 'Green', 'Brown', 'Slate', 'White', 'Red', 'Black', 'Yellow', 'Violet', 'Rose', 'Aqua'];
      const coreColors = ['Blue', 'Orange', 'Green', 'Brown', 'Slate', 'White', 'Red', 'Black', 'Yellow', 'Violet', 'Rose', 'Aqua'];

      for (let t = 0; t < body.tubeCount; t++) {
        const tubeId = `tube_${Date.now()}_${t}_${Math.random().toString(36).slice(2, 6)}`;
        const tube = await tx.fiber_tubes.create({
          data: {
            id: tubeId, cableId: cable.id, tubeNumber: t + 1,
            colorCode: tubeColors[t % tubeColors.length],
            colorHex: '#0000FF', coreCount: body.coresPerTube,
          },
        });

        for (let c = 0; c < body.coresPerTube; c++) {
          await tx.fiber_cores.create({
            data: {
              id: `core_${Date.now()}_${t}_${c}_${Math.random().toString(36).slice(2, 6)}`,
              tubeId: tube.id, coreNumber: c + 1,
              colorCode: coreColors[c % coreColors.length],
              colorHex: '#0000FF',
            },
          });
        }
      }

      return cable;
    });
  }

  async updateCable(id: string, body: Record<string, unknown>) {
    const cable = await this.prisma.fiber_cables.findUnique({ where: { id } });
    if (!cable) throw new HttpException('Cable not found', HttpStatus.NOT_FOUND);

    const { tubeCount, coresPerTube, ...updateData } = body;
    if (tubeCount !== undefined && coresPerTube !== undefined) {
      (updateData as any).totalCores = Number(tubeCount) * Number(coresPerTube);
    }

    return this.prisma.fiber_cables.update({ where: { id }, data: updateData as never });
  }

  async deleteCable(id: string) {
    const cable = await this.prisma.fiber_cables.findUnique({
      where: { id },
      include: { tubes: { include: { cores: true } } },
    });
    if (!cable) throw new HttpException('Cable not found', HttpStatus.NOT_FOUND);

    // Check for assigned cores
    const assignedCores = cable.tubes.flatMap((t) => t.cores.filter((c) => c.assignedToId));
    if (assignedCores.length > 0) {
      throw new HttpException('Cannot delete cable with assigned cores', HttpStatus.BAD_REQUEST);
    }

    await this.prisma.fiber_cables.delete({ where: { id } });
    return { success: true, message: 'Cable deleted' };
  }

  // ==================== SPLICES ====================

  async listSplices(params: { page?: number; limit?: number; deviceType?: string; deviceId?: string; status?: string; spliceType?: string }) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 200);

    const where: Record<string, unknown> = {};
    if (params.deviceType) where.deviceType = params.deviceType;
    if (params.deviceId) where.deviceId = params.deviceId;
    if (params.status) where.status = params.status;
    if (params.spliceType) where.spliceType = params.spliceType;

    const [splices, total] = await Promise.all([
      this.prisma.splice_points.findMany({
        where: where as never,
        include: {
          incomingCore: { include: { tube: { include: { cable: true } } } },
          outgoingCore: { include: { tube: { include: { cable: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit, skip: (page - 1) * limit,
      }),
      this.prisma.splice_points.count({ where: where as never }),
    ]);

    return { splices, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getSplice(id: string) {
    const splice = await this.prisma.splice_points.findUnique({
      where: { id },
      include: {
        incomingCore: { include: { tube: { include: { cable: true } } } },
        outgoingCore: { include: { tube: { include: { cable: true } } } },
      },
    });
    if (!splice) throw new HttpException('Splice not found', HttpStatus.NOT_FOUND);
    return splice;
  }

  async createSplice(body: { action?: string; deviceType: string; deviceId: string; trayNumber?: number; incomingCoreId: string; outgoingCoreId: string; spliceType?: string; insertionLoss?: number; reflectance?: number; splicedBy?: string; notes?: string }) {
    // Bulk create deferred — handle single create
    const splice = await this.prisma.splice_points.create({
      data: {
        id: `splice_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        deviceType: body.deviceType as never,
        deviceId: body.deviceId,
        trayNumber: body.trayNumber || 1,
        incomingCoreId: body.incomingCoreId,
        outgoingCoreId: body.outgoingCoreId,
        spliceType: (body.spliceType || 'FUSION') as never,
        insertionLoss: body.insertionLoss || SPLICE_LOSS,
        reflectance: body.reflectance || null,
        splicedBy: body.splicedBy || null,
        notes: body.notes || null,
      },
      include: {
        incomingCore: { include: { tube: { include: { cable: true } } } },
        outgoingCore: { include: { tube: { include: { cable: true } } } },
      },
    });

    // Mark cores as assigned
    await this.prisma.fiber_cores.update({ where: { id: body.incomingCoreId }, data: { status: 'ASSIGNED' as never } });
    await this.prisma.fiber_cores.update({ where: { id: body.outgoingCoreId }, data: { status: 'ASSIGNED' as never } });

    return splice;
  }

  async deleteSplice(id: string) {
    const splice = await this.prisma.splice_points.findUnique({ where: { id } });
    if (!splice) throw new HttpException('Splice not found', HttpStatus.NOT_FOUND);

    return this.prisma.$transaction(async (tx) => {
      // Release cores
      await tx.fiber_cores.update({ where: { id: splice.incomingCoreId }, data: { status: 'AVAILABLE' as never, assignedToId: null, assignedToType: null } });
      await tx.fiber_cores.update({ where: { id: splice.outgoingCoreId }, data: { status: 'AVAILABLE' as never, assignedToId: null, assignedToType: null } });

      // Create history entries
      await tx.core_assignment_history.create({
        data: {
          id: `hist_${Date.now()}_in_${Math.random().toString(36).slice(2, 6)}`,
          coreId: splice.incomingCoreId,
          action: 'RELEASE' as never,
          previousStatus: 'ASSIGNED', newStatus: 'AVAILABLE',
          reason: 'Splice deleted',
        },
      });
      await tx.core_assignment_history.create({
        data: {
          id: `hist_${Date.now()}_out_${Math.random().toString(36).slice(2, 6)}`,
          coreId: splice.outgoingCoreId,
          action: 'RELEASE' as never,
          previousStatus: 'ASSIGNED', newStatus: 'AVAILABLE',
          reason: 'Splice deleted',
        },
      });

      await tx.splice_points.delete({ where: { id } });
      return { success: true, releasedCoreIds: [splice.incomingCoreId, splice.outgoingCoreId] };
    });
  }

  // ==================== JOINT CLOSURES ====================

  async listJointClosures(params: { type?: string; status?: string; search?: string }) {
    const where: Record<string, unknown> = {};
    if (params.type) where.type = params.type;
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [{ name: { contains: params.search } }, { code: { contains: params.search } }];
    }

    return this.prisma.network_joint_closures.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getJointClosure(id: string) {
    const jc = await this.prisma.network_joint_closures.findUnique({ where: { id } });
    if (!jc) throw new HttpException('Joint closure not found', HttpStatus.NOT_FOUND);

    const [inputSegments, outputSegments, splicePoints] = await Promise.all([
      this.prisma.cable_segments.findMany({ where: { toDeviceType: 'JC', toDeviceId: id } }),
      this.prisma.cable_segments.findMany({ where: { fromDeviceType: 'JC', fromDeviceId: id } }),
      this.prisma.splice_points.findMany({ where: { deviceType: 'JOINT_CLOSURE', deviceId: id } }),
    ]);

    return { ...jc, inputSegments, outputSegments, splicePoints };
  }

  async createJointClosure(body: Record<string, unknown>) {
    const jc = await this.prisma.network_joint_closures.create({
      data: {
        id: `jc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: body.name as string,
        code: body.code as string,
        type: body.type as string,
        latitude: body.latitude as number,
        longitude: body.longitude as number,
        address: (body.address as string) || null,
        cableType: body.cableType as string,
        fiberCount: body.fiberCount as number,
        connections: (body.connections as any) || {},
        hasSplitter: (body.hasSplitter as boolean) || false,
        splitterRatio: (body.splitterRatio as string) || null,
        status: (body.status as string) || 'active',
        installDate: body.installDate ? new Date(body.installDate as string) : null,
        lastInspection: body.lastInspection ? new Date(body.lastInspection as string) : null,
        followRoad: (body.followRoad as boolean) ?? true,
        customRouteWaypoints: (body.customRouteWaypoints as any) || null,
        spliceTrayCount: (body.spliceTrayCount as number) || 4,
        totalSpliceCapacity: (body.totalSpliceCapacity as number) || 96,
        closureType: (body.closureType as never) || 'BRANCHING',
      },
    });

    // Sync to network_nodes
    await this.syncToNetworkNodes('JC', jc.id, jc.code, jc.name, jc.latitude, jc.longitude, jc.address || null);

    return jc;
  }

  async updateJointClosure(id: string, body: Record<string, unknown>) {
    const jc = await this.prisma.network_joint_closures.findUnique({ where: { id } });
    if (!jc) throw new HttpException('Joint closure not found', HttpStatus.NOT_FOUND);

    const updateData: Record<string, unknown> = {};
    for (const key of ['name', 'code', 'type', 'latitude', 'longitude', 'address', 'cableType', 'fiberCount', 'connections', 'hasSplitter', 'splitterRatio', 'status', 'installDate', 'lastInspection', 'followRoad', 'customRouteWaypoints', 'spliceTrayCount', 'totalSpliceCapacity', 'closureType']) {
      if (body[key] !== undefined) updateData[key] = body[key];
    }

    const updated = await this.prisma.network_joint_closures.update({ where: { id }, data: updateData as never });

    // Sync to network_nodes
    await this.syncToNetworkNodes('JC', id, updated.code, updated.name, updated.latitude, updated.longitude, updated.address || null);

    return updated;
  }

  async deleteJointClosure(id: string) {
    const jc = await this.prisma.network_joint_closures.findUnique({ where: { id } });
    if (!jc) throw new HttpException('Joint closure not found', HttpStatus.NOT_FOUND);

    // Check fiber path references (simplified)
    await this.prisma.network_joint_closures.delete({ where: { id } });

    // Remove from network_nodes
    await this.prisma.network_nodes.deleteMany({ where: { type: 'JC' as never, code: jc.code } }).catch(() => {});

    return { success: true, message: 'Joint closure deleted' };
  }

  // ==================== FIBER PATHS ====================

  async listFiberPaths(params: { status?: string; search?: string }) {
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.search) where.OR = [{ name: { contains: params.search } }];

    return this.prisma.network_fiber_paths.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFiberPath(id: string) {
    const path = await this.prisma.network_fiber_paths.findUnique({ where: { id } });
    if (!path) throw new HttpException('Fiber path not found', HttpStatus.NOT_FOUND);
    return path;
  }

  async createFiberPath(body: Record<string, unknown>) {
    return this.prisma.network_fiber_paths.create({
      data: {
        id: `fp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: body.name as string,
        pathNodes: (body.pathNodes as any) || [],
        cableType: body.cableType as string,
        usedCores: (body.usedCores as any) || {},
        length: (body.length as number) || null,
        status: (body.status as string) || 'active',
        lastVerified: body.lastVerified ? new Date(body.lastVerified as string) : null,
        verifiedBy: (body.verifiedBy as string) || null,
        affectedCustomers: (body.affectedCustomers as number) || 0,
      },
    });
  }

  async updateFiberPath(id: string, body: Record<string, unknown>) {
    try {
      return await this.prisma.network_fiber_paths.update({ where: { id }, data: body as never });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Fiber path not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteFiberPath(id: string) {
    try {
      await this.prisma.network_fiber_paths.delete({ where: { id } });
      return { success: true, message: 'Fiber path deleted' };
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Fiber path not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  // ==================== AUTO-CONNECT ====================

  async autoConnect(body: { sourceId: string; sourceType: string; targetId: string; targetType: string; cableSpec?: Record<string, unknown> }) {
    // Simplified auto-connect — creates cable + segment
    const cableId = `cable_auto_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const segmentId = `seg_auto_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    return this.prisma.$transaction(async (tx) => {
      const cable = await tx.fiber_cables.create({
        data: {
          id: cableId,
          code: `AUTO-${body.sourceType}-${body.targetType}-${Date.now()}`,
          name: `Auto: ${body.sourceType}→${body.targetType}`,
          cableType: 'SM_G652' as never,
          tubeCount: 1, coresPerTube: 1, totalCores: 1,
        },
      });

      const segment = await tx.cable_segments.create({
        data: {
          id: segmentId, cableId: cable.id,
          fromDeviceType: body.sourceType, fromDeviceId: body.sourceId,
          toDeviceType: body.targetType, toDeviceId: body.targetId,
          lengthMeters: 0, attenuationPerKm: 0.35,
        },
      });

      return {
        cable, segment,
        summary: `Connected ${body.sourceType}→${body.targetType}`,
      };
    });
  }

  // ==================== MAP SETTINGS ====================

  async getMapSettings() {
    let settings = await this.prisma.mapSettings.findFirst();
    if (!settings) {
      settings = await this.prisma.mapSettings.create({
        data: { id: 'default' },
      });
    }
    return settings;
  }

  async updateMapSettings(body: Record<string, unknown>) {
    const existing = await this.prisma.mapSettings.findFirst();
    if (existing) {
      return this.prisma.mapSettings.update({ where: { id: existing.id }, data: body as never });
    }
    return this.prisma.mapSettings.create({ data: { id: 'default', ...body } as never });
  }

  // ==================== HELPERS ====================

  private async syncToNetworkNodes(type: string, id: string, code: string, name: string, latitude: number, longitude: number, address: string | null) {
    const existing = await this.prisma.network_nodes.findFirst({ where: { code } });
    if (existing) {
      await this.prisma.network_nodes.update({
        where: { id: existing.id },
        data: { name, latitude, longitude, address },
      });
    } else {
      await this.prisma.network_nodes.create({
        data: {
          id: `node_${type}_${id}`,
          type: type as never,
          code, name, latitude, longitude, address,
        },
      });
    }
  }
}
