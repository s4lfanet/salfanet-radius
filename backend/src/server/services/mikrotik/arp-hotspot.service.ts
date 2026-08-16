import 'server-only'
import { RouterOSAPI } from 'node-routeros'
import { prisma } from '@/server/db/client'

// ─── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Wrapper for api.write('/.../print', [query]) that handles node-routeros bug:
 * when a query filter returns no results, node-routeros throws UNKNOWNREPLY: !empty
 * instead of returning an empty array. This catches that and returns [].
 */
async function safePrint(menu: (...args: any[]) => Promise<any[]>, path: string, args?: any[]): Promise<any[]> {
  try {
    return await menu(path, args || [])
  } catch (err: any) {
    if (err?.errno === 'UNKNOWNREPLY' || String(err?.message || '').includes('!empty')) {
      return [] // no results — return empty array
    }
    throw err
  }
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

export interface MikrotikResult {
  success: boolean
  action: string
  message: string
}

// ─── ARP Management (Static IP) ──────────────────────────────────────────────

export interface ArpEntryParams {
  ipAddress: string
  macAddress: string
  comment?: string
}

export type ArpAction = 'create' | 'update' | 'delete'

/**
 * Manage ARP entry on MikroTik router for Static IP customers.
 * Uses /ip/arp to bind MAC address to IP address.
 * Idempotent: create will update if entry exists, delete is safe if absent.
 */
export async function manageArpEntry(
  routerId: string,
  action: ArpAction,
  params: ArpEntryParams & { oldIpAddress?: string },
): Promise<MikrotikResult> {
  const router = await getRouterConfig(routerId)
  if (!router) {
    return { success: false, action, message: 'Router not found or missing credentials' }
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
      timeout: 15,
    })
    await Promise.race([
      api.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`connect timeout for ${host}:${apiPort} after 20s`)), 20000)
      ),
    ])
    const menu = api.write.bind(api)

    if (action === 'delete') {
      // Find ARP entry by IP address and remove it
      const entries = await safePrint(menu, '/ip/arp/print', [`?address=${params.ipAddress}`])
      if (entries.length === 0) {
        return { success: true, action, message: `ARP entry for ${params.ipAddress} already absent` }
      }
      for (const entry of entries) {
        const id = entry['.id'] || entry.id
        if (id) await menu('/ip/arp/remove', [`=.id=${id}`])
      }
      return { success: true, action, message: `ARP entry for ${params.ipAddress} deleted` }
    }

    if (action === 'create') {
      if (!params.ipAddress) {
        return { success: false, action, message: 'IP address required for ARP create' }
      }
      // Check if entry already exists for this IP
      const existing = await safePrint(menu, '/ip/arp/print', [`?address=${params.ipAddress}`])
      const macVal = params.macAddress || '00:00:00:00:00:00'
      if (existing.length > 0) {
        // Update existing entry
        const id = existing[0]['.id'] || existing[0].id
        const upd: string[] = [`=.id=${id}`, `=mac-address=${macVal}`]
        if (params.comment !== undefined) upd.push(`=comment=${params.comment}`)
        await menu('/ip/arp/set', upd)
        return { success: true, action, message: `ARP entry for ${params.ipAddress} updated (was existing)` }
      }
      // Create new entry
      const entry: string[] = [
        `=address=${params.ipAddress}`,
        `=mac-address=${macVal}`,
      ]
      if (params.comment !== undefined) entry.push(`=comment=${params.comment}`)
      await menu('/ip/arp/add', entry)
      return { success: true, action, message: `ARP entry for ${params.ipAddress} created` }
    }

    if (action === 'update') {
      // Update: may need to remove old IP entry and create new one
      const oldIp = params.oldIpAddress
      const newIp = params.ipAddress
      if (oldIp && oldIp !== newIp) {
        // Remove old ARP entry
        const oldEntries = await safePrint(menu, '/ip/arp/print', [`?address=${oldIp}`])
        for (const entry of oldEntries) {
          const id = entry['.id'] || entry.id
          if (id) await menu('/ip/arp/remove', [`=.id=${id}`])
        }
      }
      // Upsert new entry
      const macVal = params.macAddress || '00:00:00:00:00:00'
      const existing = await safePrint(menu, '/ip/arp/print', [`?address=${newIp}`])
      if (existing.length > 0) {
        const id = existing[0]['.id'] || existing[0].id
        const upd: string[] = [`=.id=${id}`, `=mac-address=${macVal}`]
        if (params.comment !== undefined) upd.push(`=comment=${params.comment}`)
        await menu('/ip/arp/set', upd)
        return { success: true, action, message: `ARP entry for ${newIp} updated` }
      }
      const entry: string[] = [`=address=${newIp}`, `=mac-address=${macVal}`]
      if (params.comment !== undefined) entry.push(`=comment=${params.comment}`)
      await menu('/ip/arp/add', entry)
      return { success: true, action, message: `ARP entry for ${newIp} created (was missing on update)` }
    }

    return { success: false, action, message: `Unknown action: ${action}` }
  } catch (e: any) {
    const msg = e?.message || String(e)
    console.error(`[ARP] ${action} on router ${router.name}:`, msg)
    return { success: false, action, message: msg }
  } finally {
    try { if (api) await api.close() } catch { /* ignore */ }
  }
}

// ─── Hotspot User Management ─────────────────────────────────────────────────

export interface HotspotUserParams {
  username: string
  password?: string
  profile?: string | null
  ipAddress?: string
  disabled?: boolean
  comment?: string
}

export type HotspotAction = 'create' | 'update' | 'delete'

/**
 * Manage Hotspot user on MikroTik router.
 * Uses /ip/hotspot/user to manage hotspot credentials.
 * Idempotent: create will update if user exists, delete is safe if absent.
 */
export async function manageHotspotUser(
  routerId: string,
  action: HotspotAction,
  params: HotspotUserParams & { oldUsername?: string },
): Promise<MikrotikResult> {
  const router = await getRouterConfig(routerId)
  if (!router) {
    return { success: false, action, message: 'Router not found or missing credentials' }
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
      timeout: 15,
    })
    await Promise.race([
      api.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`connect timeout for ${host}:${apiPort} after 20s`)), 20000)
      ),
    ])
    const menu = api.write.bind(api)

    // For update with username change, delete old and create new
    const lookupName = action === 'update' && params.oldUsername ? params.oldUsername : params.username

    if (action === 'delete') {
      const users = await safePrint(menu, '/ip/hotspot/user/print', [`?name=${params.username}`])
      if (users.length === 0) {
        return { success: true, action, message: `Hotspot user ${params.username} already absent` }
      }
      for (const u of users) {
        const id = u['.id'] || u.id
        if (id) await menu('/ip/hotspot/user/remove', [`=.id=${id}`])
      }
      return { success: true, action, message: `Hotspot user ${params.username} deleted` }
    }

    if (action === 'create') {
      if (!params.username) {
        return { success: false, action, message: 'Username required for hotspot create' }
      }
      // Check if user already exists
      const existing = await safePrint(menu, '/ip/hotspot/user/print', [`?name=${params.username}`])
      const disabledVal = params.disabled ? 'yes' : 'no'
      if (existing.length > 0) {
        // Update existing
        const id = existing[0]['.id'] || existing[0].id
        const upd: string[] = [`=.id=${id}`, `=disabled=${disabledVal}`]
        if (params.password !== undefined) upd.push(`=password=${params.password}`)
        if (params.profile) upd.push(`=profile=${params.profile}`)
        if (params.ipAddress) upd.push(`=address=${params.ipAddress}`)
        if (params.comment !== undefined) upd.push(`=comment=${params.comment}`)
        await menu('/ip/hotspot/user/set', upd)
        return { success: true, action, message: `Hotspot user ${params.username} updated (was existing)` }
      }
      // Create new
      const entry: string[] = [
        `=name=${params.username}`,
        `=password=${params.password || ''}`,
        `=disabled=${disabledVal}`,
      ]
      if (params.profile) entry.push(`=profile=${params.profile}`)
      if (params.ipAddress) entry.push(`=address=${params.ipAddress}`)
      if (params.comment !== undefined) entry.push(`=comment=${params.comment}`)
      await menu('/ip/hotspot/user/add', entry)
      return { success: true, action, message: `Hotspot user ${params.username} created` }
    }

    if (action === 'update') {
      // If username changed, delete old and create new
      if (params.oldUsername && params.oldUsername !== params.username) {
        const oldUsers = await safePrint(menu, '/ip/hotspot/user/print', [`?name=${params.oldUsername}`])
        for (const u of oldUsers) {
          const id = u['.id'] || u.id
          if (id) await menu('/ip/hotspot/user/remove', [`=.id=${id}`])
        }
        // Create with new username
        const disabledVal = params.disabled ? 'yes' : 'no'
        const entry: string[] = [
          `=name=${params.username}`,
          `=password=${params.password || ''}`,
          `=disabled=${disabledVal}`,
        ]
        if (params.profile) entry.push(`=profile=${params.profile}`)
        if (params.ipAddress) entry.push(`=address=${params.ipAddress}`)
        if (params.comment !== undefined) entry.push(`=comment=${params.comment}`)
        await menu('/ip/hotspot/user/add', entry)
        return { success: true, action, message: `Hotspot user renamed from ${params.oldUsername} to ${params.username}` }
      }
      // Same username — update in place
      const existing = await safePrint(menu, '/ip/hotspot/user/print', [`?name=${params.username}`])
      if (existing.length === 0) {
        // Not found — create instead
        const disabledVal = params.disabled ? 'yes' : 'no'
        const entry: string[] = [
          `=name=${params.username}`,
          `=password=${params.password || ''}`,
          `=disabled=${disabledVal}`,
        ]
        if (params.profile) entry.push(`=profile=${params.profile}`)
        if (params.ipAddress) entry.push(`=address=${params.ipAddress}`)
        if (params.comment !== undefined) entry.push(`=comment=${params.comment}`)
        await menu('/ip/hotspot/user/add', entry)
        return { success: true, action, message: `Hotspot user ${params.username} created (was missing on update)` }
      }
      const id = existing[0]['.id'] || existing[0].id
      const disabledVal = params.disabled ? 'yes' : 'no'
      const upd: string[] = [`=.id=${id}`, `=disabled=${disabledVal}`]
      if (params.password !== undefined) upd.push(`=password=${params.password}`)
      if (params.profile) upd.push(`=profile=${params.profile}`)
      if (params.ipAddress !== undefined) upd.push(`=address=${params.ipAddress}`)
      if (params.comment !== undefined) upd.push(`=comment=${params.comment}`)
      await menu('/ip/hotspot/user/set', upd)
      return { success: true, action, message: `Hotspot user ${params.username} updated` }
    }

    return { success: false, action, message: `Unknown action: ${action}` }
  } catch (e: any) {
    const msg = e?.message || String(e)
    console.error(`[HOTSPOT] ${action} on router ${router.name}:`, msg)
    return { success: false, action, message: msg }
  } finally {
    try { if (api) await api.close() } catch { /* ignore */ }
  }
}

// ─── Hotspot session kick ────────────────────────────────────────────────────

/**
 * Kick active hotspot session for a user.
 * Returns number of sessions kicked.
 */
export async function kickHotspotSession(routerId: string, username: string): Promise<number> {
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
      timeout: 15,
    })
    await Promise.race([
      api.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`connect timeout for ${host}:${apiPort} after 20s`)), 20000)
      ),
    ])
    // node-routeros throws UNKNOWNREPLY: !empty when query returns no results
    let active: Array<any> = []
    try {
      active = (await api.write('/ip/hotspot/active/print', [`?user=${username}`])) as Array<any>
    } catch (queryErr: any) {
      if (queryErr?.errno === 'UNKNOWNREPLY' || String(queryErr?.message || '').includes('!empty')) {
        return 0 // no active session — nothing to kick
      }
      throw queryErr
    }
    let kicked = 0
    for (const session of active) {
      const id = session['.id'] || session.id
      if (id) {
        try {
          await api.write('/ip/hotspot/active/remove', [`=.id=${id}`])
          kicked++
        } catch (e) {
          console.error(`[HOTSPOT_KICK] Failed to remove session ${id} for ${username}:`, e)
        }
      }
    }
    return kicked
  } catch (e: any) {
    console.error(`[HOTSPOT_KICK] Failed for ${username} on router ${router.name}:`, e?.message || e)
    return 0
  } finally {
    try { if (api) await api.close() } catch { /* ignore */ }
  }
}
