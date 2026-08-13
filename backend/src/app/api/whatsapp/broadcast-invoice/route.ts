import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { logActivity } from '@/server/services/activity-log.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { formatWIB } from '@/lib/timezone';
import { randomBytes } from 'crypto';
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';
import { EmailService } from '@/server/services/notifications/email.service';

interface BroadcastInvoiceRequest {
  invoiceIds: string[];
  channel?: 'whatsapp' | 'email' | 'both'; // Optional, defaults to 'both'
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value ?? '');
  }
  return rendered;
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
    const body: BroadcastInvoiceRequest = await request.json();
    const { invoiceIds, channel = 'both' } = body;

    if (!invoiceIds || invoiceIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No invoices selected' },
        { status: 400 }
      );
    }

    // Fetch invoices with customer data
    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: invoiceIds },
      },
      include: {
        user: {
          include: {
            profile: true,
            area: true,
          },
        },
      },
    });

    if (invoices.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid invoices found' },
        { status: 400 }
      );
    }

    // Get company info
    const company = await prisma.company.findFirst();

    if (!company) {
      return NextResponse.json(
        { success: false, error: 'Company info not found' },
        { status: 400 }
      );
    }

    // Fetch WA templates from DB once
    const [waReminderTemplate, waOverdueTemplate] = await Promise.all([
      prisma.whatsapp_templates.findFirst({ where: { type: 'invoice-reminder', isActive: true } }),
      prisma.whatsapp_templates.findFirst({ where: { type: 'invoice-overdue', isActive: true } }),
    ]);

    const bankAccountsText = formatBankAccountsForWA(company.bankAccounts);
    const baseUrl = company.baseUrl || 'http://localhost:3000';

    // Auto-generate paymentToken/paymentLink for invoices that are missing them
    const invoicesWithoutLink = invoices.filter(inv => !inv.paymentLink);
    if (invoicesWithoutLink.length > 0) {
      await Promise.all(invoicesWithoutLink.map(async (inv) => {
        const paymentToken = randomBytes(32).toString('hex');
        const paymentLink = `${baseUrl}/pay/${paymentToken}`;
        await prisma.invoice.update({ where: { id: inv.id }, data: { paymentToken, paymentLink } });
        inv.paymentLink = paymentLink; // mutate in-memory so map below picks it up
      }));
    }

    // Calculate invoice data once
    const invoiceDataList = invoices.map(invoice => {
      const now = new Date();
      const dueDate = new Date(invoice.dueDate);
      const diffTime = dueDate.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const dueDateStr = formatWIB(invoice.dueDate, 'dd MMMM yyyy');
      const isOverdue = daysRemaining < 0;

      return {
        invoice,
        daysRemaining,
        dueDateStr,
        isOverdue,
        daysOverdue: isOverdue ? Math.abs(daysRemaining) : 0,
      };
    });

    // Results tracking
    const results = {
      whatsapp: { sent: 0, failed: 0, skipped: 0, details: [] as any[] },
      email: { sent: 0, failed: 0, skipped: 0, details: [] as any[] },
    };

    // ========================
    // WHATSAPP BROADCAST
    // ========================
    if (channel === 'whatsapp' || channel === 'both') {
      const messagesToSend = invoiceDataList
        .filter(({ invoice }) => invoice.customerPhone)
        .map(({ invoice, daysRemaining, dueDateStr, isOverdue, daysOverdue }) => {
          // Pick DB template (overdue vs reminder), fallback to the other one
          const templateContent = isOverdue
            ? (waOverdueTemplate?.message || waReminderTemplate?.message)
            : (waReminderTemplate?.message || waOverdueTemplate?.message);

          let message: string;
          if (templateContent) {
            const variables: Record<string, string> = {
              customerName: invoice.customerName || invoice.customerUsername || 'Pelanggan',
              customerId: invoice.user?.customerId || '-',
              username: invoice.customerUsername || invoice.user?.username || '-',
              profileName: invoice.user?.profile?.name || '-',
              area: invoice.user?.area?.name || '-',
              invoiceNumber: invoice.invoiceNumber,
              amount: `Rp ${invoice.amount.toLocaleString('id-ID')}`,
              dueDate: dueDateStr,
              daysRemaining: String(Math.max(0, daysRemaining)),
              daysOverdue: String(daysOverdue),
              paymentLink: invoice.paymentLink || '-',
              bankAccounts: bankAccountsText,
              companyName: company.name,
              companyPhone: company.phone || '',
              companyEmail: company.email || '',
            };
            message = renderTemplate(templateContent, variables);
          } else {
            // Ultimate fallback - no template in DB
            message = `📄 *Tagihan Internet*\n\nHalo *${invoice.customerName || 'Pelanggan'}*,\n\nNo. Invoice: *${invoice.invoiceNumber}*\nJumlah: *Rp ${invoice.amount.toLocaleString('id-ID')}*\nJatuh Tempo: *${dueDateStr}*\n${invoice.paymentLink ? `\nBayar: ${invoice.paymentLink}` : ''}\n\n${company.name}`;
          }

          return {
            phone: invoice.customerPhone!,
            message,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            customerName: invoice.customerName,
          };
        });

      // Track invoices without phone numbers
      const invoicesWithoutPhone = invoiceDataList.filter(({ invoice }) => !invoice.customerPhone);
      results.whatsapp.skipped = invoicesWithoutPhone.length;

      if (messagesToSend.length > 0) {
        console.log(`[Invoice Broadcast] Sending WhatsApp to ${messagesToSend.length} customers`);

        const { sendWithRateLimit } = await import('@/lib/utils/rateLimiter');

        const waResult = await sendWithRateLimit(
          messagesToSend,
          async (msg) => {
            const sendResult = await WhatsAppService.sendMessage({
              phone: msg.phone,
              message: msg.message,
            });
            return sendResult;
          },
          {},
          (progress) => {
            console.log(`[Invoice Broadcast] WA Progress: ${progress.current}/${progress.total}`);
          }
        );

        results.whatsapp.sent = waResult.sent;
        results.whatsapp.failed = waResult.failed;
        results.whatsapp.details = waResult.results.map(r => ({
          invoiceId: messagesToSend.find(m => m.phone === r.phone)?.invoiceId,
          invoiceNumber: messagesToSend.find(m => m.phone === r.phone)?.invoiceNumber,
          phone: r.phone,
          success: r.success,
          error: r.error,
        }));
      }
    }

    // ========================
    // EMAIL BROADCAST
    // ========================
    if (channel === 'email' || channel === 'both') {
      const emailsToSend = invoiceDataList
        .filter(({ invoice }) => invoice.customerEmail || invoice.user?.email)
        .map(({ invoice, isOverdue, daysOverdue, dueDateStr }) => ({
          email: (invoice.customerEmail || invoice.user?.email)!,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customerName,
          data: {
            customerName: invoice.customerName || invoice.customerUsername || 'Pelanggan',
            customerUsername: invoice.customerUsername || invoice.user?.username,
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.amount,
            dueDate: new Date(invoice.dueDate),
            paymentLink: invoice.paymentLink || '',
            companyName: company.name,
            companyPhone: company.phone || '',
            isOverdue,
            daysOverdue,
            profileName: invoice.user?.profile?.name,
            area: invoice.user?.area?.name,
          }
        }));

      // Track invoices without email
      const invoicesWithoutEmail = invoiceDataList.filter(({ invoice }) =>
        !invoice.customerEmail && !invoice.user?.email
      );
      results.email.skipped = invoicesWithoutEmail.length;

      if (emailsToSend.length > 0) {
        console.log(`[Invoice Broadcast] Sending Email to ${emailsToSend.length} customers`);

        // Send emails with delay to avoid rate limiting
        for (const emailData of emailsToSend) {
          try {
            const emailResult = await EmailService.sendInvoiceReminder({
              email: emailData.email,
              ...emailData.data,
            });

            if (emailResult.success) {
              results.email.sent++;
              results.email.details.push({
                invoiceId: emailData.invoiceId,
                invoiceNumber: emailData.invoiceNumber,
                email: emailData.email,
                success: true,
              });
            } else {
              results.email.failed++;
              results.email.details.push({
                invoiceId: emailData.invoiceId,
                invoiceNumber: emailData.invoiceNumber,
                email: emailData.email,
                success: false,
                error: emailResult.error,
              });
            }

            // Small delay between emails
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error: any) {
            results.email.failed++;
            results.email.details.push({
              invoiceId: emailData.invoiceId,
              invoiceNumber: emailData.invoiceNumber,
              email: emailData.email,
              success: false,
              error: error.message,
            });
          }
        }
      }
    }

    // Log activity
    try {
      const session = await getServerSession(authOptions);
      const totalSent = results.whatsapp.sent + results.email.sent;
      const totalFailed = results.whatsapp.failed + results.email.failed;

      await logActivity({
        userId: (session?.user as any)?.id,
        username: (session?.user as any)?.username || 'Admin',
        userRole: (session?.user as any)?.role,
        action: 'INVOICE_BROADCAST',
        description: `Sent invoice broadcast: WA ${results.whatsapp.sent}/${invoices.length}, Email ${results.email.sent}/${invoices.length}`,
        module: 'whatsapp',
        status: totalFailed > 0 ? 'warning' : 'success',
        request,
        metadata: {
          channel,
          total: invoices.length,
          whatsapp: results.whatsapp,
          email: results.email,
        },
      });
    } catch (logError) {
      console.error('Activity log error:', logError);
    }

    // Build response message
    const messages: string[] = [];
    if (channel === 'whatsapp' || channel === 'both') {
      messages.push(`WhatsApp: ${results.whatsapp.sent} sent, ${results.whatsapp.failed} failed, ${results.whatsapp.skipped} skipped`);
    }
    if (channel === 'email' || channel === 'both') {
      messages.push(`Email: ${results.email.sent} sent, ${results.email.failed} failed, ${results.email.skipped} skipped`);
    }

    return NextResponse.json({
      success: true,
      message: messages.join(' | '),
      total: invoices.length,
      successCount: results.whatsapp.sent + results.email.sent,
      failCount: results.whatsapp.failed + results.email.failed,
      results: {
        whatsapp: channel === 'email' ? undefined : results.whatsapp,
        email: channel === 'whatsapp' ? undefined : results.email,
      },
    });
  } catch (error: any) {
    console.error('Invoice broadcast error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
