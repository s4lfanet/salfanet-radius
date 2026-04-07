import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { prisma } from '@/server/db/client'
import { sendInvoiceReminder } from '@/server/services/notifications/whatsapp-templates.service'
import { EmailService } from '@/server/services/notifications/email.service'

/**
 * POST /api/invoices/send-reminder - Send invoice reminder via WhatsApp and/or Email
 * 
 * Body parameters:
 * - invoiceId: string (required)
 * - channel: 'whatsapp' | 'email' | 'both' (optional, defaults to 'both')
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json()
    const { invoiceId, channel = 'both' } = body

    if (!invoiceId) {
      return NextResponse.json({
        success: false,
        error: 'Invoice ID is required'
      }, { status: 400 })
    }

    // Get invoice with user details
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        user: {
          include: {
            profile: true,
            area: true
          }
        }
      }
    })

    if (!invoice) {
      return NextResponse.json({
        success: false,
        error: 'Invoice not found'
      }, { status: 404 })
    }

    // Get company info
    const company = await prisma.company.findFirst()

    if (!company) {
      return NextResponse.json({
        success: false,
        error: 'Company information not found. Please configure company settings.'
      }, { status: 500 })
    }

    // Safely convert dueDate to Date object
    let dueDate: Date;
    if (invoice.dueDate instanceof Date) {
      dueDate = invoice.dueDate;
    } else if (typeof invoice.dueDate === 'string') {
      dueDate = new Date(invoice.dueDate);
    } else {
      dueDate = new Date();
    }

    // Auto-detect if invoice is overdue based on status or due date
    const now = new Date()
    const isOverdue = invoice.status === 'OVERDUE' || dueDate < now

    // Calculate days overdue if applicable
    let daysOverdue = 0
    if (isOverdue) {
      const diffTime = now.getTime() - dueDate.getTime()
      daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    }

    // Prepare common data
    const reminderData = {
      customerName: invoice.customerName || invoice.customerUsername || 'Customer',
      customerId: (invoice.user as any)?.customerId || undefined,
      customerUsername: invoice.customerUsername || invoice.user?.username,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      dueDate: dueDate,
      paymentLink: invoice.paymentLink || '',
      companyName: company.name,
      companyPhone: company.phone || '',
      isOverdue,
      daysOverdue,
      profileName: invoice.user?.profile?.name,
      area: invoice.user?.area?.name
    }

    const results: { whatsapp?: { success: boolean; error?: string }; email?: { success: boolean; error?: string } } = {}
    let hasSuccess = false
    const errors: string[] = []

    // Send WhatsApp reminder
    if (channel === 'whatsapp' || channel === 'both') {
      if (invoice.customerPhone) {
        try {
          // Check if WhatsApp provider is available
          const activeProviders = await prisma.whatsapp_providers.findMany({
            where: { isActive: true },
          })

          if (activeProviders.length > 0) {
            await sendInvoiceReminder({
              phone: invoice.customerPhone,
              ...reminderData
            })
            results.whatsapp = { success: true }
            hasSuccess = true
          } else {
            results.whatsapp = { success: false, error: 'No active WhatsApp provider configured' }
            if (channel === 'whatsapp') {
              errors.push('No active WhatsApp provider configured')
            }
          }
        } catch (waError: any) {
          console.error('[Send Reminder] WhatsApp error:', waError)
          results.whatsapp = { success: false, error: waError.message || 'Failed to send WhatsApp' }
          if (channel === 'whatsapp') {
            errors.push(waError.message || 'Failed to send WhatsApp')
          }
        }
      } else {
        results.whatsapp = { success: false, error: 'Customer phone number not found' }
        if (channel === 'whatsapp') {
          errors.push('Customer phone number not found')
        }
      }
    }

    // Send Email reminder
    if (channel === 'email' || channel === 'both') {
      const customerEmail = invoice.customerEmail || invoice.user?.email

      if (customerEmail) {
        try {
          const emailResult = await EmailService.sendInvoiceReminder({
            email: customerEmail,
            ...reminderData
          })

          if (emailResult.success) {
            results.email = { success: true }
            hasSuccess = true
          } else {
            results.email = { success: false, error: emailResult.error || 'Failed to send email' }
            if (channel === 'email') {
              errors.push(emailResult.error || 'Failed to send email')
            }
          }
        } catch (emailError: any) {
          console.error('[Send Reminder] Email error:', emailError)
          results.email = { success: false, error: emailError.message || 'Failed to send email' }
          if (channel === 'email') {
            errors.push(emailError.message || 'Failed to send email')
          }
        }
      } else {
        results.email = { success: false, error: 'Customer email not found' }
        if (channel === 'email') {
          errors.push('Customer email not found')
        }
      }
    }

    // Determine response
    if (hasSuccess) {
      const successMessages: string[] = []
      if (results.whatsapp?.success) successMessages.push('WhatsApp')
      if (results.email?.success) successMessages.push('Email')

      return NextResponse.json({
        success: true,
        message: `Reminder sent successfully via ${successMessages.join(' and ')}`,
        results
      })
    } else {
      return NextResponse.json({
        success: false,
        error: errors.length > 0 ? errors.join('. ') : 'Failed to send reminder',
        results
      }, { status: 500 })
    }

  } catch (error: any) {
    console.error('Send reminder error:', error)

    let errorMessage = 'Failed to send reminder';

    if (error.message?.includes('No active WhatsApp providers')) {
      errorMessage = 'No active WhatsApp provider configured. Please configure WhatsApp settings.';
    } else if (error.message?.includes('All WhatsApp providers failed')) {
      errorMessage = 'WhatsApp service unavailable. Please check provider settings.';
    } else if (error.message?.includes('session not ready')) {
      errorMessage = 'WhatsApp session not connected. Please scan QR code to connect.';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 })
  }
}
