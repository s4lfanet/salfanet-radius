import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { unauthorized, safeErrorResponse } from '@/lib/api-response'
import { prisma } from '@/server/db/client'
import { nowWIB } from '@/lib/timezone'
import { CRON_JOB_MAP } from '@/server/cron/jobs'
import { acquireCronLock, releaseCronLock } from '@/server/services/cron-lock.service'
import { runAutoIsolir, runAutoStop } from '@/server/cron/auto-isolir'
import {
  runInvoiceGenerate,
  runInvoiceStatusUpdate,
  runInvoiceReminder,
  runAutoRenewal,
  runDisconnectSessions,
  runSuspendCheck,
} from '@/server/cron/invoice-jobs'
import {
  runHotspotSync,
  runAgentSales,
  runSessionMonitor,
  runPppoeSessionSync,
} from '@/server/cron/additional-jobs'
import { fetchAllVoucherStatusesFromMikrotik } from '@/server/services/mikrotik/hotspot-voucher.service'
import { syncVoucherStatusFromRadius } from '@/server/services/radius/hotspot-sync.service'
import { timingSafeEqual } from 'crypto'

/**
 * Timing-safe string comparison to prevent timing attacks on CRON_SECRET.
 * Returns true if both strings are equal (same length + same bytes).
 * Fail-closed: empty strings always return false, even if both are empty.
 */
function safeCompare(a: string, b: string): boolean {
  // Fail-closed: reject empty strings regardless of match.
  // This prevents accidental authentication when secrets are not configured.
  if (!a || !b || a.length === 0 || b.length === 0) return false
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return unauthorized()

    // Return recent cron history
    const history = await prisma.cronHistory.findMany({
      orderBy: { startedAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ success: true, history })
  } catch (error: any) {
    return safeErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    // ─── Authentication: CRON_SECRET or SUPERADMIN session ──────────────────
    const cronSecret = process.env.CRON_SECRET || ''
    const headerSecret = request.headers.get('x-cron-secret') || ''

    // In production: CRON_SECRET must be set.
    if (process.env.NODE_ENV === 'production' && !cronSecret) {
      console.error('[CRON API] FATAL: CRON_SECRET is not set in production.')
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // Timing-safe comparison to prevent timing attacks.
    const hasCronSecret = cronSecret && headerSecret && safeCompare(headerSecret, cronSecret)

    let user = 'system'
    if (!hasCronSecret) {
      const session = await getServerSession(authOptions)
      if (!session || (session as any).user?.role !== 'SUPER_ADMIN') {
        return unauthorized()
      }
      user = (session as any).user?.email || 'admin'
    }

    const body = await request.json().catch(() => ({}))
    const jobType = body.type || 'pppoe_auto_isolir'

    const def = CRON_JOB_MAP.get(jobType)
    if (!def) {
      return NextResponse.json({ success: false, error: `Unknown job type: ${jobType}` }, { status: 400 })
    }

    // ─── Atomic distributed lock ─────────────────────────────────────────────
    // Prevents duplicate concurrent execution across multiple instances.
    //
    // When called via CRON_SECRET (from cron-runner), SKIP the API-level lock
    // because the cron-runner already holds its own lock. The cron-runner's
    // lock is the authoritative guard — acquiring a second lock here would
    // always fail (deadlock: runner holds lock → API tries same lock → fails).
    //
    // When called via admin session (manual trigger from UI), acquire the lock
    // to prevent concurrent execution with the cron-runner.
    let ownerToken: string | null = null
    if (!hasCronSecret) {
      // Manual trigger from admin UI — acquire lock
      ownerToken = await acquireCronLock(jobType)
      if (!ownerToken) {
        return NextResponse.json(
          { success: false, error: `Job ${jobType} is already running (lock held)` },
          { status: 409 }
        )
      }
    }

    // Create history record
    const jobId = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    const startedAt = nowWIB()
    await prisma.cronHistory.create({
      data: { id: jobId, jobType, status: 'running', startedAt },
    })

    try {
      let result: any

      switch (jobType) {
        case 'pppoe_auto_isolir':
          result = await runAutoIsolir()
          break
        case 'auto_stop':
          result = await runAutoStop()
          break
        case 'invoice_generate':
          result = await runInvoiceGenerate()
          break
        case 'invoice_status_update':
          result = await runInvoiceStatusUpdate()
          break
        case 'invoice_reminder':
          result = await runInvoiceReminder()
          break
        case 'auto_renewal':
          result = await runAutoRenewal()
          break
        case 'disconnect_sessions':
          result = await runDisconnectSessions()
          break
        case 'suspend_check':
          result = await runSuspendCheck()
          break
        case 'notification_check':
          result = await runNotificationCheck()
          break
        case 'activity_log_cleanup':
          result = await runActivityLogCleanup()
          break
        case 'webhook_log_cleanup':
          result = await runWebhookLogCleanup()
          break
        case 'cron_history_cleanup':
          result = await runCronHistoryCleanup()
          break
        case 'freeradius_health':
          result = await runFreeradiusHealth()
          break
        case 'hotspot_sync':
          result = await runHotspotSync()
          break
        case 'agent_sales':
          result = await runAgentSales()
          break
        case 'session_monitor':
          result = await runSessionMonitor()
          break
        case 'pppoe_session_sync':
          result = await runPppoeSessionSync()
          break
        case 'radius_sync_retry':
          result = await runRadiusSyncRetry()
          break
        case 'radius_reconciliation':
          result = await runRadiusReconciliation()
          break
        case 'external_task_processor':
          result = await runExternalTaskProcessor()
          break
        case 'financial_reconciliation':
          result = await runFinancialReconciliation()
          break
        case 'hotspot_voucher_sync':
          result = {
            mikrotik: await fetchAllVoucherStatusesFromMikrotik(),
            radius: await syncVoucherStatusFromRadius(),
          }
          break
        default:
          result = { success: true, message: `Job ${jobType} not yet implemented` }
      }

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

      return NextResponse.json({ success: true, message: `${def.name} completed`, result })
    } catch (jobError: any) {
      const completedAt = nowWIB()
      const duration = completedAt.getTime() - startedAt.getTime()
      await prisma.cronHistory.update({
        where: { id: jobId },
        data: {
          status: 'error',
          completedAt,
          duration,
          error: jobError?.message || 'Job failed',
        },
      })
      throw jobError
    } finally {
      // Always release the lock (we always acquire it now).
      if (ownerToken) {
        await releaseCronLock(jobType, ownerToken).catch(() => {})
      }
    }
  } catch (error: any) {
    return safeErrorResponse(error)
  }
}

// ─── Simple job implementations ─────────────────────────────────────────────

async function runNotificationCheck() {
  const { NotificationService } = await import('@/server/services/notifications/dispatcher.service')
  return await NotificationService.runNotificationCheck()
}

async function runActivityLogCleanup() {
  const thirtyDaysAgo = new Date(nowWIB().getTime() - 30 * 24 * 60 * 60 * 1000)
  const result = await prisma.activityLog.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } })
  return { deleted: result.count }
}

async function runWebhookLogCleanup() {
  const sevenDaysAgo = new Date(nowWIB().getTime() - 7 * 24 * 60 * 60 * 1000)
  const result = await prisma.webhookLog.deleteMany({ where: { createdAt: { lt: sevenDaysAgo } } })
  return { deleted: result.count }
}

async function runCronHistoryCleanup() {
  const thirtyDaysAgo = new Date(nowWIB().getTime() - 30 * 24 * 60 * 60 * 1000)
  // Batch delete to avoid long table locks on large cron_history tables.
  // Deletes in chunks of 5,000 rows until no more old records remain.
  let totalDeleted = 0
  const BATCH_SIZE = 5000
  for (let i = 0; i < 100; i++) { // safety cap: 100 iterations = 500k rows max
    const result = await prisma.$executeRaw`
      DELETE FROM cron_history
      WHERE id IN (
        SELECT id FROM (
          SELECT id FROM cron_history WHERE startedAt < ${thirtyDaysAgo} LIMIT ${BATCH_SIZE}
        ) AS t
      )
    `
    const affected = Number(result)
    totalDeleted += affected
    if (affected < BATCH_SIZE) break // no more rows to delete
    // Small delay between batches to reduce lock contention
    await new Promise((r) => setTimeout(r, 200))
  }
  return { deleted: totalDeleted }
}

async function runFreeradiusHealth() {
  try {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    const { stdout } = await execAsync('systemctl is-active freeradius', { timeout: 5000 })
    const healthy = stdout.trim() === 'active'
    return { healthy, status: stdout.trim() }
  } catch (e: any) {
    return { healthy: false, error: e?.message }
  }
}

async function runRadiusSyncRetry() {
  const { processRetryQueue } = await import('@/server/services/radius/radius-sync-queue.service')
  return await processRetryQueue(50)
}

async function runExternalTaskProcessor() {
  const { processExternalTasks } = await import('@/server/services/external-task-processor.service')
  return await processExternalTasks()
}

async function runFinancialReconciliation() {
  const { runFinancialReconciliation: reconcile } = await import('@/server/cron/financial-reconciliation')
  return await reconcile()
}

/**
 * Daily RADIUS reconciliation — detects drift between SalfaNet DB and FreeRADIUS.
 * Does NOT auto-delete stale users. Only reports mismatches for admin review.
 * Stale users with existing delete queue entries are tracked but not re-queued.
 */
async function runRadiusReconciliation() {
  const { runReconciliation } = await import('@/server/services/radius/radius-reconciliation.service')
  const report = await runReconciliation()

  console.log('[CRON] RADIUS Reconciliation:', {
    totalSalfaNetUsers: report.totalSalfaNetUsers,
    totalRadiusUsers: report.totalRadiusUsers,
    missingInRadius: report.missingInRadius.length,
    staleInRadius: report.staleInRadius.length,
    mismatchPassword: report.mismatchPassword.length,
    mismatchProfile: report.mismatchProfile.length,
    mismatchIp: report.mismatchIp.length,
    knownStale: report.summary.knownStaleCount,
    unknownStale: report.summary.unknownStaleCount,
    deleteQueued: report.summary.deleteQueuedCount,
  })

  return {
    success: true,
    totalSalfaNetUsers: report.totalSalfaNetUsers,
    totalRadiusUsers: report.totalRadiusUsers,
    issues: report.summary.totalIssues,
    critical: report.summary.criticalCount,
    warnings: report.summary.warningCount,
    missingInRadius: report.missingInRadius.length,
    staleInRadius: report.staleInRadius.length,
    mismatchPassword: report.mismatchPassword.length,
    mismatchProfile: report.mismatchProfile.length,
    mismatchIp: report.mismatchIp.length,
    knownStale: report.summary.knownStaleCount,
    unknownStale: report.summary.unknownStaleCount,
    deleteQueued: report.summary.deleteQueuedCount,
  }
}
