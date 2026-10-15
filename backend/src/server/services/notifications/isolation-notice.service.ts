import 'server-only';
import { prisma } from '@/server/db/client';
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';
import { EmailService } from '@/server/services/notifications/email.service';
import { sendPushToUser } from '@/server/services/notifications/push-templates.service';

type ChannelResult = 'sent' | 'failed' | 'skipped';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 0812-3456 7890 / +62 812... -> 6281234567890, for wa.me links. */
function phoneForWaLink(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  return digits;
}

/**
 * Tells a customer their connection was isolated: WhatsApp and email from
 * the isolation templates (Settings > Isolir > Template), each behind its
 * own toggle in the isolation settings, plus a push to the customer app.
 * Used by the auto-isolir cron and by every manual isolation path, so a
 * customer isolated by staff is told the same way. Never throws.
 */
export async function sendIsolationNotice(userId: string): Promise<{ whatsapp: ChannelResult; email: ChannelResult }> {
  const result = { whatsapp: 'skipped' as ChannelResult, email: 'skipped' as ChannelResult };
  try {
    const [user, company] = await Promise.all([
      prisma.pppoeUser.findUnique({
        where: { id: userId },
        select: {
          id: true, username: true, name: true, phone: true, email: true, address: true,
          customerId: true, expiredAt: true,
          profile: { select: { name: true } },
          area: { select: { name: true } },
        },
      }),
      prisma.company.findFirst({
        select: {
          name: true, phone: true, email: true, baseUrl: true,
          isolationRateLimit: true, isolationNotifyWhatsapp: true, isolationNotifyEmail: true,
        },
      }),
    ]);
    if (!user) return result;

    await sendPushToUser(user.id, 'isolation-notice', {
      customerName: user.name || user.username,
      username: user.username,
      companyName: company?.name || '',
      companyPhone: company?.phone || '',
    }).catch((e) => console.error(`[ISOLATION_NOTICE] Push failed for ${user.username}:`, e?.message || e));

    const latestInvoice = await prisma.invoice.findFirst({
      where: { userId: user.id, status: { in: ['PENDING', 'OVERDUE'] } },
      orderBy: { dueDate: 'desc' },
      select: { paymentLink: true },
    });
    const baseUrl = (company?.baseUrl || '').replace(/\/+$/, '');
    const paymentLink = latestInvoice?.paymentLink || `${baseUrl}/customer`;
    const vars: Record<string, string> = {
      customerName: user.name || user.username,
      customerId: user.customerId || '-',
      username: user.username,
      profileName: user.profile?.name || '-',
      area: user.area?.name || '-',
      address: user.address || '-',
      expiredDate: user.expiredAt
        ? new Date(user.expiredAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
        : '-',
      rateLimit: company?.isolationRateLimit || '-',
      paymentLink,
      qrCode: paymentLink,
      // Same QR source as the template preview in the admin panel.
      qrCodeImage: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentLink)}`,
      companyName: company?.name || '',
      companyPhone: company?.phone || '',
      companyPhoneClean: phoneForWaLink(company?.phone || ''),
      companyEmail: company?.email || '',
    };
    // Unknown placeholders are dropped rather than sent as raw {{name}}.
    const render = (tpl: string, escape: boolean) =>
      tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => {
        const v = vars[k] ?? '';
        return escape && k !== 'qrCodeImage' && k !== 'paymentLink' ? escapeHtml(v) : v;
      });

    if (company?.isolationNotifyWhatsapp && user.phone) {
      const tpl = await prisma.isolationTemplate.findFirst({ where: { type: 'whatsapp', isActive: true } });
      if (tpl) {
        try {
          await WhatsAppService.sendMessage({ phone: user.phone, message: render(tpl.message, false) });
          result.whatsapp = 'sent';
        } catch (e: any) {
          result.whatsapp = 'failed';
          console.error(`[ISOLATION_NOTICE] WhatsApp failed for ${user.username}:`, e?.message || e);
        }
      } else {
        console.warn('[ISOLATION_NOTICE] No active WhatsApp isolation template; notice not sent');
      }
    }

    if (company?.isolationNotifyEmail && user.email) {
      const tpl = await prisma.isolationTemplate.findFirst({ where: { type: 'email', isActive: true } });
      const settings = await EmailService.getSettings();
      if (tpl && settings?.enabled) {
        const sent = await EmailService.send({
          to: user.email,
          toName: user.name || user.username,
          subject: render(tpl.subject || 'Layanan internet Anda diisolir', false),
          html: render(tpl.message, true),
        });
        result.email = sent.success ? 'sent' : 'failed';
      } else {
        console.warn(`[ISOLATION_NOTICE] Email not sent: ${!tpl ? 'no active email isolation template' : 'email settings disabled'}`);
      }
    }
  } catch (e: any) {
    console.error(`[ISOLATION_NOTICE] Failed for user ${userId}:`, e?.message || e);
  }
  return result;
}
