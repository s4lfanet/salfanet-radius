import { Xendit } from 'xendit-node'
import { prisma } from '@/server/db/client'

export async function createXenditInvoice(params: {
  externalId: string
  amount: number
  payerEmail?: string
  description: string
  customerName: string
  customerPhone: string
  invoiceToken: string
  baseUrl?: string
}) {
  // Get company base URL — prefer explicitly passed baseUrl, then DB (with localhost check)
  let baseUrl = params.baseUrl
  if (!baseUrl) {
    const company = await prisma.company.findFirst()
    baseUrl = (company?.baseUrl && !company.baseUrl.includes('localhost'))
      ? company.baseUrl
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  }

  // Get Xendit config
  const config = await prisma.paymentGateway.findUnique({
    where: { provider: 'xendit' }
  })

  if (!config || !config.isActive) {
    throw new Error('Xendit is not configured or inactive')
  }

  if (!config.xenditApiKey) {
    throw new Error('Xendit API key is not configured')
  }

  // Initialize Xendit
  const xendit = new Xendit({
    secretKey: config.xenditApiKey
  })

  try {
    const { Invoice } = xendit
    const invoice = await Invoice.createInvoice({
      data: {
        externalId: params.externalId,
        amount: params.amount,
        payerEmail: params.payerEmail || `${params.externalId}@customer.local`,
        description: params.description,
        customer: {
          givenNames: params.customerName,
          mobileNumber: params.customerPhone
        },
        invoiceDuration: 86400, // 24 hours
        currency: 'IDR',
        reminderTime: 1,
        successRedirectUrl: `${baseUrl}/payment/success?token=${params.invoiceToken}`,
        failureRedirectUrl: `${baseUrl}/payment/failed?token=${params.invoiceToken}`
      }
    })

    return invoice
  } catch (error) {
    console.error('[Xendit] Error creating invoice:', error)
    throw error
  }
}
