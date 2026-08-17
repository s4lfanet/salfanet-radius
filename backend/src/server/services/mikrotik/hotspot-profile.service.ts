import 'server-only'
import { RouterOSAPI } from 'node-routeros'
import { prisma } from '@/server/db/client'

export interface HotspotProfileParams {
  name: string
  speed: string
  validityValue: number
  validityUnit: string
  sharedUsers: number
  groupProfile?: string | null
  costPrice: number
  sellingPrice: number
}

export type HotspotProfileAction = 'create' | 'update' | 'delete' | 'sync'

export interface HotspotProfileResult {
  success: boolean
  action: HotspotProfileAction
  routerId: string
  routerName: string
  profileName: string
  message: string
}

export interface SyncAllResult {
  total: number
  success: number
  failed: number
  results: HotspotProfileResult[]
}

/**
 * Get MikroTik connection config from router record (by routerId).
 * Returns null if router not found, missing credentials, or not local mode.
 */
async function getLocalRouterConfig(routerId: string) {
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
      isActive: true,
    },
  })
  if (!router) return null
  if (router.authMode !== 'local') return null
  if (!router.isActive) return null
  const host = router.ipAddress || router.nasname
  if (!host || !router.username || !router.password) return null
  return router
}

/**
 * Get all active local-only routers.
 */
async function getLocalRouters() {
  const routers = await prisma.router.findMany({
    where: {
      authMode: 'local',
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      nasname: true,
      ipAddress: true,
      username: true,
      password: true,
      port: true,
      authMode: true,
      isActive: true,
    },
  })
  return routers.filter(r => r.ipAddress || r.nasname)
}

/**
 * Convert validity (value + unit) to RouterOS timeout string.
 * e.g. 1 HOURS -> "1h", 30 MINUTES -> "30m", 7 DAYS -> "7d"
 */
function validityToTimeout(value: number, unit: string): string {
  switch (unit) {
    case 'MINUTES': return `${value}m`
    case 'HOURS': return `${value}h`
    case 'DAYS': return `${value}d`
    case 'MONTHS': return `${value * 30}d`
    default: return `${value}h`
  }
}

/**
 * Generate on-login script for hotspot user profile.
 * This script:
 * 1. Creates a scheduler entry that auto-removes the user when validity expires
 * 2. Records the transaction in /system/script for voucher sales tracking
 *
 * Format: user/price/sales/date/time/phone/seller
 */
function generateOnLoginScript(
  validity: string,
  costPrice: number,
  sellingPrice: number,
): string {
  return (
    `:local validity "${validity}";` +
    `:local price "${costPrice}";` +
    `:local sales "${sellingPrice}";` +
    `:if ([:len [/system scheduler find name=$user]] = 0) do={` +
    `  :local date [/system clock get date];` +
    `  :local time [/system clock get time];` +
    `  :local comment [/ip hotspot user get [find name=$user] comment];` +
    `  :local phone [:pick $comment 0 [:find $comment "-"]];` +
    `  :local seller [:pick $comment ([:find $comment "-"] + 1) [:len $comment]];` +
    `  /system scheduler add name=$user interval="${validity}" on-event="/ip hotspot user remove [find name=$user]; /ip hotspot active remove [find user=$user]; /ip hotspot cookie remove [find user=$user]; /system scheduler remove [find name=$user]" policy=read,write;` +
    `  :local trx "$user/$price/$sales/$date/$time/$phone/$seller";` +
    `  :if ([:len [/system script find name=$date]] = 0) do={` +
    `    /system script add name=$date source=$trx policy=read,write;` +
    `  } else={` +
    `    :local oldContent [/system script get [find name=$date] source];` +
    `    /system script set [find name=$date] source=($oldContent . "\\n" . $trx);` +
    `  }` +
    `}`
  )
}

/**
 * Manage hotspot user profile on a MikroTik router via RouterOS API.
 * Idempotent: create will update if profile already exists.
 */
export async function manageHotspotProfile(
  routerId: string,
  action: HotspotProfileAction,
  params: HotspotProfileParams,
): Promise<HotspotProfileResult> {
  const router = await getLocalRouterConfig(routerId)
  if (!router) {
    return {
      success: false,
      action,
      routerId,
      routerName: 'unknown',
      profileName: params.name,
      message: 'Router not found, not local mode, or missing credentials',
    }
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
        setTimeout(() => reject(new Error(`connect timeout for ${host}:${apiPort} after 20s`)), 20000),
      ),
    ])

    const menu = api.write.bind(api)
    const validity = validityToTimeout(params.validityValue, params.validityUnit)
    const sessionTimeout = validity
    const idleTimeout = 'none'
    const keepaliveTimeout = '00:02:00'
    const macCookieTimeout = sessionTimeout
    const onLoginScript = generateOnLoginScript(validity, params.costPrice, params.sellingPrice)

    // Get existing profiles
    const allProfiles = (await menu('/ip/hotspot/user/profile/print')) as Array<any>
    const existing = allProfiles.find((p) => p.name === params.name)

    if (action === 'delete') {
      if (!existing) {
        return {
          success: true,
          action,
          routerId,
          routerName: router.name,
          profileName: params.name,
          message: 'Already absent',
        }
      }
      const id = existing['.id'] || existing.id

      // Clear on-login script first to prevent script execution on removal
      try {
        await menu('/ip/hotspot/user/profile/set', [`=.id=${id}`, '=on-login='])
      } catch { /* ignore */ }

      // Remove associated users and schedulers
      const users = (await menu('/ip/hotspot/user/print', [`?profile=${params.name}`])) as Array<any>
      for (const user of users) {
        const uid = user['.id'] || user.id
        if (uid) {
          // Remove active sessions
          try {
            const activeSessions = (await menu('/ip/hotspot/active/print', [`?user=${user.name}`])) as Array<any>
            for (const session of activeSessions) {
              await menu('/ip/hotspot/active/remove', [`=.id=${session['.id']}`])
            }
          } catch { /* ignore */ }
          // Remove cookies
          try {
            await menu('/ip/hotspot/cookie/remove', [`?user=${user.name}`])
          } catch { /* ignore */ }
          // Remove user
          await menu('/ip/hotspot/user/remove', [`=.id=${uid}`])
          // Remove scheduler
          try {
            await menu('/system/scheduler/remove', [`?name=${user.name}`])
          } catch { /* ignore */ }
        }
      }

      // Remove the profile
      await menu('/ip/hotspot/user/profile/remove', [`=.id=${id}`])
      return {
        success: true,
        action,
        routerId,
        routerName: router.name,
        profileName: params.name,
        message: 'Deleted profile + associated users',
      }
    }

    // Build profile data
    const profileData: string[] = [
      `=name=${params.name}`,
      `=rate-limit=${params.speed}`,
      `=session-timeout=${sessionTimeout}`,
      `=idle-timeout=${idleTimeout}`,
      `=keepalive-timeout=${keepaliveTimeout}`,
      `=mac-cookie-timeout=${macCookieTimeout}`,
      `=on-login=${onLoginScript}`,
    ]

    if (params.sharedUsers > 1) {
      profileData.push(`=shared-users=${params.sharedUsers}`)
    }

    if (action === 'create' || action === 'sync') {
      if (existing) {
        // Update existing profile
        const id = existing['.id'] || existing.id
        // Clear on-login first to avoid script conflicts
        try {
          await menu('/ip/hotspot/user/profile/set', [`=.id=${id}`, '=on-login='])
        } catch { /* ignore */ }

        const upd: string[] = [
          `=.id=${id}`,
          `=rate-limit=${params.speed}`,
          `=session-timeout=${sessionTimeout}`,
          `=idle-timeout=${idleTimeout}`,
          `=keepalive-timeout=${keepaliveTimeout}`,
          `=mac-cookie-timeout=${macCookieTimeout}`,
          `=on-login=${onLoginScript}`,
        ]
        if (params.sharedUsers > 1) {
          upd.push(`=shared-users=${params.sharedUsers}`)
        } else {
          upd.push(`=shared-users=1`)
        }
        await menu('/ip/hotspot/user/profile/set', upd)
        return {
          success: true,
          action: 'update',
          routerId,
          routerName: router.name,
          profileName: params.name,
          message: 'Updated existing profile',
        }
      } else {
        // Create new profile
        await menu('/ip/hotspot/user/profile/add', profileData)
        return {
          success: true,
          action: 'create',
          routerId,
          routerName: router.name,
          profileName: params.name,
          message: 'Created new profile',
        }
      }
    }

    if (action === 'update') {
      if (!existing) {
        // Create if not exists (upsert behavior)
        await menu('/ip/hotspot/user/profile/add', profileData)
        return {
          success: true,
          action: 'create',
          routerId,
          routerName: router.name,
          profileName: params.name,
          message: 'Created (was missing, fallback from update)',
        }
      }
      const id = existing['.id'] || existing.id
      // Clear on-login first
      try {
        await menu('/ip/hotspot/user/profile/set', [`=.id=${id}`, '=on-login='])
      } catch { /* ignore */ }

      const upd: string[] = [
        `=.id=${id}`,
        `=rate-limit=${params.speed}`,
        `=session-timeout=${sessionTimeout}`,
        `=idle-timeout=${idleTimeout}`,
        `=keepalive-timeout=${keepaliveTimeout}`,
        `=mac-cookie-timeout=${macCookieTimeout}`,
        `=on-login=${onLoginScript}`,
      ]
      if (params.sharedUsers > 1) {
        upd.push(`=shared-users=${params.sharedUsers}`)
      } else {
        upd.push(`=shared-users=1`)
      }
      await menu('/ip/hotspot/user/profile/set', upd)
      return {
        success: true,
        action,
        routerId,
        routerName: router.name,
        profileName: params.name,
        message: 'Updated profile',
      }
    }

    return {
      success: false,
      action,
      routerId,
      routerName: router.name,
      profileName: params.name,
      message: `Unknown action: ${action}`,
    }
  } catch (e: any) {
    const msg = e?.message || String(e)
    console.error(`[HOTSPOT_PROFILE] ${action} for "${params.name}" on router ${router.name}:`, msg)
    return {
      success: false,
      action,
      routerId,
      routerName: router.name,
      profileName: params.name,
      message: msg,
    }
  } finally {
    try { if (api) await api.close() } catch { /* ignore */ }
  }
}

/**
 * Sync a single hotspot profile to ALL active local-only routers.
 */
export async function syncHotspotProfileToAllLocalRouters(
  profileId: string,
  action: HotspotProfileAction = 'sync',
): Promise<SyncAllResult> {
  const profile = await prisma.hotspotProfile.findUnique({
    where: { id: profileId },
  })

  if (!profile) {
    return {
      total: 0,
      success: 0,
      failed: 0,
      results: [],
    }
  }

  const routers = await getLocalRouters()
  const results: HotspotProfileResult[] = []

  for (const router of routers) {
    const result = await manageHotspotProfile(router.id, action, {
      name: profile.name,
      speed: profile.speed,
      validityValue: profile.validityValue,
      validityUnit: profile.validityUnit,
      sharedUsers: profile.sharedUsers,
      groupProfile: profile.groupProfile,
      costPrice: profile.costPrice,
      sellingPrice: profile.sellingPrice,
    })
    results.push(result)
  }

  return {
    total: routers.length,
    success: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  }
}

/**
 * Sync ALL hotspot profiles to ALL active local-only routers.
 * Used for bulk sync operations.
 */
export async function syncAllHotspotProfilesToLocalRouters(): Promise<{
  totalProfiles: number
  totalRouters: number
  results: { profileName: string; syncResult: SyncAllResult }[]
}> {
  const profiles = await prisma.hotspotProfile.findMany({
    where: { isActive: true },
  })

  const routers = await getLocalRouters()
  const results: { profileName: string; syncResult: SyncAllResult }[] = []

  for (const profile of profiles) {
    const syncResult = await syncHotspotProfileToAllLocalRouters(profile.id)
    results.push({ profileName: profile.name, syncResult })
  }

  return {
    totalProfiles: profiles.length,
    totalRouters: routers.length,
    results,
  }
}

/**
 * Delete a hotspot profile from ALL active local-only routers.
 */
export async function deleteHotspotProfileFromAllLocalRouters(
  profileId: string,
): Promise<SyncAllResult> {
  const profile = await prisma.hotspotProfile.findUnique({
    where: { id: profileId },
  })

  if (!profile) {
    return { total: 0, success: 0, failed: 0, results: [] }
  }

  const routers = await getLocalRouters()
  const results: HotspotProfileResult[] = []

  for (const router of routers) {
    const result = await manageHotspotProfile(router.id, 'delete', {
      name: profile.name,
      speed: profile.speed,
      validityValue: profile.validityValue,
      validityUnit: profile.validityUnit,
      sharedUsers: profile.sharedUsers,
      groupProfile: profile.groupProfile,
      costPrice: profile.costPrice,
      sellingPrice: profile.sellingPrice,
    })
    results.push(result)
  }

  return {
    total: routers.length,
    success: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  }
}
