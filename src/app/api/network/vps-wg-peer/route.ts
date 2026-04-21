import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile } from 'fs/promises'
import { prisma } from '@/server/db/client'

// Fixed DB ID for VPS WireGuard virtual server entry
const VPS_WG_SERVER_ID = '__vps_wg_server__'

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let pass = ''
  for (let i = 0; i < length; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length))
  return pass
}

const exec = promisify(execCb)

const WG_IFACE = process.env.WG_IFACE || 'wg0'
const WG_CONF  = `/etc/wireguard/${WG_IFACE}.conf`
const WG_INFO  = '/etc/wireguard/wg-server-info.json'

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Read the wg server info file written by install-wg-server.sh
 * Returns null if not installed.
 */
async function readWgInfo(): Promise<Record<string, any> | null> {
  try {
    const raw = await readFile(WG_INFO, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Generate a WireGuard keypair.
 * Returns { privateKey, publicKey }
 */
async function genKeypair(): Promise<{ privateKey: string; publicKey: string }> {
  const { stdout: priv } = await exec('wg genkey')
  const privateKey = priv.trim()
  const { stdout: pub } = await exec(`echo "${privateKey}" | wg pubkey`)
  return { privateKey: privateKey.trim(), publicKey: pub.trim() }
}

/**
 * Find the next available VPN IP in the WG subnet.
 * Reads existing [Peer] AllowedIPs from wg.conf, returns first free .x in poolStart–poolEnd.
 */
async function nextAvailableIp(subnet: string, poolStart = 2, poolEnd = 254): Promise<string> {
  const base = subnet.split('/')[0].split('.').slice(0, 3).join('.')
  let conf = ''
  try { conf = await readFile(WG_CONF, 'utf8') } catch { /* new conf */ }

  const used = new Set<number>()
  used.add(1) // VPS gateway
  const re = /AllowedIPs\s*=\s*[\d.]+\.(\d+)\/32/g
  let m
  while ((m = re.exec(conf)) !== null) used.add(parseInt(m[1]))

  for (let i = poolStart; i <= poolEnd; i++) {
    if (!used.has(i)) return `${base}.${i}`
  }
  throw new Error(`Subnet penuh: tidak ada IP tersisa (range .${poolStart}–.${poolEnd})`)
}

/**
 * Append a [Peer] block to wg.conf and apply with `wg syncconf`.
 */
async function addPeerToConf(
  pubKey: string,
  vpnIp: string,
  label: string,
): Promise<void> {
  let conf = ''
  try { conf = await readFile(WG_CONF, 'utf8') } catch { /* empty */ }

  const peerBlock = `
# Peer: ${label}
[Peer]
PublicKey = ${pubKey}
AllowedIPs = ${vpnIp}/32
# PersistentKeepalive = 25
`
  await writeFile(WG_CONF, conf + peerBlock, 'utf8')

  // Apply without restarting tunnel (zero-downtime)
  try {
    await exec(`wg syncconf ${WG_IFACE} <(wg-quick strip ${WG_IFACE})`, { shell: '/bin/bash' })
  } catch {
    // Fallback if syncconf unavailable
    try { await exec(`wg addpeer ${WG_IFACE} ${pubKey} allowed-ips ${vpnIp}/32`) } catch { /* ignore */ }
  }
}

/**
 * Remove a [Peer] block from wg.conf and apply.
 */
async function removePeerFromConf(pubKey: string): Promise<void> {
  let conf = ''
  try { conf = await readFile(WG_CONF, 'utf8') } catch { return }

  // Remove peer block: from "# Peer:" or "[Peer]" line that contains pubkey to the next blank line
  const escaped = pubKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    `(#[^\n]*\\n)?\\[Peer\\]\\n(?:[^\\n]*\\n)*?PublicKey\\s*=\\s*${escaped}[^\\n]*\\n(?:[^\\n]*\\n)*?(?=\\n|$)`,
    'g'
  )
  const cleaned = conf.replace(re, '')
  await writeFile(WG_CONF, cleaned, 'utf8')

  try {
    await exec(`wg syncconf ${WG_IFACE} <(wg-quick strip ${WG_IFACE})`, { shell: '/bin/bash' })
  } catch {
    try { await exec(`wg set ${WG_IFACE} peer ${pubKey} remove`) } catch { /* ignore */ }
  }
}

/**
 * Parse peer blocks from wg.conf to extract name (from comment), publicKey, and vpnIp.
 * Returns a map: publicKey → { name, vpnIp }
 */
async function parsePeerNamesFromConf(): Promise<Map<string, { name: string; vpnIp: string }>> {
  const map = new Map<string, { name: string; vpnIp: string }>()
  try {
    const conf = await readFile(WG_CONF, 'utf8')
    // Match each peer block (optional leading comment + [Peer] section)
    const blockRe = /(?:# Peer:\s*([^\n]*)\n)?\[Peer\][^\[]*PublicKey\s*=\s*(\S+)[^\[]*AllowedIPs\s*=\s*([\d.]+)\/32/g
    let m
    while ((m = blockRe.exec(conf)) !== null) {
      const [, name, pubKey, ip] = m
      map.set(pubKey.trim(), { name: (name || pubKey.substring(0, 8)).trim(), vpnIp: ip.trim() })
    }
  } catch { /* conf not readable */ }
  return map
}

/**
 * Sync WG peers from conf into the DB so they appear in router VPN-client dropdown.
 * Safe to call every time GET is invoked — no-op if already in DB.
 */
async function syncPeersToDB(
  info: Record<string, any>,
  confPeers: Map<string, { name: string; vpnIp: string }>,
): Promise<void> {
  if (confPeers.size === 0) return
  try {
    // Ensure virtual VPS WG server row exists
    await prisma.vpnServer.upsert({
      where: { id: VPS_WG_SERVER_ID },
      create: {
        id: VPS_WG_SERVER_ID,
        name: 'VPS WireGuard Server',
        host: info.publicIp || 'vps',
        username: 'vps',
        password: 'vps',
        subnet: info.subnet,
        wgEnabled: true,
        wgPublicKey: info.publicKey,
        wgPort: info.listenPort,
      },
      update: { host: info.publicIp || 'vps', subnet: info.subnet, wgPublicKey: info.publicKey, wgPort: info.listenPort },
    })

    // For each conf peer not yet in DB, create a record
    const existingByPubKey = await prisma.vpnClient.findMany({
      where: { vpnServerId: VPS_WG_SERVER_ID },
      select: { clientPublicKey: true, vpnIp: true },
    })
    const existingIps = new Set(existingByPubKey.map((c) => c.vpnIp))
    const existingKeys = new Set(existingByPubKey.map((c) => c.clientPublicKey).filter(Boolean))

    for (const [pubKey, { name, vpnIp }] of confPeers) {
      if (existingKeys.has(pubKey) || existingIps.has(vpnIp)) continue
      const username = `wg-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).substring(2, 6)}`
      try {
        await prisma.vpnClient.create({
          data: {
            name,
            vpnServerId: VPS_WG_SERVER_ID,
            vpnIp,
            username,
            password: generatePassword(12),
            vpnType: 'WIREGUARD',
            clientPublicKey: pubKey,
            isActive: true,
          },
        })
      } catch { /* might already exist by vpnIp unique constraint */ }
    }
  } catch (e) {
    console.error('[vps-wg-peer] syncPeersToDB error (ignored):', e)
  }
}

// ─── GET /api/network/vps-wg-peer ────────────────────────────────────────
// Returns WG server info + list of active peers from `wg show`
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const info = await readWgInfo()
  if (!info) {
    return NextResponse.json({
      installed: false,
      message: 'WireGuard server belum di-install di VPS ini. Jalankan setup dulu.',
    })
  }

  // Parse conf for peer names (needed for sync + enrichment)
  const confPeers = await parsePeerNamesFromConf()

  // Sync any conf peers not yet in DB (background, fire-and-forget)
  syncPeersToDB(info, confPeers).catch(() => {})

  // Parse live peers from `wg show`
  let peers: Array<{ publicKey: string; name?: string; endpoint?: string; allowedIps?: string; lastHandshake?: string; transfer?: string }> = []
  try {
    const { stdout } = await exec(`wg show ${WG_IFACE} dump`)
    const lines = stdout.trim().split('\n').slice(1) // skip server line
    peers = lines
      .filter((l) => l.trim())
      .map((l) => {
        const [publicKey, , endpoint, allowedIps, lastHandshake, rxBytes, txBytes] = l.split('\t')
        return {
          publicKey,
          name: confPeers.get(publicKey)?.name,
          endpoint: endpoint !== '(none)' ? endpoint : undefined,
          allowedIps: allowedIps !== '(none)' ? allowedIps : undefined,
          lastHandshake: lastHandshake && lastHandshake !== '0' ? new Date(parseInt(lastHandshake) * 1000).toISOString() : undefined,
          transfer: rxBytes && txBytes ? `↓${formatBytes(parseInt(rxBytes))} ↑${formatBytes(parseInt(txBytes))}` : undefined,
        }
      })
  } catch { /* wg not running or no peers */ }

  return NextResponse.json({ installed: true, ...info, peers })
}

// ─── POST /api/network/vps-wg-peer ───────────────────────────────────────
// Body: { action: "add"|"remove", nasName?, publicKey? (for remove), nasLabel? }
// On "add": generates keypair, assigns vpnIp, appends to wg.conf
// On "remove": removes peer by publicKey from wg.conf
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { action, nasName, publicKey: suppliedPubKey } = body

  const info = await readWgInfo()
  if (!info) {
    return NextResponse.json({ error: 'WireGuard server belum di-install' }, { status: 400 })
  }

  if (action === 'add') {
    if (!nasName) return NextResponse.json({ error: 'nasName wajib diisi' }, { status: 400 })

    // If caller provides a NAS public key (NAS-generated), use it.
    // Otherwise generate a full keypair (VPS manages keys for NAS).
    let clientPrivateKey: string | undefined
    let clientPublicKey: string

    if (suppliedPubKey) {
      clientPublicKey = suppliedPubKey
    } else {
      const kp = await genKeypair()
      clientPrivateKey = kp.privateKey
      clientPublicKey = kp.publicKey
    }

    const vpnIp = await nextAvailableIp(info.subnet, info.poolStart ?? 2, info.poolEnd ?? 254)
    await addPeerToConf(clientPublicKey, vpnIp, nasName)

    // Persist client to DB so it appears in Router dropdown
    let nasSecretForResponse: string | undefined
    let apiUsernameForResponse: string | undefined
    let apiPasswordForResponse: string | undefined
    try {
      // Ensure VPS WG virtual server row exists
      await prisma.vpnServer.upsert({
        where: { id: VPS_WG_SERVER_ID },
        create: {
          id: VPS_WG_SERVER_ID,
          name: 'VPS WireGuard Server',
          host: info.publicIp || 'vps',
          username: 'vps',
          password: 'vps',
          subnet: info.subnet,
          wgEnabled: true,
          wgPublicKey: info.publicKey,
          wgPort: info.listenPort,
        },
        update: {
          host: info.publicIp || 'vps',
          subnet: info.subnet,
          wgPublicKey: info.publicKey,
          wgPort: info.listenPort,
        },
      })
      // Use upsert so that if syncPeersToDB already created a stub record (without
      // private key), we update it with the real private key now.
      const username = `wg-${nasName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).substring(2, 6)}`
      const apiUsername = `api-${nasName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      const apiPassword = generatePassword(16)
      const nasSecret = generatePassword(16)
      const dbClient = await prisma.vpnClient.upsert({
        where: {
          // unique index: vpnServerId + vpnIp
          vpnServerId_vpnIp: { vpnServerId: VPS_WG_SERVER_ID, vpnIp },
        },
        create: {
          name: nasName,
          vpnServerId: VPS_WG_SERVER_ID,
          vpnIp,
          username,
          password: generatePassword(12),
          apiUsername,
          apiPassword,
          vpnType: 'WIREGUARD',
          clientPublicKey,
          clientPrivateKey: clientPrivateKey || null,
          isActive: true,
        },
        update: {
          name: nasName,
          clientPublicKey,
          clientPrivateKey: clientPrivateKey || null,
          apiUsername,
          apiPassword,
          isActive: true,
        },
      })
      // Upsert NAS router entry so nasSecret is available for RADIUS script
      const existingNas = await prisma.router.findFirst({ where: { nasname: vpnIp } })
      let finalNasSecret = nasSecret
      if (existingNas) {
        finalNasSecret = existingNas.secret
        await prisma.router.update({
          where: { id: existingNas.id },
          data: { vpnClientId: dbClient.id, username: apiUsername, password: apiPassword },
        })
      } else {
        await prisma.router.create({
          data: {
            id: require('crypto').randomUUID(),
            name: nasName,
            nasname: vpnIp,
            shortname: nasName.substring(0, 32).replace(/[^a-z0-9]/gi, ''),
            type: 'mikrotik',
            ipAddress: vpnIp,
            username: apiUsername,
            password: apiPassword,
            secret: finalNasSecret,
            ports: 1812,
            vpnClientId: dbClient.id,
            description: `Auto-created NAS for WG VPS client '${nasName}'`,
          },
        })
      }
      // Expose for response
      nasSecretForResponse = finalNasSecret
      apiUsernameForResponse = apiUsername
      apiPasswordForResponse = apiPassword
      ;(nasSecretForResponse as unknown as { apiUsername?: string }).toString // trick to keep vars in scope
      // store api creds so they can be included in response below
      Object.assign(info as object, { _apiUsername: apiUsername, _apiPassword: apiPassword })
    } catch (dbErr) {
      console.error('[vps-wg-peer] Gagal simpan ke DB (lanjutkan):', dbErr)
    }

    return NextResponse.json({
      success: true,
      vpnIp,
      clientPublicKey,
      clientPrivateKey, // undefined if caller supplied the key
      serverPublicKey: info.publicKey,
      serverEndpoint: `${info.publicIp}:${info.listenPort}`,
      vpnSubnet: info.subnet,           // full subnet e.g. 10.200.0.0/24
      gatewayIp: info.gatewayIp,        // VPS tunnel IP e.g. 10.200.0.1
      allowedIps: `${info.gatewayIp}/32`, // kept for backward compat
      wgPort: info.listenPort,
      nasSecret: nasSecretForResponse,  // RADIUS shared secret for this NAS
      apiUsername: apiUsernameForResponse,
      apiPassword: apiPasswordForResponse,
    })
  }

  if (action === 'remove') {
    if (!suppliedPubKey) return NextResponse.json({ error: 'publicKey wajib untuk remove' }, { status: 400 })
    await removePeerFromConf(suppliedPubKey)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'action harus "add" atau "remove"' }, { status: 400 })
}

// ─── PATCH /api/network/vps-wg-peer ─────────────────────────────────────
// Update pool config (poolStart, poolEnd, gatewayIp) in wg-server-info.json
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const info = await readWgInfo()
  if (!info) return NextResponse.json({ error: 'WireGuard belum di-install di VPS ini' }, { status: 400 })

  const body = await req.json()
  const { poolStart, poolEnd, gatewayIp } = body

  if (poolStart !== undefined) {
    const v = parseInt(poolStart)
    if (isNaN(v) || v < 2 || v > 253) return NextResponse.json({ error: 'poolStart harus antara 2–253' }, { status: 400 })
    info.poolStart = v
  }
  if (poolEnd !== undefined) {
    const v = parseInt(poolEnd)
    if (isNaN(v) || v < 3 || v > 254) return NextResponse.json({ error: 'poolEnd harus antara 3–254' }, { status: 400 })
    info.poolEnd = v
  }
  if (gatewayIp !== undefined) {
    const trimmed = String(gatewayIp).trim()
    if (trimmed && !/^(\d{1,3}\.){3}\d{1,3}$/.test(trimmed)) return NextResponse.json({ error: 'Format gatewayIp tidak valid' }, { status: 400 })
    info.gatewayIp = trimmed || info.gatewayIp
  }

  if ((info.poolStart ?? 2) >= (info.poolEnd ?? 254)) {
    return NextResponse.json({ error: 'poolStart harus lebih kecil dari poolEnd' }, { status: 400 })
  }

  await writeFile(WG_INFO, JSON.stringify(info, null, 2), 'utf8')
  return NextResponse.json({ success: true, poolStart: info.poolStart, poolEnd: info.poolEnd, gatewayIp: info.gatewayIp })
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`
  return `${(b / (1024 * 1024)).toFixed(1)}MB`
}
