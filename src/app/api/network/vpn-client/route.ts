import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { prisma } from '@/server/db/client'
import { MikroTikConnection } from '@/server/services/mikrotik/client'
import { generateKeyPairSync, randomUUID } from 'crypto'
import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-this-32'
const ALGORITHM = 'aes-256-cbc'

// Decrypt password that was encrypted with encryptPassword() in vpn-server/route.ts
function decryptPassword(encrypted: string): string {
  try {
    const [ivHex, encryptedHex] = encrypted.split(':')
    if (!ivHex || !encryptedHex) return encrypted // not encrypted, return as-is
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv)
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch {
    return encrypted // fallback: return as-is if decryption fails
  }
}

// Helper: Generate random password
function generatePassword(length = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}

// Helper: Generate WireGuard-compatible X25519 key pair (raw base64)
function generateWireGuardKeys(): { privateKey: string; publicKey: string } {
  try {
    const { privateKey: privDer, publicKey: pubDer } = generateKeyPairSync('x25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
      publicKeyEncoding: { type: 'spki', format: 'der' },
    })
    // PKCS8 DER for X25519: last 32 bytes are raw private key
    // SPKI DER for X25519: last 32 bytes are raw public key
    const rawPriv = Buffer.from(privDer as unknown as ArrayBuffer).slice(-32)
    const rawPub = Buffer.from(pubDer as unknown as ArrayBuffer).slice(-32)
    return {
      privateKey: rawPriv.toString('base64'),
      publicKey: rawPub.toString('base64'),
    }
  } catch {
    // Fallback: random 32-byte private key (less secure, for older Node)
    const privateKey = Buffer.alloc(32)
    for (let i = 0; i < 32; i++) privateKey[i] = Math.floor(Math.random() * 256)
    // Clamp private key per WireGuard spec
    privateKey[0] &= 248
    privateKey[31] &= 127
    privateKey[31] |= 64
    return { privateKey: privateKey.toString('base64'), publicKey: '' }
  }
}

// Helper: Get next available IP from pool (per server)
async function getNextAvailableIP(vpnServerId: string, subnet: string): Promise<string> {
  const [network] = subnet.split('/')
  const parts = network.split('.')
  const baseNetwork = `${parts[0]}.${parts[1]}.${parts[2]}`

  // Get all used IPs for THIS server only
  const clients = await prisma.vpnClient.findMany({
    where: { vpnServerId },
    select: { vpnIp: true },
  })
  const usedIPs = new Set(clients.map((c: { vpnIp: string }) => c.vpnIp))

  // Find first available IP (starting from .10)
  for (let i = 10; i <= 254; i++) {
    const ip = `${baseNetwork}.${i}`
    if (!usedIPs.has(ip)) {
      return ip
    }
  }

  throw new Error('No available IP in pool')
}

// Helper: Get next available Winbox port (sequential in limited range for Docker port mapping)
async function getNextWinboxPort(vpnServerId: string): Promise<number> {
  const MIN_PORT = 10000
  const MAX_PORT = 10100  // Limited range for easier Docker port mapping
  
  const clients = await prisma.vpnClient.findMany({
    where: { vpnServerId },
    select: { winboxPort: true },
  })

  const usedPorts = new Set(clients.map((c: { winboxPort: number | null }) => c.winboxPort).filter((p: number | null) => p !== null) as number[])
  
  // Find first available port in range
  for (let port = MIN_PORT; port <= MAX_PORT; port++) {
    if (!usedPorts.has(port)) {
      return port
    }
  }

  throw new Error(`No available ports in range ${MIN_PORT}-${MAX_PORT}. Please expand Docker port mapping.`)
}

// GET - Load all VPN clients
export async function GET() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const clients = await prisma.vpnClient.findMany({
      orderBy: { createdAt: 'desc' },
    })

    const vpnServers = await prisma.vpnServer.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    })

    // Fetch NAS secrets from router (nas) table for each client
    const clientIds = clients.map((c: { id: string }) => c.id).filter(Boolean)
    const nasEntries = clientIds.length > 0
      ? await prisma.router.findMany({
          where: { vpnClientId: { in: clientIds } },
          select: { vpnClientId: true, secret: true, nasname: true },
        })
      : []
    const nasMap = new Map(nasEntries.map((n: { vpnClientId: string | null; secret: string; nasname: string }) => [n.vpnClientId, n]))

    // Also find RADIUS server IP for frontend
    const radiusServerClient = clients.find((c: { isRadiusServer: boolean }) => c.isRadiusServer)

    const clientsWithNas = clients.map((c: { id: string }) => ({
      ...c,
      nasSecret: nasMap.get(c.id)?.secret ?? null,
    }))

    return NextResponse.json({
      clients: clientsWithNas,
      vpnServers,
      radiusServerIp: radiusServerClient?.vpnIp ?? null,
    })
  } catch (error) {
    console.error('Load clients error:', error)
    return NextResponse.json({
      error: 'Failed to load clients',
      clients: [],
      vpnServers: [],
      radiusServerIp: null,
    }, { status: 500 })
  }
}

// POST - Create new VPN client
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const { name, description, vpnServerId, vpnType: rawVpnType } = await request.json()
    const normalizedType = String(rawVpnType || 'l2tp').toLowerCase()
    const vpnType: 'l2tp' | 'pptp' | 'sstp' | 'wireguard' =
      normalizedType === 'pptp' || normalizedType === 'sstp' || normalizedType === 'wireguard' ? normalizedType as any : 'l2tp'

    // Validate VPN server ID
    if (!vpnServerId) {
      return NextResponse.json(
        { error: 'VPN Server selection is required' },
        { status: 400 }
      )
    }

    // Get VPN server config
    const vpnServer = await prisma.vpnServer.findUnique({
      where: { id: vpnServerId },
    })

    if (!vpnServer) {
      return NextResponse.json(
        { error: 'Selected VPN Server not found' },
        { status: 404 }
      )
    }

    // Generate credentials
    const username = `vpn-${name.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).substring(2, 6)}`
    const password = generatePassword(12)
    const apiUsername = `api-${name.toLowerCase().replace(/\s+/g, '-')}`
    const apiPassword = generatePassword(16)
    
    // Get available IP and port FOR THIS SERVER
    const vpnIp = await getNextAvailableIP(vpnServerId, vpnServer.subnet)
    const winboxPort = vpnType !== 'wireguard' ? await getNextWinboxPort(vpnServerId) : null

    console.log('Creating VPN client:', { username, vpnIp, winboxPort, vpnType })

    // Connect to CHR
    const mtik = new MikroTikConnection({
      host: vpnServer.host,
      username: vpnServer.username,
      password: decryptPassword(vpnServer.password),
      port: vpnServer.apiPort,
      timeout: 15000,
    })

    await mtik.connect()

    let clientPublicKey: string | null = null
    let clientPrivateKey: string | null = null

    if (vpnType === 'wireguard') {
      // === WireGuard flow ===
      // Generate client key pair
      const wgKeys = generateWireGuardKeys()
      clientPublicKey = wgKeys.publicKey
      clientPrivateKey = wgKeys.privateKey

      // Add WireGuard peer on CHR
      const peerAdded = await mtik.addWireGuardPeer(clientPublicKey, vpnIp, name)
      if (!peerAdded) {
        await mtik.disconnect()
        return NextResponse.json(
          { error: 'Failed to add WireGuard peer on CHR. Ensure CHR is running RouterOS 7+ with WireGuard support.' },
          { status: 500 }
        )
      }
      console.log('WireGuard peer added on CHR')
    } else {
      // === PPP (L2TP / SSTP / PPTP) flow ===
      await mtik.execute('/ppp/secret/add', [
        `=name=${username}`,
        `=password=${password}`,
        '=service=any',
        '=profile=vpn-profile',
        `=remote-address=${vpnIp}`,
        `=comment=SALFANET-${name}`,
      ])
      console.log('PPP secret created')

      // Add NAT dst-nat for Winbox remote
      if (winboxPort) {
        await mtik.execute('/ip/firewall/nat/add', [
          '=chain=dstnat',
          '=protocol=tcp',
          `=dst-port=${winboxPort}`,
          '=action=dst-nat',
          `=to-addresses=${vpnIp}`,
          '=to-ports=8291',
          `=comment=Winbox-${name}`,
        ])
        console.log('Winbox NAT created:', winboxPort)
      }
    }

    await mtik.disconnect()

    // Save to database
    const client = await prisma.vpnClient.create({
      data: {
        name,
        vpnServerId,
        vpnIp,
        username,
        password,
        description: description || null,
        vpnType: vpnType.toUpperCase(),
        winboxPort,
        apiUsername: vpnType !== 'wireguard' ? apiUsername : null,
        apiPassword: vpnType !== 'wireguard' ? apiPassword : null,
        clientPublicKey,
        clientPrivateKey,
        isActive: true,
      },
    })

    // Get RADIUS server VPN IP (the VPN client marked as isRadiusServer)
    let radiusServerVpnIp = ''
    try {
      const radiusServer = await prisma.vpnClient.findFirst({
        where: { isRadiusServer: true },
      })
      if (radiusServer) {
        radiusServerVpnIp = radiusServer.vpnIp
      }
    } catch {
      // Ignore
    }

    // Auto-create or retrieve NAS (router) entry for RADIUS authentication
    // This registers the NAS device in FreeRADIUS so auth requests are accepted
    let nasSecret = generatePassword(16)
    try {
      // Check if NAS entry already exists for this VPN IP
      const existingNas = await prisma.router.findFirst({
        where: { nasname: vpnIp },
        select: { id: true, secret: true },
      })
      if (existingNas) {
        // Reuse existing secret & link to this vpnClient
        nasSecret = existingNas.secret
        await prisma.router.update({
          where: { id: existingNas.id },
          data: { vpnClientId: client.id },
        })
      } else {
        // Create new NAS entry
        await prisma.router.create({
          data: {
            id: randomUUID(),
            name: name,
            nasname: vpnIp,
            shortname: name.substring(0, 32),
            type: vpnType === 'wireguard' ? 'mikrotik' : 'mikrotik',
            ipAddress: vpnIp,
            username: apiUsername || 'admin',
            password: apiPassword || 'admin',
            secret: nasSecret,
            ports: 1812,
            vpnClientId: client.id,
            description: `Auto-created NAS for VPN client '${name}' (${vpnType.toUpperCase()})`,
          },
        })
      }
    } catch (nasErr) {
      console.error('NAS auto-create error (non-fatal):', nasErr)
    }

    const radiusSection = radiusServerVpnIp ? `
# --- Setup RADIUS Server via VPN ---
/radius remove [find where comment~"SALFANET"]
/radius add address=${radiusServerVpnIp} secret=${nasSecret} service=ppp,hotspot src-address=${vpnIp} authentication-port=1812 accounting-port=1813 timeout=3s comment="SALFANET RADIUS via VPN"

# --- Enable RADIUS ---
/ppp aaa set use-radius=yes accounting=yes
/radius incoming set accept=yes port=3799

# --- Firewall - Allow CoA dari RADIUS Server via VPN ---
/ip firewall filter remove [find where comment~"SALFANET-RADIUS"]
/ip firewall filter add chain=input protocol=udp src-address=${radiusServerVpnIp} dst-port=3799 action=accept comment="SALFANET-RADIUS CoA" place-before=0
/ip firewall filter add chain=input protocol=udp src-address=${radiusServerVpnIp} dst-port=1812,1813 action=accept comment="SALFANET-RADIUS Auth" place-before=0

# --- Enable RADIUS untuk Hotspot ---
/ip hotspot profile set [find] use-radius=yes` : `
# --- RADIUS Server belum dikonfigurasi ---
# Tandai salah satu VPN Client sebagai "RADIUS Server" di panel admin
# kemudian setup RADIUS manual:
# /radius add address=<RADIUS_VPN_IP> secret=${nasSecret} service=ppp,hotspot src-address=${vpnIp}`

    // Get server public key for WireGuard
    const serverWgPublicKey = (vpnServer as any).wgPublicKey || ''
    const wgPort = (vpnServer as any).wgPort || 51820

    // Generate NAS setup script based on vpnType
    let nasSetupScript = ''

    if (vpnType === 'wireguard') {
      nasSetupScript = `
# ============================================
# SALFANET WireGuard VPN Client + RADIUS Setup Script
# NAS: ${name}
# VPN Server: ${vpnServer.host}
# VPN IP: ${vpnIp}
# Generated: ${new Date().toISOString()}
# NOTE: Requires RouterOS 7+ with WireGuard support
# ============================================

# --- STEP 1: Create WireGuard Interface ---
/interface wireguard add listen-port=0 name=wg0-salfanet comment="SALFANET WireGuard"

# --- STEP 2: Set Client Private Key ---
# (Private key generated by SALFANET - keep secret!)
/interface wireguard set wg0-salfanet private-key="${clientPrivateKey}"

# --- STEP 3: Add Peer (VPN Server CHR) ---
/interface wireguard peers add interface=wg0-salfanet public-key="${serverWgPublicKey}" endpoint-address=${vpnServer.host} endpoint-port=${wgPort} allowed-address=0.0.0.0/0 persistent-keepalive=25 comment="SALFANET VPN Server"

# --- STEP 4: Assign VPN IP ---
/ip address add address=${vpnIp}/24 interface=wg0-salfanet comment="SALFANET VPN IP"

# --- STEP 5: Tunggu koneksi (5 detik) ---
:delay 5s

# --- STEP 6: Verifikasi koneksi ---
:put "WireGuard Client IP: ${vpnIp}"
:put "Server public key: ${serverWgPublicKey}"
${radiusSection}

# ============================================
# SELESAI! Verifikasi:
# /interface wireguard print
# /interface wireguard peers print
# /ip address print where interface=wg0-salfanet
# ============================================
`.trim()
    } else {
      const vpnTypeUpper = vpnType.toUpperCase()
      const interfaceType = vpnType === 'pptp' ? 'pptp-client' : vpnType === 'sstp' ? 'sstp-client' : 'l2tp-client'
      const ipsecLine = vpnType === 'l2tp' ? ' use-ipsec=yes ipsec-secret=salfanet-vpn-secret' : ''
      const authLine = vpnType === 'l2tp' ? ' allow=mschap2' : ' authentication=mschap2'
      const portLine = vpnType === 'sstp' ? ' port=992' : ''

      nasSetupScript = `
# ============================================
# SALFANET ${vpnTypeUpper} VPN Client + RADIUS Setup Script
# NAS: ${name}
# VPN Server: ${vpnServer.host}
# VPN IP: ${vpnIp}
# Generated: ${new Date().toISOString()}
# ============================================

# --- STEP 1: Create API User Group ---
/user group add name=api-users policy=read,api,test comment="Limited API Access Group"

# --- STEP 2: Create API User ---
/user add name=${apiUsername} group=api-users password=${apiPassword} comment="API User for Remote Access"

# --- STEP 3: Setup ${vpnTypeUpper} Client ---
/interface ${interfaceType} add name=${interfaceType}-salfanet connect-to=${vpnServer.host} user=${username} password=${password}${ipsecLine}${portLine} disabled=no${authLine} add-default-route=no comment="SALFANET VPN"

# --- STEP 4: Tunggu koneksi (10 detik) ---
:delay 10s

# --- STEP 5: Verifikasi koneksi VPN ---
:if ([/interface ${interfaceType} get [find name="${interfaceType}-salfanet"] running] = true) do={
    :put "VPN Connected! IP: ${vpnIp}"
} else={
    :put "VPN belum terkoneksi, cek log: /log print where topics~\\"${vpnType}\\""
}
${radiusSection}

# ============================================
# SELESAI! Verifikasi:
# /interface ${interfaceType} print
# /radius print
# /ip firewall filter print where comment~"SALFANET"
# ============================================
`.trim()
    }

    return NextResponse.json({
      success: true,
      client,
      credentials: {
        server: vpnServer.host,
        username,
        password,
        vpnIp,
        winboxPort: winboxPort || undefined,
        winboxRemote: winboxPort ? `${vpnServer.host}:${winboxPort}` : undefined,
        apiUsername: vpnType !== 'wireguard' ? apiUsername : undefined,
        apiPassword: vpnType !== 'wireguard' ? apiPassword : undefined,
        // WireGuard specific
        clientPrivateKey: vpnType === 'wireguard' ? clientPrivateKey : undefined,
        clientPublicKey: vpnType === 'wireguard' ? clientPublicKey : undefined,
        serverPublicKey: vpnType === 'wireguard' ? serverWgPublicKey : undefined,
        wgPort: vpnType === 'wireguard' ? wgPort : undefined,
        vpnType,
        // RADIUS NAS credentials (for all VPN types including WireGuard)
        nasSecret: nasSecret,
        radiusServerIp: radiusServerVpnIp || undefined,
      },
      nasSetupScript,
    })
  } catch (error: any) {
    console.error('Create client error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create client' },
      { status: 500 }
    )
  }
}

// PUT - Update VPN client (toggle RADIUS server)
export async function PUT(request: Request) {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const { id, isRadiusServer } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'Client ID required' }, { status: 400 })
    }

    // If setting as RADIUS server, unset others first
    if (isRadiusServer) {
      await prisma.vpnClient.updateMany({
        where: { isRadiusServer: true },
        data: { isRadiusServer: false },
      })
    }

    // Update client
    const client = await prisma.vpnClient.update({
      where: { id },
      data: { isRadiusServer },
    })

    return NextResponse.json({ success: true, client })
  } catch (error: any) {
    console.error('Update client error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Remove VPN client
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Client ID required' }, { status: 400 })
    }

    // Get client info
    const client = await prisma.vpnClient.findUnique({ where: { id } })
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Get VPN server config (from client's server)
    const vpnServer = await prisma.vpnServer.findUnique({
      where: { id: client.vpnServerId },
    })

    if (vpnServer) {
      try {
        const mtik = new MikroTikConnection({
          host: vpnServer.host,
          username: vpnServer.username,
          password: decryptPassword(vpnServer.password),
          port: vpnServer.apiPort,
          timeout: 15000,
        })

        await mtik.connect()

        if (client.vpnType?.toUpperCase() === 'WIREGUARD') {
          // Remove WireGuard peer
          await mtik.removeWireGuardPeer(client.name)
          console.log('WireGuard peer removed')
        } else {
          // 1. Remove PPP secret
          const secrets = await mtik.execute('/ppp/secret/print', [
            `?name=${client.username}`,
          ])

          if (secrets.length > 0) {
            await mtik.execute('/ppp/secret/remove', [
              `=.id=${secrets[0]['.id']}`,
            ])
            console.log('PPP secret removed')
          }

          // 2. Remove NAT rule
          if (client.winboxPort) {
            const natRules = await mtik.execute('/ip/firewall/nat/print', [
              '?chain=dstnat',
              `?dst-port=${client.winboxPort}`,
            ])

            if (natRules.length > 0) {
              await mtik.execute('/ip/firewall/nat/remove', [
                `=.id=${natRules[0]['.id']}`,
              ])
              console.log('NAT rule removed')
            }
          }
        }

        await mtik.disconnect()
      } catch (error) {
        console.error('CHR delete error:', error)
        // Continue to delete from DB even if CHR fails
      }
    }

    // Delete from database
    await prisma.vpnClient.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete client error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
