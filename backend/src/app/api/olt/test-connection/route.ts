import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { testSNMP } from '@/lib/olt/snmp';
import { snmpDiagnosis } from '@/lib/olt/scan';
import { testSSH } from '@/lib/olt/ssh';
import { testTelnet } from '@/lib/olt/telnet';
import { checkHiosoLogin } from '@/lib/olt/hioso-telnet';
import { readHiosoWeb } from '@/lib/olt/hioso-web';

/** Brand, ONU count and per-column rows after SNMP connects; null if it takes too long. */
async function snmpDiagnosisWithin(host: string, community: string | null | undefined, port: number | null | undefined): Promise<string | null> {
  return Promise.race([
    snmpDiagnosis({ host, community: community ?? 'public', port: port ?? undefined }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 60_000)),
  ]).catch(() => null);
}

/**
 * Telnet login test. A Hioso OLT needs its own session (option negotiation, CRLF, enable) and
 * says why it failed; the other brands keep the shared expect-based test.
 */
async function telnetLogin(
  config: { host: string; port: number; username: string; password: string },
  vendor: string | null | undefined,
): Promise<{ ok: boolean; reason?: string }> {
  if (vendor?.toLowerCase() === 'hioso') {
    const reason = await checkHiosoLogin(config);
    return reason === null ? { ok: true } : { ok: false, reason };
  }
  return { ok: await testTelnet(config) };
}

// POST - Test OLT connection (SNMP / SSH / Telnet)
// Accepts either:
//   { oltId, protocol } — look up OLT from DB
//   { ipAddress, username, password, snmpCommunity, sshEnabled, telnetEnabled, sshPort, telnetPort, snmpPort } — direct params (for new OLT before save)
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('network.view');
  if (!authCheck.authorized) return authCheck.response;

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
    let vendor: string | null | undefined;

    if (oltId && !body.ipAddress) {
      // Load from DB (no direct params supplied)
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
      vendor = olt.vendor;
    } else {
      // Use direct params from request body — also when editing, so the
      // test targets the credentials currently typed into the form rather
      // than the previously saved ones (oltId still updates isOnline below).
      if (!body.ipAddress) {
        return NextResponse.json({ error: 'ipAddress is required when oltId is not provided' }, { status: 400 });
      }
      // A blank username/password while editing means "keep the saved one",
      // so fall back to the stored value.
      const saved = oltId ? await prisma.networkOLT.findUnique({ where: { id: oltId } }) : null;
      ipAddress = body.ipAddress;
      username = body.username || saved?.username || null;
      password = body.password || saved?.password || null;
      snmpCommunity = body.snmpCommunity || 'public';
      sshPort = body.sshPort ? parseInt(String(body.sshPort)) : 22;
      telnetPort = body.telnetPort ? parseInt(String(body.telnetPort)) : 23;
      snmpPort = body.snmpPort ? parseInt(String(body.snmpPort)) : 161;
      sshEnabled = body.sshEnabled !== false;
      telnetEnabled = body.telnetEnabled === true;
      vendor = body.vendor || saved?.vendor;
    }

    // If protocol is specified, test only that protocol
    if (protocol) {
      let success = false;
      let message = '';

      if (protocol === 'snmp') {
        const snmpResult = await testSNMP({
          host: ipAddress,
          community: snmpCommunity ?? 'public',
          port: snmpPort,
        });
        success = snmpResult.success;
        message = success
          ? 'SNMP connection successful'
          : `SNMP connection failed: ${snmpResult.error ?? 'unknown error'}`;

        // Say which brand answered and how many ONUs were read, so a wrong brand or an
        // empty table shows up now instead of as a blank monitoring page later.
        if (success) {
          const diagnosis = await snmpDiagnosisWithin(ipAddress, snmpCommunity, snmpPort);
          if (diagnosis) message += `\n${diagnosis}`;
        }
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
        const login = await telnetLogin(
          { host: ipAddress, port: telnetPort ?? 23, username: username as string, password: password ?? '' },
          vendor,
        );
        success = login.ok;
        message = success ? 'Telnet connection successful' : `Telnet connection failed${login.reason ? `: ${login.reason}` : ''}`;
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
      const snmpResult = await testSNMP({ host: ipAddress, community: snmpCommunity ?? 'public', port: snmpPort });
      const snmpMs = Date.now() - snmpStart;
      const diagnosis = snmpResult.success ? await snmpDiagnosisWithin(ipAddress, snmpCommunity, snmpPort) : null;
      results.push({
        method: 'SNMP',
        success: snmpResult.success,
        message: snmpResult.success ? 'Connected' + (diagnosis ? '\n' + diagnosis : '') : (snmpResult.error ?? 'Failed'),
        time: snmpMs,
      });
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
        const login = await telnetLogin({ host: ipAddress, port: telnetPort ?? 23, username, password: password ?? '' }, vendor);
        results.push({
          method: 'Telnet',
          success: login.ok,
          message: login.ok ? 'Connected' : `Failed${login.reason ? `: ${login.reason}` : ''}`,
          time: Date.now() - telStart,
        });
      } catch (e: any) {
        results.push({ method: 'Telnet', success: false, message: e.message, time: Date.now() - telStart });
      }
    }

    // A Hioso OLT is mainly read through its web page, so that gets its own line.
    if (vendor?.toLowerCase() === 'hioso' && username) {
      const webStart = Date.now();
      try {
        const { onus } = await readHiosoWeb({ host: ipAddress, username, password: password ?? '' });
        results.push({
          method: 'Web',
          success: true,
          message: onus.length > 0 ? `Connected, ${onus.length} ONU` : 'Connected, daftar ONU kosong',
          time: Date.now() - webStart,
        });
      } catch (e: any) {
        results.push({ method: 'Web', success: false, message: `Failed: ${e.message}`, time: Date.now() - webStart });
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
