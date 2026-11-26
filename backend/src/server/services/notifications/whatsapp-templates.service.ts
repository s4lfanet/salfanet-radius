import 'server-only'
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';
import { prisma } from '@/server/db/client';
import { getCurrentTimezone } from '@/lib/timezone';

/**
 * Render template with variables
 * Replace {{variable}} with actual values
 */
function renderTemplate(template: string, variables: Record<string, any>): string {
  let rendered = template;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    rendered = rendered.replace(regex, String(value ?? ''));
  }

  return rendered;
}

/**
 * Format bank accounts (from company.bankAccounts JSON) as WhatsApp text
 */
function formatBankAccountsForWA(bankAccounts: any): string {
  if (!bankAccounts) return '';
  let accounts: Array<{ bankName?: string; bank?: string; accountNumber?: string; accountName?: string }> = [];
  try {
    accounts = Array.isArray(bankAccounts) ? bankAccounts : JSON.parse(String(bankAccounts));
  } catch {
    return '';
  }
  if (!accounts.length) return '';
  const lines = accounts.map(a =>
    `🏦 ${a.bankName || a.bank || '-'}\n   📋 No. Rek: ${a.accountNumber || '-'}\n   👤 A/N: ${a.accountName || '-'}`
  );
  return `━━━━━━━━━━━━━━━━━━━━━━\n🏦 *Transfer Manual ke Rekening:*\n${lines.join('\n\n')}`;
}

/**
 * Collect and deduplicate all admin phone numbers from:
 * 1. companies.adminPhone (primary)
 * 2. admin_users with role SUPER_ADMIN + active + phone set
 */
export async function getAdminPhones(): Promise<string[]> {
  const phones = new Set<string>();

  try {
    const company = await prisma.company.findFirst({ select: { adminPhone: true } });
    if (company?.adminPhone) phones.add(company.adminPhone.trim());
  } catch (_) {}

  try {
    const superAdmins = await prisma.adminUser.findMany({
      where: { role: 'SUPER_ADMIN', isActive: true, phone: { not: null } },
      select: { phone: true },
    });
    for (const a of superAdmins) {
      const p = a.phone?.trim();
      if (p && p.replace(/\D/g, '').length >= 10) phones.add(p);
    }
  } catch (_) {}

  return Array.from(phones);
}

/**
 * Send a WhatsApp message to all admin numbers (fire-and-forget).
 * Sending is done in parallel; errors are silently swallowed.
 */
export async function notifyAdminsViaWhatsApp(message: string): Promise<void> {
  const phones = await getAdminPhones();
  await Promise.allSettled(
    phones.map(phone => WhatsAppService.sendMessage({ phone, message }))
  );
}

/**
 * Get template from database by type
 */
async function getTemplate(type: string): Promise<string | null> {
  try {
    const template = await prisma.whatsapp_templates.findFirst({
      where: {
        type,
        isActive: true,
      },
    });

    return template?.message || null;
  } catch (error) {
    console.error(`[Template] Failed to fetch template ${type}:`, error);
    return null;
  }
}

/**
 * Send registration confirmation to customer upon form submission
 * Notifies the customer that their registration is received and pending review
 */
export async function sendRegistrationConfirmation(data: {
  customerName: string;
  customerPhone: string;
  profileName: string;
  address: string;
}) {
  try {
    const company = await prisma.company.findFirst();
    const companyName = company?.name || '';
    const companyPhone = company?.phone || '';

    const templateContent = await getTemplate('registration-confirmation');

    if (!templateContent) {
      console.warn('[WA] No template found for registration-confirmation');
      return;
    }

    const variables = {
      customerName: data.customerName,
      phone: data.customerPhone,
      profileName: data.profileName,
      address: data.address,
      companyName,
      companyPhone,
    };

    const message = renderTemplate(templateContent, variables);

    await WhatsAppService.sendMessage({
      phone: data.customerPhone,
      message,
    });

    console.log(`[WA] ✅ Registration confirmation sent to ${data.customerPhone}`);
  } catch (error) {
    console.error(`[WA] ❌ Failed to send registration confirmation:`, error);
  }
}

/**
 * Tell the applicant their registration was turned down. Plain text rather
 * than a DB template so it works on installs that never seeded one.
 */
export async function sendRegistrationRejection(data: { customerName: string; customerPhone: string; reason: string }) {
  try {
    const company = await prisma.company.findFirst();
    const companyName = company?.name || '';
    const companyPhone = company?.phone || '';
    const message =
      `Halo ${data.customerName},\n\n` +
      `Mohon maaf, pendaftaran layanan internet Anda belum dapat kami setujui.\n` +
      `Alasan: ${data.reason}\n\n` +
      (companyPhone ? `Untuk informasi lebih lanjut, silakan hubungi ${companyPhone}.\n\n` : '') +
      `Terima kasih,\n${companyName}`.trim();
    await WhatsAppService.sendMessage({ phone: data.customerPhone, message });
  } catch (error) {
    console.error('[WA] Failed to send registration rejection:', error);
  }
}

/**
 * Send registration approval notification
 * Includes username, password, and installation info
 */
export async function sendRegistrationApproval(data: {
  customerName: string;
  customerPhone: string;
  customerId?: string;
  username: string;
  password: string;
  profileName: string;
  installationFee: number;
  invoiceNumber?: string;
  subscriptionType?: string;
  dueDate?: Date;
  paymentLink?: string;
  totalAmount?: number;
  address?: string;
}) {
  try {
    const company = await prisma.company.findFirst();
    const companyName = company?.name || 'SALFANET RADIUS';
    const companyPhone = company?.phone || '';
    const bankAccountsText = formatBankAccountsForWA(company?.bankAccounts);

    // Get template from database
    const templateContent = await getTemplate('registration-approval');

    if (!templateContent) {
      console.warn('[WA] No template found for registration-approval');
      return;
    }

    const dueDateStr = data.dueDate
      ? data.dueDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: getCurrentTimezone() })
      : '-';

    // Prepare variables
    const variables = {
      customerName: data.customerName,
      customerId: data.customerId || '-',
      username: data.username,
      password: data.password,
      profileName: data.profileName,
      address: data.address || '-',
      installationFee: `Rp ${data.installationFee.toLocaleString('id-ID')}`,
      invoiceNumber: data.invoiceNumber || '-',
      subscriptionType: data.subscriptionType || 'POSTPAID',
      dueDate: dueDateStr,
      paymentLink: data.paymentLink || '',
      amount: data.totalAmount ? `Rp ${data.totalAmount.toLocaleString('id-ID')}` : `Rp ${data.installationFee.toLocaleString('id-ID')}`,
      bankAccounts: bankAccountsText,
      companyName,
      companyPhone,
    };

    // Render template
    const message = renderTemplate(templateContent, variables);

    await WhatsAppService.sendMessage({
      phone: data.customerPhone,
      message,
    });

    console.log(`[WA] ✅ Approval notification sent to ${data.customerPhone}`);
  } catch (error) {
    console.error(`[WA] ❌ Failed to send approval notification:`, error);
    // Don't throw - notification failure shouldn't break the flow
  }
}

/**
 * Send installation invoice notification
 * Includes payment link
 */
export async function sendInstallationInvoice(data: {
  customerName: string;
  customerPhone: string;
  invoiceNumber: string;
  amount: number;
  paymentLink: string;
  dueDate: Date;
  profileName?: string;
  address?: string;
}) {
  try {
    const company = await prisma.company.findFirst();
    const companyName = company?.name || 'SALFANET RADIUS';
    const companyPhone = company?.phone || '';
    const bankAccountsText = formatBankAccountsForWA(company?.bankAccounts);

    const dueDateStr = data.dueDate.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: getCurrentTimezone(),
    });

    // Get template from database
    const templateContent = await getTemplate('installation-invoice');

    if (!templateContent) {
      console.warn('[WA] No template found for installation-invoice');
      return;
    }

    // Prepare variables
    const variables = {
      customerName: data.customerName,
      invoiceNumber: data.invoiceNumber,
      amount: `Rp ${data.amount.toLocaleString('id-ID')}`,
      dueDate: dueDateStr,
      paymentLink: data.paymentLink,
      profileName: data.profileName || '-',
      address: data.address || '-',
      bankAccounts: bankAccountsText,
      companyName,
      companyPhone,
    };

    // Render template
    const message = renderTemplate(templateContent, variables);

    await WhatsAppService.sendMessage({
      phone: data.customerPhone,
      message,
    });

    console.log(`[WA] ✅ Invoice notification sent to ${data.customerPhone}`);
  } catch (error) {
    console.error(`[WA] ❌ Failed to send invoice notification:`, error);
  }
}

/**
 * Send admin create user notification
 * For manually created users by admin
 */
export async function sendAdminCreateUser(data: {
  customerName: string;
  customerPhone: string;
  customerId?: string;
  username: string;
  password: string;
  profileName: string;
  area?: string;
  address?: string;
  expiredAt?: Date;
}) {
  try {
    const company = await prisma.company.findFirst();
    const companyName = company?.name || 'SALFANET RADIUS';
    const companyPhone = company?.phone || '';

    // Get template from database
    const templateContent = await getTemplate('admin-create-user');

    if (!templateContent) {
      console.warn('[WA] No template found for admin-create-user');
      return;
    }

    const expiredDateStr = data.expiredAt
      ? data.expiredAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: getCurrentTimezone() })
      : '-';

    // Prepare variables
    const variables = {
      customerName: data.customerName,
      customerId: data.customerId || '-',
      username: data.username,
      password: data.password,
      profileName: data.profileName,
      area: data.area || '-',
      address: data.address || '-',
      expiredDate: expiredDateStr,
      companyName,
      companyPhone,
    };

    // Render template
    const message = renderTemplate(templateContent, variables);

    await WhatsAppService.sendMessage({
      phone: data.customerPhone,
      message,
    });

    console.log(`[WA] ✅ Admin create user notification sent to ${data.customerPhone}`);
  } catch (error) {
    console.error(`[WA] ❌ Failed to send admin create user notification:`, error);
    // Don't throw - notification failure shouldn't break the flow
  }
}

export type InvoiceReminderData = {
  customerName: string;
  customerId?: string;
  customerUsername?: string;
  profileName?: string;
  area?: string;
  address?: string;
  invoiceNumber: string;
  amount: number;
  dueDate: Date | string; // Accept both Date and string
  paymentLink: string;
  companyName: string;
  companyPhone: string;
  isOverdue?: boolean; // Optional flag to use overdue template
  daysOverdue?: number; // Optional override for days overdue
};

export type InvoiceReminderContext = {
  reminder: string | null;
  overdue: string | null;
  bankAccountsText: string;
};

/** Templates + bank accounts, loaded once so many messages can be rendered cheaply. */
export async function loadInvoiceReminderContext(): Promise<InvoiceReminderContext> {
  const [reminder, overdue, company] = await Promise.all([
    getTemplate('invoice-reminder'),
    getTemplate('invoice-overdue'),
    prisma.company.findFirst({ select: { bankAccounts: true } }),
  ]);
  return { reminder, overdue: overdue || reminder, bankAccountsText: formatBankAccountsForWA(company?.bankAccounts) };
}

/** Render the admin's invoice-reminder / invoice-overdue template. Null when no template is active. */
export function renderInvoiceReminderMessage(ctx: InvoiceReminderContext, data: InvoiceReminderData): string | null {
  const dueDateObj = data.dueDate instanceof Date ? data.dueDate : new Date(data.dueDate);
  const dueDateStr = dueDateObj.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: getCurrentTimezone(),
  });

  const daysDiff = Math.ceil((dueDateObj.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const isOverdue = data.isOverdue !== undefined ? data.isOverdue : daysDiff < 0;
  const daysOverdue = data.daysOverdue !== undefined ? data.daysOverdue : Math.abs(daysDiff);
  const daysRemaining = daysDiff > 0 ? daysDiff : 0;

  const templateContent = isOverdue ? ctx.overdue : ctx.reminder;
  if (!templateContent) return null;

  return renderTemplate(templateContent, {
    customerName: data.customerName,
    customerId: data.customerId || '-',
    username: data.customerUsername || '-',
    profileName: data.profileName || '-',
    area: data.area || '-',
    address: data.address || '-',
    invoiceNumber: data.invoiceNumber,
    amount: `Rp ${data.amount.toLocaleString('id-ID')}`,
    dueDate: dueDateStr,
    daysRemaining: daysRemaining.toString(),
    daysOverdue: daysOverdue.toString(),
    paymentLink: data.paymentLink,
    bankAccounts: ctx.bankAccountsText,
    companyName: data.companyName,
    companyPhone: data.companyPhone,
  });
}

/**
 * Send invoice reminder notification
 * For monthly recurring invoices - supports both pending (upcoming) and overdue invoices
 */
export async function sendInvoiceReminder(data: InvoiceReminderData & { phone: string }) {
  try {
    const ctx = await loadInvoiceReminderContext();
    const message = renderInvoiceReminderMessage(ctx, data);
    if (!message) {
      console.warn('[WA] No template found for invoice-reminder');
      return false;
    }

    await WhatsAppService.sendMessage({
      phone: data.phone,
      message,
    });

    console.log(`[WA] ✅ Invoice reminder sent to ${data.phone}`);
    return true;
  } catch (error) {
    console.error(`[WA] ❌ Failed to send invoice reminder:`, error);
    throw error; // Re-throw to let cron handle it
  }
}

export const DEFAULT_OTP_TEMPLATE =
  'Kode OTP Anda: {{otpCode}}\n\nBerlaku {{expiryMinutes}} menit.\nJangan bagikan kode ini kepada siapapun.\n\n- {{companyName}}';

/**
 * Send a login OTP. The wording comes from the editable "otp-login" template and the
 * company name from Pengaturan Perusahaan, so every installation signs with its own name.
 * Throws when the WhatsApp send fails so callers can roll the OTP back.
 */
export async function sendOtpMessage(data: { phone: string; otpCode: string; expiryMinutes: number }) {
  const [template, company] = await Promise.all([
    getTemplate('otp-login'),
    prisma.company.findFirst({ select: { name: true } }),
  ]);
  const message = renderTemplate(template || DEFAULT_OTP_TEMPLATE, {
    otpCode: data.otpCode,
    expiryMinutes: String(data.expiryMinutes),
    companyName: company?.name?.trim() || 'Layanan Internet',
  });
  await WhatsAppService.sendMessage({ phone: data.phone, message });
}

/**
 * Send payment success notification
 * Account activated
 */
export async function sendPaymentSuccess(data: {
  customerName: string;
  customerPhone: string;
  customerId?: string;
  username: string;
  password: string;
  profileName: string;
  area?: string;
  address?: string;
  invoiceNumber: string;
  amount: number;
  newExpiredAt?: Date | string | null;
}) {
  try {
    const company = await prisma.company.findFirst();
    const companyName = company?.name || 'SALFANET RADIUS';
    const companyPhone = company?.phone || '';

    // Get template from database
    const templateContent = await getTemplate('payment-success');

    if (!templateContent) {
      console.warn('[WA] No template found for payment-success');
      return;
    }

    // Format expired date for ID locale
    const expiredDate = data.newExpiredAt
      ? new Date(data.newExpiredAt).toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          timeZone: getCurrentTimezone(),
        })
      : '-';

    // Prepare variables
    const variables = {
      customerName: data.customerName,
      customerId: data.customerId || '-',
      username: data.username,
      password: data.password,
      profileName: data.profileName,
      area: data.area || '-',
      address: data.address || '-',
      invoiceNumber: data.invoiceNumber,
      amount: `Rp ${data.amount.toLocaleString('id-ID')}`,
      expiredDate,
      companyName,
      companyPhone,
    };

    // Render template
    const message = renderTemplate(templateContent, variables);

    await WhatsAppService.sendMessage({
      phone: data.customerPhone,
      message,
    });

    console.log(`[WA] ✅ Payment success notification sent to ${data.customerPhone}`);
  } catch (error) {
    console.error(`[WA] ❌ Failed to send payment success notification:`, error);
  }
}

/**
 * Send auto-renewal success notification
 * Sent when prepaid user is auto-renewed from balance
 */
export async function sendAutoRenewalSuccess(data: {
  customerName: string;
  customerPhone: string;
  customerId?: string;
  username: string;
  profileName: string;
  area?: string;
  address?: string;
  amount: number;
  newBalance: number;
  expiredDate: Date;
}) {
  try {
    const company = await prisma.company.findFirst();
    const companyName = company?.name || 'SALFANET RADIUS';
    const companyPhone = company?.phone || '';

    const expiredDateStr = data.expiredDate.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: getCurrentTimezone(),
    });

    // Get template from database
    const templateContent = await getTemplate('auto-renewal-success');

    if (!templateContent) {
      console.warn('[WA] No template found for auto-renewal-success');
      return;
    }

    // Prepare variables
    const variables = {
      customerName: data.customerName,
      customerId: data.customerId || '-',
      username: data.username,
      profileName: data.profileName,
      area: data.area || '-',
      address: data.address || '-',
      amount: `Rp ${data.amount.toLocaleString('id-ID')}`,
      newBalance: `Rp ${data.newBalance.toLocaleString('id-ID')}`,
      expiredDate: expiredDateStr,
      companyName,
      companyPhone,
    };

    // Render template
    const message = renderTemplate(templateContent, variables);

    await WhatsAppService.sendMessage({
      phone: data.customerPhone,
      message,
    });

    console.log(`[WA] ✅ Auto-renewal notification sent to ${data.customerPhone}`);
  } catch (error) {
    console.error(`[WA] ❌ Failed to send auto-renewal notification:`, error);
  }
}
