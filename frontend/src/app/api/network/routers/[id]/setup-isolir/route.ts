import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getCidrRange } from '@/server/services/isolation.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  
  try {
    const { id } = await params;

    // Get router + VPN client info
    const router = await prisma.router.findUnique({
      where: { id },
      include: { vpnClient: { include: { vpnServer: true } } },
    });

    if (!router) {
      return NextResponse.json({ error: 'Router not found' }, { status: 404 });
    }

    // Read isolation settings from company config
    const company = await prisma.company.findFirst({
      select: { isolationIpPool: true, isolationRateLimit: true },
    });
    const isolationCidr = company?.isolationIpPool || '192.168.200.0/24';
    const rateLimit = company?.isolationRateLimit || '64k/64k';
    const { startIp, endIp, gateway } = getCidrRange(isolationCidr);
    const cidrNetwork = isolationCidr; // e.g. 192.168.200.0/24
    const poolRange = `${startIp}-${endIp}`;

    // Determine billing server IP (RADIUS server = VPS public IP or VPN gateway)
    let billingServerIp = process.env.VPS_IP || process.env.RADIUS_SERVER_IP || '127.0.0.1';
    const nasVpnIp = router.vpnClient?.vpnIp || router.nasname;
    if (router.vpnClientId && router.vpnClient) {
      const vpnType = (router.vpnClient.vpnType || '').toUpperCase();
      if (vpnType === 'WIREGUARD') {
        // VPS gateway IP = billing server
        const subnet = (router.vpnClient as any).vpnServer?.subnet || '10.200.0.0/24';
        billingServerIp = subnet.replace(/\.\d+\/\d+$/, '.1');
      } else {
        const radiusServerVpn = await prisma.vpnClient.findFirst({ where: { isRadiusServer: true } });
        if (radiusServerVpn) billingServerIp = radiusServerVpn.vpnIp;
      }
    }

    const script = `
# ============================================
# SALFANET Isolation Setup Script
# Router   : ${router.name}
# NAS IP   : ${nasVpnIp}
# Isolir IP: ${cidrNetwork}
# Billing  : ${billingServerIp}
# Generated: ${new Date().toISOString()}
# ============================================
# Jalankan SETELAH script RADIUS selesai.
# Compatible with RouterOS 6.x and 7.x

# ============================================
# 1. IP Pool untuk user isolir
# ============================================
:if ([:len [/ip pool find name="pool-isolir"]] = 0) do={
    /ip pool add name=pool-isolir ranges=${poolRange} comment="SALFANET RADIUS - Isolation Pool"
} else={
    /ip pool set [find name="pool-isolir"] ranges=${poolRange}
}

# ============================================
# 2. PPP Profile isolir
# local-address = gateway sisi router pada link PPP
# remote-address = IP pool untuk client isolir
# ============================================
:if ([:len [/ppp profile find name="isolir"]] = 0) do={
    /ppp profile add name=isolir local-address=${gateway} remote-address=pool-isolir rate-limit=${rateLimit} only-one=yes comment="SALFANET RADIUS - Isolation Profile"
} else={
    /ppp profile set [find name="isolir"] local-address=${gateway} remote-address=pool-isolir rate-limit=${rateLimit} only-one=yes
}

# ============================================
# 3. Firewall — Isolation Redirect & Walled Garden
# ============================================
# Hapus rules lama
/ip firewall filter remove [find where comment~"SALFANET-ISOLIR"]
/ip firewall nat remove [find where comment~"SALFANET-ISOLIR"]

# Allow DNS untuk user isolated (wajib agar redirect bisa resolve hostname)
/ip firewall filter add chain=forward protocol=udp dst-port=53 src-address=${cidrNetwork} action=accept comment="SALFANET-ISOLIR Allow DNS UDP"
/ip firewall filter add chain=forward protocol=tcp dst-port=53 src-address=${cidrNetwork} action=accept comment="SALFANET-ISOLIR Allow DNS TCP"

# Allow akses ke billing server (HTTP + HTTPS)
/ip firewall filter add chain=forward dst-address=${billingServerIp} dst-port=80,443 protocol=tcp src-address=${cidrNetwork} action=accept comment="SALFANET-ISOLIR Allow billing"

# Blokir semua internet lain untuk user isolated
/ip firewall filter add chain=forward src-address=${cidrNetwork} action=drop comment="SALFANET-ISOLIR Block internet"

# NAT: Redirect HTTP dari user isolated ke halaman /isolated di billing server
/ip firewall nat add action=dst-nat chain=dstnat dst-port=80 protocol=tcp src-address=${cidrNetwork} to-addresses=${billingServerIp} to-ports=80 comment="SALFANET-ISOLIR Redirect HTTP to billing"

# ============================================
# 4. Route VPS (jalankan di VPS, bukan MikroTik)
# ============================================
# Agar user isolated bisa diakses dari VPS untuk redirect billing:
#   sudo ip route add ${cidrNetwork} via ${nasVpnIp} dev wg0
# Tambahkan ke /etc/rc.local atau /etc/wireguard/wg0.conf [PostUp] agar persisten.
# ============================================

# ============================================
# SELESAI! Verifikasi dengan:
# /ip pool print where name="pool-isolir"
# /ppp profile print where name="isolir"
# /ip firewall filter print where comment~"SALFANET-ISOLIR"
# /ip firewall nat print where comment~"SALFANET-ISOLIR"
# ============================================
`.trim();

    return NextResponse.json({
      success: true,
      message: 'Script isolir berhasil di-generate. Copy dan paste ke MikroTik Terminal.',
      script,
      config: {
        cidr: cidrNetwork,
        poolRange,
        gateway,
        rateLimit,
        billingServer: billingServerIp,
      },
    });
  } catch (error: any) {
    console.error('Setup isolir error:', error);
    return NextResponse.json(
      { error: 'Failed to generate isolir script', details: error.message },
      { status: 500 }
    );
  }
}
