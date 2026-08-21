import 'server-only'
import { RouterOSAPI } from 'node-routeros'

export interface PppoeRouterConnection {
  id: string
  name: string
  nasname: string
  ipAddress?: string | null
  port?: number | null
  username: string | null
  password: string | null
}

export interface LivePppoeTraffic {
  username: string
  uploadBytes: number
  downloadBytes: number
  ipAddress: string | null
  macAddress: string | null
  sessionId: string | null
  uptimeSeconds: number
  routerId: string
  routerName: string
}

function parseCounter(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number.parseInt(String(value ?? '0'), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseUptime(uptime: string): number {
  let seconds = 0
  const weeks = uptime.match(/(\d+)w/)
  const days = uptime.match(/(\d+)d/)
  const hours = uptime.match(/(\d+)h/)
  const minutes = uptime.match(/(\d+)m/)
  const secs = uptime.match(/(\d+)s/)

  if (weeks) seconds += Number.parseInt(weeks[1], 10) * 7 * 24 * 3600
  if (days) seconds += Number.parseInt(days[1], 10) * 24 * 3600
  if (hours) seconds += Number.parseInt(hours[1], 10) * 3600
  if (minutes) seconds += Number.parseInt(minutes[1], 10) * 60
  if (secs) seconds += Number.parseInt(secs[1], 10)
  return seconds
}

/**
 * Fetch live PPPoE byte counters directly from MikroTik API.
 *
 * /ppp/active/print does NOT include byte counters on most RouterOS versions.
 * We fetch them separately from /interface/print?type=pppoe-in and merge
 * by interface name (<pppoe-{session.name}>).
 *
 * Works for ALL routers (RADIUS and local-auth), unlike
 * batchFetchMikrotikActiveSessions which only queries local-auth routers.
 */
export async function fetchLivePppoeTrafficMap(
  routers: PppoeRouterConnection[],
  targetUsernames?: Set<string>,
): Promise<Map<string, LivePppoeTraffic>> {
  const trafficByUsername = new Map<string, LivePppoeTraffic>()

  await Promise.all(
    routers.map(async (router) => {
      const api = new RouterOSAPI({
        host: router.ipAddress || router.nasname,
        port: router.port || 8728,
        user: router.username || '',
        password: router.password || '',
        timeout: 10,
      })

      try {
        await api.connect()

        // 1. Get active PPPoE sessions
        const activeSessions = await api.write('/ppp/active/print')

        // 2. Get byte counters from pppoe-in interfaces
        let byteMap = new Map<string, { rx: number; tx: number }>()
        try {
          const ifaces = await api.write('/interface/print', [
            '?type=pppoe-in',
            '=.proplist=.id,name,rx-byte,tx-byte',
          ])
          for (const iface of ifaces as any[]) {
            if (iface.name && iface['rx-byte'] !== undefined) {
              byteMap.set(iface.name, {
                rx: parseCounter(iface['rx-byte']),
                tx: parseCounter(iface['tx-byte']),
              })
            }
          }
        } catch {
          // Non-fatal: byte counters unavailable
        }

        for (const s of activeSessions as any[]) {
          const username = String(s.name || s.user || '').trim()
          if (!username) continue
          if (targetUsernames && !targetUsernames.has(username)) continue

          const ifaceName = `<pppoe-${username}>`
          const byteCounters = byteMap.get(ifaceName)

          // PPPoE: rx-byte = download (from router perspective, received from client)
          //         tx-byte = upload (sent to client)
          // But in /ppp/active/print context:
          //   bytes-in = upload (from client), bytes-out = download (to client)
          // For interface counters:
          //   rx-byte = bytes received ON interface = download (router receiving from internet for client)
          //   tx-byte = bytes transmitted ON interface = upload (router sending to internet for client)
          // Actually: on pppoe-in interface, rx = from client (upload), tx = to client (download)
          const candidate: LivePppoeTraffic = {
            username,
            uploadBytes: byteCounters
              ? byteCounters.rx // pppoe-in rx = from client = upload
              : parseCounter(s['bytes-in'] || s['rx-byte']),
            downloadBytes: byteCounters
              ? byteCounters.tx // pppoe-in tx = to client = download
              : parseCounter(s['bytes-out'] || s['tx-byte']),
            ipAddress: s.address ? String(s.address) : null,
            macAddress: s['caller-id'] ? String(s['caller-id']) : null,
            sessionId: s['.id'] ? String(s['.id']) : null,
            uptimeSeconds: parseUptime(String(s.uptime || '0s')),
            routerId: router.id,
            routerName: router.name,
          }

          // Pick the higher value if duplicate (multi-router scenario)
          const existing = trafficByUsername.get(username)
          if (!existing) {
            trafficByUsername.set(username, candidate)
          } else {
            const existingTotal = existing.uploadBytes + existing.downloadBytes
            const candidateTotal = candidate.uploadBytes + candidate.downloadBytes
            if (candidateTotal >= existingTotal) {
              trafficByUsername.set(username, candidate)
            }
          }
        }
      } catch (error) {
        console.error(
          `[live-pppoe] failed to query router ${router.name} (${router.ipAddress || router.nasname})`,
          error,
        )
      } finally {
        try {
          await api.close()
        } catch {
          // Ignore close errors
        }
      }
    }),
  )

  return trafficByUsername
}
