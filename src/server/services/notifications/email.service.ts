import { prisma } from '@/server/db/client';
import { formatWIB } from '@/lib/timezone';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer = require('nodemailer');

export interface EmailOptions {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
}

export const EmailService = {
  /**
   * Get email settings from database
   */
  async getSettings() {
    try {
      const settings = await prisma.emailSettings.findFirst();
      return settings;
    } catch (error) {
      console.error('Get email settings error:', error);
      return null;
    }
  },

  /**
   * Create transporter with settings
   */
  async createTransporter() {
    const settings = await this.getSettings();
    
    if (!settings || !settings.enabled) {
      throw new Error('Email service is not configured or disabled');
    }

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure, // true for 465, false for other ports
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPassword,
      },
    });

    return { transporter, settings };
  },

  /**
   * Send email
   */
  async send(options: EmailOptions) {
    try {
      const { transporter, settings } = await this.createTransporter();

      const info = await transporter.sendMail({
        from: `"${settings.fromName}" <${settings.fromEmail}>`,
        to: options.toName ? `"${options.toName}" <${options.to}>` : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      // Save to history
      await prisma.emailHistory.create({
        data: {
          id: Math.random().toString(36).substring(2, 15),
          toEmail: options.to,
          toName: options.toName || null,
          subject: options.subject,
          body: options.html,
          status: 'sent',
        },
      });

      console.log('[Email] Sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      console.error('[Email] Send error:', error);

      // Save failed attempt to history
      try {
        await prisma.emailHistory.create({
          data: {
            id: Math.random().toString(36).substring(2, 15),
            toEmail: options.to,
            toName: options.toName || null,
            subject: options.subject,
            body: options.html,
            status: 'failed',
            error: error.message,
          },
        });
      } catch (historyError) {
        console.error('[Email] Failed to save history:', historyError);
      }

      return { success: false, error: error.message };
    }
  },

  /**
   * Send test email (bypass enabled check for testing)
   */
  async sendTest(toEmail: string) {
    try {
      const settings = await this.getSettings();
      
      if (!settings) {
        throw new Error('Email settings not found. Please configure email settings first.');
      }

      // Create transporter without checking enabled status (for testing)
      const transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: settings.smtpPort,
        secure: settings.smtpSecure,
        auth: {
          user: settings.smtpUser,
          pass: settings.smtpPassword,
        },
      });

      const html = this.generateTestEmail();

      const info = await transporter.sendMail({
        from: `"${settings.fromName}" <${settings.fromEmail}>`,
        to: toEmail,
        subject: 'Test Email dari RADIUS System',
        text: 'Ini adalah test email dari RADIUS notification system.',
        html,
      });

      // Save to history
      await prisma.emailHistory.create({
        data: {
          id: Math.random().toString(36).substring(2, 15),
          toEmail,
          toName: null,
          subject: 'Test Email dari RADIUS System',
          body: html,
          status: 'sent',
        },
      });

      console.log('[Email] Test email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      console.error('[Email] Test email error:', error);

      // Save failed attempt to history
      try {
        await prisma.emailHistory.create({
          data: {
            id: Math.random().toString(36).substring(2, 15),
            toEmail,
            toName: null,
            subject: 'Test Email dari RADIUS System',
            body: this.generateTestEmail(),
            status: 'failed',
            error: error.message,
          },
        });
      } catch (historyError) {
        console.error('[Email] Failed to save test history:', historyError);
      }

      return { success: false, error: error.message };
    }
  },

  /**
   * Format bank accounts (from company.bankAccounts JSON) as HTML for email templates
   */
  formatBankAccountsForEmail(bankAccounts: any): string {
    if (!bankAccounts) return '';
    let accounts: Array<{ bankName?: string; bank?: string; accountNumber?: string; accountName?: string }> = [];
    try {
      accounts = Array.isArray(bankAccounts) ? bankAccounts : JSON.parse(String(bankAccounts));
    } catch {
      return '';
    }
    if (!accounts.length) return '';
    const rows = accounts.map(a =>
      `<tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0369a1;">${a.bankName || a.bank || '-'}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:14px;">${a.accountNumber || '-'}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">${a.accountName || '-'}</td>
        </tr>`
    ).join('');
    return `<div style="margin:20px 0;padding:18px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;">
  <h4 style="margin:0 0 12px 0;color:#0369a1;font-size:14px;">🏦 Rekening Pembayaran Manual</h4>
  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse;border:1px solid #bae6fd;border-radius:6px;overflow:hidden;">
    <thead>
      <tr style="background:#e0f2fe;">
        <th style="padding:10px 14px;text-align:left;color:#075985;font-size:12px;">Bank</th>
        <th style="padding:10px 14px;text-align:left;color:#075985;font-size:12px;">No. Rekening</th>
        <th style="padding:10px 14px;text-align:left;color:#075985;font-size:12px;">Atas Nama</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin:8px 0 0 0;font-size:11px;color:#0369a1;">* Harap konfirmasi transfer ke admin setelah melakukan pembayaran</p>
</div>`;
  },

  /**
   * Generate test email HTML
   */
  generateTestEmail(): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">✅ Test Email Berhasil</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Halo!
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Selamat! Konfigurasi email SMTP Anda telah berhasil dan sistem notifikasi email sudah aktif.
              </p>
              
              <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #333333; margin: 0; font-size: 14px;">
                  <strong>💡 Info:</strong> Sistem akan mengirimkan notifikasi email untuk:
                </p>
                <ul style="color: #666666; margin: 10px 0 0 0; padding-left: 20px; font-size: 14px;">
                  <li>User baru terdaftar</li>
                  <li>Reminder masa aktif akan habis</li>
                  <li>Invoice jatuh tempo</li>
                  <li>Konfirmasi pembayaran</li>
                </ul>
              </div>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0 0 0;">
                Terima kasih telah menggunakan sistem kami!
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="color: #999999; font-size: 12px; margin: 0;">
                Email ini dikirim secara otomatis oleh RADIUS Notification System
              </p>
              <p style="color: #999999; font-size: 12px; margin: 5px 0 0 0;">
                © ${new Date().getFullYear()} All rights reserved
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  },

  /**
   * Generate email template for new user registration
   */
  generateNewUserEmail(data: {
    name: string;
    username: string;
    password: string;
    profile: string;
    expiredAt?: Date;
  }): string {
    const expiredDate = data.expiredAt 
      ? formatWIB(data.expiredAt, 'd MMMM yyyy')
      : 'Tidak terbatas';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Akun PPPoE Baru</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🎉 Akun PPPoE Aktif</h1>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Halo <strong>${data.name}</strong>,
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Akun PPPoE Anda telah aktif. Berikut adalah detail akun Anda:
              </p>
              
              <table width="100%" cellpadding="12" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 20px 0;">
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Username:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px; font-family: monospace;">
                    ${data.username}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Password:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px; font-family: monospace;">
                    ${data.password}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Paket:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    ${data.profile}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; padding: 12px;">
                    <strong>Masa Aktif:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; padding: 12px;">
                    ${expiredDate}
                  </td>
                </tr>
              </table>
              
              <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #856404; margin: 0; font-size: 14px;">
                  <strong>⚠️ Penting:</strong> Simpan informasi login ini dengan aman. Jangan bagikan password Anda kepada siapapun.
                </p>
              </div>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0 0 0;">
                Jika Anda memiliki pertanyaan, jangan ragu untuk menghubungi kami.
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="color: #999999; font-size: 12px; margin: 0;">
                Email ini dikirim secara otomatis oleh RADIUS Notification System
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  },

  /**
   * Generate email template for expiration reminder
   */
  generateExpirationReminderEmail(data: {
    name: string;
    username: string;
    expiredAt: Date;
    daysLeft: number;
  }): string {
    const expiredDate = formatWIB(data.expiredAt, 'd MMMM yyyy');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reminder Masa Aktif</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">⏰ Reminder Perpanjangan</h1>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Halo <strong>${data.name}</strong>,
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Masa aktif akun PPPoE Anda akan segera berakhir.
              </p>
              
              <div style="background-color: #fff3cd; border: 2px solid #ffc107; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center;">
                <p style="color: #856404; margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
                  <strong>Sisa Waktu</strong>
                </p>
                <p style="color: #d84315; margin: 0; font-size: 36px; font-weight: bold;">
                  ${data.daysLeft} Hari
                </p>
                <p style="color: #856404; margin: 10px 0 0 0; font-size: 14px;">
                  Berakhir pada ${expiredDate}
                </p>
              </div>
              
              <table width="100%" cellpadding="12" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 20px 0;">
                <tr>
                  <td style="color: #666666; font-size: 14px; padding: 12px;">
                    <strong>Username:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; padding: 12px; font-family: monospace;">
                    ${data.username}
                  </td>
                </tr>
              </table>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0;">
                Segera lakukan perpanjangan untuk menghindari terputusnya layanan internet Anda.
              </p>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0 0 0;">
                Hubungi kami untuk melakukan pembayaran dan perpanjangan.
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="color: #999999; font-size: 12px; margin: 0;">
                Email ini dikirim secara otomatis oleh RADIUS Notification System
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  },

  /**
   * Generate email template for invoice reminder
   */
  generateInvoiceReminderEmail(data: {
    name: string;
    invoiceNumber: string;
    amount: number;
    dueDate: Date;
    paymentUrl?: string;
  }): string {
    const dueDate = formatWIB(data.dueDate, 'd MMMM yyyy');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice Reminder</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">💳 Tagihan Pending</h1>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Halo <strong>${data.name}</strong>,
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Anda memiliki tagihan yang belum dibayar. Berikut detail tagihan:
              </p>
              
              <table width="100%" cellpadding="12" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 20px 0;">
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>No. Invoice:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px; font-family: monospace;">
                    ${data.invoiceNumber}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Total:</strong>
                  </td>
                  <td style="color: #d84315; font-size: 18px; font-weight: bold; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    Rp ${data.amount.toLocaleString('id-ID')}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; padding: 12px;">
                    <strong>Jatuh Tempo:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; padding: 12px;">
                    ${dueDate}
                  </td>
                </tr>
              </table>
              
              ${data.paymentUrl ? `
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.paymentUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
                  Bayar Sekarang
                </a>
              </div>
              ` : ''}
              
              <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #2e7d32; margin: 0; font-size: 14px;">
                  <strong>💡 Info:</strong> Lakukan pembayaran sebelum jatuh tempo untuk menghindari penonaktifan layanan.
                </p>
              </div>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="color: #999999; font-size: 12px; margin: 0;">
                Email ini dikirim secara otomatis oleh RADIUS Notification System
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  },

  /**
   * Generate email template for payment confirmation
   */
  generatePaymentConfirmationEmail(data: {
    name: string;
    invoiceNumber: string;
    amount: number;
    paidAt: Date;
    method: string;
  }): string {
    const paidDate = formatWIB(data.paidAt, 'd MMMM yyyy HH:mm');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Konfirmasi Pembayaran</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">✅ Pembayaran Berhasil</h1>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Halo <strong>${data.name}</strong>,
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Pembayaran Anda telah kami terima. Terima kasih atas pembayaran Anda!
              </p>
              
              <table width="100%" cellpadding="12" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 20px 0;">
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>No. Invoice:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px; font-family: monospace;">
                    ${data.invoiceNumber}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Jumlah:</strong>
                  </td>
                  <td style="color: #2e7d32; font-size: 18px; font-weight: bold; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    Rp ${data.amount.toLocaleString('id-ID')}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Metode:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    ${data.method}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; padding: 12px;">
                    <strong>Tanggal:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; padding: 12px;">
                    ${paidDate}
                  </td>
                </tr>
              </table>
              
              <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 20px 0; border-radius: 4px; text-align: center;">
                <p style="color: #2e7d32; margin: 0; font-size: 16px;">
                  <strong>✨ Layanan Anda telah diperpanjang</strong>
                </p>
              </div>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0 0 0;">
                Terima kasih telah menggunakan layanan kami!
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="color: #999999; font-size: 12px; margin: 0;">
                Email ini dikirim secara otomatis oleh RADIUS Notification System
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  },

  /**
   * Send invoice reminder email
   */
  async sendInvoiceReminder(data: {
    email: string;
    customerName: string;
    customerUsername?: string;
    profileName?: string;
    area?: string;
    invoiceNumber: string;
    amount: number;
    dueDate: Date;
    paymentLink: string;
    companyName: string;
    companyPhone: string;
    isOverdue?: boolean;
    daysOverdue?: number;
  }) {
    try {
      const settings = await this.getSettings();
      
      if (!settings || !settings.enabled) {
        console.log('[Email] Email service disabled, skipping invoice reminder');
        return { success: false, error: 'Email service disabled' };
      }

      if (!settings.notifyInvoice && !settings.reminderEnabled) {
        console.log('[Email] Invoice notification disabled in settings');
        return { success: false, error: 'Invoice notification disabled' };
      }

      // Get email template from database
      const templateType = data.isOverdue ? 'invoice-overdue' : 'invoice-reminder';
      let template = await prisma.emailTemplate.findFirst({
        where: { 
          type: templateType,
          isActive: true 
        }
      });

      // Fallback to invoice-reminder if overdue template not found
      if (!template && data.isOverdue) {
        console.warn('[Email] No template found for invoice-overdue, using invoice-reminder');
        template = await prisma.emailTemplate.findFirst({
          where: { 
            type: 'invoice-reminder',
            isActive: true 
          }
        });
      }

      if (!template) {
        console.warn(`[Email] No template found for ${templateType}`);
        return { success: false, error: 'Template not found' };
      }

      // Calculate days
      const now = new Date();
      const dueDate = new Date(data.dueDate);
      const diffTime = dueDate.getTime() - now.getTime();
      const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const isOverdue = data.isOverdue !== undefined ? data.isOverdue : daysDiff < 0;
      const daysOverdue = data.daysOverdue !== undefined ? data.daysOverdue : Math.abs(daysDiff);
      const daysRemaining = daysDiff > 0 ? daysDiff : 0;

      const dueDateStr = data.dueDate.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
      });

      // Fetch bank accounts for payment email
      const companySettings = await prisma.company.findFirst({ select: { bankAccounts: true } });

      // Prepare variables
      const variables: Record<string, string> = {
        customerId: '',
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
        bankAccounts: this.formatBankAccountsForEmail(companySettings?.bankAccounts),
        companyName: data.companyName,
        companyPhone: data.companyPhone,
      };

      // Replace variables in subject and body
      let subject = template.subject;
      let htmlBody = template.htmlBody;

      Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        subject = subject.replace(regex, value);
        htmlBody = htmlBody.replace(regex, value);
      });

      // Send email
      const result = await this.send({
        to: data.email,
        toName: data.customerName,
        subject: subject,
        html: htmlBody,
      });

      const status = isOverdue ? 'overdue' : 'reminder';
      if (result.success) {
        console.log(`[Email] ✅ Invoice ${status} sent to ${data.email}`);
      } else {
        console.error(`[Email] ❌ Failed to send invoice ${status} to ${data.email}:`, result.error);
      }

      return result;
    } catch (error: any) {
      console.error('[Email] Failed to send invoice reminder:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Send payment confirmation email
   * For manual extension by admin or payment confirmation
   */
  async sendPaymentConfirmation(data: {
    email: string;
    customerName: string;
    customerUsername?: string;
    invoiceNumber: string;
    amount: number;
    paymentMethod: string;
    companyName: string;
    companyPhone: string;
    newExpiredAt: string;
  }) {
    try {
      const settings = await this.getSettings();
      
      if (!settings || !settings.enabled) {
        console.log('[Email] Email service disabled, skipping payment confirmation');
        return { success: false, error: 'Email service disabled' };
      }

      // Get email template from database
      let template = await prisma.emailTemplate.findFirst({
        where: { 
          type: 'payment-confirmation',
          isActive: true 
        }
      });

      // If no template, create default
      if (!template) {
        console.warn('[Email] No template found for payment-confirmation, using default');
        
        const expiredDate = formatWIB(data.newExpiredAt, 'd MMMM yyyy');

        const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px;">✅ Pembayaran Berhasil</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px;">
                Halo <strong>${data.customerName}</strong>,
              </p>
              <p style="margin: 0 0 30px 0; color: #666666; font-size: 14px; line-height: 1.6;">
                Pembayaran Anda telah berhasil dikonfirmasi. Terima kasih telah melakukan pembayaran tepat waktu.
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8f9fa; border-radius: 6px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 20px;">
                    <h3 style="margin: 0 0 15px 0; color: #333333; font-size: 18px;">📋 Detail Pembayaran</h3>
                    <table width="100%" cellpadding="8" cellspacing="0" border="0">
                      <tr>
                        <td style="color: #666666; font-size: 14px;">Invoice</td>
                        <td style="color: #333333; font-size: 14px; font-weight: bold;">${data.invoiceNumber}</td>
                      </tr>
                      <tr>
                        <td style="color: #666666; font-size: 14px;">Username</td>
                        <td style="color: #333333; font-size: 14px;">${data.customerUsername || '-'}</td>
                      </tr>
                      <tr>
                        <td style="color: #666666; font-size: 14px;">Jumlah</td>
                        <td style="color: #333333; font-size: 14px; font-weight: bold;">Rp ${data.amount.toLocaleString('id-ID')}</td>
                      </tr>
                      <tr>
                        <td style="color: #666666; font-size: 14px;">Metode</td>
                        <td style="color: #333333; font-size: 14px;">${data.paymentMethod}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #e8f5e9; border-radius: 6px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 20px;">
                    <h3 style="margin: 0 0 10px 0; color: #2e7d32; font-size: 18px;">📅 Masa Aktif Baru</h3>
                    <p style="margin: 0; color: #333333; font-size: 16px;">
                      Aktif sampai: <strong>${expiredDate}</strong>
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 20px 0; color: #666666; font-size: 14px; line-height: 1.6;">
                Terima kasih atas pembayaran Anda! Layanan internet Anda akan tetap aktif hingga tanggal yang tertera di atas.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0 0 10px 0; color: #333333; font-size: 16px; font-weight: bold;">
                ${data.companyName}
              </p>
              <p style="margin: 0; color: #666666; font-size: 14px;">
                📞 ${data.companyPhone}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `;

        await this.send({
          to: data.email,
          toName: data.customerName,
          subject: '✅ Pembayaran Berhasil Dikonfirmasi',
          html: defaultHtml,
        });

        console.log(`[Email] ✅ Payment confirmation sent to ${data.email} (default template)`);
        return { success: true };
      }

      // Format expiry date
      const expiredDate = formatWIB(data.newExpiredAt, 'd MMMM yyyy');

      // Prepare variables
      const variables: Record<string, string> = {
        customerName: data.customerName,
        customerUsername: data.customerUsername || '-',
        invoiceNumber: data.invoiceNumber,
        amount: `Rp ${data.amount.toLocaleString('id-ID')}`,
        paymentMethod: data.paymentMethod,
        expiredDate: expiredDate,
        companyName: data.companyName,
        companyPhone: data.companyPhone,
      };

      // Replace variables in subject and body
      let subject = template.subject;
      let htmlBody = template.htmlBody;

      Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        subject = subject.replace(regex, value);
        htmlBody = htmlBody.replace(regex, value);
      });

      // Send email
      const result = await this.send({
        to: data.email,
        toName: data.customerName,
        subject: subject,
        html: htmlBody,
      });

      if (result.success) {
        console.log(`[Email] ✅ Payment confirmation sent to ${data.email}`);
      } else {
        console.error(`[Email] ❌ Failed to send payment confirmation to ${data.email}:`, result.error);
      }

      return result;
    } catch (error: any) {
      console.error('[Email] Failed to send payment confirmation:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Send admin create user notification email
   */
  async sendAdminCreateUser(data: {
    email: string;
    customerName: string;
    username: string;
    password: string;
    profileName: string;
    area?: string;
    companyName: string;
    companyPhone: string;
  }) {
    try {
      const settings = await this.getSettings();
      
      if (!settings || !settings.enabled) {
        console.log('[Email] Email service disabled, skipping admin create user notification');
        return { success: false, error: 'Email service disabled' };
      }

      // Get email template from database
      const template = await prisma.emailTemplate.findFirst({
        where: { 
          type: 'admin-create-user',
          isActive: true 
        }
      });

      if (!template) {
        console.warn('[Email] No template found for admin-create-user');
        return { success: false, error: 'Template not found' };
      }

      // Prepare variables
      const variables: Record<string, string> = {
        customerName: data.customerName,
        username: data.username,
        password: data.password,
        profileName: data.profileName,
        area: data.area || '-',
        companyName: data.companyName,
        companyPhone: data.companyPhone,
      };

      // Replace variables in subject and body
      let subject = template.subject;
      let htmlBody = template.htmlBody;

      Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        subject = subject.replace(regex, value);
        htmlBody = htmlBody.replace(regex, value);
      });

      // Send email
      const result = await this.send({
        to: data.email,
        toName: data.customerName,
        subject: subject,
        html: htmlBody,
      });

      if (result.success) {
        console.log(`[Email] ✅ Admin create user notification sent to ${data.email}`);
      } else {
        console.error(`[Email] ❌ Failed to send admin create user notification to ${data.email}:`, result.error);
      }

      return result;
    } catch (error: any) {
      console.error('[Email] Failed to send admin create user notification:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Send registration approval email notification
   * Sent when customer registration is approved
   */
  async sendRegistrationApprovalEmail(data: {
    toEmail: string;
    toName: string;
    username: string;
    password: string;
    profile: string;
    installationFee: number;
    invoiceNumber?: string;
    totalAmount?: number;
    dueDate?: Date;
    paymentLink?: string;
    paymentToken?: string;
    subscriptionType?: 'POSTPAID' | 'PREPAID';
  }) {
    try {
      const settings = await this.getSettings();
      
      if (!settings || !settings.enabled) {
        console.log('[Email] Email service disabled, skipping registration approval notification');
        return { success: false, error: 'Email service disabled' };
      }

      // Get email template from database
      const template = await prisma.emailTemplate.findFirst({
        where: { 
          type: 'registration-approval',
          isActive: true 
        }
      });

      // If no specific template, use inline template
      const formatCurrency = (amount: number) => 
        new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

      const formatDate = (date: Date) => 
        date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

      let htmlBody = template?.htmlBody || this.generateRegistrationApprovalEmail({
        customerName: data.toName,
        username: data.username,
        password: data.password,
        profileName: data.profile,
        installationFee: data.installationFee,
        invoiceNumber: data.invoiceNumber,
        totalAmount: data.totalAmount,
        dueDate: data.dueDate,
        paymentLink: data.paymentLink,
        subscriptionType: data.subscriptionType,
      });

      let subject = template?.subject || `Pendaftaran Anda Telah Disetujui - ${data.invoiceNumber || 'Welcome'}`;

      // If using DB template, apply variable substitution
      if (template?.htmlBody) {
        const company = await prisma.company.findFirst();
        const variables: Record<string, string> = {
          customerName: data.toName,
          username: data.username,
          password: data.password,
          profileName: data.profile,
          subscriptionType: data.subscriptionType || 'POSTPAID',
          invoiceNumber: data.invoiceNumber || '-',
          installationFee: data.installationFee.toLocaleString('id-ID'),
          amount: data.totalAmount
            ? `Rp ${data.totalAmount.toLocaleString('id-ID')}`
            : `Rp ${data.installationFee.toLocaleString('id-ID')}`,
          dueDate: data.dueDate ? formatDate(data.dueDate) : '-',
          paymentLink: data.paymentLink || '',
          paymentToken: data.paymentToken || '',
          baseUrl: company?.baseUrl || '',
          bankAccounts: this.formatBankAccountsForEmail(company?.bankAccounts),
          companyName: company?.name || '',
          companyPhone: company?.phone || '',
          companyEmail: company?.email || '',
        };
        Object.entries(variables).forEach(([key, value]) => {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
          subject = subject.replace(regex, value);
          htmlBody = htmlBody.replace(regex, value);
        });
      }

      // Send email
      const result = await this.send({
        to: data.toEmail,
        toName: data.toName,
        subject: subject,
        html: htmlBody,
      });

      if (result.success) {
        console.log(`[Email] ✅ Registration approval sent to ${data.toEmail}`);
      } else {
        console.error(`[Email] ❌ Failed to send registration approval to ${data.toEmail}:`, result.error);
      }

      return result;
    } catch (error: any) {
      console.error('[Email] Failed to send registration approval:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Generate registration approval email template
   */
  generateRegistrationApprovalEmail(data: {
    customerName: string;
    username: string;
    password: string;
    profileName: string;
    installationFee: number;
    invoiceNumber?: string;
    totalAmount?: number;
    dueDate?: Date;
    paymentLink?: string;
    subscriptionType?: 'POSTPAID' | 'PREPAID';
  }): string {
    const formatCurrency = (amount: number) => 
      new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

    const formatDate = (date: Date) => 
      date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pendaftaran Disetujui</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #00c9ff 0%, #92fe9d 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">✅ Pendaftaran Disetujui</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="font-size: 16px; color: #333;">Halo <strong>${data.customerName}</strong>,</p>
              <p style="font-size: 16px; color: #333;">Selamat! Pendaftaran Anda telah disetujui. Berikut detail akun Anda:</p>
              
              <table width="100%" style="background: #f9f9f9; border-radius: 8px; margin: 20px 0;">
                <tr><td style="padding: 12px; border-bottom: 1px solid #eee;"><strong>Username:</strong></td><td style="padding: 12px; border-bottom: 1px solid #eee;">${data.username}</td></tr>
                <tr><td style="padding: 12px; border-bottom: 1px solid #eee;"><strong>Password:</strong></td><td style="padding: 12px; border-bottom: 1px solid #eee;">${data.password}</td></tr>
                <tr><td style="padding: 12px; border-bottom: 1px solid #eee;"><strong>Paket:</strong></td><td style="padding: 12px; border-bottom: 1px solid #eee;">${data.profileName}</td></tr>
                <tr><td style="padding: 12px; border-bottom: 1px solid #eee;"><strong>Tipe:</strong></td><td style="padding: 12px; border-bottom: 1px solid #eee;">${data.subscriptionType || 'POSTPAID'}</td></tr>
                ${data.invoiceNumber ? `<tr><td style="padding: 12px; border-bottom: 1px solid #eee;"><strong>No. Invoice:</strong></td><td style="padding: 12px; border-bottom: 1px solid #eee;">${data.invoiceNumber}</td></tr>` : ''}
                ${data.totalAmount ? `<tr><td style="padding: 12px; border-bottom: 1px solid #eee;"><strong>Total Tagihan:</strong></td><td style="padding: 12px; border-bottom: 1px solid #eee;">${formatCurrency(data.totalAmount)}</td></tr>` : ''}
                ${data.dueDate ? `<tr><td style="padding: 12px;"><strong>Jatuh Tempo:</strong></td><td style="padding: 12px;">${formatDate(data.dueDate)}</td></tr>` : ''}
              </table>
              
              ${data.paymentLink ? `
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.paymentLink}" style="display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold;">Bayar Sekarang</a>
              </div>
              ` : ''}
              
              <p style="font-size: 14px; color: #666;">Simpan informasi login ini dengan aman. Jangan bagikan kepada siapapun.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  },
};

/**
 * Send auto-renewal success email notification
 * Sent when prepaid user is auto-renewed from balance
 */
export async function sendAutoRenewalEmail(data: {
  customerName: string;
  customerEmail: string;
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

    // Get template from database
    const template = await prisma.emailTemplate.findFirst({
      where: {
        type: 'auto-renewal-success',
        isActive: true,
      },
    });

    if (!template) {
      console.warn('[Email] No template found for auto-renewal-success');
      return { success: false, error: 'Template not found' };
    }

    const expiredDateStr = data.expiredDate.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Jakarta',
    });

    // Prepare variables
    const variables: Record<string, string> = {
      customerName: data.customerName,
      username: data.username,
      profileName: data.profileName,
      amount: `Rp ${data.amount.toLocaleString('id-ID')}`,
      newBalance: `Rp ${data.newBalance.toLocaleString('id-ID')}`,
      expiredDate: expiredDateStr,
      companyName,
      companyPhone,
    };

    // Replace variables in subject and body
    let subject = template.subject;
    let htmlBody = template.htmlBody;

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      subject = subject.replace(regex, value);
      htmlBody = htmlBody.replace(regex, value);
    });

    // Send email
    const result = await EmailService.send({
      to: data.customerEmail,
      toName: data.customerName,
      subject: subject,
      html: htmlBody,
    });

    if (result.success) {
      console.log(`[Email] ✅ Auto-renewal notification sent to ${data.customerEmail}`);
    } else {
      console.error(`[Email] ❌ Failed to send auto-renewal notification to ${data.customerEmail}:`, result.error);
    }

    return result;
  } catch (error: any) {
    console.error('[Email] Failed to send auto-renewal notification:', error);
    return { success: false, error: error.message };
  }
}
