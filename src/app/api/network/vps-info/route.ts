import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import os from 'os';

function getPublicIpFromNetworkInterfaces(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '';
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Priority: VPS_IP env → extract from NEXTAUTH_URL → network interface auto-detect
  let vpsIp = process.env.VPS_IP || '';

  if (!vpsIp && process.env.NEXTAUTH_URL) {
    try {
      const url = new URL(process.env.NEXTAUTH_URL);
      const host = url.hostname;
      // Only use if it looks like a public IP or hostname (not localhost/127.x)
      if (host && host !== 'localhost' && !host.startsWith('127.')) {
        vpsIp = host;
      }
    } catch { /* ignore malformed URL */ }
  }

  if (!vpsIp) {
    vpsIp = getPublicIpFromNetworkInterfaces();
  }

  return NextResponse.json({ vpsIp });
}
