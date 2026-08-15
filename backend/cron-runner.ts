/**
 * Standalone Next.js Cron Runner — thin scheduler.
 *
 * This file does NOT contain business logic. It only schedules jobs and
 * triggers them via HTTP POST to /api/cron (the Next.js API route).
 * All business logic lives in the API route, which can import from src/server/*
 * (no 'server-only' restriction).
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

// ─── Prisma (standalone, for schedule config only) ──────────────────────────

const prisma = new PrismaClient({ log: ['warn', 'error'] })

process.on('uncaughtException', (error) => {
  console.error('[Cron-Runner] uncaughtException:', error)
})
process.on('unhandledRejection', (reason) => {
  console.error('[Cron-Runner] unhandledRejection:', reason)
})

// ─── Timezone helper ────────────────────────────────────────────────────────

function nowWIB(): Date {
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
  { type: 'disconnect_sessions',   name: 'Disconnect Sessions',    description: 'Disconnect sesi stop/blocked', defaultSchedule: '*/5 * * * *' },
  { type: 'auto_renewal',          name: 'Auto Renewal',           description: 'Auto renew prepaid dari saldo', defaultSchedule: '0 8 * * *' },
  { type: 'activity_log_cleanup',  name: 'Activity Log Cleanup',   description: 'Hapus log >30 hari', defaultSchedule: '0 2 * * *' },
  { type: 'webhook_log_cleanup',   name: 'Webhook Log Cleanup',    description: 'Hapus webhook log >7 hari', defaultSchedule: '0 3 * * *' },
  { type: 'freeradius_health',     name: 'FreeRADIUS Health',      description: 'Cek kesehatan FreeRADIUS', defaultSchedule: '*/5 * * * *' },
  { type: 'pppoe_session_sync',    name: 'PPPoE Session Sync',     description: 'Sync sesi PPPoE ke radacct', defaultSchedule: '*/5 * * * *' },
  { type: 'auto_stop',             name: 'Auto Stop',              description: 'Stop user isolated >30 hari', defaultSchedule: '0 5 * * *' },
  { type: 'suspend_check',         name: 'Suspend Check',          description: 'Cek user yang perlu disuspend', defaultSchedule: '0 * * * *' },
  { type: 'cron_history_cleanup',  name: 'History Cleanup',        description: 'Hapus cron history >30 hari', defaultSchedule: '0 4 * * *' },
  { type: 'radius_sync_retry',     name: 'RADIUS Sync Retry',      description: 'Retry failed FreeRADIUS syncs', defaultSchedule: '*/5 * * * *' },
]

// ─── Schedule config ────────────────────────────────────────────────────────

async function getEffectiveSchedule(jobType: string): Promise<{ schedule: string; enabled: boolean }> {
  const def = CRON_JOB_DEFS.find(d => d.type === jobType)
  if (!def) return { schedule: '* * * * *', enabled: false }
  try {
    const config = await prisma.cronScheduleConfig.findUnique({ where: { jobType } })
    if (config) return { schedule: config.schedule, enabled: config.enabled }
  } catch {
    // Table might not exist yet
  }
  return { schedule: def.defaultSchedule, enabled: true }
}

// ─── HTTP trigger to /api/cron ──────────────────────────────────────────────

const API_URL = process.env.CRON_API_URL || 'http://localhost:3001'
const CRON_SECRET = process.env.CRON_SECRET || ''

/**
 * Trigger a job via HTTP POST to /api/cron.
 * The API route handles all business logic (can import from src/server/*).
 * Returns the job result from the API.
 */
async function triggerJobViaAPI(jobType: string): Promise<{ success?: boolean; error?: string; [key: string]: unknown }> {
  const url = `${API_URL}/api/cron`
  const body = JSON.stringify({ type: jobType })

  // Use curl to avoid needing fetch/undici in standalone mode
  const { stdout } = await execAsync(
    `curl -s -X POST ${url} -H "Content-Type: application/json" -H "x-cron-secret: ${CRON_SECRET}" -d '${body.replace(/'/g, "'\\''")}'`,
    { timeout: 120000 }
  )

  try {
    return JSON.parse(stdout)
  } catch {
    return { success: false, raw: stdout.slice(0, 500) }
  }
}

// ─── Job runner with atomic distributed lock + history logging ──────────────

// In-memory guard: prevents overlapping runs within the same process
const runningJobs = new Set<string>()

// Lock TTL — stale locks are reclaimable after this duration
const LOCK_TTL_MS = 30 * 60 * 1000 // 30 minutes

async function runJob(jobType: string) {
  const { enabled } = await getEffectiveSchedule(jobType)
  if (!enabled) {
    console.log(`[${new Date().toISOString()}] [CRON] ${jobType} — skipped (disabled)`)
    return
  }

  // ─── In-memory guard (fast path — prevents overlap within same process) ───
  if (runningJobs.has(jobType)) {
    console.log(`[${new Date().toISOString()}] [CRON] ${jobType} — skipped (already running in-process)`)
    return
  }

  // ─── Atomic database lock (distributed — prevents overlap across instances) ──
  // Uses MySQL primary key constraint for atomic acquisition.
  // Stale locks (expired TTL) are automatically reclaimed.
  let ownerToken: string | null = null
  try {
    // Import the lock service dynamically (cron-runner is standalone)
    const { acquireCronLock, releaseCronLock } = await import('./src/server/services/cron-lock.service')
    ownerToken = await acquireCronLock(jobType, LOCK_TTL_MS)
    if (!ownerToken) {
      console.log(`[${new Date().toISOString()}] [CRON] ${jobType} — skipped (lock held by another instance)`)
      return
    }
  } catch (err) {
    // Lock table might not exist yet — fall back to in-memory guard only
    console.warn(`[${new Date().toISOString()}] [CRON] ${jobType} — lock service unavailable, using in-memory guard only:`, err instanceof Error ? err.message : err)
  }

  runningJobs.add(jobType)
  const startedAt = nowWIB()
  const jobId = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  console.log(`[${startedAt.toISOString()}] [CRON] ${jobType} — starting`)

  // Create history record
  try {
    await prisma.cronHistory.create({
      data: { id: jobId, jobType, status: 'running', startedAt },
    })
  } catch {
    // Table might not exist
  }

  try {
    const result = await triggerJobViaAPI(jobType)
    const completedAt = nowWIB()
    const duration = completedAt.getTime() - startedAt.getTime()

    const success = result?.success !== false
    try {
      await prisma.cronHistory.update({
        where: { id: jobId },
        data: {
          status: success ? 'success' : 'error',
          completedAt,
          duration,
          result: JSON.stringify(result).slice(0, 1000),
          ...(result?.error && { error: String(result.error).slice(0, 500) }),
        },
      })
    } catch { /* non-fatal */ }

    console.log(`[${completedAt.toISOString()}] [CRON] ${jobType} — ${success ? 'success' : 'error'} (${duration}ms)`, result)
  } catch (error) {
    const completedAt = nowWIB()
    const duration = completedAt.getTime() - startedAt.getTime()
    try {
      await prisma.cronHistory.update({
        where: { id: jobId },
        data: { status: 'error', completedAt, duration, error: error instanceof Error ? error.message : 'Job failed' },
      })
    } catch { /* non-fatal */ }
    console.error(`[${completedAt.toISOString()}] [CRON] ${jobType} — error:`, error instanceof Error ? error.message : error)
  } finally {
    runningJobs.delete(jobType)
    // Release the distributed lock (only if we acquired it)
    if (ownerToken) {
      try {
        const { releaseCronLock } = await import('./src/server/services/cron-lock.service')
        await releaseCronLock(jobType, ownerToken)
      } catch {
        // Non-fatal — lock will expire via TTL
      }
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  Salfanet Cron Runner — thin scheduler (HTTP → /api/cron)')
  console.log(`  API URL: ${API_URL}`)
  console.log(`  CRON_SECRET: ${CRON_SECRET ? 'set' : 'NOT SET — will use session auth'}`)
  console.log('═══════════════════════════════════════════════════════════')

  // Manual trigger: --job=xxx
  const jobArg = process.argv.find(a => a.startsWith('--job='))
  if (jobArg) {
    const jobType = jobArg.split('=')[1]
    const def = CRON_JOB_DEFS.find(d => d.type === jobType)
    if (!def) {
      console.error(`Unknown job: ${jobType}`)
      console.log('Available jobs:', CRON_JOB_DEFS.map(d => d.type).join(', '))
      process.exit(1)
    }
    console.log(`Manual trigger: ${jobType}`)
    await runJob(jobType)
    await prisma.$disconnect()
    process.exit(0)
  }

  // Schedule all jobs
  const tasks: ReturnType<typeof cron.schedule>[] = []
  for (const def of CRON_JOB_DEFS) {
    const { schedule, enabled } = await getEffectiveSchedule(def.type)
    if (!enabled) {
      console.log(`  [SKIP] ${def.type} — disabled`)
      continue
    }

    if (!cron.validate(schedule)) {
      console.log(`  [ERR]  ${def.type} — invalid schedule: ${schedule}`)
      continue
    }

    const task = cron.schedule(schedule, async () => {
      try { await runJob(def.type) } catch (e) { console.error(`[CRON] Uncaught in ${def.type}:`, e) }
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
