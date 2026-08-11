import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { prisma } from '@/server/db/client'
import { RouterOSAPI } from 'node-routeros'

// ⚠️ CLOUDFLARE CONSTRAINT: Hard timeout is 100s. maxDuration=90 keeps Next.js within that.
// MUST stay at 90. Do NOT increase above 90 — Cloudflare will return HTTP 524 Gateway Timeout.
// Streaming is used to keep connection alive throughout, but maxDuration still applies.
export const maxDuration = 90

// Per-command and connection timeouts (kept short to avoid proxy kills)
const CONNECT_TIMEOUT = 20_000  // 20 s
const CMD_TIMEOUT     = 12_000  // 12 s per command

async function connectApi(host: string, user: string, password: string, port: number, timeoutSec?: number): Promise<any> {
  const t = timeoutSec ?? Math.ceil(CMD_TIMEOUT / 1000)
  const api = new RouterOSAPI({ host, user, password, port, timeout: t })
  await Promise.race([
    api.connect(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Connection timed out after ${CONNECT_TIMEOUT / 1000}s — ${host}:${port} unreachable`)), CONNECT_TIMEOUT)
    ),
  ])
  return api
}

async function cmd(
  api: any,
  command: string,
  params: string[],
  label: string,
  timeoutMs = CMD_TIMEOUT,
): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const data = await Promise.race([
      api.write(command, params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Command timed out after ${timeoutMs / 1000}s`)), timeoutMs)
      ),
    ])
    return { ok: true, data }
  } catch (e: any) {
    const msg: string = e?.message || String(e)
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists')) {
      return { ok: true, data: null, error: `(already exists) ${msg}` }
    }
    return { ok: false, error: `${label}: ${msg}` }
  }
}

// POST - Auto-setup VPN server, streaming NDJSON progress back to client.
// Each line is a JSON object:
//   { step: "✅ ..." }           — live progress line
//   { done: true, success, ... } — final result
//
// Streaming avoids the nginx/Cloudflare 524/504 timeout: data flows throughout
// so the proxy sees an active connection and never closes it prematurely.
// The important header is X-Accel-Buffering: no which disables nginx buffering.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const body = await request.json()
  const { host, username, password, apiPort, subnet, name, serverId } = body

  const port       = parseInt(apiPort) || 8728
  const vpnSubnet  = subnet || '10.20.30.0/24'
  const [network]  = vpnSubnet.split('/')
  const parts      = network.split('.')
  const base       = `${parts[0]}.${parts[1]}.${parts[2]}`
  const poolRange  = `${base}.10-${base}.254`
  const localAddr  = `${base}.1`
  const vpnNet     = `${base}.0/24`

  const encoder = new TextEncoder()
  const ts      = new TransformStream<Uint8Array, Uint8Array>()
  const writer  = ts.writable.getWriter()

  const send = async (obj: object) => {
    try { await writer.write(encoder.encode(JSON.stringify(obj) + '\n')) } catch { /* stream closed */ }
  }

  // Run setup async — response is already streaming back to client
  ;(async () => {
    const steps: string[] = []
    const startTime = Date.now()
    let api: any  = null
    let l2tp      = false
    let sstp      = false
    let pptp      = false
    let openVpn   = false
    let rosVersion = 'unknown'

    const step = async (s: string) => { steps.push(s); await send({ step: s }) }

    try {
      await step(`📋 Config: ${host}:${port} user=${username} subnet=${vpnSubnet}`)

      // ── Connect ───────────────────────────────────────────────────────
      try {
        api = await connectApi(host, username, password, port)
        await step(`✅ Connected to RouterOS API (${Date.now() - startTime}ms)`)
      } catch (e: any) {
        await step(`❌ Connection failed: ${e.message}`)
        await send({ done: true, success: false, l2tp, pptp, steps, message: `Connection failed: ${e.message}`, rosVersion })
        return
      }

      // ── RouterOS version ──────────────────────────────────────────────
      try {
        const res = await Promise.race([
          api.write('/system/resource/print') as Promise<any[]>,
          new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), CMD_TIMEOUT)),
        ])
        rosVersion = res?.[0]?.version || 'unknown'
        await step(`✅ RouterOS version: ${rosVersion}`)
      } catch (e: any) {
        await step(`⚠️ Could not read version: ${e.message}`)
      }

      // ── IP Pool ───────────────────────────────────────────────────────
      let r = await cmd(api, '/ip/pool/add', ['=name=vpn-pool', `=ranges=${poolRange}`], 'pool-add')
      if (r.ok) {
        await step(`✅ IP Pool: vpn-pool (${poolRange})`)
      } else {
        try {
          const pools = await Promise.race([
            api.write('/ip/pool/print', ['?name=vpn-pool']) as Promise<any[]>,
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), CMD_TIMEOUT)),
          ])
          if (pools?.length > 0) {
            await cmd(api, '/ip/pool/set', [`=.id=${pools[0]['.id']}`, `=ranges=${poolRange}`], 'pool-set')
            await step(`✅ IP Pool updated: ${poolRange}`)
          } else {
            await step(`❌ IP Pool failed: ${r.error}`)
          }
        } catch (e2: any) {
          await step(`❌ IP Pool failed: ${r.error} | ${e2.message}`)
        }
      }

      // ── PPP Profile ───────────────────────────────────────────────────
      r = await cmd(api, '/ppp/profile/add', [
        '=name=vpn-profile', `=local-address=${localAddr}`,
        '=remote-address=vpn-pool', '=dns-server=8.8.8.8,8.8.4.4',
      ], 'profile-add')
      if (r.ok) {
        await step('✅ PPP Profile: vpn-profile')
      } else {
        try {
          const profs = await Promise.race([
            api.write('/ppp/profile/print', ['?name=vpn-profile']) as Promise<any[]>,
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), CMD_TIMEOUT)),
          ])
          if (profs?.length > 0) {
            await cmd(api, '/ppp/profile/set', [
              `=.id=${profs[0]['.id']}`, `=local-address=${localAddr}`,
              '=remote-address=vpn-pool', '=dns-server=8.8.8.8,8.8.4.4',
            ], 'profile-set')
            await step('✅ PPP Profile updated')
          } else {
            await step(`❌ PPP Profile failed: ${r.error}`)
          }
        } catch (e2: any) {
          await step(`❌ PPP Profile failed: ${r.error} | ${e2.message}`)
        }
      }

      // ── L2TP Server (with IPsec + Preshared Key) ─────────────────────
      r = await cmd(api, '/interface/l2tp-server/server/set', [
        '=enabled=yes', '=default-profile=vpn-profile',
        '=authentication=mschap2',
        '=use-ipsec=yes',
        '=ipsec-secret=salfanet-vpn-secret',
      ], 'l2tp-set')
      l2tp = r.ok
      await step(r.ok ? '✅ L2TP Server enabled (IPsec + Preshared Key)' : `❌ L2TP: ${r.error}`)

      // ── SSTP Server (port 992) ────────────────────────────────────────
      r = await cmd(api, '/interface/sstp-server/server/set', [
        '=enabled=yes', '=default-profile=vpn-profile',
        '=authentication=mschap2',
        '=port=992',
      ], 'sstp-set')
      sstp = r.ok
      await step(r.ok ? '✅ SSTP Server enabled (port 992)' : `❌ SSTP: ${r.error}`)

      // ── PPTP Server ───────────────────────────────────────────────────
      r = await cmd(api, '/interface/pptp-server/server/set', [
        '=enabled=yes', '=default-profile=vpn-profile',
        '=authentication=mschap2',
      ], 'pptp-set')
      pptp = r.ok
      await step(r.ok ? '✅ PPTP Server enabled' : `❌ PPTP: ${r.error}`)

      await step('ℹ️ OpenVPN type is disabled and skipped in auto-setup.')

      // ── NAT Masquerade ────────────────────────────────────────────────
      // Use cmd() directly — it already handles "already exists" as ok:true
      r = await cmd(api, '/ip/firewall/nat/add', ['=chain=srcnat', '=action=masquerade', '=comment=VPN NAT'], 'nat-add')
      await step(r.ok ? (r.error?.includes('already') ? '✅ NAT masquerade (already exists)' : '✅ NAT masquerade added') : `❌ NAT: ${r.error}`)

      // ── Firewall forward rules ────────────────────────────────────────
      try {
        const fwRules = [
          { label: 'Forward rule', params: ['=chain=forward', `=src-address=${vpnNet}`, `=dst-address=${vpnNet}`, '=action=accept', '=comment=SALFANET-VPN-Forward'] },
          { label: 'RADIUS rule',  params: ['=chain=input', '=protocol=udp', `=src-address=${vpnNet}`, '=dst-port=1812,1813,3799', '=action=accept', '=comment=SALFANET-VPN-Forward-RADIUS'] },
          { label: 'API rule',     params: ['=chain=input', '=protocol=tcp', `=src-address=${vpnNet}`, '=dst-port=8291,8728,8729', '=action=accept', '=comment=SALFANET-VPN-Forward-API'] },
        ]
        for (const rule of fwRules) {
          r = await cmd(api, '/ip/firewall/filter/add', rule.params, rule.label)
          await step(r.ok ? `✅ ${rule.label} ${r.error?.includes('already') ? '(already exists)' : 'added'}` : `⚠️ ${rule.label}: ${r.error}`)
        }
      } catch (e: any) {
        await step(`⚠️ Firewall rules failed: ${e.message}`)
      }

      // ── Close connection ──────────────────────────────────────────────
      try { await api.close() } catch { /* ignore */ }
      api = null

      await step(`⏱️ Setup completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`)

      // ── Update DB ─────────────────────────────────────────────────────
      let vpnServer: any
      try {
        if (serverId) {
          vpnServer = await prisma.vpnServer.update({
            where: { id: serverId },
            data: { l2tpEnabled: l2tp, sstpEnabled: sstp, pptpEnabled: pptp, openVpnEnabled: false },
          })
          await step('✅ Database updated')
        } else if (name && host) {
          vpnServer = await prisma.vpnServer.create({
            data: { name, host, username, password, apiPort: port, subnet: vpnSubnet, l2tpEnabled: l2tp, sstpEnabled: sstp, pptpEnabled: pptp, openVpnEnabled: false },
          })
          await step('✅ Server created in database')
        }
      } catch (dbErr: any) {
        await step(`⚠️ DB update failed: ${dbErr.message}`)
      }

      await send({ done: true, success: l2tp || sstp || pptp || openVpn, l2tp, sstp, pptp, openVpn, steps, rosVersion, message: 'VPN Server configured!', server: vpnServer })

    } catch (error: any) {
      if (api) try { await api.close() } catch { /* ignore */ }
      await step(`❌ Fatal error: ${error.message || error}`)
      await send({ done: true, success: false, l2tp, sstp, pptp, openVpn, steps, message: `Setup failed: ${error.message || error}`, rosVersion })
    } finally {
      try { await writer.close() } catch { /* ignore */ }
    }
  })()

  return new Response(ts.readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      'X-Accel-Buffering': 'no',  // Disable nginx buffering — required for streaming to work
    },
  })
}

