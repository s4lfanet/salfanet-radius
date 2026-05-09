import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';
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

function buildZteDeleteCommands(frame: number, slot: number, port: number, onuId: number): string[] {
  const ponPort = port + 1;
  const onuInterface = `gpon-onu_${frame}/${slot}/${ponPort}:${onuId}`;
  const oltInterface = `gpon-olt_${frame}/${slot}/${ponPort}`;

  return [
    'configure terminal',
    `pon-onu-mng ${onuInterface}`,
    'no wan-ip 1',
    'no wan-ip 2',
    'no wan-ip 3',
    'no wan-ip 4',
    'no vlan port veip_1',
    'no service INTERNET',
    'no service BRIDGE',
    'no service VOIP',
    'no service ACS',
    'exit',
    `interface ${onuInterface}`,
    'no service-port 1',
    'no service-port 2',
    'no service-port 3',
    'no service-port 4',
    'no service-port 5',
    'no service-port 6',
    'no service-port 7',
    'no service-port 8',
    'no gemport 1 traffic-limit downstream',
    'no gemport 2 traffic-limit downstream',
    'no gemport 3 traffic-limit downstream',
    'no gemport 4 traffic-limit downstream',
    'no gemport 1',
    'no gemport 2',
    'no gemport 3',
    'no gemport 4',
    'no tcont 1',
    'no tcont 2',
    'no tcont 3',
    'no tcont 4',
    'exit',
    `interface ${oltInterface}`,
    `no onu ${onuId}`,
    'exit',
    'end',
  ];
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; onuId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { id: oltId, onuId } = await params;

    const [olt, onu] = await Promise.all([
      prisma.networkOLT.findUnique({ where: { id: oltId } }),
      prisma.oltOnuStatus.findFirst({ where: { id: onuId, oltId } }),
    ]);

    if (!olt) return NextResponse.json({ error: 'OLT not found' }, { status: 404 });
    if (!onu) return NextResponse.json({ error: 'ONU not found' }, { status: 404 });

    const vendor = (olt.vendor ?? '').toLowerCase();
    if (vendor !== 'zte' || !olt.telnetEnabled || !olt.username || !olt.password) {
      return NextResponse.json({ error: 'Delete ONU saat ini hanya didukung untuk ZTE via Telnet' }, { status: 400 });
    }

    const telnetConfig: TelnetConfig = {
      host: olt.ipAddress,
      port: olt.telnetPort ?? 23,
      username: olt.username,
      password: olt.password,
      timeout: 25,
    };

    const commands = buildZteDeleteCommands(onu.frame, onu.slot, onu.port, onu.onuId);
    const transcript = await executeMultipleCommands(telnetConfig, commands, { sendEnd: false });
    const output = transcript.output ?? transcript.error ?? '';
    const unregisterSection = extractCommandSection(output, commands.length - 2, commands[commands.length - 2]) || normalizeTelnetOutput(output);

    if (!transcript.success || /%Error|invalid input|invalid command|bad password/i.test(unregisterSection)) {
      return NextResponse.json({
        error: unregisterSection || 'Failed to delete ONU from OLT',
      }, { status: 500 });
    }

    // Keep the ONU row visible as unregistered so the operator can re-register it.
    // We do NOT call pollOLTWithOptions here because:
    //   • The ZTE OLT needs ~10–30 seconds to process the deletion and report the
    //     ONU as unregistered in its SEEN_ONU_TABLE (zxAnGponOnuDiscoveredInfoTable).
    //   • If we poll immediately, the poller won't find it in the uncfg list, and
    //     pruneMissingOnus (even with auth_failed guard) could still be confused.
    //   • The scheduled poller will pick up the new state within its next cycle.
    await prisma.oltOnuStatus.update({
      where: { id: onu.id },
      data: {
        status: 'auth_failed',
        customerId: null,
        updatedAt: new Date(),
        lastOfflineAt: new Date(),
      },
    }).catch(() => {});

    await prisma.oltMonitoringLog.create({
      data: {
        id: crypto.randomUUID(),
        oltId,
        logType: 'command',
        severity: 'info',
        message: `ONU ${onu.serialNumber ?? `${onu.frame}/${onu.slot}/${onu.port}:${onu.onuId}`} deleted from OLT by ${(session as any).user?.email ?? 'unknown'}`,
        data: {
          serialNumber: onu.serialNumber,
          location: `${onu.frame}/${onu.slot}/${onu.port}:${onu.onuId}`,
        },
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'ONU deleted successfully. It will appear in the unregistered list after the next sync.',
    });
  } catch (error: any) {
    console.error('[ONU Delete DELETE]', error);
    return NextResponse.json({ error: error.message ?? 'Failed to delete ONU' }, { status: 500 });
  }
}