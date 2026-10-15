import 'server-only';
import { prisma } from '@/server/db/client';
import { getCurrentTimezone } from '@/lib/timezone';
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';
import { EmailService } from '@/server/services/notifications/email.service';
import {
  VOUCHER_ORDER_TTL_HOURS,
  WA_VOUCHER_PAYMENT_LINK,
  WA_VOUCHER_PURCHASE_SUCCESS,
  EMAIL_VOUCHER_PAYMENT_LINK,
  EMAIL_VOUCHER_PURCHASE,
} from './voucher-order-templates';

export type VoucherMessageKind = 'payment-link' | 'purchase';
export type ChannelResult = 'sent' | 'failed' | 'skipped';

interface OrderForMessage {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  quantity: number;
  totalAmount: number;
  paymentLink: string | null;
  createdAt: Date;
  profile: { name: string; validityValue: number; validityUnit: string };
}

const UNIT_LABEL: Record<string, string> = { MINUTES: 'menit', HOURS: 'jam', DAYS: 'hari', MONTHS: 'bulan' };
const rupiah = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

/** Pending orders past this age can no longer be paid. */
export function voucherOrderExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + VOUCHER_ORDER_TTL_HOURS * 60 * 60 * 1000);
}

function formatDateTime(d: Date): string {
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: getCurrentTimezone(),
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * One variable set for all four e-voucher templates. Older templates used
 * different names for the same value (validity/duration, orderToken/
 * orderNumber), so both are filled. Values with no meaning for a voucher
 * buyer (customer ID, account username) are empty instead of left as raw
 * {{placeholders}} in the message.
 */
export function voucherOrderVariables(order: OrderForMessage, codes: string[], company: {
  name?: string | null; phone?: string | null; email?: string | null; address?: string | null;
} | null, forEmail: boolean): Record<string, string> {
  const duration = `${order.profile.validityValue} ${UNIT_LABEL[order.profile.validityUnit] ?? order.profile.validityUnit.toLowerCase()}`;
  const voucherCodes = forEmail
    ? codes.join('<br>')
    : codes.length === 1 ? codes[0] : codes.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const vars: Record<string, string> = {
    customerName: order.customerName,
    phone: order.customerPhone,
    email: order.customerEmail ?? '',
    orderNumber: order.orderNumber,
    orderToken: order.orderNumber,
    profileName: order.profile.name,
    duration,
    validity: duration,
    quantity: String(order.quantity),
    price: rupiah(Math.round(order.totalAmount / Math.max(order.quantity, 1))),
    totalAmount: rupiah(order.totalAmount),
    paymentLink: order.paymentLink ?? '',
    expiryTime: formatDateTime(voucherOrderExpiresAt(order.createdAt)),
    purchaseDate: formatDateTime(new Date()),
    // A voucher's clock starts at first login, so there is no fixed date.
    expiryDate: `${duration} sejak pertama login`,
    voucherCodes,
    companyName: company?.name || 'ISP',
    companyPhone: company?.phone || '-',
    companyEmail: company?.email || '',
    companyAddress: company?.address || '',
    customerId: '',
    username: '',
    address: '',
  };
  if (forEmail) {
    for (const k of Object.keys(vars)) if (k !== 'voucherCodes') vars[k] = escapeHtml(vars[k]);
  }
  return vars;
}

/** Fills placeholders; any left over (a name we do not know) is removed. */
export function render(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key: string) => (key in vars ? vars[key] : ''));
}

async function waTemplate(kind: VoucherMessageKind): Promise<string> {
  // Installs seeded at different times named the paid-order template
  // differently; take whichever exists.
  const types = kind === 'purchase' ? ['voucher-purchase-success', 'voucher-purchase'] : ['voucher-payment-link'];
  for (const type of types) {
    const t = await prisma.whatsapp_templates.findFirst({ where: { type, isActive: true } });
    if (t?.message) return t.message;
  }
  return kind === 'purchase' ? WA_VOUCHER_PURCHASE_SUCCESS : WA_VOUCHER_PAYMENT_LINK;
}

async function emailTemplate(kind: VoucherMessageKind): Promise<{ subject: string; htmlBody: string }> {
  const types = kind === 'purchase' ? ['voucher-purchase', 'voucher-purchase-success'] : ['voucher-payment-link'];
  for (const type of types) {
    const t = await prisma.emailTemplate.findFirst({ where: { type, isActive: true } });
    if (t?.htmlBody) return { subject: t.subject, htmlBody: t.htmlBody };
  }
  return kind === 'purchase' ? EMAIL_VOUCHER_PURCHASE : EMAIL_VOUCHER_PAYMENT_LINK;
}

/**
 * Sends an e-voucher order message by WhatsApp and/or email. A channel is
 * used when the order has that contact (the purchase form only sends the
 * contacts for the channels the buyer picked) and the caller allows it.
 * Never throws; each channel reports what actually happened.
 */
export async function sendVoucherOrderMessage(
  kind: VoucherMessageKind,
  order: OrderForMessage,
  codes: string[] = [],
  channels: { whatsapp?: boolean; email?: boolean } = { whatsapp: true, email: true },
): Promise<{ whatsapp: ChannelResult; email: ChannelResult; errors: string[] }> {
  const result = { whatsapp: 'skipped' as ChannelResult, email: 'skipped' as ChannelResult, errors: [] as string[] };
  const company = await prisma.company.findFirst({ select: { name: true, phone: true, email: true, address: true } }).catch(() => null);

  if (channels.whatsapp !== false && order.customerPhone) {
    try {
      const message = render(await waTemplate(kind), voucherOrderVariables(order, codes, company, false));
      await WhatsAppService.sendMessage({ phone: order.customerPhone, message });
      result.whatsapp = 'sent';
    } catch (e) {
      result.whatsapp = 'failed';
      result.errors.push(`WhatsApp: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (channels.email !== false && order.customerEmail) {
    const settings = await EmailService.getSettings();
    if (!settings?.enabled) {
      result.email = 'failed';
      result.errors.push('Email: pengaturan email belum aktif');
    } else {
      try {
        const tpl = await emailTemplate(kind);
        const vars = voucherOrderVariables(order, codes, company, true);
        const sent = await EmailService.send({
          to: order.customerEmail,
          toName: order.customerName,
          // The subject is plain text: unescaped values.
          subject: render(tpl.subject, voucherOrderVariables(order, codes, company, false)),
          html: render(tpl.htmlBody, vars),
        });
        result.email = sent.success ? 'sent' : 'failed';
        if (!sent.success) result.errors.push(`Email: ${sent.error}`);
      } catch (e) {
        result.email = 'failed';
        result.errors.push(`Email: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  console.log(`[Voucher ${kind}] ${order.orderNumber}: WA ${result.whatsapp}, email ${result.email}${result.errors.length ? ` (${result.errors.join('; ')})` : ''}`);
  return result;
}
