import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';
import { executeCommand, TelnetConfig } from '@/lib/olt/telnet';

// ── Telnet helpers ────────────────────────────────────────────────────────────

async function getTelnetConfig(olt: any): Promise<TelnetConfig | null> {
  if (!olt.telnetEnabled && !olt.sshEnabled) return null;
  return {
    host:     olt.ipAddress,
    port:     olt.telnetPort ?? 23,
    username: olt.telnetUsername ?? '',
    password: olt.telnetPassword ?? '',
    timeout:  20,
  };
}

// ── Parsers ───────────────────────────────────────────────────────────────────

/**
 * Parse "show interface {iface}" output.
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
  for (const line of output.split('\n')) {
    const m = line.match(/^\s*([^:]+?)\s*:\s*(.+)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim();
      result[key] = val;
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
      const key = m[1].trim();
      const val = m[2].trim();
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

    // Basic validation — allow only valid ZTE interface names
    if (!/^(?:gei|xgei)_\d+\/\d+\/\d+$/i.test(port)) {
      return NextResponse.json({ error: 'Invalid port name' }, { status: 400 });
    }

    const olt = await prisma.networkOLT.findUnique({ where: { id } });
    if (!olt) return NextResponse.json({ error: 'OLT not found' }, { status: 404 });

    const telnetConfig = await getTelnetConfig(olt);
    if (!telnetConfig) {
      return NextResponse.json({ error: 'Telnet not configured for this OLT' }, { status: 503 });
    }

    let data: Record<string, any> = {};

    if (tab === 'status') {
      const result = await executeCommand(telnetConfig, `show interface ${port}`);
      data = {
        raw: result.output ?? '',
        parsed: result.success ? parseInterfaceStatus(result.output ?? '') : {},
      };
    } else if (tab === 'vlan') {
      const result = await executeCommand(telnetConfig, `show vlan port ${port}`);
      data = {
        raw: result.output ?? '',
        parsed: result.success ? parseVlanPort(result.output ?? '') : {},
      };
    } else if (tab === 'config') {
      const result = await executeCommand(telnetConfig, `show running-config interface ${port}`);
      data = {
        raw: result.output ?? '',
        // Config is returned as raw text lines; also attempt key:val parse
        parsed: result.success ? parseInterfaceStatus(result.output ?? '') : {},
      };
    } else if (tab === 'optical') {
      const result = await executeCommand(telnetConfig, `show ddmi interface ${port}`);
      data = {
        raw: result.output ?? '',
        parsed: result.success ? parseDdmi(result.output ?? '') : {},
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

    // Validate port name
    if (!/^(?:gei|xgei)_\d+\/\d+\/\d+$/i.test(port)) {
      return NextResponse.json({ error: 'Invalid port name' }, { status: 400 });
    }

    const olt = await prisma.networkOLT.findUnique({ where: { id } });
    if (!olt) return NextResponse.json({ error: 'OLT not found' }, { status: 404 });

    const telnetConfig = await getTelnetConfig(olt);
    if (!telnetConfig) {
      return NextResponse.json({ error: 'Telnet not configured for this OLT' }, { status: 503 });
    }

    let commands: string[] = [];

    if (action === 'addVlan') {
      if (!vlanId) return NextResponse.json({ error: 'vlanId required' }, { status: 400 });
      const vid = parseInt(vlanId);
      if (isNaN(vid) || vid < 1 || vid > 4094) return NextResponse.json({ error: 'Invalid VLAN ID' }, { status: 400 });
      const vlanMode = (mode === 'access') ? `switchport default vlan ${vid}` : `switchport vlan ${vid} tag`;
      commands = [
        'configure terminal',
        `interface ${port}`,
        vlanMode,
        'exit',
        'end',
      ];
    } else if (action === 'removeVlan') {
      if (!vlanId) return NextResponse.json({ error: 'vlanId required' }, { status: 400 });
      const vid = parseInt(vlanId);
      if (isNaN(vid) || vid < 1 || vid > 4094) return NextResponse.json({ error: 'Invalid VLAN ID' }, { status: 400 });
      commands = [
        'configure terminal',
        `interface ${port}`,
        `no switchport vlan ${vid} tag`,
        'exit',
        'end',
      ];
    } else if (action === 'enable') {
      commands = [
        'configure terminal',
        `interface ${port}`,
        'no shutdown',
        'exit',
        'end',
      ];
    } else if (action === 'disable') {
      commands = [
        'configure terminal',
        `interface ${port}`,
        'shutdown',
        'exit',
        'end',
      ];
    } else if (action === 'setDescription') {
      if (!description) return NextResponse.json({ error: 'description required' }, { status: 400 });
      // Sanitize description: only allow printable ASCII, max 64 chars
      const safeDesc = description.replace(/[^\x20-\x7E]/g, '').slice(0, 64);
      commands = [
        'configure terminal',
        `interface ${port}`,
        `description ${safeDesc}`,
        'exit',
        'end',
      ];
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    // Execute each command sequentially
    for (const cmd of commands) {
      const result = await executeCommand(telnetConfig, cmd);
      if (!result.success) {
        return NextResponse.json({ error: `Command failed: ${cmd}`, detail: result.error }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, port, action });
  } catch (error: any) {
    console.error('[OLT Uplink POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
