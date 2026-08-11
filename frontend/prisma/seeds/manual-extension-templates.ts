import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const whatsappTemplate = {
  id: 'manual-extension',
  name: 'Perpanjangan Manual',
  type: 'manual-extension',
  message: `Halo {{customerName}},

✅ *Langganan Anda Telah Diperpanjang*

Langganan Anda telah diperpanjang oleh admin kami dengan detail sebagai berikut:

👤 *Username:* {{customerUsername}}
📦 *Paket:* {{profileName}}
📍 *Area:* {{area}}
💰 *Nominal:* Rp {{amount}}
📅 *Berlaku Hingga:* {{newExpiredAt}}
📄 *No. Invoice:* {{invoiceNumber}}

{{#profileChanged}}
🔄 Paket langganan Anda telah diubah.
{{/profileChanged}}

Terima kasih atas kepercayaan Anda!

_{{companyName}}_
📞 {{companyPhone}}`,
  isActive: true,
};

const emailTemplate = {
  id: 'manual-extension',
  name: 'Perpanjangan Manual',
  type: 'manual-extension',
  subject: 'Langganan Anda Telah Diperpanjang - {{companyName}}',
  htmlBody: `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Perpanjangan Langganan</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#fff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
                    <!-- Header -->
                    <tr>
                        <td style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:30px;text-align:center">
                            <h1 style="color:#fff;margin:0;font-size:28px">✅ Langganan Diperpanjang</h1>
                            <p style="color:#fff;margin:10px 0 0 0">{{companyName}}</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding:40px 30px">
                            <p style="color:#333;font-size:16px">Halo <strong>{{customerName}}</strong>,</p>
                            <p style="color:#333;font-size:16px">Langganan Anda telah diperpanjang oleh admin kami.</p>
                            
                            <!-- Details Box -->
                            <div style="background:#f0fdf4;border-radius:8px;padding:20px;margin:20px 0">
                                <div style="margin-bottom:12px">
                                    <div style="color:#666;font-size:12px">Username</div>
                                    <div style="color:#333;font-size:16px;font-weight:600;font-family:monospace">{{customerUsername}}</div>
                                </div>
                                <div style="margin-bottom:12px">
                                    <div style="color:#666;font-size:12px">Paket</div>
                                    <div style="color:#333;font-size:16px;font-weight:600">{{profileName}}</div>
                                </div>
                                <div style="margin-bottom:12px">
                                    <div style="color:#666;font-size:12px">Area</div>
                                    <div style="color:#333;font-size:16px;font-weight:600">{{area}}</div>
                                </div>
                                <div style="margin-bottom:12px">
                                    <div style="color:#666;font-size:12px">Nominal</div>
                                    <div style="color:#10b981;font-size:20px;font-weight:700">Rp {{amount}}</div>
                                </div>
                                <div style="margin-bottom:12px">
                                    <div style="color:#666;font-size:12px">Berlaku Hingga</div>
                                    <div style="color:#333;font-size:16px;font-weight:600">{{newExpiredAt}}</div>
                                </div>
                                <div>
                                    <div style="color:#666;font-size:12px">No. Invoice</div>
                                    <div style="color:#333;font-size:14px;font-family:monospace;background-color:rgba(16,185,129,0.1);padding:6px 10px;border-radius:4px;display:inline-block">{{invoiceNumber}}</div>
                                </div>
                            </div>
                            
                            {{#profileChanged}}
                            <div style="background-color:#fef3c7;border-left:4px solid #f59e0b;padding:15px;margin:0 0 20px 0;border-radius:4px">
                                <p style="color:#92400e;margin:0;font-size:14px;font-weight:600">🔄 Paket langganan Anda telah diubah</p>
                            </div>
                            {{/profileChanged}}
                            
                            <p style="color:#333;font-size:16px">Terima kasih atas kepercayaan Anda!</p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #e9ecef">
                            <p style="color:#666;font-size:14px;margin:0 0 5px 0"><strong>{{companyName}}</strong></p>
                            <p style="color:#999;font-size:12px;margin:0">📞 {{companyPhone}}</p>
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

export async function seedManualExtensionTemplates() {
  console.log('🌱 Seeding Manual Extension templates...');
  
  // WhatsApp template
  await prisma.whatsapp_templates.upsert({
    where: { type: whatsappTemplate.type },
    create: whatsappTemplate,
    update: {
      name: whatsappTemplate.name,
      message: whatsappTemplate.message,
      isActive: whatsappTemplate.isActive,
    },
  });
  console.log('   ✅ WhatsApp: Perpanjangan Manual');
  
  // Email template
  await prisma.emailTemplate.upsert({
    where: { type: emailTemplate.type },
    create: emailTemplate,
    update: {
      name: emailTemplate.name,
      subject: emailTemplate.subject,
      htmlBody: emailTemplate.htmlBody,
      isActive: emailTemplate.isActive,
    },
  });
  console.log('   ✅ Email: Perpanjangan Manual');
}

// Run if executed directly
if (require.main === module) {
  seedManualExtensionTemplates()
    .then(() => {
      console.log('✅ Manual extension templates seeded successfully!');
      prisma.$disconnect();
    })
    .catch((error) => {
      console.error('❌ Error seeding manual extension templates:', error);
      prisma.$disconnect();
      process.exit(1);
    });
}
