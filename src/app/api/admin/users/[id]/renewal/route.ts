import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { randomBytes, randomUUID } from 'crypto';

function generatePaymentToken(): string {
  return randomBytes(32).toString('hex');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;

    // Get user data
    const user = await prisma.pppoeUser.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Admin can force renewal even with unpaid invoice
    // No validation needed - admin decision

    // Get profile price
    if (!user.profile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 400 }
      );
    }

    const basePrice = user.profile.price;

    // Calculate PPN if enabled on profile
    let amount = basePrice;
    let renewalTaxRate: number | null = null;
    if (user.profile.ppnActive && user.profile.ppnRate > 0) {
      renewalTaxRate = user.profile.ppnRate;
      amount = Math.round(basePrice + (basePrice * renewalTaxRate / 100));
    }

    const now = new Date();
    const expiredAt = user.expiredAt ? new Date(user.expiredAt) : null;

    // Calculate new expired date (30 days from now or from current expiredAt if not yet expired)
    let newExpiredDate: Date;
    if (expiredAt && expiredAt > now) {
      // Not yet expired, add 30 days to current expiredAt
      newExpiredDate = new Date(expiredAt);
      newExpiredDate.setDate(newExpiredDate.getDate() + 30);
    } else {
      // Already expired, add 30 days from now
      newExpiredDate = new Date(now);
      newExpiredDate.setDate(newExpiredDate.getDate() + 30);
    }

    // Create invoice for renewal
    const company = await prisma.company.findFirst();
    const baseUrl = company?.baseUrl || 'http://localhost:3000';

    // Generate invoice number with retry for uniqueness
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `INV-${year}${month}-`;
    
    // Get the latest invoice number for this month
    const latestInvoice = await prisma.invoice.findFirst({
      where: {
        invoiceNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        invoiceNumber: 'desc',
      },
      select: {
        invoiceNumber: true,
      },
    });

    let invoiceNumber: string;
    let invoiceSequence = 1;
    
    if (latestInvoice) {
      // Extract sequence number from latest invoice
      const lastSequence = parseInt(latestInvoice.invoiceNumber.split('-')[2] || '0');
      invoiceSequence = lastSequence + 1;
    }
    
    invoiceNumber = `${prefix}${String(invoiceSequence).padStart(4, '0')}`;

    // Generate payment token and link
    const paymentToken = generatePaymentToken();
    const paymentLink = `${baseUrl}/pay/${paymentToken}`;

    // Create invoice with retry on duplicate
    let invoice;
    let retries = 0;
    const maxRetries = 5;
    
    while (retries < maxRetries) {
      try {
        invoice = await prisma.invoice.create({
          data: {
            id: randomUUID(),
            invoiceNumber,
            userId: user.id,
            customerName: user.name,
            customerPhone: user.phone,
            customerUsername: user.username,
            customerEmail: user.email,
            amount,
            baseAmount: basePrice,
            ...(renewalTaxRate !== null && { taxRate: renewalTaxRate }),
            dueDate: newExpiredDate,
            status: 'PENDING',
            paymentToken,
            paymentLink,
          },
        });
        break; // Success, exit loop
      } catch (createError: any) {
        if (createError.code === 'P2002' && retries < maxRetries - 1) {
          // Duplicate key, increment and retry
          retries++;
          invoiceSequence++;
          invoiceNumber = `${prefix}${String(invoiceSequence).padStart(4, '0')}`;
          console.log(`⚠️ Invoice number collision, retrying with: ${invoiceNumber}`);
          continue;
        }
        throw createError; // Other error or max retries reached
      }
    }
    
    if (!invoice) {
      throw new Error('Failed to create invoice after retries');
    }

    console.log(`✅ Admin created renewal invoice ${invoiceNumber} for ${user.username} - ${amount}`);

    // Send WhatsApp notification
    try {
      const whatsappTemplate = await prisma.whatsapp_templates.findFirst({
        where: { type: 'invoice-created' },
      });

      if (whatsappTemplate && whatsappTemplate.isActive) {
        let message = whatsappTemplate.message
          .replace(/{{customerName}}/g, user.name)
          .replace(/{{invoiceNumber}}/g, invoiceNumber)
          .replace(/{{amount}}/g, amount.toLocaleString('id-ID'))
          .replace(/{{dueDate}}/g, newExpiredDate.toLocaleDateString('id-ID'))
          .replace(/{{paymentLink}}/g, paymentLink)
          .replace(/{{companyName}}/g, company?.name || 'Billing System')
          .replace(/{{companyPhone}}/g, company?.phone || '');

        await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: user.phone,
            message,
          }),
        });

        console.log(`✅ WhatsApp notification sent to ${user.phone}`);
      }
    } catch (notifError) {
      console.error('Failed to send WhatsApp notification:', notifError);
      // Don't fail the request if notification fails
    }

    // Send Email notification
    if (user.email) {
      try {
        const { EmailService } = await import('@/server/services/notifications/email.service');
        const emailSettings = await EmailService.getSettings();

        if (emailSettings?.enabled && emailSettings.notifyInvoice) {
          const emailTemplate = await prisma.emailTemplate.findFirst({
            where: { type: 'invoice-created', isActive: true },
          });

          if (emailTemplate) {
            const variables = {
              customerName: user.name,
              customerId: user.customerId || user.username,
              username: user.username,
              invoiceNumber: invoiceNumber,
              amount: `Rp ${amount.toLocaleString('id-ID')}`,
              dueDate: newExpiredDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
              paymentLink: paymentLink,
              paymentToken: paymentToken,
              baseUrl: baseUrl,
              companyName: company?.name || 'Billing System',
              companyPhone: company?.phone || '',
              companyEmail: company?.email || '',
              companyAddress: company?.address || '',
            };

            let subject = emailTemplate.subject;
            let htmlBody = emailTemplate.htmlBody;

            Object.entries(variables).forEach(([key, value]) => {
              const placeholder = `{{${key}}}`;
              subject = subject.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), String(value));
              htmlBody = htmlBody.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), String(value));
            });

            await EmailService.send({
              to: user.email,
              toName: user.name,
              subject,
              html: htmlBody,
            });

            console.log(`✅ Email notification sent to ${user.email}`);
          }
        }
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
        // Don't fail the request if notification fails
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Invoice perpanjangan berhasil dibuat',
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        dueDate: invoice.dueDate,
        paymentLink: invoice.paymentLink,
        newExpiredDate: newExpiredDate,
      },
    });
  } catch (error) {
    console.error('❌ Admin renewal error:', error);
    console.error('❌ Error stack:', (error as Error).stack);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create renewal invoice', 
        details: (error as Error).message,
        stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
      },
      { status: 500 }
    );
  }
}
