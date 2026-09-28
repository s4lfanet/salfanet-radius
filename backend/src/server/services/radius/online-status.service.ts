import 'server-only'
import { prisma } from '@/server/db/client'
import { batchListPppActive } from '@/server/services/mikrotik/ppp-secret.service'

export type OnlineCheckUser = {
  username: string
  router?: { id: string; authMode?: string | null } | null
}

/**
 * The single rule for "is this PPPoE customer online", shared by the
 * customer list, customer detail and the online-status polling endpoint.
 * Those three used to each have their own subset of this logic, so the same
 * customer could read online on the web list and offline in the admin app.
 *
 * 1. An open radacct row (acctstoptime NULL) → online.
 * 2. Anyone not online by (1) is checked against live /ppp/active on their
 *    router — whatever its auth mode. Local-auth routers never write
 *    radacct, and on RADIUS routers accounting can go stale while the
 *    session is up (NAS IP change not yet synced to FreeRADIUS clients, a
 *    dropped interim-update, a FreeRADIUS restart mid-session).
 * 3. Customers with no router assigned are checked against every active
 *    router, since there's no other way to know where they dialled in.
 *
 * Only routers with at least one not-yet-online user are polled, so on a
 * network where accounting is healthy this is one radacct query.
 */
export async function resolveOnlineUsernames(users: OnlineCheckUser[]): Promise<Set<string>> {
  if (users.length === 0) return new Set()

  const wanted = new Set(users.map((u) => u.username))
  const open = await prisma.radacct.findMany({
    where: { username: { in: [...wanted] }, acctstoptime: null },
    select: { username: true },
  })
  const online = new Set(open.map((s) => s.username))

  const routerIds = new Set<string>()
  let unassignedOffline = false
  for (const u of users) {
    if (online.has(u.username)) continue
    if (u.router?.id) routerIds.add(u.router.id)
    else unassignedOffline = true
  }

  if (unassignedOffline) {
    const active = await prisma.router.findMany({ where: { isActive: true }, select: { id: true } })
    for (const r of active) routerIds.add(r.id)
  }

  if (routerIds.size > 0) {
    const live = await batchListPppActive([...routerIds])
    for (const name of live) {
      if (wanted.has(name)) online.add(name)
    }
  }

  return online
}
