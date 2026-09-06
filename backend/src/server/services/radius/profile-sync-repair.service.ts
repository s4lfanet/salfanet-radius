/**
 * Profile Sync Repair — fix customers whose DB status is 'active' but whose
 * RADIUS radusergroup OR MikroTik PPP secret profile is still 'isolir'.
 *
 * This runs as part of the radius_reconciliation cron and can also be
 * triggered manually via the /api/pppoe/users/sync-audit endpoint.
 *
 * Root cause it fixes:
 *   When a customer was restored to 'active' (via payment, extend, manual
 *   status change), the DB status and RADIUS tables were updated, but the
 *   MikroTik PPP secret profile was not updated or the active session was
 *   not kicked. RouterOS retains the old profile on already-authenticated
 *   sessions, so the user stayed stuck on 'isolir'.
 *
 * Repair steps per affected user:
 *   1. Verify DB status is 'active'
 *   2. Check radusergroup — fix if 'isolir' or mismatched
 *   3. Check MikroTik PPP secret profile — fix if 'isolir' or mismatched
 *   4. Kick active PPPoE session so user re-authenticates with correct profile
 */
import 'server-only'
import { prisma } from '@/server/db/client'
import {
  managePppSecret,
  shouldManagePppSecretForSuspend,
  kickPppoeSession,
  listPppSecrets,
} from '@/server/services/mikrotik/ppp-secret.service'
import { disconnectPPPoEUser } from '@/server/services/radius/coa-handler.service'

export interface ProfileSyncRepairReport {
  scanned: number
  repaired: number
  errors: string[]
  repairedUsers: Array<{ username: string; oldGroup: string; newGroup: string; kicked: boolean; source: string }>
}

export async function runProfileSyncRepair(): Promise<ProfileSyncRepairReport> {
  const errors: string[] = []
  const repairedUsers: ProfileSyncRepairReport['repairedUsers'] = []

  // Find all active users with their profile + router info
  const activeUsers = await prisma.pppoeUser.findMany({
    where: { status: 'active' },
    select: {
      id: true,
      username: true,
      password: true,
      ipAddress: true,
      connectionType: true,
      profile: { select: { id: true, groupName: true, name: true } },
      router: { select: { id: true, authMode: true, name: true } },
    },
  })

  if (activeUsers.length === 0) {
    return { scanned: 0, repaired: 0, errors, repairedUsers }
  }

  // Fetch all radusergroup entries for these users
  const usernames = activeUsers.map(u => u.username)
  const radUserGroups = await prisma.$queryRaw<Array<{ username: string; groupname: string }>>`
    SELECT username, groupname FROM radusergroup
    WHERE username IN (${usernames.join(',')})
  `

  const groupMap = new Map<string, string>()
  for (const rug of radUserGroups) {
    groupMap.set(rug.username, rug.groupname)
  }

  // Also fetch MikroTik PPP secret profiles for local-auth routers
  // Group users by router to batch-fetch secrets
  const routerUserMap = new Map<string, { usernames: string[]; users: typeof activeUsers }>()
  for (const user of activeUsers) {
    if (user.router?.id && shouldManagePppSecretForSuspend(user.router.authMode)) {
      if (!routerUserMap.has(user.router.id)) {
        routerUserMap.set(user.router.id, { usernames: [], users: [] })
      }
      const entry = routerUserMap.get(user.router.id)!
      entry.usernames.push(user.username)
      entry.users.push(user)
    }
  }

  // Fetch PPP secrets from each local-auth router
  const mtSecretProfileMap = new Map<string, string>() // username → profile
  for (const [routerId, entry] of routerUserMap) {
    try {
      const secrets = await listPppSecrets(routerId)
      for (const s of secrets) {
        if (entry.usernames.includes(s.name)) {
          mtSecretProfileMap.set(s.name, s.profile)
        }
      }
    } catch (e: any) {
      errors.push(`MikroTik secrets fetch for router ${routerId}: ${e?.message || e}`)
    }
  }

  let repaired = 0
  for (const user of activeUsers) {
    try {
      const expectedGroup = user.profile?.groupName || null
      if (!expectedGroup) continue // no profile assigned — skip

      const actualGroup = groupMap.get(user.username) || null
      const mtProfile = mtSecretProfileMap.get(user.username) || null

      // Check if RADIUS group is wrong
      const isWrongGroup = actualGroup === 'isolir' || (actualGroup && actualGroup !== expectedGroup)

      // Check if MikroTik PPP secret profile is wrong
      const isWrongMtProfile = mtProfile === 'isolir' || (mtProfile && mtProfile !== expectedGroup)

      if (!isWrongGroup && !isWrongMtProfile) continue // everything is correct

      const nasIdentifier = user.router?.id || null
      const authMode = user.router?.authMode || 'local'
      const source = isWrongGroup && isWrongMtProfile
        ? `radusergroup+mt`
        : isWrongGroup
          ? `radusergroup`
          : `mt-secret`

      // 1. Fix radusergroup (if wrong)
      if (isWrongGroup) {
        await prisma.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `
        await prisma.$executeRaw`
          INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
          VALUES (${user.username}, ${expectedGroup}, 1, ${nasIdentifier})
        `
      }

      // 2. Restore radcheck password (in case it was removed)
      await prisma.$executeRaw`
        INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
        VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasIdentifier})
        ON DUPLICATE KEY UPDATE value = ${user.password}
      `

      // 3. Remove suspension markers
      await prisma.radcheck.deleteMany({
        where: {
          username: user.username,
          attribute: { in: ['Auth-Type', 'NAS-IP-Address'] },
          ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}),
        },
      })
      await prisma.radreply.deleteMany({
        where: {
          username: user.username,
          attribute: 'Reply-Message',
          ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}),
        },
      })

      // 4. Restore static IP
      await prisma.$executeRaw`
        DELETE FROM radreply WHERE username = ${user.username} AND attribute = 'Framed-IP-Address' AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
      `
      if (user.ipAddress) {
        await prisma.$executeRaw`
          INSERT INTO radreply (username, attribute, op, value, nas_identifier)
          VALUES (${user.username}, 'Framed-IP-Address', ':=', ${user.ipAddress}, ${nasIdentifier})
          ON DUPLICATE KEY UPDATE value = ${user.ipAddress}
        `
      }

      // 5. Fix MikroTik PPP secret profile (local-auth only)
      let kicked = false
      if (user.router?.id && shouldManagePppSecretForSuspend(authMode)) {
        const connType = user.connectionType || 'PPPOE'
        if (connType === 'PPPOE') {
          try {
            const r = await managePppSecret(user.router.id, 'enable', {
              username: user.username,
              password: user.password,
              profile: expectedGroup,
            })
            console.log(`[PROFILE_SYNC_REPAIR] PPP secret restored to "${expectedGroup}" for ${user.username}: ${r.message}`)
          } catch (e: any) {
            console.error(`[PROFILE_SYNC_REPAIR] PPP secret restore failed for ${user.username}:`, e?.message || e)
          }

          // 6. Kick active session so user reconnects with correct profile
          try {
            const k = await kickPppoeSession(user.router.id, user.username)
            kicked = k > 0
            console.log(`[PROFILE_SYNC_REPAIR] Kicked ${k} session(s) for ${user.username}`)
          } catch (e: any) {
            console.error(`[PROFILE_SYNC_REPAIR] Kick failed for ${user.username}:`, e?.message || e)
          }
        } else if (connType === 'HOTSPOT') {
          try {
            const { manageHotspotUser, kickHotspotSession } = await import('@/server/services/mikrotik/arp-hotspot.service')
            await manageHotspotUser(user.router.id, 'update', {
              username: user.username, password: user.password, disabled: false,
            })
            const k = await kickHotspotSession(user.router.id, user.username)
            kicked = k > 0
          } catch (e: any) {
            console.error(`[PROFILE_SYNC_REPAIR] Hotspot restore failed for ${user.username}:`, e?.message || e)
          }
        }
      }

      // 7. CoA disconnect (for RADIUS-auth routers)
      try {
        await disconnectPPPoEUser(user.username)
      } catch { /* non-fatal */ }

      repaired++
      const oldGroup = isWrongGroup ? (actualGroup || '(none)') : (mtProfile || '(none)')
      repairedUsers.push({
        username: user.username,
        oldGroup,
        newGroup: expectedGroup,
        kicked,
        source,
      })
      console.log(`[PROFILE_SYNC_REPAIR] Repaired ${user.username}: ${source} "${oldGroup}" → "${expectedGroup}", kicked=${kicked}`)
    } catch (e: any) {
      errors.push(`${user.username}: ${e?.message || e}`)
      console.error(`[PROFILE_SYNC_REPAIR] Failed for ${user.username}:`, e?.message || e)
    }
  }

  console.log(`[PROFILE_SYNC_REPAIR] Scanned ${activeUsers.length} active users, repaired ${repaired}, errors ${errors.length}`)
  return { scanned: activeUsers.length, repaired, errors, repairedUsers }
}
