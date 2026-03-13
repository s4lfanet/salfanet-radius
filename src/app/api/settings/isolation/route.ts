import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { clearIsolationSettingsCache } from '@/server/services/isolation.service';

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

    // Sync rate limit to RADIUS radgroupreply for 'isolir' group (upsert so rows are created if missing)
    const rateLimit = isolationRateLimit ?? company.isolationRateLimit ?? '64k/64k';
    await prisma.$executeRaw`
      INSERT INTO radgroupreply (groupname, attribute, op, value)
      VALUES ('isolir', 'Mikrotik-Rate-Limit', ':=', ${rateLimit})
      ON DUPLICATE KEY UPDATE value = ${rateLimit}
    `;
    // Ensure Mikrotik-Group attribute exists (maps user to 'isolir' PPPoE profile)
    await prisma.$executeRaw`
      INSERT INTO radgroupreply (groupname, attribute, op, value)
      VALUES ('isolir', 'Mikrotik-Group', ':=', 'isolir')
      ON DUPLICATE KEY UPDATE value = 'isolir'
    `;
    // Ensure IP pool attribute exists
    const ipPool = isolationIpPool ?? company.isolationIpPool ?? '192.168.200.0/24';
    const poolName = 'pool-isolir';
    await prisma.$executeRaw`
      INSERT INTO radgroupreply (groupname, attribute, op, value)
      VALUES ('isolir', 'Framed-Pool', ':=', ${poolName})
      ON DUPLICATE KEY UPDATE value = ${poolName}
    `;

    // Clear isolation settings cache so cron picks up new values immediately
    clearIsolationSettingsCache()

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
