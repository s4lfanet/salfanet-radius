import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile } from 'fs/promises'

const exec = promisify(execCb)
const L2TP_INFO_FILE = '/etc/salfanet/l2tp/l2tp-server-info.json'

function generatePassword(len = 16): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

async function readL2tpInfo(): Promise<Record<string, any> | null> {
  try {
    const raw = await readFile(L2TP_INFO_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function getNextAvailableIp(subnet: string, poolStart = 10, poolEnd = 254): Promise<string> {
  const base = subnet.split('/')[0].split('.').slice(0, 3).join('.')
  // Read current chap-secrets to find used IPs
  let chap = ''
  try { chap = await readFile('/etc/ppp/chap-secrets', 'utf8') } catch { /* empty */ }
  const used = new Set<number>()
  used.add(1) // gateway
  const re = /\d+\.\d+\.\d+\.(\d+)/g
  let m
  while ((m = re.exec(chap)) !== null) used.add(parseInt(m[1]))
  for (let i = poolStart; i <= poolEnd; i++) {
    if (!used.has(i)) return `${base}.${i}`
  }
  throw new Error(`Subnet penuh (range .${poolStart}–.${poolEnd})`)
}

// ─── GET /api/network/vps-l2tp-peer ────────────────────────────────────────
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const info = await readL2tpInfo()
  if (!info) {
    return NextResponse.json({
      installed: false,
      message: 'L2TP server belum di-install di VPS ini.',
    })
  }

  // List peers from chap-secrets
  let peers: Array<{ username: string; vpnIp: string }> = []
  try {
    const chap = await readFile('/etc/ppp/chap-secrets', 'utf8')
    peers = chap
      .split('\n')
      .filter(l => l.trim() && !l.startsWith('#'))
      .map(l => {
        const parts = l.trim().split(/\s+/)
        return { username: parts[0].replace(/"/g, ''), vpnIp: parts[3] || '*' }
      })
      .filter(p => p.username)
  } catch { /* ignore */ }

  return NextResponse.json({ installed: true, ...info, peers })
}

// ─── POST /api/network/vps-l2tp-peer ───────────────────────────────────────
// Body: { action: "add"|"remove", label?, username? (for remove) }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const info = await readL2tpInfo()
  if (!info) {
    return NextResponse.json({ error: 'L2TP server belum di-install' }, { status: 400 })
  }

  const body = await req.json()
  const { action, label, username: suppliedUsername } = body

  if (action === 'add') {
    if (!label) return NextResponse.json({ error: 'label wajib diisi' }, { status: 400 })

    const username = `nas-${label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${Math.random().toString(36).substring(2, 6)}`
    const password = generatePassword(16)
    const vpnIp = await getNextAvailableIp(info.subnet || '10.201.0.0/24', info.poolStart ?? 10, info.poolEnd ?? 254)

    // Add to chap-secrets via helper script
    try {
      await exec(`salfanet-l2tp-peer add "${username}" "${password}" "${vpnIp}"`)
    } catch {
      // Fallback: write directly
      const entry = `"${username}" * "${password}" ${vpnIp}\n`
      await exec(`echo '${entry.trimEnd()}' >> /etc/ppp/chap-secrets && chmod 600 /etc/ppp/chap-secrets`)
      try { await exec('systemctl restart xl2tpd') } catch { /* ignore */ }
    }

    const routerosScript = generateL2tpScript({
      serverIp: info.publicIp || '',
      username,
      password,
      ipsecPsk: info.ipsecPsk || '',
      vpnIp,
    })

    return NextResponse.json({ success: true, username, password, vpnIp, routerosScript })
  }

  if (action === 'remove') {
    if (!suppliedUsername) return NextResponse.json({ error: 'username wajib diisi' }, { status: 400 })
    try {
      await exec(`salfanet-l2tp-peer remove "${suppliedUsername}"`)
    } catch {
      const tmp = await exec(`grep -v '^"${suppliedUsername}"' /etc/ppp/chap-secrets || true`)
      await exec(`echo '${tmp.stdout}' > /etc/ppp/chap-secrets && chmod 600 /etc/ppp/chap-secrets`)
      try { await exec('systemctl restart xl2tpd') } catch { /* ignore */ }
    }
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'action tidak valid. Gunakan: add | remove' }, { status: 400 })
}

// ─── PATCH /api/network/vps-l2tp-peer ─────────────────────────────
// Update pool config (poolStart, poolEnd, gateway) in l2tp-server-info.json
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const info = await readL2tpInfo()
  if (!info) return NextResponse.json({ error: 'L2TP server belum di-install di VPS ini' }, { status: 400 })

  const body = await req.json()
  const { poolStart, poolEnd, gateway } = body

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
  if (gateway !== undefined) {
    const trimmed = String(gateway).trim()
    if (trimmed && !/^(\d{1,3}\.){3}\d{1,3}$/.test(trimmed)) return NextResponse.json({ error: 'Format gateway tidak valid' }, { status: 400 })
    info.gateway = trimmed || info.gateway
  }

  if ((info.poolStart ?? 10) >= (info.poolEnd ?? 254)) {
    return NextResponse.json({ error: 'poolStart harus lebih kecil dari poolEnd' }, { status: 400 })
  }

  await writeFile(L2TP_INFO_FILE, JSON.stringify(info, null, 2), 'utf8')
  return NextResponse.json({ success: true, poolStart: info.poolStart, poolEnd: info.poolEnd, gateway: info.gateway })
}

function generateL2tpScript({ serverIp, username, password, ipsecPsk, vpnIp }: {
  serverIp: string; username: string; password: string; ipsecPsk: string; vpnIp: string
}): string {
  return `# ═══════════════════════════════════════════════════════
# SALFANET — Script L2TP/IPsec ke VPS
# Server : ${serverIp}
# NAS IP : ${vpnIp}
# ═══════════════════════════════════════════════════════

# [1] Tambah profile L2TP
/ppp/profile/add name=salfanet-l2tp local-address=${vpnIp} use-encryption=yes

# [2] Tambah interface L2TP Client
/interface/l2tp-client/add \\
  name=vpn-salfanet \\
  connect-to=${serverIp} \\
  user="${username}" \\
  password="${password}" \\
  use-ipsec=yes \\
  ipsec-secret="${ipsecPsk}" \\
  profile=salfanet-l2tp \\
  disabled=no

# [3] Tunggu koneksi terbentuk (~15 detik), lalu cek:
# /interface/l2tp-client/print
# Pastikan status = "connected"

# [4] Route traffic ke RADIUS server via VPN
/ip/route/add dst-address=0.0.0.0/0 gateway=vpn-salfanet comment="SALFANET-VPN"
`
}
