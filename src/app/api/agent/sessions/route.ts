import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { RouterOSAPI } from 'node-routeros';
import { getTimezoneOffsetMs } from '@/lib/timezone';

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

function parseMikrotikUptime(uptime: string): number {
  let seconds = 0;
  const dMatch = uptime.match(/(\d+)d/);
  const hMatch = uptime.match(/(\d+)h/);
  const mMatch = uptime.match(/(\d+)m/);
  const sMatch = uptime.match(/(\d+)s/);
  if (dMatch) seconds += parseInt(dMatch[1], 10) * 86400;
  if (hMatch) seconds += parseInt(hMatch[1], 10) * 3600;
  if (mMatch) seconds += parseInt(mMatch[1], 10) * 60;
  if (sMatch) seconds += parseInt(sMatch[1], 10);
  return seconds;
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

    // ── Fetch live bytes from MikroTik /ip/hotspot/active/print ─────────────
    const liveTrafficMap = new Map<string, { uploadBytes: number; downloadBytes: number }>();
    const liveHotspotSessions = new Map<string, {
      uploadBytes: number;
      downloadBytes: number;
      framedIp: string | null;
      macAddress: string | null;
      nasIp: string;
      uptime: string | null;
    }>();
    const nasIpSet = new Set([
      ...sessions.map((s) => s.nasipaddress).filter(Boolean),
      ...vouchers.map((v) => v.router?.nasname).filter(Boolean),
    ]);

    if (nasIpSet.size > 0) {
      const routers = await prisma.router.findMany({
        where: {
          isActive: true,
          OR: [
            { nasname: { in: [...nasIpSet] as string[] } },
            { ipAddress: { in: [...nasIpSet] as string[] } },
          ]
        },
        select: { nasname: true, ipAddress: true, username: true, password: true, port: true }
      });

      await Promise.allSettled(routers.map(async (r) => {
        const api = new RouterOSAPI({
          host: r.ipAddress || r.nasname,
          port: r.port || 8728,
          user: r.username,
          password: r.password,
          timeout: 5,
        });
        try {
          await api.connect();
          const hotspotActive = await api.write('/ip/hotspot/active/print');
          await api.close();
          const nasIp = r.ipAddress || r.nasname;
          for (const entry of hotspotActive) {
            const username: string = entry.user || entry.username || '';
            if (username) {
              const uploadBytes = parseInt(entry['bytes-in'] || '0');
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
          // Connection failed — fall back to radacct data
        }
      }));
    }

    // Map sessions with live traffic merged in
    // All DB dates are WIB-as-UTC. Use WIB-aware "now" for duration calc.
    const TZ_OFFSET_MS = getTimezoneOffsetMs();
    const now = Date.now() + TZ_OFFSET_MS;

    const sessionsWithProfile = sessions.map((session: any) => {
      const voucher = vouchers.find(v => v.code === session.username);
      const routerName = voucher?.router?.name ||
        vouchers.find(v => v.router?.nasname === session.nasipaddress)?.router?.name || null;

      const liveBytes = liveTrafficMap.get(session.username);
      const uploadBytes   = liveBytes ? liveBytes.uploadBytes   : Number(session.acctinputoctets  ?? 0);
      const downloadBytes = liveBytes ? liveBytes.downloadBytes : Number(session.acctoutputoctets ?? 0);

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

    const sessionUsernames = new Set(sessionsWithProfile.map((session) => session.username));
    const missingUsernames = [...liveHotspotSessions.keys()].filter(
      (username) => voucherCodes.includes(username) && !sessionUsernames.has(username),
    );

    for (const username of missingUsernames) {
      const liveData = liveHotspotSessions.get(username);
      const voucher = vouchers.find((item) => item.code === username);
      if (!liveData || !voucher) continue;

      let effectiveStartMs = now;
      let effectiveStartTime = new Date(now).toISOString().replace('Z', '');

      if (voucher.firstLoginAt) {
        effectiveStartMs = new Date(voucher.firstLoginAt).getTime();
        effectiveStartTime = new Date(effectiveStartMs).toISOString().replace('Z', '');
      } else if (liveData.uptime) {
        const uptimeSec = parseMikrotikUptime(liveData.uptime);
        effectiveStartMs = now - uptimeSec * 1000;
        effectiveStartTime = new Date(effectiveStartMs).toISOString().replace('Z', '');
      }

      const duration = Math.max(0, Math.floor((now - effectiveStartMs) / 1000));

      sessionsWithProfile.push({
        id: `live-${username}`,
        username,
        nasIpAddress: liveData.nasIp,
        nasPortId: '',
        framedIpAddress: liveData.framedIp,
        callingStationId: liveData.macAddress,
        calledStationId: '',
        acctSessionId: `live-${username}`,
        acctStartTime: effectiveStartTime,
        acctInputOctets: liveData.uploadBytes,
        acctOutputOctets: liveData.downloadBytes,
        acctSessionTime: duration,
        durationFormatted: formatDuration(duration),
        uploadFormatted: formatBytes(liveData.uploadBytes),
        downloadFormatted: formatBytes(liveData.downloadBytes),
        expiresAt: voucher.expiresAt
          ? new Date(voucher.expiresAt).toISOString()
          : null,
        profileName: voucher.profile?.name || null,
        routerName: voucher.router?.name || liveData.nasIp,
      });
    }

    return NextResponse.json({ sessions: sessionsWithProfile });
  } catch (error) {
    console.error('Get agent sessions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

