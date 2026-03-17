import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { getIsolationSettings, getCidrRange } from '@/server/services/isolation.service';
import { formatWIB } from '@/lib/timezone';

// GET - Generate MikroTik script based on current isolation settings
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get current isolation settings
    const settings = await getIsolationSettings();
    
    if (!settings.isolationEnabled) {
      return NextResponse.json({
        success: false,
        error: 'Isolation system is disabled'
      }, { status: 400 });
    }

    // Parse IP pool settings
    const ipRange = getCidrRange(settings.isolationIpPool);
    
    // Extract rate limit values
    let rateLimit = settings.isolationRateLimit;
    const rateParts = rateLimit.split('/');
    const uploadLimit = rateParts[0] || '128k';
    const downloadLimit = rateParts[1] || '128k';

    // Get billing server IP: use stored isolationServerIp first, then query param, then placeholder
    const { searchParams } = new URL(request.url);
    const billingServerIp = settings.isolationServerIp || searchParams.get('billingIp') || 'YOUR_BILLING_SERVER_IP';
    const isolationPageIp = settings.isolationServerIp || searchParams.get('isolationIp') || billingServerIp;

    // Generate MikroTik script
    const script = `# MikroTik Isolation System Configuration
# Generated automatically based on current isolation settings
# IP Pool: ${settings.isolationIpPool}
# Rate Limit: ${settings.isolationRateLimit}
# Generated on: ${formatWIB(new Date())}

# ============================================
# 1. IP Pool for Isolated Users
# ============================================
/ip pool
add name=pool-isolir ranges=${ipRange.startIp}-${ipRange.endIp}

# ============================================
# 2. PPP Profile for Isolation
# ============================================
/ppp profile
add name=isolir local-address=${ipRange.gateway} remote-address=pool-isolir \\
    rate-limit=${uploadLimit}/${downloadLimit} \\
    session-timeout=1d use-compression=no use-encryption=no \\
    comment="SALFANET RADIUS - Isolation Profile"
# NOTE: Tambahkan dns-server dan bridge sesuai konfigurasi router Anda jika diperlukan

# ============================================
# 3. Firewall Rules for Isolation
# ============================================
${settings.isolationAllowDns ? `# Allow DNS queries for isolated users
/ip firewall filter
add action=accept chain=forward comment="Allow DNS for isolated users" \\
    dst-port=53 protocol=udp src-address=${settings.isolationIpPool}

add action=accept chain=forward comment="Allow DNS TCP for isolated users" \\
    dst-port=53 protocol=tcp src-address=${settings.isolationIpPool}

` : ''}${settings.isolationAllowPayment ? `# Allow access to billing system for payments
add action=accept chain=forward comment="Allow HTTPS to billing system" \\
    dst-address=${billingServerIp} dst-port=443 protocol=tcp \\
    src-address=${settings.isolationIpPool}

add action=accept chain=forward comment="Allow HTTP to billing system" \\
    dst-address=${billingServerIp} dst-port=80 protocol=tcp \\
    src-address=${settings.isolationIpPool}

` : ''}# Allow isolated users to access isolation page
add action=accept chain=forward comment="Allow access to isolation page" \\
    dst-address=${isolationPageIp} dst-port=80,443 protocol=tcp \\
    src-address=${settings.isolationIpPool}

# Block all other internet access for isolated users
add action=drop chain=forward comment="Block internet for isolated users" \\
    src-address=${settings.isolationIpPool}

# ============================================
# 4. NAT Rules for HTTP Redirect
# ============================================
${settings.isolationRedirectUrl ? `# Redirect HTTP traffic to custom isolation URL
/ip firewall nat
add action=redirect chain=dstnat comment="Redirect isolated HTTP to custom page" \\
    dst-port=80 protocol=tcp src-address=${settings.isolationIpPool} \\
    to-ports=80 to-addresses=${new URL(settings.isolationRedirectUrl).hostname}

` : `# Redirect HTTP traffic to isolation page  
/ip firewall nat
add action=redirect chain=dstnat comment="Redirect isolated HTTP to isolation page" \\
    dst-port=80 protocol=tcp src-address=${settings.isolationIpPool} \\
    to-ports=80 to-addresses=${isolationPageIp}

`}${settings.isolationAllowPayment ? `# Allow HTTPS passthrough to billing system
add action=accept chain=dstnat comment="Allow HTTPS to billing for isolated users" \\
    dst-address=${billingServerIp} dst-port=443 protocol=tcp \\
    src-address=${settings.isolationIpPool}

` : ''}# ============================================
# 5. RADIUS Configuration  
# ============================================
# Note: Update YOUR_RADIUS_SERVER_IP and YOUR_RADIUS_SECRET
/radius
add address=YOUR_RADIUS_SERVER_IP secret=YOUR_RADIUS_SECRET \\
    service=ppp timeout=3s

/ppp aaa
set accounting=yes interim-update=5m use-radius=yes

# ============================================
# 6. CoA Configuration (for Disconnect)
# ============================================
/radius incoming
set accept=yes port=3799 vrf=main

# ============================================
# 7. Optional: Logging for Monitoring
# ============================================
/system logging
add action=memory topics=radius

# ============================================
# Configuration Complete
# ============================================
# Next steps:
# 1. Replace YOUR_RADIUS_SERVER_IP with your actual RADIUS server IP
# 2. Replace YOUR_RADIUS_SECRET with your actual RADIUS secret
# 3. Verify IP ranges don't conflict with existing networks
# 4. Test isolation by moving a test user to 'isolir' group in RADIUS`;

    return NextResponse.json({
      success: true,
      script: script,
      settings: {
        ipPool: settings.isolationIpPool,
        ipRange: ipRange,
        rateLimit: settings.isolationRateLimit,
        allowDns: settings.isolationAllowDns,
        allowPayment: settings.isolationAllowPayment,
        redirectUrl: settings.isolationRedirectUrl
      }
    });

  } catch (error: any) {
    console.error('Generate MikroTik script error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}