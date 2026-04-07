import { NextRequest, NextResponse } from 'next/server'
import { getCronHistory, recordAgentSales, generateInvoices, sendInvoiceReminders, disconnectExpiredVoucherSessions, reconcileVoucherTransactions } from '@/server/jobs/voucher-sync'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { unauthorized } from '@/lib/api-response'

// Allow up to 5 minutes for long-running cron jobs (backup + telegram upload)
export const maxDuration = 300;

/**
 * GET /api/cron - Get cron history
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized();

    const history = await getCronHistory()
    
    return NextResponse.json({
      success: true,
      history
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}

/**
 * POST /api/cron - Trigger cron job (cron-service or authenticated admin)
 */
export async function POST(request: NextRequest) {
  try {
    // Auth: accept either CRON_SECRET header or valid admin session
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = request.headers.get('x-cron-secret');
    const userAgent = request.headers.get('user-agent');

    const isCronService = 
      (cronSecret && headerSecret === cronSecret) ||
      userAgent === 'SALFANET-CRON-SERVICE';

    if (!isCronService) {
      // Fallback: check for authenticated SUPER_ADMIN session
      const session = await getServerSession(authOptions);
      if (!session || session.user.role !== 'SUPER_ADMIN') {
        return unauthorized();
      }
    }

    const body = await request.json().catch(() => ({}))
    const jobType = body.type || 'voucher_sync'
    
    console.log('[CRON API] Received job type:', jobType, 'Body:', body)
    
    let result: any
    
    switch (jobType) {
      case 'hotspot_sync':
      case 'voucher_sync': // Backward compatibility
        const { syncHotspotWithRadius } = await import('@/server/jobs/hotspot-sync')
        result = await syncHotspotWithRadius()
        return NextResponse.json({
          success: result.success,
          activated: result.activated,
          expired: result.expired,
          message: result.message,
          error: result.error
        })
        
      case 'pppoe_auto_isolir':
      case 'auto_isolir': // Backward compatibility
        const { autoIsolatePPPoEUsers } = await import('@/server/jobs/pppoe-sync')
        result = await autoIsolatePPPoEUsers()
        return NextResponse.json({
          success: result.success,
          isolated: result.isolated,
          error: result.error
        })
        
      case 'agent_sales':
        result = await recordAgentSales()
        return NextResponse.json({
          success: result.success,
          recorded: result.recorded,
          error: result.error
        })
        
      case 'invoice_generate':
        // force=true allows manual triggers to bypass billingDay date check for POSTPAID
        result = await generateInvoices(body.force === true)
        return NextResponse.json({
          success: result.success,
          generated: result.generated,
          skipped: result.skipped,
          error: result.error
        })
        
      case 'invoice_reminder':
        // Pass force=true to bypass time check for manual trigger
        result = await sendInvoiceReminders(true)
        return NextResponse.json({
          success: result.success,
          sent: result.sent,
          skipped: result.skipped,
          error: result.error
        })
        
      case 'invoice_status_update':
        const { updateInvoiceStatus } = await import('@/server/jobs/invoice-status-updater')
        result = await updateInvoiceStatus()
        return NextResponse.json({
          success: result.success,
          updated: result.updated,
          error: result.error
        })
        
      case 'notification_check':
        const { NotificationService } = await import('@/server/services/notifications/dispatcher.service')
        result = await NotificationService.runNotificationCheck()
        return NextResponse.json(result)
        
      case 'auto_isolir_users':
        const { autoIsolateExpiredUsers } = await import('@/server/jobs/voucher-sync')
        result = await autoIsolateExpiredUsers()
        return NextResponse.json({
          success: result.success,
          isolated: result.isolated,
          error: result.error
        })
        
      case 'telegram_backup':
        const { autoBackupToTelegram } = await import('@/server/jobs/telegram-cron')
        result = await autoBackupToTelegram()
        return NextResponse.json({
          success: result.success,
          error: result.error
        })
        
      case 'telegram_health':
        const { sendHealthCheckToTelegram } = await import('@/server/jobs/telegram-cron')
        result = await sendHealthCheckToTelegram()
        return NextResponse.json({
          success: result.success,
          error: result.error
        })
        
      case 'disconnect_sessions':
        result = await disconnectExpiredVoucherSessions()
        return NextResponse.json({
          success: result.success,
          disconnected: result.disconnected,
          error: result.error
        })

      case 'keuangan_reconcile':
        const reconciledCount = await reconcileVoucherTransactions()
        return NextResponse.json({
          success: true,
          reconciled: reconciledCount,
          message: `Reconciled ${reconciledCount} missing keuangan transaction(s) for hotspot vouchers`,
        })
        
      case 'activity_log_cleanup':
        const { cleanOldActivities } = await import('@/server/services/activity-log.service')
        result = await cleanOldActivities(30)
        return NextResponse.json({
          success: result.success,
          deleted: result.deleted,
          error: result.error
        })
        
      case 'auto_renewal':
        const { processAutoRenewal } = await import('@/server/jobs/auto-renewal')
        result = await processAutoRenewal()
        return NextResponse.json({
          success: true,
          processed: result.processed,
          paid: result.success,
          failed: result.failed,
          message: `Processed ${result.processed} users, paid ${result.success}, failed ${result.failed}`
        })
        
      case 'webhook_log_cleanup':
        const { prisma } = await import('@/server/db/client')
        const { nanoid } = await import('nanoid')
        
        const startedAt = new Date()
        
        // Create history record
        const history = await prisma.cronHistory.create({
          data: {
            id: nanoid(),
            jobType: 'webhook_log_cleanup',
            status: 'running',
            startedAt,
          },
        })
        
        try {
          const cutoffDate = new Date()
          cutoffDate.setDate(cutoffDate.getDate() - 30)
          
          const deleteResult = await prisma.webhookLog.deleteMany({
            where: {
              createdAt: { lt: cutoffDate }
            }
          })
          
          const completedAt = new Date()
          const duration = completedAt.getTime() - startedAt.getTime()
          
          // Update history with success
          await prisma.cronHistory.update({
            where: { id: history.id },
            data: {
              status: 'success',
              completedAt,
              duration,
              result: `Deleted ${deleteResult.count} webhook logs older than 30 days`,
            },
          })
          
          return NextResponse.json({
            success: true,
            deleted: deleteResult.count,
            cutoffDate: cutoffDate.toISOString(),
            message: `Deleted ${deleteResult.count} webhook logs older than 30 days`
          })
        } catch (cleanupError: any) {
          // Update history with error
          await prisma.cronHistory.update({
            where: { id: history.id },
            data: {
              status: 'error',
              completedAt: new Date(),
              error: cleanupError.message,
            },
          })
          
          return NextResponse.json({
            success: false,
            deleted: 0,
            error: cleanupError.message
          })
        }
        
      case 'session_monitor':
        const { SessionMonitor } = await import('@/server/services/session-monitor.service')
        result = await SessionMonitor.runAllChecks()
        return NextResponse.json({
          success: result.success,
          error: result.error
        })
        
      case 'freeradius_health':
        const { freeradiusHealthCheck } = await import('@/server/jobs/freeradius-health')
        result = await freeradiusHealthCheck(true) // auto-restart enabled
        return NextResponse.json({
          success: result.success,
          status: result.status,
          action: result.action,
          error: result.error,
          message: result.action === 'restarted' 
            ? 'FreeRADIUS was down and has been restarted'
            : result.action === 'restart_failed'
            ? 'FreeRADIUS restart failed - manual intervention required'
            : result.action === 'nas_synced'
            ? 'FreeRADIUS is healthy — NAS config was out of sync and has been reloaded'
            : 'FreeRADIUS is healthy'
        })

      case 'pppoe_session_sync':
        try {
          const { syncPPPoESessions } = await import('@/server/jobs/pppoe-session-sync')
          const syncPppoeResult = await syncPPPoESessions()
          return NextResponse.json({
            success: syncPppoeResult.success,
            inserted: syncPppoeResult.inserted,
            closed: syncPppoeResult.closed,
            routers: syncPppoeResult.routers,
            routerErrors: syncPppoeResult.routerErrors,
            message: `Inserted: ${syncPppoeResult.inserted}, Closed: ${syncPppoeResult.closed}, Routers: ${syncPppoeResult.routers}`,
            error: syncPppoeResult.error,
          })
        } catch (pppoeErr: any) {
          return NextResponse.json({ success: false, error: pppoeErr.message })
        }

      case 'sync_online_users':
        return NextResponse.json({ success: true, message: 'Redis removed, sync not needed', synced: 0, removed: 0 })

      case 'suspend_check':
        try {
          const { prisma: suspendPrisma } = await import('@/server/db/client')
          const now = new Date()

          // 1. Activate pending suspends (startDate <= now, status = APPROVED, user still active)
          const toSuspend = await suspendPrisma.suspendRequest.findMany({
            where: { status: 'APPROVED', startDate: { lte: now } },
            include: { user: { select: { id: true, status: true } } },
          })
          let suspended = 0
          for (const sr of toSuspend) {
            if (sr.user.status === 'active') {
              await suspendPrisma.pppoeUser.update({
                where: { id: sr.userId },
                data: { status: 'stopped' },
              })
              suspended++
            }
          }

          // 2. Restore users whose suspend endDate has passed
          const toRestore = await suspendPrisma.suspendRequest.findMany({
            where: { status: 'APPROVED', endDate: { lte: now } },
            include: { user: { select: { id: true, status: true } } },
          })
          let restored = 0
          for (const sr of toRestore) {
            if (sr.user.status === 'stopped') {
              await suspendPrisma.pppoeUser.update({
                where: { id: sr.userId },
                data: { status: 'active' },
              })
              restored++
            }
            // Mark request as COMPLETED
            await suspendPrisma.suspendRequest.update({
              where: { id: sr.id },
              data: { status: 'COMPLETED' },
            })
          }

          return NextResponse.json({
            success: true,
            suspended,
            restored,
            message: `Suspend check: ${suspended} suspended, ${restored} restored`,
          })
        } catch (suspendErr: any) {
          return NextResponse.json({ success: false, error: suspendErr.message })
        }

      case 'cron_history_cleanup':
        try {
          const { cleanupOldHistory } = await import('@/server/jobs/helpers')
          await cleanupOldHistory()
          return NextResponse.json({ success: true, message: 'Cron history cleaned up' })
        } catch (cleanupErr: any) {
          return NextResponse.json({ success: false, error: cleanupErr.message })
        }

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid job type'
        }, { status: 400 })
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
