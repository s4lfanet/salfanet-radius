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

// ─── Job: Auto Isolir ───────────────────────────────────────────────────────

async function runAutoIsolir(): Promise<any> {
  const now = nowWIB()
  const errors: string[] = []

  const expiredUsers = await prisma.pppoeUser.findMany({
    where: {
      status: 'active',
      expiredAt: { lt: now },
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

  let isolated = 0
  for (const user of expiredUsers) {
    try {
      const nasId = user.router?.id || null

      // 1. Update DB status
      await prisma.pppoeUser.update({
        where: { id: user.id },
        data: { status: 'isolated' },
      })

      // 2. RADIUS: move to isolir group
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

      // 3. CoA disconnect (best-effort)
      try {
        const secret = process.env.RADIUS_COA_SECRET || 'secret123'
        const nasIp = user.router ? (await prisma.router.findUnique({ where: { id: user.router.id }, select: { nasname: true } }))?.nasname : null
        if (nasIp) {
          await execAsync(`echo 'User-Name="${user.username}"' | radclient -x ${nasIp}:3799 disconnect ${secret} -t 2`, { timeout: 5000 })
        }
      } catch (e: any) {
        // CoA failure is non-fatal
      }

      isolated++
      console.log(`[AUTO_ISOLIR] Isolated ${user.username} (expired: ${user.expiredAt?.toISOString()})`)
    } catch (e: any) {
      errors.push(`${user.username}: ${e?.message || e}`)
      console.error(`[AUTO_ISOLIR] Failed for ${user.username}:`, e?.message || e)
    }
  }

  return { isolated, total: expiredUsers.length, errors }
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
      await prisma.pppoeUser.update({ where: { id: user.id }, data: { status: 'stop' } })

      await prisma.$executeRaw`DELETE FROM radcheck WHERE username = ${user.username} AND (${nasId} IS NULL OR nas_identifier = ${nasId})`
      await prisma.$executeRaw`DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasId} IS NULL OR nas_identifier = ${nasId})`
      await prisma.$executeRaw`DELETE FROM radreply WHERE username = ${user.username} AND (${nasId} IS NULL OR nas_identifier = ${nasId})`

      stopped++
      console.log(`[AUTO_STOP] Stopped ${user.username}`)
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

// ─── Job registry ───────────────────────────────────────────────────────────

const jobImplementations: Record<string, () => Promise<any>> = {
  pppoe_auto_isolir: () => runAutoIsolir(),
  auto_stop: () => runAutoStop(),
  activity_log_cleanup: () => runActivityLogCleanup(),
  webhook_log_cleanup: () => runWebhookLogCleanup(),
  cron_history_cleanup: () => runCronHistoryCleanup(),
  freeradius_health: () => runFreeradiusHealth(),
  // Jobs not yet implemented (return placeholder):
  hotspot_sync: async () => ({ message: 'Not yet implemented in Next.js cron runner' }),
  agent_sales: async () => ({ message: 'Not yet implemented' }),
  invoice_generate: async () => ({ message: 'Not yet implemented' }),
  invoice_reminder: async () => ({ message: 'Not yet implemented' }),
  invoice_status_update: async () => ({ message: 'Not yet implemented' }),
  notification_check: async () => ({ message: 'Not yet implemented' }),
  session_monitor: async () => ({ message: 'Not yet implemented' }),
  disconnect_sessions: async () => ({ message: 'Not yet implemented' }),
  auto_renewal: async () => ({ message: 'Not yet implemented' }),
  pppoe_session_sync: async () => ({ message: 'Not yet implemented' }),
  suspend_check: async () => ({ message: 'Not yet implemented' }),
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
