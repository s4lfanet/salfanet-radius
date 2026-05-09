import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';
import { executeMultipleCommands, TelnetConfig } from '@/lib/olt/telnet';

function parseKeyValueOutput(output: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of output.split('\n')) {
    const match = line.match(/^\s*([^:]{2,60}):\s*(.*?)\s*$/);
    if (match) parsed[match[1].trim()] = match[2].trim();
  }
  return parsed;
}

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
    .map(line => line.trimEnd())
    .filter(Boolean);

  while (lines.length && lines[0].trim() === command.trim()) lines.shift();
  while (lines.length && /^[A-Za-z0-9_.-]+[>#]/.test(lines[lines.length - 1].trim())) lines.pop();

  return lines.join('\n').trim();
}

function inferOntVendor(serial: string | null | undefined): string | null {
  const prefix = (serial ?? '').trim().slice(0, 4).toUpperCase();
  if (!prefix) return null;

  const map: Record<string, string> = {
    ZTEG: 'ZTE',
    ZTEC: 'ZTE',
    FHTT: 'FiberHome',
    HWTC: 'Huawei',
    HWTF: 'Huawei',
    ALCL: 'Nokia / Alcatel-Lucent',
    NOKA: 'Nokia',
    TPLG: 'TP-Link',
  };

  return map[prefix] ?? prefix;
}

function parseOnuConfigOutput(output: string) {
  const summary = {
    name: null as string | null,
    description: null as string | null,
    tcontProfiles: [] as string[],
    downstreamProfiles: [] as string[],
    serviceVlans: [] as number[],
    servicePorts: [] as Array<{ servicePort: number; vport: number; userVlan: number; vlan: number }>,
  };

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    let match = line.match(/^name\s+(.+)$/i);
    if (match) {
      summary.name = match[1].trim();
      continue;
    }

    match = line.match(/^description\s+(.+)$/i);
    if (match) {
      summary.description = match[1].trim();
      continue;
    }

    match = line.match(/^tcont\s+\d+(?:\s+name\s+\S+)?\s+profile\s+(\S+)/i);
    if (match) {
      const profile = match[1].trim();
      if (!summary.tcontProfiles.includes(profile)) summary.tcontProfiles.push(profile);
      continue;
    }

    match = line.match(/^gemport\s+\d+\s+traffic-limit\s+downstream\s+(\S+)/i);
    if (match) {
      const profile = match[1].trim();
      if (!summary.downstreamProfiles.includes(profile)) summary.downstreamProfiles.push(profile);
      continue;
    }

    match = line.match(/^service-port\s+(\d+)\s+vport\s+(\d+)\s+user-vlan\s+(\d+)\s+vlan\s+(\d+)/i);
    if (match) {
      const servicePort = Number(match[1]);
      const vport = Number(match[2]);
      const userVlan = Number(match[3]);
      const vlan = Number(match[4]);
      summary.servicePorts.push({ servicePort, vport, userVlan, vlan });
      if (!summary.serviceVlans.includes(vlan)) summary.serviceVlans.push(vlan);
    }
  }

  return summary;
}

function parseUnconfiguredOnuLine(
  output: string,
  target: { onuId?: number; serialNumber?: string | null }
) {
  const lines = normalizeTelnetOutput(output)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !/OnuIndex|OnuType|OnuSn|^-+/i.test(line));

  const candidates = lines
    .map(line => {
      const parts = line.split(/\s+/);
      if (parts.length < 3) return null;

      const idMatch = parts[0].match(/:(\d+)/);
      const normalizedInterface = parts[0]
        .replace('gpon_olt-', 'gpon-olt_')
        .replace('gpon-onu_', 'gpon-onu_');

      return {
        raw: line,
        interface: normalizedInterface,
        onuId: idMatch ? Number(idMatch[1]) : null,
        onuType: parts[1] !== 'N/A' ? parts[1] : null,
        serialNumber: parts[2] !== 'N/A' ? parts[2] : null,
        state: parts[3] ?? null,
      };
    })
    .filter((value): value is { raw: string; interface: string; onuId: number | null; onuType: string | null; serialNumber: string | null; state: string | null } => Boolean(value));

  const byId = target.onuId != null
    ? candidates.find(candidate => candidate.onuId === target.onuId)
    : null;
  const bySerial = target.serialNumber
    ? candidates.find(candidate => candidate.serialNumber?.toUpperCase() === target.serialNumber?.toUpperCase())
    : null;

  const match = byId ?? bySerial ?? candidates[0] ?? null;
  if (!match) return null;

  return {
    raw: match.raw,
    parsed: {
      OnuIndex: match.interface,
      OnuType: match.onuType ?? 'N/A',
      OnuSn: match.serialNumber ?? 'N/A',
      State: match.state ?? 'unknown',
    },
    summary: {
      vendor: inferOntVendor(match.serialNumber),
      serialPrefix: match.serialNumber?.slice(0, 4)?.toUpperCase() ?? null,
      detectedType: match.onuType,
      statusSource: 'show pon onu uncfg',
    },
    interface: match.interface,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; onuId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { id, onuId } = await params;
    const [olt, onu] = await Promise.all([
      prisma.networkOLT.findUnique({ where: { id } }),
      prisma.oltOnuStatus.findFirst({
        where: { id: onuId, oltId: id },
        include: {
          customer: {
            select: {
              id: true, username: true, name: true, phone: true, status: true,
              customerId: true, address: true,
              profile: { select: { name: true } },
              area: { select: { name: true } },
              odpAssignment: {
                select: {
                  portNumber: true,
                  odp: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    if (!olt) return NextResponse.json({ error: 'OLT not found' }, { status: 404 });
    if (!onu) return NextResponse.json({ error: 'ONU not found' }, { status: 404 });

    const iface = `gpon-onu_${onu.frame}/${onu.slot}/${onu.port + 1}:${onu.onuId}`;
    const ponIface = `gpon-olt_${onu.frame}/${onu.slot}/${onu.port + 1}`;
    const telnetConfigured = olt.telnetEnabled && olt.username && olt.password;
    const status = String(onu.status ?? '').toLowerCase();
    const isRegisteredOnu = status !== 'unregistered' && status !== 'auth_failed';
    const telnetConfig: TelnetConfig | null = telnetConfigured ? {
      host: olt.ipAddress,
      port: olt.telnetPort ?? 23,
      username: olt.username!,
      password: olt.password!,
      timeout: 20,
    } : null;

    const telnet = {
      interface: iface,
      ponInterface: ponIface,
      detail: {
        raw: '',
        parsed: {} as Record<string, string>,
        summary: {} as Record<string, any>,
      },
      optical: { raw: '', parsed: {} as Record<string, string> },
      config: {
        raw: '',
        parsed: {} as Record<string, string>,
        summary: {
          name: null as string | null,
          description: null as string | null,
          tcontProfiles: [] as string[],
          downstreamProfiles: [] as string[],
          serviceVlans: [] as number[],
          servicePorts: [] as Array<{ servicePort: number; vport: number; userVlan: number; vlan: number }>,
        },
      },
    };

    if (telnetConfig) {
      if (isRegisteredOnu) {
        const commands = [
          `show gpon onu detail-info ${iface}`,
          `show running-config interface ${iface}`,
        ];

        if (onu.rxPower === null || onu.distance === null) {
          commands.push(`show pon power onu-rx ${iface}`);
        }

        const transcript = await executeMultipleCommands(telnetConfig, commands, { sendEnd: false });
        const transcriptOutput = transcript.output ?? transcript.error ?? '';

        telnet.detail.raw = extractCommandSection(transcriptOutput, 0, commands[0]);
        telnet.detail.parsed = parseKeyValueOutput(telnet.detail.raw);
        telnet.config.raw = extractCommandSection(transcriptOutput, 1, commands[1]);
        telnet.config.parsed = parseKeyValueOutput(telnet.config.raw);
        telnet.config.summary = parseOnuConfigOutput(telnet.config.raw);

        if (commands.length > 2) {
          telnet.optical.raw = extractCommandSection(transcriptOutput, 2, commands[2]);
          telnet.optical.parsed = parseKeyValueOutput(telnet.optical.raw);
        }

        const serialNumber = telnet.detail.parsed['Serial number'] ?? onu.serialNumber;
        telnet.detail.summary = {
          vendor: inferOntVendor(serialNumber),
          serialPrefix: serialNumber?.slice(0, 4)?.toUpperCase() ?? null,
          adminState: telnet.detail.parsed['Admin state'] ?? null,
          authenticationMode: telnet.detail.parsed['Authentication mode'] ?? null,
          configuredChannel: telnet.detail.parsed['Configured channel'] ?? null,
          currentChannel: telnet.detail.parsed['Current channel'] ?? null,
          snBind: telnet.detail.parsed['SN Bind'] ?? null,
          vportMode: telnet.detail.parsed['Vport mode'] ?? null,
          dbaMode: telnet.detail.parsed['DBA Mode'] ?? null,
          omciBwProfile: telnet.detail.parsed['OMCI BW Profile'] ?? null,
          lineProfile: telnet.detail.parsed['Line Profile'] ?? null,
          serviceProfile: telnet.detail.parsed['Service Profile'] ?? null,
          description: telnet.detail.parsed.Description ?? telnet.config.summary.description ?? null,
        };
      } else {
        const command = `show pon onu uncfg ${ponIface}`;
        const result = await executeMultipleCommands(telnetConfig, [command], { sendEnd: false });
        const uncfgRaw = extractCommandSection(result.output ?? result.error ?? '', 0, command);
        const uncfg = parseUnconfiguredOnuLine(uncfgRaw, { onuId: onu.onuId, serialNumber: onu.serialNumber });

        telnet.interface = uncfg?.interface ?? ponIface;
        telnet.detail.raw = uncfg?.raw ?? uncfgRaw;
        telnet.detail.parsed = uncfg?.parsed ?? {};
        telnet.detail.summary = {
          ...(uncfg?.summary ?? {}),
          detectedType: uncfg?.parsed?.OnuType ?? null,
        };
      }
    }

    return NextResponse.json({
      success: true,
      onu: {
        ...onu,
        bandwidthUp: Number(onu.bandwidthUp),
        bandwidthDown: Number(onu.bandwidthDown),
      },
      telnet,
    });
  } catch (error: any) {
    console.error('[ONU Detail GET]', error);
    return NextResponse.json({ error: error.message ?? 'Failed to fetch ONU detail' }, { status: 500 });
  }
}