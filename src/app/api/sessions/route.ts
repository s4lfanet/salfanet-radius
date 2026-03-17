import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { RouterOSAPI } from 'node-routeros';
import { getTimezoneOffsetMs } from '@/lib/timezone';

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

/** Parse MikroTik uptime string like "3d9h5m3s" → seconds */
function parseMikrotikUptime(uptime: string): number {
  let seconds = 0;
  const dMatch = uptime.match(/(\d+)d/);
  const hMatch = uptime.match(/(\d+)h/);
  const mMatch = uptime.match(/(\d+)m/);
  const sMatch = uptime.match(/(\d+)s/);
  if (dMatch) seconds += parseInt(dMatch[1]) * 86400;
  if (hMatch) seconds += parseInt(hMatch[1]) * 3600;
  if (mMatch) seconds += parseInt(mMatch[1]) * 60;
  if (sMatch) seconds += parseInt(sMatch[1]);
  return seconds;
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

// ─── Stale session cleanup ──────────────────────────────────────────────────

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
    const live = searchParams.get('live') === 'true'; // Merge live bytes from MikroTik API
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

    // ── 1.5. Fetch live bytes from MikroTik when live=true ──────────────────
    // PPPoE: traffic bytes from /interface/print (rx-byte, tx-byte)
    // Hotspot: traffic bytes from /ip/hotspot/active/print (bytes-in, bytes-out)
    const liveTrafficMap = new Map<string, { uploadBytes: number; downloadBytes: number }>();
    // Full hotspot session data from MikroTik (for synthesizing sessions missing from radacct)
    const liveHotspotSessions = new Map<string, {
      uploadBytes: number;
      downloadBytes: number;
      framedIp: string | null;
      macAddress: string | null;
      nasIp: string;
      uptime: string | null;
    }>();
    if (live) {
      const routerCredWhere: any = { isActive: true };
      if (routerId) routerCredWhere.id = routerId;
      const routersWithCreds = await prisma.router.findMany({
        where: routerCredWhere,
        select: { nasname: true, ipAddress: true, username: true, password: true, port: true },
      });
      await Promise.allSettled(routersWithCreds.map(async (r) => {
        const api = new RouterOSAPI({
          host: r.ipAddress || r.nasname,
          port: r.port || 8728,
          user: r.username,
          password: r.password,
          timeout: 5,
        });
        try {
          await api.connect();

          // ── PPPoE: /interface/print (only when not filtering to hotspot-only)
          if (!type || type === 'pppoe') {
            try {
              const pppoeIfaces = await api.write('/interface/print', ['?type=pppoe-in']);
              for (const iface of pppoeIfaces) {
                const ifName: string = iface.name || '';
                const match = ifName.match(/^<pppoe-(.+)>$/);
                const username = match ? match[1] : '';
                if (username && iface.running === 'true') {
                  liveTrafficMap.set(username, {
                    // rx-byte = bytes received BY router FROM client → client's UPLOAD
                    // tx-byte = bytes sent BY router TO client → client's DOWNLOAD
                    uploadBytes:   parseInt(iface['rx-byte'] || '0'),
                    downloadBytes: parseInt(iface['tx-byte'] || '0'),
                  });
                }
              }
            } catch {
              // PPPoE fetch failed for this router — ignore
            }
          }

          // ── Hotspot: /ip/hotspot/active/print (only when not filtering to pppoe-only)
          if (!type || type === 'hotspot') {
            try {
              const hotspotActive = await api.write('/ip/hotspot/active/print');
              const nasIp = r.ipAddress || r.nasname;
              for (const entry of hotspotActive) {
                const username: string = entry.user || entry.username || '';
                if (username) {
                  const uploadBytes   = parseInt(entry['bytes-in']  || '0');
                  const downloadBytes = parseInt(entry['bytes-out'] || '0');
                  liveTrafficMap.set(username, { uploadBytes, downloadBytes });
                  liveHotspotSessions.set(username, {
                    uploadBytes,
                    downloadBytes,
                    framedIp: entry.address || entry['address'] || null,
                    macAddress: entry['mac-address'] || null,
                    nasIp,
                    uptime: entry.uptime || null,
                  });
                }
              }
            } catch {
              // Hotspot active fetch failed for this router — ignore
            }
          }

          await api.close();
        } catch {
          // Connection failed for this router — keep stale radacct data as fallback
        }
      }));
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
    let allSessions = activeSessions.map((acct) => {
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

      // Use live traffic from MikroTik API if available, fallback to radacct data
      const liveBytes = liveTrafficMap.get(acct.username);
      const uploadBytes   = liveBytes ? liveBytes.uploadBytes   : Number(acct.acctinputoctets  ?? 0);
      const downloadBytes = liveBytes ? liveBytes.downloadBytes : Number(acct.acctoutputoctets ?? 0);
      const router = routerByNasIp.get(acct.nasipaddress) || { id: 'unknown', name: acct.nasipaddress };
      return {
        id: String(acct.radacctid),
        username: acct.username,
        sessionId: acct.acctsessionid,
        type: sessionType,
        nasIpAddress: acct.nasipaddress,
        framedIpAddress: acct.framedipaddress || null,
        macAddress: acct.callingstationid || '-',
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
    });

    // ── 4.5. Synthesize sessions for hotspot users active in MikroTik but missing from radacct ──
    if (live && liveHotspotSessions.size > 0) {
      const radacctUsernames = new Set(allSessions.map((s) => s.username));
      const missingUsernames = [...liveHotspotSessions.keys()].filter(
        (u) => !radacctUsernames.has(u),
      );

      if (missingUsernames.length > 0) {
        // Fetch vouchers for users that are in MikroTik but not in radacct
        const extraVouchers = await prisma.hotspotVoucher.findMany({
          where: { code: { in: missingUsernames } },
          select: {
            id: true,
            code: true,
            status: true,
            batchCode: true,
            firstLoginAt: true,
            expiresAt: true,
            agent: { select: { id: true, name: true } },
            profile: { select: { name: true } },
          },
        });
        const extraVoucherByCode = new Map(extraVouchers.map((v) => [v.code, v]));

        for (const username of missingUsernames) {
          const liveData = liveHotspotSessions.get(username)!;
          const voucher = extraVoucherByCode.get(username);
          if (!voucher) continue; // Skip unknown usernames

          // Compute start time: prefer voucher firstLoginAt (true UTC), then MikroTik uptime
          let effectiveStartMs: number = now;
          let effectiveStartTime: string = new Date(now).toISOString();
          if (voucher.firstLoginAt) {
            effectiveStartMs = new Date(voucher.firstLoginAt).getTime();
            effectiveStartTime = new Date(effectiveStartMs).toISOString();
          } else if (liveData.uptime) {
            const uptimeSec = parseMikrotikUptime(liveData.uptime);
            effectiveStartMs = now - uptimeSec * 1000;
            effectiveStartTime = new Date(effectiveStartMs).toISOString();
          }

          const duration = Math.max(0, Math.floor((now - effectiveStartMs) / 1000));
          const router = routerByNasIp.get(liveData.nasIp) || {
            id: 'live',
            name: liveData.nasIp,
          };

          allSessions.push({
            id: `live-${username}`,
            username,
            sessionId: `live-${username}`,
            type: 'hotspot' as const,
            nasIpAddress: liveData.nasIp,
            framedIpAddress: liveData.framedIp || null,
            macAddress: liveData.macAddress || '-',
            calledStationId: '-',
            startTime: effectiveStartTime,
            lastUpdate: null,
            duration,
            durationFormatted: formatDuration(duration),
            uploadBytes: liveData.uploadBytes,
            downloadBytes: liveData.downloadBytes,
            totalBytes: liveData.uploadBytes + liveData.downloadBytes,
            uploadFormatted: formatBytes(liveData.uploadBytes),
            downloadFormatted: formatBytes(liveData.downloadBytes),
            totalFormatted: formatBytes(
              liveData.uploadBytes + liveData.downloadBytes,
            ),
            router: { id: router.id, name: router.name },
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
            dataSource: 'live',
          });
        }
      }
    }

    // ── 5. Filter by session type ───────────────────────────────────────────
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
      liveTraffic: liveTrafficMap.size > 0,
    });
  } catch (error) {
    console.error('[Sessions API] Failed to list active sessions', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
