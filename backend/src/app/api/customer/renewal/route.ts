import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { randomBytes, randomUUID } from 'crypto';
import { toUTC, nowWIB, getCurrentTimezone } from '@/lib/timezone';
import { generateInvoiceNumber } from '@/server/services/billing/invoice.service';

function generatePaymentToken(): string {
  return randomBytes(32).toString('hex');
}

function formatBankAccountsForWA(bankAccounts: any): string {
  if (!bankAccounts) return '';
  let accounts: Array<{ bankName?: string; bank?: string; accountNumber?: string; accountName?: string }> = [];
  try {
    accounts = Array.isArray(bankAccounts) ? bankAccounts : JSON.parse(String(bankAccounts));
  } catch { return ''; }
  if (!accounts.length) return '';
  const lines = accounts.map((a) =>
    `🏦 ${a.bankName || a.bank || '-'}\n   📋 No. Rek: ${a.accountNumber || '-'}\n   👤 A/N: ${a.accountName || '-'}`
  );
  return `━━━━━━━━━━━━━━━━━━━━━━\n🏦 *Transfer Manual ke Rekening:*\n${lines.join('\n\n')}`;
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
      include: { profile: true, area: { select: { name: true } } },
    });

    if (!user) {
      console.log('❌ User not found');
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    console.log('✅ User found:', user.username, 'Profile:', user.profile?.name);

    // Get company settings
    const company = await prisma.company.findFirst();
    console.log('🏢 Company settings loaded');

    // Renewal is always allowed regardless of expiry date
    const now = nowWIB();
    const expiredAt = user.expiredAt ? new Date(user.expiredAt) : null;

    if (!expiredAt) {
      return NextResponse.json(
        { success: false, error: 'Expired date not set' },
        { status: 400 }
      );
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
    let _profileChanged = false;
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
      _profileChanged = true;
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

    // Create invoice for renewal (apply user discount to base price)
    const baseAmount = Math.max(0, targetProfile.price - (user.discount || 0));
    
    // Calculate PPN if enabled on profile
    let amount = baseAmount;
    let renewTaxRate: number | null = null;
    if (targetProfile.ppnActive && targetProfile.ppnRate > 0) {
      renewTaxRate = targetProfile.ppnRate;
      amount = Math.round(baseAmount + (baseAmount * renewTaxRate / 100));
    }
    
    console.log('💰 Amount:', amount, renewTaxRate ? `(incl. PPN ${renewTaxRate}%)` : '');

    let invoiceNumber = generateInvoiceNumber();

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
            dueDate: toUTC(newExpiredDate),
            status: 'PENDING',
            paymentToken,
            paymentLink,
          },
        });
        break; // Success, exit loop
      } catch (createError: any) {
        if (createError.code === 'P2002' && retries < maxRetries - 1) {
          // Duplicate key, generate a fresh number and retry
          retries++;
          invoiceNumber = generateInvoiceNumber();
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

    // Send WhatsApp notification
    console.log('📱 Attempting to send WhatsApp notification...');
    try {
      const whatsappTemplate = await prisma.whatsapp_templates.findFirst({
        where: { type: 'invoice-created' },
      });

      console.log('📱 WhatsApp template found:', whatsappTemplate ? 'YES' : 'NO');
      console.log('📱 WhatsApp template active:', whatsappTemplate?.isActive);

      if (whatsappTemplate && whatsappTemplate.isActive) {
        const message = whatsappTemplate.message
          .replace(/{{customerName}}/g, user.name)
          .replace(/{{customerId}}/g, user.customerId || '-')
          .replace(/{{username}}/g, user.username)
          .replace(/{{profileName}}/g, user.profile?.name || '-')
          .replace(/{{area}}/g, (user as any).area?.name || '-')
          .replace(/{{address}}/g, user.address || '-')
          .replace(/{{invoiceNumber}}/g, invoiceNumber)
          .replace(/{{amount}}/g, amount.toLocaleString('id-ID'))
          .replace(/{{dueDate}}/g, newExpiredDate.toLocaleDateString('id-ID', { timeZone: getCurrentTimezone() }))
          .replace(/{{paymentLink}}/g, paymentLink)
          .replace(/{{bankAccounts}}/g, formatBankAccountsForWA(company?.bankAccounts))
          .replace(/{{companyName}}/g, company?.name || 'Billing System')
          .replace(/{{companyPhone}}/g, company?.phone || '');

        // Straight to the WhatsApp service: /api/whatsapp/send needs an
        // admin session, so posting there from a customer request always
        // failed while the log said sent.
        if (user.phone) {
          const { WhatsAppService } = await import('@/server/services/notifications/whatsapp.service');
          await WhatsAppService.sendMessage({ phone: user.phone, message });
        }

        console.log(`✅ WhatsApp notification sent to ${user.phone}`);
      }
    } catch (notifError) {
      console.error('Failed to send WhatsApp notification:', notifError);
      // Don't fail the request if notification fails
    }

    // Send Email notification
    console.log('📧 Attempting to send Email notification...');
    console.log('📧 User email:', user.email);
    if (user.email) {
      try {
        const { EmailService } = await import('@/server/services/notifications/email.service');
        const emailSettings = await EmailService.getSettings();


        console.log('📧 Email settings enabled:', emailSettings?.enabled);
        console.log('📧 Email notify invoice:', emailSettings?.notifyInvoice);

        if (emailSettings?.enabled && emailSettings.notifyInvoice) {
          const emailTemplate = await prisma.emailTemplate.findFirst({
            where: { type: 'invoice-created', isActive: true },
          });


          console.log('📧 Email template found:', emailTemplate ? 'YES' : 'NO');

          if (emailTemplate) {
            const variables = {
              customerName: user.name,
              customerId: user.customerId || user.username,
              username: user.username,
              profileName: user.profile?.name || '-',
              area: (user as any).area?.name || '-',
              address: user.address || '-',
              invoiceNumber: invoiceNumber,
              amount: `Rp ${amount.toLocaleString('id-ID')}`,
              dueDate: newExpiredDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: getCurrentTimezone() }),
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
          } else {
          }
        } else {
        }
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
        // Don't fail the request if notification fails
      }
    } else {
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

    const _now = new Date();
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

    // Renewal always allowed
    return NextResponse.json({
      success: true,
      canRenew: true,
    });
  } catch (error) {
    console.error('Check renewal error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check renewal status' },
      { status: 500 }
    );
  }
}
