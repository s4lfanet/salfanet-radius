import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getTimezoneOffsetMs } from '@/lib/timezone';
import { getOnlineUserDetail } from '@/server/cache/online-users.cache';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, exp)).toFixed(2)} ${units[exp]}`;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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


export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');

    if (!agentId) {
      return NextResponse.json({ error: 'Agent ID required' }, { status: 400 });
    }

    // Get all vouchers for this agent
    const vouchers = await prisma.hotspotVoucher.findMany({
      where: {
        agentId,
      },
      select: {
        id: true,
        code: true,
        status: true,
        batchCode: true,
        firstLoginAt: true,
        expiresAt: true,
        profile: { select: { name: true } },
        router: { select: { name: true, nasname: true } }
      }
    });

    const voucherCodes = vouchers.map(v => v.code);

    if (voucherCodes.length === 0) {
      return NextResponse.json({ sessions: [] });
    }

    // Get active sessions for these vouchers from radacct
    const sessions = await prisma.radacct.findMany({
      where: {
        username: { in: voucherCodes },
        acctstoptime: null
      },
      orderBy: { acctstarttime: 'desc' },
      select: {
        radacctid: true,
        username: true,
        nasipaddress: true,
        nasportid: true,
        framedipaddress: true,
        callingstationid: true,
        calledstationid: true,
        acctsessionid: true,
        acctstarttime: true,
        acctinputoctets: true,
        acctoutputoctets: true,
        acctsessiontime: true,
      }
    });

    // All DB dates are WIB-as-UTC. Use WIB-aware "now" for duration calc.
    const TZ_OFFSET_MS = getTimezoneOffsetMs();
    const now = Date.now() + TZ_OFFSET_MS;

    // Build set of voucher codes that have an active radacct entry
    const activeRadacctCodes = new Set(sessions.map((s) => s.username));

    const sessionsWithProfile = sessions.map((session) => {
      const voucher = vouchers.find((v) => v.code === session.username);
      const routerName =
        voucher?.router?.name ||
        vouchers.find((v) => v.router?.nasname === session.nasipaddress)?.router?.name ||
        null;

      const uploadBytes = Number(session.acctinputoctets ?? 0);
      const downloadBytes = Number(session.acctoutputoctets ?? 0);

      const rawStartMs = session.acctstarttime
        ? new Date(session.acctstarttime).getTime()
        : now;

      // For hotspot: always prefer voucher firstLoginAt so displayed start time
      // matches the voucher "waktu digunakan" value seen in voucher list.
      let effectiveStartMs = rawStartMs;
      let effectiveStartTime: string | null = session.acctstarttime
        ? new Date(rawStartMs).toISOString().replace('Z', '')
        : null;

      if (voucher?.firstLoginAt) {
        effectiveStartMs = new Date(voucher.firstLoginAt).getTime();
        effectiveStartTime = new Date(effectiveStartMs).toISOString().replace('Z', '');
      }

      const duration = Math.max(0, Math.floor((now - effectiveStartMs) / 1000));

      return {
        id: session.radacctid.toString(),
        username: session.username,
        nasIpAddress: session.nasipaddress,
        nasPortId: session.nasportid,
        framedIpAddress: session.framedipaddress,
        callingStationId: session.callingstationid,
        calledStationId: session.calledstationid,
        acctSessionId: session.acctsessionid,
        acctStartTime: effectiveStartTime,
        acctInputOctets: uploadBytes,
        acctOutputOctets: downloadBytes,
        acctSessionTime: duration,
        durationFormatted: formatDuration(duration),
        uploadFormatted: formatBytes(uploadBytes),
        downloadFormatted: formatBytes(downloadBytes),
        expiresAt: voucher?.expiresAt
          ? new Date(voucher.expiresAt).toISOString()
          : null,
        profileName: voucher?.profile?.name || null,
        routerName,
      };
    });

    // Redis enrichment for real radacct sessions missing MAC/IP.
    // Covers the case where radacct has empty callingstationid/framedipaddress
    // but the REST accounting hook stored them in Redis.
    const realSessionsMissingData = sessionsWithProfile.filter(
      (s) => !s.callingStationId || !s.framedIpAddress,
    );
    if (realSessionsMissingData.length > 0) {
      const redisEnrich = await Promise.allSettled(
        realSessionsMissingData.map((s) => getOnlineUserDetail(s.username)),
      );
      const redisMap = new Map<string, Awaited<ReturnType<typeof getOnlineUserDetail>>>();
      realSessionsMissingData.forEach((s, i) => {
        const r = redisEnrich[i];
        if (r.status === 'fulfilled' && r.value) redisMap.set(s.username, r.value);
      });
      for (const s of sessionsWithProfile) {
        const redis = redisMap.get(s.username);
        if (!redis) continue;
        if (!s.framedIpAddress) s.framedIpAddress = redis.framedIp || '';
        if (!s.callingStationId) s.callingStationId = redis.callingStationId || '';
      }
    }

    // Synthetic sessions: ACTIVE vouchers that have no current radacct record.
    // A voucher is orphaned only if it authenticated (firstLoginAt set) but the
    // current login is not yet in radacct (Accounting-Start not received).
    // Only exclude if the LATEST stop record is >= firstLoginAt (already disconnected).
    // Vouchers with only OLD stop records have a new login → show as synthetic.
    const stoppedRows = await prisma.radacct.findMany({
      where: {
        username: { in: voucherCodes },
        acctstoptime: { not: null },
      },
      select: { username: true, acctstoptime: true, framedipaddress: true },
      orderBy: { acctstoptime: 'desc' },
    });
    // Build map: username → latest stop time
    const latestStopMap = new Map<string, Date>();
    // Build map: username → IP from most recent radacct row as fallback
    const lastKnownIpMap = new Map<string, string>();
    for (const r of stoppedRows) {
      if (r.acctstoptime && !latestStopMap.has(r.username)) {
        latestStopMap.set(r.username, new Date(r.acctstoptime));
      }
      if (r.framedipaddress && !lastKnownIpMap.has(r.username)) {
        lastKnownIpMap.set(r.username, r.framedipaddress);
      }
    }

    const nowMs = Date.now();
    const orphanedVouchers = vouchers.filter(
      (v) => {
        if (v.status !== 'ACTIVE') return false;
        if (!v.firstLoginAt) return false;
        if (activeRadacctCodes.has(v.code)) return false;
        // Exclude already-expired vouchers
        if (v.expiresAt !== null && new Date(v.expiresAt).getTime() <= nowMs) return false;
        // Only exclude if latest stop >= firstLoginAt (properly disconnected after latest login)
        const latestStop = latestStopMap.get(v.code);
        if (latestStop && latestStop.getTime() >= new Date(v.firstLoginAt).getTime()) return false;
        return true;
      }
    );

    const redisDetails = await Promise.allSettled(
      orphanedVouchers.map((v) => getOnlineUserDetail(v.code)),
    );

    const syntheticSessions = orphanedVouchers.map((voucher, i) => {
        const effectiveStartMs = new Date(voucher.firstLoginAt!).getTime();
        const effectiveStartTime = new Date(effectiveStartMs).toISOString().replace('Z', '');
        const duration = Math.max(0, Math.floor((now - effectiveStartMs) / 1000));
        const redis = redisDetails[i].status === 'fulfilled' ? redisDetails[i].value : null;
        const uploadBytes = redis?.inputOctets ?? 0;
        const downloadBytes = redis?.outputOctets ?? 0;
        return {
          id: `voucher-${voucher.id}`,
          username: voucher.code,
          nasIpAddress: voucher.router?.nasname || null,
          nasPortId: null,
          framedIpAddress: redis?.framedIp || lastKnownIpMap.get(voucher.code) || null,
          callingStationId: redis?.callingStationId || null,
          calledStationId: null,
          acctSessionId: redis?.sessionId || null,
          acctStartTime: effectiveStartTime,
          acctInputOctets: uploadBytes,
          acctOutputOctets: downloadBytes,
          acctSessionTime: duration,
          durationFormatted: formatDuration(duration),
          uploadFormatted: formatBytes(uploadBytes),
          downloadFormatted: formatBytes(downloadBytes),
          expiresAt: voucher.expiresAt
            ? new Date(voucher.expiresAt).toISOString()
            : null,
          profileName: voucher.profile?.name || null,
          routerName: voucher.router?.name || null,
        };
      });

    const allSessions = [...sessionsWithProfile, ...syntheticSessions];

    // Historical MAC fallback if both active row and Redis miss MAC.
    const missingMacUsernames = [
      ...new Set(
        allSessions
          .filter((s) => !s.callingStationId)
          .map((s) => s.username),
      ),
    ];
    if (missingMacUsernames.length > 0) {
      const historicalMacMap = await getLatestMacByUsernames(missingMacUsernames);
      for (const s of allSessions) {
        if (s.callingStationId) continue;
        const historicalMac = historicalMacMap.get(s.username);
        if (historicalMac) s.callingStationId = historicalMac;
      }
    }

    return NextResponse.json({ sessions: allSessions });
  } catch (error) {
    console.error('Get agent sessions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

