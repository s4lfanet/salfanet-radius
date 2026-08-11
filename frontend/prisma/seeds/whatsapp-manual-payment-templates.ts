import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const templates = [
  {
    id: 'wa-manual-payment-approval',
    name: 'Pembayaran Manual Disetujui',
    type: 'manual-payment-approval',
    message: `🎉 *Pembayaran Disetujui*

Halo *{{customerName}}*,

Pembayaran manual Anda telah *DISETUJUI* oleh admin kami.

📋 *Detail:*
• Invoice: {{invoiceNumber}}
• Jumlah: Rp {{amount}}
• Username: {{username}}
• Masa aktif hingga: {{expiredDate}}

✅ Akun Anda sekarang sudah aktif dan dapat digunakan.

Terima kasih telah melakukan pembayaran.

_{{companyName}}_`,
    isActive: true,
  },
  {
    id: 'wa-manual-payment-rejection',
    name: 'Pembayaran Manual Ditolak',
    type: 'manual-payment-rejection',
    message: `❌ *Pembayaran Ditolak*

Halo *{{customerName}}*,

Mohon maaf, pembayaran manual Anda *DITOLAK* oleh admin kami.

📋 *Detail:*
• Invoice: {{invoiceNumber}}
• Jumlah: Rp {{amount}}

💬 *Alasan:*
{{rejectionReason}}

Silakan hubungi admin kami untuk informasi lebih lanjut atau upload ulang bukti transfer yang valid.

🔗 Upload ulang: {{paymentLink}}

📞 Contact: {{companyPhone}}

_{{companyName}}_`,
    isActive: true,
  },
];

export async function seedWhatsAppTemplates() {
  console.log('🌱 Seeding WhatsApp manual payment templates...');
  
  for (const template of templates) {
    await prisma.whatsapp_templates.upsert({
      where: { type: template.type },
      create: template,
      update: {
        name: template.name,
        message: template.message,
        isActive: template.isActive,
      },
    });
    console.log(`   ✅ Template: ${template.name}`);
  }
}

// Run if executed directly
if (require.main === module) {
  seedWhatsAppTemplates()
    .then(() => {
      console.log('✅ WhatsApp templates seeded successfully!');
      prisma.$disconnect();
    })
    .catch((error) => {
      console.error('❌ Error seeding WhatsApp templates:', error);
      prisma.$disconnect();
      process.exit(1);
    });
}
