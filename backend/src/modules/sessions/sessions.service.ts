import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getTimezoneOffsetMs } from '../../common/utils/timezone';
import { MikrotikService } from '../mikrotik/mikrotik.service';
import { SessionSyncService } from '../session-sync/session-sync.service';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(2)} ${units[exponent]}`;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

async function getLatestMacByUsernames(prisma: PrismaService, usernames: string[]): Promise<Map<string, string>> {
  if (usernames.length === 0) return new Map();
  const rows = await prisma.radacct.findMany({
    where: { username: { in: usernames }, callingstationid: { not: '' } },
    select: { username: true, callingstationid: true, acctstarttime: true },
    orderBy: { acctstarttime: 'desc' },
  });
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!map.has(row.username) && row.callingstationid) {
      map.set(row.username, row.callingstationid);
    }
  }
  return map;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mikrotikService: MikrotikService,
    private readonly sessionSyncService: SessionSyncService,
  ) {}

  /**
   * Mark stale radacct sessions as stopped.
   * Ported from /api/sessions cleanupStaleSessions().
   */
  async cleanupStaleSessions(): Promise<number> {
    const STALE_HOURS = 8;
    try {
      const result = await this.prisma.$executeRawUnsafe(`
        UPDATE radacct
        SET acctstoptime = acctupdatetime,
            acctterminatecause = 'Lost-Carrier',
            acctsessiontime = TIMESTAMPDIFF(SECOND, acctstarttime, acctupdatetime)
        WHERE acctstoptime IS NULL
          AND acctupdatetime IS NOT NULL
          AND TIMESTAMPDIFF(HOUR, acctupdatetime, NOW()) > ${STALE_HOURS}
          AND TIMESTAMPDIFF(HOUR, acctupdatetime, NOW()) < 720
      `);
      const total = Number(result);
      if (total > 0) this.logger.log(`[Sessions] Cleaned up ${total} stale radacct session(s)`);
      return total;
    } catch (err) {
      this.logger.error('[Sessions] Failed to cleanup stale sessions:', err);
      return 0;
    }
  }

  /**
   * List active sessions — ported from /api/sessions GET handler.
   * Live traffic overlay (MikroTik API) is deferred to integration batch.
   */
  async listActiveSessions(params: {
    type?: string; routerId?: string; search?: string;
    page?: number; limit?: number; live?: boolean;
  }) {
    const type = params.type;
    const routerId = params.routerId;
    const search = params.search;
    const page = params.page || 1;
    const limit = params.limit || 0;

    // 0. Cleanup stale sessions
    await this.cleanupStaleSessions();

    // 1. Get active routers
    const routerWhere: Record<string, unknown> = { isActive: true };
    if (routerId) routerWhere.id = routerId;

    const routers = await this.prisma.router.findMany({
      where: routerWhere as never,
      select: { id: true, name: true, nasname: true, ipAddress: true, username: true, password: true, port: true },
    });

    const routerByNasIp = new Map<string, { id: string; name: string }>();
    const nasIpList: string[] = [];
    for (const r of routers) {
      routerByNasIp.set(r.nasname, { id: r.id, name: r.name });
      nasIpList.push(r.nasname);
      if (r.ipAddress && r.ipAddress !== r.nasname) {
        routerByNasIp.set(r.ipAddress, { id: r.id, name: r.name });
        nasIpList.push(r.ipAddress);
      }
    }

    // 2. Query radacct for active sessions
    const radacctWhere: Record<string, unknown> = { acctstoptime: null };
    if (routerId && nasIpList.length > 0) radacctWhere.nasipaddress = { in: nasIpList };
    if (search) {
      radacctWhere.OR = [
        { username: { contains: search } },
        { framedipaddress: { contains: search } },
        { callingstationid: { contains: search } },
      ];
    }

    const activeSessions = await this.prisma.radacct.findMany({
      where: radacctWhere as never,
      orderBy: { acctstarttime: 'desc' },
    });

    // 3. Determine session types
    const allUsernames = [...new Set(activeSessions.map((s) => s.username))];

    const [pppoeUsers, hotspotVouchers] = await Promise.all([
      this.prisma.pppoeUser.findMany({
        where: { username: { in: allUsernames } },
        select: {
          id: true, username: true, customerId: true, name: true, phone: true,
          profile: { select: { name: true } },
          area: { select: { id: true, name: true } },
        },
      }),
      this.prisma.hotspotVoucher.findMany({
        where: { code: { in: allUsernames } },
        select: {
          id: true, code: true, status: true, batchCode: true,
          firstLoginAt: true, expiresAt: true,
          agent: { select: { id: true, name: true } },
          profile: { select: { name: true } },
          router: { select: { id: true, name: true } },
        },
      }),
    ]);

    const pppoeByUsername = new Map(pppoeUsers.map((u) => [u.username, u]));
    const voucherByCode = new Map(hotspotVouchers.map((v) => [v.code, v]));

    // 4. Build response
    const TZ_OFFSET_MS = getTimezoneOffsetMs();
    const now = Date.now() + TZ_OFFSET_MS;

    // 4b. Synthetic hotspot sessions
    const activeHotspotUsernames = new Set(
      activeSessions.filter((s) => voucherByCode.has(s.username)).map((s) => s.username),
    );

    const nowDate = new Date();
    const orphanedVoucherWhere: Record<string, unknown> = {
      status: 'ACTIVE',
      firstLoginAt: { not: null },
      code: { notIn: [...activeHotspotUsernames] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: nowDate } }],
    };
    if (routerId) orphanedVoucherWhere.routerId = routerId;

    let orphanedActiveVouchers = await this.prisma.hotspotVoucher.findMany({
      where: orphanedVoucherWhere as never,
      select: {
        id: true, code: true, status: true, batchCode: true,
        firstLoginAt: true, expiresAt: true,
        agent: { select: { id: true, name: true } },
        profile: { select: { name: true } },
        router: { select: { id: true, name: true, nasname: true } },
      },
    });

    const lastKnownIpMap = new Map<string, string>();
    if (orphanedActiveVouchers.length > 0) {
      const orphanCodes = orphanedActiveVouchers.map((v) => v.code);
      const stoppedRows = await this.prisma.radacct.findMany({
        where: { username: { in: orphanCodes }, acctstoptime: { not: null } },
        select: { username: true, acctstoptime: true, framedipaddress: true },
        orderBy: { acctstoptime: 'desc' },
      });
      const latestStopMap = new Map<string, Date>();
      for (const r of stoppedRows) {
        if (r.acctstoptime && !latestStopMap.has(r.username)) {
          latestStopMap.set(r.username, new Date(r.acctstoptime));
        }
        if (r.framedipaddress && !lastKnownIpMap.has(r.username)) {
          lastKnownIpMap.set(r.username, r.framedipaddress);
        }
      }
      orphanedActiveVouchers = orphanedActiveVouchers.filter((v) => {
        const latestStop = latestStopMap.get(v.code);
        if (!latestStop || !v.firstLoginAt) return true;
        return latestStop.getTime() < new Date(v.firstLoginAt).getTime();
      });
    }

    const syntheticHotspotSessions = orphanedActiveVouchers.map((voucher) => {
      const effectiveStartMs = new Date(voucher.firstLoginAt!).getTime();
      const effectiveStartTime = new Date(effectiveStartMs).toISOString();
      const duration = Math.max(0, Math.floor((now - effectiveStartMs) / 1000));
      const router = voucher.router
        ? { id: voucher.router.id, name: voucher.router.name }
        : { id: 'unknown', name: 'Unknown' };
      return {
        id: `voucher-${voucher.id}`,
        username: voucher.code,
        sessionId: null,
        type: 'hotspot' as const,
        nasIpAddress: voucher.router?.nasname || null,
        framedIpAddress: lastKnownIpMap.get(voucher.code) || null,
        macAddress: '-',
        calledStationId: '-',
        startTime: effectiveStartTime,
        lastUpdate: null,
        duration,
        durationFormatted: formatDuration(duration),
        uploadBytes: 0, downloadBytes: 0, totalBytes: 0,
        uploadFormatted: formatBytes(0),
        downloadFormatted: formatBytes(0),
        totalFormatted: formatBytes(0),
        router,
        user: null,
        voucher: {
          id: voucher.id, status: voucher.status,
          profile: voucher.profile?.name ?? null,
          batchCode: voucher.batchCode,
          expiresAt: voucher.expiresAt ? new Date(voucher.expiresAt).toISOString() : null,
          agent: voucher.agent ? { id: voucher.agent.id, name: voucher.agent.name } : null,
        },
        dataSource: 'radius' as const,
      };
    });

    let allSessions: any[] = [
      ...activeSessions
        .filter((acct) => pppoeByUsername.has(acct.username) || voucherByCode.has(acct.username))
        .map((acct) => {
          const pppoeUser = pppoeByUsername.get(acct.username);
          const voucher = voucherByCode.get(acct.username);
          const sessionType: 'pppoe' | 'hotspot' = pppoeUser ? 'pppoe' : 'hotspot';

          const rawStartMs = acct.acctstarttime ? new Date(acct.acctstarttime).getTime() : now;
          let effectiveStartMs = rawStartMs;
          let effectiveStartTime: string | null = acct.acctstarttime ? new Date(rawStartMs).toISOString() : null;

          if (sessionType === 'hotspot' && voucher?.firstLoginAt) {
            effectiveStartMs = new Date(voucher.firstLoginAt).getTime();
            effectiveStartTime = new Date(effectiveStartMs).toISOString();
          }

          let duration: number;
          const rawUpdateMs = acct.acctupdatetime ? new Date(acct.acctupdatetime).getTime() : 0;
          if (rawUpdateMs > effectiveStartMs) {
            duration = Math.floor((rawUpdateMs - effectiveStartMs) / 1000);
          } else {
            duration = Number(acct.acctsessiontime ?? 0);
            if (duration === 0) {
              duration = Math.max(0, Math.floor((now - effectiveStartMs) / 1000));
            }
          }

          if (acct.acctstarttime && duration > 0) {
            effectiveStartTime = new Date(now - duration * 1000).toISOString();
          }

          const uploadBytes = Number(acct.acctinputoctets ?? 0);
          const downloadBytes = Number(acct.acctoutputoctets ?? 0);
          const router = routerByNasIp.get(acct.nasipaddress) || { id: 'unknown', name: acct.nasipaddress };
          return {
            id: String(acct.radacctid),
            username: acct.username,
            sessionId: acct.acctsessionid,
            type: sessionType,
            nasIpAddress: acct.nasipaddress,
            framedIpAddress: acct.framedipaddress || null,
            macAddress: acct.callingstationid || '',
            calledStationId: acct.calledstationid || '-',
            startTime: effectiveStartTime,
            lastUpdate: acct.acctstarttime && duration > 0
              ? new Date(now).toISOString()
              : (acct.acctupdatetime ? new Date(acct.acctupdatetime).toISOString() : null),
            duration,
            durationFormatted: formatDuration(duration),
            uploadBytes, downloadBytes,
            totalBytes: uploadBytes + downloadBytes,
            uploadFormatted: formatBytes(uploadBytes),
            downloadFormatted: formatBytes(downloadBytes),
            totalFormatted: formatBytes(uploadBytes + downloadBytes),
            router: { id: router.id, name: router.name },
            user: sessionType === 'pppoe' && pppoeUser
              ? {
                  id: pppoeUser.id,
                  customerId: pppoeUser.customerId ?? null,
                  name: pppoeUser.name,
                  phone: pppoeUser.phone,
                  profile: pppoeUser.profile?.name ?? null,
                  area: pppoeUser.area ?? null,
                }
              : null,
            voucher: sessionType === 'hotspot' && voucher
              ? {
                  id: voucher.id, status: voucher.status,
                  profile: voucher.profile?.name ?? null,
                  batchCode: voucher.batchCode,
                  expiresAt: voucher.expiresAt ? new Date(voucher.expiresAt).toISOString() : null,
                  agent: voucher.agent ? { id: voucher.agent.id, name: voucher.agent.name } : null,
                }
              : null,
            dataSource: 'radius',
          };
        }),
      ...syntheticHotspotSessions,
    ];

    // 4c. Historical MAC fallback
    const missingMacUsernames = [
      ...new Set(
        allSessions
          .filter((s) => s.type === 'hotspot' && (!s.macAddress || s.macAddress === '-'))
          .map((s) => s.username),
      ),
    ];
    if (missingMacUsernames.length > 0) {
      const historicalMacMap = await getLatestMacByUsernames(this.prisma, missingMacUsernames);
      allSessions = allSessions.map((s) => {
        if (s.type !== 'hotspot') return s;
        if (s.macAddress && s.macAddress !== '-') return s;
        const historicalMac = historicalMacMap.get(s.username);
        return historicalMac ? { ...s, macAddress: historicalMac } : s;
      });
    }

    // 4d. Live traffic overlay deferred to integration batch

    // 5. Filter by session type
    if (type) {
      allSessions = allSessions.filter((s) => s.type === type);
    }

    // 6. Stats
    const stats = {
      total: allSessions.length,
      pppoe: allSessions.filter((s) => s.type === 'pppoe').length,
      hotspot: allSessions.filter((s) => s.type === 'hotspot').length,
      totalUpload: allSessions.reduce((sum, s) => sum + s.uploadBytes, 0),
      totalDownload: allSessions.reduce((sum, s) => sum + s.downloadBytes, 0),
    };
    const totalBandwidth = stats.totalUpload + stats.totalDownload;

    // 7. Pagination
    const paginatedSessions = limit > 0
      ? allSessions.slice((page - 1) * limit, (page - 1) * limit + limit)
      : allSessions;

    // 8. All-time stats
    const allTimeStats = await this.prisma.radacct.aggregate({
      _sum: { acctinputoctets: true, acctoutputoctets: true, acctsessiontime: true },
      _count: { radacctid: true },
    });

    const totalAllTimeBytes =
      Number(allTimeStats._sum.acctinputoctets ?? 0) +
      Number(allTimeStats._sum.acctoutputoctets ?? 0);

    return {
      sessions: paginatedSessions,
      stats: {
        ...stats,
        totalBandwidth,
        totalUploadFormatted: formatBytes(stats.totalUpload),
        totalDownloadFormatted: formatBytes(stats.totalDownload),
        totalBandwidthFormatted: formatBytes(totalBandwidth),
      },
      allTimeStats: {
        totalSessions: allTimeStats._count.radacctid ?? 0,
        totalBandwidth: totalAllTimeBytes,
        totalBandwidthFormatted: formatBytes(totalAllTimeBytes),
        totalDuration: allTimeStats._sum.acctsessiontime ?? 0,
        totalDurationFormatted: formatDuration(allTimeStats._sum.acctsessiontime ?? 0),
      },
      pagination: {
        page,
        limit: limit > 0 ? limit : allSessions.length,
        total: allSessions.length,
        totalPages: limit > 0 ? Math.max(1, Math.ceil(allSessions.length / limit)) : 1,
      },
    };
  }

  /**
   * Get realtime sessions from MikroTik API — ported from /api/sessions/realtime.
   * Fetches live hotspot and PPPoE sessions via node-routeros.
   */
  async getRealtimeSessions(routerId?: string) {
    const [hotspotResult, pppoeResult] = await Promise.all([
      this.mikrotikService.getHotspotSessions(routerId),
      this.mikrotikService.getPppoeSessions(routerId),
    ]);

    return {
      hotspot: hotspotResult.sessions,
      pppoe: pppoeResult.sessions,
      errors: [...hotspotResult.errors, ...pppoeResult.errors],
      total: hotspotResult.sessions.length + pppoeResult.sessions.length,
    };
  }

  /**
   * Export sessions — ported from /api/sessions/export
   * Excel/PDF generation is deferred to integration batch (requires exceljs/pdfkit).
   * Returns raw session data in JSON for now.
   */
  async exportSessions(params: {
    format?: string; type?: string; routerId?: string; username?: string;
    startDate?: string; endDate?: string; mode?: string;
  }) {
    const mode = params.mode || 'history';

    if (mode === 'active') {
      const activeSessions = await this.prisma.radacct.findMany({
        where: {
          acctstoptime: null,
          ...(params.username && { username: { contains: params.username } }),
          ...(params.routerId && { nasipaddress: params.routerId }),
        },
        orderBy: { acctstarttime: 'desc' },
      });

      const routers = await this.prisma.router.findMany();
      const routerMap = new Map(routers.map((r) => [r.nasname, r.name]));

      const data = activeSessions.map((s, idx) => ({
        no: idx + 1,
        username: s.username,
        sessionId: s.acctsessionid,
        nasIp: s.nasipaddress,
        router: routerMap.get(s.nasipaddress) || s.nasipaddress,
        framedIp: s.framedipaddress,
        macAddress: s.callingstationid,
        startTime: s.acctstarttime,
        duration: s.acctsessiontime ? formatDuration(Number(s.acctsessiontime)) : 'N/A',
        upload: formatBytes(Number(s.acctinputoctets || 0)),
        download: formatBytes(Number(s.acctoutputoctets || 0)),
        total: formatBytes(Number(s.acctinputoctets || 0) + Number(s.acctoutputoctets || 0)),
      }));

      return {
        format: 'json',
        mode: 'active',
        data,
        stats: {
          totalSessions: data.length,
          totalUpload: activeSessions.reduce((sum, s) => sum + Number(s.acctinputoctets || 0), 0),
          totalDownload: activeSessions.reduce((sum, s) => sum + Number(s.acctoutputoctets || 0), 0),
        },
        note: 'Excel/PDF generation deferred to integration batch. Returns JSON.',
      };
    }

    // History mode
    const where: Record<string, unknown> = {};
    if (params.username) where.username = { contains: params.username };
    if (params.routerId) where.nasipaddress = params.routerId;
    if (params.type === 'pppoe') {
      where.username = { contains: params.username || '' };
    }
    if (params.startDate && params.endDate) {
      where.acctstarttime = {
        gte: new Date(params.startDate),
        lte: new Date(params.endDate),
      };
    }

    const historySessions = await this.prisma.radacct.findMany({
      where: where as never,
      orderBy: { acctstarttime: 'desc' },
      take: 1000, // Limit for export
    });

    const routers = await this.prisma.router.findMany();
    const routerMap = new Map(routers.map((r) => [r.nasname, r.name]));

    const data = historySessions.map((s, idx) => ({
      no: idx + 1,
      username: s.username,
      sessionId: s.acctsessionid,
      nasIp: s.nasipaddress,
      router: routerMap.get(s.nasipaddress) || s.nasipaddress,
      framedIp: s.framedipaddress,
      macAddress: s.callingstationid,
      startTime: s.acctstarttime,
      stopTime: s.acctstoptime,
      duration: s.acctsessiontime ? formatDuration(Number(s.acctsessiontime)) : 'N/A',
      upload: formatBytes(Number(s.acctinputoctets || 0)),
      download: formatBytes(Number(s.acctoutputoctets || 0)),
      total: formatBytes(Number(s.acctinputoctets || 0) + Number(s.acctoutputoctets || 0)),
      terminateCause: s.acctterminatecause,
    }));

    return {
      format: 'json',
      mode: 'history',
      data,
      stats: {
        totalSessions: data.length,
        totalUpload: historySessions.reduce((sum, s) => sum + Number(s.acctinputoctets || 0), 0),
        totalDownload: historySessions.reduce((sum, s) => sum + Number(s.acctoutputoctets || 0), 0),
      },
      note: 'Excel/PDF generation deferred to integration batch. Returns JSON.',
    };
  }

  /**
   * Trigger session sync — ported from /api/sessions/sync.
   * Delegates to SessionSyncService for PPPoE and hotspot sync jobs.
   */
  async syncSessions(type?: string) {
    const syncType = type || 'all';
    if (syncType === 'pppoe') {
      return this.sessionSyncService.syncPppoeSessions();
    }
    if (syncType === 'hotspot') {
      return this.sessionSyncService.syncHotspotSessions();
    }
    const [pppoe, hotspot] = await Promise.all([
      this.sessionSyncService.syncPppoeSessions(),
      this.sessionSyncService.syncHotspotSessions(),
    ]);
    return { pppoe, hotspot };
  }
}
