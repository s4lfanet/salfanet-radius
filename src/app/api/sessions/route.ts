import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { getTimezoneOffsetMs } from '@/lib/timezone';
import { getOnlineUserDetail } from '@/server/cache/online-users.cache';

// ─── Formatting helpers ─────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
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

async function getLatestMacByUsernames(usernames: string[]): Promise<Map<string, string>> {
  if (usernames.length === 0) return new Map();

  const rows = await prisma.radacct.findMany({
    where: {
      username: { in: usernames },
      callingstationid: { not: '' },
    },
    select: {
      username: true,
      callingstationid: true,
      acctstarttime: true,
    },
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

// ─── Stale session cleanup ──────────────────────────────────────────────────────

/**
 * Mark stale radacct sessions as stopped.
 * A session is "stale" if acctstoptime IS NULL and acctupdatetime is older
 * than the threshold. This handles cases where MikroTik fails to send
 * Accounting-Stop (e.g. power outage, network issue).
 *
 * Threshold: 1 hour without any interim-update → mark as Lost-Carrier.
 */
async function cleanupStaleSessions(): Promise<number> {
  const STALE_THRESHOLD_MINUTES = 480; // 8 hours (MikroTik may not send interim updates regularly)
  try {
    const result = await prisma.$executeRawUnsafe(`
      UPDATE radacct
      SET acctstoptime = NOW(),
          acctterminatecause = 'Lost-Carrier',
          acctsessiontime = TIMESTAMPDIFF(SECOND, acctstarttime, acctupdatetime)
      WHERE acctstoptime IS NULL
        AND acctupdatetime < DATE_SUB(NOW(), INTERVAL ${STALE_THRESHOLD_MINUTES} MINUTE)
    `);
    if (result > 0) {
      console.log(`[Sessions] Cleaned up ${result} stale radacct session(s)`);
    }
    return result;
  } catch (err) {
    console.error('[Sessions] Failed to cleanup stale sessions:', err);
    return 0;
  }
}

// ─── GET handler: list active sessions from RADIUS (radacct) ────────────────

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type'); // 'pppoe' | 'hotspot' | null (both)
    const routerId = searchParams.get('routerId');
    const search = searchParams.get('search');
    const page = Number.parseInt(searchParams.get('page') || '1', 10);
    const limit = Number.parseInt(searchParams.get('limit') || '0', 10);

    // ── 0. Cleanup stale sessions (lightweight, runs inline) ────────────────
    await cleanupStaleSessions();

    // ── 1. Get active routers (for NAS IP → router mapping) ─────────────────
    const routerWhere: any = { isActive: true };
    if (routerId) routerWhere.id = routerId;

    const routers = await prisma.router.findMany({
      where: routerWhere,
      select: {
        id: true,
        name: true,
        nasname: true,
        ipAddress: true,
      },
    });

    // Build NAS IP → router mapping
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

    // ── 2. Query radacct for active sessions ────────────────────────────────
    // Active = acctstoptime IS NULL
    const radacctWhere: any = {
      acctstoptime: null,
    };

    // Filter by router NAS IPs if routerId is specified
    if (routerId && nasIpList.length > 0) {
      radacctWhere.nasipaddress = { in: nasIpList };
    }

    // Search filter (username, IP, MAC)
    if (search) {
      radacctWhere.OR = [
        { username: { contains: search } },
        { framedipaddress: { contains: search } },
        { callingstationid: { contains: search } },
      ];
    }

    const activeSessions = await prisma.radacct.findMany({
      where: radacctWhere,
      orderBy: { acctstarttime: 'desc' },
    });

    // ── 3. Determine session types ──────────────────────────────────────────
    // Look up all usernames in pppoeUser and hotspotVoucher
    const allUsernames = [...new Set(activeSessions.map((s) => s.username))];

    const [pppoeUsers, hotspotVouchers] = await Promise.all([
      prisma.pppoeUser.findMany({
        where: { username: { in: allUsernames } },
        select: {
          id: true,
          username: true,
          customerId: true,
          name: true,
          phone: true,
          profile: { select: { name: true } },
          area: { select: { id: true, name: true } },
        },
      }),
      prisma.hotspotVoucher.findMany({
        where: { code: { in: allUsernames } },
        select: {
          id: true,
          code: true,
          status: true,
          batchCode: true,
          firstLoginAt: true,
          expiresAt: true,
          agent: { select: { id: true, name: true } },
          profile: { select: { name: true } },
          router: { select: { id: true, name: true } },
        },
      }),
    ]);

    const pppoeByUsername = new Map(pppoeUsers.map((u) => [u.username, u]));
    const voucherByCode = new Map(hotspotVouchers.map((v) => [v.code, v]));

    // ── 4. Build response sessions ──────────────────────────────────────────
    // All DB dates are WIB-as-UTC (Prisma reads WIB DATETIME and appends Z).
    // Dates sent to client stay in WIB-as-UTC — frontend uses formatWIB().
    // Duration calc uses WIB-aware "now" so both sides are in the same space.
    const TZ_OFFSET_MS = getTimezoneOffsetMs();
    const now = Date.now() + TZ_OFFSET_MS; // WIB-as-UTC epoch for duration calc
    // ── 4b. Synthetic hotspot sessions: ACTIVE vouchers with no radacct record ──
    // Covers cases where MikroTik authenticated successfully but no
    // Accounting-Start was recorded in radacct.
    // We query DB separately because allUsernames only contains codes already in radacct.
    const activeHotspotUsernames = new Set(
      activeSessions
        .filter((s) => voucherByCode.has(s.username))
        .map((s) => s.username),
    );

    const orphanedVoucherWhere: any = {
      status: 'ACTIVE',
      firstLoginAt: { not: null },
      code: { notIn: [...activeHotspotUsernames] },
    };
    if (routerId) orphanedVoucherWhere.routerId = routerId;

    let orphanedActiveVouchers = await prisma.hotspotVoucher.findMany({
      where: orphanedVoucherWhere,
      select: {
        id: true,
        code: true,
        status: true,
        batchCode: true,
        firstLoginAt: true,
        expiresAt: true,
        agent: { select: { id: true, name: true } },
        profile: { select: { name: true } },
        router: { select: { id: true, name: true, nasname: true } },
      },
    });

    // Filter out vouchers that have a stopped radacct record — they properly
    // disconnected and are NOT currently online.
    if (orphanedActiveVouchers.length > 0) {
      const orphanCodes = orphanedActiveVouchers.map(v => v.code);
      const accountedOrphans = await prisma.radacct.findMany({
        where: { username: { in: orphanCodes } },
        select: { username: true },
        distinct: ['username'],
      });
      const accountedSet = new Set(accountedOrphans.map(r => r.username));
      orphanedActiveVouchers = orphanedActiveVouchers.filter(v => !accountedSet.has(v.code));
    }

    const orphanedRedisDetails = await Promise.allSettled(
      orphanedActiveVouchers.map((v) => getOnlineUserDetail(v.code)),
    );

    const syntheticHotspotSessions = orphanedActiveVouchers.map((voucher, i) => {
        const effectiveStartMs = new Date(voucher.firstLoginAt!).getTime();
        const effectiveStartTime = new Date(effectiveStartMs).toISOString();
        const duration = Math.max(0, Math.floor((now - effectiveStartMs) / 1000));
        const router =
          voucher.router
            ? { id: voucher.router.id, name: voucher.router.name }
            : { id: 'unknown', name: 'Unknown' };
        const redis = orphanedRedisDetails[i].status === 'fulfilled' ? orphanedRedisDetails[i].value : null;
        const uploadBytes = redis?.inputOctets ?? 0;
        const downloadBytes = redis?.outputOctets ?? 0;
        return {
          id: `voucher-${voucher.id}`,
          username: voucher.code,
          sessionId: redis?.sessionId || null,
          type: 'hotspot' as const,
          nasIpAddress: voucher.router?.nasname || null,
          framedIpAddress: redis?.framedIp || null,
          macAddress: redis?.callingStationId || '-',
          calledStationId: '-',
          startTime: effectiveStartTime,
          lastUpdate: null,
          duration,
          durationFormatted: formatDuration(duration),
          uploadBytes,
          downloadBytes,
          totalBytes: uploadBytes + downloadBytes,
          uploadFormatted: formatBytes(uploadBytes),
          downloadFormatted: formatBytes(downloadBytes),
          totalFormatted: formatBytes(uploadBytes + downloadBytes),
          router,
          user: null,
          voucher: {
            id: voucher.id,
            status: voucher.status,
            profile: voucher.profile?.name ?? null,
            batchCode: voucher.batchCode,
            expiresAt: voucher.expiresAt
              ? new Date(voucher.expiresAt).toISOString()
              : null,
            agent: voucher.agent
              ? { id: voucher.agent.id, name: voucher.agent.name }
              : null,
          },
          dataSource: 'radius' as const,
        };
      });

    let allSessions = [...activeSessions.map((acct) => {
      const pppoeUser = pppoeByUsername.get(acct.username);
      const voucher = voucherByCode.get(acct.username);
      const sessionType: 'pppoe' | 'hotspot' = pppoeUser ? 'pppoe' : 'hotspot';

      // Both acctstarttime and firstLoginAt are stored as WIB naive DATETIME.
      // Prisma appends Z so getTime() gives WIB-as-UTC epoch — matches our
      // WIB-as-UTC "now" for correct duration calculation.
      const rawStartMs = acct.acctstarttime
        ? new Date(acct.acctstarttime).getTime()
        : now;

      let effectiveStartMs = rawStartMs;
      let effectiveStartTime: string | null = acct.acctstarttime
        ? new Date(rawStartMs).toISOString()
        : null;

      if (sessionType === 'hotspot' && voucher?.firstLoginAt) {
        effectiveStartMs = new Date(voucher.firstLoginAt).getTime();
        effectiveStartTime = new Date(effectiveStartMs).toISOString();
      }

      const duration = Math.max(0, Math.floor((now - effectiveStartMs) / 1000));

      // Use radacct bytes (updated by Interim-Update packets from router)
      const uploadBytes   = Number(acct.acctinputoctets  ?? 0);
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
        lastUpdate: acct.acctupdatetime
          ? new Date(acct.acctupdatetime).toISOString()
          : null,
        duration,
        durationFormatted: formatDuration(duration),
        uploadBytes,
        downloadBytes,
        totalBytes: uploadBytes + downloadBytes,
        uploadFormatted: formatBytes(uploadBytes),
        downloadFormatted: formatBytes(downloadBytes),
        totalFormatted: formatBytes(uploadBytes + downloadBytes),
        router: { id: router.id, name: router.name },
        user:
          sessionType === 'pppoe' && pppoeUser
            ? {
                id: pppoeUser.id,
                customerId: pppoeUser.customerId ?? null,
                name: pppoeUser.name,
                phone: pppoeUser.phone,
                profile: pppoeUser.profile?.name ?? null,
                area: pppoeUser.area ?? null,
              }
            : null,
        voucher:
          sessionType === 'hotspot' && voucher
            ? {
                id: voucher.id,
                status: voucher.status,
                profile: voucher.profile?.name ?? null,
                batchCode: voucher.batchCode,
                expiresAt: voucher.expiresAt
                  ? new Date(voucher.expiresAt).toISOString()
                  : null,
                agent: voucher.agent
                  ? { id: voucher.agent.id, name: voucher.agent.name }
                  : null,
              }
            : null,
        dataSource: 'radius',
      };
    }), ...syntheticHotspotSessions];

    // ── 4c. Redis enrichment for hotspot sessions missing MAC/IP ────────────
    // Covers: radacct entry exists but callingstationid/framedipaddress are
    // empty (MikroTik sent Accounting-Start without those attributes, but
    // the REST hook captured them and stored in Redis).
    const hotspotSessionsMissingData = allSessions.filter(
      (s) => s.type === 'hotspot' && (!s.macAddress || !s.framedIpAddress),
    );
    if (hotspotSessionsMissingData.length > 0) {
      const redisEnrich = await Promise.allSettled(
        hotspotSessionsMissingData.map((s) => getOnlineUserDetail(s.username)),
      );
      const redisMap = new Map<string, Awaited<ReturnType<typeof getOnlineUserDetail>>>();
      hotspotSessionsMissingData.forEach((s, i) => {
        const r = redisEnrich[i];
        if (r.status === 'fulfilled' && r.value) redisMap.set(s.username, r.value);
      });
      allSessions = allSessions.map((s) => {
        if (s.type !== 'hotspot') return s;
        const redis = redisMap.get(s.username);
        if (!redis) return s;
        return {
          ...s,
          framedIpAddress: s.framedIpAddress || redis.framedIp || null,
          macAddress: s.macAddress || redis.callingStationId || '-',
        };
      });
    }

    // ── 4d. Historical MAC fallback from radacct ───────────────────────────
    // If current active row and Redis still miss MAC, reuse latest known MAC
    // from previous accounting rows for the same username.
    const missingMacUsernames = [
      ...new Set(
        allSessions
          .filter((s) => s.type === 'hotspot' && (!s.macAddress || s.macAddress === '-'))
          .map((s) => s.username),
      ),
    ];
    if (missingMacUsernames.length > 0) {
      const historicalMacMap = await getLatestMacByUsernames(missingMacUsernames);
      allSessions = allSessions.map((s) => {
        if (s.type !== 'hotspot') return s;
        if (s.macAddress && s.macAddress !== '-') return s;
        const historicalMac = historicalMacMap.get(s.username);
        return historicalMac ? { ...s, macAddress: historicalMac } : s;
      });
    }

    // ── 5. Filter by session type ─────────────────────────────────────────────────
    if (type) {
      allSessions = allSessions.filter((s) => s.type === type);
    }

    // ── 6. Stats ────────────────────────────────────────────────────────────
    const stats = {
      total: allSessions.length,
      pppoe: allSessions.filter((s) => s.type === 'pppoe').length,
      hotspot: allSessions.filter((s) => s.type === 'hotspot').length,
      totalUpload: allSessions.reduce((sum, s) => sum + s.uploadBytes, 0),
      totalDownload: allSessions.reduce((sum, s) => sum + s.downloadBytes, 0),
    };
    const totalBandwidth = stats.totalUpload + stats.totalDownload;

    // ── 7. Pagination ───────────────────────────────────────────────────────
    const paginatedSessions =
      limit > 0
        ? allSessions.slice((page - 1) * limit, (page - 1) * limit + limit)
        : allSessions;

    // ── 8. Historical all-time stats from radacct ───────────────────────────
    const allTimeStats = await prisma.radacct.aggregate({
      _sum: {
        acctinputoctets: true,
        acctoutputoctets: true,
        acctsessiontime: true,
      },
      _count: { radacctid: true },
    });

    const totalAllTimeBytes =
      Number(allTimeStats._sum.acctinputoctets ?? 0) +
      Number(allTimeStats._sum.acctoutputoctets ?? 0);

    return NextResponse.json({
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
        totalDurationFormatted: formatDuration(
          allTimeStats._sum.acctsessiontime ?? 0,
        ),
      },
      pagination: {
        page,
        limit: limit > 0 ? limit : allSessions.length,
        total: allSessions.length,
        totalPages:
          limit > 0 ? Math.max(1, Math.ceil(allSessions.length / limit)) : 1,
      },
      mode: 'radius',
    });
  } catch (error) {
    console.error('[Sessions API] Failed to list active sessions', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
