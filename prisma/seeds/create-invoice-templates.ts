import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

export async function createInvoiceTemplates() {
  console.log('Creating invoice notification templates...');

  // 1. Create WhatsApp Template
  console.log('Creating WhatsApp template...');
  const whatsappTemplateId = randomUUID();
  
  await prisma.whatsapp_templates.upsert({
    where: { type: 'invoice-created' },
    update: {
      name: 'Notifikasi Invoice Baru',
      message: `Halo *{{customerName}}*,

Invoice perpanjanan layanan Anda telah dibuat:

📋 *No. Invoice:* {{invoiceNumber}}
� *Username:* {{username}}
📦 *Paket:* {{profileName}}
📍 *Area:* {{area}}
💰 *Total:* Rp {{amount}}
📅 *Jatuh Tempo:* {{dueDate}}

Silakan lakukan pembayaran melalui link berikut:
{{paymentLink}}

{{bankAccounts}}

Terima kasih,
*{{companyName}}*
📞 {{companyPhone}}`,
      isActive: true,
    },
    create: {
      id: whatsappTemplateId,
      name: 'Notifikasi Invoice Baru',
      type: 'invoice-created',
      message: `Halo *{{customerName}}*,

Invoice perpanjanan layanan Anda telah dibuat:

📋 *No. Invoice:* {{invoiceNumber}}
👤 *Username:* {{username}}
📦 *Paket:* {{profileName}}
📍 *Area:* {{area}}
💰 *Total:* Rp {{amount}}
📅 *Jatuh Tempo:* {{dueDate}}

Silakan lakukan pembayaran melalui link berikut:
{{paymentLink}}

{{bankAccounts}}

Terima kasih,
*{{companyName}}*
📞 {{companyPhone}}`,
      isActive: true,
    },
  });
  console.log('✅ WhatsApp template created');

  // 2. Create Email Template
  console.log('Creating Email template...');
  const emailTemplateId = randomUUID();

  await prisma.emailTemplate.upsert({
    where: { type: 'invoice-created' },
    update: {
      name: 'Notifikasi Invoice Baru',
      subject: '📋 Invoice Baru - {{invoiceNumber}} | {{companyName}}',
      htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice Baru</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">📋 Invoice Baru</h1>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Halo <strong>{{customerName}}</strong>,
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Invoice perpanjanan layanan internet Anda telah dibuat. Berikut detail invoice:
              </p>
              
              <table width="100%" cellpadding="12" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 20px 0;">
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>No. Invoice:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    {{invoiceNumber}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Nama Pelanggan:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    {{customerName}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Username:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    {{username}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Total Tagihan:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; font-weight: bold; border-bottom: 1px solid #e9ecef; padding: 12px;">
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
                <a href="{{paymentLink}}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 6px; font-weight: bold; font-size: 16px;">
                  💳 Bayar Sekarang
                </a>
              </div>
              
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
                ⚠️ <strong>Perhatian:</strong> Mohon lakukan pembayaran sebelum tanggal jatuh tempo untuk menghindari pemutusan layanan.
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px 30px; border-top: 1px solid #e9ecef;">
              <p style="color: #666666; font-size: 13px; line-height: 1.6; margin: 0;">
                <strong>{{companyName}}</strong><br>
                📧 {{companyEmail}}<br>
                📞 {{companyPhone}}<br>
                📍 {{companyAddress}}
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: #333333; padding: 15px 30px; text-align: center;">
              <p style="color: #ffffff; font-size: 12px; margin: 0;">
                Email otomatis, mohon tidak membalas email ini
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
    create: {
      id: emailTemplateId,
      type: 'invoice-created',
      name: 'Notifikasi Invoice Baru',
      subject: '📋 Invoice Baru - {{invoiceNumber}} | {{companyName}}',
      htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice Baru</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">📋 Invoice Baru</h1>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Halo <strong>{{customerName}}</strong>,
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Invoice perpanjanan layanan internet Anda telah dibuat. Berikut detail invoice:
              </p>
              
              <table width="100%" cellpadding="12" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 20px 0;">
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>No. Invoice:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    {{invoiceNumber}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Nama Pelanggan:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    {{customerName}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Username:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    {{username}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Total Tagihan:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; font-weight: bold; border-bottom: 1px solid #e9ecef; padding: 12px;">
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
                <a href="{{paymentLink}}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 6px; font-weight: bold; font-size: 16px;">
                  💳 Bayar Sekarang
                </a>
              </div>
              
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
                ⚠️ <strong>Perhatian:</strong> Mohon lakukan pembayaran sebelum tanggal jatuh tempo untuk menghindari pemutusan layanan.
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px 30px; border-top: 1px solid #e9ecef;">
              <p style="color: #666666; font-size: 13px; line-height: 1.6; margin: 0;">
                <strong>{{companyName}}</strong><br>
                📧 {{companyEmail}}<br>
                📞 {{companyPhone}}<br>
                📍 {{companyAddress}}
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: #333333; padding: 15px 30px; text-align: center;">
              <p style="color: #ffffff; font-size: 12px; margin: 0;">
                Email otomatis, mohon tidak membalas email ini
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
  });
  console.log('✅ Email template created (invoice-created)');

  // 3. Create invoice-reminder email template (used by the cron reminder job)
  console.log('Creating invoice-reminder email template...');
  await prisma.emailTemplate.upsert({
    where: { type: 'invoice-reminder' },
    update: {
      name: 'Pengingat Invoice Tagihan',
      subject: '⏰ Pengingat Pembayaran - Invoice {{invoiceNumber}} | {{companyName}}',
      htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pengingat Pembayaran</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">⏰ Pengingat Pembayaran</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Halo <strong>{{customerName}}</strong>,
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Ini adalah pengingat untuk invoice Anda yang akan segera jatuh tempo.
              </p>
              <table width="100%" cellpadding="12" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 20px 0;">
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;"><strong>No. Invoice:</strong></td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">{{invoiceNumber}}</td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;"><strong>Username:</strong></td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">{{username}}</td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;"><strong>Paket:</strong></td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">{{profileName}}</td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;"><strong>Area:</strong></td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">{{area}}</td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;"><strong>Total Tagihan:</strong></td>
                  <td style="color: #e67e22; font-size: 16px; font-weight: bold; border-bottom: 1px solid #e9ecef; padding: 12px;">{{amount}}</td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;"><strong>Jatuh Tempo:</strong></td>
                  <td style="color: #e74c3c; font-size: 14px; font-weight: bold; border-bottom: 1px solid #e9ecef; padding: 12px;">{{dueDate}}</td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; padding: 12px;"><strong>Sisa Waktu:</strong></td>
                  <td style="color: #333333; font-size: 14px; padding: 12px;">{{daysRemaining}} hari</td>
                </tr>
              </table>
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{paymentLink}}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 6px; font-weight: bold; font-size: 16px;">
                  💳 Bayar Sekarang
                </a>
              </div>
              {{bankAccounts}}
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
                ⚠️ <strong>Perhatian:</strong> Mohon lakukan pembayaran sebelum tanggal jatuh tempo untuk menghindari pemutusan layanan.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px 30px; border-top: 1px solid #e9ecef;">
              <p style="color: #666666; font-size: 13px; line-height: 1.6; margin: 0;">
                <strong>{{companyName}}</strong><br>
                📞 {{companyPhone}}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #333333; padding: 15px 30px; text-align: center;">
              <p style="color: #ffffff; font-size: 12px; margin: 0;">Email otomatis, mohon tidak membalas email ini</p>
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
    create: {
      id: randomUUID(),
      type: 'invoice-reminder',
      name: 'Pengingat Invoice Tagihan',
      subject: '⏰ Pengingat Pembayaran - Invoice {{invoiceNumber}} | {{companyName}}',
      htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pengingat Pembayaran</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">⏰ Pengingat Pembayaran</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Halo <strong>{{customerName}}</strong>,
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Ini adalah pengingat untuk invoice Anda yang akan segera jatuh tempo.
              </p>
              <table width="100%" cellpadding="12" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 20px 0;">
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;"><strong>No. Invoice:</strong></td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">{{invoiceNumber}}</td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;"><strong>Username:</strong></td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">{{username}}</td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;"><strong>Paket:</strong></td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">{{profileName}}</td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;"><strong>Area:</strong></td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">{{area}}</td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;"><strong>Total Tagihan:</strong></td>
                  <td style="color: #e67e22; font-size: 16px; font-weight: bold; border-bottom: 1px solid #e9ecef; padding: 12px;">{{amount}}</td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;"><strong>Jatuh Tempo:</strong></td>
                  <td style="color: #e74c3c; font-size: 14px; font-weight: bold; border-bottom: 1px solid #e9ecef; padding: 12px;">{{dueDate}}</td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; padding: 12px;"><strong>Sisa Waktu:</strong></td>
                  <td style="color: #333333; font-size: 14px; padding: 12px;">{{daysRemaining}} hari</td>
                </tr>
              </table>
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{paymentLink}}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 6px; font-weight: bold; font-size: 16px;">
                  💳 Bayar Sekarang
                </a>
              </div>
              {{bankAccounts}}
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
                ⚠️ <strong>Perhatian:</strong> Mohon lakukan pembayaran sebelum tanggal jatuh tempo untuk menghindari pemutusan layanan.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px 30px; border-top: 1px solid #e9ecef;">
              <p style="color: #666666; font-size: 13px; line-height: 1.6; margin: 0;">
                <strong>{{companyName}}</strong><br>
                📞 {{companyPhone}}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #333333; padding: 15px 30px; text-align: center;">
              <p style="color: #ffffff; font-size: 12px; margin: 0;">Email otomatis, mohon tidak membalas email ini</p>
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
  });
  console.log('✅ Email template created (invoice-reminder)');

  console.log('✅ All invoice templates created successfully!');
}

// Run if called directly
if (require.main === module) {
  createInvoiceTemplates()
    .catch((error) => {
      console.error('Error creating templates:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
