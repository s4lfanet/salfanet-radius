import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { unauthorized } from '@/lib/api-response';
import { Client as SSHClient } from 'ssh2';
import * as net from 'net';

type TestResult = { method: string; success: boolean; message: string; time: number };

// POST - Test OLT connection with raw credentials (before saving)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { ipAddress, vendor, username, password, sshEnabled, telnetEnabled } = await request.json();

    if (!ipAddress) {
      return NextResponse.json({ success: false, error: 'IP Address is required' }, { status: 400 });
    }

    const tests: TestResult[] = [];

    // Test SSH if enabled
    if (sshEnabled && username && password) {
      tests.push(await testSSH(ipAddress, username, password));
    }

    // Test Telnet if enabled
    if (telnetEnabled) {
      tests.push(await testTelnet(ipAddress));
    }

    // Always test basic reachability (SNMP port / TCP)
    tests.push(await testPing(ipAddress));

    const success = tests.some((t) => t.success);
    const message = success
      ? 'Connection test passed!'
      : 'Connection test failed. Check details below.';

    return NextResponse.json({ success, message, results: { ip: ipAddress, vendor, tests } });
  } catch (error) {
    console.error('[admin/olt/test-connection]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to test connection', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// SSH - uses ssh2 directly with legacy algorithm support for older OLT devices
async function testSSH(host: string, username: string, password: string): Promise<TestResult> {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const conn = new SSHClient();
    const timeout = setTimeout(() => {
      conn.end();
      resolve({ method: 'SSH', success: false, message: 'Connection timeout (10s)', time: Date.now() - startTime });
    }, 10000);

    conn.on('ready', () => {
      clearTimeout(timeout);
      conn.end();
      resolve({ method: 'SSH', success: true, message: 'SSH connection successful', time: Date.now() - startTime });
    });

    conn.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ method: 'SSH', success: false, message: `SSH error: ${err.message}`, time: Date.now() - startTime });
    });

    try {
      conn.connect({
        host,
        port: 22,
        username,
        password,
        readyTimeout: 10000,
        algorithms: {
          serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521'],
          kex: ['diffie-hellman-group1-sha1', 'diffie-hellman-group14-sha1', 'diffie-hellman-group-exchange-sha1', 'diffie-hellman-group-exchange-sha256'],
          cipher: ['aes128-cbc', 'aes192-cbc', 'aes256-cbc', 'aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
          hmac: ['hmac-sha1', 'hmac-sha2-256', 'hmac-sha2-512'],
        },
      });
    } catch (err) {
      clearTimeout(timeout);
      resolve({ method: 'SSH', success: false, message: `SSH connect failed: ${err instanceof Error ? err.message : 'Unknown error'}`, time: Date.now() - startTime });
    }
  });
}

// Telnet - check port 23 is open
async function testTelnet(host: string): Promise<TestResult> {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      resolve({ method: 'Telnet', success: false, message: 'Connection timeout (10s)', time: Date.now() - startTime });
    }, 10000);

    client.connect(23, host, () => {
      clearTimeout(timeout);
      client.destroy();
      resolve({ method: 'Telnet', success: true, message: 'Telnet port 23 is open', time: Date.now() - startTime });
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      client.destroy();
      resolve({ method: 'Telnet', success: false, message: `Telnet error: ${err.message}`, time: Date.now() - startTime });
    });
  });
}

// Ping - try SNMP port 161 then HTTP port 80 as fallback
async function testPing(host: string): Promise<TestResult> {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const tryPort = (port: number, label: string, fallback?: () => void) => {
      const client = new net.Socket();
      const timeout = setTimeout(() => {
        client.destroy();
        if (fallback) fallback();
        else resolve({ method: 'ICMP/TCP', success: false, message: 'Host unreachable (timeout)', time: Date.now() - startTime });
      }, 5000);

      client.connect(port, host, () => {
        clearTimeout(timeout);
        client.destroy();
        resolve({ method: 'ICMP/TCP', success: true, message: `Host is reachable (${label} port open)`, time: Date.now() - startTime });
      });

      client.on('error', () => {
        clearTimeout(timeout);
        client.destroy();
        if (fallback) fallback();
        else resolve({ method: 'ICMP/TCP', success: false, message: 'Host unreachable', time: Date.now() - startTime });
      });
    };

    tryPort(161, 'SNMP', () => tryPort(80, 'HTTP'));
  });
}
