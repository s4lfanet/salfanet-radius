/**
 * Standalone Next.js Cron Runner — replaces NestJS backend cron scheduler.
 *
 * This file is self-contained: it does NOT import from src/server/* (which
 * uses 'server-only'). All job logic is inlined here to avoid the
 * 'server-only' import restriction.
 *
 * Usage:
 *   npx tsx cron-runner.ts                          # run all jobs on schedule
 *   npx tsx cron-runner.ts --job=pppoe_auto_isolir  # trigger single job
 *
 * PM2:
 *   pm2 start 'npx tsx cron-runner.ts' --name salfanet-cron --cwd /var/www/salfanet-radius/frontend
 */
import cron from 'node-cron'
import { PrismaClient } from '@prisma/client'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// ─── Prisma (standalone, no 'server-only') ──────────────────────────────────

const prisma = new PrismaClient({ log: ['warn', 'error'] })

process.on('uncaughtException', (error) => {
  console.error('[Cron-Runner] uncaughtException:', error)
})
process.on('unhandledRejection', (reason) => {
  console.error('[Cron-Runner] unhandledRejection:', reason)
})

// ─── Timezone helper ────────────────────────────────────────────────────────

function nowWIB(): Date {
  // WIB = UTC+7. Return a Date where UTC values represent WIB time.
  const now = new Date()
  return new Date(now.getTime() + 7 * 60 * 60 * 1000)
}

// ─── Cron Job Definitions ───────────────────────────────────────────────────

interface CronJobDef {
  type: string
  name: string
  description: string
  defaultSchedule: string
}

const CRON_JOB_DEFS: CronJobDef[] = [
  { type: 'hotspot_sync',          name: 'Hotspot Sync',           description: 'Sinkronisasi voucher hotspot', defaultSchedule: '* * * * *' },
  { type: 'pppoe_auto_isolir',     name: 'Auto Isolir PPPoE',      description: 'Isolir user expired (prepaid)', defaultSchedule: '0 * * * *' },
  { type: 'agent_sales',           name: 'Agent Sales',            description: 'Catat penjualan voucher agent', defaultSchedule: '*/5 * * * *' },
  { type: 'invoice_generate',      name: 'Invoice Generate',       description: 'Generate invoice bulanan', defaultSchedule: '0 7 * * *' },
  { type: 'invoice_reminder',      name: 'Invoice Reminder',       description: 'Reminder invoice jatuh tempo', defaultSchedule: '0 * * * *' },
  { type: 'invoice_status_update', name: 'Invoice Status Update',  description: 'Update status invoice', defaultSchedule: '0 * * * *' },
  { type: 'notification_check',    name: 'Notification Check',     description: 'Cek notifikasi expired/overdue', defaultSchedule: '0 */6 * * *' },
  { type: 'session_monitor',       name: 'Session Monitor',        description: 'Monitor sesi mencurigakan', defaultSchedule: '*/15 * * * *' },
  { type: 'disconnect_sessions',   name: 'Disconnect Sessions',    description: 'Disconnect sesi isolir/stop', defaultSchedule: '*/5 * * * *' },
  { type: 'auto_renewal',          name: 'Auto Renewal',           description: 'Auto renew prepaid dari saldo', defaultSchedule: '0 8 * * *' },
  { type: 'activity_log_cleanup',  name: 'Activity Log Cleanup',   description: 'Hapus log >30 hari', defaultSchedule: '0 2 * * *' },
  { type: 'webhook_log_cleanup',   name: 'Webhook Log Cleanup',    description: 'Hapus webhook log >7 hari', defaultSchedule: '0 3 * * *' },
  { type: 'freeradius_health',     name: 'FreeRADIUS Health',      description: 'Cek kesehatan FreeRADIUS', defaultSchedule: '*/5 * * * *' },
  { type: 'pppoe_session_sync',    name: 'PPPoE Session Sync',     description: 'Sync sesi PPPoE ke radacct', defaultSchedule: '*/5 * * * *' },
  { type: 'suspend_check',         name: 'Suspend Check',          description: 'Cek user perlu disuspend', defaultSchedule: '0 * * * *' },
  { type: 'cron_history_cleanup',  name: 'History Cleanup',        description: 'Hapus cron history >30 hari', defaultSchedule: '0 4 * * *' },
  { type: 'auto_stop',             name: 'Auto Stop',              description: 'Stop user isolir >30 hari', defaultSchedule: '0 5 * * *' },
]

const CRON_JOB_MAP = new Map(CRON_JOB_DEFS.map(j => [j.type, j]))

async function getEffectiveSchedule(jobType: string): Promise<{ schedule: string; enabled: boolean }> {
  const def = CRON_JOB_MAP.get(jobType)
  if (!def) return { schedule: '* * * * *', enabled: false }
  try {
    const config = await prisma.cronScheduleConfig.findUnique({ where: { jobType } })
    if (config) return { schedule: config.schedule, enabled: config.enabled }
  } catch (e) {
    // Table might not exist yet
  }
  return { schedule: def.defaultSchedule, enabled: true }
}

// ─── MikroTik API helper ────────────────────────────────────────────────────

async function getRouterCreds(routerId: string) {
  const r = await prisma.router.findUnique({
    where: { id: routerId },
    select: { id: true, nasname: true, ipAddress: true, port: true, username: true, password: true, authMode: true },
  })
  return r
}

async function mikrotikIsolateUser(routerId: string, username: string): Promise<{ profileChanged: boolean; kicked: boolean; error?: string }> {
  const RouterOSAPI = require('node-routeros').RouterOSAPI
  const router = await getRouterCreds(routerId)
  if (!router) return { profileChanged: false, kicked: false, error: 'Router not found' }

  const host = router.ipAddress || router.nasname
  const apiPort = router.port || 8728
  let api: any
  try {
    api = new RouterOSAPI({ host, port: apiPort, user: router.username || '', password: router.password || '', timeout: 10 })
    await api.connect()
    const menu = api.write.bind(api)

    // 1. Change PPP secret profile to 'isolir'
    const allSecrets = await menu('/ppp/secret/print')
    const secret = allSecrets.find((s: any) => s.name === username)
    let profileChanged = false
    if (secret) {
      if (secret.profile !== 'isolir') {
        await menu('/ppp/secret/set', [`=.id=${secret['.id']}`, '=profile=isolir'])
        profileChanged = true
      }
    }

    // 2. Kick active session
    const allActive = await menu('/ppp/active/print')
    const active = allActive.find((a: any) => a.name === username)
    let kicked = false
    if (active) {
      await menu('/ppp/active/remove', [`=.id=${active['.id']}`])
      kicked = true
    }

    return { profileChanged, kicked }
  } catch (e: any) {
    return { profileChanged: false, kicked: false, error: e?.message || String(e) }
  } finally {
    try { if (api) await api.close() } catch { /* ignore */ }
  }
}

async function mikrotikStopUser(routerId: string, username: string): Promise<{ disabled: boolean; kicked: boolean; error?: string }> {
  const RouterOSAPI = require('node-routeros').RouterOSAPI
  const router = await getRouterCreds(routerId)
  if (!router) return { disabled: false, kicked: false, error: 'Router not found' }

  const host = router.ipAddress || router.nasname
  const apiPort = router.port || 8728
  let api: any
  try {
    api = new RouterOSAPI({ host, port: apiPort, user: router.username || '', password: router.password || '', timeout: 10 })
    await api.connect()
    const menu = api.write.bind(api)

    // 1. Disable PPP secret
    const allSecrets = await menu('/ppp/secret/print')
    const secret = allSecrets.find((s: any) => s.name === username)
    let disabled = false
    if (secret) {
      await menu('/ppp/secret/set', [`=.id=${secret['.id']}`, '=disabled=yes'])
      disabled = true
    }

    // 2. Kick active session
    const allActive = await menu('/ppp/active/print')
    const active = allActive.find((a: any) => a.name === username)
    let kicked = false
    if (active) {
      await menu('/ppp/active/remove', [`=.id=${active['.id']}`])
      kicked = true
    }

    return { disabled, kicked }
  } catch (e: any) {
    return { disabled: false, kicked: false, error: e?.message || String(e) }
  } finally {
    try { if (api) await api.close() } catch { /* ignore */ }
  }
}

// ─── Job: Auto Isolir ───────────────────────────────────────────────────────

async function runAutoIsolir(): Promise<any> {
  const now = nowWIB()
  const errors: string[] = []

  // Check company settings
  const company = await prisma.company.findFirst({
    select: { isolationEnabled: true, gracePeriodDays: true },
  })
  const isolationEnabled = company?.isolationEnabled !== false // default true
  if (!isolationEnabled) {
    console.log('[AUTO_ISOLIR] Isolation disabled by company settings — skipping')
    return { isolated: 0, total: 0, errors: [], skipped: 'isolation_disabled' }
  }
  const graceDays = company?.gracePeriodDays || 0
  const cutoff = new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000)

  // ─── PREPAID: expiredAt < now - graceDays ──────────────────────────────
  const prepaidExpired = await prisma.pppoeUser.findMany({
    where: {
      status: 'active',
      expiredAt: { lt: cutoff },
      autoIsolationEnabled: true,
      subscriptionType: 'PREPAID',
    },
    select: {
      id: true, username: true, name: true, password: true,
      ipAddress: true, routerId: true, expiredAt: true,
      profile: { select: { groupName: true } },
      router: { select: { id: true, authMode: true } },
    },
  })

  // ─── POSTPAID: has OVERDUE invoice past dueDate + graceDays ────────────
  // Find postpaid users with overdue invoices past grace period
  const postpaidOverdue = await prisma.pppoeUser.findMany({
    where: {
      status: 'active',
      autoIsolationEnabled: true,
      subscriptionType: 'POSTPAID',
      invoices: {
        some: {
          status: 'OVERDUE',
          dueDate: { lt: cutoff },
        },
      },
    },
    select: {
      id: true, username: true, name: true, password: true,
      ipAddress: true, routerId: true, expiredAt: true,
      profile: { select: { groupName: true } },
      router: { select: { id: true, authMode: true } },
    },
  })

  const allExpiredUsers = [...prepaidExpired, ...postpaidOverdue]
  console.log(`[AUTO_ISOLIR] Found ${prepaidExpired.length} prepaid + ${postpaidOverdue.length} postpaid = ${allExpiredUsers.length} users to isolate (grace: ${graceDays}d)`)

  let isolated = 0
  for (const user of allExpiredUsers) {
    try {
      const nasId = user.router?.id || null
      const authMode = user.router?.authMode || 'local'

      // 1. Update DB status
      await prisma.pppoeUser.update({
        where: { id: user.id },
        data: { status: 'isolated' },
      })

      // 2. RADIUS: move to isolir group (for RADIUS and hybrid auth path)
      await prisma.radcheck.deleteMany({
        where: { username: user.username, attribute: 'Auth-Type', ...(nasId ? { nas_identifier: nasId } : {}) },
      })

      await prisma.$executeRaw`
        INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
        VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasId})
        ON DUPLICATE KEY UPDATE value = ${user.password}
      `

      await prisma.$executeRaw`
        DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasId} IS NULL OR nas_identifier = ${nasId})
      `
      await prisma.$executeRaw`
        INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
        VALUES (${user.username}, 'isolir', 1, ${nasId})
      `

      await prisma.$executeRaw`
        DELETE FROM radreply WHERE username = ${user.username} AND attribute = 'Framed-IP-Address' AND (${nasId} IS NULL OR nas_identifier = ${nasId})
      `

      // 3. MikroTik: change PPP secret profile to 'isolir' + kick active session
      //    This is CRITICAL for local/hybrid mode — CoA doesn't work on local-auth sessions
      if (user.router?.id && authMode !== 'radius') {
        const mtResult = await mikrotikIsolateUser(user.router.id, user.username)
        if (mtResult.error) {
          errors.push(`${user.username}: MikroTik error: ${mtResult.error}`)
          console.error(`[AUTO_ISOLIR] MikroTik error for ${user.username}:`, mtResult.error)
        } else {
          console.log(`[AUTO_ISOLIR] MikroTik: profileChanged=${mtResult.profileChanged} kicked=${mtResult.kicked} for ${user.username}`)
        }
      }

      // 4. CoA disconnect (best-effort, for RADIUS-authed sessions)
      try {
        const secret = process.env.RADIUS_COA_SECRET || 'secret123'
        const nasIp = user.router ? (await prisma.router.findUnique({ where: { id: user.router.id }, select: { nasname: true } }))?.nasname : null
        if (nasIp) {
          await execAsync(`echo 'User-Name="${user.username}"' | radclient -x ${nasIp}:3799 disconnect ${secret} -t 2`, { timeout: 5000 })
        }
      } catch (e: any) {
        // CoA failure is non-fatal — MikroTik API kick already handled local sessions
      }

      isolated++
      const subType = prepaidExpired.find(u => u.id === user.id) ? 'PREPAID' : 'POSTPAID'
      console.log(`[AUTO_ISOLIR] Isolated ${user.username} (${subType}, expired: ${user.expiredAt?.toISOString()}, mode: ${authMode})`)
    } catch (e: any) {
      errors.push(`${user.username}: ${e?.message || e}`)
      console.error(`[AUTO_ISOLIR] Failed for ${user.username}:`, e?.message || e)
    }
  }

  return { isolated, total: allExpiredUsers.length, prepaid: prepaidExpired.length, postpaid: postpaidOverdue.length, errors }
}

// ─── Job: Auto Stop ─────────────────────────────────────────────────────────

async function runAutoStop(): Promise<any> {
  const now = nowWIB()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const longIsolated = await prisma.pppoeUser.findMany({
    where: { status: 'isolated', expiredAt: { lt: thirtyDaysAgo } },
    select: { id: true, username: true, routerId: true, router: { select: { id: true, authMode: true } } },
  })

  let stopped = 0
  for (const user of longIsolated) {
    try {
      const nasId = user.router?.id || null
      const authMode = user.router?.authMode || 'local'

      // 1. Update DB status
      await prisma.pppoeUser.update({ where: { id: user.id }, data: { status: 'stop' } })

      // 2. Remove from RADIUS tables
      await prisma.$executeRaw`DELETE FROM radcheck WHERE username = ${user.username} AND (${nasId} IS NULL OR nas_identifier = ${nasId})`
      await prisma.$executeRaw`DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasId} IS NULL OR nas_identifier = ${nasId})`
      await prisma.$executeRaw`DELETE FROM radreply WHERE username = ${user.username} AND (${nasId} IS NULL OR nas_identifier = ${nasId})`

      // 3. MikroTik: disable PPP secret + kick active session
      if (user.router?.id && authMode !== 'radius') {
        const mtResult = await mikrotikStopUser(user.router.id, user.username)
        if (mtResult.error) {
          console.error(`[AUTO_STOP] MikroTik error for ${user.username}:`, mtResult.error)
        } else {
          console.log(`[AUTO_STOP] MikroTik: disabled=${mtResult.disabled} kicked=${mtResult.kicked} for ${user.username}`)
        }
      }

      // 4. CoA disconnect (best-effort)
      try {
        const secret = process.env.RADIUS_COA_SECRET || 'secret123'
        const nasIp = user.router ? (await prisma.router.findUnique({ where: { id: user.router.id }, select: { nasname: true } }))?.nasname : null
        if (nasIp) {
          await execAsync(`echo 'User-Name="${user.username}"' | radclient -x ${nasIp}:3799 disconnect ${secret} -t 2`, { timeout: 5000 })
        }
      } catch (e: any) { /* non-fatal */ }

      stopped++
      console.log(`[AUTO_STOP] Stopped ${user.username} (mode: ${authMode})`)
    } catch (e: any) {
      console.error(`[AUTO_STOP] Failed for ${user.username}:`, e?.message || e)
    }
  }

  return { stopped, total: longIsolated.length }
}

// ─── Job: Cleanup tasks ─────────────────────────────────────────────────────

async function runActivityLogCleanup(): Promise<any> {
  const ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const r = await prisma.activityLog.deleteMany({ where: { createdAt: { lt: ago } } })
  return { deleted: r.count }
}

async function runWebhookLogCleanup(): Promise<any> {
  const ago = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const r = await prisma.webhookLog.deleteMany({ where: { createdAt: { lt: ago } } })
  return { deleted: r.count }
}

async function runCronHistoryCleanup(): Promise<any> {
  const ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const r = await prisma.cronHistory.deleteMany({ where: { startedAt: { lt: ago } } })
  return { deleted: r.count }
}

// ─── Job: FreeRADIUS Health ─────────────────────────────────────────────────

async function runFreeradiusHealth(): Promise<any> {
  try {
    const { stdout } = await execAsync('systemctl is-active freeradius', { timeout: 5000 })
    const healthy = stdout.trim() === 'active'
    return { healthy, status: stdout.trim() }
  } catch (e: any) {
    return { healthy: false, error: e?.message }
  }
}

// ─── Job: Disconnect Sessions (kick isolated/stop users still online) ───────

async function runDisconnectSessions(): Promise<any> {
  // Find users with isolated/stop/blocked status — they should NOT be online
  const isolatedUsers = await prisma.pppoeUser.findMany({
    where: { status: { in: ['isolated', 'stop', 'blocked'] } },
    select: { id: true, username: true, status: true, routerId: true, router: { select: { id: true, authMode: true } } },
  })

  let disconnected = 0
  const errors: string[] = []

  for (const user of isolatedUsers) {
    if (!user.router?.id) continue
    const authMode = user.router?.authMode || 'local'

    // For local/hybrid: kick via MikroTik API
    if (authMode !== 'radius') {
      try {
        const result = await mikrotikStopUser(user.router.id, user.username)
        if (result.kicked) {
          disconnected++
          console.log(`[DISCONNECT] Kicked ${user.username} (status=${user.status})`)
        }
      } catch (e: any) {
        errors.push(`${user.username}: ${e?.message || e}`)
      }
    }

    // For all modes: also try CoA (best-effort, for RADIUS-authed sessions)
    try {
      const secret = process.env.RADIUS_COA_SECRET || 'secret123'
      const nasIp = (await prisma.router.findUnique({ where: { id: user.router.id }, select: { nasname: true } }))?.nasname
      if (nasIp) {
        await execAsync(`echo 'User-Name="${user.username}"' | radclient -x ${nasIp}:3799 disconnect ${secret} -t 2`, { timeout: 5000 })
      }
    } catch { /* non-fatal */ }
  }

  return { disconnected, total: isolatedUsers.length, errors }
}

// ─── Job: Invoice Status Update (PENDING → OVERDUE) ─────────────────────────

async function runInvoiceStatusUpdate(): Promise<any> {
  const now = nowWIB()
  const result = await prisma.invoice.updateMany({
    where: {
      status: 'PENDING',
      dueDate: { lt: now },
    },
    data: { status: 'OVERDUE' },
  })
  if (result.count > 0) {
    console.log(`[INVOICE_STATUS] ${result.count} invoices marked as OVERDUE`)
  }
  return { updated: result.count }
}

// ─── Job: Suspend Check (postpaid overdue → isolated) ───────────────────────
// This is a secondary check — runAutoIsolir already handles postpaid overdue.
// This job also handles manual SuspendRequest approvals.

async function runSuspendCheck(): Promise<any> {
  let suspended = 0
  const errors: string[] = []

  // 1. Process approved manual suspend requests
  const approved = await prisma.suspendRequest.findMany({
    where: { status: 'APPROVED', startDate: { lte: nowWIB() } },
  })
  for (const req of approved) {
    try {
      await prisma.pppoeUser.update({ where: { id: req.userId }, data: { status: 'isolated' } })
      suspended++
      console.log(`[SUSPEND_CHECK] Manual suspend applied for user ${req.userId}`)
    } catch (e: any) {
      errors.push(`suspend_${req.id}: ${e?.message || e}`)
    }
  }

  // 2. Auto-isolir for postpaid is handled by runAutoIsolir — no duplicate here
  return { suspended, total: approved.length, errors }
}

// ─── Job registry ───────────────────────────────────────────────────────────

const jobImplementations: Record<string, () => Promise<any>> = {
  pppoe_auto_isolir: () => runAutoIsolir(),
  auto_stop: () => runAutoStop(),
  disconnect_sessions: () => runDisconnectSessions(),
  invoice_status_update: () => runInvoiceStatusUpdate(),
  suspend_check: () => runSuspendCheck(),
  activity_log_cleanup: () => runActivityLogCleanup(),
  webhook_log_cleanup: () => runWebhookLogCleanup(),
  cron_history_cleanup: () => runCronHistoryCleanup(),
  freeradius_health: () => runFreeradiusHealth(),
  // Jobs not yet implemented (return placeholder):
  hotspot_sync: async () => ({ message: 'Not yet implemented in Next.js cron runner' }),
  agent_sales: async () => ({ message: 'Not yet implemented' }),
  invoice_generate: async () => ({ message: 'Not yet implemented' }),
  invoice_reminder: async () => ({ message: 'Not yet implemented' }),
  notification_check: async () => ({ message: 'Not yet implemented' }),
  session_monitor: async () => ({ message: 'Not yet implemented' }),
  auto_renewal: async () => ({ message: 'Not yet implemented' }),
  pppoe_session_sync: async () => ({ message: 'Not yet implemented' }),
}

// ─── Job runner with history logging ────────────────────────────────────────

async function runJob(jobType: string, fn: () => Promise<any>) {
  const { enabled } = await getEffectiveSchedule(jobType)
  if (!enabled) {
    console.log(`[${new Date().toISOString()}] [CRON] ${jobType} — skipped (disabled)`)
    return
  }

  const jobId = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  const startedAt = nowWIB()
  console.log(`[${startedAt.toISOString()}] [CRON] ${jobType} — starting`)

  await prisma.cronHistory.create({
    data: { id: jobId, jobType, status: 'running', startedAt },
  })

  try {
    const result = await fn()
    const completedAt = nowWIB()
    const duration = completedAt.getTime() - startedAt.getTime()
    await prisma.cronHistory.update({
      where: { id: jobId },
      data: { status: 'success', completedAt, duration, result: JSON.stringify(result).slice(0, 1000) },
    })
    console.log(`[${completedAt.toISOString()}] [CRON] ${jobType} — success (${duration}ms)`, result)
  } catch (error: any) {
    const completedAt = nowWIB()
    const duration = completedAt.getTime() - startedAt.getTime()
    await prisma.cronHistory.update({
      where: { id: jobId },
      data: { status: 'error', completedAt, duration, error: error?.message || 'Job failed' },
    })
    console.error(`[${completedAt.toISOString()}] [CRON] ${jobType} — error:`, error?.message || error)
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  Salfanet Cron Runner — Next.js native')
  console.log('═══════════════════════════════════════════════════════════')

  // Manual trigger: --job=xxx
  const jobArg = process.argv.find(a => a.startsWith('--job='))
  if (jobArg) {
    const jobType = jobArg.split('=')[1]
    const fn = jobImplementations[jobType]
    if (!fn) {
      console.error(`Unknown job: ${jobType}`)
      console.log('Available jobs:', Object.keys(jobImplementations).join(', '))
      process.exit(1)
    }
    console.log(`Manual trigger: ${jobType}`)
    await runJob(jobType, fn)
    await prisma.$disconnect()
    process.exit(0)
  }

  // Schedule all jobs
  const tasks: any[] = []
  for (const def of CRON_JOB_DEFS) {
    const { schedule, enabled } = await getEffectiveSchedule(def.type)
    if (!enabled) {
      console.log(`  [SKIP] ${def.type} — disabled`)
      continue
    }

    const fn = jobImplementations[def.type]
    if (!fn) continue

    if (!cron.validate(schedule)) {
      console.log(`  [ERR]  ${def.type} — invalid schedule: ${schedule}`)
      continue
    }

    const task = cron.schedule(schedule, async () => {
      try { await runJob(def.type, fn) } catch (e) { console.error(`[CRON] Uncaught in ${def.type}:`, e) }
    })

    tasks.push(task)
    console.log(`  [OK]   ${def.type.padEnd(25)} ${schedule.padEnd(15)} ${def.name}`)
  }

  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  ${tasks.length} jobs scheduled. Waiting for next tick...`)
  console.log('')

  process.on('SIGINT', async () => {
    console.log('\n[CRON] Shutting down...')
    tasks.forEach(t => t.stop())
    await prisma.$disconnect()
    process.exit(0)
  })
  process.on('SIGTERM', async () => {
    console.log('\n[CRON] SIGTERM, shutting down...')
    tasks.forEach(t => t.stop())
    await prisma.$disconnect()
    process.exit(0)
  })
}

main().catch(e => {
  console.error('[CRON] Fatal:', e)
  process.exit(1)
})
