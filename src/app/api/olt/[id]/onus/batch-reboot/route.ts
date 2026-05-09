import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { Client as SSHClient } from 'ssh2';
import { executeMultipleCommands, TelnetConfig } from '@/lib/olt/telnet';

// POST - Batch reboot multiple ONUs (up to 50 at once)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id: oltId } = await params;
    const { onuIds } = await request.json();

    if (!Array.isArray(onuIds) || onuIds.length === 0) {
      return NextResponse.json({ error: 'onuIds must be a non-empty array' }, { status: 400 });
    }
    if (onuIds.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 ONUs can be rebooted at once' }, { status: 400 });
    }

    const olt = await prisma.networkOLT.findUnique({ where: { id: oltId } });
    if (!olt) return NextResponse.json({ error: 'OLT not found' }, { status: 404 });

    if (!olt.sshEnabled && !olt.telnetEnabled) {
      return NextResponse.json({ error: 'OLT does not have SSH or Telnet enabled' }, { status: 400 });
    }

    const onus = await prisma.oltOnuStatus.findMany({
      where: { id: { in: onuIds }, oltId },
    });

    if (onus.length === 0) {
      return NextResponse.json({ error: 'No ONUs found' }, { status: 404 });
    }

    const vendor = (olt.vendor ?? '').toLowerCase();
    const password = olt.password ?? '';
    const results: { onuId: string; serialNumber: string; success: boolean; error?: string }[] = [];

    for (const onu of onus) {
      if (!password || !olt.username) {
        results.push({ onuId: onu.id, serialNumber: onu.serialNumber ?? onu.id, success: false, error: 'Credentials not configured' });
        continue;
      }
      try {
        let ok = false;
        if (vendor === 'zte' && olt.telnetEnabled) {
          const iface = `gpon-onu_${onu.frame}/${onu.slot}/${onu.port + 1}:${onu.onuId}`;
          const telnetConfig: TelnetConfig = {
            host: olt.ipAddress,
            port: olt.telnetPort ?? 23,
            username: olt.username,
            password,
            timeout: 20,
          };
          const result = await executeMultipleCommands(telnetConfig, [
            'configure terminal',
            `pon-onu-mng ${iface}`,
            'reboot',
            'exit',
            'end',
          ]);
          const output = result.output ?? result.error ?? '';
          ok = result.success && !/%Error|invalid input|invalid command|bad password/i.test(output);
        } else if (olt.sshEnabled) {
          const rebootCmd = buildRebootCommand(vendor, onu.frame, onu.slot, onu.port, onu.onuId);
          ok = await sshCommand(olt.ipAddress, olt.sshPort ?? 22, olt.username ?? 'admin', password, rebootCmd);
        }
        results.push({ onuId: onu.id, serialNumber: onu.serialNumber ?? onu.id, success: ok, error: ok ? undefined : 'Command failed' });
      } catch (e: any) {
        results.push({ onuId: onu.id, serialNumber: onu.serialNumber ?? onu.id, success: false, error: e.message });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    await prisma.oltMonitoringLog.create({
      data: {
        oltId,
        logType: 'command',
        severity: 'info',
        message: `Batch reboot: ${successCount}/${onus.length} ONUs rebooted successfully`,
      },
    });

    return NextResponse.json({ success: true, results, successCount, total: onus.length });
  } catch (err: any) {
    console.error('Batch reboot error:', err);
    return NextResponse.json({ error: err.message ?? 'Batch reboot failed' }, { status: 500 });
  }
}

function buildRebootCommand(vendor: string, frame: number, slot: number, port: number, onuId: number): string {
  switch (vendor) {
    case 'zte':
      return `pon onu reset gpon-onu_${frame}/${slot}/${port}:${onuId}`;
    case 'fiberhome':
      return `reset onu ${frame}/${slot}/${port}/${onuId}`;
    case 'bdcom':
    case 'raisecom':
      return `onu reset ${frame} ${slot} ${port} ${onuId}`;
    case 'huawei':
    default:
      return `ont reset ${frame} ${slot} ${port} ${onuId}`;
  }
}

function sshCommand(
  host: string,
  port: number,
  username: string,
  password: string,
  command: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = new SSHClient();
    let finished = false;

    const done = (ok: boolean) => {
      if (finished) return;
      finished = true;
      try { conn.end(); } catch { /* ignore */ }
      resolve(ok);
    };

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) return done(false);
        stream.on('close', () => done(true));
        stream.on('data', () => { /* consume output */ });
        stream.stderr.on('data', () => { /* ignore stderr */ });
      });
    });

    conn.on('error', () => done(false));
    setTimeout(() => done(false), 30000);

    conn.connect({
      host,
      port,
      username,
      password,
      readyTimeout: 15000,
      algorithms: {
        kex: ['diffie-hellman-group1-sha1', 'diffie-hellman-group14-sha1', 'diffie-hellman-group-exchange-sha1'],
        cipher: ['aes128-cbc', '3des-cbc', 'aes256-cbc', 'aes128-ctr', 'aes256-ctr'],
        serverHostKey: ['ssh-rsa', 'ssh-dss'],
        hmac: ['hmac-sha1', 'hmac-sha2-256'],
      },
    });
  });
}
