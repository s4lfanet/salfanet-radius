import 'server-only'
import { RouterOSAPI } from 'node-routeros'
import { prisma } from '@/server/db/client'

export interface PppSecretParams {
  username: string
  password: string
  profile?: string | null
  disabled?: boolean  // true = disabled, false = enabled
  service?: string    // default 'pppoe'
  comment?: string
}

export type PppSecretAction = 'create' | 'update' | 'delete' | 'enable' | 'disable' | 'rename'

export interface PppSecretResult {
  success: boolean
  action: PppSecretAction
  username: string
  message: string
}

/**
 * Get MikroTik connection config from router record (by routerId).
 * Returns null if router not found or missing credentials.
 */
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
  // Use ipAddress if available, fallback to nasname
  const host = router.ipAddress || router.nasname
  if (!host || !router.username || !router.password) return null
  return router
}

/**
 * Manage PPP Secret on MikroTik router via RouterOS API.
 * Idempotent: create will update if secret already exists.
 *
 * @param routerId - Router UUID (prisma router.id)
 * @param action   - 'create' | 'update' | 'delete' | 'enable' | 'disable' | 'rename'
 * @param params   - Secret parameters (username, password, profile, disabled, etc.)
 */
export async function managePppSecret(
  routerId: string,
  action: PppSecretAction,
  params: PppSecretParams,
): Promise<PppSecretResult> {
  const router = await getRouterConfig(routerId)
  if (!router) {
    return { success: false, action, username: params.username, message: 'Router not found or missing credentials' }
  }

  const host = router.ipAddress || router.nasname
  const apiPort = router.port || 8728
  let api: any

  try {
    api = new RouterOSAPI({
      host,
      port: apiPort,
      user: router.username || '',
      password: router.password || '',
      timeout: 10,
    })
    await api.connect()

    const menu = api.write.bind(api)
    const allSecrets = (await menu('/ppp/secret/print')) as Array<any>
    const existing = allSecrets.find((s) => s.name === params.username)
    const disabledVal = params.disabled ? 'yes' : 'no'
    const service = params.service || 'pppoe'

    if (action === 'create') {
      if (existing) {
        // Idempotent: update existing secret
        const id = existing['.id'] || existing.id
        const upd: string[] = [`=.id=${id}`, `=disabled=${disabledVal}`, `=service=${service}`]
        if (params.password !== undefined) upd.push(`=password=${params.password}`)
        if (params.profile) upd.push(`=profile=${params.profile}`)
        if (params.comment !== undefined) upd.push(`=comment=${params.comment}`)
        await menu('/ppp/secret/set', upd)
        return { success: true, action, username: params.username, message: `Updated existing secret (disabled=${disabledVal})` }
      } else {
        const entry: string[] = [
          `=name=${params.username}`,
          `=password=${params.password || ''}`,
          `=service=${service}`,
          `=disabled=${disabledVal}`,
        ]
        if (params.profile) entry.push(`=profile=${params.profile}`)
        if (params.comment !== undefined) entry.push(`=comment=${params.comment}`)
        await menu('/ppp/secret/add', entry)
        return { success: true, action, username: params.username, message: `Created secret (disabled=${disabledVal})` }
      }
    } else if (action === 'rename') {
      const newUsername = (params as any).newUsername
      if (!existing) {
        // Fallback: create with new name
        const entry: string[] = [
          `=name=${newUsername}`,
          `=password=${params.password || ''}`,
          `=service=${service}`,
          `=disabled=no`,
        ]
        if (params.profile) entry.push(`=profile=${params.profile}`)
        await menu('/ppp/secret/add', entry)
        return { success: true, action, username: newUsername, message: `Created (was missing, fallback from rename)` }
      } else {
        const id = existing['.id'] || existing.id
        const upd: string[] = [`=.id=${id}`, `=name=${newUsername}`]
        if (params.password !== undefined) upd.push(`=password=${params.password}`)
        if (params.profile) upd.push(`=profile=${params.profile}`)
        await menu('/ppp/secret/set', upd)
        return { success: true, action, username: newUsername, message: `Renamed from ${params.username}` }
      }
    } else if (action === 'delete') {
      if (!existing) {
        return { success: true, action, username: params.username, message: 'Already absent' }
      }
      const id = existing['.id'] || existing.id
      await menu('/ppp/secret/remove', [`=.id=${id}`])
      return { success: true, action, username: params.username, message: 'Deleted' }
    } else {
      // enable / disable / update
      if (!existing) {
        return { success: false, action, username: params.username, message: 'Secret not found' }
      }
      const id = existing['.id'] || existing.id
      if (action === 'disable') {
        await menu('/ppp/secret/set', [`=.id=${id}`, `=disabled=yes`])
        return { success: true, action, username: params.username, message: 'Disabled' }
      } else if (action === 'enable') {
        await menu('/ppp/secret/set', [`=.id=${id}`, `=disabled=no`])
        return { success: true, action, username: params.username, message: 'Enabled' }
      } else if (action === 'update') {
        const upd: string[] = [`=.id=${id}`]
        if (params.password !== undefined) upd.push(`=password=${params.password}`)
        if (params.profile) upd.push(`=profile=${params.profile}`)
        if (params.disabled !== undefined) upd.push(`=disabled=${disabledVal}`)
        if (upd.length > 1) {
          await menu('/ppp/secret/set', upd)
          return { success: true, action, username: params.username, message: 'Updated' }
        }
        return { success: true, action, username: params.username, message: 'No changes' }
      }
    }
    return { success: false, action, username: params.username, message: `Unknown action: ${action}` }
  } catch (e: any) {
    const msg = e?.message || String(e)
    console.error(`[PPP_SECRET] ${action} for "${params.username}" on router ${router.name}:`, msg)
    return { success: false, action, username: params.username, message: msg }
  } finally {
    try { if (api) await api.close() } catch { /* ignore */ }
  }
}

/**
 * Kick active PPPoE session for a user via RouterOS API.
 * Returns number of sessions kicked.
 */
export async function kickPppoeSession(routerId: string, username: string): Promise<number> {
  const router = await getRouterConfig(routerId)
  if (!router) return 0

  const host = router.ipAddress || router.nasname
  const apiPort = router.port || 8728
  let api: any
  try {
    api = new RouterOSAPI({
      host,
      port: apiPort,
      user: router.username || '',
      password: router.password || '',
      timeout: 10,
    })
    await api.connect()
    const active = (await api.write('/ppp/active/print', [`?name=${username}`])) as Array<any>
    let kicked = 0
    for (const session of active) {
      const id = session['.id'] || session.id
      if (id) {
        try {
          await api.write('/ppp/active/remove', [`=.id=${id}`])
          kicked++
        } catch (e) {
          console.error(`[KICK] Failed to remove session ${id} for ${username}:`, e)
        }
      }
    }
    return kicked
  } catch (e: any) {
    console.error(`[KICK] Failed for ${username} on router ${router.name}:`, e?.message || e)
    return 0
  } finally {
    try { if (api) await api.close() } catch { /* ignore */ }
  }
}

/**
 * List all PPP secrets from a MikroTik router.
 * Used by sync-check feature.
 */
export async function listPppSecrets(routerId: string): Promise<Array<{ name: string; disabled: string; profile: string }>> {
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
      timeout: 10,
    })
    await api.connect()
    const secrets = (await api.write('/ppp/secret/print')) as Array<any>
    return secrets.map((s) => ({
      name: s.name,
      disabled: s.disabled || 'no',
      profile: s.profile || '',
    }))
  } catch (e: any) {
    console.error(`[PPP_SECRET] listPppSecrets for router ${router.name}:`, e?.message || e)
    return []
  } finally {
    try { if (api) await api.close() } catch { /* ignore */ }
  }
}

/**
 * List all active PPP sessions from a MikroTik router (/ppp/active/print).
 * Used for online detection in local mode where radacct may not
 * capture all sessions (local-auth users bypass RADIUS accounting).
 *
 * @param routerId - Router UUID
 * @returns Set of usernames currently active on the router
 */
export async function listPppActive(routerId: string): Promise<Set<string>> {
  const router = await getRouterConfig(routerId)
  if (!router) return new Set()

  const host = router.ipAddress || router.nasname
  const apiPort = router.port || 8728
  let api: any
  try {
    api = new RouterOSAPI({
      host,
      port: apiPort,
      user: router.username || '',
      password: router.password || '',
      timeout: 10,
    })
    await api.connect()
    const active = (await api.write('/ppp/active/print')) as Array<any>
    const usernames = new Set<string>()
    for (const s of active) {
      const name = s.name || s.user || ''
      if (name) usernames.add(name)
    }
    return usernames
  } catch (e: any) {
    console.error(`[PPP_ACTIVE] listPppActive for router ${router.name}:`, e?.message || e)
    return new Set()
  } finally {
    try { if (api) await api.close() } catch { /* ignore */ }
  }
}

/**
 * Batch fetch active PPP usernames from multiple routers.
 * Returns a combined Set of all active usernames across all specified routers.
 *
 * @param routerIds - Array of router UUIDs to poll
 * @returns Set of usernames active on any of the routers
 */
export async function batchListPppActive(routerIds: string[]): Promise<Set<string>> {
  if (routerIds.length === 0) return new Set()
  const results = await Promise.allSettled(routerIds.map(id => listPppActive(id)))
  const combined = new Set<string>()
  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const name of r.value) combined.add(name)
    }
  }
  return combined
}

/**
 * Resolve MikroTik PPP profile name from our pppoeProfile.
 * Uses mikrotikProfileName if set, otherwise uses groupName.
 */
export async function getMikrotikProfileName(profileId: string): Promise<string | null> {
  const profile = await prisma.pppoeProfile.findUnique({
    where: { id: profileId },
    select: { mikrotikProfileName: true, groupName: true, name: true },
  })
  if (!profile) return null
  return profile.mikrotikProfileName || profile.groupName || profile.name
}

/**
 * Decide whether to create PPP secret based on router authMode.
 * Returns: { shouldCreate, disabled }
 * - local/null → create enabled (secret is primary auth)
 * - radius     → create disabled (secret is backup, RADIUS is primary)
 */
export function shouldCreatePppSecret(authMode: string | null | undefined): { shouldCreate: boolean; disabled: boolean } {
  const mode = authMode || 'local'  // null/undefined = local (default)
  if (mode === 'radius' || mode === 'hybrid') {
    // RADIUS/hybrid mode: create disabled (backup only, RADIUS is primary auth)
    return { shouldCreate: true, disabled: true }
  }
  // local: create enabled
  return { shouldCreate: true, disabled: false }
}

/**
 * Decide whether to enable/disable PPP secret based on router authMode.
 * - local  → manage secret (enable/disable, change profile) — MikroTik is auth source
 * - radius → skip (RADIUS handles auth via radcheck)
 * - hybrid → skip (RADIUS is primary, PPP secret is backup only — must stay disabled)
 */
export function shouldManagePppSecretForSuspend(authMode: string | null | undefined): boolean {
  const mode = authMode || 'local'
  return mode === 'local'  // only local mode manages secret enabled/disabled state
}
