import 'server-only'
import { RouterOSAPI } from 'node-routeros'
import { prisma } from '@/server/db/client'

export interface VoucherSyncResult {
  success: boolean
  routerId: string
  routerName: string
  voucherCode: string
  message: string
}

export interface BatchVoucherSyncResult {
  total: number
  success: number
  failed: number
  results: VoucherSyncResult[]
}

export interface VoucherStatusSyncResult {
  routerId: string
  routerName: string
  updated: number
  errors: string[]
}

/**
 * Get MikroTik connection config from router record.
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
 * Create a MikroTik API connection with timeout.
 */
async function connectMikrotik(router: Awaited<ReturnType<typeof getLocalRouterConfig>>): Promise<{ api: any; menu: any }> {
  if (!router) throw new Error('Router config not available')

  const host = router.ipAddress || router.nasname
  const apiPort = router.port || 8728

  const api = new RouterOSAPI({
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

  return { api, menu: api.write.bind(api) }
}

/**
 * Safe wrapper for MikroTik API write calls.
 * Handles node-routeros quirks like !empty replies and timeout exceptions.
 * Returns empty array on !empty (no results) instead of throwing.
 *
 * NOTE: node-routeros throws !empty as an uncaughtException (not a catchable
 * promise rejection), so safeWrite alone is not sufficient. We also install
 * a global uncaughtException filter at module load time (see below).
 */
async function safeWrite(menu: any, command: string, params?: string[]): Promise<any[]> {
  try {
    const result = await menu(command, params || [])
    return Array.isArray(result) ? result : []
  } catch (e: any) {
    // !empty reply means no results matched the filter — not an error
    if (e?.errno === 'UNKNOWNREPLY' || String(e?.message || '').includes('!empty') || String(e?.message || '').includes('unknown reply')) {
      return []
    }
    throw e
  }
}

/**
 * Global uncaughtException filter for node-routeros !empty errors.
 * node-routeros throws these from event handlers, bypassing try/catch.
 * We must intercept them at the process level to prevent crashes.
 */
let _uncaughtHandlerInstalled = false
function ensureUncaughtHandler() {
  if (_uncaughtHandlerInstalled) return
  _uncaughtHandlerInstalled = true
  process.on('uncaughtException', (err: any) => {
    if (err?.errno === 'UNKNOWNREPLY' || String(err?.message || '').includes('!empty') || String(err?.message || '').includes('unknown reply')) {
      // Swallow !empty — it just means no results matched a filter query
      return
    }
    // Re-throw other uncaught exceptions
    throw err
  })
}

/**
 * Sync a single voucher to a MikroTik local-only router.
 * Creates or updates the hotspot user in MikroTik.
 */
export async function syncVoucherToMikrotik(
  routerId: string,
  voucherId: string,
): Promise<VoucherSyncResult> {
  const router = await getLocalRouterConfig(routerId)
  if (!router) {
    return {
      success: false,
      routerId,
      routerName: 'unknown',
      voucherCode: '',
      message: 'Router not found, not local mode, or missing credentials',
    }
  }

  const voucher = await prisma.hotspotVoucher.findUnique({
    where: { id: voucherId },
    include: { profile: true, agent: true },
  })

  if (!voucher) {
    return {
      success: false,
      routerId,
      routerName: router.name,
      voucherCode: '',
      message: 'Voucher not found',
    }
  }

  let api: any
  try {
    ensureUncaughtHandler()
    const { api: a, menu } = await connectMikrotik(router)
    api = a

    const profileName = voucher.profile.name
    const password = voucher.password || voucher.code
    const comment = voucher.agent
      ? `salfanet:${voucher.agent.phone}-${voucher.agent.name}`
      : 'salfanet:admin'

    // Fetch all users and filter in JS (avoids !empty exception from filter queries)
    const allUsers = await safeWrite(menu, '/ip/hotspot/user/print')
    const existing = allUsers.find((u) => u.name === voucher.code)

    if (existing) {
      // Update existing user
      const id = existing['.id'] || existing.id
      await menu('/ip/hotspot/user/set', [
        `=.id=${id}`,
        `=password=${password}`,
        `=profile=${profileName}`,
        `=comment=${comment}`,
      ])
      return {
        success: true,
        routerId,
        routerName: router.name,
        voucherCode: voucher.code,
        message: 'Updated existing hotspot user',
      }
    }

    // Create new hotspot user
    const userData: string[] = [
      `=name=${voucher.code}`,
      `=password=${password}`,
      `=profile=${profileName}`,
      `=comment=${comment}`,
    ]

    await menu('/ip/hotspot/user/add', userData)

    return {
      success: true,
      routerId,
      routerName: router.name,
      voucherCode: voucher.code,
      message: 'Created hotspot user',
    }
  } catch (e: any) {
    const msg = e?.message || String(e)
    console.error(`[HOTSPOT_VOUCHER] sync for "${voucher.code}" on router ${router.name}:`, msg)
    return {
      success: false,
      routerId,
      routerName: router.name,
      voucherCode: voucher.code,
      message: msg,
    }
  } finally {
    try { if (api) await api.close() } catch { /* ignore */ }
  }
}

/**
 * Sync a voucher to its assigned router (if local-only).
 * If voucher has no routerId, syncs to all local-only routers.
 */
export async function syncVoucherToAssignedRouter(voucherId: string): Promise<BatchVoucherSyncResult> {
  const voucher = await prisma.hotspotVoucher.findUnique({
    where: { id: voucherId },
    select: { routerId: true },
  })

  if (!voucher) {
    return { total: 0, success: 0, failed: 0, results: [] }
  }

  // If voucher has a specific router, sync to that router only
  if (voucher.routerId) {
    const result = await syncVoucherToMikrotik(voucher.routerId, voucherId)
    return {
      total: 1,
      success: result.success ? 1 : 0,
      failed: result.success ? 0 : 1,
      results: [result],
    }
  }

  // No specific router — sync to all local-only routers
  const routers = await getLocalRouters()
  const results: VoucherSyncResult[] = []

  for (const router of routers) {
    const result = await syncVoucherToMikrotik(router.id, voucherId)
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
 * Sync a batch of vouchers to MikroTik local-only routers.
 */
export async function syncBatchVouchersToMikrotik(batchCode: string): Promise<BatchVoucherSyncResult> {
  const vouchers = await prisma.hotspotVoucher.findMany({
    where: { batchCode },
    select: { id: true, routerId: true },
  })

  const results: VoucherSyncResult[] = []

  for (const voucher of vouchers) {
    const result = await syncVoucherToAssignedRouter(voucher.id)
    results.push(...result.results)
  }

  return {
    total: results.length,
    success: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  }
}

/**
 * Remove a voucher from a MikroTik local-only router.
 */
export async function removeVoucherFromMikrotik(
  routerId: string,
  voucherCode: string,
): Promise<VoucherSyncResult> {
  const router = await getLocalRouterConfig(routerId)
  if (!router) {
    return {
      success: false,
      routerId,
      routerName: 'unknown',
      voucherCode,
      message: 'Router not found, not local mode, or missing credentials',
    }
  }

  let api: any
  try {
    ensureUncaughtHandler()
    console.log(`[MT_REMOVE] Connecting to router ${router.name} (${router.ipAddress}:${router.port}) for voucher ${voucherCode}`)
    const { api: a, menu } = await connectMikrotik(router)
    api = a

    // Fetch all users and filter in JS (avoids !empty exception from filter queries)
    const allUsers = await safeWrite(menu, '/ip/hotspot/user/print')
    const existing = allUsers.find((u) => u.name === voucherCode)

    if (!existing) {
      console.log(`[MT_REMOVE] Voucher ${voucherCode} not found on ${router.name} — already absent`)
      return {
        success: true,
        routerId,
        routerName: router.name,
        voucherCode,
        message: 'Already absent',
      }
    }

    const id = existing['.id'] || existing.id

    // Remove active sessions — fetch all and filter in JS
    try {
      const allActive = await safeWrite(menu, '/ip/hotspot/active/print')
      const activeSessions = allActive.filter((s) => s.user === voucherCode)
      for (const session of activeSessions) {
        await menu('/ip/hotspot/active/remove', [`=.id=${session['.id']}`])
      }
    } catch { /* ignore */ }

    // Remove cookies — fetch all and filter in JS
    try {
      const allCookies = await safeWrite(menu, '/ip/hotspot/cookie/print')
      const cookies = allCookies.filter((c) => c.user === voucherCode)
      for (const cookie of cookies) {
        await menu('/ip/hotspot/cookie/remove', [`=.id=${cookie['.id']}`])
      }
    } catch { /* ignore */ }

    // Remove user
    await menu('/ip/hotspot/user/remove', [`=.id=${id}`])

    // Remove scheduler — fetch all and filter in JS
    try {
      const allSchedulers = await safeWrite(menu, '/system/scheduler/print')
      const schedulers = allSchedulers.filter((s) => s.name === voucherCode)
      for (const sched of schedulers) {
        await menu('/system/scheduler/remove', [`=.id=${sched['.id']}`])
      }
    } catch { /* ignore */ }

    console.log(`[MT_REMOVE] Successfully removed ${voucherCode} from ${router.name}`)
    return {
      success: true,
      routerId,
      routerName: router.name,
      voucherCode,
      message: 'Removed hotspot user + scheduler',
    }
  } catch (e: any) {
    const msg = e?.message || String(e)
    console.error(`[MT_REMOVE] Failed for "${voucherCode}" on router ${router.name}:`, msg)
    return {
      success: false,
      routerId,
      routerName: router.name,
      voucherCode,
      message: msg,
    }
  } finally {
    try { if (api) await api.close() } catch { /* ignore */ }
  }
}

/**
 * Remove a voucher from all local-only routers (or its assigned router).
 */
export async function removeVoucherFromAllMikrotik(voucherCode: string, routerId?: string | null): Promise<BatchVoucherSyncResult> {
  if (routerId) {
    const result = await removeVoucherFromMikrotik(routerId, voucherCode)
    return {
      total: 1,
      success: result.success ? 1 : 0,
      failed: result.success ? 0 : 1,
      results: [result],
    }
  }

  const routers = await getLocalRouters()
  const results: VoucherSyncResult[] = []

  for (const router of routers) {
    const result = await removeVoucherFromMikrotik(router.id, voucherCode)
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
 * Remove multiple vouchers from a MikroTik router in a single connection.
 * Much more efficient than calling removeVoucherFromMikrotik for each voucher.
 */
export async function removeBatchVouchersFromMikrotik(
  routerId: string,
  voucherCodes: string[],
): Promise<BatchVoucherSyncResult> {
  const router = await getLocalRouterConfig(routerId)
  if (!router) {
    return {
      total: voucherCodes.length,
      success: 0,
      failed: voucherCodes.length,
      results: voucherCodes.map(code => ({
        success: false,
        routerId,
        routerName: 'unknown',
        voucherCode: code,
        message: 'Router not found or not local mode',
      })),
    }
  }

  let api: any
  const results: VoucherSyncResult[] = []
  try {
    ensureUncaughtHandler()
    console.log(`[MT_BATCH_REMOVE] Connecting to ${router.name} to remove ${voucherCodes.length} vouchers`)
    const { api: a, menu } = await connectMikrotik(router)
    api = a

    // Fetch all users once
    const allUsers = await safeWrite(menu, '/ip/hotspot/user/print')
    // Fetch all schedulers once
    const allSchedulers = await safeWrite(menu, '/system/scheduler/print')
    // Fetch all active sessions once
    const allActive = await safeWrite(menu, '/ip/hotspot/active/print')

    const codeSet = new Set(voucherCodes)

    // Find users to remove
    const usersToRemove = allUsers.filter((u) => codeSet.has(u.name))
    // Find schedulers to remove
    const schedulersToRemove = allSchedulers.filter((s) => codeSet.has(s.name))
    // Find active sessions to remove
    const activeToRemove = allActive.filter((s) => codeSet.has(s.user))

    console.log(`[MT_BATCH_REMOVE] Found ${usersToRemove.length} users, ${schedulersToRemove.length} schedulers, ${activeToRemove.length} active sessions`)

    // Remove active sessions
    for (const session of activeToRemove) {
      try {
        await menu('/ip/hotspot/active/remove', [`=.id=${session['.id']}`])
      } catch { /* ignore */ }
    }

    // Remove schedulers
    for (const sched of schedulersToRemove) {
      try {
        await menu('/system/scheduler/remove', [`=.id=${sched['.id']}`])
      } catch { /* ignore */ }
    }

    // Remove users
    let removedCount = 0
    for (const user of usersToRemove) {
      try {
        const id = user['.id'] || user.id
        if (!id) continue
        await menu('/ip/hotspot/user/remove', [`=.id=${id}`])
        removedCount++
        results.push({
          success: true,
          routerId,
          routerName: router.name,
          voucherCode: user.name,
          message: 'Removed',
        })
      } catch (e: any) {
        results.push({
          success: false,
          routerId,
          routerName: router.name,
          voucherCode: user.name,
          message: e?.message || String(e),
        })
      }
    }

    // Mark vouchers not found in MikroTik as success (already absent)
    const removedCodes = new Set(results.filter(r => r.success).map(r => r.voucherCode))
    for (const code of voucherCodes) {
      if (!removedCodes.has(code)) {
        results.push({
          success: true,
          routerId,
          routerName: router.name,
          voucherCode: code,
          message: 'Already absent',
        })
      }
    }

    console.log(`[MT_BATCH_REMOVE] Done: removed ${removedCount} users from ${router.name}`)
  } catch (e: any) {
    console.error(`[MT_BATCH_REMOVE] Failed for router ${router.name}:`, e?.message)
    for (const code of voucherCodes) {
      results.push({
        success: false,
        routerId,
        routerName: router.name,
        voucherCode: code,
        message: e?.message || String(e),
      })
    }
  } finally {
    try { if (api) await api.close() } catch { /* ignore */ }
  }

  return {
    total: results.length,
    success: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  }
}

/**
 * Fetch voucher status from a MikroTik local-only router.
 * Reads active users, schedulers, and voucher scripts to determine
 * which vouchers are ACTIVE, EXPIRED, or still WAITING.
 *
 * Also reads /system/script for sales transaction data.
 */
export async function fetchVoucherStatusFromMikrotik(routerId: string): Promise<VoucherStatusSyncResult> {
  const router = await getLocalRouterConfig(routerId)
  if (!router) {
    return { routerId, routerName: 'unknown', updated: 0, errors: ['Router not found or not local mode'] }
  }

  let api: any
  try {
    ensureUncaughtHandler()
    const { api: a, menu } = await connectMikrotik(router)
    api = a

    const errors: string[] = []
    let updatedCount = 0

    // 1. Get active hotspot users
    const activeUsersData = await safeWrite(menu, '/ip/hotspot/active/print')
    const activeUsernames = new Set(activeUsersData.map((u) => u.user).filter(Boolean))

    // 2. Get schedulers (created by on-login script for expiry)
    const schedulers = await safeWrite(menu, '/system/scheduler/print')
    const schedulerNames = new Set(
      schedulers
        .filter((s) => s.name && !s.disabled)
        .map((s) => s.name)
    )

    // 3. Get all hotspot users from MikroTik
    const mikrotikUsers = await safeWrite(menu, '/ip/hotspot/user/print')
    const mikrotikUsernames = new Set(mikrotikUsers.map((u) => u.name).filter(Boolean))

    // 4. Get all vouchers for this router from DB
    const dbVouchers = await prisma.hotspotVoucher.findMany({
      where: {
        routerId,
        status: { in: ['WAITING', 'ACTIVE'] },
      },
      select: { id: true, code: true, status: true, firstLoginAt: true },
    })

    // 5. Update voucher statuses
    for (const voucher of dbVouchers) {
      const isInMikrotik = mikrotikUsernames.has(voucher.code)
      const isActive = activeUsernames.has(voucher.code)
      const hasScheduler = schedulerNames.has(voucher.code)

      let newStatus: 'WAITING' | 'ACTIVE' | 'EXPIRED' | null = null

      if (isActive) {
        // User is currently connected
        if (voucher.status !== 'ACTIVE') {
          newStatus = 'ACTIVE'
        }
      } else if (isInMikrotik && hasScheduler) {
        // User exists but not active, scheduler still running = valid but not connected
        if (voucher.status !== 'ACTIVE') {
          newStatus = 'ACTIVE'
        }
      } else if (!isInMikrotik && voucher.status === 'ACTIVE') {
        // User was active but no longer in MikroTik = expired (scheduler removed it)
        newStatus = 'EXPIRED'
      } else if (!isInMikrotik && hasScheduler === false && voucher.status === 'WAITING') {
        // Check if the voucher was ever used — if not in MikroTik and no scheduler, still waiting
        // (voucher hasn't been created on MikroTik yet, or was never used)
        // Don't change status — keep as WAITING
      }

      if (newStatus) {
        const updateData: any = { status: newStatus }
        if (newStatus === 'ACTIVE' && !voucher.firstLoginAt) {
          updateData.firstLoginAt = new Date()
        }

        await prisma.hotspotVoucher.update({
          where: { id: voucher.id },
          data: updateData,
        })
        updatedCount++
      }
    }

    // 6. Fetch sales transactions from /system/script
    // Scripts are named by date (YYYY-MM-DD or mon/d/yyyy)
    // Each script source contains lines: user/price/sales/date/time/phone/seller
    try {
      const scripts = await safeWrite(menu, '/system/script/print')
      const salesTransactions: Array<{
        username: string
        costPrice: number
        sellingPrice: number
        saleDate: string
        saleTime: string
        phone: string
        seller: string
      }> = []

      for (const script of scripts) {
        const scriptName = script.name || ''
        const scriptSource = script.source || ''

        // Validate script name is a date
        if (!(/^\d{4}-\d{2}-\d{2}$/.test(scriptName) || /^([a-z]{3})\/(\d{1,2})\/(\d{4})$/i.test(scriptName))) {
          continue
        }

        // Parse date
        let normalizedDate = scriptName
        if (/^([a-z]{3})\/(\d{1,2})\/(\d{4})$/i.test(scriptName)) {
          const match = scriptName.match(/^([a-z]{3})\/(\d{1,2})\/(\d{4})$/i)!
          const monthNum = String(new Date(match[1] + ' 1').getMonth() + 1).padStart(2, '0')
          const day = match[2].padStart(2, '0')
          normalizedDate = `${match[3]}-${monthNum}-${day}`
        }

        // Parse each line
        const lines = scriptSource.split('\n').filter((l: string) => l.trim())
        for (const line of lines) {
          const parts = line.split('/')
          if (parts.length < 6) continue

          const username = parts[0]?.trim()
          const costPrice = parseFloat(parts[1]) || 0
          const sellingPrice = parseFloat(parts[2]) || 0
          const time = parts[4] || parts[6] || '00:00:00'
          const phone = parts[7] || parts[5] || ''
          const seller = parts[6] || parts[5] || ''

          if (!username) continue

          salesTransactions.push({
            username,
            costPrice,
            sellingPrice,
            saleDate: normalizedDate,
            saleTime: time,
            phone,
            seller,
          })
        }
      }

      // Update voucher firstLoginAt and status based on sales transactions
      for (const tx of salesTransactions) {
        const voucher = await prisma.hotspotVoucher.findUnique({
          where: { code: tx.username },
          select: { id: true, status: true, firstLoginAt: true },
        })

        if (voucher && !voucher.firstLoginAt) {
          const loginDate = new Date(`${tx.saleDate}T${tx.saleTime}Z`)
          await prisma.hotspotVoucher.update({
            where: { id: voucher.id },
            data: {
              firstLoginAt: loginDate,
              status: voucher.status === 'WAITING' ? 'ACTIVE' : voucher.status,
            },
          })
          updatedCount++
        }
      }
    } catch (salesError) {
      const msg = salesError instanceof Error ? salesError.message : String(salesError)
      errors.push(`Sales fetch error: ${msg}`)
    }

    return {
      routerId,
      routerName: router.name,
      updated: updatedCount,
      errors,
    }
  } catch (e: any) {
    const msg = e?.message || String(e)
    console.error(`[HOTSPOT_VOUCHER] status sync for router ${router.name}:`, msg)
    return { routerId, routerName: router.name, updated: 0, errors: [msg] }
  } finally {
    try { if (api) await api.close() } catch { /* ignore */ }
  }
}

/**
 * Fetch voucher status from ALL local-only routers.
 * Used by cron job.
 */
export async function fetchAllVoucherStatusesFromMikrotik(): Promise<{
  totalRouters: number
  results: VoucherStatusSyncResult[]
}> {
  const routers = await getLocalRouters()
  const results: VoucherStatusSyncResult[] = []

  for (const router of routers) {
    const result = await fetchVoucherStatusFromMikrotik(router.id)
    results.push(result)
    // Small delay between routers
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  return {
    totalRouters: routers.length,
    results,
  }
}

/**
 * Cleanup orphaned MikroTik hotspot users.
 * Removes users from MikroTik that no longer exist in the DB.
 * Optionally filter by profile name.
 */
export async function cleanupOrphanedMikrotikUsers(
  routerId: string,
  options?: { profileName?: string; dryRun?: boolean },
): Promise<{
  routerId: string
  routerName: string
  totalUsers: number
  orphanedCount: number
  removedCount: number
  errors: string[]
  dryRun: boolean
}> {
  const router = await getLocalRouterConfig(routerId)
  if (!router) {
    return {
      routerId,
      routerName: 'unknown',
      totalUsers: 0,
      orphanedCount: 0,
      removedCount: 0,
      errors: ['Router not found or not local mode'],
      dryRun: options?.dryRun ?? false,
    }
  }

  let api: any
  try {
    ensureUncaughtHandler()
    const { api: a, menu } = await connectMikrotik(router)
    api = a

    const errors: string[] = []

    // 1. Get all hotspot users from MikroTik
    const mikrotikUsers = await safeWrite(menu, '/ip/hotspot/user/print')

    // Filter by profile if specified
    let usersToCheck = mikrotikUsers
    if (options?.profileName) {
      usersToCheck = mikrotikUsers.filter((u) => u.profile === options.profileName)
    }

    // Skip system users and users NOT created by salfanet (no 'salfanet:' comment prefix)
    const systemUsers = new Set(['admin', 'default', 'guest', 'operator'])
    usersToCheck = usersToCheck.filter((u) =>
      u.name &&
      !systemUsers.has(u.name.toLowerCase()) &&
      String(u.comment || '').startsWith('salfanet:')
    )

    // 2. Get all voucher codes from DB for this router
    const dbVouchers = await prisma.hotspotVoucher.findMany({
      where: { routerId },
      select: { code: true },
    })
    const dbCodes = new Set(dbVouchers.map((v) => v.code))

    // 3. Find orphaned users (in MikroTik but not in DB)
    const orphanedUsers = usersToCheck.filter((u) => !dbCodes.has(u.name))

    if (options?.dryRun) {
      return {
        routerId,
        routerName: router.name,
        totalUsers: usersToCheck.length,
        orphanedCount: orphanedUsers.length,
        removedCount: 0,
        errors,
        dryRun: true,
      }
    }

    // 4. Remove orphaned users from MikroTik
    let removedCount = 0
    for (const user of orphanedUsers) {
      try {
        const id = user['.id'] || user.id
        if (!id) continue

        // Remove active sessions for this user
        try {
          const allActive = await safeWrite(menu, '/ip/hotspot/active/print')
          const activeSessions = allActive.filter((s) => s.user === user.name)
          for (const session of activeSessions) {
            await menu('/ip/hotspot/active/remove', [`=.id=${session['.id']}`])
          }
        } catch { /* ignore */ }

        // Remove user
        await menu('/ip/hotspot/user/remove', [`=.id=${id}`])
        removedCount++

        // Remove scheduler if exists
        try {
          const allSchedulers = await safeWrite(menu, '/system/scheduler/print')
          const schedulers = allSchedulers.filter((s) => s.name === user.name)
          for (const sched of schedulers) {
            await menu('/system/scheduler/remove', [`=.id=${sched['.id']}`])
          }
        } catch { /* ignore */ }
      } catch (e: any) {
        errors.push(`Failed to remove ${user.name}: ${e?.message || String(e)}`)
      }
    }

    return {
      routerId,
      routerName: router.name,
      totalUsers: usersToCheck.length,
      orphanedCount: orphanedUsers.length,
      removedCount,
      errors,
      dryRun: false,
    }
  } catch (e: any) {
    return {
      routerId,
      routerName: router.name,
      totalUsers: 0,
      orphanedCount: 0,
      removedCount: 0,
      errors: [`Cleanup failed: ${e?.message || String(e)}`],
      dryRun: options?.dryRun ?? false,
    }
  } finally {
    try { if (api) await api.close() } catch { /* ignore */ }
  }
}

/**
 * Cleanup orphaned users from ALL local-only routers.
 */
export async function cleanupAllOrphanedMikrotikUsers(
  options?: { profileName?: string; dryRun?: boolean },
): Promise<{
  totalRouters: number
  results: Array<{
    routerId: string
    routerName: string
    totalUsers: number
    orphanedCount: number
    removedCount: number
    errors: string[]
    dryRun: boolean
  }>
}> {
  const routers = await getLocalRouters()
  const results = []

  for (const router of routers) {
    const result = await cleanupOrphanedMikrotikUsers(router.id, options)
    results.push(result)
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  return { totalRouters: routers.length, results }
}
