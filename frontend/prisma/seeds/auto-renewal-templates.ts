import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * WhatsApp Template for Auto-Renewal Success
 */
const whatsappTemplate = {
  id: 'wa-auto-renewal-success',
  name: 'Auto-Renewal Berhasil',
  type: 'auto-renewal-success',
  message: `✅ *Auto-Renewal Berhasil*

Halo *{{customerName}}*,

Paket internet Anda telah *diperpanjang otomatis* dari saldo akun.

📋 *Detail:*
• Username: {{username}}
• Paket: {{profileName}}
• Biaya: {{amount}}
• Saldo tersisa: {{newBalance}}
• Masa aktif hingga: {{expiredDate}}

✨ *Auto-renewal* akan terus berjalan selama saldo mencukupi.

💡 Tip: Isi saldo sebelum masa aktif habis agar layanan tidak terputus.

Terima kasih telah menggunakan layanan kami!

📞 Butuh bantuan? Hubungi: {{companyPhone}}

_{{companyName}}_`,
  isActive: true,
};

/**
 * Email Template for Auto-Renewal Success
 */
const emailTemplate = {
  type: 'auto-renewal-success',
  name: 'Auto-Renewal Berhasil',
  subject: '✅ Auto-Renewal Berhasil - {{customerName}}',
  htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Auto-Renewal Berhasil</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">✅ Auto-Renewal Berhasil</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Halo <strong>{{customerName}}</strong>,
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Paket internet Anda telah <strong>diperpanjang otomatis</strong> menggunakan saldo akun Anda.
              </p>
              
              <!-- Details Table -->
              <table width="100%" cellpadding="12" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 20px 0;">
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
                    <strong>Paket:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    {{profileName}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Biaya Perpanjangan:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    {{amount}}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    <strong>Saldo Tersisa:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; border-bottom: 1px solid #e9ecef; padding: 12px;">
                    {{newBalance}}
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
              
              <!-- Info Box -->
              <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #2e7d32; margin: 0; font-size: 14px;">
                  <strong>✨ Auto-Renewal Aktif:</strong> Paket Anda akan diperpanjang otomatis selama saldo mencukupi.
                </p>
              </div>
              
              <!-- Tips Box -->
              <div style="background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #e65100; margin: 0; font-size: 14px;">
                  <strong>💡 Tips:</strong> Pastikan saldo Anda selalu mencukupi sebelum masa aktif habis agar layanan tidak terputus.
                </p>
              </div>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0 0 0;">
                Terima kasih telah menggunakan layanan kami!
              </p>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 10px 0 0 0;">
                Jika ada pertanyaan, silakan hubungi kami di <strong>{{companyPhone}}</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="color: #666666; font-size: 14px; margin: 0 0 10px 0;">
                <strong>{{companyName}}</strong>
              </p>
              <p style="color: #999999; font-size: 12px; margin: 0;">
                Email ini dikirim secara otomatis oleh sistem auto-renewal
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
};

/**
 * Seed auto-renewal templates
 */
export async function seedAutoRenewalTemplates() {
  console.log('🌱 Seeding auto-renewal templates...');
  
  // Seed WhatsApp template
  await prisma.whatsapp_templates.upsert({
    where: { type: whatsappTemplate.type },
    create: whatsappTemplate,
    update: {
      name: whatsappTemplate.name,
      message: whatsappTemplate.message,
      isActive: whatsappTemplate.isActive,
    },
  });
  console.log('   ✅ WhatsApp template: Auto-Renewal Berhasil');
  
  // Seed Email template
  await prisma.emailTemplate.upsert({
    where: { type: emailTemplate.type },
    create: {
      id: `email-${emailTemplate.type}`,
      ...emailTemplate,
    },
    update: {
      name: emailTemplate.name,
      subject: emailTemplate.subject,
      htmlBody: emailTemplate.htmlBody,
      isActive: emailTemplate.isActive,
    },
  });
  console.log('   ✅ Email template: Auto-Renewal Berhasil');
  
  console.log('✅ Auto-renewal templates seeded successfully!');
}

// Run if executed directly
if (require.main === module) {
  seedAutoRenewalTemplates()
    .then(() => {
      console.log('✅ Done!');
      prisma.$disconnect();
    })
    .catch((error) => {
      console.error('❌ Error seeding templates:', error);
      prisma.$disconnect();
      process.exit(1);
    });
}
