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
 * poolStart/poolEnd can be full IPs ("10.200.0.2") or last-octet numbers (2).
 */
async function nextAvailableIp(subnet: string, poolStart: number | string = 2, poolEnd: number | string = 254): Promise<string> {
  // If poolStart is a full IP, use its /24 prefix as base; else fall back to subnet prefix
  let base: string
  let startOctet: number
  let endOctet: number

  if (typeof poolStart === 'string' && poolStart.includes('.')) {
    const parts = poolStart.split('.')
    base = parts.slice(0, 3).join('.')
    startOctet = parseInt(parts[3]) || 2
  } else {
    base = subnet.split('/')[0].split('.').slice(0, 3).join('.')
    startOctet = typeof poolStart === 'number' ? poolStart : parseInt(String(poolStart)) || 2
  }

  if (typeof poolEnd === 'string' && poolEnd.includes('.')) {
    endOctet = parseInt(poolEnd.split('.')[3]) || 254
  } else {
    endOctet = typeof poolEnd === 'number' ? poolEnd : parseInt(String(poolEnd)) || 254
  }

  let conf = ''
  try { conf = await readFile(WG_CONF, 'utf8') } catch { /* new conf */ }

  const used = new Set<number>()
  used.add(1) // VPS gateway
  // Only count IPs within the same base prefix to avoid cross-subnet false conflicts
  const re = new RegExp(`AllowedIPs\\s*=\\s*${base.replace(/\./g, '\\.')}\\.([0-9]+)\\/32`, 'g')
  let m
  while ((m = re.exec(conf)) !== null) used.add(parseInt(m[1]))

  for (let i = startOctet; i <= endOctet; i++) {
    if (!used.has(i)) return `${base}.${i}`
  }
  throw new Error(`Subnet penuh: tidak ada IP tersisa (range ${base}.${startOctet}–${base}.${endOctet})`)
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

  // Ensure iptables rules allow WG peer traffic to reach RADIUS (idempotent check-then-insert)
  const iptablesRules = [
    `FORWARD -i ${WG_IFACE} -j ACCEPT`,
    `FORWARD -o ${WG_IFACE} -j ACCEPT`,
    `INPUT -i ${WG_IFACE} -p udp -m multiport --dports 1812,1813,3799 -j ACCEPT`,
  ]
  for (const rule of iptablesRules) {
    try {
      await exec(`iptables -C ${rule} 2>/dev/null || iptables -I ${rule}`, { shell: '/bin/bash' })
    } catch { /* ignore — may not have iptables */ }
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
    // vpnServer harus sudah ada. syncPeersToDB tidak membuat vpnServer baru.
    const serverExists = await prisma.vpnServer.findUnique({ where: { id: VPS_WG_SERVER_ID }, select: { id: true } })
    if (!serverExists) return // belum di-setup, skip sync

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

    // vpnServer harus sudah ada (dibuat via VPN Server setup). Jangan buat dari sini.
    const existingWgServer = await prisma.vpnServer.findUnique({ where: { id: VPS_WG_SERVER_ID } })
    if (!existingWgServer) {
      return NextResponse.json(
        { error: 'VPS WireGuard Server belum dikonfigurasi. Setup VPN Server terlebih dahulu sebelum menambah client.' },
        { status: 400 },
      )
    }

    try {
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

    // Derive the pool prefix (may differ from wg interface subnet when user customized it)
    const poolBase = (typeof info.poolStart === 'string' && info.poolStart.includes('.'))
      ? info.poolStart.split('.').slice(0, 3).join('.')
      : info.subnet.split('/')[0].split('.').slice(0, 3).join('.')
    const effectiveVpnSubnet = `${poolBase}.0/24`
    const effectiveGatewayIp = info.gatewayIp || `${poolBase}.1`

    return NextResponse.json({
      success: true,
      vpnIp,
      clientPublicKey,
      clientPrivateKey, // undefined if caller supplied the key
      serverPublicKey: info.publicKey,
      serverEndpoint: `${info.publicIp}:${info.listenPort}`,
      vpnSubnet: effectiveVpnSubnet,       // derived from pool prefix
      gatewayIp: effectiveGatewayIp,       // VPS tunnel IP derived from pool prefix
      allowedIps: `${effectiveGatewayIp}/32`, // kept for backward compat
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
  const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/

  if (poolStart !== undefined) {
    const s = String(poolStart).trim()
    if (!IP_RE.test(s)) return NextResponse.json({ error: 'poolStart harus berupa IP lengkap, mis. 10.200.0.2' }, { status: 400 })
    info.poolStart = s
  }
  if (poolEnd !== undefined) {
    const s = String(poolEnd).trim()
    if (!IP_RE.test(s)) return NextResponse.json({ error: 'poolEnd harus berupa IP lengkap, mis. 10.200.0.254' }, { status: 400 })
    info.poolEnd = s
  }
  if (gatewayIp !== undefined) {
    const trimmed = String(gatewayIp).trim()
    if (trimmed && !IP_RE.test(trimmed)) return NextResponse.json({ error: 'Format gatewayIp tidak valid' }, { status: 400 })
    info.gatewayIp = trimmed || info.gatewayIp
  }

  // Validate poolStart < poolEnd (compare last octets)
  const toOctet = (v: any, def: number) => {
    if (typeof v === 'number') return v
    const s = String(v); return s.includes('.') ? parseInt(s.split('.')[3]) || def : parseInt(s) || def
  }
  if (toOctet(info.poolStart, 2) >= toOctet(info.poolEnd, 254)) {
    return NextResponse.json({ error: 'poolStart harus lebih kecil dari poolEnd' }, { status: 400 })
  }

  // Derive new subnet from gatewayIp (or from poolStart prefix if no gatewayIp)
  const newGateway = info.gatewayIp as string | undefined
  if (newGateway && IP_RE.test(newGateway)) {
    const newBase = newGateway.split('.').slice(0, 3).join('.')
    const newSubnet = `${newBase}.0/24`
    // Update subnet in info file
    info.subnet = newSubnet
    // Update [Interface] Address in wg0.conf + ensure PostUp/PostDown include RADIUS INPUT rules
    try {
      let conf = await readFile(WG_CONF, 'utf8')
      conf = conf.replace(/^(Address\s*=\s*)[\d./]+/m, `$1${newGateway}/24`)

      // PostUp/PostDown: FORWARD rules for WG + INPUT rules for RADIUS ports from WG peers
      const postUp   = `iptables -I INPUT -p udp --dport 51820 -j ACCEPT; iptables -I FORWARD -i ${WG_IFACE} -j ACCEPT; iptables -I FORWARD -o ${WG_IFACE} -j ACCEPT; iptables -I INPUT -i ${WG_IFACE} -p udp -m multiport --dports 1812,1813,3799 -j ACCEPT`
      const postDown = `iptables -D INPUT -p udp --dport 51820 -j ACCEPT; iptables -D FORWARD -i ${WG_IFACE} -j ACCEPT; iptables -D FORWARD -o ${WG_IFACE} -j ACCEPT; iptables -D INPUT -i ${WG_IFACE} -p udp -m multiport --dports 1812,1813,3799 -j ACCEPT`
      if (/^PostUp\s*=/m.test(conf)) {
        conf = conf.replace(/^PostUp\s*=.*$/m, `PostUp = ${postUp}`)
      } else {
        conf = conf.replace(/^(\[Interface\])$/m, `$1\nPostUp = ${postUp}`)
      }
      if (/^PostDown\s*=/m.test(conf)) {
        conf = conf.replace(/^PostDown\s*=.*$/m, `PostDown = ${postDown}`)
      } else {
        conf = conf.replace(/^(PostUp\s*=.*)$/m, `$1\nPostDown = ${postDown}`)
      }

      await writeFile(WG_CONF, conf, 'utf8')
      // Full restart so the new Interface Address and PostUp rules take effect
      await exec(`wg-quick down ${WG_IFACE} 2>/dev/null || true`, { shell: '/bin/bash' })
      await exec(`wg-quick up ${WG_IFACE}`, { shell: '/bin/bash' })
    } catch (e) {
      console.error('[vps-wg-peer] PATCH: failed to update/restart wg interface:', e)
    }
  } else if (info.poolStart && typeof info.poolStart === 'string' && info.poolStart.includes('.')) {
    // Derive subnet from poolStart if no gatewayIp set
    const newBase = (info.poolStart as string).split('.').slice(0, 3).join('.')
    info.subnet = `${newBase}.0/24`

    // gatewayIp unchanged — ensure iptables rules are still active (idempotent)
    const wgRules = [
      `FORWARD -i ${WG_IFACE} -j ACCEPT`,
      `FORWARD -o ${WG_IFACE} -j ACCEPT`,
      `INPUT -i ${WG_IFACE} -p udp -m multiport --dports 1812,1813,3799 -j ACCEPT`,
    ]
    for (const rule of wgRules) {
      try {
        await exec(`iptables -C ${rule} 2>/dev/null || iptables -I ${rule}`, { shell: '/bin/bash' })
      } catch { /* ignore */ }
    }
  }

  await writeFile(WG_INFO, JSON.stringify(info, null, 2), 'utf8')

  // Update vpnServer subnet in DB (only if record already exists — PATCH never creates vpnServer)
  try {
    await prisma.vpnServer.updateMany({
      where: { id: VPS_WG_SERVER_ID },
      data: {
        subnet: info.subnet,
        ...(info.publicIp ? { host: info.publicIp } : {}),
      },
    })
    const { syncNasClients, reloadFreeRadius } = await import('@/server/services/radius/freeradius.service')
    const changed = await syncNasClients()
    if (changed) reloadFreeRadius().catch(() => {})
  } catch (e) {
    console.error('[vps-wg-peer] PATCH: DB/FreeRADIUS sync failed (non-fatal):', e)
  }

  return NextResponse.json({ success: true, poolStart: info.poolStart, poolEnd: info.poolEnd, gatewayIp: info.gatewayIp, subnet: info.subnet })
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`
  return `${(b / (1024 * 1024)).toFixed(1)}MB`
}
