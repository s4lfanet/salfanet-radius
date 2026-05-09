import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';
import { executeMultipleCommands } from '@/lib/olt/telnet';

function parseZteOnuTypes(output: string): string[] {
  const types = new Set<string>();
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    let match = line.match(/\bonu-type\s+([^\s]+)\s+gpon\b/i);
    if (match) {
      types.add(match[1]);
      continue;
    }

    match = line.match(/^([^\s]+)\s+gpon(?:\s|$)/i);
    if (match && !/^(show|onu-type)$/i.test(match[1])) {
      types.add(match[1]);
    }
  }
  return [...types].sort((a, b) => a.localeCompare(b));
}

function parseZteTcontProfiles(output: string): string[] {
  const profiles = new Set<string>();
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    let match = line.match(/^Profile\s+name\s*:\s*(.+)$/i);
    if (match) {
      profiles.add(match[1].trim());
      continue;
    }

    match = line.match(/\bprofile\s+tcont\s+([^\s]+)/i);
    if (match) {
      profiles.add(match[1].trim());
    }
  }
  return [...profiles].sort((a, b) => a.localeCompare(b));
}

function parseNextZteOnuId(output: string): number | null {
  const used = new Set<number>();
  const patterns = [
    /gpon[_-]onu[_-]?\d+\/\d+\/\d+:(\d+)/gi,
    /\bonu\s+(\d+)\s+type\b/gi,
  ];

  for (const pattern of patterns) {
    const matches = output.matchAll(pattern);
    for (const match of matches) {
      const id = Number(match[1]);
      if (!Number.isNaN(id) && id >= 1 && id <= 128) used.add(id);
    }
  }

  for (let onuId = 1; onuId <= 128; onuId++) {
    if (!used.has(onuId)) return onuId;
  }

  return null;
}

function parseDetectedUnconfiguredType(output: string, serialNumber?: string | null, onuId?: number | null) {
  const lines = output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !/OnuIndex|OnuType|OnuSn|^-+/i.test(line));

  const candidates = lines.map(line => {
    const parts = line.split(/\s+/);
    if (parts.length < 3) return null;
    const idMatch = parts[0].match(/:(\d+)/);
    return {
      onuId: idMatch ? Number(idMatch[1]) : null,
      onuType: parts[1] !== 'N/A' ? parts[1] : null,
      serialNumber: parts[2] !== 'N/A' ? parts[2] : null,
    };
  }).filter((value): value is { onuId: number | null; onuType: string | null; serialNumber: string | null } => Boolean(value));

  return candidates.find(candidate =>
    (serialNumber && candidate.serialNumber?.toUpperCase() === serialNumber.toUpperCase()) ||
    (onuId != null && candidate.onuId === onuId)
  ) ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const frame = Number(searchParams.get('frame') ?? '1');
    const slot = Number(searchParams.get('slot'));
    const port = Number(searchParams.get('port'));
    const onuId = searchParams.get('onuId') ? Number(searchParams.get('onuId')) : null;
    const serialNumber = searchParams.get('serialNumber');

    if (!slot || Number.isNaN(slot) || Number.isNaN(port)) {
      return NextResponse.json({ error: 'Missing required query params: slot, port' }, { status: 400 });
    }

    const olt = await prisma.networkOLT.findUnique({ where: { id } });
    if (!olt) return NextResponse.json({ error: 'OLT not found' }, { status: 404 });
    if (!olt.telnetEnabled || !olt.username || !olt.password) {
      return NextResponse.json({ error: 'Telnet not configured on this OLT' }, { status: 422 });
    }

    const vendor = (olt.vendor ?? 'zte').toLowerCase();
    const ponPort = port + 1;
    const ponInterface = vendor === 'huawei'
      ? `${frame}/${slot}/${ponPort}`
      : `gpon-olt_${frame}/${slot}/${ponPort}`;

    const telnetConfig = {
      host: olt.ipAddress,
      port: olt.telnetPort ?? 23,
      username: olt.username,
      password: olt.password,
      timeout: 30,
    };

    let onuTypes: string[] = [];
    let tcontProfiles: string[] = [];
    let suggestedOnuId: number | null = null;
    let detectedOnuType: string | null = null;

    if (vendor === 'zte') {
      const commands = [
        'show run | include onu-type',
        'show gpon profile tcont',
        `show gpon onu-info ${ponInterface}`,
        `show pon onu uncfg ${ponInterface}`,
      ];
      const transcript = await executeMultipleCommands(telnetConfig, commands, { sendEnd: false });
      const output = transcript.output ?? transcript.error ?? '';

      const typesOutput = output.includes('__COPILOT_CMD_0_START__')
        ? output.split('__COPILOT_CMD_0_END__')[0]
        : output;
      onuTypes = parseZteOnuTypes(typesOutput);
      tcontProfiles = parseZteTcontProfiles(output);

      const onuInfoSection = output.includes('__COPILOT_CMD_2_START__')
        ? output.split('__COPILOT_CMD_2_START__')[1]?.split('__COPILOT_CMD_2_END__')[0] ?? ''
        : '';
      suggestedOnuId = parseNextZteOnuId(onuInfoSection);

      const uncfgSection = output.includes('__COPILOT_CMD_3_START__')
        ? output.split('__COPILOT_CMD_3_START__')[1]?.split('__COPILOT_CMD_3_END__')[0] ?? ''
        : '';
      detectedOnuType = parseDetectedUnconfiguredType(uncfgSection, serialNumber, onuId)?.onuType ?? null;
    }

    return NextResponse.json({
      success: true,
      vendor,
      ponInterface,
      metadata: {
        onuTypes,
        tcontProfiles,
        suggestedOnuId,
        detectedOnuType,
      },
    });
  } catch (error: any) {
    console.error('[ONU Register GET]', error);
    return NextResponse.json({ error: error.message ?? 'Failed to fetch register metadata' }, { status: 500 });
  }
}

/**
 * POST /api/olt/[id]/onus/register
 * Register an unregistered ONU via Telnet. Vendor-aware command generation.
 *
 * Common body fields:
 *   frame:        number  (frame/chassis, default 1)
 *   slot:         number  (board/card slot, e.g. 1)
 *   port:         number  (PON port 0-based from SNMP)
 *   onuId:        number  (target ONU ID, 1-128)
 *   serialNumber: string  (e.g. "ZTEGDA5918AC" / "4857544300000001")
 *   onuType:      string  ONU type/model (ZTE: "All", FiberHome: specific model)
 *   vlan:         number  service VLAN
 *   description:  string? optional ONU name/customer label
 *
 * ZTE-specific:
 *   tcontProfile: string  (e.g. "1G", "100M") — TCONT bandwidth profile name on OLT
 *
 * Huawei-specific:
 *   lineProfileId: number  ont-lineprofile-id (default 1)
 *   srvProfileId:  number  ont-srvprofile-id (default 1)
 *
 * FiberHome-specific:
 *   profileName: string  ONU service profile name (default "default")
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const body = await request.json();

    const {
      frame = 1,
      slot,
      port,
      onuId: requestedOnuId,
      serialNumber,
      onuType = 'All',
      vlan = 100,
      description,
      // ZTE-specific
      tcontProfile = '1G',
      // Huawei-specific
      lineProfileId = 1,
      srvProfileId = 1,
      // FiberHome-specific
      profileName = 'default',
    } = body;

    if (!slot || port === undefined || !serialNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: slot, port, serialNumber' },
        { status: 400 }
      );
    }

    const olt = await prisma.networkOLT.findUnique({ where: { id } });
    if (!olt) return NextResponse.json({ error: 'OLT not found' }, { status: 404 });

    if (!olt.telnetEnabled || !olt.username || !olt.password) {
      return NextResponse.json(
        { error: 'Telnet not configured on this OLT. Enable Telnet and set credentials in Settings.' },
        { status: 422 }
      );
    }

    const telnetConfig = {
      host: olt.ipAddress,
      port: olt.telnetPort ?? 23,
      username: olt.username,
      password: olt.password,
      timeout: 30,
    };

    // SNMP port index is 0-based; CLI port numbers are 1-based for ZTE/FiberHome
    const ponPort = port + 1;
    const onuId = requestedOnuId ?? 1;
    const vendor = (olt.vendor ?? 'zte').toLowerCase();

    let commands: string[];
    let ponInterface: string;
    let onuInterface: string;

    if (vendor === 'huawei') {
      // ─── Huawei MA5608T / MA5680T / MA5800 CLI ──────────────────────────────
      // interface gpon {frame}/{slot}
      //   ont add {port} {onuId} sn-auth {sn} omci ont-lineprofile-id {lpId} ont-srvprofile-id {spId}
      // quit
      // service-port 1 vlan {vlan} gpon {frame}/{slot}/{port} ont {onuId} gemport 0 multi-service user-vlan {vlan} tag-transform translate
      ponInterface = `gpon ${frame}/${slot}`;
      onuInterface = `gpon ${frame}/${slot}/${ponPort} ont ${onuId}`;
      const descStr = description ? ` desc ${description}` : '';
      commands = [
        'enable',
        'config',
        `interface gpon ${frame}/${slot}`,
        `ont add ${ponPort} ${onuId} sn-auth ${serialNumber} omci ont-lineprofile-id ${lineProfileId} ont-srvprofile-id ${srvProfileId}${descStr}`,
        'quit',
        `service-port 1 vlan ${vlan} gpon ${frame}/${slot}/${ponPort} ont ${onuId} gemport 0 multi-service user-vlan ${vlan} tag-transform translate`,
        'quit',
      ];
    } else if (vendor === 'fiberhome') {
      // ─── FiberHome AN5516 / AN6010 CLI ──────────────────────────────────────
      // interface gpon-olt_{frame}/{slot}/{port}
      //   onu add {onuId} type {onuType} sn {sn}
      //   onu {onuId} profile {profileName}
      //   onu {onuId} vlan {vlan} mode translate
      //   commit
      // exit
      ponInterface = `gpon-olt_${frame}/${slot}/${ponPort}`;
      onuInterface = `gpon-onu_${frame}/${slot}/${ponPort}.${onuId}`;   // FiberHome uses '.' not ':'
      const descCmds = description ? [`onu ${onuId} description ${description}`] : [];
      commands = [
        'enable',
        'config',
        `interface gpon-olt_${frame}/${slot}/${ponPort}`,
        `onu add ${onuId} type ${onuType} sn ${serialNumber}`,
        `onu ${onuId} profile ${profileName}`,
        `onu ${onuId} vlan ${vlan} mode translate`,
        ...descCmds,
        'commit',
        'exit',
      ];
    } else {
      // ─── ZTE C320 V2.1 CLI (default) ────────────────────────────────────────
      // Reference: zte_command.py → register_onu_stepbystep()
      // conf t
      // interface gpon-olt_{frame}/{slot}/{port}
      //   onu {onuId} type All sn {sn}
      //   [onu {onuId} description {desc}]
      // exit
      // interface gpon-onu_{frame}/{slot}/{port}:{onuId}
      //   tcont 1 profile {tcontProfile}
      //   gemport 1 tcont 1
      //   service-port 1 vport 1 user-vlan {vlan} vlan {vlan}
      // exit
      // end
      ponInterface = `gpon-olt_${frame}/${slot}/${ponPort}`;
      onuInterface = `gpon-onu_${frame}/${slot}/${ponPort}:${onuId}`;
      commands = [
        'configure terminal',
        `interface ${ponInterface}`,
        `onu ${onuId} type ${onuType} sn ${serialNumber}`,
        'exit',
        `interface ${onuInterface}`,
        ...(description ? [`name ${description}`] : []),
        ...(description ? [`description ${description}`] : []),
        `tcont 1 profile ${tcontProfile}`,
        'gemport 1 tcont 1',
        `service-port 1 vport 1 user-vlan ${vlan} vlan ${vlan}`,
        'exit',
      ];
    }

    const result = await executeMultipleCommands(telnetConfig, commands, { sendEnd: false });

    if (!result.success) {
      return NextResponse.json(
        { error: `Telnet command failed: ${result.error}` },
        { status: 500 }
      );
    }

    // Check output for common OLT error patterns
    const output = result.output ?? '';
    const lowerOutput = output.toLowerCase();
    const errorKeywords = ['%error', 'invalid input', 'already exist', 'failure', 'invalid command'];
    if (errorKeywords.some(k => lowerOutput.includes(k))) {
      const errorLine = output.split('\n').find(l =>
        l.includes('%') || l.toLowerCase().includes('invalid') ||
        l.toLowerCase().includes('already') || l.toLowerCase().includes('failure')
      );
      return NextResponse.json(
        { error: `OLT rejected registration: ${errorLine ?? output.slice(0, 200)}` },
        { status: 422 }
      );
    }

    // Update DB record for this ONU (best-effort)
    try {
      await prisma.oltOnuStatus.updateMany({
        where: { oltId: id, frame, slot, port, onuId },
        data: {
          status: 'offline',
          serialNumber: serialNumber ?? null,
          description: description ?? null,
          updatedAt: new Date(),
        },
      });
    } catch {
      // Non-critical: registration succeeded even if DB update fails
    }

    return NextResponse.json({
      success: true,
      message: `ONU ${serialNumber} registered as ID ${onuId} on ${ponInterface}`,
      vendor,
      ponInterface,
      onuInterface,
      onuId,
    });
  } catch (error: any) {
    console.error('[ONU Register]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
