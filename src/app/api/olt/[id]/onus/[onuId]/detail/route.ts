import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';
import { executeCommand, TelnetConfig } from '@/lib/olt/telnet';

function parseKeyValueOutput(output: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of output.split('\n')) {
    const match = line.match(/^\s*([^:]{2,60}):\s*(.*?)\s*$/);
    if (match) parsed[match[1].trim()] = match[2].trim();
  }
  return parsed;
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
      detail: { raw: '', parsed: {} as Record<string, string> },
      optical: { raw: '', parsed: {} as Record<string, string> },
      config: { raw: '', parsed: {} as Record<string, string> },
    };

    if (telnetConfig) {
      const [detail, optical, config] = await Promise.all([
        executeCommand(telnetConfig, `show gpon onu detail-info ${iface}`),
        executeCommand(telnetConfig, `show pon power onu-rx ${iface}`),
        executeCommand(telnetConfig, `show running-config interface ${iface}`),
      ]);

      telnet.detail.raw = detail.output ?? detail.error ?? '';
      telnet.detail.parsed = parseKeyValueOutput(telnet.detail.raw);
      telnet.optical.raw = optical.output ?? optical.error ?? '';
      telnet.optical.parsed = parseKeyValueOutput(telnet.optical.raw);
      telnet.config.raw = config.output ?? config.error ?? '';
      telnet.config.parsed = parseKeyValueOutput(telnet.config.raw);
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