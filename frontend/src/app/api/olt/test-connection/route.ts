import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';
import { testSNMP } from '@/lib/olt/snmp';
import { testSSH } from '@/lib/olt/ssh';
import { testTelnet } from '@/lib/olt/telnet';

// POST - Test OLT connection (SNMP / SSH / Telnet)
// Accepts either:
//   { oltId, protocol } — look up OLT from DB
//   { ipAddress, username, password, snmpCommunity, sshEnabled, telnetEnabled, sshPort, telnetPort, snmpPort } — direct params (for new OLT before save)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const body = await request.json();
    const { oltId, protocol } = body;

    // Resolve OLT config from DB or direct params
    let ipAddress: string;
    let username: string | null | undefined;
    let password: string | null | undefined;
    let snmpCommunity: string | null | undefined;
    let sshPort: number | null | undefined;
    let telnetPort: number | null | undefined;
    let snmpPort: number | null | undefined;
    let sshEnabled: boolean;
    let telnetEnabled: boolean;

    if (oltId) {
      // Load from DB
      const olt = await prisma.networkOLT.findUnique({ where: { id: oltId } });
      if (!olt) {
        return NextResponse.json({ error: 'OLT not found' }, { status: 404 });
      }
      ipAddress = olt.ipAddress;
      username = olt.username;
      password = olt.password;
      snmpCommunity = olt.snmpCommunity;
      sshPort = olt.sshPort;
      telnetPort = olt.telnetPort;
      snmpPort = olt.snmpPort;
      sshEnabled = olt.sshEnabled ?? true;
      telnetEnabled = olt.telnetEnabled ?? false;
    } else {
      // Use direct params from request body (for new OLT not yet saved)
      if (!body.ipAddress) {
        return NextResponse.json({ error: 'ipAddress is required when oltId is not provided' }, { status: 400 });
      }
      ipAddress = body.ipAddress;
      username = body.username || null;
      password = body.password || null;
      snmpCommunity = body.snmpCommunity || 'public';
      sshPort = body.sshPort ? parseInt(String(body.sshPort)) : 22;
      telnetPort = body.telnetPort ? parseInt(String(body.telnetPort)) : 23;
      snmpPort = body.snmpPort ? parseInt(String(body.snmpPort)) : 161;
      sshEnabled = body.sshEnabled !== false;
      telnetEnabled = body.telnetEnabled === true;
    }

    // If protocol is specified, test only that protocol
    if (protocol) {
      let success = false;
      let message = '';

      if (protocol === 'snmp') {
        success = await testSNMP({
          host: ipAddress,
          community: snmpCommunity ?? 'public',
          port: snmpPort,
        });
        message = success ? 'SNMP connection successful' : 'SNMP connection failed';
      } else if (protocol === 'ssh') {
        if (!username) {
          return NextResponse.json({ error: 'Username required for SSH' }, { status: 400 });
        }
        success = await testSSH({
          host: ipAddress,
          port: sshPort,
          username: username as string,
          password: password ?? undefined,
        });
        message = success ? 'SSH connection successful' : 'SSH connection failed';
      } else if (protocol === 'telnet') {
        if (!username) {
          return NextResponse.json({ error: 'Username required for Telnet' }, { status: 400 });
        }
        success = await testTelnet({
          host: ipAddress,
          port: telnetPort,
          username: username as string,
          password: password ?? '',
        });
        message = success ? 'Telnet connection successful' : 'Telnet connection failed';
      } else {
        return NextResponse.json({ error: 'Invalid protocol. Use snmp, ssh, or telnet' }, { status: 400 });
      }

      return NextResponse.json({ success, message });
    }

    // No protocol specified — test all enabled protocols and return summary
    const results: { method: string; success: boolean; message: string; time: number }[] = [];

    // Always test SNMP
    const snmpStart = Date.now();
    try {
      const snmpOk = await testSNMP({ host: ipAddress, community: snmpCommunity ?? 'public', port: snmpPort });
      results.push({ method: 'SNMP', success: snmpOk, message: snmpOk ? 'Connected' : 'Failed', time: Date.now() - snmpStart });
    } catch (e: any) {
      results.push({ method: 'SNMP', success: false, message: e.message, time: Date.now() - snmpStart });
    }

    // Test SSH if enabled and credentials provided
    if (sshEnabled && username) {
      const sshStart = Date.now();
      try {
        const sshOk = await testSSH({ host: ipAddress, port: sshPort, username: username as string, password: password ?? undefined });
        results.push({ method: 'SSH', success: sshOk, message: sshOk ? 'Connected' : 'Failed', time: Date.now() - sshStart });
      } catch (e: any) {
        results.push({ method: 'SSH', success: false, message: e.message, time: Date.now() - sshStart });
      }
    }

    // Test Telnet if enabled and credentials provided
    if (telnetEnabled && username) {
      const telStart = Date.now();
      try {
        const telOk = await testTelnet({ host: ipAddress, port: telnetPort, username, password: password ?? '' });
        results.push({ method: 'Telnet', success: telOk, message: telOk ? 'Connected' : 'Failed', time: Date.now() - telStart });
      } catch (e: any) {
        results.push({ method: 'Telnet', success: false, message: e.message, time: Date.now() - telStart });
      }
    }

    const anySuccess = results.some(r => r.success);

    // Update isOnline status in DB when oltId is known and result is clear
    if (oltId) {
      try {
        await prisma.networkOLT.update({
          where: { id: oltId },
          data: { isOnline: anySuccess },
        });
      } catch (_) {
        // non-fatal – ignore DB update errors
      }
    }

    return NextResponse.json({
      success: anySuccess,
      results: { tests: results },
      message: anySuccess ? 'At least one protocol connected successfully' : 'All connection attempts failed',
    });
  } catch (error: any) {
    console.error('[OLT Test Connection]', error);
    return NextResponse.json({ error: 'Test failed', details: error.message }, { status: 500 });
  }
}
