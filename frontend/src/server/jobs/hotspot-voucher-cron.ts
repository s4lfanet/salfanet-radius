import 'server-only'
import { prisma } from '@/server/db/client'
import { nanoid } from 'nanoid'
import { sendCoADisconnect } from '@/server/services/radius/coa-handler.service'
import { sseManager } from '@/server/services/sse-manager.service'
import { nowWIB, setCurrentTimezone, getCurrentTimezone } from '@/lib/timezone'
import { RouterOSAPI } from 'node-routeros'

/**
 * Disconnect hotspot user via MikroTik API (more reliable than CoA for hotspot)
 */
async function disconnectHotspotViaAPI(
  username: string,
  nas: { ipAddress?: string | null; nasname: string; port?: number | null; username: string; password: string; secret: string; name: string },
  sessionId?: string,
  framedIp?: string | null,
): Promise<boolean> {
  const host = nas.ipAddress || nas.nasname
  const port = nas.port || 8728
  try {
    const api = new RouterOSAPI({ host, port, user: nas.username, password: nas.password, timeout: 10 })
    await api.connect()
    let activeUsers = await api.write('/ip/hotspot/active/print', [`?user=${username}`])
    if (activeUsers.length === 0) {
      const allUsers = await api.write('/ip/hotspot/active/print')
      activeUsers = allUsers.filter((u: any) => u.user === username || u.username === username || u.name === username)
    }
    for (const user of activeUsers) {
      await api.write('/ip/hotspot/active/remove', [`=.id=${user['.id']}`])
      console.log(`[Voucher Cron] ?? Disconnected ${username} via MikroTik API (.id=${user['.id']})`)
    }
    await api.close()
    return activeUsers.length > 0
  } catch (apiErr: any) {
    console.log(`[Voucher Cron] MikroTik API failed for ${username}: ${apiErr.message}, falling back to CoA`)
    try {
      const coaResult = await sendCoADisconnect(username, host, nas.secret, sessionId, framedIp || undefined)
      return coaResult.success
    } catch { return false }
  }
}

let isVoucherCronRunning = false

/**
 * ============================================================
 * HOTSPOT VOUCHER LIFECYCLE CRON JOB
 * ============================================================
 * 
 * Workflow Voucher Hotspot:
 * 
 * 1. CREATED ? Status: WAITING
 *    - Voucher baru dibuat dengan status WAITING
 *    - Sudah sync ke radcheck/radusergroup/radgroupreply
 *    - Session-Timeout diset berdasarkan validityValue profil
 * 
 * 2. WAITING ? ACTIVE (First Login Detection)
 *    - Cron check radacct untuk session baru
 *    - Jika ditemukan acctstarttime ? voucher sedang digunakan
 *    - Update: firstLoginAt = firstSession, expiresAt = firstLoginAt + validity
 *    - Status berubah ke ACTIVE
 * 
 * 3. ACTIVE ? EXPIRED (Expiration Check)
 *    - Cron check expiresAt < NOW()
 *    - Atau total acctsessiontime >= usageDuration (jika ada limit durasi)
 *    - Status berubah ke EXPIRED
 *    - HAPUS dari radcheck/radusergroup/radgroupreply
 *    - Mark active session di radacct (acctstoptime = NOW)
 * 
 * Runs every 1 minute
 */

interface VoucherCronResult {
  success: boolean
  activated: number
  expired: number
  sessionsMarked: number
  cleanedUp: number
  message?: string
  error?: string
}

export async function runHotspotVoucherCron(): Promise<VoucherCronResult> {
  // Prevent concurrent execution
  if (isVoucherCronRunning) {
    console.log('[Voucher Cron] Already running, skipping...')
    return { 
      success: false, 
      activated: 0, 
      expired: 0, 
      sessionsMarked: 0,
      cleanedUp: 0,
      error: 'Already running' 
    }
  }

  isVoucherCronRunning = true
  const startedAt = new Date()
  console.log('[Voucher Cron] ========== Starting ==========')
  console.log(`[Voucher Cron] Time: ${startedAt.toISOString()}`)

  // Load company timezone settings
  try {
    const company = await prisma.company.findFirst({
      select: { timezone: true }
    })
    if (company?.timezone) {
      setCurrentTimezone(company.timezone)
      console.log(`[Voucher Cron] Using timezone: ${company.timezone}`)
    }
  } catch (err) {
    console.log('[Voucher Cron] Failed to load timezone, using default')
  }

  // Get current time in configured timezone
  const now = nowWIB()
  console.log(`[Voucher Cron] Current time (${getCurrentTimezone()}): ${now.toISOString()}`)

  // Create history record
  const history = await prisma.cronHistory.create({
    data: {
      id: nanoid(),
      jobType: 'hotspot_voucher_lifecycle',
      status: 'running',
      startedAt,
    },
  })

  let activatedCount = 0
  let expiredCount = 0
  let sessionsMarkedCount = 0
  let cleanedUpCount = 0

  try {
    // ========================================
    // PHASE 1: WAITING ? ACTIVE (First Login Detection)
    // ========================================
    console.log('[Voucher Cron] Phase 1: Checking WAITING vouchers for first login...')
    
    const waitingVouchers = await prisma.hotspotVoucher.findMany({
      where: { status: 'WAITING' },
      include: { profile: true },
    })

    console.log(`[Voucher Cron] Found ${waitingVouchers.length} WAITING vouchers`)

    for (const voucher of waitingVouchers) {
      // Check if voucher has a session in radacct (first login)
      const firstSession = await prisma.radacct.findFirst({
        where: {
          username: voucher.code,
          acctstarttime: { not: null },
        },
        orderBy: { acctstarttime: 'asc' },
      })

      if (firstSession && firstSession.acctstarttime) {
        // Calculate expiry based on first login
        const firstLoginAt = firstSession.acctstarttime instanceof Date 
          ? firstSession.acctstarttime 
          : new Date(firstSession.acctstarttime)

        let expiresAtMs = firstLoginAt.getTime()

        // Add validity time based on profile
        switch (voucher.profile.validityUnit) {
          case 'MINUTES':
            expiresAtMs += voucher.profile.validityValue * 60 * 1000
            break
          case 'HOURS':
            expiresAtMs += voucher.profile.validityValue * 60 * 60 * 1000
            break
          case 'DAYS':
            expiresAtMs += voucher.profile.validityValue * 24 * 60 * 60 * 1000
            break
          case 'MONTHS':
            const expiresDate = new Date(firstLoginAt)
            expiresDate.setMonth(expiresDate.getMonth() + voucher.profile.validityValue)
            expiresAtMs = expiresDate.getTime()
            break
        }

        const expiresAt = new Date(expiresAtMs)

        // Update voucher to ACTIVE (correct enum value)
        await prisma.hotspotVoucher.update({
          where: { id: voucher.id },
          data: {
            status: 'ACTIVE',
            firstLoginAt: firstLoginAt,
            expiresAt: expiresAt,
          },
        })

        activatedCount++
        console.log(`[Voucher Cron] ? ${voucher.code} activated: login=${firstLoginAt.toISOString()}, expires=${expiresAt.toISOString()}`)
      }
    }

    // ========================================
    // PHASE 2: ACTIVE ? EXPIRED (Expiration Check)
    // ========================================
    console.log('[Voucher Cron] Phase 2: Checking ACTIVE vouchers for expiration...')

    // Method A: Expired by validity time (expiresAt)
    // Use raw SQL to leverage MySQL's NOW() which respects database timezone
    const expiredByValidity = await prisma.$queryRaw<Array<{
      id: string
      code: string
      status: string
      expiresAt: Date | null
      profileId: string
      routerId: string | null
    }>>`
      SELECT v.id, v.code, v.status, v.expiresAt, v.profileId, v.routerId
      FROM hotspot_vouchers v
      WHERE v.status = 'ACTIVE'
      AND v.expiresAt IS NOT NULL
      AND v.expiresAt <= NOW()
    `
    
    console.log(`[Voucher Cron] Found ${expiredByValidity.length} expired by validity time (using MySQL NOW())`)
    
    // Log each expired voucher for debugging
    for (const voucher of expiredByValidity) {
      console.log(`[Voucher Cron] ${voucher.code}: expiresAt=${voucher.expiresAt} <= NOW()`)
    }

    // Method B: Expired by usage duration (total session time >= usageDuration)
    const activeVouchersWithDuration = await prisma.hotspotVoucher.findMany({
      where: {
        status: 'ACTIVE',
        profile: { usageDuration: { not: null } },
      },
      include: { profile: true, router: true },
    })

    const expiredByDuration: typeof activeVouchersWithDuration = []
    
    for (const voucher of activeVouchersWithDuration) {
      if (!voucher.profile.usageDuration) continue

      // Convert to seconds (usageDuration stored in hours)
      const maxDurationSeconds = voucher.profile.usageDuration * 3600

      // Sum all session times
      const totalUsage = await prisma.radacct.aggregate({
        where: { username: voucher.code },
        _sum: { acctsessiontime: true },
      })

      const usedSeconds = totalUsage._sum.acctsessiontime || 0

      if (usedSeconds >= maxDurationSeconds) {
        // Check not already in expiredByValidity
        if (!expiredByValidity.find(v => v.id === voucher.id)) {
          expiredByDuration.push(voucher)
          console.log(`[Voucher Cron] ${voucher.code} expired by duration: ${usedSeconds}s >= ${maxDurationSeconds}s`)
        }
      }
    }

    console.log(`[Voucher Cron] Found ${expiredByDuration.length} expired by duration`)

    // Combine all expired vouchers (from raw SQL + duration check)
    const allExpiredVoucherIds = [
      ...expiredByValidity.map(v => v.id),
      ...expiredByDuration.map(v => v.id)
    ]
    
    // Fetch full voucher data with relations for processing
    const allExpiredVouchers = await prisma.hotspotVoucher.findMany({
      where: { id: { in: allExpiredVoucherIds } },
      include: { profile: true, router: true }
    })

    console.log(`[Voucher Cron] Total expired vouchers to process: ${allExpiredVouchers.length}`)

    for (const voucher of allExpiredVouchers) {
      try {
        // 1. Update status to EXPIRED
        await prisma.hotspotVoucher.update({
          where: { id: voucher.id },
          data: { status: 'EXPIRED' },
        })

        // 2. Remove from RADIUS tables (prevent re-login)
        const userGroup = await prisma.radusergroup.findFirst({
          where: { username: voucher.code },
          select: { groupname: true },
        })

        await prisma.radcheck.deleteMany({
          where: { username: voucher.code },
        })

        await prisma.radusergroup.deleteMany({
          where: { username: voucher.code },
        })

        if (userGroup?.groupname) {
          await prisma.radgroupreply.deleteMany({
            where: { groupname: userGroup.groupname },
          })
        }

        // 3. Mark any active sessions as stopped in radacct + Send CoA Disconnect
        const activeSessions = await prisma.radacct.findMany({
          where: {
            username: voucher.code,
            acctstoptime: null,
          },
        })

        for (const session of activeSessions) {
          // Calculate session duration using WIB time (matches DB timestamps)
          const stopTime = nowWIB()
          let sessionDuration = 0
          if (session.acctstarttime) {
            const startTime = session.acctstarttime instanceof Date 
              ? session.acctstarttime 
              : new Date(session.acctstarttime)
            sessionDuration = Math.floor((stopTime.getTime() - startTime.getTime()) / 1000)
          }
          
          // Ensure duration is positive and within UnsignedInt range (max ~49 days in seconds)
          if (sessionDuration < 0) sessionDuration = 0
          if (sessionDuration > 4294967295) sessionDuration = 4294967295

          // Mark session stopped in database (use WIB time)
          await prisma.radacct.update({
            where: { radacctid: session.radacctid },
            data: {
              acctstoptime: stopTime,
              acctterminatecause: 'Session-Timeout',
              acctsessiontime: sessionDuration,
            },
          })

          // Disconnect from MikroTik via API (more reliable than CoA for hotspot)
          try {
            let nas = await prisma.router.findFirst({
              where: {
                OR: [
                  { nasname: session.nasipaddress },
                  { ipAddress: session.nasipaddress },
                ],
              },
            })
            if (!nas) nas = await prisma.router.findFirst({ where: { isActive: true } })

            if (nas) {
              await disconnectHotspotViaAPI(
                voucher.code, nas,
                session.acctsessionid,
                session.framedipaddress
              )
            }
          } catch (disconnectErr: any) {
            console.error(`[Voucher Cron] ??  Disconnect failed for ${voucher.code}:`, disconnectErr.message)
          }

          sessionsMarkedCount++
          console.log(`[Voucher Cron] ?? Session ${voucher.code} marked stopped (${sessionDuration}s)`)
        }

        expiredCount++
        console.log(`[Voucher Cron] ? ${voucher.code} EXPIRED and removed from RADIUS`)

      } catch (err: any) {
        console.error(`[Voucher Cron] ? Error processing ${voucher.code}:`, err.message)
      }
    }

    // ========================================
    // PHASE 3: Cleanup Already EXPIRED Vouchers Still in RADIUS
    // ========================================
    console.log('[Voucher Cron] Phase 3: Cleanup stale EXPIRED vouchers from RADIUS...')

    const alreadyExpiredVouchers = await prisma.hotspotVoucher.findMany({
      where: { status: 'EXPIRED' },
      select: { code: true },
    })

    for (const voucher of alreadyExpiredVouchers) {
      // Check if still in radcheck
      const inRadcheck = await prisma.radcheck.findFirst({
        where: { username: voucher.code },
      })

      if (inRadcheck) {
        const userGroup = await prisma.radusergroup.findFirst({
          where: { username: voucher.code },
          select: { groupname: true },
        })

        await prisma.radcheck.deleteMany({
          where: { username: voucher.code },
        })

        await prisma.radusergroup.deleteMany({
          where: { username: voucher.code },
        })

        if (userGroup?.groupname) {
          await prisma.radgroupreply.deleteMany({
            where: { groupname: userGroup.groupname },
          })
        }

        cleanedUpCount++
        console.log(`[Voucher Cron] ?? ${voucher.code} cleaned from RADIUS (stale)`)
      }

      // Also check for any stale active sessions
      const staleSessions = await prisma.radacct.findMany({
        where: {
          username: voucher.code,
          acctstoptime: null,
        },
      })

      for (const session of staleSessions) {
        // Disconnect from MikroTik API FIRST (before marking session stopped)
        try {
          let nas = await prisma.router.findFirst({
            where: {
              OR: [
                { nasname: session.nasipaddress },
                { ipAddress: session.nasipaddress },
              ],
            },
          })
          if (!nas) nas = await prisma.router.findFirst({ where: { isActive: true } })

          if (nas) {
            await disconnectHotspotViaAPI(
              voucher.code, nas,
              session.acctsessionid,
              session.framedipaddress
            )
            console.log(`[Voucher Cron] ?? Disconnected stale session ${voucher.code} via MikroTik API`)
          } else {
            console.log(`[Voucher Cron] ??  NAS not found for ${session.nasipaddress}`)
          }
        } catch (disconnectErr: any) {
          console.error(`[Voucher Cron] ??  Disconnect failed for stale ${voucher.code}:`, disconnectErr.message)
        }

        // Then mark session stopped with WIB time
        const stopTime = nowWIB()
        let sessionDuration = 0
        if (session.acctstarttime) {
          const startTime = session.acctstarttime instanceof Date 
            ? session.acctstarttime 
            : new Date(session.acctstarttime)
          sessionDuration = Math.floor((stopTime.getTime() - startTime.getTime()) / 1000)
        }
        
        // Ensure duration is positive and within UnsignedInt range
        if (sessionDuration < 0) sessionDuration = 0
        if (sessionDuration > 4294967295) sessionDuration = 4294967295

        // Mark stale session stopped (use WIB time)
        await prisma.radacct.update({
          where: { radacctid: session.radacctid },
          data: {
            acctstoptime: stopTime,
            acctterminatecause: 'Admin-Reset',
            acctsessiontime: sessionDuration,
          },
        })

        sessionsMarkedCount++
        console.log(`[Voucher Cron] ?? Stale session ${voucher.code} marked stopped (${sessionDuration}s)`)
      }
    }

    // ========================================
    // Complete
    // ========================================
    const completedAt = new Date()
    const duration = completedAt.getTime() - startedAt.getTime()

    await prisma.cronHistory.update({
      where: { id: history.id },
      data: {
        status: 'success',
        completedAt,
        duration,
        result: JSON.stringify({
          activated: activatedCount,
          expired: expiredCount,
          sessionsMarked: sessionsMarkedCount,
          cleanedUp: cleanedUpCount,
        }),
      },
    })

    console.log(`[Voucher Cron] ========== Completed in ${duration}ms ==========`)
    console.log(`[Voucher Cron] Activated: ${activatedCount}, Expired: ${expiredCount}, Sessions Marked: ${sessionsMarkedCount}, Cleaned: ${cleanedUpCount}`)

    // Broadcast SSE event if there are changes
    if (activatedCount > 0 || expiredCount > 0 || cleanedUpCount > 0) {
      try {
        // Get updated stats for broadcast
        const [totalAll, waitingCount, activeCount, expiredTotal] = await Promise.all([
          prisma.hotspotVoucher.count(),
          prisma.hotspotVoucher.count({ where: { status: 'WAITING' } }),
          prisma.hotspotVoucher.count({ where: { status: 'ACTIVE' } }),
          prisma.hotspotVoucher.count({ where: { status: 'EXPIRED' } }),
        ])

        const vouchersForValue = await prisma.hotspotVoucher.findMany({
          include: { profile: { select: { sellingPrice: true } } },
        })
        const totalValue = vouchersForValue.reduce((sum: number, v: any) => sum + v.profile.sellingPrice, 0)

        // Broadcast stats update
        sseManager.broadcast('voucher-updates', 'voucher-stats', {
          stats: {
            total: totalAll,
            waiting: waitingCount,
            active: activeCount,
            expired: expiredTotal,
            totalValue,
          },
          changes: {
            activated: activatedCount,
            expired: expiredCount,
            cleaned: cleanedUpCount,
          },
          timestamp: new Date().toISOString(),
        })

        // Broadcast voucher changed event
        sseManager.broadcast('voucher-updates', 'voucher-changed', {
          hasChanges: true,
          needsRefresh: true,
          timestamp: new Date().toISOString(),
        })

        console.log('[Voucher Cron] ?? SSE broadcast sent')
      } catch (sseError: any) {
        console.error('[Voucher Cron] ??  SSE broadcast failed:', sseError.message)
        // Don't fail the cron if SSE fails
      }
    }

    return {
      success: true,
      activated: activatedCount,
      expired: expiredCount,
      sessionsMarked: sessionsMarkedCount,
      cleanedUp: cleanedUpCount,
      message: `Done in ${duration}ms`,
    }

  } catch (error: any) {
    console.error('[Voucher Cron] ? Fatal error:', error)

    const completedAt = new Date()
    await prisma.cronHistory.update({
      where: { id: history.id },
      data: {
        status: 'error',
        completedAt,
        duration: completedAt.getTime() - startedAt.getTime(),
        error: error.message,
      },
    })

    return {
      success: false,
      activated: activatedCount,
      expired: expiredCount,
      sessionsMarked: sessionsMarkedCount,
      cleanedUp: cleanedUpCount,
      error: error.message,
    }

  } finally {
    isVoucherCronRunning = false
  }
}

/**
 * Sync voucher to RADIUS when created
 * Called when generating vouchers
 */
export async function syncVoucherToRadius(voucherId: string): Promise<{ success: boolean; groupName?: string; error?: string }> {
  try {
    const voucher = await prisma.hotspotVoucher.findUnique({
      where: { id: voucherId },
      include: { profile: true },
    })

    if (!voucher) {
      return { success: false, error: 'Voucher not found' }
    }

    // Generate unique group name per voucher (prevents shared group conflicts)
    const profileName = voucher.profile.name.toLowerCase().replace(/[^a-z0-9]/g, '')
    const uniqueGroupName = `hs-${profileName}-${voucher.code}`

    // MikroTik profile name
    const mikrotikProfile = voucher.profile.groupProfile || voucher.profile.name

    // 1. Add to radcheck (username = code, password = code or custom password)
    const passwordValue = voucher.password || voucher.code
    await prisma.radcheck.upsert({
      where: {
        username_attribute: {
          username: voucher.code,
          attribute: 'Cleartext-Password',
        },
      },
      create: {
        username: voucher.code,
        attribute: 'Cleartext-Password',
        op: ':=',
        value: passwordValue,
      },
      update: {
        value: passwordValue,
      },
    })

    // 2. Add to radusergroup
    await prisma.radusergroup.upsert({
      where: {
        username_groupname: {
          username: voucher.code,
          groupname: uniqueGroupName,
        },
      },
      create: {
        username: voucher.code,
        groupname: uniqueGroupName,
        priority: 1,
      },
      update: {
        priority: 1,
      },
    })

    // 3. Create radgroupreply entries
    await prisma.radgroupreply.deleteMany({
      where: { groupname: uniqueGroupName },
    })

    // Use the speed string directly from profile (format: "10M/10M" or "5M/5M 10M/10M ...")
    const rateLimit = voucher.profile.speed

    // Calculate session timeout in seconds
    let sessionTimeout = 0
    switch (voucher.profile.validityUnit) {
      case 'MINUTES':
        sessionTimeout = voucher.profile.validityValue * 60
        break
      case 'HOURS':
        sessionTimeout = voucher.profile.validityValue * 3600
        break
      case 'DAYS':
        sessionTimeout = voucher.profile.validityValue * 86400
        break
      case 'MONTHS':
        sessionTimeout = voucher.profile.validityValue * 30 * 86400
        break
    }

    // Add RADIUS attributes
    await prisma.radgroupreply.createMany({
      data: [
        {
          groupname: uniqueGroupName,
          attribute: 'Mikrotik-Group',
          op: ':=',
          value: mikrotikProfile,
        },
        {
          groupname: uniqueGroupName,
          attribute: 'Mikrotik-Rate-Limit',
          op: ':=',
          value: rateLimit,
        },
        {
          groupname: uniqueGroupName,
          attribute: 'Session-Timeout',
          op: ':=',
          value: sessionTimeout.toString(),
        },
        {
          groupname: uniqueGroupName,
          attribute: 'Simultaneous-Use',
          op: ':=',
          value: voucher.profile.sharedUsers.toString(),
        },
      ],
    })

    console.log(`[RADIUS Sync] ? ${voucher.code} synced to RADIUS (group: ${uniqueGroupName})`)
    return { success: true, groupName: uniqueGroupName }

  } catch (error: any) {
    console.error('[RADIUS Sync] ? Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Remove voucher from RADIUS (for manual deletion)
 */
export async function removeVoucherFromRadius(code: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Get groupname first
    const userGroup = await prisma.radusergroup.findFirst({
      where: { username: code },
      select: { groupname: true },
    })

    // Delete from radcheck
    await prisma.radcheck.deleteMany({
      where: { username: code },
    })

    // Delete from radusergroup
    await prisma.radusergroup.deleteMany({
      where: { username: code },
    })

    // Delete from radgroupreply
    if (userGroup?.groupname) {
      await prisma.radgroupreply.deleteMany({
        where: { groupname: userGroup.groupname },
      })
    }

    console.log(`[RADIUS Sync] ??? ${code} removed from RADIUS`)
    return { success: true }

  } catch (error: any) {
    console.error('[RADIUS Sync] ? Error removing:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Sync entire batch of vouchers to RADIUS
 */
export async function syncBatchToRadius(batchCode: string): Promise<{
  total: number
  success: number
  failed: number
  errors: Array<{ code: string; error: string }>
}> {
  const vouchers = await prisma.hotspotVoucher.findMany({
    where: { batchCode },
    select: { id: true, code: true },
  })

  let successCount = 0
  const errors: Array<{ code: string; error: string }> = []

  for (const voucher of vouchers) {
    const result = await syncVoucherToRadius(voucher.id)
    if (result.success) {
      successCount++
    } else {
      errors.push({ code: voucher.code, error: result.error || 'Unknown error' })
    }
  }

  return {
    total: vouchers.length,
    success: successCount,
    failed: errors.length,
    errors,
  }
}
