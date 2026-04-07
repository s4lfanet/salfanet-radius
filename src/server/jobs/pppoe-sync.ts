import { prisma } from '@/server/db/client'
import { nanoid } from 'nanoid'
import { RouterOSAPI } from 'node-routeros'
import { getIsolationSettings } from '@/server/services/isolation.service'

let isPPPoESyncRunning = 0  // timestamp lock: 0 = free, >0 = lock start time
const LOCK_TTL_MS = 5 * 60 * 1000  // auto-expire lock after 5 minutes

/**
 * Disconnect PPPoE user via MikroTik API as fallback when CoA fails
 */
export async function disconnectViaMikrotikAPI(username: string) {
  try {
    // Get active session from radacct to find NAS IP
    const session = await prisma.radacct.findFirst({
      where: {
        username: username,
        acctstoptime: null
      },
      select: {
        nasipaddress: true,
        acctsessionid: true
      }
    })

    if (!session) {
      console.log(`[MikroTik API] No active session for ${username}`)
      return
    }

    // Get router configuration from DB (model router -> table nas)
    const router = await prisma.router.findFirst({
      where: {
        OR: [
          { nasname: session.nasipaddress },
          { ipAddress: session.nasipaddress },
        ],
      },
      select: {
        name: true,
        nasname: true,
        ipAddress: true,
        username: true,
        password: true,
        port: true,
        apiPort: true,
      },
    })

    if (!router) {
      console.log(`[MikroTik API] Router not found for NAS IP ${session.nasipaddress}`)
      return
    }

    const host = router.ipAddress || router.nasname
    // Try API-SSL first (apiPort, usually 8729), then plaintext (port/8728)
    // Many MikroTik routers only have API-SSL enabled
    const primaryPort = router.apiPort || 8729
    const fallbackPort = router.port || 8728

    const tryDisconnect = async (port: number) => {
      const api = new RouterOSAPI({
        host,
        port,
        user: router.username,
        password: router.password,
        timeout: 3,
      })

      try {
        await api.connect()
        console.log(`[MikroTik API] Connected to ${router.name} (${host}:${port})`)

        const activeSessions = await api.write('/ppp/active/print', [`?name=${username}`])
        console.log(`[MikroTik API] Found ${activeSessions.length} PPPoE active session(s) for ${username}`)

        if (activeSessions.length === 0) {
          await api.close()
          return { success: false, error: 'User not found in PPPoE active list' }
        }

        for (const s of activeSessions) {
          await api.write('/ppp/active/remove', [`=.id=${s['.id']}`])
          console.log(`[MikroTik API] Disconnected session ID: ${s['.id']}`)
        }

        await api.close()
        return { success: true }
      } catch (e: any) {
        try { await api.close() } catch {}
        return { success: false, error: e?.message || String(e) }
      }
    }

    // Try API-SSL first (8729), then plaintext (8728)
    const first = await tryDisconnect(primaryPort)
    if (first.success) {
      console.log(`[MikroTik API] ✅ Disconnected ${username} on ${router.name} (${host}:${primaryPort})`)
      return
    }

    if (fallbackPort !== primaryPort) {
      console.log(`[MikroTik API] Retry disconnect on fallback port ${fallbackPort} (reason: ${first.error})`)
      const second = await tryDisconnect(fallbackPort)
      if (second.success) {
        console.log(`[MikroTik API] ✅ Disconnected ${username} on ${router.name} (${host}:${fallbackPort})`)
        return
      }
      throw new Error(`Disconnect failed (8728: ${first.error}) (8729: ${second.error})`)
    }

    throw new Error(`Disconnect failed on port ${primaryPort}: ${first.error}`)
  } catch (error: any) {
    console.error(`[MikroTik API] Error disconnecting ${username}:`, error.message)
    throw error
  }
}

/**
 * PPPoE Auto-Isolir Expired Users
 * 
 * Runs every hour to check and isolate expired PPPoE users:
 * 1. Find active users with expiredAt < TODAY
 * 2. Update user status to 'isolated' (not suspended!)
 * 3. Keep password in radcheck (ALLOW LOGIN!)
 * 4. Move user to 'isolir' group in radusergroup
 * 5. Remove static IP from radreply (get IP from pool-isolir instead)
 * 6. Send CoA disconnect to force re-authentication
 * 
 * IMPORTANT: isolated users CAN LOGIN (restricted access)
 *            blocked/stop users CANNOT LOGIN (Auth-Type=Reject)
 */
export async function autoIsolatePPPoEUsers(): Promise<{ 
  success: boolean
  isolated: number
  error?: string 
}> {
  const now = Date.now()
  if (isPPPoESyncRunning && (now - isPPPoESyncRunning) < LOCK_TTL_MS) {
    console.log('[PPPoE Auto-Isolir] Already running, skipping...')
    return { success: false, isolated: 0, error: 'Already running' }
  }
  if (isPPPoESyncRunning) {
    console.log(`[PPPoE Auto-Isolir] Stale lock detected (${Math.round((now - isPPPoESyncRunning) / 1000)}s old), resetting`)
  }

  isPPPoESyncRunning = now
  const startedAt = new Date()

  // Read isolation settings — respect admin toggle and grace period
  const isolationSettings = await getIsolationSettings()
  const gracePeriodDays = isolationSettings.gracePeriodDays ?? 0

  // If isolation is disabled in admin settings, skip
  if (!isolationSettings.isolationEnabled) {
    isPPPoESyncRunning = 0
    console.log('[PPPoE Auto-Isolir] Isolation disabled in settings, skipping.')
    return { success: true, isolated: 0 }
  }

  let history: { id: string } | undefined

  try {
    // Create history record inside try so isPPPoESyncRunning is ALWAYS reset by finally
    history = await prisma.cronHistory.create({
      data: {
        id: nanoid(),
        jobType: 'pppoe_auto_isolir',
        status: 'running',
        startedAt,
      },
    })
    console.log(`[PPPoE Auto-Isolir] Checking for expired users (gracePeriod=${gracePeriodDays} days)...`)

    // Enforce: all manually blocked/stop users must be rejected by RADIUS
    // Prevent login by setting Auth-Type=Reject
    // NOTE: isolated users are NOT rejected here - they can login with restricted access
    try {
      await prisma.$executeRaw`
        DELETE rc
        FROM radcheck rc
        INNER JOIN pppoe_users pu ON pu.username = rc.username
        WHERE pu.status IN ('blocked', 'stop')
          AND rc.attribute = 'Auth-Type'
      `
      await prisma.$executeRaw`
        INSERT INTO radcheck (username, attribute, op, value)
        SELECT pu.username, 'Auth-Type', ':=', 'Reject'
        FROM pppoe_users pu
        WHERE pu.status IN ('blocked', 'stop')
      `

      await prisma.$executeRaw`
        DELETE rr
        FROM radreply rr
        INNER JOIN pppoe_users pu ON pu.username = rr.username
        WHERE pu.status IN ('blocked', 'stop')
          AND rr.attribute = 'Reply-Message'
      `
      await prisma.$executeRaw`
        INSERT INTO radreply (username, attribute, op, value)
        SELECT pu.username, 'Reply-Message', ':=', 'Akun Diblokir - Hubungi Admin'
        FROM pppoe_users pu
        WHERE pu.status IN ('blocked', 'stop')
      `
    } catch (enforceErr: any) {
      console.error('[PPPoE Auto-Isolir] Failed to enforce blocked/stop reject rules:', enforceErr?.message)
    }

    // Best-effort: disconnect any PPPoE sessions that are still active for blocked/stop users
    try {
      const stillOnlineBlocked = await prisma.$queryRaw<Array<{ username: string }>>`
        SELECT DISTINCT ra.username
        FROM radacct ra
        INNER JOIN pppoe_users pu ON pu.username = ra.username
        WHERE pu.status IN ('blocked', 'stop')
          AND ra.acctstoptime IS NULL
        LIMIT 50
      `

      for (const s of stillOnlineBlocked) {
        // Use CoA disconnect (handles DB + CoA + API fallback internally)
        try {
          const { disconnectPPPoEUser } = await import('@/server/services/radius/coa-handler.service')
          await disconnectPPPoEUser(s.username)
        } catch {}

        // Ensure radacct is closed regardless of disconnect method success
        await prisma.$executeRaw`
          UPDATE radacct
          SET acctstoptime = NOW(),
              acctterminatecause = 'Admin-Reset'
          WHERE username = ${s.username}
            AND acctstoptime IS NULL
        `
      }
    } catch (cleanupErr: any) {
      console.error('[PPPoE Auto-Isolir] Failed to cleanup active sessions for blocked/stop users:', cleanupErr?.message)
    }

    // Find active users with expiredAt before today minus grace period
    // gracePeriodDays=0 → isolate same day as expiry
    // gracePeriodDays=3 → give 3 extra days before isolation
    const expiredUsers = await prisma.$queryRaw<Array<{
      id: string
      username: string
      password: string
      status: string
      expiredAt: Date
      profileId: string
    }>>`
      SELECT id, username, password, status, expiredAt, profileId
      FROM pppoe_users
      WHERE status = 'active'
        AND expiredAt < DATE_SUB(CURDATE(), INTERVAL ${gracePeriodDays} DAY)
        AND autoIsolationEnabled = true
    `

    if (expiredUsers.length === 0) {
      console.log('[PPPoE Auto-Isolir] No expired users found')
      
      const duration = new Date().getTime() - startedAt.getTime()
      await prisma.cronHistory.update({
        where: { id: history.id },
        data: {
          status: 'success',
          result: 'No expired users found',
          duration,
          completedAt: new Date(),
        },
      })
      
      return { success: true, isolated: 0 }
    }

    console.log(`[PPPoE Auto-Isolir] Found ${expiredUsers.length} expired user(s) to isolate`)

    let isolatedCount = 0

    for (const user of expiredUsers) {
      try {
        // 1. Update user status to isolated (not suspended!)
        await prisma.pppoeUser.update({
          where: { id: user.id },
          data: { status: 'isolated' },
        })

        // 2. Keep password in radcheck (ALLOW LOGIN!)
        await prisma.$executeRaw`
          INSERT INTO radcheck (username, attribute, op, value)
          VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password})
          ON DUPLICATE KEY UPDATE value = ${user.password}
        `

        // 2b. REMOVE Auth-Type Reject (allow login for isolation!)
        await prisma.$executeRaw`
          DELETE FROM radcheck 
          WHERE username = ${user.username} 
            AND attribute = 'Auth-Type'
        `

        // Remove reject message (allow login)
        await prisma.$executeRaw`
          DELETE FROM radreply 
          WHERE username = ${user.username} 
            AND attribute = 'Reply-Message'
        `

        // 3. Move to isolir group (kept for tracking/config)
        await prisma.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${user.username}
        `
        await prisma.$executeRaw`
          INSERT INTO radusergroup (username, groupname, priority)
          VALUES (${user.username}, 'isolir', 1)
        `

        // 4. Remove static IP (user will get IP from pool-isolir)
        await prisma.$executeRaw`
          DELETE FROM radreply 
          WHERE username = ${user.username} 
            AND attribute = 'Framed-IP-Address'
        `

        // 5. Disconnect user — disconnectPPPoEUser handles API-first (Method 1) + CoA (Method 2)
        try {
          const { disconnectPPPoEUser } = await import('@/server/services/radius/coa-handler.service')
          const disconnectResult = await disconnectPPPoEUser(user.username)
          console.log(
            `[PPPoE Auto-Isolir] Disconnect ${user.username}: API=${disconnectResult.apiSuccess}, CoA=${disconnectResult.coaSuccess}`
          )
        } catch (disconnectError: any) {
          console.error(`[PPPoE Auto-Isolir] ❌ Disconnect failed for ${user.username}:`, disconnectError.message)
        }

        // Close session in radacct
        await prisma.$executeRaw`
          UPDATE radacct 
          SET acctstoptime = NOW(), 
              acctterminatecause = 'Admin-Reset'
          WHERE username = ${user.username} 
            AND acctstoptime IS NULL
        `
        console.log(`[PPPoE Auto-Isolir] 📝 Session closed in radacct for ${user.username}`)

        isolatedCount++
        console.log(
          `✅ [PPPoE Auto-Isolir] User ${user.username} isolated (expired: ${
            user.expiredAt ? new Date(user.expiredAt).toISOString().split('T')[0] : 'N/A'
          })`
        )

        // Create individual user isolation notification
        try {
          const { NotificationService } = await import('@/server/services/notifications/dispatcher.service')
          await NotificationService.notifyUserIsolated({
            username: user.username,
            reason: 'expired'
          })
        } catch (notifError: any) {
          console.error(`[PPPoE Auto-Isolir] Failed to create notification for ${user.username}:`, notifError.message)
        }
      } catch (error: any) {
        console.error(`❌ [PPPoE Auto-Isolir] Failed to isolate ${user.username}:`, error.message)
      }
    }

    const duration = new Date().getTime() - startedAt.getTime()
    const message = `Isolated ${isolatedCount}/${expiredUsers.length} users`
    
    await prisma.cronHistory.update({
      where: { id: history.id },
      data: {
        status: 'success',
        result: message,
        duration,
        completedAt: new Date(),
      },
    })

    console.log(`[PPPoE Auto-Isolir] ✅ Completed: ${message}`)

    // Create bulk isolation notification
    if (isolatedCount > 0) {
      try {
        const { NotificationService } = await import('@/server/services/notifications/dispatcher.service')
        await NotificationService.notifyBulkUserIsolation(isolatedCount)
      } catch (notifError: any) {
        console.error('[PPPoE Auto-Isolir] Failed to create bulk notification:', notifError.message)
      }
    }

    return { 
      success: true, 
      isolated: isolatedCount 
    }
  } catch (error: any) {
    console.error('[PPPoE Auto-Isolir] ❌ Error:', error)
    
    if (history) {
      const duration = new Date().getTime() - startedAt.getTime()
      await prisma.cronHistory.update({
        where: { id: history.id },
        data: {
          status: 'failed',
          result: `Error: ${error.message}`,
          duration,
          completedAt: new Date(),
        },
      }).catch(() => {})
    }
    
    return { success: false, isolated: 0, error: error.message }
  } finally {
    isPPPoESyncRunning = 0
  }
}
