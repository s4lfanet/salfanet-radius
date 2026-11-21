import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/server/db/client'
import { getTimezoneOffsetMs } from '@/lib/timezone'
import { cleanupStaleSessions } from '@/server/services/radius/stale-sessions'
import { listPppActiveStrict, parseUptime, type MikrotikActiveSession } from '@/server/services/mikrotik/active-sessions.service'

/**
 * One definition of "online / offline / unknown / isolated" for the whole
 * technician portal (Online, Offline, Isolir and Monitor pages). It follows
 * the admin's rule (radius/online-status.service + the admin Sessions page):
 *
 *   online  = an open, non-stale radacct row (RADIUS)  OR  a live PPPoE
 *             session on any active router's /ppp/active (Lokal / MikroTik).
 *   offline = registered, active customer that is not online and whose
 *             router answered the check.
 *   unknown = same, but the customer's router could not be queried, so
 *             "offline" would be a guess.
 *   isolated customers are reported as isolated (they are usually online in
 *             the isolir pool); stopped customers are never offline.
 *
 * Previously each page had its own subset of this, so a customer on a
 * local-auth router appeared in neither Online nor Offline.
 */

export type SessionSource = 'radius' | 'mikrotik'

export interface LiveSession {
  username: string
  source: SessionSource
  sessionId: string
  ip: string | null
  mac: string | null
  startTime: string | null
  uptimeSec: number
  rxBytes: number
  txBytes: number
  routerId: string | null
  routerName: string | null
}

export interface ConnectivitySnapshot {
  at: number
  sessions: Map<string, LiveSession>
  unreachableRouterIds: string[]
  unreachableRouters: Array<{ id: string; name: string }>
}

export type ConnectionState = 'online' | 'offline' | 'unknown' | 'isolated' | 'stopped'

const TTL_MS = 8_000
let cached: ConnectivitySnapshot | null = null
let inflight: Promise<ConnectivitySnapshot> | null = null

async function buildSnapshot(): Promise<ConnectivitySnapshot> {
  await cleanupStaleSessions()

  const [rows, routers] = await Promise.all([
    prisma.radacct.findMany({
      where: { acctstoptime: null },
      select: {
        radacctid: true,
        acctsessionid: true,
        username: true,
        framedipaddress: true,
        callingstationid: true,
        nasipaddress: true,
        acctstarttime: true,
        acctinputoctets: true,
        acctoutputoctets: true,
      },
      orderBy: { acctstarttime: 'desc' },
      take: 5000,
    }),
    prisma.router.findMany({
      where: { isActive: true },
      select: { id: true, name: true, ipAddress: true, nasname: true },
    }),
  ])

  const routerByNas = new Map<string, { id: string; name: string }>()
  for (const r of routers) {
    if (r.ipAddress) routerByNas.set(r.ipAddress, { id: r.id, name: r.name })
    if (r.nasname) routerByNas.set(r.nasname, { id: r.id, name: r.name })
  }

  // Live /ppp/active from every active router. A router that fails is
  // recorded, not treated as "empty".
  const results = await Promise.allSettled(routers.map((r) => listPppActiveStrict(r.id)))
  const live = new Map<string, MikrotikActiveSession>()
  const unreachable: Array<{ id: string; name: string }> = []
  results.forEach((res, i) => {
    if (res.status === 'fulfilled') {
      for (const s of res.value) if (!live.has(s.username)) live.set(s.username, s)
    } else {
      unreachable.push({ id: routers[i].id, name: routers[i].name })
    }
  })

  const nowMs = Date.now() + getTimezoneOffsetMs() // radacct times are WIB-as-UTC
  const sessions = new Map<string, LiveSession>()

  // RADIUS sessions first (rows are newest-first, keep one per customer).
  for (const s of rows) {
    if (sessions.has(s.username)) continue
    const nas = s.nasipaddress ? routerByNas.get(s.nasipaddress) : undefined
    const mt = live.get(s.username)
    const startMs = s.acctstarttime ? new Date(s.acctstarttime).getTime() : nowMs
    const radiusUptime = Math.max(0, Math.floor((nowMs - startMs) / 1000))
    sessions.set(s.username, {
      username: s.username,
      source: 'radius',
      sessionId: s.acctsessionid ?? '',
      ip: s.framedipaddress || mt?.ipAddress || null,
      mac: s.callingstationid || mt?.macAddress || null,
      startTime: s.acctstarttime ? new Date(s.acctstarttime).toISOString() : null,
      // The router's own uptime/counters are live; radacct only refreshes on interim-update.
      uptimeSec: mt?.uptime ? parseUptime(mt.uptime) : radiusUptime,
      rxBytes: mt ? mt.rxBytes : Number(s.acctinputoctets ?? 0),
      txBytes: mt ? mt.txBytes : Number(s.acctoutputoctets ?? 0),
      routerId: nas?.id ?? mt?.routerId ?? null,
      routerName: nas?.name ?? mt?.routerName ?? null,
    })
  }

  // Sessions only the router knows about (local-auth, or accounting missing).
  for (const [username, mt] of live) {
    if (sessions.has(username)) continue
    sessions.set(username, {
      username,
      source: 'mikrotik',
      sessionId: mt.sessionId ?? '',
      ip: mt.ipAddress,
      mac: mt.macAddress,
      startTime: null,
      uptimeSec: parseUptime(mt.uptime),
      rxBytes: mt.rxBytes,
      txBytes: mt.txBytes,
      routerId: mt.routerId,
      routerName: mt.routerName,
    })
  }

  return {
    at: Date.now(),
    sessions,
    unreachableRouterIds: unreachable.map((r) => r.id),
    unreachableRouters: unreachable,
  }
}

/**
 * Shared snapshot, cached briefly: the Online page polls every few seconds
 * from several technicians, and each build asks every router.
 */
export async function getConnectivitySnapshot(): Promise<ConnectivitySnapshot> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached
  if (!inflight) {
    inflight = buildSnapshot()
      .then((snap) => {
        cached = snap
        return snap
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function classifyCustomer(
  user: { username: string; status: string; routerId?: string | null },
  snap: ConnectivitySnapshot,
): ConnectionState {
  if (user.status === 'stopped') return 'stopped'
  if (user.status === 'isolated' || user.status === 'suspended') return 'isolated'
  if (snap.sessions.has(user.username)) return 'online'
  if (user.routerId && snap.unreachableRouterIds.includes(user.routerId)) return 'unknown'
  return 'offline'
}

/**
 * Prisma `where` for active customers that are not online, split into
 * offline vs unknown by whether their router could be queried.
 */
export function offlineWhere(snap: ConnectivitySnapshot, state: 'offline' | 'unknown' | 'all'): Prisma.pppoeUserWhereInput {
  const where: Prisma.pppoeUserWhereInput[] = [
    { status: 'active' },
    snap.sessions.size ? { username: { notIn: [...snap.sessions.keys()] } } : {},
  ]
  const bad = snap.unreachableRouterIds
  if (state === 'unknown') {
    where.push(bad.length ? { routerId: { in: bad } } : { id: '__none__' })
  } else if (state === 'offline' && bad.length) {
    where.push({ OR: [{ routerId: null }, { routerId: { notIn: bad } }] })
  }
  return { AND: where }
}

/** Customer fields the technician sees (read-only), same as the Pelanggan page. */
export const TECH_CUSTOMER_SELECT = {
  id: true,
  username: true,
  customerId: true,
  name: true,
  phone: true,
  email: true,
  address: true,
  status: true,
  subscriptionType: true,
  expiredAt: true,
  createdAt: true,
  latitude: true,
  longitude: true,
  connectionType: true,
  installDate: true,
  routerId: true,
  profile: { select: { id: true, name: true, price: true, downloadSpeed: true, uploadSpeed: true, groupName: true } },
  area: { select: { id: true, name: true } },
  router: { select: { id: true, name: true } },
} as const

/** 'overdue' | 'unpaid' | 'paid' per customer, same concept as the Pelanggan page. */
export async function loadPaymentStatus(userIds: string[]): Promise<Map<string, 'overdue' | 'unpaid'>> {
  const map = new Map<string, 'overdue' | 'unpaid'>()
  if (!userIds.length) return map
  const open = await prisma.invoice.findMany({
    where: { userId: { in: userIds }, status: { in: ['PENDING', 'OVERDUE'] } },
    select: { userId: true, status: true, dueDate: true },
  })
  const now = new Date()
  for (const inv of open) {
    if (!inv.userId || map.get(inv.userId) === 'overdue') continue
    const overdue = inv.status === 'OVERDUE' || (inv.dueDate !== null && new Date(inv.dueDate) < now)
    map.set(inv.userId, overdue ? 'overdue' : 'unpaid')
  }
  return map
}

/** Latest time each customer was seen online (last closed RADIUS session). */
export async function loadLastOnline(usernames: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!usernames.length) return map
  const rows = await prisma.radacct.groupBy({
    by: ['username'],
    where: { username: { in: usernames }, acctstoptime: { not: null } },
    _max: { acctstoptime: true },
  })
  for (const r of rows) {
    if (r._max.acctstoptime) map.set(r.username, new Date(r._max.acctstoptime).toISOString())
  }
  return map
}
