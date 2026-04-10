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
    let radiusServerIp = process.env.RADIUS_SERVER_IP || process.env.VPS_IP || '127.0.0.1';
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
    }

    // Get RADIUS config from router record
    const radiusSecret = router.secret || 'secret123';
    const radiusAuthPort = router.ports ? parseInt(router.ports.toString()) : 1812;
    const radiusAcctPort = 1813;
    const radiusCOAPort = 3799;

    const comment = 'SALFANET RADIUS - Auto Setup';

    // src-address line for /radius add (only when using VPN)
    const srcAddressParam = nasSrcAddress ? ` src-address=${nasSrcAddress}` : '';
    const srcAddressNote = nasSrcAddress
      ? `# NOTE: src-address=${nasSrcAddress} (VPN IP) wajib diisi agar FreeRADIUS mengenali NAS ini`
      : `# NOTE: Pastikan IP router ${router.nasname} sudah didaftarkan di FreeRADIUS NAS table`;

    // Derive VPN gateway IP from RADIUS server IP (e.g. 10.20.30.10 → 10.20.30.1)
    // Needed because CoA packets from VPS may be masqueraded through VPN gateway
    const gatewayIp = radiusServerIp.replace(/\.\d+$/, '.1');
    const isVpnSetup = !!router.vpnClientId;
    // Only add gateway entry when using VPN tunnel (gateway masquerade scenario)
    const gatewayRadiusEntry = isVpnSetup ? `
# 2b. Tambah entry untuk VPN Gateway (CoA masquerade)
# PENTING: Saat VPS mengirim CoA Disconnect, paket di-masquerade melalui gateway VPN
# MikroTik melihat src-address=${gatewayIp} (gateway) bukan ${radiusServerIp} (VPS)
# Entry ini wajib ada agar secret RADIUS cocok dan CoA diterima
# src-address=${nasSrcAddress} = VPN IP NAS ini (sama seperti entry utama)
# timeout=1100ms = lebih cepat fallback agar tidak delay CoA
/radius add address=${gatewayIp} secret=${radiusSecret} service=ppp,hotspot,login,wireless src-address=${nasSrcAddress} timeout=1100ms require-message-auth=no comment="CoA from VPS via gateway masquerade"
` : '';

    const gatewayFirewallRule = isVpnSetup ? `
# Allow CoA dari gateway (VPN masquerade) — sumber alternatif CoA disconnect
/ip firewall filter add chain=input protocol=udp src-address=${gatewayIp} dst-port=${radiusCOAPort} action=accept comment="SALFANET-RADIUS CoA via gateway ${gatewayIp}"
` : '';

    // Generate MikroTik script for copy-paste (compatible with ROS 6 & 7)
    const script = `
# ============================================
# SALFANET RADIUS Setup Script
# Router: ${router.name}
# Router NAS IP: ${nasSrcAddress || router.nasname}
# RADIUS Server: ${radiusServerIp}
# VPN Gateway: ${isVpnSetup ? gatewayIp : 'N/A (Public IP mode)'}
# Connection: ${router.vpnClientId ? 'VPN Tunnel' : 'Public IP'}
# Generated: ${new Date().toISOString()}
# ============================================
# Compatible with RouterOS 6.x and 7.x

# 1. Hapus RADIUS lama (jika ada)
/radius remove [find where comment~"SALFANET" || comment~"Auto Setup" || comment~"gateway masquerade"]

# 2. Tambah RADIUS Server (utama — auth/acct + CoA)
${srcAddressNote}
/radius add address=${radiusServerIp} secret=${radiusSecret}${srcAddressParam} service=ppp,hotspot,login,wireless authentication-port=${radiusAuthPort} accounting-port=${radiusAcctPort} timeout=3s require-message-auth=no comment="${comment}"
${gatewayRadiusEntry}
# 3. Enable RADIUS untuk PPP + Interim-Update setiap 5 menit
/ppp aaa set use-radius=yes accounting=yes interim-update=5m

# 4. Enable RADIUS Incoming (CoA/Disconnect)
/radius incoming set accept=yes port=${radiusCOAPort}

# 5. Buat IP Pool untuk PPP (jika belum ada)
:if ([:len [/ip pool find name="pool-radius-default"]] = 0) do={
    /ip pool add name=pool-radius-default ranges=10.10.10.2-10.10.10.254 comment="SALFANET RADIUS"
}

# 6. Buat PPP Profile radius-default (jika belum ada)
:if ([:len [/ppp profile find name="radius-default"]] = 0) do={
    /ppp profile add name=radius-default local-address=10.10.10.1 remote-address=pool-radius-default comment="SALFANET RADIUS - Default Profile"
}

# 6b. Buat PPP Profile salfanetradius untuk PPPoE (jika belum ada)
:if ([:len [/ppp profile find name="salfanetradius"]] = 0) do={
    /ppp profile add name=salfanetradius local-address=10.10.10.1 remote-address=pool-radius-default use-compression=no use-encryption=no comment="SALFANET RADIUS - PPPoE Profile"
}

# 7. Buat Hotspot User Profile radius-default (jika belum ada)
:if ([:len [/ip hotspot user profile find name="radius-default"]] = 0) do={
    /ip hotspot user profile add name=radius-default shared-users=1 rate-limit=""
}

# 7b. Buat Hotspot User Profile salfanetradius (jika belum ada)
:if ([:len [/ip hotspot user profile find name="salfanetradius"]] = 0) do={
    /ip hotspot user profile add name=salfanetradius shared-users=1 rate-limit=""
}

# 8. Enable RADIUS untuk semua Hotspot Server Profile
/ip hotspot profile set [find] use-radius=yes

# ============================================
# ISOLATION SETUP (Wajib untuk fitur isolir)
# ============================================
# Buat IP Pool untuk user yang diisolir (jika belum ada)
:if ([:len [/ip pool find name="pool-isolir"]] = 0) do={
    /ip pool add name=pool-isolir ranges=192.168.200.100-192.168.200.200 comment="SALFANET RADIUS - Isolation Pool"
}

# Buat PPP Profile isolir (jika belum ada)
# local-address = gateway untuk sisi router PPP link (bukan nama pool!)
# remote-address = pool untuk IP client
:if ([:len [/ppp profile find name="isolir"]] = 0) do={
    /ppp profile add name=isolir local-address=192.168.200.1 remote-address=pool-isolir rate-limit=64k/64k comment="SALFANET RADIUS - Isolation Profile"
}

# CATATAN: Untuk mengubah rate-limit atau IP pool isolir,
# pergi ke: Admin → Settings → Isolation → MikroTik Setup

# ============================================
# PENTING: Route di VPS untuk pool-isolir
# ============================================
# Agar user isolated bisa membuka halaman billing, VPS harus bisa
# meng-route traffic balik ke 192.168.200.0/24 via tunnel VPN ini.
# Jalankan perintah berikut di VPS (SEKALI SAJA, atau tambahkan ke /etc/rc.local):
#
#   sudo ip route add 192.168.200.0/24 via ${nasSrcAddress || router.nasname}
#
# Tanpa route ini, user isolated tidak akan ter-redirect ke halaman pembayaran.
# ============================================

# ============================================
# ISOLATION FIREWALL — Redirect & Walled Garden
# ============================================
# Hapus rules lama (jika ada)
/ip firewall filter remove [find where comment~"SALFANET-ISOLIR"]
/ip firewall nat remove [find where comment~"SALFANET-ISOLIR"]

# Allow DNS untuk user isolated (wajib agar redirect bisa resolve hostname)
/ip firewall filter add chain=forward protocol=udp dst-port=53 src-address=192.168.200.0/24 action=accept comment="SALFANET-ISOLIR Allow DNS UDP"
/ip firewall filter add chain=forward protocol=tcp dst-port=53 src-address=192.168.200.0/24 action=accept comment="SALFANET-ISOLIR Allow DNS TCP"

# Allow akses ke billing/isolated page (HTTP + HTTPS)
/ip firewall filter add chain=forward dst-address=${radiusServerIp} dst-port=80,443 protocol=tcp src-address=192.168.200.0/24 action=accept comment="SALFANET-ISOLIR Allow billing HTTP/S"

# Blokir semua internet lain untuk user isolated
/ip firewall filter add chain=forward src-address=192.168.200.0/24 action=drop comment="SALFANET-ISOLIR Block internet"

# NAT: Redirect HTTP (port 80) dari user isolated ke halaman /isolated di billing server
# User membuka browser → diarahkan ke https://${radiusServerIp}/isolated?ip=
/ip firewall nat add action=dst-nat chain=dstnat dst-port=80 protocol=tcp src-address=192.168.200.0/24 to-addresses=${radiusServerIp} to-ports=80 comment="SALFANET-ISOLIR Redirect HTTP to billing"

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
# SELESAI! Verifikasi dengan:
# /radius print
# /ppp aaa print
# /radius incoming print
# /ip firewall filter print where comment~"SALFANET"
# /ip pool print where name="pool-isolir"
# /ppp profile print where name="isolir"
# ============================================
`.trim();

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
