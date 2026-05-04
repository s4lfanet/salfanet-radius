import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';
import { testSNMP } from '@/lib/olt/snmp';
import { testSSH } from '@/lib/olt/ssh';
import { testTelnet } from '@/lib/olt/telnet';

// POST - Test OLT connection (SNMP / SSH / Telnet)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const body = await request.json();
    const { oltId, protocol } = body;

    if (!oltId || !protocol) {
      return NextResponse.json({ error: 'oltId and protocol are required' }, { status: 400 });
    }

    const olt = await prisma.networkOLT.findUnique({ where: { id: oltId } });
    if (!olt) {
      return NextResponse.json({ error: 'OLT not found' }, { status: 404 });
    }

    let success = false;
    let message = '';

    if (protocol === 'snmp') {
      success = await testSNMP({
        host: olt.ipAddress,
        community: olt.snmpCommunity,
        port: olt.snmpPort,
      });
      message = success ? 'SNMP connection successful' : 'SNMP connection failed';
    } else if (protocol === 'ssh') {
      if (!olt.username) {
        return NextResponse.json({ error: 'Username required for SSH' }, { status: 400 });
      }
      success = await testSSH({
        host: olt.ipAddress,
        port: olt.sshPort,
        username: olt.username,
        password: olt.password ?? undefined,
      });
      message = success ? 'SSH connection successful' : 'SSH connection failed';
    } else if (protocol === 'telnet') {
      if (!olt.username) {
        return NextResponse.json({ error: 'Username required for Telnet' }, { status: 400 });
      }
      success = await testTelnet({
        host: olt.ipAddress,
        port: olt.telnetPort,
        username: olt.username,
        password: olt.password ?? '',
      });
      message = success ? 'Telnet connection successful' : 'Telnet connection failed';
    } else {
      return NextResponse.json({ error: 'Invalid protocol. Use snmp, ssh, or telnet' }, { status: 400 });
    }

    return NextResponse.json({ success, message });
  } catch (error: any) {
    console.error('[OLT Test Connection]', error);
    return NextResponse.json({ error: 'Test failed', details: error.message }, { status: 500 });
  }
}
