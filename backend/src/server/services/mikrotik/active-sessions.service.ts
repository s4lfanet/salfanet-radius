import 'server-only'
import { RouterOSAPI } from 'node-routeros'
import { prisma } from '@/server/db/client'

export interface MikrotikActiveSession {
  username: string
  ipAddress: string | null
  macAddress: string | null
  sessionId: string | null
  uptime: string | null
  rxBytes: number
  txBytes: number
  routerId: string
  routerName: string
  type: 'pppoe' | 'hotspot'
}

async function getRouterConfig(routerId: string) {
  const router = await prisma.router.findUnique({
    where: { id: routerId },
    select: {
      id: true,
      name: true,
      nasname: true,
      ipAddress: true,
      username: true,
      password: true,
      port: true,
      authMode: true,
    },
  })
  if (!router) return null
  const host = router.ipAddress || router.nasname
  if (!host || !router.username || !router.password) return null
  return router
}

/**
 * Safe wrapper for api.write print queries — handles node-routeros !empty bug.
 */
async function safePrint(api: any, path: string, args?: any[]): Promise<any[]> {
  try {
    return await api.write(path, args || [])
  } catch (err: any) {
    if (err?.errno === 'UNKNOWNREPLY' || String(err?.message || '').includes('!empty')) {
      return []
    }
    throw err
  }
}

/**
 * Parse MikroTik uptime string (e.g. "1d2h3m4s", "2h15m", "30s") to seconds.
 */
function parseUptime(uptime: string | null | undefined): number {
  if (!uptime) return 0
  let total = 0
  const days = uptime.match(/(\d+)w/) || uptime.match(/(\d+)d/)
  const hours = uptime.match(/(\d+)h/)
  const mins = uptime.match(/(\d+)m/)
  const secs = uptime.match(/(\d+)s/)
  if (days) total += parseInt(days[1]) * (uptime.includes('w') ? 7 * 24 * 3600 : 24 * 3600)
  if (hours) total += parseInt(hours[1]) * 3600
  if (mins) total += parseInt(mins[1]) * 60
  if (secs) total += parseInt(secs[1])
  return total
}

/**
 * Fetch active PPPoE sessions from a MikroTik router (/ppp/active/print).
 * Returns detailed session info (username, IP, MAC, uptime, bytes).
 */
export async function listPppActiveDetailed(routerId: string): Promise<MikrotikActiveSession[]> {
  const router = await getRouterConfig(routerId)
  if (!router) return []

  const host = router.ipAddress || router.nasname
  const apiPort = router.port || 8728
  let api: any
  try {
    api = new RouterOSAPI({
      host,
      port: apiPort,
      user: router.username || '',
      password: router.password || '',
      timeout: 15,
    })
    await Promise.race([
      api.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`connect timeout for ${host}:${apiPort} after 20s`)), 20000)
      ),
    ])
    const active = await safePrint(api, '/ppp/active/print')
    return active.map((s: any) => ({
      username: s.name || s.user || '',
      ipAddress: s.address || null,
      macAddress: s['caller-id'] || s['mac-address'] || null,
      sessionId: s['.id'] || null,
      uptime: s.uptime || null,
      rxBytes: Number(s['rx-byte'] || s['input-byte'] || 0),
      txBytes: Number(s['tx-byte'] || s['output-byte'] || 0),
      routerId: router.id,
      routerName: router.name,
      type: 'pppoe' as const,
    })).filter((s: MikrotikActiveSession) => s.username)
  } catch (e: any) {
    console.error(`[MIKROTIK_SESSIONS] listPppActiveDetailed for ${router.name}:`, e?.message || e)
    return []
  } finally {
    try { if (api) await api.close() } catch { /* ignore */ }
  }
}

/**
 * Fetch active Hotspot sessions from a MikroTik router (/ip/hotspot/active/print).
 */
export async function listHotspotActiveDetailed(routerId: string): Promise<MikrotikActiveSession[]> {
  const router = await getRouterConfig(routerId)
  if (!router) return []

  const host = router.ipAddress || router.nasname
  const apiPort = router.port || 8728
  let api: any
  try {
    api = new RouterOSAPI({
      host,
      port: apiPort,
      user: router.username || '',
      password: router.password || '',
      timeout: 15,
    })
    await Promise.race([
      api.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`connect timeout for ${host}:${apiPort} after 20s`)), 20000)
      ),
    ])
    const active = await safePrint(api, '/ip/hotspot/active/print')
    return active.map((s: any) => ({
      username: s.user || s.name || '',
      ipAddress: s.address || null,
      macAddress: s['mac-address'] || s['caller-id'] || null,
      sessionId: s['.id'] || null,
      uptime: s.uptime || null,
      rxBytes: Number(s['bytes-in'] || s['rx-byte'] || 0),
      txBytes: Number(s['bytes-out'] || s['tx-byte'] || 0),
      routerId: router.id,
      routerName: router.name,
      type: 'hotspot' as const,
    })).filter((s: MikrotikActiveSession) => s.username)
  } catch (e: any) {
    console.error(`[MIKROTIK_SESSIONS] listHotspotActiveDetailed for ${router.name}:`, e?.message || e)
    return []
  } finally {
    try { if (api) await api.close() } catch { /* ignore */ }
  }
}

/**
 * Batch fetch active sessions from multiple MikroTik routers (local auth mode).
 * Only fetches from routers where authMode = 'local' (RADIUS mode has radacct).
 *
 * @param routers - Array of router objects with id, authMode
 * @param type - 'pppoe' | 'hotspot' | null (both)
 * @returns Array of MikrotikActiveSession
 */
export async function batchFetchMikrotikActiveSessions(
  routers: Array<{ id: string; authMode?: string | null }>,
  type?: 'pppoe' | 'hotspot' | null
): Promise<MikrotikActiveSession[]> {
  // Only fetch from local-auth routers (RADIUS mode sessions are in radacct)
  const localRouterIds = routers
    .filter(r => r.authMode !== 'radius')
    .map(r => r.id)

  if (localRouterIds.length === 0) return []

  const tasks: Promise<MikrotikActiveSession[]>[] = []
  for (const id of localRouterIds) {
    if (!type || type === 'pppoe') {
      tasks.push(listPppActiveDetailed(id))
    }
    if (!type || type === 'hotspot') {
      tasks.push(listHotspotActiveDetailed(id))
    }
  }

  const results = await Promise.allSettled(tasks)
  const sessions: MikrotikActiveSession[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') {
      sessions.push(...r.value)
    }
  }
  return sessions
}

export { parseUptime }
