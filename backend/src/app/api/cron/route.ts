import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { unauthorized } from '@/lib/api-response'
import { prisma } from '@/server/db/client'
import { nowWIB } from '@/lib/timezone'
import { CRON_JOB_MAP } from '@/server/cron/jobs'
import { runAutoIsolir, runAutoStop } from '@/server/cron/auto-isolir'
import {
  runInvoiceGenerate,
  runInvoiceStatusUpdate,
  runInvoiceReminder,
  runAutoRenewal,
  runDisconnectSessions,
  runSuspendCheck,
} from '@/server/cron/invoice-jobs'

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
    // Allow cron secret bypass or SUPERADMIN
    const cronSecret = process.env.CRON_SECRET
    const headerSecret = request.headers.get('x-cron-secret')
    const hasCronSecret = cronSecret && headerSecret === cronSecret

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
