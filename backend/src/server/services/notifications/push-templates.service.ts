import 'server-only'
/**
 * Push Notification Templates
 * Structured templates matching email/WhatsApp templates for Web Push (PWA)
 */

import { prisma } from '@/server/db/client';
import {
  sendWebPushBroadcast,
  sendWebPushToUser,
  sendWebPushToUsers,
} from '@/server/services/push-notification.service';

// Template types matching email/WhatsApp system
export type PushTemplateType = 
  | 'invoice-reminder'
  | 'invoice-overdue'
  | 'payment-success'
  | 'payment-rejected'
  | 'auto-renewal-success'
  | 'isolation-notice'
  | 'package-change-invoice'
  | 'broadcast'
  | 'info';

export interface PushTemplateData {
  // Common
  customerName?: string;
  companyName?: string;
  companyPhone?: string;
  
  // Invoice related
  invoiceNumber?: string;
  amount?: number;
  dueDate?: Date;
  profileName?: string;
  area?: string;
  paymentLink?: string;
  
  // Overdue
  isOverdue?: boolean;
  daysOverdue?: number;
  
  // Auto-renewal
  newBalance?: number;
  expiredDate?: Date;
  
  // Isolation
  username?: string;
  
  // Broadcast / custom
  customTitle?: string;
  customBody?: string;
}

/**
 * Generate push notification title and body from template type and data
 */
export function generatePushContent(
  type: PushTemplateType,
  data: PushTemplateData
): { title: string; body: string; dataPayload: Record<string, string> } {
  const formatCurrency = (amount: number) => `Rp ${amount.toLocaleString('id-ID')}`;
  const formatDate = (date: Date) => {
    const d = new Date(date);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const dataPayload: Record<string, string> = { type };

  // Add structured data for mobile app rendering
  if (data.invoiceNumber) dataPayload.invoiceNumber = data.invoiceNumber;
  if (data.amount) dataPayload.amount = String(data.amount);
  if (data.dueDate) dataPayload.dueDate = new Date(data.dueDate).toISOString();
  if (data.expiredDate) dataPayload.expiredDate = new Date(data.expiredDate).toISOString();
  if (data.customerName) dataPayload.customerName = data.customerName;
  if (data.profileName) dataPayload.profileName = data.profileName;
  if (data.username) dataPayload.username = data.username;
  if (data.newBalance !== undefined) dataPayload.newBalance = String(data.newBalance);

  const company = data.companyName || '';
  const phone = data.companyPhone || '';
  const footer = phone ? `\n${company} ☎️ ${phone}` : `\n${company}`;

  switch (type) {
    case 'invoice-reminder': {
      const name = data.customerName || 'Pelanggan';
      const inv = data.invoiceNumber || '';
      const amt = data.amount ? formatCurrency(data.amount) : '';
      const due = data.dueDate ? formatDate(data.dueDate) : '';
      const pkg = data.profileName || '';
      
      return {
        title: `⏰ Pengingat Pembayaran - ${inv}`,
        body: `Halo ${name},\n\nIni adalah pengingat untuk tagihan Anda yang akan segera jatuh tempo.\n\n📋 Detail Invoice:\n🧾 No. Invoice: ${inv}\n📦 Paket: ${pkg}\n💰 Jumlah: ${amt}\n📅 Jatuh Tempo: ${due}\n\nSegera lakukan pembayaran agar layanan internet Anda tidak terganggu.${footer}`,
        dataPayload: {
          ...dataPayload,
          link: '/(tabs)/invoices',
        },
      };
    }

    case 'invoice-overdue': {
      const name = data.customerName || 'Pelanggan';
      const inv = data.invoiceNumber || '';
      const amt = data.amount ? formatCurrency(data.amount) : '';
      const due = data.dueDate ? formatDate(data.dueDate) : '';
      const days = data.daysOverdue || 0;
      
      return {
        title: `⚠️ Tagihan Jatuh Tempo - ${inv}`,
        body: `Halo ${name},\n\nTagihan Anda telah melewati jatuh tempo.\n\n📋 Detail Invoice:\n🧾 No. Invoice: ${inv}\n💰 Jumlah: ${amt}\n📅 Jatuh Tempo: ${due}${days > 0 ? `\n⏱️ Terlambat: ${days} hari` : ''}\n\nMohon segera lakukan pembayaran untuk menghindari isolir layanan.${footer}`,
        dataPayload: {
          ...dataPayload,
          link: '/(tabs)/invoices',
        },
      };
    }

    case 'payment-success': {
      const name = data.customerName || 'Pelanggan';
      const inv = data.invoiceNumber || '';
      const amt = data.amount ? formatCurrency(data.amount) : '';
      const user = data.username || '';
      const exp = data.expiredDate ? formatDate(data.expiredDate) : '';
      
      return {
        title: `✅ Pembayaran Berhasil - ${inv}`,
        body: `Halo ${name},\n\nTerima kasih! Pembayaran Anda telah berhasil dikonfirmasi.\n\n📋 Detail Pembayaran:\n📌 Invoice: ${inv}\n💰 Jumlah: ${amt}${user ? `\n👤 Username: ${user}` : ''}${exp ? `\n📅 Aktif hingga: ${exp}` : ''}\n\n🎉 Akun Anda sekarang aktif. Terima kasih!${footer}`,
        dataPayload: {
          ...dataPayload,
          link: '/(tabs)/invoices',
        },
      };
    }

    case 'payment-rejected': {
      const name = data.customerName || 'Pelanggan';
      const inv = data.invoiceNumber || '';
      const amt = data.amount ? formatCurrency(data.amount) : '';
      const reason = data.customBody || '';
      
      return {
        title: `❌ Pembayaran Ditolak - ${inv}`,
        body: `Halo ${name},\n\nPembayaran Anda untuk invoice ${inv}${amt ? ` sebesar ${amt}` : ''} telah ditolak.${reason ? `\n\nAlasan: ${reason}` : ''}\n\nSilakan upload ulang bukti pembayaran yang valid atau hubungi admin untuk bantuan.${footer}`,
        dataPayload: {
          ...dataPayload,
          link: '/(tabs)/invoices',
        },
      };
    }

    case 'package-change-invoice': {
      const name = data.customerName || 'Pelanggan';
      const inv = data.invoiceNumber || '';
      const pkg = data.profileName || '';
      const amt = data.amount ? formatCurrency(data.amount) : '';
      
      return {
        title: `📦 Invoice Ganti Paket - ${inv}`,
        body: `Halo ${name},\n\nInvoice perubahan paket telah dibuat.\n\n📋 Detail:\n🧾 No. Invoice: ${inv}\n📦 Paket Baru: ${pkg}\n💰 Jumlah: ${amt}\n\nSegera lakukan pembayaran untuk memproses perubahan paket Anda.${footer}`,
        dataPayload: {
          ...dataPayload,
          link: '/(tabs)/invoices',
        },
      };
    }

    case 'auto-renewal-success': {
      const name = data.customerName || 'Pelanggan';
      const amt = data.amount ? formatCurrency(data.amount) : '';
      const pkg = data.profileName || '';
      const bal = data.newBalance !== undefined ? formatCurrency(data.newBalance) : '';
      const exp = data.expiredDate ? formatDate(data.expiredDate) : '';
      
      return {
        title: `🔄 Perpanjangan Otomatis Berhasil`,
        body: `Halo ${name},\n\nPaket ${pkg} Anda telah diperpanjang otomatis.\n\n📋 Detail:\n💰 Biaya: ${amt}\n💳 Sisa Saldo: ${bal}\n📅 Aktif hingga: ${exp}\n\nTerima kasih telah menggunakan layanan kami!${footer}`,
        dataPayload: {
          ...dataPayload,
          link: '/(tabs)',
        },
      };
    }

    case 'isolation-notice': {
      const name = data.customerName || 'Pelanggan';
      const user = data.username || '';
      const amt = data.amount ? formatCurrency(data.amount) : '';
      const due = data.dueDate ? formatDate(data.dueDate) : '';
      
      return {
        title: `🔒 Layanan Diisolir`,
        body: `Halo ${name}${user ? ` (@${user})` : ''},\n\nLayanan internet Anda telah diisolir karena ada tagihan yang belum dibayar.${amt ? `\n\n💰 Tagihan: ${amt}` : ''}${due ? `\n📅 Jatuh Tempo: ${due}` : ''}\n\nSilakan segera lakukan pembayaran untuk mengaktifkan kembali layanan Anda.${footer}`,
        dataPayload: {
          ...dataPayload,
          link: '/(tabs)/invoices',
        },
      };
    }

    case 'broadcast': {
      return {
        title: data.customTitle || '📢 Pengumuman',
        body: data.customBody || '',
        dataPayload,
      };
    }

    case 'info': {
      return {
        title: data.customTitle || 'ℹ️ Informasi',
        body: data.customBody || '',
        dataPayload,
      };
    }

    default: {
      return {
        title: data.customTitle || 'Notifikasi',
        body: data.customBody || '',
        dataPayload,
      };
    }
  }
}

/**
 * Send push notification to a specific user by userId
 */
export async function sendPushToUser(
  userId: string,
  type: PushTemplateType,
  data: PushTemplateData
): Promise<{ success: boolean; sent: number; failed: number }> {
  try {
    const user = await prisma.pppoeUser.findUnique({
      where: { id: userId },
      select: {
        name: true,
        username: true,
        pushSubscriptions: {
          where: { isActive: true },
          select: { id: true },
        },
      },
    });

    if (!user) {
      console.log(`[Push] User ${userId} not found`);
      return { success: false, sent: 0, failed: 0 };
    }

    if (user.pushSubscriptions.length === 0) {
      console.log(`[Push] No web push subscriptions found for user ${userId}`);
      return { success: false, sent: 0, failed: 0 };
    }

    if (!data.customerName) {
      data.customerName = user.name || user.username;
    }

    const { title, body, dataPayload } = generatePushContent(type, data);

    const webPushResult = await sendWebPushToUser(userId, {
      title,
      body,
      url: dataPayload.link,
      tag: type,
      data: dataPayload,
    });

    console.log(
      `[Push] Sent ${type} to user ${userId}: ${webPushResult.sent} success, ${webPushResult.failed} failed`
    );

    return { success: webPushResult.sent > 0, sent: webPushResult.sent, failed: webPushResult.failed };
  } catch (error: any) {
    console.error(`[Push] Error sending to user ${userId}:`, error.message);
    return { success: false, sent: 0, failed: 1 };
  }
}

/**
 * Send push notification to multiple users by userIds
 */
export async function sendPushToUsers(
  userIds: string[],
  type: PushTemplateType,
  data: PushTemplateData
): Promise<{ success: number; failed: number }> {
  if (userIds.length === 0) return { success: 0, failed: 0 };

  try {
    const { title, body, dataPayload } = generatePushContent(type, data);

    const webPushResult = await sendWebPushToUsers(userIds, {
      title,
      body,
      url: dataPayload.link,
      tag: type,
      data: dataPayload,
    });

    console.log(
      `[Push] Sent ${type} to ${userIds.length} users via web push: ${webPushResult.sent} success, ${webPushResult.failed} failed`
    );

    return {
      success: webPushResult.sent,
      failed: webPushResult.failed,
    };
  } catch (error: any) {
    console.error(`[Push] Batch send error:`, error.message);
    return { success: 0, failed: userIds.length };
  }
}

/**
 * Send push notification to ALL users with FCM tokens
 */
export async function sendPushToAll(
  type: PushTemplateType,
  data: PushTemplateData
): Promise<{ success: number; failed: number }> {
  try {
    const { title, body, dataPayload } = generatePushContent(type, data);

    const userIds = await prisma.pppoeUser.findMany({
      where: { status: { not: 'stop' } },
      select: { id: true },
    }).then(users => users.map(u => u.id));

    const webPushResult = await sendWebPushBroadcast({
      title,
      body,
      type,
      targetType: 'all',
      targetIds: userIds,
      data: dataPayload,
    });

    console.log(
      `[Push Broadcast] ${type}: ${webPushResult.sent} success, ${webPushResult.failed} failed`
    );

    return {
      success: webPushResult.sent,
      failed: webPushResult.failed,
    };
  } catch (error: any) {
    console.error(`[Push Broadcast] Error:`, error.message);
    return { success: 0, failed: 0 };
  }
}
