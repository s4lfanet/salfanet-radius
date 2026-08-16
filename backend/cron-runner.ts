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
import { timingSafeEqual } from 'crypto'
import http from 'http'

// ─── Prisma (standalone, for schedule config only) ──────────────────────────

const prisma = new PrismaClient({ log: ['warn', 'error'] })

process.on('uncaughtException', (error) => {
  console.error('[Cron-Runner] uncaughtException:', error)
})
process.on('unhandledRejection', (reason) => {
  console.error('[Cron-Runner] unhandledRejection:', reason)
})

// ─── Timezone helper ────────────────────────────────────────────────────────
// Uses the system timezone (TZ env var or OS default).
// On the VPS, TZ=Asia/Jakarta is set in .env / ecosystem.config.js.
// This avoids manual +7h manipulation — new Date() already returns local time.

function nowLocal(): Date {
  return new Date()
}

// ─── Company timezone (loaded from DB) ──────────────────────────────────────

let companyTimezone = process.env.TZ || 'Asia/Jakarta'

async function loadCompanyTimezone(): Promise<void> {
  try {
    const company = await prisma.company.findFirst({ select: { timezone: true } })
    if (company?.timezone) {
      companyTimezone = company.timezone
      // Also update the timezone module's cache
      try {
        const { setCurrentTimezone } = await import('./src/lib/timezone')
        setCurrentTimezone(company.timezone)
      } catch { /* non-fatal */ }
    }
  } catch {
    // Table might not exist yet — use default
  }
}

// Periodically refresh timezone from DB (every 5 minutes)
// This ensures cron schedule uses the correct timezone even if
// company settings are changed without restarting the cron runner.
setInterval(async () => {
  await loadCompanyTimezone()
}, 5 * 60 * 1000)

// ─── CRON_SECRET validation ─────────────────────────────────────────────────

const CRON_SECRET = process.env.CRON_SECRET || ''
const isProduction = process.env.NODE_ENV === 'production'

if (isProduction && !CRON_SECRET) {
  console.error('[Cron-Runner] FATAL: CRON_SECRET is not set in production. Refusing to start.')
  console.error('[Cron-Runner] Set CRON_SECRET in your .env file to a strong random value.')
  process.exit(1)
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
  { type: 'radius_reconciliation', name: 'RADIUS Reconciliation',  description: 'Daily reconciliation SalfaNet vs FreeRADIUS', defaultSchedule: '0 6 * * *' },
  { type: 'external_task_processor', name: 'External Task Processor', description: 'Process external task outbox (MikroTik, WhatsApp, Email, CoA)', defaultSchedule: '* * * * *' },
  { type: 'financial_reconciliation', name: 'Financial Reconciliation', description: 'Reconcile invoice-payment consistency', defaultSchedule: '0 5 * * *' },
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

// Per-job timeout configuration (seconds).
// Jobs that may take longer get a higher timeout.
const JOB_TIMEOUTS: Record<string, number> = {
  invoice_generate: 300,      // 5 min — generates many invoices
  radius_reconciliation: 300, // 5 min — full DB scan
  radius_sync_retry: 180,     // 3 min — batch processing
  pppoe_session_sync: 180,    // 3 min — MikroTik API calls
  auto_renewal: 180,          // 3 min — per-user processing
  auto_stop: 180,             // 3 min — per-user processing
  notification_check: 180,    // 3 min — bulk notifications
  session_monitor: 180,       // 3 min — session analysis
  external_task_processor: 300, // 5 min — MikroTik API calls (8s timeout each)
}
const DEFAULT_JOB_TIMEOUT = 120 // 2 min

function getJobTimeout(jobType: string): number {
  return (JOB_TIMEOUTS[jobType] || DEFAULT_JOB_TIMEOUT) * 1000
}

/**
 * Trigger a job via HTTP POST to /api/cron.
 * Uses Node.js built-in http module — NO shell curl, so CRON_SECRET
 * is never exposed in the process list (ps/proc).
 * The API route handles all business logic (can import from src/server/*).
 * Returns the job result from the API.
 */
async function triggerJobViaAPI(jobType: string): Promise<{ success?: boolean; error?: string; [key: string]: unknown }> {
  const body = JSON.stringify({ type: jobType })
  const timeout = getJobTimeout(jobType)

  // Parse API_URL to extract host/port
  const url = new URL(API_URL)
  const options: http.RequestOptions = {
    hostname: url.hostname,
    port: url.port || '80',
    path: '/api/cron',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': CRON_SECRET,
      'Content-Length': Buffer.byteLength(body),
    },
  }

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          resolve({ success: false, raw: data.slice(0, 500) })
        }
      })
    })

    req.on('error', (err) => {
      resolve({ success: false, error: `HTTP request failed: ${err.message}` })
    })

    req.setTimeout(timeout, () => {
      req.destroy(new Error('Job timeout'))
      resolve({ success: false, error: `Job timeout after ${timeout / 1000}s` })
    })

    req.write(body)
    req.end()
  })
}

// ─── Job runner with atomic distributed lock + heartbeat + history logging ──

// In-memory guard: prevents overlapping runs within the same process.
// This is an OPTIMIZATION only — not a security/reliability mechanism.
// The DB distributed lock is the authoritative guard.
const runningJobs = new Set<string>()

// Lock TTL — stale locks are reclaimable after this duration.
// Heartbeat renews the lock before this TTL expires.
const LOCK_TTL_MS = 10 * 60 * 1000 // 10 minutes (shorter = faster stale recovery)
const HEARTBEAT_INTERVAL_MS = 3 * 60 * 1000 // 3 minutes (renew at 1/3 of TTL)

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
  //
  // In production: DB lock is REQUIRED. If it fails, the job is NOT run.
  // In development: fall back to in-memory guard only (for convenience).
  let ownerToken: string | null = null
  let lockService: { acquireCronLock: typeof import('./src/server/services/cron-lock.service').acquireCronLock; releaseCronLock: typeof import('./src/server/services/cron-lock.service').releaseCronLock; renewCronLock: typeof import('./src/server/services/cron-lock.service').renewCronLock } | null = null
  try {
    const mod = await import('./src/server/services/cron-lock.service')
    lockService = mod
    ownerToken = await mod.acquireCronLock(jobType, LOCK_TTL_MS)
    if (!ownerToken) {
      console.log(`[${new Date().toISOString()}] [CRON] ${jobType} — skipped (lock held by another instance)`)
      return
    }
  } catch (err) {
    if (isProduction) {
      // PRODUCTION: DB lock is mandatory. Do NOT fall back to in-memory guard.
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`[${new Date().toISOString()}] [CRON] ${jobType} — FATAL: DB lock failed in production. Job NOT run. Error: ${errMsg}`)
      // Record error in cron history
      try {
        const jobId = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        await prisma.cronHistory.create({
          data: {
            id: jobId,
            jobType,
            status: 'error',
            startedAt: nowLocal(),
            completedAt: nowLocal(),
            duration: 0,
            error: `DB lock failed (production): ${errMsg}`,
          },
        })
      } catch { /* non-fatal */ }
      return
    }
    // DEVELOPMENT: fall back to in-memory guard only
    console.warn(`[${new Date().toISOString()}] [CRON] ${jobType} — lock service unavailable (dev mode, using in-memory guard only):`, err instanceof Error ? err.message : err)
  }

  runningJobs.add(jobType)
  const startedAt = nowLocal()
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

  // ─── Heartbeat: renew lock periodically while job is running ──────────────
  let heartbeatTimer: NodeJS.Timeout | null = null
  let lockLost = false

  if (ownerToken && lockService) {
    heartbeatTimer = setInterval(async () => {
      if (!lockService || !ownerToken || lockLost) return
      try {
        const ok = await lockService.renewCronLock(jobType, ownerToken, LOCK_TTL_MS)
        if (!ok) {
          // Lock was lost — another instance may have taken over.
          // Mark lockLost so the job result is NOT recorded as success.
          lockLost = true
          console.error(`[${new Date().toISOString()}] [CRON] ${jobType} — LOCK_LOST: heartbeat renewal failed. Another instance may have taken over.`)
        }
      } catch (err) {
        // Heartbeat error — don't silently continue. Mark as lost.
        lockLost = true
        console.error(`[${new Date().toISOString()}] [CRON] ${jobType} — LOCK_LOST: heartbeat error:`, err instanceof Error ? err.message : err)
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  try {
    const result = await triggerJobViaAPI(jobType)
    const completedAt = nowLocal()
    const duration = completedAt.getTime() - startedAt.getTime()

    // If lock was lost during execution, do NOT record as success.
    // The job may have been executed by another instance too.
    if (lockLost) {
      try {
        await prisma.cronHistory.update({
          where: { id: jobId },
          data: {
            status: 'error',
            completedAt,
            duration,
            error: 'LOCK_LOST: heartbeat failed during execution. Result may be duplicate.',
            result: JSON.stringify(result).slice(0, 1000),
          },
        })
      } catch { /* non-fatal */ }
      console.error(`[${completedAt.toISOString()}] [CRON] ${jobType} — completed but LOCK_LOST (result discarded to prevent duplicate)`)
      return
    }

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
    const completedAt = nowLocal()
    const duration = completedAt.getTime() - startedAt.getTime()
    try {
      await prisma.cronHistory.update({
        where: { id: jobId },
        data: {
          status: 'error',
          completedAt,
          duration,
          error: lockLost
            ? `LOCK_LOST + ${error instanceof Error ? error.message : 'Job failed'}`
            : (error instanceof Error ? error.message : 'Job failed'),
        },
      })
    } catch { /* non-fatal */ }
    console.error(`[${completedAt.toISOString()}] [CRON] ${jobType} — error${lockLost ? ' (LOCK_LOST)' : ''}:`, error instanceof Error ? error.message : error)
  } finally {
    // Stop heartbeat
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    runningJobs.delete(jobType)
    // Release the distributed lock (only if we acquired it and still own it)
    if (ownerToken && lockService) {
      try {
        await lockService.releaseCronLock(jobType, ownerToken)
      } catch {
        // Non-fatal — lock will expire via TTL
      }
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Load company timezone from DB
  await loadCompanyTimezone()

  console.log('═══════════════════════════════════════════════════════════')
  console.log('  Salfanet Cron Runner — thin scheduler (HTTP → /api/cron)')
  console.log(`  API URL: ${API_URL}`)
  console.log(`  CRON_SECRET: ${CRON_SECRET ? 'set (length: ' + CRON_SECRET.length + ')' : 'NOT SET'}`)
  console.log(`  Timezone: ${companyTimezone}`)
  console.log(`  Lock TTL: ${LOCK_TTL_MS / 1000}s, Heartbeat: ${HEARTBEAT_INTERVAL_MS / 1000}s`)
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`)
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

  // Schedule all jobs using company timezone
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

    // Use company timezone for cron schedule — NOT system timezone.
    // This ensures jobs run at the correct local time regardless of VPS TZ.
    const task = cron.schedule(schedule, async () => {
      try { await runJob(def.type) } catch (e) { console.error(`[CRON] Uncaught in ${def.type}:`, e) }
    }, { timezone: companyTimezone })

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
