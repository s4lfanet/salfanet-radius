import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OltService {
  private readonly logger = new Logger(OltService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== OLT DETAIL ====================

  async getOltDetail(id: string, onuStatus?: string) {
    const olt = await this.prisma.networkOLT.findUnique({
      where: { id },
      include: {
        routers: { include: { router: { select: { id: true, name: true, nasname: true, shortname: true } } } },
        onuStatuses: onuStatus ? { where: { status: onuStatus as never } } : true,
        alerts: { where: { isResolved: false }, orderBy: { createdAt: 'desc' }, take: 20 },
        performanceMetrics: { orderBy: { recordedAt: 'desc' }, take: 24 },
        monitoringLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });

    if (!olt) throw new HttpException('OLT not found', HttpStatus.NOT_FOUND);
    return olt;
  }

  async updateOlt(id: string, body: {
    vendor?: string; model?: string; firmwareVersion?: string;
    snmpEnabled?: boolean; snmpCommunity?: string; snmpPort?: number;
    telnetEnabled?: boolean; telnetPort?: number;
    sshEnabled?: boolean; sshPort?: number;
    username?: string; password?: string;
    monitoringEnabled?: boolean; pollingInterval?: number;
    routerIds?: string[];
  }) {
    const olt = await this.prisma.networkOLT.findUnique({ where: { id } });
    if (!olt) throw new HttpException('OLT not found', HttpStatus.NOT_FOUND);

    const { routerIds, ...updateData } = body;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.networkOLT.update({
        where: { id },
        data: updateData as never,
      });

      if (routerIds !== undefined) {
        // Remove existing router assignments
        await tx.networkOLTRouter.deleteMany({ where: { oltId: id } });
        // Add new assignments
        for (const routerId of routerIds) {
          await tx.networkOLTRouter.create({
            data: {
              id: `oltrouter_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              oltId: id, routerId,
            },
          });
        }
      }

      return updated;
    });
  }

  // ==================== CHASSIS ====================

  async getChassis(id: string) {
    const olt = await this.prisma.networkOLT.findUnique({
      where: { id },
      include: { onuStatuses: { select: { frame: true, slot: true, port: true, onuId: true, status: true } } },
    });
    if (!olt) throw new HttpException('OLT not found', HttpStatus.NOT_FOUND);

    // Telnet/SNMP chassis scan deferred — return DB-based slot layout
    const slotMap = new Map<number, { portCount: number; onus: number }>();
    for (const onu of olt.onuStatuses) {
      const slot = onu.slot || 0;
      if (!slotMap.has(slot)) slotMap.set(slot, { portCount: 0, onus: 0 });
      const slotData = slotMap.get(slot)!;
      slotData.onus++;
      if (onu.port > slotData.portCount) slotData.portCount = onu.port;
    }

    const chassis = Array.from(slotMap.entries()).map(([slot, data]) => ({
      slot,
      type: 'service',
      cardType: olt.vendor === 'zte' ? 'ETGO' : 'unknown',
      portCount: data.portCount || 16,
      ports: [],
      uplinkIfaces: [],
    }));

    return { chassis, vendor: olt.vendor, method: 'database' };
  }

  // ==================== ONU REGISTER (metadata only) ====================

  async getOnuRegisterMetadata(id: string, params: { frame?: number; slot?: number; port?: number; onuId?: number; serialNumber?: string }) {
    const olt = await this.prisma.networkOLT.findUnique({ where: { id } });
    if (!olt) throw new HttpException('OLT not found', HttpStatus.NOT_FOUND);

    // Telnet-based metadata retrieval deferred
    // Return basic metadata from DB
    const existingOnus = await this.prisma.oltOnuStatus.findMany({
      where: { oltId: id, frame: params.frame || 0, slot: params.slot || 0, port: params.port || 0 },
      select: { onuId: true, status: true },
    });

    const usedOnuIds = new Set(existingOnus.map((o) => o.onuId));
    let suggestedOnuId = 1;
    while (usedOnuIds.has(suggestedOnuId)) suggestedOnuId++;

    return {
      metadata: {
        onuTypes: ['ZTE-F660', 'ZTE-F601', 'Huawei-HG8245', 'FiberHome-AN5506'],
        tcontProfiles: ['TCONT-100M', 'TCONT-200M', 'TCONT-500M'],
        trafficProfiles: ['UP-100M', 'DOWN-100M', 'UP-200M', 'DOWN-200M'],
        suggestedOnuId,
        detectedOnuType: null, // Would be detected via Telnet
      },
      note: 'Telnet-based metadata retrieval deferred. Using DB-based suggested ONU ID.',
    };
  }

  async registerOnu(id: string, body: {
    frame: number; slot: number; port: number; onuId: number;
    serialNumber: string; onuType?: string; vlan?: number;
    description?: string; serviceTemplate?: string;
  }) {
    const olt = await this.prisma.networkOLT.findUnique({ where: { id } });
    if (!olt) throw new HttpException('OLT not found', HttpStatus.NOT_FOUND);

    // Telnet-based ONU registration deferred
    // Create DB record only
    const onu = await this.prisma.oltOnuStatus.create({
      data: {
        oltId: id,
        frame: body.frame, slot: body.slot, port: body.port, onuId: body.onuId,
        serialNumber: body.serialNumber,
        description: body.description || null,
        status: 'offline' as never,
      },
    });

    await this.prisma.oltMonitoringLog.create({
      data: {
        oltId: id,
        logType: 'poll' as never,
        message: `ONU registered: frame ${body.frame}/slot ${body.slot}/port ${body.port}/onu ${body.onuId} (SN: ${body.serialNumber})`,
        severity: 'info' as never,
      },
    });

    return {
      success: true,
      message: 'ONU registered in database. Telnet-based OLT registration deferred.',
      onu,
    };
  }

  // ==================== ONU DETAIL ====================

  async getOnuDetail(oltId: string, onuId: string) {
    const onu = await this.prisma.oltOnuStatus.findFirst({
      where: { oltId, id: onuId },
      include: {
        customer: {
          select: { id: true, username: true, name: true, phone: true, email: true, address: true,
            profile: { select: { name: true } }, area: { select: { name: true } } },
        },
      },
    });

    if (!onu) throw new HttpException('ONU not found', HttpStatus.NOT_FOUND);

    // Telnet-based detail-info, running-config, optical power deferred
    return {
      ...onu,
      telnetDetail: null,
      telnetConfig: null,
      telnetOptical: null,
      note: 'Telnet-based ONU detail retrieval deferred.',
    };
  }

  // ==================== ONU DELETE ====================

  async deleteOnu(oltId: string, onuId: string) {
    const onu = await this.prisma.oltOnuStatus.findFirst({
      where: { oltId, id: onuId },
    });
    if (!onu) throw new HttpException('ONU not found', HttpStatus.NOT_FOUND);

    // Telnet-based ONU deletion from OLT deferred
    await this.prisma.oltOnuStatus.update({
      where: { id: onu.id },
      data: { status: 'auth_failed' as never },
    });

    await this.prisma.oltMonitoringLog.create({
      data: {
        oltId,
        logType: 'poll' as never,
        message: `ONU deleted: frame ${onu.frame}/slot ${onu.slot}/port ${onu.port}/onu ${onu.onuId} (SN: ${onu.serialNumber})`,
        severity: 'info' as never,
      },
    });

    return {
      success: true,
      message: 'ONU marked as auth_failed in database. Telnet-based OLT deletion deferred. ONU will appear in unregistered list after next sync.',
    };
  }

  // ==================== ONU STATUS LIST ====================

  async listOnuStatuses(oltId: string, status?: string) {
    const where: Record<string, unknown> = { oltId };
    if (status) where.status = status;

    return this.prisma.oltOnuStatus.findMany({
      where: where as never,
      include: { customer: { select: { id: true, username: true, name: true } } },
      orderBy: [{ frame: 'asc' }, { slot: 'asc' }, { port: 'asc' }, { onuId: 'asc' }],
    });
  }

  // ==================== ALERTS ====================

  async listAlerts(oltId: string, params: { isResolved?: boolean; severity?: string }) {
    const where: Record<string, unknown> = { oltId };
    if (params.isResolved !== undefined) where.isResolved = params.isResolved;
    if (params.severity) where.severity = params.severity;

    return this.prisma.oltAlert.findMany({
      where: where as never,
      include: { onu: { select: { id: true, serialNumber: true, description: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async resolveAlert(alertId: string, resolvedBy: string) {
    return this.prisma.oltAlert.update({
      where: { id: alertId },
      data: { isResolved: true, resolvedAt: new Date(), resolvedBy },
    });
  }

  // ==================== PERFORMANCE METRICS ====================

  async listPerformanceMetrics(oltId: string, limit?: number) {
    return this.prisma.oltPerformanceMetric.findMany({
      where: { oltId },
      orderBy: { recordedAt: 'desc' },
      take: limit || 100,
    });
  }

  // ==================== ALERT SETTINGS ====================

  async getAlertSettings(oltId?: string) {
    const where: Record<string, unknown> = {};
    if (oltId) where.oltId = oltId;
    return this.prisma.oltAlertSettings.findMany({ where: where as never });
  }

  async updateAlertSettings(id: string, body: Record<string, unknown>) {
    try {
      return await this.prisma.oltAlertSettings.update({ where: { id }, data: body as never });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Alert settings not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }
}
