import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { clearIsolationSettingsCache, getCidrRange } from '@/server/services/isolation.service';

// GET - Get current isolation settings
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get isolation settings
    const company = await prisma.company.findFirst({
      select: {
        isolationEnabled: true,
        isolationIpPool: true,
        isolationServerIp: true,
        isolationRateLimit: true,
        isolationRedirectUrl: true,
        isolationAllowDns: true,
        isolationAllowPayment: true,
        isolationNotifyWhatsapp: true,
        isolationNotifyEmail: true,
        isolationWhatsappTemplateId: true,
        isolationEmailTemplateId: true,
        isolationHtmlTemplateId: true,
      }
    });

    if (!company) {
      return NextResponse.json({
        success: false,
        error: 'Company settings not found'
      }, { status: 404 });
    }

    // Get IP range info for display
    let ipRangeInfo = null;
    try {
      if (company.isolationIpPool) {
        ipRangeInfo = getCidrRange(company.isolationIpPool);
      }
    } catch (error) {
      console.error('Error parsing IP range:', error);
    }

    return NextResponse.json({
      success: true,
      settings: {
        ...company,
        ipRangeInfo
      }
    });

  } catch (error: any) {
    console.error('Get isolation settings error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update isolation settings
export async function PUT(request: NextRequest) {
  try {
    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      isolationEnabled,
      isolationIpPool,
      isolationServerIp,
      isolationRateLimit,
      isolationRedirectUrl,
      isolationAllowDns,
      isolationAllowPayment,
      isolationNotifyWhatsapp,
      isolationNotifyEmail,
      isolationWhatsappTemplateId,
      isolationEmailTemplateId,
      isolationHtmlTemplateId,
    } = body;

    // Validate IP pool format
    if (isolationIpPool) {
      const cidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/(?:[0-9]|[1-2][0-9]|3[0-2])$/;
      if (!cidrRegex.test(isolationIpPool)) {
        return NextResponse.json({
          success: false,
          error: 'Invalid IP pool format. Use CIDR notation (e.g., 192.168.200.0/24)'
        }, { status: 400 });
      }
    }

    // Validate server IP (plain IPv4 only — MikroTik NAT requires IP)
    if (isolationServerIp && !isolationServerIp.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid server IP format. Use a plain IPv4 address (e.g., 103.151.140.110)'
      }, { status: 400 });
    }

    // Validate rate limit format (basic check)
    if (isolationRateLimit) {
      const rateLimitRegex = /^\d+[kmgKMG]?\/\d+[kmgKMG]?/;
      if (!rateLimitRegex.test(isolationRateLimit)) {
        return NextResponse.json({
          success: false,
          error: 'Invalid rate limit format. Use format like "128k/128k" or "1M/1M"'
        }, { status: 400 });
      }
    }

    // Update company settings
    const updatedCompany = await prisma.company.updateMany({
      data: {
        isolationEnabled,
        isolationIpPool,
        isolationServerIp: isolationServerIp !== undefined ? (isolationServerIp || null) : undefined,
        isolationRateLimit,
        isolationRedirectUrl,
        isolationAllowDns,
        isolationAllowPayment,
        isolationNotifyWhatsapp,
        isolationNotifyEmail,
        isolationWhatsappTemplateId,
        isolationEmailTemplateId,
        isolationHtmlTemplateId,
      }
    });

    if (updatedCompany.count === 0) {
      return NextResponse.json({
        success: false,
        error: 'Failed to update settings'
      }, { status: 500 });
    }

    // Upsert RADIUS group configuration for 'isolir' (creates rows if they don't exist yet)
    const rateLimit = isolationRateLimit ?? '64k/64k';
    await prisma.$executeRaw`
      INSERT INTO radgroupreply (groupname, attribute, op, value)
      VALUES ('isolir', 'Mikrotik-Rate-Limit', ':=', ${rateLimit})
      ON DUPLICATE KEY UPDATE value = ${rateLimit}
    `;
    await prisma.$executeRaw`
      INSERT INTO radgroupreply (groupname, attribute, op, value)
      VALUES ('isolir', 'Mikrotik-Group', ':=', 'isolir')
      ON DUPLICATE KEY UPDATE value = 'isolir'
    `;
    await prisma.$executeRaw`
      INSERT INTO radgroupreply (groupname, attribute, op, value)
      VALUES ('isolir', 'Framed-Pool', ':=', 'pool-isolir')
      ON DUPLICATE KEY UPDATE value = 'pool-isolir'
    `;

    // Clear cache so new settings take effect immediately
    clearIsolationSettingsCache();

    // Get IP range info for response
    let ipRangeInfo = null;
    try {
      if (isolationIpPool) {
        ipRangeInfo = getCidrRange(isolationIpPool);
      }
    } catch (error) {
      console.error('Error parsing IP range:', error);
    }

    return NextResponse.json({
      success: true,
      message: 'Isolation settings updated successfully',
      ipRangeInfo
    });

  } catch (error: any) {
    console.error('Update isolation settings error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}