import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';
import { prisma } from '@/server/db/client';

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
 * Send registration approval notification
 * Includes username, password, and installation info
 */
export async function sendRegistrationApproval(data: {
  customerName: string;
  customerPhone: string;
  username: string;
  password: string;
  profileName: string;
  installationFee: number;
  invoiceNumber?: string;
  subscriptionType?: string;
  dueDate?: Date;
  paymentLink?: string;
  totalAmount?: number;
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
      ? data.dueDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
      : '-';

    // Prepare variables
    const variables = {
      customerName: data.customerName,
      username: data.username,
      password: data.password,
      profileName: data.profileName,
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
      timeZone: 'Asia/Jakarta',
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
      ? data.expiredAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
      : '-';

    // Prepare variables
    const variables = {
      customerName: data.customerName,
      customerId: data.customerId || '-',
      username: data.username,
      password: data.password,
      profileName: data.profileName,
      area: data.area || '-',
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

/**
 * Send invoice reminder notification
 * For monthly recurring invoices - supports both pending (upcoming) and overdue invoices
 */
export async function sendInvoiceReminder(data: {
  phone: string;
  customerName: string;
  customerUsername?: string;
  profileName?: string;
  area?: string;
  invoiceNumber: string;
  amount: number;
  dueDate: Date | string; // Accept both Date and string
  paymentLink: string;
  companyName: string;
  companyPhone: string;
  isOverdue?: boolean; // Optional flag to use overdue template
  daysOverdue?: number; // Optional override for days overdue
}) {
  try {
    // Ensure dueDate is a Date object
    const dueDateObj = data.dueDate instanceof Date ? data.dueDate : new Date(data.dueDate);

    const dueDateStr = dueDateObj.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Jakarta',
    });

    // Calculate days remaining or overdue
    const now = new Date();
    const diffTime = dueDateObj.getTime() - now.getTime();
    const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Determine if overdue (either by flag or by calculation)
    const isOverdue = data.isOverdue !== undefined ? data.isOverdue : daysDiff < 0;
    // Use provided daysOverdue or calculate from date difference
    const daysOverdue = data.daysOverdue !== undefined ? data.daysOverdue : Math.abs(daysDiff);
    const daysRemaining = daysDiff > 0 ? daysDiff : 0;

    // Get appropriate template from database
    const templateType = isOverdue ? 'invoice-overdue' : 'invoice-reminder';
    let templateContent = await getTemplate(templateType);

    // Fallback to invoice-reminder if overdue template not found
    if (!templateContent && isOverdue) {
      console.warn('[WA] No template found for invoice-overdue, using invoice-reminder');
      templateContent = await getTemplate('invoice-reminder');
    }

    if (!templateContent) {
      console.warn(`[WA] No template found for ${templateType}`);
      return;
    }

    // Fetch bank accounts for payment templates
    const company = await prisma.company.findFirst({ select: { bankAccounts: true } });
    const bankAccountsText = formatBankAccountsForWA(company?.bankAccounts);

    // Prepare variables (supports both templates)
    const variables = {
      customerName: data.customerName,
      username: data.customerUsername || '-',
      profileName: data.profileName || '-',
      area: data.area || '-',
      invoiceNumber: data.invoiceNumber,
      amount: `Rp ${data.amount.toLocaleString('id-ID')}`,
      dueDate: dueDateStr,
      daysRemaining: daysRemaining.toString(),
      daysOverdue: daysOverdue.toString(),
      paymentLink: data.paymentLink,
      bankAccounts: bankAccountsText,
      companyName: data.companyName,
      companyPhone: data.companyPhone,
    };

    // Render template
    const message = renderTemplate(templateContent, variables);

    await WhatsAppService.sendMessage({
      phone: data.phone,
      message,
    });

    const status = isOverdue ? 'overdue' : 'reminder';
    console.log(`[WA] ✅ Invoice ${status} sent to ${data.phone}`);
  } catch (error) {
    console.error(`[WA] ❌ Failed to send invoice reminder:`, error);
    throw error; // Re-throw to let cron handle it
  }
}

/**
 * Send payment success notification
 * Account activated
 */
export async function sendPaymentSuccess(data: {
  customerName: string;
  customerPhone: string;
  username: string;
  password: string;
  profileName: string;
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
        })
      : '-';

    // Prepare variables
    const variables = {
      customerName: data.customerName,
      username: data.username,
      password: data.password,
      profileName: data.profileName,
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
 * Send voucher purchase success notification
 * Sends voucher codes to customer after successful e-voucher payment
 */
export async function sendVoucherPurchaseSuccess(data: {
  customerName: string;
  customerPhone: string;
  orderNumber: string;
  profileName: string;
  quantity: number;
  voucherCodes: string[];
  validityValue: number;
  validityUnit: string;
}) {
  try {
    const company = await prisma.company.findFirst();
    const companyName = company?.name || 'SALFANET RADIUS';
    const companyPhone = company?.phone || '';

    // Get template from database
    const templateContent = await getTemplate('voucher-purchase-success');

    if (!templateContent) {
      console.warn('[WA] No template found for voucher-purchase-success');
      return;
    }

    // Format voucher codes list
    const voucherList = data.voucherCodes.map((code, i) => `${i + 1}. ${code}`).join('\n');

    // Format validity
    const validityText = `${data.validityValue} ${data.validityUnit.toLowerCase()}`;

    // Prepare variables
    const variables = {
      customerName: data.customerName,
      orderNumber: data.orderNumber,
      profileName: data.profileName,
      quantity: data.quantity.toString(),
      voucherCodes: voucherList,
      validity: validityText,
      companyName,
      companyPhone,
    };

    // Render template
    const message = renderTemplate(templateContent, variables);

    await WhatsAppService.sendMessage({
      phone: data.customerPhone,
      message,
    });

    console.log(`[WA] ✅ Voucher purchase notification sent to ${data.customerPhone}`);
  } catch (error) {
    console.error(`[WA] ❌ Failed to send voucher purchase notification:`, error);
  }
}

/**
 * Send auto-renewal success notification
 * Sent when prepaid user is auto-renewed from balance
 */
export async function sendAutoRenewalSuccess(data: {
  customerName: string;
  customerPhone: string;
  username: string;
  profileName: string;
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
      timeZone: 'Asia/Jakarta',
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
      username: data.username,
      profileName: data.profileName,
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
