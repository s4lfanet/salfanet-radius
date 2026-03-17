import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
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

    // Synthetic sessions: AKTIF vouchers that have no active radacct entry.
    // This covers cases where MikroTik authenticated the user but no
    // Accounting-Start was recorded in radacct.
    const syntheticSessions = vouchers
      .filter(
        (v) =>
          v.status === 'ACTIVE' &&
          v.firstLoginAt !== null &&
          !activeRadacctCodes.has(v.code),
      )
      .map((voucher) => {
        const effectiveStartMs = new Date(voucher.firstLoginAt!).getTime();
        const effectiveStartTime = new Date(effectiveStartMs).toISOString().replace('Z', '');
        const duration = Math.max(0, Math.floor((now - effectiveStartMs) / 1000));
        return {
          id: `voucher-${voucher.id}`,
          username: voucher.code,
          nasIpAddress: voucher.router?.nasname || null,
          nasPortId: null,
          framedIpAddress: null,
          callingStationId: null,
          calledStationId: null,
          acctSessionId: null,
          acctStartTime: effectiveStartTime,
          acctInputOctets: 0,
          acctOutputOctets: 0,
          acctSessionTime: duration,
          durationFormatted: formatDuration(duration),
          uploadFormatted: formatBytes(0),
          downloadFormatted: formatBytes(0),
          expiresAt: voucher.expiresAt
            ? new Date(voucher.expiresAt).toISOString()
            : null,
          profileName: voucher.profile?.name || null,
          routerName: voucher.router?.name || null,
        };
      });

    return NextResponse.json({ sessions: [...sessionsWithProfile, ...syntheticSessions] });
  } catch (error) {
    console.error('Get agent sessions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

