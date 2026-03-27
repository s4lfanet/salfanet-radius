import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { randomBytes, randomUUID } from 'crypto';

function generatePaymentToken(): string {
  return randomBytes(32).toString('hex');
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Customer renewal request received');
    // Get token from Authorization header
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    console.log('🔑 Token:', token ? 'Present' : 'Missing');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find session by token
    const session = await prisma.customerSession.findFirst({
      where: {
        token,
        verified: true,
        expiresAt: { gte: new Date() },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Get request body for optional profile change
    const body = await request.json().catch(() => ({}));
    const { newProfileId } = body;

    // Get user data
    console.log('👤 Fetching user:', session.userId);
    const user = await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
      include: { profile: true },
    });

    if (!user) {
      console.log('❌ User not found');
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    console.log('✅ User found:', user.username, 'Profile:', user.profile?.name);

    // Get company settings for renewal configuration
    const company = await prisma.company.findFirst();
    console.log('🏢 Company settings loaded');
    const renewalAnytime = company?.pppoeRenewalAnytime || false;
    const renewalDaysBefore = company?.pppoeRenewalDaysBefore || 7;

    // Check if user can renew based on company settings
    const now = new Date();
    const expiredAt = user.expiredAt ? new Date(user.expiredAt) : null;

    if (!expiredAt) {
      return NextResponse.json(
        { success: false, error: 'Expired date not set' },
        { status: 400 }
      );
    }

    // If not renewal anytime, check if within renewal period
    if (!renewalAnytime) {
      const renewalStartDate = new Date(expiredAt);
      renewalStartDate.setDate(renewalStartDate.getDate() - renewalDaysBefore);
      
      if (now < renewalStartDate) {
        const daysUntilRenewal = Math.ceil((renewalStartDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return NextResponse.json(
          { 
            success: false, 
            error: `Perpanjangan hanya dapat dilakukan ${renewalDaysBefore} hari sebelum expired. Silakan coba lagi dalam ${daysUntilRenewal} hari.`,
            canRenewAt: renewalStartDate.toISOString(),
          },
          { status: 400 }
        );
      }
    }

    // Check if user already has unpaid invoice
    console.log('💳 Checking existing unpaid invoice...');
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        userId: user.id,
        status: {
          in: ['PENDING', 'OVERDUE'],
        },
      },
    });

    if (existingInvoice) {
      console.log('⚠️ User has existing unpaid invoice:', existingInvoice.invoiceNumber);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Anda masih memiliki tagihan yang belum dibayar',
          invoice: {
            id: existingInvoice.id,
            invoiceNumber: existingInvoice.invoiceNumber,
            amount: existingInvoice.amount,
            dueDate: existingInvoice.dueDate,
            paymentLink: existingInvoice.paymentLink,
          }
        },
        { status: 400 }
      );
    }

    // Determine profile to use (new profile or current)
    let targetProfile = user.profile;
    let profileChanged = false;
    if (newProfileId && newProfileId !== user.profile?.id) {
      const newProfile = await prisma.pppoeProfile.findUnique({
        where: { id: newProfileId },
      });
      if (!newProfile) {
        return NextResponse.json(
          { success: false, error: 'Profile baru tidak ditemukan' },
          { status: 400 }
        );
      }
      targetProfile = newProfile;
      profileChanged = true;
    }

    if (!targetProfile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 400 }
      );
    }

    // Calculate new expired date (30 days from now or from current expiredAt if not yet expired)
    let newExpiredDate: Date;
    if (expiredAt > now) {
      // Not yet expired, add 30 days to current expiredAt
      newExpiredDate = new Date(expiredAt);
      newExpiredDate.setDate(newExpiredDate.getDate() + 30);
    } else {
      // Already expired, add 30 days from now
      newExpiredDate = new Date(now);
      newExpiredDate.setDate(newExpiredDate.getDate() + 30);
    }

    // Create invoice for renewal
    const baseAmount = targetProfile.price;
    
    // Calculate PPN if enabled on profile
    let amount = baseAmount;
    let renewTaxRate: number | null = null;
    if (targetProfile.ppnActive && targetProfile.ppnRate > 0) {
      renewTaxRate = targetProfile.ppnRate;
      amount = Math.round(baseAmount + (baseAmount * renewTaxRate / 100));
    }
    
    console.log('💰 Amount:', amount, renewTaxRate ? `(incl. PPN ${renewTaxRate}%)` : '');

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
    const baseUrl = company?.baseUrl || 'http://localhost:3000';
    const paymentLink = `${baseUrl}/pay/${paymentToken}`;

    // Create invoice with retry on duplicate
    console.log('📄 Creating invoice:', invoiceNumber);
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
            baseAmount: baseAmount,
            ...(renewTaxRate !== null && { taxRate: renewTaxRate }),
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

    console.log(`✅ Created renewal invoice ${invoiceNumber} for ${user.username} - ${amount}`);

    // Log ke file untuk debugging
    const fs = require('fs');
    const logPath = '/var/www/salfanet-radius/logs/notification-debug.log';
    fs.appendFileSync(logPath, `\n[${new Date().toISOString()}] Invoice created: ${invoiceNumber}\n`);

    // Send WhatsApp notification
    console.log('📱 Attempting to send WhatsApp notification...');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] Attempting WhatsApp notification...\n`);
    try {
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] Querying whatsappTemplate...\n`);
      const whatsappTemplate = await prisma.whatsapp_templates.findFirst({
        where: { type: 'invoice-created' },
      });
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] Query completed\n`);

      fs.appendFileSync(logPath, `[${new Date().toISOString()}] WhatsApp template found: ${whatsappTemplate ? 'YES' : 'NO'}\n`);
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] WhatsApp template active: ${whatsappTemplate?.isActive}\n`);
      
      if (whatsappTemplate) {
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] Template data: ${JSON.stringify(whatsappTemplate)}\n`);
      }

      console.log('📱 WhatsApp template found:', whatsappTemplate ? 'YES' : 'NO');
      console.log('📱 WhatsApp template active:', whatsappTemplate?.isActive);

      if (whatsappTemplate && whatsappTemplate.isActive) {
        let message = whatsappTemplate.message
          .replace(/{{customerName}}/g, user.name)
          .replace(/{{invoiceNumber}}/g, invoiceNumber)
          .replace(/{{amount}}/g, amount.toLocaleString('id-ID'))
          .replace(/{{dueDate}}/g, newExpiredDate.toLocaleDateString('id-ID'))
          .replace(/{{paymentLink}}/g, paymentLink)
          .replace(/{{companyName}}/g, company?.name || 'Billing System')
          .replace(/{{companyPhone}}/g, company?.phone || '');

        // Use baseUrl instead of env var for internal API calls
        const apiUrl = baseUrl || 'http://localhost:3002';
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] WhatsApp API URL: ${apiUrl}/api/whatsapp/send\n`);
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] WhatsApp phone: ${user.phone}\n`);
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] WhatsApp message length: ${message.length}\n`);
        
        const response = await fetch(`${apiUrl}/api/whatsapp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: user.phone,
            message,
          }),
        });
        
        const result = await response.json();
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] WhatsApp API response: ${JSON.stringify(result)}\n`);

        fs.appendFileSync(logPath, `[${new Date().toISOString()}] WhatsApp notification sent to ${user.phone}\n`);
        console.log(`✅ WhatsApp notification sent to ${user.phone}`);
      } else {
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] WhatsApp notification skipped (no active template)\n`);
      }
    } catch (notifError) {
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] WhatsApp error: ${notifError}\n`);
      console.error('Failed to send WhatsApp notification:', notifError);
      // Don't fail the request if notification fails
    }

    // Send Email notification
    console.log('📧 Attempting to send Email notification...');
    console.log('📧 User email:', user.email);
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] Attempting Email notification...\n`);
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] User email: ${user.email}\n`);
    if (user.email) {
      try {
        const { EmailService } = await import('@/server/services/notifications/email.service');
        const emailSettings = await EmailService.getSettings();

        fs.appendFileSync(logPath, `[${new Date().toISOString()}] Email settings enabled: ${emailSettings?.enabled}\n`);
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] Email notify invoice: ${emailSettings?.notifyInvoice}\n`);

        console.log('📧 Email settings enabled:', emailSettings?.enabled);
        console.log('📧 Email notify invoice:', emailSettings?.notifyInvoice);

        if (emailSettings?.enabled && emailSettings.notifyInvoice) {
          const emailTemplate = await prisma.emailTemplate.findFirst({
            where: { type: 'invoice-created', isActive: true },
          });

          fs.appendFileSync(logPath, `[${new Date().toISOString()}] Email template found: ${emailTemplate ? 'YES' : 'NO'}\n`);

          console.log('📧 Email template found:', emailTemplate ? 'YES' : 'NO');

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

            fs.appendFileSync(logPath, `[${new Date().toISOString()}] Email notification sent to ${user.email}\n`);
            console.log(`✅ Email notification sent to ${user.email}`);
          } else {
            fs.appendFileSync(logPath, `[${new Date().toISOString()}] Email template not found or not active\n`);
          }
        } else {
          fs.appendFileSync(logPath, `[${new Date().toISOString()}] Email notification skipped (disabled or notifyInvoice=false)\n`);
        }
      } catch (emailError) {
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] Email error: ${emailError}\n`);
        console.error('Failed to send email notification:', emailError);
        // Don't fail the request if notification fails
      }
    } else {
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] Email notification skipped (no email address)\n`);
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
    const errorMessage = (error as Error).message;
    const errorStack = (error as Error).stack;
    
    console.error('❌ Renewal error:', error);
    console.error('❌ Error message:', errorMessage);
    console.error('❌ Error stack:', errorStack);
    
    // Write to file for debugging
    try {
      const fs = require('fs');
      const logPath = '/var/www/salfanet-radius/logs/renewal-error.log';
      const timestamp = new Date().toISOString();
      fs.appendFileSync(logPath, `\n[${timestamp}] Renewal Error:\n${errorMessage}\n${errorStack}\n\n`);
    } catch (logError) {
      console.error('Failed to write error log:', logError);
    }
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create renewal invoice',
        ...(process.env.NODE_ENV !== 'production' && { details: errorMessage }),
      },
      { status: 500 }
    );
  }
}

// GET - Check if user can renew
export async function GET(request: NextRequest) {
  try {
    // Get token from Authorization header
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find session by token
    const session = await prisma.customerSession.findFirst({
      where: {
        token,
        verified: true,
        expiresAt: { gte: new Date() },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Get user data
    const user = await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Get company settings
    const company = await prisma.company.findFirst();
    const renewalAnytime = company?.pppoeRenewalAnytime || false;
    const renewalDaysBefore = company?.pppoeRenewalDaysBefore || 7;

    const now = new Date();
    const expiredAt = user.expiredAt ? new Date(user.expiredAt) : null;

    if (!expiredAt) {
      return NextResponse.json({
        success: true,
        canRenew: false,
        reason: 'Expired date not set',
      });
    }

    // Check if already has unpaid invoice
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        userId: user.id,
        status: {
          in: ['PENDING', 'OVERDUE'],
        },
      },
    });

    if (existingInvoice) {
      return NextResponse.json({
        success: true,
        canRenew: false,
        reason: 'Has unpaid invoice',
        invoice: {
          id: existingInvoice.id,
          invoiceNumber: existingInvoice.invoiceNumber,
          amount: existingInvoice.amount,
          dueDate: existingInvoice.dueDate,
          paymentLink: existingInvoice.paymentLink,
        }
      });
    }

    // If renewal anytime is enabled, always allow
    if (renewalAnytime) {
      return NextResponse.json({
        success: true,
        canRenew: true,
        renewalAnytime: true,
      });
    }

    // Check if within renewal period
    const renewalStartDate = new Date(expiredAt);
    renewalStartDate.setDate(renewalStartDate.getDate() - renewalDaysBefore);
    
    if (now < renewalStartDate) {
      const daysUntilRenewal = Math.ceil((renewalStartDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return NextResponse.json({
        success: true,
        canRenew: false,
        reason: `Renewal available in ${daysUntilRenewal} days`,
        canRenewAt: renewalStartDate.toISOString(),
        daysUntilRenewal,
      });
    }

    return NextResponse.json({
      success: true,
      canRenew: true,
      renewalAnytime: false,
    });
  } catch (error) {
    console.error('Check renewal error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check renewal status' },
      { status: 500 }
    );
  }
}
