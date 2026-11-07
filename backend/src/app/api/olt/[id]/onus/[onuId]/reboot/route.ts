import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { Client as SSHClient } from 'ssh2';
import type { TelnetConfig } from '@/lib/olt/telnet';
import { rebootZteOnu } from '@/lib/olt/onu-reboot';
import { rebootOnu as rebootHiosoOnu } from '@/lib/olt/vendors/hioso';

// POST - Reboot a single ONU via SSH command to the parent OLT
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; onuId: string }> }
) {
  const authCheck = await requirePermission('network.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { id: oltId, onuId } = await params;

    const olt = await prisma.networkOLT.findUnique({ where: { id: oltId } });
    if (!olt) return NextResponse.json({ error: 'OLT not found' }, { status: 404 });

    const onu = await prisma.oltOnuStatus.findUnique({ where: { id: onuId } });
    if (!onu) return NextResponse.json({ error: 'ONU not found' }, { status: 404 });

    if (!olt.sshEnabled && !olt.telnetEnabled) {
      return NextResponse.json(
        { error: 'OLT does not have SSH or Telnet enabled' },
        { status: 400 }
      );
    }

    const vendor = (olt.vendor ?? '').toLowerCase();
    const password = olt.password ?? '';

    let success = false;
    let commandLabel = '';
    let failureDetail = '';

    if (vendor === 'hioso') {
      if (!olt.telnetEnabled || !olt.username) {
        return NextResponse.json({ error: 'Reboot ONU Hioso memakai Telnet. Aktifkan Telnet dan isi login OLT' }, { status: 400 });
      }
      const reason = await rebootHiosoOnu(
        { host: olt.ipAddress, username: olt.username, password, telnetPort: olt.telnetPort, telnetEnabled: true, model: olt.model },
        onu.port,
        onu.onuId,
      );
      success = reason === null;
      commandLabel = `epon onu ${onu.onuId} reset (PON ${onu.port})`;
      failureDetail = reason ?? '';
    } else if (vendor === 'zte' && olt.telnetEnabled && olt.username && password) {
      const telnetConfig: TelnetConfig = {
        host: olt.ipAddress,
        port: olt.telnetPort ?? 23,
        username: olt.username,
        password,
        timeout: 20,
      };
      const reboot = await rebootZteOnu(telnetConfig, onu);
      success = reboot.ok;
      commandLabel = reboot.label;
      failureDetail = reboot.detail;
    } else if (olt.sshEnabled && password) {
      const rebootCmd = buildRebootCommand(vendor, onu.frame, onu.slot, onu.port, onu.onuId);
      success = await sshCommand(
        olt.ipAddress,
        olt.sshPort ?? 22,
        olt.username ?? 'admin',
        password,
        rebootCmd,
      );
      commandLabel = rebootCmd;
    } else {
      return NextResponse.json(
        { error: 'Telnet or SSH credentials not configured on this OLT' },
        { status: 400 }
      );
    }

    if (success) {
      await prisma.oltMonitoringLog.create({
        data: {
          oltId,
          logType: 'command',
          severity: 'info',
          message: `ONU ${onu.serialNumber ?? `${onu.frame}/${onu.slot}/${onu.port}/${onu.onuId}`} reboot command sent (${commandLabel})`,
        },
      });
      return NextResponse.json({ success: true, message: 'Reboot command sent' });
    }

    return NextResponse.json({ error: failureDetail || 'Failed to send reboot command' }, { status: 500 });
  } catch (err: any) {
    console.error('ONU reboot error:', err);
    return NextResponse.json({ error: err.message ?? 'Reboot failed' }, { status: 500 });
  }
}

function buildRebootCommand(vendor: string, frame: number, slot: number, port: number, onuId: number): string {
  switch (vendor) {
    case 'zte':
      // DB port is zero-based, ZTE CLI is one-based
      return `pon onu reset gpon-onu_${frame}/${slot}/${port + 1}:${onuId}`;
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
