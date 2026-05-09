import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';
import { executeCommand, executeMultipleCommands, TelnetResult } from '@/lib/olt/telnet';

function parseZteOnuTypes(output: string): string[] {
  const types = new Set<string>();
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    // "show onu-type" format (C320 V2.1): "ONU type name:          All"
    let match = line.match(/^ONU\s+type\s+name\s*:\s*(\S+)/i);
    if (match) {
      const name = match[1];
      if (!/^(N\/A|NA|none|null)$/i.test(name)) types.add(name);
      continue;
    }

    // Running-config format: "onu-type ZTEG-F670L gpon ..."
    match = line.match(/\bonu-type\s+([^\s]+)\s+gpon\b/i);
    if (match) {
      types.add(match[1]);
      continue;
    }

    // Table format (some firmware): skip header/separator/attribute lines
    // Do NOT use a catch-all here — Telnet preamble artifacts (Connected, Trying,
    // Welcome, ZXAN#show, etc.) would be picked up.
    if (/^(Onu-type|ONU|PON|Description|Max|Service|WIFI|OMCI|Default|VRG|MGC|Extended|Location|-+|show)/i.test(line)) continue;

    // Running-config legacy: "ZTEG-F670L gpon ..."
    match = line.match(/^([^\s]+)\s+gpon(?:\s|$)/i);
    if (match && !/^(show|onu-type|description|capability|enable|disable)$/i.test(match[1])) {
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

function parseZteTrafficProfiles(output: string): string[] {
  const profiles = new Set<string>();
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    let match = line.match(/^Profile\s+name\s*:\s*(.+)$/i);
    if (match) {
      profiles.add(match[1].trim());
      continue;
    }

    match = line.match(/\bprofile\s+traffic\s+([^\s]+)/i);
    if (match) {
      profiles.add(match[1].trim());
    }
  }
  return [...profiles].sort((a, b) => a.localeCompare(b));
}

function extractCommandSection(output: string, index: number, command: string): string {
  const startToken = `__COPILOT_CMD_${index}_START__`;
  const endToken = `__COPILOT_CMD_${index}_END__`;
  const start = output.indexOf(startToken);
  if (start === -1) return '';

  const from = start + startToken.length;
  const end = output.indexOf(endToken, from);
  const section = end === -1 ? output.slice(from) : output.slice(from, end);
  const lines = section
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean);

  while (lines.length && lines[0].trim() === command.trim()) lines.shift();
  while (lines.length && /^[A-Za-z0-9_.-]+[>#]/.test(lines[lines.length - 1].trim())) lines.pop();

  return lines.join('\n').trim();
}

function buildZteBasicCommands(options: {
  interfaceName: string;
  description?: string;
  tcontProfile: string;
  vlan: number;
}): string[] {
  return [
    `interface ${options.interfaceName}`,
    ...(options.description ? [`name ${options.description}`, `description ${options.description}`] : []),
    `tcont 1 profile ${options.tcontProfile}`,
    'gemport 1 tcont 1',
    `service-port 1 vport 1 user-vlan ${options.vlan} vlan ${options.vlan}`,
    'exit',
  ];
}

function buildZteFullCommands(options: {
  interfaceName: string;
  tcontProfile: string;
  description?: string;
  primaryVlan: number;
  secondaryVlan: number;
  trafficProfile?: string;
  pppoeUsername?: string;
  pppoePassword?: string;
  enableDualSsid: boolean;
  ssid1Name?: string;
  ssid1Password?: string;
  ssid1Auth: string;
  ssid2Name?: string;
  ssid2Password?: string;
  ssid2Auth: string;
  enableTr069: boolean;
  acsUrl: string;
  acsUsername: string;
  acsPassword: string;
  enableFirewall: boolean;
  firewallLevel: string;
  enableSecurityMgmt: boolean;
}): string[] {
  const primaryServiceName = `VLAN${String(options.primaryVlan).padStart(4, '0')}`;
  const secondaryServiceName = `VLAN${options.secondaryVlan}`;
  const commands = [
    `interface ${options.interfaceName}`,
    ...(options.description ? [`name ${options.description}`, `description ${options.description}`] : []),
    `tcont 1 name ${primaryServiceName} profile ${options.tcontProfile}`,
    `tcont 2 name ${secondaryServiceName} profile ${options.tcontProfile}`,
    'gemport 1 tcont 1',
    ...(options.trafficProfile ? [`gemport 1 traffic-limit downstream ${options.trafficProfile}`] : []),
    'gemport 2 tcont 2',
    ...(options.trafficProfile ? [`gemport 2 traffic-limit downstream ${options.trafficProfile}`] : []),
    `service-port 1 vport 1 user-vlan ${options.primaryVlan} vlan ${options.primaryVlan}`,
    `service-port 2 vport 2 user-vlan ${options.secondaryVlan} vlan ${options.secondaryVlan}`,
    'exit',
    `pon-onu-mng ${options.interfaceName}`,
    `service ${primaryServiceName} gemport 1 iphost 1 vlan ${options.primaryVlan}`,
    `service ${secondaryServiceName} gemport 2 vlan ${options.secondaryVlan}`,
    'vlan port veip_1 mode hybrid',
    'vlan port veip_1 vlan 1',
    ...(options.pppoeUsername && options.pppoePassword
      ? [`pppoe 1 nat enable user ${options.pppoeUsername} password ${options.pppoePassword}`]
      : []),
    `vlan port eth_0/1 mode tag vlan ${options.primaryVlan}`,
    `vlan port eth_0/2 mode tag vlan ${options.primaryVlan}`,
    `vlan port eth_0/3 mode tag vlan ${options.primaryVlan}`,
    `vlan port eth_0/4 mode tag vlan ${options.primaryVlan}`,
    `vlan port wifi_0/1 mode tag vlan ${options.primaryVlan}`,
    ...(options.enableDualSsid ? [`vlan port wifi_0/2 mode tag vlan ${options.secondaryVlan}`] : []),
  ];

  if (options.ssid1Name) {
    commands.push(
      `wifi ssid 1 name ${options.ssid1Name}`,
      `wifi ssid 1 auth ${options.ssid1Auth === 'wpa' ? 'wpa-psk' : 'wpa2-psk'}`,
      ...(options.ssid1Password ? [`wifi ssid 1 wpakey ${options.ssid1Password}`] : []),
      `wifi ssid 1 bindvlan ${options.primaryVlan}`,
      'wifi ssid 1 enable',
    );
  }

  if (options.enableDualSsid && options.ssid2Name) {
    commands.push(`wifi ssid 2 name ${options.ssid2Name}`);
    if (options.ssid2Auth === 'open') {
      commands.push('wifi ssid 2 auth open');
    } else {
      commands.push(`wifi ssid 2 auth ${options.ssid2Auth === 'wpa' ? 'wpa-psk' : 'wpa2-psk'}`);
      if (options.ssid2Password) commands.push(`wifi ssid 2 wpakey ${options.ssid2Password}`);
    }
    commands.push(`wifi ssid 2 bindvlan ${options.secondaryVlan}`, 'wifi ssid 2 enable');
  }

  if (options.enableFirewall) {
    commands.push(`firewall enable level ${options.firewallLevel} anti-hack disable`);
  }

  if (options.enableTr069) {
    commands.push(
      'tr069-mgmt 1 state unlock',
      `tr069-mgmt 1 acs ${options.acsUrl} validate basic username ${options.acsUsername} password ${options.acsPassword}`,
    );
  }

  if (options.enableSecurityMgmt) {
    commands.push('security-mgmt 1 state enable mode forward');
  }

  commands.push('wan 1 service internet host 1', 'exit');
  return commands;
}

function buildHuaweiFullCommands(options: {
  interfaceName: string;
  tcontProfile: string;
  description?: string;
  mgmtVlan: number;
  internetVlan: number;
  voipVlan: number;
  vlanProfile: string;
  trafficProfile?: string;
}): string[] {
  return [
    `interface ${options.interfaceName}`,
    ...(options.description ? [`name ${options.description}`, `description ${options.description}`] : []),
    `tcont 1 profile ${options.tcontProfile}`,
    'gemport 1 tcont 1',
    ...(options.trafficProfile ? [`gemport 1 traffic-limit downstream ${options.trafficProfile}`] : []),
    `service-port 1 vport 1 user-vlan ${options.mgmtVlan} vlan ${options.mgmtVlan}`,
    `service-port 2 vport 1 user-vlan ${options.internetVlan} vlan ${options.internetVlan}`,
    `service-port 3 vport 1 user-vlan ${options.voipVlan} vlan ${options.voipVlan}`,
    'exit',
    `pon-onu-mng ${options.interfaceName}`,
    'service ServiceONU1 gemport 1',
    `wan-ip 1 mode dhcp vlan-profile ${options.vlanProfile} host 1`,
    'exit',
  ];
}

function buildFiberhomeVeipCommands(options: {
  interfaceName: string;
  tcontProfile: string;
  description?: string;
  tr069Vlan: number;
  internetVlan: number;
  voipVlan: number;
  acsUrl: string;
  acsUsername: string;
  acsPassword: string;
}): string[] {
  return [
    `interface ${options.interfaceName}`,
    ...(options.description ? [`name ${options.description}`, `description ${options.description}`] : []),
    `tcont 1 profile ${options.tcontProfile}`,
    `tcont 2 profile ${options.tcontProfile}`,
    `tcont 3 profile ${options.tcontProfile}`,
    'gemport 1 tcont 1',
    'gemport 2 tcont 2',
    'gemport 3 tcont 3',
    `service-port 1 vport 1 user-vlan ${options.tr069Vlan} vlan ${options.tr069Vlan}`,
    `service-port 2 vport 2 user-vlan ${options.internetVlan} vlan ${options.internetVlan}`,
    `service-port 3 vport 3 user-vlan ${options.voipVlan} vlan ${options.voipVlan}`,
    'exit',
    `pon-onu-mng ${options.interfaceName}`,
    `service 1 gemport 1 vlan ${options.tr069Vlan}`,
    `service 2 gemport 2 vlan ${options.internetVlan}`,
    `service 3 gemport 3 vlan ${options.voipVlan}`,
    'vlan port veip_1 mode hybrid',
    'tr069-mgmt 1 state unlock',
    `tr069-mgmt 1 acs ${options.acsUrl} validate basic username ${options.acsUsername} password ${options.acsPassword}`,
    `vlan port wifi_0/1 mode tag vlan ${options.internetVlan}`,
    `vlan port eth_0/1 mode tag vlan ${options.internetVlan}`,
    `vlan port eth_0/2 mode tag vlan ${options.internetVlan}`,
    `vlan port eth_0/3 mode tag vlan ${options.internetVlan}`,
    `vlan port eth_0/4 mode tag vlan ${options.internetVlan}`,
    'exit',
  ];
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
    let trafficProfiles: string[] = [];
    let suggestedOnuId: number | null = null;
    let detectedOnuType: string | null = null;

    if (vendor === 'zte') {
      // Use separate executeCommand calls in parallel — avoids one slow/hanging command
      // from blocking all metadata (e.g. `show run | include onu-type` dumps full config on C320).
      const getOut = (r: PromiseSettledResult<TelnetResult>) =>
        r.status === 'fulfilled' ? (r.value.output ?? '') : '';

      const [typesResult, tcontResult, trafficResult, onuInfoResult, uncfgResult] =
        await Promise.allSettled([
          executeCommand(telnetConfig, 'show onu-type'),
          executeCommand(telnetConfig, 'show gpon profile tcont'),
          executeCommand(telnetConfig, 'show gpon profile traffic'),
          executeCommand(telnetConfig, `show gpon onu-info ${ponInterface}`),
          executeCommand(telnetConfig, `show pon onu uncfg ${ponInterface}`),
        ]);

      onuTypes = parseZteOnuTypes(getOut(typesResult));
      tcontProfiles = parseZteTcontProfiles(getOut(tcontResult));
      trafficProfiles = parseZteTrafficProfiles(getOut(trafficResult));
      suggestedOnuId = parseNextZteOnuId(getOut(onuInfoResult));
      detectedOnuType = parseDetectedUnconfiguredType(getOut(uncfgResult), serialNumber, onuId)?.onuType ?? null;
    }

    return NextResponse.json({
      success: true,
      vendor,
      ponInterface,
      metadata: {
        onuTypes,
        tcontProfiles,
        trafficProfiles,
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
      serviceTemplate = 'basic',
      // ZTE-specific
      tcontProfile = '1G',
      trafficProfile = '',
      primaryVlan = 30,
      secondaryVlan = 151,
      mgmtVlan = 1010,
      internetVlan = 30,
      voipVlan = 151,
      vlanProfile = 'genieacs',
      pppoeUsername = '',
      pppoePassword = '',
      enableDualSsid = true,
      ssid1Name = '',
      ssid1Password = '12345678',
      ssid1Auth = 'wpa2',
      ssid2Name = '',
      ssid2Password = '',
      ssid2Auth = 'open',
      enableTr069 = true,
      tr069Vlan = 100,
      acsUrl = 'http://192.168.54.254:7547',
      acsUsername = 'acs',
      acsPassword = 'acs',
      enableFirewall = true,
      firewallLevel = 'low',
      enableSecurityMgmt = true,
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
        ...(serviceTemplate === 'zte_full'
          ? buildZteFullCommands({
              interfaceName: onuInterface,
              tcontProfile,
              description,
              primaryVlan,
              secondaryVlan,
              trafficProfile,
              pppoeUsername,
              pppoePassword,
              enableDualSsid,
              ssid1Name,
              ssid1Password,
              ssid1Auth,
              ssid2Name,
              ssid2Password,
              ssid2Auth,
              enableTr069,
              acsUrl,
              acsUsername,
              acsPassword,
              enableFirewall,
              firewallLevel,
              enableSecurityMgmt,
            })
          : serviceTemplate === 'huawei_full'
            ? buildHuaweiFullCommands({
                interfaceName: onuInterface,
                tcontProfile,
                description,
                mgmtVlan,
                internetVlan,
                voipVlan,
                vlanProfile,
                trafficProfile,
              })
            : serviceTemplate === 'fiberhome_veip'
              ? buildFiberhomeVeipCommands({
                  interfaceName: onuInterface,
                  tcontProfile,
                  description,
                  tr069Vlan,
                  internetVlan,
                  voipVlan,
                  acsUrl,
                  acsUsername,
                  acsPassword,
                })
              : buildZteBasicCommands({
                  interfaceName: onuInterface,
                  description,
                  tcontProfile,
                  vlan,
                })),
      ];
    }

    commands.push('end');

    const result = await executeMultipleCommands(telnetConfig, commands, { sendEnd: false });

    if (!result.success) {
      return NextResponse.json(
        { error: `Telnet command failed: ${result.error}` },
        { status: 500 }
      );
    }

    // Check output for common OLT error patterns.
    // IMPORTANT: be specific — the OLT login banner (MOTD) often contains words like
    // "failure" ("0 authentication failures happened") or "error" ("Last login...").
    // Only treat output as an error when the pattern clearly comes from the CLI engine:
    //   %ERR-... / %Error ... / invalid input / already exists
    // Do NOT match standalone "failure" or "error" as those appear in MOTD text.
    const output = result.output ?? '';
    const lines = output.split('\n');
    const cliErrorLine = lines.find(l => {
      const t = l.trim();
      if (!t) return false;
      // ZTE/Huawei CLI errors always start with '%' or contain these exact phrases
      return /^%/.test(t) ||
        /invalid\s+input/i.test(t) ||
        /invalid\s+command/i.test(t) ||
        /already\s+exist/i.test(t) ||
        /\bcommand\s+not\s+found\b/i.test(t);
    });
    if (cliErrorLine) {
      return NextResponse.json(
        { error: `OLT rejected registration: ${cliErrorLine.trim()}` },
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
