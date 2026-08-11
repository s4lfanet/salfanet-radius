import 'server-only'
import { prisma } from '@/server/db/client'
import { nanoid } from 'nanoid'

/**
 * Update invoice status: PENDING ? OVERDUE if past due date
 * Runs hourly to keep invoice status accurate
 */
export async function updateInvoiceStatus(): Promise<{
  success: boolean
  updated: number
  error?: string
}> {
  const startedAt = new Date()

  const history = await prisma.cronHistory.create({
    data: {
      id: nanoid(),
      jobType: 'invoice_status_update',
      status: 'running',
      startedAt,
    },
  })

  try {
    const now = new Date()
    console.log(`[Invoice Status Update] Checking at ${now.toISOString()}`)

    // Find PENDING invoices that are past due date
    const overdueInvoices = await prisma.invoice.updateMany({
      where: {
        status: 'PENDING',
        dueDate: {
          lt: now, // Due date has passed
        },
      },
      data: {
        status: 'OVERDUE',
      },
    })

    console.log(`[Invoice Status Update] Updated ${overdueInvoices.count} invoices to OVERDUE`)

    // Update cron history
    const completedAt = new Date()
    await prisma.cronHistory.update({
      where: { id: history.id },
      data: {
        status: 'success',
        completedAt,
        duration: completedAt.getTime() - startedAt.getTime(),
        result: `Updated ${overdueInvoices.count} invoices from PENDING to OVERDUE`,
      },
    })

    return {
      success: true,
      updated: overdueInvoices.count,
    }
  } catch (error: any) {
    console.error('[Invoice Status Update] Error:', error)

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

    return {
      success: false,
      updated: 0,
      error: error.message,
    }
  }
}
