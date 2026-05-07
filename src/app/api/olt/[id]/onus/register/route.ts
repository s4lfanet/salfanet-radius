import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';
import { executeMultipleCommands } from '@/lib/olt/telnet';

/**
 * POST /api/olt/[id]/onus/register
 * Register an unregistered ONU on ZTE C320 via Telnet.
 *
 * Body:
 *   frame:        number  (always 1 for ZTE C320)
 *   slot:         number  (board/card slot, e.g. 1)
 *   port:         number  (PON port 0-based, e.g. 0)
 *   onuId:        number  (target ONU ID, 1-128; auto-assign if omitted)
 *   serialNumber: string  (e.g. "ZTEG0DA5918AC")
 *   onuType:      string  (e.g. "ZTE-F609", "ZTE-F660", "All" …)
 *   vlan:         number  (service VLAN, e.g. 100)
 *   tcontProfile: string  (e.g. "1G", "100M")
 *   description:  string? (optional ONU name/customer label)
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
      port,           // 0-based port index from SNMP
      onuId: requestedOnuId,
      serialNumber,
      onuType = 'All',
      vlan = 100,
      tcontProfile = '1G',
      description,
    } = body;

    if (!slot || port === undefined || !serialNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: slot, port, serialNumber' },
        { status: 400 }
      );
    }

    // Lookup OLT record
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

    // ZTE port convention: SNMP port 0-based → CLI pon is port+1
    const ponPort = port + 1;          // e.g. port=0 → pon=1
    const onuId = requestedOnuId ?? 1; // caller must supply a valid free ID (or use auto-find)

    // ─── Build ZTE C320 V2.1 Telnet command sequence ──────────────────────────
    // Reference: zte_command.py from oltc320_v2.1.1_linux
    const ponInterface  = `gpon-olt_${frame}/${slot}/${ponPort}`;
    const onuInterface  = `gpon-onu_${frame}/${slot}/${ponPort}:${onuId}`;
    const tcontId       = 1;
    const gemportId     = 1;
    const servicePortId = 1;
    const vportId       = 1;

    const commands: string[] = [
      // Enter config mode
      'configure terminal',

      // Step 1: Register ONU on the PON port
      `interface ${ponInterface}`,
      `onu ${onuId} type All sn ${serialNumber}`,
      ...(description ? [`onu ${onuId} description ${description}`] : []),
      'exit',

      // Step 2: Configure ONU interface (TCONT + GEM + service-port)
      `interface ${onuInterface}`,
      `tcont ${tcontId} profile ${tcontProfile}`,
      `gemport ${gemportId} tcont ${tcontId}`,
      `service-port ${servicePortId} vport ${vportId} user-vlan ${vlan} vlan ${vlan}`,
      'exit',

      // Exit config
      'end',
    ];

    const result = await executeMultipleCommands(telnetConfig, commands);

    if (!result.success) {
      return NextResponse.json(
        { error: `Telnet command failed: ${result.error}` },
        { status: 500 }
      );
    }

    // Check output for ZTE error messages
    const output = result.output ?? '';
    const lowerOutput = output.toLowerCase();
    if (lowerOutput.includes('%error') || lowerOutput.includes('invalid input') || lowerOutput.includes('already exist')) {
      const errorLine = output.split('\n').find(l => l.includes('%') || l.toLowerCase().includes('invalid') || l.toLowerCase().includes('already'));
      return NextResponse.json(
        { error: `OLT rejected registration: ${errorLine ?? output.slice(0, 200)}` },
        { status: 422 }
      );
    }

    // Update the DB record for this ONU to reflect new registration
    try {
      await prisma.oltOnuStatus.updateMany({
        where: {
          oltId: id,
          frame,
          slot,
          port,
          onuId,
        },
        data: {
          status: 'offline',                   // Will go online after OLT re-polls
          serialNumber: serialNumber ?? null,
          description: description ?? null,
          updatedAt: new Date(),
        },
      });
    } catch {
      // Non-critical: DB update failure doesn't mean registration failed
    }

    return NextResponse.json({
      success: true,
      message: `ONU ${serialNumber} registered as ID ${onuId} on gpon-olt_${frame}/${slot}/${ponPort}`,
      ponInterface,
      onuInterface,
      onuId,
    });
  } catch (error: any) {
    console.error('[ONU Register]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
