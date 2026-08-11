import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Complete Email Templates for all flows
 */
export const emailTemplates = [
  {
    type: 'registration-confirmation',
    name: 'Konfirmasi Pendaftaran',
    subject: '✅ Konfirmasi Pendaftaran - {{customerName}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Konfirmasi Pendaftaran</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">✅ Pendaftaran Diterima</h1>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Halo <strong>{{customerName}}</strong>,
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Terima kasih telah mendaftar! Kami telah menerima pendaftaran Anda dengan detail berikut:
              </p>
              
              <table width="100%" cellpadding="12" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 20px 0;">
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Nama:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    {{customerName}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Telepon:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    {{phone}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Paket:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    {{profileName}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; padding: 12px;">
                    <strong>Alamat:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; padding: 12px;">
                    {{address}}
                  </td>
                </tr>
              </table>
              
              <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #2e7d32; margin: 0; font-size: 14px;">
                  <strong>📋 Status:</strong> Pendaftaran Anda sedang diproses oleh tim kami. Anda akan menerima notifikasi lebih lanjut setelah pendaftaran disetujui.
                </p>
              </div>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0 0 0;">
                Jika ada pertanyaan, silakan hubungi kami di <strong>{{companyPhone}}</strong>
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="color: #666666; font-size: 14px; margin: 0 0 10px 0;">
                <strong>{{companyName}}</strong>
              </p>
              <p style="color: #999999; font-size: 12px; margin: 0;">
                Email ini dikirim secara otomatis oleh sistem
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    isActive: true,
  },
  {
    type: 'registration-approval',
    name: 'Persetujuan Pendaftaran',
    subject: '🎉 Selamat Datang {{customerName}} - Akun Anda Telah Disetujui!',
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Persetujuan Pendaftaran</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🎉 Pendaftaran Disetujui</h1>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Halo <strong>{{customerName}}</strong>,
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Selamat! Pendaftaran Anda telah disetujui. Berikut adalah informasi akun PPPoE Anda:
              </p>
              
              <table width="100%" cellpadding="12" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 20px 0;">
                <tr>
                  <td colspan="2" style="color: #667eea; font-size: 16px; font-weight: bold; padding: 12px; border-bottom: 2px solid #667eea;">
                    📱 Informasi Akun
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>ID Pelanggan:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px; font-family: monospace;">
                    {{customerId}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Username:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px; font-family: monospace;">
                    {{username}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Password:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px; font-family: monospace;">
                    {{password}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Paket:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    {{profileName}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; padding: 12px;">
                    <strong>Tipe:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; padding: 12px;">
                    {{subscriptionType}}
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="12" cellspacing="0" style="background-color: #fff3cd; border-radius: 8px; margin: 20px 0;">
                <tr>
                  <td colspan="2" style="color: #856404; font-size: 16px; font-weight: bold; padding: 12px; border-bottom: 2px solid #ffc107;">
                    💰 Invoice Instalasi
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #ffe599; padding: 12px;">
                    <strong>No. Invoice:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #ffe599; padding: 12px; font-family: monospace;">
                    {{invoiceNumber}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #ffe599; padding: 12px;">
                    <strong>Biaya Instalasi:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #ffe599; padding: 12px;">
                    Rp {{installationFee}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #ffe599; padding: 12px;">
                    <strong>Total Tagihan:</strong>
                  </td>
                  <td style="color: #d32f2f; font-size: 18px; font-weight: bold; border-bottom: 1px solid #ffe599; padding: 12px;">
                    {{amount}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; padding: 12px;">
                    <strong>Jatuh Tempo:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; padding: 12px;">
                    {{dueDate}}
                  </td>
                </tr>
              </table>
              
              <div style="text-align: center; margin: 30px 0;">
                <p style="color: #666; font-size: 14px; margin: 0 0 10px 0;"><strong>Pilih Metode Pembayaran:</strong></p>
                <a href="{{paymentLink}}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-size: 16px; font-weight: bold; margin: 5px;">
                  💳 Bayar via Payment Gateway
                </a>
              </div>

              {{bankAccounts}}
              
              <div style="text-align: center; margin: 20px 0;">
                <p style="color: #666; font-size: 14px; margin: 0 0 10px 0;">Atau konfirmasi transfer manual di:</p>
                <a href="{{baseUrl}}/pay-manual/{{paymentToken}}" style="display: inline-block; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
                  ✅ Konfirmasi Pembayaran Manual
                </a>
              </div>

              <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #856404; margin: 0 0 10px 0; font-size: 14px;">
                  <strong>⚠️ PENTING:</strong>
                </p>
                <ul style="color: #856404; margin: 0; padding-left: 20px; font-size: 14px;">
                  <li>Akun Anda saat ini dalam status <strong>ISOLATED</strong> (terbatas)</li>
                  <li>Silakan lakukan pembayaran untuk mengaktifkan layanan penuh</li>
                  <li>Setelah pembayaran dikonfirmasi, akun akan otomatis aktif</li>
                  <li>Simpan informasi login Anda dengan aman</li>
                </ul>
              </div>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0 0 0;">
                Jika ada pertanyaan, silakan hubungi kami di <strong>{{companyPhone}}</strong>
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="color: #666666; font-size: 14px; margin: 0 0 10px 0;">
                <strong>{{companyName}}</strong>
              </p>
              <p style="color: #999999; font-size: 12px; margin: 0;">
                Email ini dikirim secara otomatis oleh sistem
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    isActive: true,
  },
  {
    type: 'manual-payment-approval',
    name: 'Pembayaran Manual Disetujui',
    subject: '✅ Pembayaran Disetujui - {{invoiceNumber}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pembayaran Disetujui</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #34d399 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🎉 Pembayaran Disetujui</h1>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Halo <strong>{{customerName}}</strong>,
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Pembayaran manual Anda telah <strong style="color: #10b981;">DISETUJUI</strong> oleh admin kami.
              </p>
              
              <table width="100%" cellpadding="12" cellspacing="0" style="background-color: #f0fdf4; border-radius: 8px; margin: 20px 0; border: 2px solid #10b981;">
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #d1fae5; padding: 12px;">
                    <strong>ID Pelanggan:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #d1fae5; padding: 12px; font-family: monospace;">
                    {{customerId}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #d1fae5; padding: 12px;">
                    <strong>No. Invoice:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #d1fae5; padding: 12px; font-family: monospace;">
                    {{invoiceNumber}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #d1fae5; padding: 12px;">
                    <strong>Jumlah:</strong>
                  </td>
                  <td style="color: #10b981; font-size: 18px; font-weight: bold; border-bottom: 1px solid #d1fae5; padding: 12px;">
                    {{amount}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #d1fae5; padding: 12px;">
                    <strong>Username:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #d1fae5; padding: 12px; font-family: monospace;">
                    {{customerUsername}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; padding: 12px;">
                    <strong>Masa Aktif Hingga:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; padding: 12px;">
                    {{expiredDate}}
                  </td>
                </tr>
              </table>
              
              <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #065f46; margin: 0; font-size: 14px; line-height: 1.6;">
                  ✅ <strong>Akun Anda sekarang sudah aktif</strong> dan dapat digunakan untuk mengakses layanan internet.
                </p>
              </div>
              
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
                Terima kasih telah melakukan pembayaran tepat waktu.
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="color: #666666; font-size: 12px; margin: 0 0 10px 0;">
                {{companyName}}<br>
                {{companyPhone}} | {{companyEmail}}
              </p>
              <p style="color: #999999; font-size: 11px; margin: 0;">
                Email otomatis, mohon tidak membalas email ini.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    isActive: true,
  },
  {
    type: 'manual-payment-rejection',
    name: 'Pembayaran Manual Ditolak',
    subject: '❌ Pembayaran Ditolak - {{invoiceNumber}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pembayaran Ditolak</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #ef4444 0%, #f87171 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">❌ Pembayaran Ditolak</h1>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Halo <strong>{{customerName}}</strong>,
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Mohon maaf, pembayaran manual Anda <strong style="color: #ef4444;">DITOLAK</strong> oleh admin kami.
              </p>
              
              <table width="100%" cellpadding="12" cellspacing="0" style="background-color: #fef2f2; border-radius: 8px; margin: 20px 0; border: 2px solid #ef4444;">
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #fecaca; padding: 12px;">
                    <strong>ID Pelanggan:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #fecaca; padding: 12px; font-family: monospace;">
                    {{customerId}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #fecaca; padding: 12px;">
                    <strong>Username:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #fecaca; padding: 12px; font-family: monospace;">
                    {{customerUsername}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #fecaca; padding: 12px;">
                    <strong>No. Invoice:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #fecaca; padding: 12px; font-family: monospace;">
                    {{invoiceNumber}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; padding: 12px;">
                    <strong>Jumlah:</strong>
                  </td>
                  <td style="color: #ef4444; font-size: 18px; font-weight: bold; padding: 12px;">
                    {{amount}}
                  </td>
                </tr>
              </table>
              
              <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #991b1b; margin: 0 0 10px 0; font-size: 14px; font-weight: bold;">
                  💬 Alasan Penolakan:
                </p>
                <p style="color: #7f1d1d; margin: 0; font-size: 14px; line-height: 1.6;">
                  {{rejectionReason}}
                </p>
              </div>
              
              <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #92400e; margin: 0; font-size: 14px; line-height: 1.6;">
                  ⚠️ Silakan hubungi admin kami untuk informasi lebih lanjut atau upload ulang bukti transfer yang valid.
                </p>
              </div>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px;">
                <tr>
                  <td align="center">
                    <a href="{{paymentLink}}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-size: 16px; font-weight: bold;">
                      Upload Ulang Bukti Transfer
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0; text-align: center;">
                Hubungi: <strong>{{companyPhone}}</strong>
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="color: #666666; font-size: 12px; margin: 0 0 10px 0;">
                {{companyName}}<br>
                {{companyPhone}} | {{companyEmail}}
              </p>
              <p style="color: #999999; font-size: 11px; margin: 0;">
                Email otomatis, mohon tidak membalas email ini.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    isActive: true,
  },
  
  // =============================================
  // 14 NEW TEMPLATES TO MATCH WHATSAPP
  // =============================================
  
  // 1. General Broadcast
  {
    type: 'general-broadcast',
    name: 'Broadcast Umum ke Pelanggan',
    subject: '📢 Pengumuman - {{companyName}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Pengumuman</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;">📢 Pengumuman</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Halo <strong>{{customerName}}</strong>,
          </p>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            {{message}}
          </p>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:20px 0 0 0;">
            Jika ada pertanyaan, hubungi kami di <strong>{{companyPhone}}</strong>
          </p>
        </td></tr>
        <tr><td style="background-color:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #e9ecef;">
          <p style="color:#666666;font-size:14px;margin:0 0 10px 0;"><strong>{{companyName}}</strong></p>
          <p style="color:#999999;font-size:12px;margin:0;">Email ini dikirim secara otomatis</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    isActive: true,
  },

  // 2. Promo Offer
  {
    type: 'promo-offer',
    name: 'Promo & Penawaran Khusus',
    subject: '🎁 Promo Spesial - {{companyName}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Promo Spesial</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;">🎁 Promo Spesial!</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Halo <strong>{{customerName}}</strong>,
          </p>
          <div style="background-color:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;border-radius:4px;">
            <p style="color:#856404;margin:0;font-size:16px;font-weight:bold;">{{promoTitle}}</p>
          </div>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            {{promoDescription}}
          </p>
          <p style="color:#666666;font-size:14px;line-height:1.6;margin:20px 0;">
            Jangan lewatkan kesempatan ini! Hubungi kami segera di <strong>{{companyPhone}}</strong>
          </p>
        </td></tr>
        <tr><td style="background-color:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #e9ecef;">
          <p style="color:#666666;font-size:14px;margin:0 0 10px 0;"><strong>{{companyName}}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    isActive: true,
  },

  // 3. Welcome Message
  {
    type: 'welcome-message',
    name: 'Selamat Datang Pelanggan Baru',
    subject: '🎉 Selamat Datang di {{companyName}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Selamat Datang</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#11998e 0%,#38ef7d 100%);padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;">🎉 Selamat Datang!</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Halo <strong>{{customerName}}</strong>,
          </p>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Selamat bergabung dengan <strong>{{companyName}}</strong>! Kami senang Anda menjadi bagian dari keluarga kami.
          </p>
          <div style="background-color:#e8f5e9;border-left:4px solid #4caf50;padding:15px;margin:20px 0;border-radius:4px;">
            <p style="color:#2e7d32;margin:0;font-size:14px;">
              Nikmati layanan internet berkualitas dari kami. Tim support kami siap membantu Anda 24/7.
            </p>
          </div>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:20px 0 0 0;">
            Hubungi kami: <strong>{{companyPhone}}</strong>
          </p>
        </td></tr>
        <tr><td style="background-color:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #e9ecef;">
          <p style="color:#666666;font-size:14px;margin:0 0 10px 0;"><strong>{{companyName}}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    isActive: true,
  },

  // 4. Thank You
  {
    type: 'thank-you',
    name: 'Ucapan Terima Kasih',
    subject: '🙏 Terima Kasih - {{companyName}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Terima Kasih</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;">🙏 Terima Kasih</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Halo <strong>{{customerName}}</strong>,
          </p>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Terima kasih telah menggunakan layanan <strong>{{companyName}}</strong>. Kepuasan Anda adalah prioritas kami.
          </p>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:20px 0 0 0;">
            Salam hangat,<br><strong>{{companyName}}</strong>
          </p>
        </td></tr>
        <tr><td style="background-color:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #e9ecef;">
          <p style="color:#666666;font-size:14px;margin:0 0 10px 0;"><strong>{{companyName}}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    isActive: true,
  },

  // 5. Account Info
  {
    type: 'account-info',
    name: 'Informasi Akun Pelanggan',
    subject: '📋 Informasi Akun - {{companyName}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Informasi Akun</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#4facfe 0%,#00f2fe 100%);padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;">📋 Informasi Akun</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Halo <strong>{{customerName}}</strong>,
          </p>
          <table width="100%" cellpadding="12" cellspacing="0" style="background-color:#f8f9fa;border-radius:8px;margin:20px 0;">
            <tr>
              <td style="color:#666666;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;"><strong>Username:</strong></td>
              <td style="color:#333333;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;">{{username}}</td>
            </tr>
            <tr>
              <td style="color:#666666;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;"><strong>Paket:</strong></td>
              <td style="color:#333333;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;">{{profileName}}</td>
            </tr>
            <tr>
              <td style="color:#666666;font-size:14px;padding:12px;"><strong>Masa Aktif:</strong></td>
              <td style="color:#333333;font-size:14px;padding:12px;">{{expiredAt}}</td>
            </tr>
          </table>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:20px 0 0 0;">
            Hubungi: <strong>{{companyPhone}}</strong>
          </p>
        </td></tr>
        <tr><td style="background-color:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #e9ecef;">
          <p style="color:#666666;font-size:14px;margin:0 0 10px 0;"><strong>{{companyName}}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    isActive: true,
  },

  // 6. Payment Reminder General
  {
    type: 'payment-reminder-general',
    name: 'Pengingat Pembayaran Umum',
    subject: '📅 Pengingat Pembayaran - {{companyName}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Pengingat Pembayaran</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#ffa751 0%,#ffe259 100%);padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;">📅 Pengingat Pembayaran</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Halo <strong>{{customerName}}</strong>,
          </p>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Ini adalah pengingat untuk segera melakukan pembayaran tagihan Anda.
          </p>
          <div style="background-color:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;border-radius:4px;">
            <p style="color:#856404;margin:0;font-size:14px;">
              Jangan sampai layanan Anda terganggu. Lakukan pembayaran sebelum jatuh tempo.
            </p>
          </div>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:20px 0 0 0;">
            Hubungi: <strong>{{companyPhone}}</strong>
          </p>
        </td></tr>
        <tr><td style="background-color:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #e9ecef;">
          <p style="color:#666666;font-size:14px;margin:0 0 10px 0;"><strong>{{companyName}}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    isActive: true,
  },

  // 7. Payment Warning
  {
    type: 'payment-warning',
    name: 'Peringatan Pembayaran Tertunda',
    subject: '⚠️ Peringatan Pembayaran - {{companyName}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Peringatan Pembayaran</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#fa709a 0%,#fee140 100%);padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;">⚠️ Peringatan Pembayaran</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Halo <strong>{{customerName}}</strong>,
          </p>
          <div style="background-color:#f8d7da;border-left:4px solid #dc3545;padding:15px;margin:20px 0;border-radius:4px;">
            <p style="color:#721c24;margin:0;font-size:14px;font-weight:bold;">
              PERINGATAN: Pembayaran Anda sudah melewati jatuh tempo.
            </p>
          </div>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Segera lakukan pembayaran untuk menghindari pemutusan layanan.
          </p>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:20px 0 0 0;">
            Hubungi: <strong>{{companyPhone}}</strong>
          </p>
        </td></tr>
        <tr><td style="background-color:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #e9ecef;">
          <p style="color:#666666;font-size:14px;margin:0 0 10px 0;"><strong>{{companyName}}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    isActive: true,
  },

  // 8. Manual Payment Admin
  {
    type: 'manual_payment_admin',
    name: 'Notifikasi Admin Manual Payment',
    subject: '🔔 Pembayaran Manual Baru - {{invoiceNumber}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Notifikasi Admin</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;">🔔 Pembayaran Manual Baru</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            <strong>Admin</strong>,
          </p>
          <table width="100%" cellpadding="12" cellspacing="0" style="background-color:#f8f9fa;border-radius:8px;margin:20px 0;">
            <tr>
              <td style="color:#666666;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;"><strong>Invoice:</strong></td>
              <td style="color:#333333;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;">{{invoiceNumber}}</td>
            </tr>
            <tr>
              <td style="color:#666666;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;"><strong>Pelanggan:</strong></td>
              <td style="color:#333333;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;">{{customerName}}</td>
            </tr>
            <tr>
              <td style="color:#666666;font-size:14px;padding:12px;"><strong>Jumlah:</strong></td>
              <td style="color:#333333;font-size:14px;padding:12px;">Rp {{amount}}</td>
            </tr>
          </table>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:20px 0 0 0;">
            Silakan verifikasi pembayaran ini.
          </p>
        </td></tr>
        <tr><td style="background-color:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #e9ecef;">
          <p style="color:#666666;font-size:14px;margin:0 0 10px 0;"><strong>{{companyName}}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    isActive: true,
  },

  // 9. Payment Receipt
  {
    type: 'payment_receipt',
    name: 'Bukti Pembayaran',
    subject: '✅ Bukti Pembayaran - {{invoiceNumber}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Bukti Pembayaran</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#11998e 0%,#38ef7d 100%);padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;">✅ Bukti Pembayaran</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Halo <strong>{{customerName}}</strong>,
          </p>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Pembayaran Anda telah dikonfirmasi.
          </p>
          <table width="100%" cellpadding="12" cellspacing="0" style="background-color:#f8f9fa;border-radius:8px;margin:20px 0;">
            <tr>
              <td style="color:#666666;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;"><strong>No. Invoice:</strong></td>
              <td style="color:#333333;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;">{{invoiceNumber}}</td>
            </tr>
            <tr>
              <td style="color:#666666;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;"><strong>Jumlah:</strong></td>
              <td style="color:#333333;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;">Rp {{amount}}</td>
            </tr>
            <tr>
              <td style="color:#666666;font-size:14px;padding:12px;"><strong>Tanggal:</strong></td>
              <td style="color:#333333;font-size:14px;padding:12px;">{{paymentDate}}</td>
            </tr>
          </table>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:20px 0 0 0;">
            Terima kasih atas pembayaran Anda.
          </p>
        </td></tr>
        <tr><td style="background-color:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #e9ecef;">
          <p style="color:#666666;font-size:14px;margin:0 0 10px 0;"><strong>{{companyName}}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    isActive: true,
  },

  // 10. Payment Confirmed
  {
    type: 'payment-confirmed',
    name: 'Konfirmasi Pembayaran Diterima',
    subject: '✅ Pembayaran Dikonfirmasi - {{invoiceNumber}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Konfirmasi Pembayaran</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#11998e 0%,#38ef7d 100%);padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;">✅ Pembayaran Diterima</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Halo <strong>{{customerName}}</strong>,
          </p>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Pembayaran Anda untuk invoice <strong>{{invoiceNumber}}</strong> telah kami terima dan konfirmasi.
          </p>
          <div style="background-color:#e8f5e9;border-left:4px solid #4caf50;padding:15px;margin:20px 0;border-radius:4px;">
            <p style="color:#2e7d32;margin:0;font-size:14px;">
              Layanan Anda sekarang aktif. Terima kasih atas pembayaran tepat waktu!
            </p>
          </div>
        </td></tr>
        <tr><td style="background-color:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #e9ecef;">
          <p style="color:#666666;font-size:14px;margin:0 0 10px 0;"><strong>{{companyName}}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    isActive: true,
  },

  // 11. Voucher Purchase Success
  {
    type: 'voucher-purchase-success',
    name: 'Pembelian Voucher Berhasil',
    subject: '🎫 Voucher Internet Anda - {{orderNumber}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Voucher Anda</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;">🎫 Voucher Internet Anda</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Halo <strong>{{customerName}}</strong>,
          </p>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Terima kasih telah membeli voucher internet!
          </p>
          <table width="100%" cellpadding="12" cellspacing="0" style="background-color:#f8f9fa;border-radius:8px;margin:20px 0;">
            <tr>
              <td style="color:#666666;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;"><strong>Paket:</strong></td>
              <td style="color:#333333;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;">{{profileName}}</td>
            </tr>
            <tr>
              <td style="color:#666666;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;"><strong>Jumlah:</strong></td>
              <td style="color:#333333;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;">{{quantity}} voucher</td>
            </tr>
            <tr>
              <td style="color:#666666;font-size:14px;padding:12px;"><strong>Masa Berlaku:</strong></td>
              <td style="color:#333333;font-size:14px;padding:12px;">{{validity}}</td>
            </tr>
          </table>
          <div style="background-color:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;border-radius:4px;">
            <p style="color:#856404;margin:0;font-size:14px;font-weight:bold;">
              Kode Voucher:<br>{{voucherCodes}}
            </p>
          </div>
        </td></tr>
        <tr><td style="background-color:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #e9ecef;">
          <p style="color:#666666;font-size:14px;margin:0 0 10px 0;"><strong>{{companyName}}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    isActive: true,
  },

  // 12. Maintenance Info
  {
    type: 'maintenance-info',
    name: 'Pemberitahuan Maintenance',
    subject: '🔧 Pemberitahuan Maintenance - {{companyName}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Pemberitahuan Maintenance</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#4facfe 0%,#00f2fe 100%);padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;">🔧 Pemberitahuan Maintenance</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Halo <strong>{{customerName}}</strong>,
          </p>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Kami akan melakukan maintenance pada jaringan kami.
          </p>
          <table width="100%" cellpadding="12" cellspacing="0" style="background-color:#f8f9fa;border-radius:8px;margin:20px 0;">
            <tr>
              <td style="color:#666666;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;"><strong>Waktu:</strong></td>
              <td style="color:#333333;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;">{{maintenanceTime}}</td>
            </tr>
            <tr>
              <td style="color:#666666;font-size:14px;padding:12px;"><strong>Estimasi:</strong></td>
              <td style="color:#333333;font-size:14px;padding:12px;">{{estimatedDuration}}</td>
            </tr>
          </table>
          <div style="background-color:#d1ecf1;border-left:4px solid #17a2b8;padding:15px;margin:20px 0;border-radius:4px;">
            <p style="color:#0c5460;margin:0;font-size:14px;">
              Mohon maaf atas ketidaknyamanannya. Maintenance ini untuk meningkatkan kualitas layanan.
            </p>
          </div>
        </td></tr>
        <tr><td style="background-color:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #e9ecef;">
          <p style="color:#666666;font-size:14px;margin:0 0 10px 0;"><strong>{{companyName}}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    isActive: true,
  },

  // 13. Outage Notification
  {
    type: 'outage_notification',
    name: 'Notifikasi Gangguan',
    subject: '⚠️ Pemberitahuan Gangguan Jaringan - {{companyName}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Pemberitahuan Gangguan</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#fa709a 0%,#fee140 100%);padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;">⚠️ Pemberitahuan Gangguan</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Yth. <strong>{{customerName}}</strong>,
          </p>
          <div style="background-color:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;border-radius:4px;">
            <p style="color:#856404;margin:0;font-size:14px;font-weight:bold;">
              Saat ini terdapat gangguan pada jaringan di area Anda.
            </p>
          </div>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Tim teknis kami sedang bekerja untuk mengatasi masalah ini. Kami mohon maaf atas ketidaknyamanannya.
          </p>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:20px 0 0 0;">
            Hubungi: <strong>{{companyPhone}}</strong>
          </p>
        </td></tr>
        <tr><td style="background-color:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #e9ecef;">
          <p style="color:#666666;font-size:14px;margin:0 0 10px 0;"><strong>{{companyName}}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    isActive: true,
  },

  // 14. Upgrade Notification
  {
    type: 'upgrade-notification',
    name: 'Pemberitahuan Upgrade Paket',
    subject: '⬆️ Upgrade Paket Internet - {{companyName}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Upgrade Paket</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#11998e 0%,#38ef7d 100%);padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:28px;">⬆️ Upgrade Paket Internet</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Halo <strong>{{customerName}}</strong>,
          </p>
          <p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 20px 0;">
            Paket internet Anda telah berhasil di-upgrade!
          </p>
          <table width="100%" cellpadding="12" cellspacing="0" style="background-color:#f8f9fa;border-radius:8px;margin:20px 0;">
            <tr>
              <td style="color:#666666;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;"><strong>Paket Baru:</strong></td>
              <td style="color:#333333;font-size:14px;border-bottom:1px solid #e9ecef;padding:12px;">{{newProfileName}}</td>
            </tr>
            <tr>
              <td style="color:#666666;font-size:14px;padding:12px;"><strong>Kecepatan:</strong></td>
              <td style="color:#333333;font-size:14px;padding:12px;">{{speed}}</td>
            </tr>
          </table>
          <div style="background-color:#e8f5e9;border-left:4px solid #4caf50;padding:15px;margin:20px 0;border-radius:4px;">
            <p style="color:#2e7d32;margin:0;font-size:14px;">
              Nikmati internet lebih cepat dan lebih stabil!
            </p>
          </div>
        </td></tr>
        <tr><td style="background-color:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #e9ecef;">
          <p style="color:#666666;font-size:14px;margin:0 0 10px 0;"><strong>{{companyName}}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    isActive: true,
  },
  {
    type: 'payment-confirmation',
    name: 'Konfirmasi Pembayaran Invoice',
    subject: '✅ Pembayaran Dikonfirmasi - Invoice {{invoiceNumber}}',
    htmlBody: `<!DOCTYPE html>
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
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">✅ Pembayaran Berhasil</h1>
              <p style="color: #d1fae5; margin: 8px 0 0 0; font-size: 15px;">Terima kasih atas pembayaran Anda</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Halo <strong>{{customerName}}</strong>,
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Pembayaran Anda telah dikonfirmasi. Akun internet Anda sekarang aktif dan siap digunakan.
              </p>
              <table width="100%" cellpadding="12" cellspacing="0" style="background-color: #f0fdf4; border-radius: 8px; margin: 20px 0; border: 2px solid #10b981;">
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #d1fae5; padding: 12px;">
                    <strong>No. Invoice:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #d1fae5; padding: 12px; font-family: monospace;">
                    {{invoiceNumber}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #d1fae5; padding: 12px;">
                    <strong>Jumlah Dibayar:</strong>
                  </td>
                  <td style="color: #10b981; font-size: 18px; font-weight: bold; border-bottom: 1px solid #d1fae5; padding: 12px;">
                    {{amount}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #d1fae5; padding: 12px;">
                    <strong>Username:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #d1fae5; padding: 12px; font-family: monospace;">
                    {{customerUsername}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #d1fae5; padding: 12px;">
                    <strong>Metode Pembayaran:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #d1fae5; padding: 12px;">
                    {{paymentMethod}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; padding: 12px;">
                    <strong>Aktif Hingga:</strong>
                  </td>
                  <td style="color: #059669; font-size: 14px; font-weight: bold; padding: 12px;">
                    {{newExpiredAt}}
                  </td>
                </tr>
              </table>
              <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #065f46; margin: 0; font-size: 14px; line-height: 1.6;">
                  🌐 <strong>Akun Anda sudah aktif.</strong> Nikmati layanan internet berkualitas dari kami!
                </p>
              </div>
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
                Jika ada pertanyaan, silakan hubungi kami di <strong>{{companyPhone}}</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="color: #666666; font-size: 14px; margin: 0 0 5px 0;"><strong>{{companyName}}</strong></p>
              <p style="color: #999999; font-size: 12px; margin: 0;">Email ini dikirim secara otomatis oleh sistem</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    isActive: true,
  },
];

export async function seedEmailTemplates(force = false) {
  console.log(`🌱 Seeding email templates (always updates subject and htmlBody)...`);
  
  for (const template of emailTemplates) {
    await prisma.emailTemplate.upsert({
      where: { type: template.type },
      create: {
        id: `template-${template.type}`,
        ...template,
      },
      update: { name: template.name, subject: template.subject, htmlBody: template.htmlBody, isActive: template.isActive },
    });
    console.log(`   ✅ Template: ${template.name}`);
  }
}

// Run if executed directly
if (require.main === module) {
  const force = process.argv.includes('--force');
  seedEmailTemplates(force)
    .then(() => {
      console.log('✅ Email templates seeded successfully!');
      prisma.$disconnect();
    })
    .catch((error) => {
      console.error('❌ Error seeding email templates:', error);
      prisma.$disconnect();
      process.exit(1);
    });
}
