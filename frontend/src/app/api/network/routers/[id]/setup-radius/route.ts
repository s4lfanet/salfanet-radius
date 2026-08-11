import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: routerId } = await params;

    // Get router details from router table
    const router = await prisma.router.findUnique({
      where: { id: routerId },
      include: {
        vpnClient: {
          include: {
            vpnServer: true,
          },
        },
      },
    });

    if (!router) {
      return NextResponse.json({ error: 'Router not found' }, { status: 404 });
    }

    // Determine RADIUS server IP based on connection type
    // Fallback order: RADIUS_SERVER_IP → VPS_IP → hostname dari NEXTAUTH_URL/APP_URL → '127.0.0.1'
    const _appUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || '';
    let _urlHostname = '';
    try {
      if (_appUrl) _urlHostname = new URL(_appUrl).hostname;
    } catch { /* ignore invalid URL */ }
    let radiusServerIp = process.env.RADIUS_SERVER_IP || process.env.VPS_IP || _urlHostname || '127.0.0.1';
    let nasSrcAddress = ''; // VPN IP of the router (NAS), used as src-address in /radius add

    // LOGIC:
    // - Jika router MENGGUNAKAN VPN Client → pakai VPN IP dari isRadiusServer
    // - Jika router TIDAK menggunakan VPN Client (IP Publik) → pakai IP VPS publik
    
    if (router.vpnClientId && router.vpnClient) {
      // Router terhubung via VPN Client
      const vpnType = (router.vpnClient.vpnType || '').toUpperCase()

      if (vpnType === 'WIREGUARD') {
        // WireGuard VPS mode: RADIUS server = VPS gateway IP (x.x.x.1)
        // Derived from the VPN server's subnet (e.g. 10.200.0.0/24 → 10.200.0.1)
        const subnet = (router.vpnClient as any).vpnServer?.subnet || '10.200.0.0/24'
        radiusServerIp = subnet.replace(/\.\d+\/\d+$/, '.1')
      } else {
        // PPP VPN: RADIUS server = VPN IP of the client marked as isRadiusServer
        const radiusServerVpn = await prisma.vpnClient.findFirst({
          where: { isRadiusServer: true },
        })
        if (radiusServerVpn) {
          radiusServerIp = radiusServerVpn.vpnIp
        }
      }

      // src-address = VPN IP of this NAS router so FreeRADIUS can match nasname
      nasSrcAddress = router.vpnClient.vpnIp || '';
    } else {
      // Non-VPN (direct/public IP): src-address = nasname (IP registered in FreeRADIUS)
      // PENTING: Tanpa src-address, MikroTik memilih source IP otomatis dari routing table
      // yang mungkin berbeda dari nasname → FreeRADIUS menolak ("unknown client")
      nasSrcAddress = router.nasname;
    }

    // Get RADIUS config from router record
    const radiusSecret = router.secret || 'secret123';
    const radiusAuthPort = router.ports ? parseInt(router.ports.toString()) : 1812;
    const radiusAcctPort = 1813;
    const radiusCOAPort = 3799;

    const comment = 'SALFANET RADIUS - Auto Setup';

    // src-address selalu di-set (VPN maupun non-VPN) agar FreeRADIUS bisa match nasname
    const srcAddressParam = nasSrcAddress ? ` src-address=${nasSrcAddress}` : '';
    const srcAddressNote = router.vpnClientId
      ? `# NOTE: src-address=${nasSrcAddress} (VPN IP) wajib diisi agar FreeRADIUS mengenali NAS ini`
      : `# NOTE: src-address=${nasSrcAddress} wajib diisi agar RADIUS request dikirim dari IP yang terdaftar di FreeRADIUS`;

    // Derive VPN gateway IP from RADIUS server IP (e.g. 10.20.30.10 → 10.20.30.1)
    // Needed because CoA packets from VPS may be masqueraded through VPN gateway
    const gatewayIp = radiusServerIp.replace(/\.\d+$/, '.1');
    const isVpnSetup = !!router.vpnClientId;
    // Only add gateway entry when using VPN tunnel (gateway masquerade scenario)
    // ROS 6: no require-message-auth param | ROS 7: require-message-auth=no
    const gatewayRadiusEntryRos6 = isVpnSetup ? `
# 2b. Tambah entry untuk VPN Gateway (CoA masquerade)
# PENTING: Saat VPS mengirim CoA Disconnect, paket di-masquerade melalui gateway VPN
# MikroTik melihat src-address=${gatewayIp} (gateway) bukan ${radiusServerIp} (VPS)
/radius add address=${gatewayIp} secret=${radiusSecret} service=ppp,hotspot,login,wireless src-address=${nasSrcAddress} timeout=1100ms comment="CoA from VPS via gateway masquerade"
` : '';
    const gatewayRadiusEntryRos7 = isVpnSetup ? `
# 2b. Tambah entry untuk VPN Gateway (CoA masquerade)
# PENTING: Saat VPS mengirim CoA Disconnect, paket di-masquerade melalui gateway VPN
# MikroTik melihat src-address=${gatewayIp} (gateway) bukan ${radiusServerIp} (VPS)
/radius add address=${gatewayIp} secret=${radiusSecret} service=ppp,hotspot,login,wireless src-address=${nasSrcAddress} timeout=1100ms require-message-auth=no comment="CoA from VPS via gateway masquerade"
` : '';

    const gatewayFirewallRule = isVpnSetup ? `
# Allow CoA dari gateway (VPN masquerade) — sumber alternatif CoA disconnect
/ip firewall filter add chain=input protocol=udp src-address=${gatewayIp} dst-port=${radiusCOAPort} action=accept comment="SALFANET-RADIUS CoA via gateway ${gatewayIp}"
` : '';

    // Generate MikroTik script — two versions: ROS 6 (no require-message-auth) and ROS 7
    const buildScript = (rosVersion: 6 | 7) => {
      const mainRadiusLine = rosVersion === 7
        ? `/radius add address=${radiusServerIp} secret=${radiusSecret}${srcAddressParam} service=ppp,hotspot,login,wireless authentication-port=${radiusAuthPort} accounting-port=${radiusAcctPort} timeout=3s require-message-auth=no comment="${comment}"`
        : `/radius add address=${radiusServerIp} secret=${radiusSecret}${srcAddressParam} service=ppp,hotspot,login,wireless authentication-port=${radiusAuthPort} accounting-port=${radiusAcctPort} timeout=3s comment="${comment}"`;
      const gatewayRadiusEntry = rosVersion === 7 ? gatewayRadiusEntryRos7 : gatewayRadiusEntryRos6;

      return `
# ============================================
# SALFANET RADIUS Setup Script (RouterOS ${rosVersion}.x)
# Router: ${router.name}
# Router NAS IP: ${nasSrcAddress || router.nasname}
# RADIUS Server: ${radiusServerIp}
# VPN Gateway: ${isVpnSetup ? gatewayIp : 'N/A (Public IP mode)'}
# Connection: ${router.vpnClientId ? 'VPN Tunnel' : 'Public IP'}
# Generated: ${new Date().toISOString()}
# ============================================

# 1. Hapus RADIUS lama (jika ada)
/radius remove [find where comment~"SALFANET" || comment~"Auto Setup" || comment~"gateway masquerade"]

# 2. Tambah RADIUS Server (utama — auth/acct + CoA)
${srcAddressNote}
${mainRadiusLine}
${gatewayRadiusEntry}
# 3. Enable RADIUS untuk PPP + Interim-Update setiap 5 menit
/ppp aaa set use-radius=yes accounting=yes interim-update=5m

# 4. Enable RADIUS Incoming (CoA/Disconnect)
/radius incoming set accept=yes port=${radiusCOAPort}

# 5. Buat IP Pool untuk PPP (jika belum ada)
:if ([:len [/ip pool find name="pool-radius-default"]] = 0) do={
    /ip pool add name=pool-radius-default ranges=10.10.10.2-10.10.10.254 comment="SALFANET RADIUS"
}

# 6. Buat PPP Profile salfanetradius (jika belum ada)
:if ([:len [/ppp profile find name="salfanetradius"]] = 0) do={
    /ppp profile add name=salfanetradius local-address=10.10.10.1 remote-address=pool-radius-default use-compression=no use-encryption=no comment="SALFANET RADIUS Profile"
}

# 7. Enable RADIUS untuk semua Hotspot Server Profile
/ip hotspot profile set [find] use-radius=yes

# ============================================
# FIREWALL RULES — RADIUS & CoA
# ============================================
# Hapus rules lama
/ip firewall filter remove [find where comment~"SALFANET-RADIUS"]

# Allow RADIUS CoA/Disconnect dari server (UDP 3799)
/ip firewall filter add chain=input protocol=udp src-address=${radiusServerIp} dst-port=${radiusCOAPort} action=accept comment="SALFANET-RADIUS CoA from ${radiusServerIp}"
${gatewayFirewallRule}
# Allow RADIUS auth/acct response dari server (UDP 1812-1813)
/ip firewall filter add chain=input protocol=udp src-address=${radiusServerIp} dst-port=${radiusAuthPort},${radiusAcctPort} action=accept comment="SALFANET-RADIUS Auth/Acct from ${radiusServerIp}"

# ============================================
# KEEPALIVE & NETWATCH — Deteksi putus lebih cepat
# ============================================
/tool netwatch remove [find where comment~"SALFANET"]
/tool netwatch add host=${radiusServerIp} interval=30s timeout=5s \\
    down-script="/log warning message=\\"SALFANET: RADIUS server ${radiusServerIp} tidak reachable\\"" \\
    up-script="/log info message=\\"SALFANET: RADIUS server ${radiusServerIp} kembali online\\"" \\
    comment="SALFANET RADIUS Monitor"

# ============================================
# SELESAI! Verifikasi dengan:
# /radius print
# /ppp aaa print
# /radius incoming print
# /ppp profile print where name="salfanetradius"
# /ip firewall filter print where comment~"SALFANET-RADIUS"
# /tool netwatch print
# ============================================
# LANGKAH SELANJUTNYA: Setup Isolir
# Klik tombol "Setup Isolir" pada router ini untuk mendapatkan
# script firewall isolasi pelanggan.
# ============================================
`.trim();
    };

    const scriptRos6 = buildScript(6);
    const scriptRos7 = buildScript(7);
    // Keep backward-compat: default script = ROS 7
    const script = scriptRos7;

    // Sync radius-default group to RADIUS database
    try {
      const existingRadiusGroup = await prisma.radgroupreply.findFirst({
        where: {
          groupname: 'radius-default',
          attribute: 'Mikrotik-Group',
        },
      });
      
      if (!existingRadiusGroup) {
        await prisma.radgroupreply.create({
          data: {
            groupname: 'radius-default',
            attribute: 'Mikrotik-Group',
            op: ':=',
            value: 'radius-default',
          },
        });
      }
    } catch (dbError) {
      console.log('RADIUS DB sync skipped');
    }

    return NextResponse.json({
      success: true,
      message: 'Script RADIUS berhasil di-generate. Copy dan paste ke MikroTik Terminal.',
      script,
      scriptRos6,
      scriptRos7,
      config: {
        radiusServer: radiusServerIp,
        nasSrcAddress: nasSrcAddress || null,
        authPort: radiusAuthPort.toString(),
        acctPort: radiusAcctPort.toString(),
        coaPort: radiusCOAPort.toString(),
        radiusSecret: radiusSecret,
        connectionType: router.vpnClientId ? 'VPN' : 'Public IP',
      },
    });
  } catch (error: any) {
    console.error('Generate RADIUS script error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate RADIUS script',
        details: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
