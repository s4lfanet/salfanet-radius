import { prisma } from '@/server/db/client'
import { disconnectExpiredSessions, disconnectPPPoEUser, sendCoADisconnect } from '@/server/services/radius/coa-handler.service'
import { nanoid } from 'nanoid'
import { randomBytes } from 'crypto'
import { startBackupCron, startHealthCron } from './telegram-cron'
import { nowWIB, formatWIB, startOfDayWIBtoUTC, endOfDayWIBtoUTC } from '@/lib/timezone'

let isRunning = false
let isAutoIsolirRunning = false

/**
 * Sync voucher status from RADIUS authentication logs
 */
export async function syncVoucherFromRadius(): Promise<{ success: boolean; synced: number; error?: string }> {
  if (isRunning) {
    return { success: false, synced: 0, error: 'Already running' }
  }

  isRunning = true
  const startedAt = new Date()

  // Create history record in database
  const history = await prisma.cronHistory.create({
    data: {
      id: nanoid(),
      jobType: 'voucher_sync',
      status: 'running',
      startedAt,
    },
  })

  try {
    let syncedCount = 0

    // Sync voucher status from radacct (WAITING -> ACTIVE)
    // Get WAITING vouchers that have active sessions in radacct
    const waitingVouchers = await prisma.hotspotVoucher.findMany({
      where: {
        status: 'WAITING',
      },
      select: {
        id: true,
        code: true,
        profile: true,
      },
    })

    for (const voucher of waitingVouchers) {
      // Check if voucher has an active session (first login)
      const activeSession = await prisma.radacct.findFirst({
        where: {
          username: voucher.code,
          acctstarttime: { not: null },
        },
        orderBy: {
          acctstarttime: 'asc', // Get first login
        },
      })

      if (activeSession && activeSession.acctstarttime) {
        // FreeRADIUS acctstarttime from radacct - already in server local time (WIB)
        // Store as-is, no conversion needed
        const firstLoginAt = activeSession.acctstarttime instanceof Date
          ? activeSession.acctstarttime
          : new Date(activeSession.acctstarttime)

        let expiresAtMs = firstLoginAt.getTime()        // Add validity time in milliseconds
        if (voucher.profile.validityUnit === 'MINUTES') {
          expiresAtMs += voucher.profile.validityValue * 60 * 1000
        } else if (voucher.profile.validityUnit === 'HOURS') {
          expiresAtMs += voucher.profile.validityValue * 60 * 60 * 1000
        } else if (voucher.profile.validityUnit === 'DAYS') {
          expiresAtMs += voucher.profile.validityValue * 24 * 60 * 60 * 1000
        } else if (voucher.profile.validityUnit === 'MONTHS') {
          // For months, use Date manipulation to handle month boundaries
          const expiresAt = new Date(firstLoginAt)
          expiresAt.setMonth(expiresAt.getMonth() + voucher.profile.validityValue)
          expiresAtMs = expiresAt.getTime()
        }

        const expiresAt = new Date(expiresAtMs)

        // Update voucher to ACTIVE with server local time (WIB)
        const updatedVoucher = await prisma.hotspotVoucher.update({
          where: { id: voucher.id },
          data: {
            status: 'ACTIVE',
            firstLoginAt: firstLoginAt,
            expiresAt: expiresAt,
          },
          include: {
            profile: true,
            order: true,
            agent: true,
          },
        })

        console.log(`[CRON] Voucher ${voucher.code} activated: firstLogin=${firstLoginAt.toISOString()}, expires=${expiresAt.toISOString()}`)

        // Auto-sync to Keuangan (only for manually generated vouchers, not e-voucher orders)
        if (!updatedVoucher.orderId) {
          try {
            const hotspotCategory = await prisma.transactionCategory.findFirst({
              where: { name: 'Pembayaran Hotspot', type: 'INCOME' },
            })

            if (hotspotCategory) {
              // Check if transaction already exists
              const existingTransaction = await prisma.transaction.findFirst({
                where: { reference: `VOUCHER-${updatedVoucher.code}` },
              })

              if (!existingTransaction) {
                // Check if this is an agent voucher
                const isAgentVoucher = updatedVoucher.agentId !== null;
                const hasResellerFee = updatedVoucher.profile.resellerFee > 0;

                // Income = sellingPrice (harga jual ke customer)
                const incomeAmount = updatedVoucher.profile.sellingPrice;

                await prisma.transaction.create({
                  data: {
                    id: nanoid(),
                    categoryId: hotspotCategory.id,
                    type: 'INCOME',
                    amount: incomeAmount,
                    description: `Voucher ${updatedVoucher.profile.name} - ${updatedVoucher.code}${isAgentVoucher ? ' (Agent)' : ''}`,
                    date: firstLoginAt,
                    reference: `VOUCHER-${updatedVoucher.code}`,
                    notes: `Pendapatan voucher hotspot (Harga Jual: Rp ${incomeAmount}, Harga Modal: Rp ${updatedVoucher.profile.costPrice})`,
                  },
                })
                console.log(`[CRON] Keuangan synced for voucher ${voucher.code} - Income Rp ${incomeAmount}`)

                // If agent voucher, also record commission expense
                // Net profit = sellingPrice - resellerFee
                if (isAgentVoucher && hasResellerFee) {
                  const agentCategory = await prisma.transactionCategory.findFirst({
                    where: { name: 'Komisi Agent', type: 'EXPENSE' },
                  })

                  if (agentCategory) {
                    const existingCommission = await prisma.transaction.findFirst({
                      where: { reference: `COMMISSION-${updatedVoucher.code}` },
                    })

                    if (!existingCommission) {
                      // Get agent name from included relation
                      const agentName = updatedVoucher.agent?.name || 'Unknown';
                      const commissionAmount = updatedVoucher.profile.resellerFee;
                      const netProfit = incomeAmount - commissionAmount;

                      await prisma.transaction.create({
                        data: {
                          id: nanoid(),
                          categoryId: agentCategory.id,
                          type: 'EXPENSE',
                          amount: commissionAmount,
                          description: `Komisi Agent ${agentName} - Voucher ${updatedVoucher.code}`,
                          date: firstLoginAt,
                          reference: `COMMISSION-${updatedVoucher.code}`,
                          notes: `Komisi agent untuk voucher ${updatedVoucher.profile.name} (Net Profit: Rp ${netProfit})`,
                        },
                      })
                      console.log(`[CRON] Agent commission synced for voucher ${voucher.code} - Rp ${commissionAmount} (Net: Rp ${netProfit})`)
                    }
                  }
                }
              }
            }
          } catch (keuanganError) {
            console.error(`[CRON] Keuangan sync error for ${voucher.code}:`, keuanganError)
          }
        }

        syncedCount++
      }
    }

    // Check and mark expired vouchers (by validity time OR usage duration)
    // IMPORTANT: Use raw SQL for performance
    // Database stores datetime in UTC, NOW() returns UTC (MySQL timezone is UTC)

    // FIRST: Disconnect any active sessions for vouchers that are ALREADY EXPIRED
    // This catches vouchers that were marked EXPIRED in previous runs but session wasn't disconnected
    console.log('[CRON] Checking for active sessions with expired vouchers...')
    const alreadyExpiredWithSession = await prisma.radacct.findMany({
      where: {
        acctstoptime: null, // Active session
      },
      select: {
        username: true,
        acctsessionid: true,
        framedipaddress: true,
        nasipaddress: true,
      },
    })

    let alreadyDisconnectedCount = 0
    for (const session of alreadyExpiredWithSession) {
      // Check if this is a voucher and if it's EXPIRED
      const voucher = await prisma.hotspotVoucher.findUnique({
        where: { code: session.username },
        include: { router: true }, // IMPORTANT: Include router from voucher
      })

      if (!voucher) continue // Not a voucher (might be PPPoE)

      if (voucher.status === 'EXPIRED') {
        console.log(`[CRON] Found active session for EXPIRED voucher ${session.username} - disconnecting`)

        // PRIORITY 1: Use router from voucher (routerId relation)
        let nas = voucher.router

        // FALLBACK: Try to find router by session NAS IP (if voucher has no router)
        if (!nas) {
          nas = await prisma.router.findFirst({
            where: {
              OR: [
                { nasname: session.nasipaddress },
                { ipAddress: session.nasipaddress },
              ]
            },
          })
        }

        // LAST RESORT: Use first active router
        if (!nas) {
          nas = await prisma.router.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
          })
        }

        if (nas) {
          // Prefer ipAddress over nasname for CoA target
          const coaTargetIp = nas.ipAddress || nas.nasname

          const coaResult = await sendCoADisconnect(
            session.username,
            coaTargetIp,
            nas.secret,
            session.acctsessionid,
            session.framedipaddress
          )

          if (coaResult.success) {
            alreadyDisconnectedCount++
            console.log(`[CRON] ✓ Disconnected already-expired ${session.username} from ${nas.name} (${coaTargetIp})`)
          } else {
            console.error(`[CRON] ✗ Failed to disconnect ${session.username}:`, coaResult.error)
          }
        } else {
          console.error(`[CRON] ✗ No router found for voucher ${session.username}`)
        }
      }
    }

    if (alreadyDisconnectedCount > 0) {
      console.log(`[CRON] Disconnected ${alreadyDisconnectedCount} sessions for already-expired vouchers`)
    }

    // Method 1: Expired by validity time (expiresAt < NOW)
    // IMPORTANT: Use NOW() not UTC_TIMESTAMP() because expiresAt is stored in server local time (WIB)
    // firstLoginAt comes from FreeRADIUS radacct which uses server local time
    const expiredByValidity = await prisma.$queryRaw<Array<{ code: string; id: string }>>`
      SELECT code, id FROM hotspot_vouchers
      WHERE status = 'ACTIVE'
        AND expiresAt < NOW()
    `

    // Method 2: Expired by usage duration (total acctsessiontime >= usageDuration)
    // Get ACTIVE vouchers with usageDuration limit
    const activeVouchersWithDuration = await prisma.hotspotVoucher.findMany({
      where: {
        status: 'ACTIVE',
        profile: {
          usageDuration: { not: null }
        }
      },
      select: {
        id: true,
        code: true,
        profile: {
          select: {
            usageDuration: true
          }
        }
      }
    })

    const expiredByDuration: Array<{ code: string; id: string }> = []

    // Check each voucher's total session time
    for (const voucher of activeVouchersWithDuration) {
      if (!voucher.profile.usageDuration) continue

      // Convert duration to seconds (assuming HOURS as default unit)
      let maxDurationSeconds = 0

      // usageDuration is stored in hours in the database
      maxDurationSeconds = voucher.profile.usageDuration * 60 * 60

      // Sum all session times for this voucher (including closed sessions)
      const totalUsage = await prisma.radacct.aggregate({
        where: {
          username: voucher.code
        },
        _sum: {
          acctsessiontime: true
        }
      })

      const usedSeconds = totalUsage._sum.acctsessiontime || 0

      if (usedSeconds >= maxDurationSeconds) {
        expiredByDuration.push({
          code: voucher.code,
          id: voucher.id
        })
        console.log(`[CRON] Voucher ${voucher.code} expired by duration: ${usedSeconds}s / ${maxDurationSeconds}s`)
      }
    }

    // Combine both expiry methods (remove duplicates)
    const allExpiredVouchers = [
      ...expiredByValidity,
      ...expiredByDuration.filter(d => !expiredByValidity.find(v => v.id === d.id))
    ]

    console.log(`[CRON] Found ${allExpiredVouchers.length} expired vouchers (${expiredByValidity.length} by validity, ${expiredByDuration.length} by duration)`)

    // Mark expired vouchers, remove from RADIUS, and disconnect active sessions
    let expiredCount = 0
    let disconnectedCount = 0

    for (const voucher of allExpiredVouchers) {
      try {
        // Get full voucher data with router relation
        const fullVoucher = await prisma.hotspotVoucher.findUnique({
          where: { id: voucher.id },
          include: { router: true },
        })

        if (!fullVoucher) continue

        // 1. Update status to EXPIRED (NO DELETE - keep in database for history)
        await prisma.hotspotVoucher.update({
          where: { id: voucher.id },
          data: { status: 'EXPIRED' }
        })

        // 2. Remove from RADIUS authentication tables (prevent re-login)
        await prisma.radcheck.deleteMany({
          where: { username: voucher.code }
        })
        await prisma.radusergroup.deleteMany({
          where: { username: voucher.code }
        })

        // 3. Check if has active session and disconnect immediately
        const activeSession = await prisma.radacct.findFirst({
          where: {
            username: voucher.code,
            acctstoptime: null,
          },
          select: {
            acctsessionid: true,
            framedipaddress: true,
            nasipaddress: true,
          }
        })

        if (activeSession) {
          console.log(`[CRON] Voucher ${voucher.code} has active session - disconnecting via CoA`)

          // PRIORITY 1: Use router from voucher (routerId relation)
          let nas = fullVoucher.router

          // FALLBACK: Try to find router by session NAS IP
          if (!nas) {
            nas = await prisma.router.findFirst({
              where: {
                OR: [
                  { nasname: activeSession.nasipaddress },
                  { ipAddress: activeSession.nasipaddress },
                ]
              },
            })
          }

          // LAST RESORT: Use first active router
          if (!nas) {
            nas = await prisma.router.findFirst({
              where: { isActive: true },
              orderBy: { createdAt: 'desc' },
            })
          }

          if (nas) {
            // Prefer ipAddress over nasname for CoA target
            const coaTargetIp = nas.ipAddress || nas.nasname

            // Send CoA Disconnect
            const coaResult = await sendCoADisconnect(
              voucher.code,
              coaTargetIp,
              nas.secret,
              activeSession.acctsessionid,
              activeSession.framedipaddress
            )

            if (coaResult.success) {
              disconnectedCount++
              console.log(`[CRON] ✓ Disconnected ${voucher.code} from ${nas.name} (${coaTargetIp})`)
            } else {
              console.error(`[CRON] ✗ Failed to disconnect ${voucher.code}:`, coaResult.error)
            }
          } else {
            console.error(`[CRON] ✗ No router found for voucher ${voucher.code}`)
          }
        }

        expiredCount++
        console.log(`[CRON] Voucher ${voucher.code} marked as EXPIRED and removed from RADIUS`)
      } catch (err) {
        console.error(`[CRON] Error processing expired voucher ${voucher.code}:`, err)
      }
    }

    // Update history in database
    const completedAt = new Date()
    await prisma.cronHistory.update({
      where: { id: history.id },
      data: {
        status: 'success',
        completedAt,
        duration: completedAt.getTime() - startedAt.getTime(),
        result: `Synced ${syncedCount} vouchers, expired ${expiredCount} vouchers (${expiredByValidity.length} by validity, ${expiredByDuration.length} by duration), disconnected ${disconnectedCount} newly-expired + ${alreadyDisconnectedCount} already-expired sessions`,
      },
    })

    console.log(`[CRON] Voucher sync completed: synced=${syncedCount}, expired=${expiredCount} (validity=${expiredByValidity.length}, duration=${expiredByDuration.length}), disconnected=${disconnectedCount} new + ${alreadyDisconnectedCount} already-expired`)

    // Create notification for bulk session disconnects
    const totalDisconnected = disconnectedCount + alreadyDisconnectedCount
    if (totalDisconnected > 0) {
      try {
        const { NotificationService } = await import('@/server/services/notifications/dispatcher.service')
        await NotificationService.notifyBulkSessionDisconnect(totalDisconnected)
      } catch (notifError: any) {
        console.error('[Voucher Sync] Failed to create session disconnect notification:', notifError.message)
      }
    }

    // ---- Reconcile: backfill missing keuangan transactions ----
    try {
      const reconciled = await reconcileVoucherTransactions()
      if (reconciled > 0) {
        console.log(`[CRON] Reconciled ${reconciled} missing keuangan transaction(s) for hotspot vouchers`)
      }
    } catch (reconcileErr) {
      console.error('[CRON] Reconcile error (non-fatal):', reconcileErr)
    }

    return { success: true, synced: syncedCount }

  } catch (error: any) {
    console.error('Voucher sync error:', error)

    // Update history with error
    const completedAt = new Date()
    await prisma.cronHistory.update({
      where: { id: history.id },
      data: {
        status: 'error',
        completedAt,
        duration: completedAt.getTime() - startedAt.getTime(),
        error: error.message,
      },
    })

    return { success: false, synced: 0, error: error.message }
  } finally {
    isRunning = false
  }
}

/**
 * Reconcile missing keuangan transactions for hotspot vouchers.
 * Finds ACTIVE/EXPIRED vouchers (without orderId) that were used
 * but never got a corresponding Transaction record, and creates them.
 */
export async function reconcileVoucherTransactions(): Promise<number> {
  let count = 0

  // Find manually-sold vouchers (no online order) that have been used
  const usedVouchers = await prisma.hotspotVoucher.findMany({
    where: {
      status: { in: ['ACTIVE', 'EXPIRED'] },
      firstLoginAt: { not: null },
      orderId: null,
    },
    include: {
      profile: true,
      agent: { select: { id: true, name: true } },
    },
  })

  if (usedVouchers.length === 0) return 0

  const hotspotCategory = await prisma.transactionCategory.findFirst({
    where: { name: 'Pembayaran Hotspot', type: 'INCOME' },
  })

  if (!hotspotCategory) return 0

  for (const voucher of usedVouchers) {
    // Check if income transaction already exists
    const existingTransaction = await prisma.transaction.findFirst({
      where: { reference: `VOUCHER-${voucher.code}` },
    })

    if (existingTransaction) continue

    const incomeAmount = voucher.profile.sellingPrice
    const txDate = voucher.firstLoginAt!
    const isAgentVoucher = voucher.agentId !== null

    try {
      await prisma.transaction.create({
        data: {
          id: nanoid(),
          categoryId: hotspotCategory.id,
          type: 'INCOME',
          amount: incomeAmount,
          description: `Voucher ${voucher.profile.name} - ${voucher.code}${isAgentVoucher ? ' (Agent)' : ''}`,
          date: txDate,
          reference: `VOUCHER-${voucher.code}`,
          notes: `[Rekonsiliasi] Pendapatan voucher hotspot (Harga Jual: Rp ${incomeAmount}, Harga Modal: Rp ${voucher.profile.costPrice})`,
        },
      })
      count++
      console.log(`[Reconcile] Created transaction for voucher ${voucher.code} - Rp ${incomeAmount}`)

      // If agent voucher with reseller fee, create commission expense if missing
      if (isAgentVoucher && voucher.profile.resellerFee > 0) {
        const agentCategory = await prisma.transactionCategory.findFirst({
          where: { name: 'Komisi Agent', type: 'EXPENSE' },
        })
        if (agentCategory) {
          const existingCommission = await prisma.transaction.findFirst({
            where: { reference: `COMMISSION-${voucher.code}` },
          })
          if (!existingCommission) {
            await prisma.transaction.create({
              data: {
                id: nanoid(),
                categoryId: agentCategory.id,
                type: 'EXPENSE',
                amount: voucher.profile.resellerFee,
                description: `Komisi Agent ${voucher.agent?.name || 'Unknown'} - Voucher ${voucher.code}`,
                date: txDate,
                reference: `COMMISSION-${voucher.code}`,
                notes: `[Rekonsiliasi] Komisi agent untuk voucher ${voucher.profile.name}`,
              },
            })
          }
        }
      }
    } catch (err) {
      console.error(`[Reconcile] Error creating transaction for voucher ${voucher.code}:`, err)
    }
  }

  return count
}

/**
 * Record agent sales for active vouchers
 */
export async function recordAgentSales(): Promise<{ success: boolean; recorded: number; error?: string }> {
  const startedAt = new Date()

  const history = await prisma.cronHistory.create({
    data: {
      id: nanoid(),
      jobType: 'agent_sales',
      status: 'running',
      startedAt,
    },
  })

  try {
    // Get all ACTIVE vouchers that have agent batch codes (contains hyphen pattern)
    const activeVouchers = await prisma.hotspotVoucher.findMany({
      where: {
        status: 'ACTIVE',
        batchCode: {
          not: null,
        },
        firstLoginAt: {
          not: null,
        },
      },
      include: {
        profile: true,
      },
    })

    let recordedCount = 0

    for (const voucher of activeVouchers) {
      // Skip if batch code doesn't look like agent format (no hyphen)
      if (!voucher.batchCode?.includes('-')) {
        continue
      }

      // Check if sale already recorded
      const existingSale = await prisma.agentSale.findFirst({
        where: {
          voucherCode: voucher.code,
        },
      })

      if (existingSale) {
        continue // Already recorded
      }

      // Extract agent name from batch code (format: AGENTNAME-TIMESTAMP)
      const agentNamePattern = voucher.batchCode.split('-')[0]

      // Find agent by matching name pattern (case-insensitive for MySQL)
      const agent = await prisma.agent.findFirst({
        where: {
          name: {
            equals: agentNamePattern,
          },
        },
      })

      if (!agent) {
        continue // Skip if agent not found
      }

      try {
        // Record sale with resellerFee as agent profit
        await prisma.agentSale.create({
          data: {
            id: crypto.randomUUID(),
            agentId: agent.id,
            voucherCode: voucher.code,
            profileName: voucher.profile.name,
            amount: voucher.profile.resellerFee,
            createdAt: voucher.firstLoginAt!,
          },
        })

        recordedCount++
      } catch (error: any) {
        console.error(`Failed to record sale for ${voucher.code}:`, error.message)
      }
    }

    const completedAt = new Date()
    await prisma.cronHistory.update({
      where: { id: history.id },
      data: {
        status: 'success',
        completedAt,
        duration: completedAt.getTime() - startedAt.getTime(),
        result: `Recorded ${recordedCount} agent sales`,
      },
    })

    return { success: true, recorded: recordedCount }
  } catch (error: any) {
    console.error('Agent sales recording error:', error)

    const completedAt = new Date()
    await prisma.cronHistory.update({
      where: { id: history.id },
      data: {
        status: 'error',
        completedAt,
        duration: completedAt.getTime() - startedAt.getTime(),
        error: error.message,
      },
    })

    return { success: false, recorded: 0, error: error.message }
  }
}

/**
 * Get cron history from database
 */
export async function getCronHistory(limit: number = 50) {
  return await prisma.cronHistory.findMany({
    orderBy: { startedAt: 'desc' },
    take: limit,
  })
}

/**
 * Initialize cron jobs that are NOT handled by cron-service.js (PM2)
 * 
 * Most cron jobs are scheduled by the standalone cron-service.js which calls
 * POST /api/cron. Only Telegram backup/health crons need to run from within
 * the Next.js process because they use dynamic schedules from DB settings.
 */
export function initCronJobs() {
  // Initialize Telegram backup & health check crons (dynamic schedule from DB)
  // These are NOT in cron-service.js because their schedules come from telegramBackupSettings
  startBackupCron().catch(err => console.error('[CRON] Failed to start Telegram backup:', err))
  startHealthCron().catch(err => console.error('[CRON] Failed to start Telegram health:', err))

  console.log('[CRON] Telegram backup & health check crons initialized (other jobs handled by cron-service.js)')
}

/**
 * Send invoice reminder WhatsApp notifications based on settings
 * @param force - If true, bypass time check (for manual trigger from UI)
 */
export async function sendInvoiceReminders(force: boolean = false): Promise<{ success: boolean; sent: number; skipped: number; error?: string }> {
  const startedAt = new Date()

  const history = await prisma.cronHistory.create({
    data: {
      id: nanoid(),
      jobType: 'invoice_reminder',
      status: 'running',
      startedAt,
    },
  })

  try {
    // Get reminder settings
    const settings = await prisma.whatsapp_reminder_settings.findFirst()

    console.log('[Invoice Reminder] Settings:', settings)

    if (!settings || !settings.enabled) {
      const message = !settings ? 'No settings found' : 'Reminder disabled'
      console.log(`[Invoice Reminder] ${message}`)
      const completedAt = new Date()
      await prisma.cronHistory.update({
        where: { id: history.id },
        data: {
          status: 'success',
          completedAt,
          duration: completedAt.getTime() - startedAt.getTime(),
          result: `${message}, skipped`,
        },
      })
      return { success: true, sent: 0, skipped: 0 }
    }

    const reminderDays: number[] = JSON.parse(settings.reminderDays)
    const [targetHour, targetMinute] = settings.reminderTime.split(':').map(Number)

    // Get current WIB time (WIB-as-UTC format)
    const now = nowWIB()
    const currentHour = now.getUTCHours()
    const currentMinute = now.getUTCMinutes()

    // Check if current time matches reminder time (skip check if force=true for manual trigger)
    if (!force && currentHour !== targetHour) {
      const completedAt = new Date()
      await prisma.cronHistory.update({
        where: { id: history.id },
        data: {
          status: 'success',
          completedAt,
          duration: completedAt.getTime() - startedAt.getTime(),
          result: `Not time yet (current: ${currentHour}:${currentMinute}, target: ${targetHour}:${targetMinute})`,
        },
      })
      return { success: true, sent: 0, skipped: 0 }
    }

    console.log(`[Invoice Reminder] ${force ? 'Force triggered (manual)' : 'Time matched'}, proceeding...`)

    let sentCount = 0
    let skippedCount = 0

    // Add overdue reminders: days after due date (positive values = days after due)
    // Comprehensive coverage: 1-10, 14, 21, 28 days overdue
    const overdueDays = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 21, 28]
    const allReminderDays = [...reminderDays, ...overdueDays]

    console.log(`[Invoice Reminder] Processing ${allReminderDays.length} reminder schedules...`)
    console.log(`[Invoice Reminder] Before due: ${reminderDays}, After due (overdue): ${overdueDays}`)

    // For each reminder day, find invoices that match
    for (const reminderDay of allReminderDays) {
      // reminderDay is negative or 0: -5 means 5 days before due, 0 means due date
      // Calculate target due date in WIB: if reminderDay is -5, we want invoices due in 5 days from now
      const nowInWIB = nowWIB()
      // Use UTC methods since nowWIB returns WIB-as-UTC
      const targetMs = Date.UTC(nowInWIB.getUTCFullYear(), nowInWIB.getUTCMonth(), nowInWIB.getUTCDate() - reminderDay)
      const targetDateWIB = new Date(targetMs)

      // Get WIB date boundaries for database query (WIB-as-UTC)
      const targetDateUTC = startOfDayWIBtoUTC(targetDateWIB)
      const nextDayUTC = endOfDayWIBtoUTC(targetDateWIB)

      console.log(`[Invoice Reminder] Checking H${reminderDay}: Looking for invoices due on ${formatWIB(targetDateWIB, 'yyyy-MM-dd')} WIB`)

      // Find unpaid invoices (PENDING or OVERDUE) with dueDate matching target (database stores UTC)
      const invoices = await prisma.invoice.findMany({
        where: {
          status: {
            in: ['PENDING', 'OVERDUE']
          },
          dueDate: {
            gte: targetDateUTC,
            lt: nextDayUTC
          }
        },
        include: {
          user: {
            include: {
              profile: true,
              area: true
            }
          }
        }
      })

      console.log(`[Invoice Reminder] Found ${invoices.length} invoices for H${reminderDay}`)

      // Get company info once (shared for all invoices)
      const company = await prisma.company.findFirst()

      if (!company) {
        console.log(`[Invoice Reminder] No company info found, skipping ${invoices.length} invoices`)
        skippedCount += invoices.length
        continue
      }

      // Filter and prepare messages for batch sending with rate limiting
      const messagesToSend: Array<{
        phone: string
        message: string
        data: {
          invoice: typeof invoices[0]
          reminderDay: number
        }
      }> = []

      for (const invoice of invoices) {
        // Skip if user has stopped subscription
        if (invoice.user && invoice.user.status === 'stop') {
          console.log(`[Invoice Reminder] Skipped ${invoice.invoiceNumber}: User has stopped subscription`)
          skippedCount++
          continue
        }

        // Check if this reminder day already sent
        const sentReminders = invoice.sentReminders
          ? JSON.parse(invoice.sentReminders)
          : []

        if (sentReminders.includes(reminderDay)) {
          console.log(`[Invoice Reminder] Skipped ${invoice.invoiceNumber}: H${reminderDay} already sent`)
          skippedCount++
          continue
        }

        if (!invoice.customerPhone) {
          console.log(`[Invoice Reminder] Skipped ${invoice.invoiceNumber}: No customer phone`)
          skippedCount++
          continue
        }

        // Add to batch queue (we'll build message later in sendFunction)
        messagesToSend.push({
          phone: invoice.customerPhone,
          message: '', // Will be built in sendFunction
          data: { invoice, reminderDay }
        })
      }

      // Send messages with rate limiting (5 msg per 10 seconds)
      if (messagesToSend.length > 0) {
        console.log(`[Invoice Reminder] Sending ${messagesToSend.length} reminders with rate limiting...`)

        const { sendWithRateLimit, estimateSendTime, formatEstimatedTime } = await import('@/lib/utils/rateLimiter')
        const { sendInvoiceReminder } = await import('@/server/services/notifications/whatsapp-templates.service')

        const estimatedTime = estimateSendTime(messagesToSend.length)
        console.log(`[Invoice Reminder] Estimated time: ${formatEstimatedTime(estimatedTime)}`)

        const result = await sendWithRateLimit(
          messagesToSend,
          async (msg) => {
            const { invoice, reminderDay } = msg.data

            // Determine if overdue (reminderDay > 0 means days after due date)
            const isOverdue = reminderDay > 0

            // Get customer name with proper fallback
            const customerName = invoice.customerName || invoice.user?.name || 'Pelanggan'

            // Send WhatsApp reminder with appropriate template
            await sendInvoiceReminder({
              phone: invoice.customerPhone!,
              customerName: customerName,
              customerId: (invoice.user as any)?.customerId || undefined,
              customerUsername: invoice.customerUsername || invoice.user?.username,
              profileName: (invoice.user as any)?.profile?.name,
              area: (invoice.user as any)?.area?.name,
              invoiceNumber: invoice.invoiceNumber,
              amount: invoice.amount,
              dueDate: invoice.dueDate,
              paymentLink: invoice.paymentLink || '',
              companyName: company.name,
              companyPhone: company.phone || '',
              isOverdue: isOverdue
            })

            // Also send email reminder if email is available
            const customerEmail = invoice.customerEmail || invoice.user?.email
            if (customerEmail) {
              try {
                const { EmailService } = await import('@/server/services/notifications/email.service')
                await EmailService.sendInvoiceReminder({
                  email: customerEmail,
                  customerId: (invoice.user as any)?.customerId || undefined,
                  profileName: (invoice.user as any)?.profile?.name,
                  area: (invoice.user as any)?.area?.name,
                  customerName: customerName,
                  customerUsername: invoice.customerUsername || invoice.user?.username,
                  invoiceNumber: invoice.invoiceNumber,
                  amount: invoice.amount,
                  dueDate: invoice.dueDate,
                  paymentLink: invoice.paymentLink || '',
                  companyName: company.name,
                  companyPhone: company.phone || '',
                  isOverdue: isOverdue,
                  daysOverdue: isOverdue ? reminderDay : undefined
                })
              } catch (emailError) {
                console.error(`[Invoice Reminder] Email error for ${invoice.invoiceNumber}:`, emailError)
                // Don't fail the whole process if email fails
              }
            }

            // Also send push notification via FCM
            if (invoice.user?.id) {
              try {
                const { sendPushToUser } = await import('@/server/services/notifications/push-templates.service')
                await sendPushToUser(
                  invoice.user.id,
                  isOverdue ? 'invoice-overdue' : 'invoice-reminder',
                  {
                    customerName: customerName,
                    username: (invoice.user as any)?.username || '',
                    invoiceNumber: invoice.invoiceNumber,
                    amount: invoice.amount,
                    dueDate: invoice.dueDate,
                    profileName: (invoice.user as any)?.profile?.name,
                    isOverdue: isOverdue,
                    daysOverdue: isOverdue ? reminderDay : undefined,
                    companyName: company.name,
                    companyPhone: company.phone || '',
                  }
                )
              } catch (pushError) {
                console.error(`[Invoice Reminder] Push notification error for ${invoice.invoiceNumber}:`, pushError)
              }
            }

            // Mark this reminder as sent
            const sentReminders = invoice.sentReminders
              ? JSON.parse(invoice.sentReminders)
              : []
            sentReminders.push(reminderDay)

            await prisma.invoice.update({
              where: { id: invoice.id },
              data: {
                sentReminders: JSON.stringify(sentReminders)
              }
            })
          },
          {}, // Use default config: 5 msg/10sec
          (progress) => {
            console.log(`[Invoice Reminder] Progress: ${progress.current}/${progress.total} (Batch ${progress.batch}/${progress.totalBatches})`)
          }
        )

        sentCount += result.sent
        skippedCount += result.failed

        console.log(`[Invoice Reminder] Batch H${reminderDay} completed: ${result.sent} sent, ${result.failed} failed`)
      }
    }

    const completedAt = new Date()
    await prisma.cronHistory.update({
      where: { id: history.id },
      data: {
        status: 'success',
        completedAt,
        duration: completedAt.getTime() - startedAt.getTime(),
        result: `Sent ${sentCount} reminders, skipped ${skippedCount}`,
      },
    })

    return { success: true, sent: sentCount, skipped: skippedCount }
  } catch (error: any) {
    console.error('Invoice reminder error:', error)

    const completedAt = new Date()
    await prisma.cronHistory.update({
      where: { id: history.id },
      data: {
        status: 'error',
        completedAt,
        duration: completedAt.getTime() - startedAt.getTime(),
        error: error.message,
      },
    })

    return { success: false, sent: 0, skipped: 0, error: error.message }
  }
}

/**
 * Auto-isolir PPPoE users with expired expiredAt date
 * Runs every 1 hour to check and isolate expired users
 */
export async function autoIsolateExpiredUsers(): Promise<{ success: boolean; isolated: number; error?: string }> {
  if (isAutoIsolirRunning) {
    return { success: false, isolated: 0, error: 'Already running' }
  }

  isAutoIsolirRunning = true
  const startedAt = new Date()

  const history = await prisma.cronHistory.create({
    data: {
      id: nanoid(),
      jobType: 'auto_isolir',
      status: 'running',
      startedAt,
    },
  })

  try {
    // IMPORTANT: Use timezone-aware comparison for isolir
    // User sees expiry in WIB, so we isolate at END of that WIB day
    // Example: expired 5 Nov (WIB) → isolate at 6 Nov 00:00 (WIB) = 5 Nov 17:00 (UTC)
    const nowInWIB = nowWIB()
    const startOfTodayWIB = startOfDayWIBtoUTC(nowInWIB)

    console.log(`[Auto Isolir] Checking for expired users...`)
    console.log(`[Auto Isolir] Now (WIB): ${formatWIB(nowInWIB)}`)
    console.log(`[Auto Isolir] Start of today (WIB -> UTC): ${startOfTodayWIB.toISOString()}`)

    // Find users to isolate:
    // 1. PREPAID: expired (expiredAt < today) AND no successful auto-renewal
    // 2. POSTPAID: expired (expiredAt < today) AND has OVERDUE invoice
    // In both cases: only isolate if autoIsolationEnabled = true

    // A. Find PREPAID users that are expired
    // Exclude users with successful auto-renewal (check if they have recent paid invoice)
    const expiredPrepaidUsers = await prisma.pppoeUser.findMany({
      where: {
        status: 'active',
        subscriptionType: 'PREPAID',
        autoIsolationEnabled: true,
        expiredAt: {
          lt: startOfTodayWIB, // expired before start of today (WIB)
        },
      },
      include: {
        profile: true,
        invoices: {
          where: {
            status: { in: ['PENDING', 'OVERDUE'] }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      },
    })

    // Filter: Only isolate if has unpaid invoice (auto-renewal failed or disabled)
    const prepaidToIsolate = expiredPrepaidUsers.filter(user => {
      // If has unpaid invoice, isolate
      if (user.invoices.length > 0) return true;
      // If no invoice and no auto-renewal, isolate
      if (!user.autoRenewal) return true;
      // If auto-renewal enabled but no invoice, means renewal succeeded - don't isolate
      return false;
    });

    // B. Find POSTPAID users that are expired
    // POSTPAID juga punya expiredAt (billing day bulan berikutnya)
    // Isolate jika expired DAN ada invoice OVERDUE
    const expiredPostpaidUsers = await prisma.pppoeUser.findMany({
      where: {
        status: 'active',
        subscriptionType: 'POSTPAID',
        autoIsolationEnabled: true,
        expiredAt: {
          lt: startOfTodayWIB, // expired before start of today (WIB)
        },
      },
      include: {
        profile: true,
        invoices: {
          where: {
            status: { in: ['PENDING', 'OVERDUE'] }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      },
    });

    // Filter: Only isolate if has OVERDUE invoice
    const postpaidToIsolate = expiredPostpaidUsers.filter(user => {
      return user.invoices.length > 0 && user.invoices[0].status === 'OVERDUE';
    });

    const expiredUsers = [...prepaidToIsolate, ...postpaidToIsolate]

    if (expiredUsers.length === 0) {
      console.log('[Auto Isolir] No expired users found')

      const completedAt = new Date()
      await prisma.cronHistory.update({
        where: { id: history.id },
        data: {
          status: 'success',
          completedAt,
          duration: completedAt.getTime() - startedAt.getTime(),
          result: 'No expired users found',
        },
      })

      return { success: true, isolated: 0 }
    }

    console.log(`[Auto Isolir] Found ${expiredUsers.length} user(s) to isolate (${prepaidToIsolate.length} PREPAID expired, ${postpaidToIsolate.length} POSTPAID expired+overdue)`)

    let isolatedCount = 0
    const errors: string[] = []

    for (const user of expiredUsers) {
      try {
        // Update user status to isolated
        await prisma.pppoeUser.update({
          where: { id: user.id },
          data: { status: 'isolated' },
        })

        // Update RADIUS: move to isolir group
        // 1. Keep password in radcheck
        await prisma.$executeRaw`
          INSERT INTO radcheck (username, attribute, op, value)
          VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password})
          ON DUPLICATE KEY UPDATE value = ${user.password}
        `

        // 2. Move to isolir group (maps to MikroTik profile 'isolir')
        await prisma.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${user.username}
        `
        await prisma.$executeRaw`
          INSERT INTO radusergroup (username, groupname, priority)
          VALUES (${user.username}, 'isolir', 1)
        `

        // 3. Remove static IP so user gets IP from MikroTik pool-isolir
        await prisma.$executeRaw`
          DELETE FROM radreply WHERE username = ${user.username} AND attribute = 'Framed-IP-Address'
        `

        // 4. Send CoA disconnect to force re-authentication
        const coaResult = await disconnectPPPoEUser(user.username)
        console.log(`[Auto Isolir] CoA disconnect for ${user.username}:`, coaResult.success ? 'Success' : 'Failed')

        // 5. Send push notification about isolation
        try {
          const { sendPushToUser } = await import('@/server/services/notifications/push-templates.service')
          const isolirCompany = await prisma.company.findFirst()
          // Find overdue invoice for amount/dueDate context
          const overdueInvoice = user.invoices?.[0]
          await sendPushToUser(user.id, 'isolation-notice', {
            customerName: user.name || user.username,
            username: user.username,
            amount: overdueInvoice?.amount,
            dueDate: overdueInvoice?.dueDate,
            invoiceNumber: overdueInvoice?.invoiceNumber,
            companyName: isolirCompany?.name || '',
            companyPhone: isolirCompany?.phone || '',
          })
        } catch (pushError: any) {
          console.error(`[Auto Isolir] Push notification error for ${user.username}:`, pushError.message)
        }

        isolatedCount++
        console.log(`✅ [Auto Isolir] User ${user.username} isolated (expired: ${user.expiredAt?.toISOString().split('T')[0]})`)
      } catch (error: any) {
        errors.push(`${user.username}: ${error.message}`)
        console.error(`❌ [Auto Isolir] Failed to isolate ${user.username}:`, error.message)
      }
    }

    const completedAt = new Date()
    await prisma.cronHistory.update({
      where: { id: history.id },
      data: {
        status: errors.length === expiredUsers.length ? 'error' : 'success',
        completedAt,
        duration: completedAt.getTime() - startedAt.getTime(),
        result: `Isolated ${isolatedCount}/${expiredUsers.length} expired users`,
        error: errors.length > 0 ? errors.join('; ') : undefined,
      },
    })

    return {
      success: true,
      isolated: isolatedCount
    }
  } catch (error: any) {
    console.error('[Auto Isolir] Error:', error)

    const completedAt = new Date()
    await prisma.cronHistory.update({
      where: { id: history.id },
      data: {
        status: 'error',
        completedAt,
        duration: completedAt.getTime() - startedAt.getTime(),
        error: error.message,
      },
    })

    return { success: false, isolated: 0, error: error.message }
  } finally {
    isAutoIsolirRunning = false
  }
}

/**
 * Generate invoices for users expiring in 7 days
 * Direct database call instead of HTTP fetch to avoid network issues
 */
export async function generateInvoices(force = false): Promise<{ success: boolean; generated: number; skipped: number; error?: string }> {
  const startedAt = new Date()

  const history = await prisma.cronHistory.create({
    data: {
      id: nanoid(),
      jobType: 'invoice_generate',
      status: 'running',
      startedAt,
    },
  })

  try {
    console.log('[Invoice Generate] Starting invoice generation (cron)...')
    if (force) console.log('[Invoice Generate] FORCE mode: billingDay check bypassed for POSTPAID')

    const now = nowWIB();
    let generated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Include isolated/blocked users because they may need invoice to pay and reactivate
    // EXCLUDE 'stop' status - users who have stopped subscription should NOT get new invoices
    const eligibleStatuses = [
      'active',
      'isolated',
      'blocked',
      'suspended',
      'ACTIVE',
      'ISOLATED',
      'BLOCKED',
      'SUSPENDED',
    ]

    // Get company settings for invoice generation window
    const company = await prisma.company.findFirst();
    const baseUrl = company?.baseUrl || 'http://localhost:3000';
    const invoiceGenerateDays = company?.invoiceGenerateDays ?? 7;

    // ========================================
    // PREPAID: Users expiring H-(invoiceGenerateDays) to H+30 (invoice generation window)
    // ========================================
    const prepaidStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + invoiceGenerateDays, 0, 0, 0));

    const prepaidEndDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 30, 23, 59, 59, 999));

    const prepaidUsers = await prisma.pppoeUser.findMany({
      where: {
        status: { in: eligibleStatuses },
        subscriptionType: 'PREPAID',
        expiredAt: {
          gte: prepaidStartDate,
          lte: prepaidEndDate,
        },
      },
      include: {
        profile: true,
        area: true,
        router: true,
      },
    });

    console.log(`[Invoice Generate] Found ${prepaidUsers.length} PREPAID users (range: H+${invoiceGenerateDays} to H+30)`);  

    // ========================================
    // POSTPAID: tagihan tetap — generate invoiceGenerateDays before billingDay.
    // Each POSTPAID user has a billingDay (default 1). Invoice is generated
    // invoiceGenerateDays before that day so customer has time to pay.
    // Due date = next billingDay occurrence.
    // Force mode bypasses the date window check (for manual testing).
    // ========================================

    // Helper: calculate the next billingDay occurrence from today
    const getNextBillingDay = (bd: number): Date => {
      const thisMonthLastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
      const day = Math.min(bd, thisMonthLastDay);
      const thisMonthBD = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, 23, 59, 59, 999));
      if (thisMonthBD.getTime() >= now.getTime()) {
        return thisMonthBD;
      }
      // Next month
      const nextMonth = now.getUTCMonth() + 1;
      const nextYear = nextMonth > 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
      const nm = nextMonth % 12;
      const nextMonthLastDay = new Date(Date.UTC(nextYear, nm + 1, 0)).getUTCDate();
      return new Date(Date.UTC(nextYear, nm, Math.min(bd, nextMonthLastDay), 23, 59, 59, 999));
    };

    const allPostpaidUsers = await prisma.pppoeUser.findMany({
      where: {
        status: { in: eligibleStatuses },
        subscriptionType: 'POSTPAID',
      },
      include: {
        profile: true,
        area: true,
        router: true,
      },
    });

    // Filter: only users whose next billingDay is within invoiceGenerateDays
    const postpaidUsers = force ? allPostpaidUsers : allPostpaidUsers.filter(user => {
      const bd = user.billingDay ?? 1;
      const nextBD = getNextBillingDay(bd);
      const diffMs = nextBD.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
      return diffDays >= 0 && diffDays <= invoiceGenerateDays;
    });

    if (force) {
      console.log(`[Invoice Generate] Found ${postpaidUsers.length} POSTPAID users (FORCE mode — date window bypassed)`);
    } else {
      console.log(`[Invoice Generate] Found ${postpaidUsers.length}/${allPostpaidUsers.length} POSTPAID users within ${invoiceGenerateDays}-day window`);
    }

    // ========================================
    // CATCH-UP: Isolated/blocked/suspended users whose expiredAt is ALREADY PAST
    // These users missed the normal H+7~H+30 window and need an invoice to pay & reactivate
    // ========================================
    const catchUpUsers = await prisma.pppoeUser.findMany({
      where: {
        status: { in: ['isolated', 'ISOLATED', 'blocked', 'BLOCKED', 'suspended', 'SUSPENDED'] },
        subscriptionType: { in: ['PREPAID', 'POSTPAID'] },
        expiredAt: {
          lt: prepaidStartDate, // Already past the normal window
        },
        // Only include users who do NOT already have a PENDING/OVERDUE invoice
        invoices: {
          none: {
            status: { in: ['PENDING', 'OVERDUE'] },
          },
        },
      },
      include: {
        profile: true,
        area: true,
        router: true,
      },
    });

    console.log(`[Invoice Generate] Found ${catchUpUsers.length} catch-up users (isolated/expired, no pending invoice)`);

    const users = [...prepaidUsers, ...postpaidUsers, ...catchUpUsers];

    if (users.length === 0) {
      const completedAt = new Date();
      await prisma.cronHistory.update({
        where: { id: history.id },
        data: {
          status: 'success',
          completedAt,
          duration: completedAt.getTime() - startedAt.getTime(),
          result: 'No users need invoice generation today',
        },
      });
      return { success: true, generated: 0, skipped: 0 };
    }

    console.log(`[Invoice Generate] Total ${users.length} users to process`);

    // Get current month/year for invoice numbering
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');

    // Get existing invoice count for this month
    let invoiceCount = await prisma.invoice.count({
      where: {
        invoiceNumber: {
          startsWith: `INV-${year}${month}-`,
        },
      },
    });

    // company & baseUrl already fetched above (before date calculations)

    for (const user of users) {
      try {
        // Check if user already has unpaid invoice (any time)
        const existingInvoice = await prisma.invoice.findFirst({
          where: {
            userId: user.id,
            status: {
              in: ['PENDING', 'OVERDUE'],
            },
          },
        });

        if (existingInvoice) {
          skipped++;
          console.log(`⏭️  Skipped ${user.username} - Already has unpaid invoice (${existingInvoice.invoiceNumber})`);
          continue;
        }

        // Check if user already has a PAID invoice covering the same billing period.
        // This prevents generating a duplicate invoice right after a user renews/extends
        // (their expiredAt gets pushed forward into the generation window, but they already paid).
        if (user.expiredAt) {
          const dueDateStart = new Date(user.expiredAt.getTime() - 2 * 24 * 60 * 60 * 1000); // -2 days tolerance
          const dueDateEnd   = new Date(user.expiredAt.getTime() + 2 * 24 * 60 * 60 * 1000); // +2 days tolerance
          const paidInvoiceForPeriod = await prisma.invoice.findFirst({
            where: {
              userId: user.id,
              status: 'PAID',
              dueDate: { gte: dueDateStart, lte: dueDateEnd },
            },
          });
          if (paidInvoiceForPeriod) {
            skipped++;
            console.log(`⏭️  Skipped ${user.username} - Already has PAID invoice for this period (${paidInvoiceForPeriod.invoiceNumber}, dueDate=${paidInvoiceForPeriod.dueDate.toISOString().slice(0, 10)})`);
            continue;
          }
        }

        // For POSTPAID: check if there's a PAID invoice for the upcoming billingDay period (±5 days tolerance)
        if (user.subscriptionType === 'POSTPAID') {
          const bd = user.billingDay ?? 1;
          const nextBD = getNextBillingDay(bd);
          const bdStart = new Date(nextBD.getTime() - 5 * 24 * 60 * 60 * 1000);
          const bdEnd   = new Date(nextBD.getTime() + 5 * 24 * 60 * 60 * 1000);
          const paidForBillingDay = await prisma.invoice.findFirst({
            where: {
              userId: user.id,
              status: 'PAID',
              dueDate: { gte: bdStart, lte: bdEnd },
            },
          });
          if (paidForBillingDay) {
            skipped++;
            console.log(`⏭️  Skipped ${user.username} - Already has PAID invoice for billingDay ${nextBD.toISOString().slice(0, 10)} (${paidForBillingDay.invoiceNumber})`);
            continue;
          }
        }

        // Get amount from profile
        if (!user.profile) {
          skipped++;
          console.log(`⏭️  Skipped ${user.username} - No profile assigned`);
          continue;
        }

        // Skip users who are still in their FIRST billing period.
        // New customers should not receive a renewal invoice immediately on the same day
        // they register or while they haven't completed their first paid period yet.
        // force=true bypasses this check so manual triggers always work.
        if (!force) {
          const userCreatedAt = new Date(user.createdAt);
          if (user.subscriptionType === 'PREPAID' && user.expiredAt) {
            // First period window: createdAt + 31 days (adds 1-day buffer for billing cycles)
            const firstPeriodEnd = new Date(userCreatedAt.getTime() + 31 * 24 * 60 * 60 * 1000);
            if (user.expiredAt <= firstPeriodEnd) {
              skipped++;
              console.log(`⏭️  Skipped ${user.username} - PREPAID first billing period (created: ${userCreatedAt.toISOString().slice(0, 10)}, expires: ${user.expiredAt.toISOString().slice(0, 10)})`);
              continue;
            }
          }
          if (user.subscriptionType === 'POSTPAID') {
            // For POSTPAID: skip if user was created within the CURRENT billing period.
            // Current billing period started on billingDay of THIS month (not prev month).
            const bd = user.billingDay ?? 1;
            const lastDayOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
            const billingPeriodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.min(bd, lastDayOfThisMonth)));
            const userCreatedAt2 = new Date(user.createdAt);
            if (userCreatedAt2 >= billingPeriodStart) {
              skipped++;
              console.log(`⏭️  Skipped ${user.username} - POSTPAID first billing period (created: ${userCreatedAt2.toISOString().slice(0, 10)}, period started: ${billingPeriodStart.toISOString().slice(0, 10)})`);
              continue;
            }
          }
        }

        const baseAmount = user.profile.price;

        // Calculate PPN if enabled on profile
        let invoiceAmount = baseAmount;
        let taxRate: number | null = null;
        if (user.profile.ppnActive && user.profile.ppnRate > 0) {
          taxRate = user.profile.ppnRate;
          invoiceAmount = Math.round(baseAmount + (baseAmount * taxRate / 100));
        }

        // Calculate due date based on subscription type
        let dueDate: Date;
        let invoiceType: string;

        if (user.subscriptionType === 'PREPAID') {
          // PREPAID: Due date = expiredAt (user must pay before expiry)
          if (!user.expiredAt) {
            skipped++;
            console.log(`⏭️  Skipped ${user.username} - PREPAID user has no expiredAt`);
            continue;
          }
          dueDate = user.expiredAt;
          invoiceType = 'RENEWAL';
        } else {
          // POSTPAID: Due date = next billingDay (always from billingDay, never from expiredAt)
          invoiceType = 'MONTHLY';
          const bd = user.billingDay ?? 1;
          dueDate = getNextBillingDay(bd);
        }

        // Generate invoice number
        invoiceCount++;
        const invoiceNumber = `INV-${year}${month}-${String(invoiceCount).padStart(4, '0')}`;

        // Generate payment token and link
        const paymentToken = randomBytes(32).toString('hex');
        const paymentLink = `${baseUrl}/pay/${paymentToken}`;

        // Determine invoice status based on due date
        const isOverdue = dueDate < now;
        const invoiceStatus = isOverdue ? 'OVERDUE' : 'PENDING';

        // Create invoice with customer snapshot (matching manual API)
        await prisma.invoice.create({
          data: {
            id: crypto.randomUUID(),
            invoiceNumber,
            userId: user.id,
            customerName: user.name,
            customerPhone: user.phone,
            customerEmail: user.email,
            customerUsername: user.username,
            amount: invoiceAmount,
            baseAmount: baseAmount,
            ...(taxRate !== null && { taxRate }),
            dueDate: dueDate,
            status: invoiceStatus as any,
            paymentToken,
            paymentLink,
            invoiceType: invoiceType as any,
          },
        });

        generated++;
        const expiredAtStr = user.expiredAt ? formatWIB(user.expiredAt, 'd MMMM yyyy') : 'N/A';
        const statusLabel = isOverdue ? '(OVERDUE)' : '(PENDING)';
        const ppnLabel = taxRate ? ` (incl. PPN ${taxRate}%)` : '';
        console.log(`✅ Generated invoice ${invoiceNumber} for ${user.username} - Rp ${invoiceAmount.toLocaleString()}${ppnLabel} (expires: ${expiredAtStr}) ${statusLabel}`);
      } catch (error: any) {
        errors.push(`${user.username}: ${error.message}`);
        console.error(`❌ Error generating invoice for ${user.username}:`, error);
      }
    }

    // Create notification for generated invoices
    if (generated > 0) {
      try {
        await prisma.notification.create({
          data: {
            type: 'invoice_generated',
            title: 'Invoice Otomatis Dibuat',
            message: `${generated} invoice baru telah dibuat otomatis untuk periode billing`,
            link: '/admin/invoices',
            createdAt: nowWIB(),
          },
        });
      } catch (notifError) {
        console.error('Invoice generation notification error:', notifError);
      }
    }

    // Update cron history
    const completedAt = new Date();
    await prisma.cronHistory.update({
      where: { id: history.id },
      data: {
        status: errors.length === users.length ? 'error' : 'success',
        completedAt,
        duration: completedAt.getTime() - startedAt.getTime(),
        result: `Generated ${generated} invoices, skipped ${skipped}${errors.length > 0 ? `, errors: ${errors.length}` : ''}`,
      },
    });

    console.log(`[Invoice Generate] Completed: Generated ${generated}, skipped ${skipped}, errors: ${errors.length}`)

    return {
      success: true,
      generated,
      skipped,
      error: errors.length > 0 ? `${errors.length} errors occurred` : undefined
    };

  } catch (error: any) {
    console.error('Invoice generation error:', error)

    const completedAt = new Date()
    await prisma.cronHistory.update({
      where: { id: history.id },
      data: {
        status: 'error',
        completedAt,
        duration: completedAt.getTime() - startedAt.getTime(),
        error: error.message,
      },
    })

    return { success: false, generated: 0, skipped: 0, error: error.message }
  }
}

/**
 * Disconnect expired voucher sessions via RADIUS CoA
 * 
 * @deprecated This function is now integrated into syncVoucherFromRadius()
 * to avoid duplicate CoA disconnect attempts.
 * The voucher sync already handles:
 * 1. Detecting expired vouchers
 * 2. Marking as EXPIRED
 * 3. Removing from RADIUS
 * 4. Disconnecting active sessions via CoA
 * 
 * Keeping this function will cause TRIPLE disconnect attempts:
 * - Once from syncVoucherFromRadius (already-expired check at start)
 * - Once from syncVoucherFromRadius (newly-expired processing)
 * - Once from this separate function (disconnectExpiredSessions)
 * 
 * DO NOT USE - disabled to prevent conflicts
 */
export async function disconnectExpiredVoucherSessions(): Promise<{ success: boolean; disconnected: number; error?: string }> {
  console.log('[Disconnect Sessions] SKIPPED - disconnect now handled by syncVoucherFromRadius to avoid duplicates')

  // Return success with 0 disconnected since work is done by syncVoucherFromRadius
  return {
    success: true,
    disconnected: 0,
    error: 'Function deprecated - disconnect handled by voucher sync'
  }
}
