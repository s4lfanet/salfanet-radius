import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile } from 'fs/promises'

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
 * Reads existing [Peer] AllowedIPs from wg.conf, returns first free .x in 2–254.
 */
async function nextAvailableIp(subnet: string): Promise<string> {
  const base = subnet.split('/')[0].split('.').slice(0, 3).join('.')
  let conf = ''
  try { conf = await readFile(WG_CONF, 'utf8') } catch { /* new conf */ }

  const used = new Set<number>()
  used.add(1) // VPS gateway
  const re = /AllowedIPs\s*=\s*[\d.]+\.(\d+)\/32/g
  let m
  while ((m = re.exec(conf)) !== null) used.add(parseInt(m[1]))

  for (let i = 2; i <= 254; i++) {
    if (!used.has(i)) return `${base}.${i}`
  }
  throw new Error('Subnet penuh: tidak ada IP tersisa')
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

  // Parse live peers from `wg show`
  let peers: Array<{ publicKey: string; endpoint?: string; allowedIps?: string; lastHandshake?: string; transfer?: string }> = []
  try {
    const { stdout } = await exec(`wg show ${WG_IFACE} dump`)
    const lines = stdout.trim().split('\n').slice(1) // skip server line
    peers = lines
      .filter((l) => l.trim())
      .map((l) => {
        const [publicKey, , endpoint, allowedIps, lastHandshake, rxBytes, txBytes] = l.split('\t')
        return {
          publicKey,
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

    const vpnIp = await nextAvailableIp(info.subnet)
    await addPeerToConf(clientPublicKey, vpnIp, nasName)

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
    })
  }

  if (action === 'remove') {
    if (!suppliedPubKey) return NextResponse.json({ error: 'publicKey wajib untuk remove' }, { status: 400 })
    await removePeerFromConf(suppliedPubKey)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'action harus "add" atau "remove"' }, { status: 400 })
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`
  return `${(b / (1024 * 1024)).toFixed(1)}MB`
}
