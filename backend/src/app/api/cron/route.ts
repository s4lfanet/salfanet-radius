import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { unauthorized } from '@/lib/api-response'
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
import { timingSafeEqual } from 'crypto'

/**
 * Timing-safe string comparison to prevent timing attacks on CRON_SECRET.
 * Returns true if both strings are equal (same length + same bytes).
 */
function safeCompare(a: string, b: string): boolean {
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
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 })
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
    // When called from the cron-runner (authenticated via CRON_SECRET), the
    // runner already holds the distributed lock with heartbeat — so we skip
    // locking here to avoid a double-lock deadlock. The runner is the
    // authoritative lock holder.
    //
    // For manual admin triggers (no CRON_SECRET), the API route acquires its
    // own lock to prevent concurrent manual + automated execution.
    let ownerToken: string | null = null
    if (!hasCronSecret) {
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
      // Release the lock only if we acquired it (manual admin trigger).
      // Cron-runner holds its own lock with heartbeat.
      if (ownerToken) {
        await releaseCronLock(jobType, ownerToken).catch(() => {})
      }
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 })
  }
}

// ─── Simple job implementations ─────────────────────────────────────────────

async function runNotificationCheck() {
  const { NotificationService } = await import('@/server/services/notifications/dispatcher.service')
  return await NotificationService.runNotificationCheck()
}

async function runActivityLogCleanup() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const result = await prisma.activityLog.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } })
  return { deleted: result.count }
}

async function runWebhookLogCleanup() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const result = await prisma.webhookLog.deleteMany({ where: { createdAt: { lt: sevenDaysAgo } } })
  return { deleted: result.count }
}

async function runCronHistoryCleanup() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const result = await prisma.cronHistory.deleteMany({ where: { startedAt: { lt: thirtyDaysAgo } } })
  return { deleted: result.count }
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
