import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import { promisify } from 'util';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { clearIsolationSettingsCache } from '@/server/services/isolation.service';

const execAsync = promisify(exec);

/**
 * Update VPS kernel route for isolation pool whenever settings change.
 * Only runs on Linux (i.e., on the VPS itself, not on dev machines).
 * Non-fatal: errors are logged but never bubble up to the API response.
 */
async function syncIsolationRouteOnVps(oldPool: string | null, newPool: string): Promise<void> {
  if (process.platform !== 'linux') return;
  if (!newPool) return;

  try {
    // Detect ppp0 peer/gateway IP dynamically — works regardless of VPN subnet
    const { stdout } = await execAsync('ip route show dev ppp0 2>/dev/null');
    const peerIp = stdout.trim().split('\n')[0]?.split(' ')[0] ?? '';
    if (!peerIp.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      console.warn('[Isolation Route] ppp0 not up or peer IP not detected — skipping route sync');
      return;
    }

    // Remove old pool route + iptables rule when pool CIDR changes
    if (oldPool && oldPool !== newPool) {
      await execAsync(`ip route del ${oldPool} dev ppp0 2>/dev/null || true`);
      await execAsync(`iptables -D INPUT -s ${oldPool} -p tcp --dport 80 -j ACCEPT 2>/dev/null || true`);
    }

    // Add/replace route for new pool
    await execAsync(`ip route replace ${newPool} via ${peerIp} dev ppp0 metric 100`);

    // Ensure iptables allows port 80 from the new pool
    await execAsync(
      `iptables -C INPUT -s ${newPool} -p tcp --dport 80 -j ACCEPT 2>/dev/null || ` +
      `iptables -I INPUT -s ${newPool} -p tcp --dport 80 -j ACCEPT`
    );

    // Persist ISOLATION_POOL to /etc/vpn/vpn.conf so 99-vpn-routes uses it after ppp0 reconnects
    const vpnConfPath = '/etc/vpn/vpn.conf';
    let existing = '';
    try { existing = await fs.readFile(vpnConfPath, 'utf8'); } catch { /* file may not exist yet */ }
    const updated = existing
      .split('\n')
      .filter(l => !l.startsWith('ISOLATION_POOL='))
      .concat([`ISOLATION_POOL=${newPool}`])
      .join('\n')
      .replace(/^\n+/, '');
    await fs.mkdir('/etc/vpn', { recursive: true });
    await fs.writeFile(vpnConfPath, updated, 'utf8');

    console.log(`[Isolation Route] Synced: ${newPool} via ${peerIp} (ppp0), vpn.conf updated`);
  } catch (err) {
    console.error('[Isolation Route] Failed to sync VPS route (non-fatal):', err);
  }
}

// GET - Get isolation settings
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('[Isolation API] GET request received');
    
    const company = await prisma.company.findFirst({
      select: {
        isolationEnabled: true,
        isolationIpPool: true,
        isolationServerIp: true,
        isolationRateLimit: true,
        isolationRedirectUrl: true,
        isolationMessage: true,
        isolationAllowDns: true,
        isolationAllowPayment: true,
        isolationNotifyWhatsapp: true,
        isolationNotifyEmail: true,
        gracePeriodDays: true,
        baseUrl: true,
      }
    });

    console.log('[Isolation API] Company found:', company ? 'Yes' : 'No');

    if (!company) {
      return NextResponse.json({
        success: false,
        error: 'Company settings not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: company
    });
  } catch (error: any) {
    console.error('[Isolation API] Get isolation settings error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

// PUT - Update isolation settings
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    
    const {
      isolationEnabled,
      isolationIpPool,
      isolationServerIp,
      isolationRateLimit,
      isolationRedirectUrl,
      isolationMessage,
      isolationAllowDns,
      isolationAllowPayment,
      isolationNotifyWhatsapp,
      isolationNotifyEmail,
      gracePeriodDays
    } = body;

    // Validate IP pool format (basic validation)
    if (isolationIpPool && !isolationIpPool.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid IP pool format. Use CIDR notation (e.g., 192.168.200.0/24)'
      }, { status: 400 });
    }

    // Validate server IP (plain IPv4)
    if (isolationServerIp && !isolationServerIp.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid server IP format. Use a plain IPv4 address (e.g., 103.151.140.110)'
      }, { status: 400 });
    }

    // Validate rate limit format
    if (isolationRateLimit && !isolationRateLimit.match(/^\d+[kmg]?\/\d+[kmg]?$/i)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid rate limit format. Use format like: 64k/64k, 1M/1M'
      }, { status: 400 });
    }

    const company = await prisma.company.findFirst();
    
    if (!company) {
      return NextResponse.json({
        success: false,
        error: 'Company not found'
      }, { status: 404 });
    }

    const updated = await prisma.company.update({
      where: { id: company.id },
      data: {
        isolationEnabled: isolationEnabled ?? company.isolationEnabled,
        isolationIpPool: isolationIpPool ?? company.isolationIpPool,
        isolationServerIp: isolationServerIp !== undefined ? (isolationServerIp || null) : company.isolationServerIp,
        isolationRateLimit: isolationRateLimit ?? company.isolationRateLimit,
        isolationRedirectUrl: isolationRedirectUrl ?? company.isolationRedirectUrl,
        isolationMessage: isolationMessage ?? company.isolationMessage,
        isolationAllowDns: isolationAllowDns ?? company.isolationAllowDns,
        isolationAllowPayment: isolationAllowPayment ?? company.isolationAllowPayment,
        isolationNotifyWhatsapp: isolationNotifyWhatsapp ?? company.isolationNotifyWhatsapp,
        isolationNotifyEmail: isolationNotifyEmail ?? company.isolationNotifyEmail,
        gracePeriodDays: gracePeriodDays ?? company.gracePeriodDays,
      }
    });

    // Upsert all three isolir attributes: DELETE+INSERT to prevent duplicates.
    // radgroupreply has no UNIQUE constraint, so ON DUPLICATE KEY UPDATE would keep adding rows.
    const rateLimit = isolationRateLimit ?? company.isolationRateLimit ?? '64k/64k';
    await prisma.$executeRaw`
      DELETE FROM radgroupreply
      WHERE groupname = 'isolir' AND attribute = 'Mikrotik-Rate-Limit'
    `;
    await prisma.$executeRaw`
      INSERT INTO radgroupreply (groupname, attribute, op, value)
      VALUES ('isolir', 'Mikrotik-Rate-Limit', ':=', ${rateLimit})
    `;
    await prisma.$executeRaw`
      DELETE FROM radgroupreply
      WHERE groupname = 'isolir' AND attribute = 'Mikrotik-Group'
    `;
    await prisma.$executeRaw`
      INSERT INTO radgroupreply (groupname, attribute, op, value)
      VALUES ('isolir', 'Mikrotik-Group', ':=', 'isolir')
    `;
    const ipPool = isolationIpPool ?? company.isolationIpPool ?? '192.168.200.0/24';
    const poolName = 'pool-isolir';
    await prisma.$executeRaw`
      DELETE FROM radgroupreply
      WHERE groupname = 'isolir' AND attribute = 'Framed-Pool'
    `;
    await prisma.$executeRaw`
      INSERT INTO radgroupreply (groupname, attribute, op, value)
      VALUES ('isolir', 'Framed-Pool', ':=', ${poolName})
    `;
    // Mikrotik-Address-List: ensures user is added to the 'isolir' address-list on
    // reconnect, so MikroTik firewall rules (src-address-list=isolir action=drop)
    // block internet without needing manual IP range rules.
    await prisma.$executeRaw`
      DELETE FROM radgroupreply
      WHERE groupname = 'isolir' AND attribute = 'Mikrotik-Address-List'
    `;
    await prisma.$executeRaw`
      INSERT INTO radgroupreply (groupname, attribute, op, value)
      VALUES ('isolir', 'Mikrotik-Address-List', ':=', 'isolir')
    `;

    // Clear isolation settings cache so cron picks up new values immediately
    clearIsolationSettingsCache();

    // Sync VPS kernel route if isolation pool CIDR changed (fire-and-forget, non-fatal)
    const oldPool = company.isolationIpPool ?? null;
    const finalPool = isolationIpPool ?? oldPool;
    if (finalPool) {
      syncIsolationRouteOnVps(oldPool, finalPool).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      message: 'Isolation settings updated successfully',
      data: updated
    });
  } catch (error: any) {
    console.error('Update isolation settings error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
