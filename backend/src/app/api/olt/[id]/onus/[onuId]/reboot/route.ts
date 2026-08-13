import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { Client as SSHClient } from 'ssh2';
import { executeMultipleCommands, TelnetConfig } from '@/lib/olt/telnet';

function normalizeTelnetOutput(output: string): string {
  return output
    .replace(/\r/g, '')
    .replace(/\x08/g, '')
    .replace(/--More--/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractCommandSection(output: string, index: number, command: string): string {
  const startToken = `__COPILOT_CMD_${index}_START__`;
  const endToken = `__COPILOT_CMD_${index}_END__`;
  const start = output.indexOf(startToken);
  if (start === -1) return '';
  const from = start + startToken.length;
  const end = output.indexOf(endToken, from);
  const section = end === -1 ? output.slice(from) : output.slice(from, end);
  const lines = normalizeTelnetOutput(section)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  while (lines.length && lines[0].trim() === command.trim()) lines.shift();
  while (lines.length && /^[A-Za-z0-9_.-]+[>#]/.test(lines[lines.length - 1].trim())) lines.pop();

  return lines.join('\n').trim();
}

// POST - Reboot a single ONU via SSH command to the parent OLT
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; onuId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

    if (vendor === 'zte' && olt.telnetEnabled && olt.username && password) {
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
      ], { sendEnd: false });
      const output = result.output ?? result.error ?? '';
      const rebootOutput = extractCommandSection(output, 2, 'reboot') || normalizeTelnetOutput(output);
      success = result.success && !/%Error|invalid input|invalid command|bad password/i.test(rebootOutput);
      commandLabel = `pon-onu-mng ${iface} -> reboot`;
      failureDetail = rebootOutput;
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
