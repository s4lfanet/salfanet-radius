/**
 * Standalone Next.js Cron Runner — replaces NestJS backend cron scheduler.
 *
 * Usage:
 *   node cron-runner.js                # run all jobs on schedule
 *   node cron-runner.js --job=pppoe_auto_isolir  # trigger single job
 *
 * PM2:
 *   pm2 start cron-runner.js --name salfanet-cron
 *   pm2 save
 */
import cron from 'node-cron'
import { prisma } from './src/server/db/client'
import { CRON_JOB_DEFS, getEffectiveSchedule } from './src/server/cron/jobs'
import { runAutoIsolir, runAutoStop } from './src/server/cron/auto-isolir'
import { nowWIB } from './src/lib/timezone'

// ─── Job implementations ────────────────────────────────────────────────────

async function runJob(jobType: string, fn: () => Promise<any>) {
  // Check if enabled
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
      data: {
        status: 'success',
        completedAt,
        duration,
        result: JSON.stringify(result).slice(0, 1000),
      },
    })
    console.log(`[${completedAt.toISOString()}] [CRON] ${jobType} — success (${duration}ms)`, result)
  } catch (error: any) {
    const completedAt = nowWIB()
    const duration = completedAt.getTime() - startedAt.getTime()
    await prisma.cronHistory.update({
      where: { id: jobId },
      data: {
        status: 'error',
        completedAt,
        duration,
        error: error?.message || 'Job failed',
      },
    })
    console.error(`[${completedAt.toISOString()}] [CRON] ${jobType} — error:`, error?.message || error)
  }
}

// ─── Job registry ───────────────────────────────────────────────────────────

const jobImplementations: Record<string, () => Promise<any>> = {
  pppoe_auto_isolir: () => runAutoIsolir(),
  auto_stop: () => runAutoStop(),
  notification_check: async () => {
    const { NotificationService } = await import('./src/server/services/notifications/dispatcher.service')
    return NotificationService.runNotificationCheck()
  },
  activity_log_cleanup: async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const result = await prisma.activityLog.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } })
    return { deleted: result.count }
  },
  webhook_log_cleanup: async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const result = await prisma.webhookLog.deleteMany({ where: { createdAt: { lt: sevenDaysAgo } } })
    return { deleted: result.count }
  },
  cron_history_cleanup: async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const result = await prisma.cronHistory.deleteMany({ where: { startedAt: { lt: thirtyDaysAgo } } })
    return { deleted: result.count }
  },
  // Jobs that still need implementation or delegate to existing services:
  hotspot_sync: async () => {
    // TODO: implement hotspot sync
    return { success: true, message: 'Hotspot sync — not yet implemented in Next.js cron runner' }
  },
  agent_sales: async () => {
    return { success: true, message: 'Agent sales — not yet implemented' }
  },
  invoice_generate: async () => {
    return { success: true, message: 'Invoice generate — not yet implemented' }
  },
  invoice_reminder: async () => {
    return { success: true, message: 'Invoice reminder — not yet implemented' }
  },
  invoice_status_update: async () => {
    return { success: true, message: 'Invoice status update — not yet implemented' }
  },
  session_monitor: async () => {
    return { success: true, message: 'Session monitor — not yet implemented' }
  },
  disconnect_sessions: async () => {
    return { success: true, message: 'Disconnect sessions — not yet implemented' }
  },
  auto_renewal: async () => {
    return { success: true, message: 'Auto renewal — not yet implemented' }
  },
  freeradius_health: async () => {
    return { success: true, message: 'FreeRADIUS health — not yet implemented' }
  },
  pppoe_session_sync: async () => {
    return { success: true, message: 'PPPoE session sync — not yet implemented' }
  },
  suspend_check: async () => {
    return { success: true, message: 'Suspend check — not yet implemented' }
  },
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  Salfanet Cron Runner — Next.js native')
  console.log('═══════════════════════════════════════════════════════════')

  // Check for --job=xxx flag (manual trigger)
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
  const cronJobs: any[] = []
  for (const def of CRON_JOB_DEFS) {
    const { schedule, enabled } = await getEffectiveSchedule(def.type)
    if (!enabled) {
      console.log(`  [SKIP] ${def.type} — disabled`)
      continue
    }

    const fn = jobImplementations[def.type]
    if (!fn) {
      console.log(`  [SKIP] ${def.type} — no implementation`)
      continue
    }

    // Validate cron expression
    if (!cron.validate(schedule)) {
      console.log(`  [ERR]  ${def.type} — invalid schedule: ${schedule}`)
      continue
    }

    const task = cron.schedule(schedule, async () => {
      try {
        await runJob(def.type, fn)
      } catch (e) {
        console.error(`[CRON] Uncaught error in ${def.type}:`, e)
      }
    })

    cronJobs.push(task)
    console.log(`  [OK]   ${def.type.padEnd(25)} ${schedule.padEnd(15)} ${def.name}`)
  }

  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  ${cronJobs.length} jobs scheduled. Waiting for next tick...`)
  console.log('  Press Ctrl+C to stop.')
  console.log('')

  // Keep process alive
  process.on('SIGINT', async () => {
    console.log('\n[CRON] Shutting down...')
    cronJobs.forEach(j => j.stop())
    await prisma.$disconnect()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('\n[CRON] SIGTERM received, shutting down...')
    cronJobs.forEach(j => j.stop())
    await prisma.$disconnect()
    process.exit(0)
  })
}

main().catch(e => {
  console.error('[CRON] Fatal error:', e)
  process.exit(1)
})
