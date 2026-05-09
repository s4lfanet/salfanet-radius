import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';
import { executeCommand, executeMultipleCommands, TelnetConfig } from '@/lib/olt/telnet';
import { snmpWalk, snmpGet, SNMPConfig } from '@/lib/olt/snmp';

// ── Telnet helpers ────────────────────────────────────────────────────────────

async function getTelnetConfig(olt: any): Promise<TelnetConfig | null> {
  if (!olt.telnetEnabled && !olt.sshEnabled) return null;
  return {
    host:     olt.ipAddress,
    port:     olt.telnetPort ?? 23,
    username: olt.username ?? '',
    password: olt.password ?? '',
    timeout:  20,
  };
}

function hasCliError(output: string): boolean {
  return /%Error|Invalid input detected|Invalid parameter|Incomplete command|Ambiguous command|Failure:/i.test(output);
}

function splitMultipleCommandOutput(output: string, commandCount: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < commandCount; i++) {
    const startMarker = `__COPILOT_CMD_${i}_START__`;
    const endMarker = `__COPILOT_CMD_${i}_END__`;
    const startIndex = output.indexOf(startMarker);
    const endIndex = output.indexOf(endMarker);
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
      parts.push('');
      continue;
    }
    parts.push(output.slice(startIndex + startMarker.length, endIndex).trim());
  }
  return parts;
}

function buildSyntheticConfig(port: string, status: Record<string, string>, vlan: Record<string, string>): string {
  const lines = [`interface ${port}`];

  if (status.Description) lines.push(` description ${status.Description}`);

  const adminStatus = status['Admin Status'] ?? status.Admin ?? 'Unknown';
  lines.push(/^up|enable|activate$/i.test(adminStatus) ? ' no shutdown' : ' shutdown');

  const mode = vlan.Mode?.toLowerCase();
  if (mode) lines.push(` switchport mode ${mode}`);

  const pvid = vlan.Pvid ?? vlan.PVID;
  if (pvid && pvid !== '0' && pvid !== '—') lines.push(` switchport default vlan ${pvid}`);

  const taggedVlans = (vlan['Tagged Vlan'] ?? vlan['Tagged VLAN'] ?? '')
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  for (const taggedVlan of taggedVlans) {
    lines.push(` switchport vlan ${taggedVlan} tag`);
  }

  if (vlan.TLS) lines.push(` tls ${vlan.TLS.toLowerCase() === 'enable' ? 'enable' : 'disable'}`);

  if (status['Flow Control']) lines.push(` ! flow-control ${status['Flow Control']}`);
  if (status['Physical Type']) lines.push(` ! physical-type ${status['Physical Type']}`);
  if (status.Speed) lines.push(` ! speed ${status.Speed}`);
  if (status.Duplex) lines.push(` ! duplex ${status.Duplex}`);

  return lines.join('\n');
}

async function runCommandSequence(config: TelnetConfig, commands: string[]) {
  const result = await executeMultipleCommands(config, commands, { sendEnd: false });
  const segments = result.output ? splitMultipleCommandOutput(result.output, commands.length) : [];
  return {
    result,
    segments,
    firstError: segments.findIndex((segment) => hasCliError(segment)),
  };
}

// ── Parsers ───────────────────────────────────────────────────────────────────

/**
 * Parse "show interface port-status {iface}" tabular output.
 * ZTE C320 sample:
 *   Port      hybrid    Native   Negotiation    Speed       Duplex Flow-   Admin      Link
 *             Status    VLAN          auto       (Mbps)        Ctrl  Status
 *   xgei_1/3/2  optical  1   disable  10000  full  disable  activate  up
 */
function parseInterfacePortStatus(output: string, portName: string): Record<string, string> {
  const result: Record<string, string> = {};
  const escaped = portName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const dataLineRe = new RegExp(`^\\s*${escaped}\\s+`, 'i');
  for (const line of output.split('\n')) {
    if (!dataLineRe.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    // parts[0]=Port parts[1]=hybridStatus parts[2]=NativeVLAN parts[3]=Negotiation
    // parts[4]=Speed(Mbps) parts[5]=Duplex parts[6]=FlowCtrl parts[7]=AdminStatus parts[8]=Link
    if (parts.length >= 8) {
      result['Physical Type'] = parts[1];  // optical / copper / ...
      result['Native VLAN']   = parts[2];
      result['Negotiation']   = parts[3];
      if (parts[4] && parts[4] !== 'N/A') result['Speed'] = `${parts[4]} Mbps`;
      result['Duplex']        = parts[5];
      result['Flow Control']  = parts[6];
      const adminVal = parts[7];
      result['Admin Status']  = /^activate$/i.test(adminVal) ? 'Up' : /^deactivate$/i.test(adminVal) ? 'Down' : adminVal;
      if (parts[8]) result['Link Status'] = /^up$/i.test(parts[8]) ? 'Up' : 'Down';
    }
    break;
  }
  return result;
}

/**
 * Parse "show interface {iface}" output (key:value format, fallback).
 * ZTE C320 sample:
 *   Interface: xgei_1/3/2
 *   Admin Status: Up
 *   Link Status: Up
 *   Speed: 10000 Mbit
 *   Duplex: Full
 *   Flow Control: Off
 *   Physical Type: 10GE_LAN
 *   MTU: 9216
 *   MAC: 00:01:02:03:04:05
 */
function parseInterfaceStatus(output: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const m = line.match(/^\s*([^:]+?)\s*:\s*(.+)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim();
      result[key] = val;
      continue;
    }

    const stateMatch = line.match(/^(\S+)\s+is\s+(activate|deactivate)\s*,\s*line protocol is\s+(up|down)\.?$/i);
    if (stateMatch) {
      result.Interface = stateMatch[1].trim();
      result['Admin Status'] = stateMatch[2].toLowerCase() === 'activate' ? 'Up' : 'Down';
      result['Link Status'] = stateMatch[3].toLowerCase() === 'up' ? 'Up' : 'Down';
      continue;
    }

    const descriptionMatch = line.match(/^Description is\s+(.+?)\.?$/i);
    if (descriptionMatch) {
      result.Description = descriptionMatch[1].trim();
    }
  }
  return result;
}

/**
 * Parse "show vlan port {iface}" output.
 * ZTE C320 sample:
 *   Port            : xgei_1/3/2
 *   Mode            : Trunk
 *   TLS             : Disable
 *   Pvid            : 1
 *   Tagged Vlan     : 100 200 300
 */
function parseVlanPort(output: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of output.split('\n')) {
    const m = line.match(/^\s*([^:]+?)\s*:\s*(.+)$/);
    if (m) {
      const rawKey = m[1].trim();
      const val = m[2].trim();
      const normalizedKey = rawKey.toLowerCase().replace(/\s+/g, ' ');
      const key = normalizedKey === 'port'
        ? 'Port'
        : normalizedKey === 'mode'
          ? 'Mode'
          : normalizedKey === 'tls'
            ? 'TLS'
            : normalizedKey === 'pvid'
              ? 'Pvid'
              : normalizedKey === 'tagged vlan'
                ? 'Tagged Vlan'
                : rawKey;
      result[key] = val;
    }
  }
  return result;
}

/**
 * Parse "show ddmi interface {iface}" output.
 * ZTE C320 sample:
 *   Manufacturer Name   : VENDOR_INC
 *   Part Number         : SFP-10G-LR
 *   Serial Number       : ABCD1234
 *   Wavelength (nm)     : 1310
 *   Fiber Type          : SM
 *   Connector Type      : LC
 *   Temperature (C)     : 35.2
 *   Supply Voltage (V)  : 3.31
 *   TX Power (dBm)      : -2.5
 *   RX Power (dBm)      : -5.8
 *   TX Bias Current (mA): 30.2
 */
function parseDdmi(output: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of output.split('\n')) {
    const m = line.match(/^\s*([^:()]+(?:\([^)]*\))?[^:]*?)\s*:\s*(.+)$/);
    if (m) {
      // Normalize key: remove unit in parens, trim
      const key = m[1].trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
      const val = m[2].trim();
      if (key && val && !/^\s*$/.test(val)) result[key] = val;
    }
  }
  return result;
}

// ── SNMP helpers ─────────────────────────────────────────────────────────────

function getSnmpConfig(olt: any): SNMPConfig | null {
  if (!olt.snmpEnabled) return null;
  return { host: olt.ipAddress, community: olt.snmpCommunity ?? 'public', port: olt.snmpPort ?? 161 };
}

/**
 * Read interface admin/oper/speed status from SNMP IF-MIB.
 * Used as fallback when Telnet `show interface` fails or returns no data.
 */
async function getInterfaceStatusSNMP(
  snmpConfig: SNMPConfig,
  ifaceName: string
): Promise<Record<string, string>> {
  const OID_ifDescr       = '1.3.6.1.2.1.2.2.1.2';
  const OID_ifAdminStatus = '1.3.6.1.2.1.2.2.1.7';
  const OID_ifOperStatus  = '1.3.6.1.2.1.2.2.1.8';
  const OID_ifHighSpeed   = '1.3.6.1.2.1.31.1.1.1.15';
  const OID_ifAlias       = '1.3.6.1.2.1.31.1.1.1.18';
  const normalize = (s: string) => s.toLowerCase().replace(/[-_]/g, '_');

  const descrWalk = await snmpWalk(snmpConfig, OID_ifDescr);
  if (!descrWalk.success || !descrWalk.results) return {};

  let idx: string | undefined;
  for (const [oid, name] of Object.entries(descrWalk.results)) {
    if (normalize(name) === normalize(ifaceName)) {
      idx = oid.split('.').pop();
      break;
    }
  }
  if (!idx) return {};

  const [adminRes, operRes, speedRes, aliasRes] = await Promise.all([
    snmpGet(snmpConfig, `${OID_ifAdminStatus}.${idx}`),
    snmpGet(snmpConfig, `${OID_ifOperStatus}.${idx}`),
    snmpGet(snmpConfig, `${OID_ifHighSpeed}.${idx}`),
    snmpGet(snmpConfig, `${OID_ifAlias}.${idx}`),
  ]);

  const adminVal = parseInt(adminRes.value ?? '2', 10);
  const operVal  = parseInt(operRes.value  ?? '2', 10);
  const result: Record<string, string> = {
    'Admin Status': adminVal === 1 ? 'Up' : 'Down',
    'Link Status':  operVal  === 1 ? 'Up' : 'Down',
  };
  if (speedRes.success && speedRes.value) result['Speed'] = `${speedRes.value}M`;
  if (aliasRes.success && aliasRes.value) result['Description'] = aliasRes.value;
  return result;
}

// ── GET — fetch uplink port data ──────────────────────────────────────────────

/**
 * GET /api/olt/[id]/uplink?port=xgei_1/3/2&tab=status|vlan|config|optical
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const port = searchParams.get('port');
    const tab  = searchParams.get('tab') ?? 'status';

    if (!port) return NextResponse.json({ error: 'port parameter required' }, { status: 400 });

    // Basic validation — allow valid ZTE interface names:
    // 2-level: gei_1/3 (SMXA plain GE — only 1 GE port per slot, no /port suffix)
    // 3-level: xgei_1/3/2 (SMXA XGE — up to 2 ports per slot)
    if (!/^(?:gei|xgei)_\d+\/\d+(?:\/\d+)?$/i.test(port)) {
      return NextResponse.json({ error: 'Invalid port name' }, { status: 400 });
    }

    const olt = await prisma.networkOLT.findUnique({ where: { id } });
    if (!olt) return NextResponse.json({ error: 'OLT not found' }, { status: 404 });

    const telnetConfig = await getTelnetConfig(olt);
    const snmpConfig   = getSnmpConfig(olt);

    // For non-status tabs, Telnet is required
    if (!telnetConfig && tab !== 'status') {
      return NextResponse.json({ error: 'Telnet not configured for this OLT' }, { status: 503 });
    }

    let data: Record<string, any> = {};

    if (tab === 'status') {
      let parsed: Record<string, string> = {};
      let rawOutput = '';

      // 1) Try Telnet `show interface port-status` (tabular ZTE C320 format)
      if (telnetConfig) {
        const result = await executeCommand(telnetConfig, `show interface port-status ${port}`);
        rawOutput = result.output ?? '';
        if (result.success && !hasCliError(rawOutput)) {
          parsed = parseInterfacePortStatus(rawOutput, port);
        }
        // Fallback: try `show interface` (key-value format) if tabular parse found nothing
        if (!parsed['Admin Status']) {
          const r2 = await executeCommand(telnetConfig, `show interface ${port}`);
          const out2 = r2.output ?? '';
          if (r2.success && !hasCliError(out2)) {
            parsed = parseInterfaceStatus(out2);
            if (rawOutput) rawOutput = out2; else rawOutput = out2;
          }
        }
      }

      // 2) SNMP IF-MIB fallback — used when Telnet fails or returns no Admin/Link Status
      if ((!parsed['Admin Status'] || !parsed['Link Status']) && snmpConfig) {
        const snmpParsed = await getInterfaceStatusSNMP(snmpConfig, port).catch(() => ({}));
        // Merge: Telnet keys take precedence, SNMP fills in missing fields
        parsed = { ...snmpParsed, ...parsed };
      }

      data = { raw: rawOutput, parsed };
    } else if (tab === 'vlan') {
      const result = await executeCommand(telnetConfig, `show vlan port ${port}`);
      const output = result.output ?? '';
      data = {
        raw: output,
        parsed: result.success && !hasCliError(output) ? parseVlanPort(output) : {},
      };
    } else if (tab === 'config') {
      // Use `show running-config interface` for real config (includes VLAN switchport settings)
      const result = await executeCommand(telnetConfig!, `show running-config interface ${port}`);
      const output = result.output ?? '';
      data = {
        raw: result.success && !hasCliError(output) ? output : '',
        parsed: {},
      };
    } else if (tab === 'optical') {
      const result = await executeCommand(telnetConfig, `show ddmi interface ${port}`);
      const output = result.output ?? '';
      data = {
        raw: output,
        parsed: result.success && !hasCliError(output) ? parseDdmi(output) : {},
      };
    } else {
      return NextResponse.json({ error: 'Invalid tab' }, { status: 400 });
    }

    return NextResponse.json({ success: true, port, tab, data });
  } catch (error: any) {
    console.error('[OLT Uplink GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── POST — configure uplink port ──────────────────────────────────────────────

/**
 * POST /api/olt/[id]/uplink
 * Body: { port, action, vlanId?, mode? }
 * actions: addVlan, removeVlan, enable, disable, setDescription
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
    const { port, action, vlanId, mode, description } = body;

    if (!port || !action) {
      return NextResponse.json({ error: 'port and action required' }, { status: 400 });
    }

    // Validate port name — accept 2-level (gei_1/3) and 3-level (xgei_1/3/2)
    if (!/^(?:gei|xgei)_\d+\/\d+(?:\/\d+)?$/i.test(port)) {
      return NextResponse.json({ error: 'Invalid port name' }, { status: 400 });
    }

    const olt = await prisma.networkOLT.findUnique({ where: { id } });
    if (!olt) return NextResponse.json({ error: 'OLT not found' }, { status: 404 });

    const telnetConfig = await getTelnetConfig(olt);
    if (!telnetConfig) {
      return NextResponse.json({ error: 'Telnet not configured for this OLT' }, { status: 503 });
    }

    let commandAttempts: string[][] = [];

    if (action === 'addVlan') {
      if (!vlanId) return NextResponse.json({ error: 'vlanId required' }, { status: 400 });
      const vid = parseInt(vlanId);
      if (isNaN(vid) || vid < 1 || vid > 4094) return NextResponse.json({ error: 'Invalid VLAN ID' }, { status: 400 });
      const vlanMode = (mode === 'access') ? `switchport default vlan ${vid}` : `switchport vlan ${vid} tag`;
      commandAttempts = [[
        'configure terminal',
        `interface ${port}`,
        vlanMode,
        'exit',
        'end',
      ]];
    } else if (action === 'removeVlan') {
      if (!vlanId) return NextResponse.json({ error: 'vlanId required' }, { status: 400 });
      const vid = parseInt(vlanId);
      if (isNaN(vid) || vid < 1 || vid > 4094) return NextResponse.json({ error: 'Invalid VLAN ID' }, { status: 400 });
      commandAttempts = [
        ['configure terminal', `interface ${port}`, `no switchport vlan ${vid} tag`, 'exit', 'end'],
        ['configure terminal', `interface ${port}`, 'no switchport default vlan', 'exit', 'end'],
        ['configure terminal', `interface ${port}`, `no switchport vlan ${vid}`, 'exit', 'end'],
      ];
    } else if (action === 'enable') {
      commandAttempts = [[
        'configure terminal',
        `interface ${port}`,
        'no shutdown',
        'exit',
        'end',
      ]];
    } else if (action === 'disable') {
      commandAttempts = [[
        'configure terminal',
        `interface ${port}`,
        'shutdown',
        'exit',
        'end',
      ]];
    } else if (action === 'setDescription') {
      if (!description) return NextResponse.json({ error: 'description required' }, { status: 400 });
      // Sanitize description: only allow printable ASCII, max 64 chars
      const safeDesc = description.replace(/[^\x20-\x7E]/g, '').slice(0, 64);
      commandAttempts = [[
        'configure terminal',
        `interface ${port}`,
        `description ${safeDesc}`,
        'exit',
        'end',
      ]];
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    let lastDetail = '';
    for (const commands of commandAttempts) {
      const { result, segments, firstError } = await runCommandSequence(telnetConfig, commands);
      if (!result.success) {
        lastDetail = result.error ?? 'Command sequence failed';
        continue;
      }
      if (firstError !== -1) {
        lastDetail = segments[firstError] ?? 'CLI command failed';
        continue;
      }

      return NextResponse.json({ success: true, port, action });
    }

    return NextResponse.json({ error: 'Uplink action failed', detail: lastDetail }, { status: 500 });
  } catch (error: any) {
    console.error('[OLT Uplink POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
