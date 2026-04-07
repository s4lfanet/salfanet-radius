import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Complete WhatsApp Templates for all flows
 * Total: 30 templates
 */
export const whatsappTemplates = [
  // =============================================
  // REGISTRATION & ONBOARDING (2)
  // =============================================
  {
    id: 'wa-registration-confirmation',
    type: 'registration-confirmation',
    name: 'Konfirmasi Pendaftaran',
    message: `✅ *Konfirmasi Pendaftaran*

Halo *{{customerName}}*,

Terima kasih telah mendaftar! Kami telah menerima pendaftaran Anda dengan detail berikut:

📋 *Detail Pendaftaran:*
• Nama: {{customerName}}
• Telepon: {{phone}}
• Paket: {{profileName}}
• Alamat: {{address}}

📌 *Status:* Pendaftaran Anda sedang diproses oleh tim kami.

Anda akan menerima notifikasi lebih lanjut setelah pendaftaran disetujui.

Jika ada pertanyaan, silakan hubungi kami di *{{companyPhone}}*

_{{companyName}}_`,
    isActive: true,
  },
  {
    id: 'wa-registration-approval',
    type: 'registration-approval',
    name: 'Persetujuan Pendaftaran',
    message: `🎉 Halo {{customerName}},

Selamat! Pendaftaran Anda telah *DISETUJUI*!

━━━━━━━━━━━━━━━━━━━━━━
*📱 INFORMASI AKUN ANDA*
━━━━━━━━━━━━━━━━━━━━━━
👤 Username: {{username}}
🔐 Password: {{password}}
📦 Paket: {{profileName}}
💳 Tipe: {{subscriptionType}}

━━━━━━━━━━━━━━━━━━━━━━
*💰 INVOICE INSTALASI*
━━━━━━━━━━━━━━━━━━━━━━
🧾 No. Invoice: {{invoiceNumber}}
💵 Biaya Instalasi: {{installationFee}}
📅 Jatuh Tempo: {{dueDate}}

🔗 *Link Pembayaran:*
{{paymentLink}}

{{bankAccounts}}

Segera lakukan pembayaran untuk aktivasi layanan Anda.

Terima kasih! 🙏
_{{companyName}}_`,
    isActive: true,
  },

  // =============================================
  // INVOICE & PAYMENT (7)
  // =============================================
  {
    id: 'wa-installation-invoice',
    type: 'installation-invoice',
    name: 'Invoice Instalasi',
    message: `🧾 *Invoice Instalasi*

Halo {{customerName}},

━━━━━━━━━━━━━━━━━━━━━━
*📋 DETAIL INVOICE*
━━━━━━━━━━━━━━━━━━━━━━
📌 No. Invoice: {{invoiceNumber}}
👤 Nama: {{customerName}}
📦 Paket: {{profileName}}

💰 Total Tagihan: {{amount}}
📅 Jatuh Tempo: {{dueDate}}

🔗 *Bayar Sekarang:*
{{paymentLink}}

{{bankAccounts}}

Terima kasih! 🙏

{{companyName}}
☎️ {{companyPhone}}`,
    isActive: true,
  },
  {
    id: 'wa-admin-create-user',
    type: 'admin-create-user',
    name: 'Admin Create User',
    message: `🎉 Halo {{customerName}},

Akun internet Anda telah dibuat oleh admin!

━━━━━━━━━━━━━━━━━━━━━━
*🔐 INFO LOGIN*
━━━━━━━━━━━━━━━━━━━━━━
👤 Username: {{username}}
🔑 Password: {{password}}
📦 Paket: {{profileName}}
📅 Aktif hingga: {{expiredDate}}

Silakan gunakan kredensial di atas untuk login ke jaringan kami.

Selamat menikmati layanan internet dari kami! 🌐

{{companyName}}
☎️ {{companyPhone}}`,
    isActive: true,
  },
  {
    id: 'wa-invoice-reminder',
    type: 'invoice-reminder',
    name: 'Pengingat Invoice',
    message: `⏰ *Pengingat Pembayaran*

Halo {{customerName}},

Ini adalah pengingat untuk invoice Anda yang akan segera jatuh tempo.

━━━━━━━━━━━━━━━━━━━━━━
*📋 Detail Invoice*
━━━━━━━━━━━━━━━━━━━━━━
🧾 No. Invoice: {{invoiceNumber}}
� Username: {{username}}
📦 Paket: {{profileName}}
📍 Area: {{area}}
💰 Jumlah: {{amount}}
📅 Jatuh Tempo: {{dueDate}}
⏱️ Sisa Waktu: {{daysRemaining}} hari

🔗 *Bayar Sekarang:*
{{paymentLink}}

{{bankAccounts}}

Jangan sampai layanan Anda terganggu! Segera lakukan pembayaran.

{{companyName}}
☎️ {{companyPhone}}`,
    isActive: true,
  },
  {
    id: 'wa-payment-success',
    type: 'payment-success',
    name: 'Pembayaran Berhasil',
    message: `✅ *PEMBAYARAN BERHASIL*

Halo {{customerName}},

Terima kasih! Pembayaran Anda telah berhasil dikonfirmasi.

━━━━━━━━━━━━━━━━━━━━━━
📋 *Detail Pembayaran*
━━━━━━━━━━━━━━━━━━━━━━
📌 Invoice: {{invoiceNumber}}
💰 Jumlah: {{amount}}
👤 Username: {{username}}
📅 Aktif hingga: {{expiredDate}}

🎉 Akun Anda sekarang aktif. Terima kasih!

{{companyName}}
☎️ {{companyPhone}}`,
    isActive: true,
  },
  {
    id: 'wa-payment_receipt',
    type: 'payment_receipt',
    name: 'Bukti Pembayaran',
    message: `✅ *PEMBAYARAN DIKONFIRMASI*

Halo {{customerName}},

Terima kasih! Pembayaran Anda telah kami konfirmasi.

━━━━━━━━━━━━━━━━━━━━━━
📋 *Detail*
━━━━━━━━━━━━━━━━━━━━━━
📌 Invoice: {{invoiceNumber}}
💰 Jumlah: {{amount}}
✅ Status: LUNAS
📅 Aktif hingga: {{expiredDate}}

Layanan Anda telah diperpanjang.

Terima kasih telah menjadi pelanggan setia kami! 🙏

{{companyName}}
☎️ {{companyPhone}}`,
    isActive: true,
  },
  {
    id: 'wa-manual-payment-approval',
    type: 'manual-payment-approval',
    name: 'Pembayaran Manual Disetujui',
    message: `🎉 *Pembayaran Disetujui*

Halo *{{customerName}}*,

Pembayaran manual Anda telah *DISETUJUI* oleh admin kami.

📋 *Detail:*
• Invoice: {{invoiceNumber}}
• Jumlah: {{amount}}
• Username: {{customerUsername}}
• Masa aktif hingga: {{expiredDate}}

✅ Akun Anda sekarang sudah aktif dan dapat digunakan.

Terima kasih telah melakukan pembayaran.

_{{companyName}}_`,
    isActive: true,
  },
  {
    id: 'wa-manual-payment-rejection',
    type: 'manual-payment-rejection',
    name: 'Pembayaran Manual Ditolak',
    message: `❌ *Pembayaran Ditolak*

Halo *{{customerName}}*,

Mohon maaf, pembayaran manual Anda *DITOLAK* oleh admin kami.

📋 *Detail:*
• Invoice: {{invoiceNumber}}
• Jumlah: {{amount}}

💬 *Alasan:*
{{rejectionReason}}

🔗 Upload ulang: {{paymentLink}}

{{bankAccounts}}

📞 Contact: {{companyPhone}}

_{{companyName}}_`,
    isActive: true,
  },

  // =============================================
  // VOUCHER (2)
  // =============================================
  {
    id: 'wa-voucher-purchase',
    type: 'voucher-purchase',
    name: 'Pembelian Voucher',
    message: `🎫 *Voucher Internet Anda*

Halo *{{customerName}}*,

Terima kasih telah membeli voucher internet! Berikut adalah detail voucher Anda:

━━━━━━━━━━━━━━━━━━
🎟️ *KODE VOUCHER:*
*{{voucherCodes}}*
━━━━━━━━━━━━━━━━━━

📋 *Detail Pembelian:*
━━━━━━━━━━━━━━━━━━
👤 Nama: *{{customerName}}*
📱 No. HP: *{{phone}}*
📦 Paket: *{{profileName}}*
⏱️ Durasi: *{{duration}}*
💰 Harga: *Rp {{price}}*
🔢 Jumlah: *{{quantity}}* voucher
💵 Total: *Rp {{totalAmount}}*
📅 Tanggal: *{{purchaseDate}}*
⏰ Berlaku s/d: *{{expiryDate}}*
━━━━━━━━━━━━━━━━━━

📝 *Cara Menggunakan:*
1. Hubungkan perangkat ke WiFi *{{companyName}}*
2. Buka browser, tunggu halaman login muncul
3. Masukkan kode voucher di atas
4. Klik "Login" dan mulai browsing! 🌐

⚠️ *PENTING:*
- Simpan kode voucher dengan baik
- Jangan bagikan ke orang lain
- Kode hanya bisa digunakan 1x
- Voucher tidak bisa dikembalikan

📞 Butuh bantuan? Hubungi: {{companyPhone}}

Terima kasih telah berlangganan!
_{{companyName}}_ 🙏

Selamat berselancar! 🚀`,
    isActive: true,
  },
  {
    id: 'wa-voucher-purchase-success',
    type: 'voucher-purchase-success',
    name: 'E-Voucher Purchase Success',
    message: `🎫 Halo {{customerName}},

Terima kasih telah membeli E-Voucher!

━━━━━━━━━━━━━━━━━━━━━━
*📋 DETAIL PESANAN*
━━━━━━━━━━━━━━━━━━━━━━
🔢 Nomor Order: {{orderNumber}}
📦 Paket: {{profileName}}
🎟️ Jumlah: {{quantity}} voucher
⏱️ Masa Berlaku: {{validity}}

━━━━━━━━━━━━━━━━━━━━━━
*🎟️ KODE VOUCHER ANDA*
━━━━━━━━━━━━━━━━━━━━━━
{{voucherCodes}}

📝 *Cara Pakai:*
1. Hubungkan ke WiFi kami
2. Buka browser
3. Masukkan kode voucher
4. Nikmati internet! 🌐

{{companyName}}
📞 {{companyPhone}}`,
    isActive: true,
  },

  // =============================================
  // AUTO RENEWAL (2)
  // =============================================
  {
    id: 'wa-auto-renewal-warning',
    type: 'auto-renewal-warning',
    name: 'Peringatan Auto Renewal',
    message: `⏰ *Peringatan Auto Renewal*

Halo {{customerName}},

━━━━━━━━━━━━━━━━━━━━━━
*⚠️ INFORMASI PENTING*
━━━━━━━━━━━━━━━━━━━━━━
Saldo deposit Anda *TIDAK CUKUP* untuk auto renewal.

👤 Username: {{username}}
💰 Saldo Saat Ini: Rp {{currentBalance}}
📅 Masa Aktif: {{expiredDate}}

💵 Biaya Renewal: Rp {{renewalAmount}}
⚠️ Kekurangan: Rp {{shortfall}}

━━━━━━━━━━━━━━━━━━━━━━
*📝 LANGKAH SELANJUTNYA*
━━━━━━━━━━━━━━━━━━━━━━
Silakan top-up deposit minimal Rp {{shortfall}} sebelum {{expiredDate}} untuk melanjutkan layanan.

🔗 *Top-up Sekarang:*
{{topupLink}}

📞 Butuh bantuan? Hubungi: {{companyPhone}}

Terima kasih,
_{{companyName}}_`,
    isActive: true,
  },
  {
    id: 'wa-auto-renewal-success',
    type: 'auto-renewal-success',
    name: 'Auto Renewal Berhasil',
    message: `✅ *AUTO RENEWAL BERHASIL*

Halo {{customerName}},

Layanan Anda telah diperpanjang otomatis!

━━━━━━━━━━━━━━━━━━━━━━
*📋 DETAIL RENEWAL*
━━━━━━━━━━━━━━━━━━━━━━
👤 Username: {{username}}
📦 Paket: {{profileName}}
💰 Biaya: {{amount}}
💳 Saldo Sekarang: {{newBalance}}
📅 Aktif hingga: {{expiredDate}}

Terima kasih telah menjadi pelanggan setia kami! 🙏

{{companyName}}
☎️ {{companyPhone}}`,
    isActive: true,
  },

  // =============================================
  // BROADCAST & MARKETING (4)
  // =============================================
  {
    id: 'wa-general-broadcast',
    type: 'general-broadcast',
    name: 'Broadcast Umum ke Pelanggan',
    message: `📢 *Pengumuman*

Halo {{customerName}},

{{message}}

Jika ada pertanyaan, hubungi kami di {{companyPhone}}

Terima kasih,
_{{companyName}}_`,
    isActive: true,
  },
  {
    id: 'wa-promo-offer',
    type: 'promo-offer',
    name: 'Promo & Penawaran Khusus',
    message: `🎁 *PROMO SPESIAL!*

Halo {{customerName}},

{{promoTitle}}

{{promoDescription}}

Jangan lewatkan kesempatan ini! Hubungi kami segera.

📞 {{companyPhone}}

_{{companyName}}_`,
    isActive: true,
  },
  {
    id: 'wa-welcome-message',
    type: 'welcome-message',
    name: 'Selamat Datang Pelanggan Baru',
    message: `🎉 *Selamat Datang!*

Halo {{customerName}},

Selamat bergabung dengan *{{companyName}}*! Kami senang Anda menjadi bagian dari keluarga kami.

Nikmati layanan internet berkualitas dari kami. Tim support kami siap membantu Anda 24/7.

📞 {{companyPhone}}

Terima kasih! 🙏`,
    isActive: true,
  },
  {
    id: 'wa-thank-you',
    type: 'thank-you',
    name: 'Ucapan Terima Kasih',
    message: `🙏 *Terima Kasih*

Halo {{customerName}},

Terima kasih telah menggunakan layanan *{{companyName}}*. Kepuasan Anda adalah prioritas kami.

Salam hangat,
_{{companyName}}_`,
    isActive: true,
  },

  // =============================================
  // CUSTOMER SERVICE (3)
  // =============================================
  {
    id: 'wa-account-info',
    type: 'account-info',
    name: 'Informasi Akun Pelanggan',
    message: `📋 *Informasi Akun*

Halo {{customerName}},

━━━━━━━━━━━━━━━━━━━━━━
*📱 DETAIL AKUN ANDA*
━━━━━━━━━━━━━━━━━━━━━━
👤 Username: {{username}}
📦 Paket: {{profileName}}
� Area: {{area}}
📅 Masa Aktif: {{expiredAt}}

📞 {{companyPhone}}
📧 {{companyEmail}}

_{{companyName}}_`,
    isActive: true,
  },
  {
    id: 'wa-payment-reminder-general',
    type: 'payment-reminder-general',
    name: 'Pengingat Pembayaran Umum',
    message: `📅 *Pengingat Pembayaran*

Halo {{customerName}},

Ini adalah pengingat untuk segera melakukan pembayaran tagihan Anda.

Jangan sampai layanan Anda terganggu. Lakukan pembayaran sebelum jatuh tempo.

{{bankAccounts}}

📞 {{companyPhone}}

_{{companyName}}_`,
    isActive: true,
  },
  {
    id: 'wa-payment-warning',
    type: 'payment-warning',
    name: 'Peringatan Pembayaran Tertunda',
    message: `⚠️ *PERINGATAN PEMBAYARAN*

Halo {{customerName}},

Pembayaran Anda sudah melewati jatuh tempo.

Segera lakukan pembayaran untuk menghindari pemutusan layanan.

{{bankAccounts}}

📞 {{companyPhone}}

_{{companyName}}_`,
    isActive: true,
  },

  // =============================================
  // ADMIN & INTERNAL (3)
  // =============================================
  {
    id: 'wa-manual_payment_admin',
    type: 'manual_payment_admin',
    name: 'Notifikasi Admin Manual Payment',
    message: `🔔 *NOTIFIKASI PEMBAYARAN MANUAL*

📋 *Detail Pembayaran*
━━━━━━━━━━━━━━━━━━━━
📌 Invoice: {{invoiceNumber}}
👤 Pelanggan: {{customerName}}
🆔 ID: {{customerId}}
💰 Jumlah: {{amount}}

🏦 *Info Transfer*
━━━━━━━━━━━━━━━━━━━━
Bank: {{senderBank}}
Nama: {{senderName}}
No. Rek: {{senderAccount}}

📝 Catatan: {{notes}}

⚠️ Silakan verifikasi dan approve/reject pembayaran ini.

{{companyName}}`,
    isActive: true,
  },
  {
    id: 'wa-payment-confirmed',
    type: 'payment-confirmed',
    name: 'Konfirmasi Pembayaran Diterima',
    message: `✅ *Pembayaran Diterima*

Halo {{customerName}},

Pembayaran Anda untuk invoice *{{invoiceNumber}}* telah kami terima dan konfirmasi.

Layanan Anda sekarang aktif. Terima kasih atas pembayaran tepat waktu!

_{{companyName}}_`,
    isActive: true,
  },
  {
    id: 'wa-outage_notification',
    type: 'outage_notification',
    name: 'Notifikasi Gangguan',
    message: `⚠️ *PEMBERITAHUAN GANGGUAN*

Yth. {{customerName}},

Saat ini terdapat gangguan pada jaringan di area Anda.

Tim teknis kami sedang bekerja untuk mengatasi masalah ini. Kami mohon maaf atas ketidaknyamanannya.

📧 {{companyEmail}}

Terima kasih atas pengertian Anda.

Hormat kami,
*{{companyName}}*`,
    isActive: true,
  },

  // =============================================
  // OTHERS (4)
  // =============================================
  {
    id: 'wa-maintenance-info',
    type: 'maintenance-info',
    name: 'Pemberitahuan Maintenance',
    message: `🔧 *Pemberitahuan Maintenance*

Halo {{customerName}},

Kami akan melakukan maintenance pada jaringan kami.

━━━━━━━━━━━━━━━━━━━━━━
⏰ Waktu: {{maintenanceTime}}
⏱️ Estimasi: {{estimatedDuration}}
━━━━━━━━━━━━━━━━━━━━━━

Mohon maaf atas ketidaknyamanannya. Maintenance ini untuk meningkatkan kualitas layanan.

_{{companyName}}_`,
    isActive: true,
  },
  {
    id: 'wa-upgrade-notification',
    type: 'upgrade-notification',
    name: 'Pemberitahuan Upgrade Paket',
    message: `⬆️ *UPGRADE PAKET*

Halo {{customerName}},

Paket internet Anda telah berhasil di-upgrade!

━━━━━━━━━━━━━━━━━━━━━━
📦 Paket Baru: {{newProfileName}}
🚀 Kecepatan: {{speed}}
━━━━━━━━━━━━━━━━━━━━━━

Nikmati internet lebih cepat dan lebih stabil!

_{{companyName}}_`,
    isActive: true,
  },
  {
    id: 'wa-payment-failure',
    type: 'payment-failure',
    name: 'Notifikasi Gagal Bayar',
    message: `❌ *PEMBAYARAN GAGAL*

Halo {{customerName}},

Maaf, pembayaran Anda gagal diproses.

━━━━━━━━━━━━━━━━━━━━━━
📌 Invoice: {{invoiceNumber}}
💰 Jumlah: Rp {{amount}}
❌ Alasan: {{failureReason}}
━━━━━━━━━━━━━━━━━━━━━━

Silakan coba lagi atau hubungi kami.

🔗 {{paymentLink}}
📞 {{companyPhone}}

_{{companyName}}_`,
    isActive: true,
  },
  {
    id: 'wa-service-suspension',
    type: 'service-suspension',
    name: 'Peringatan Suspend Layanan',
    message: `⚠️ *PERINGATAN SUSPEND*

Halo {{customerName}},

Layanan Anda akan di-suspend karena pembayaran belum dilakukan.

━━━━━━━━━━━━━━━━━━━━━━
👤 Username: {{username}}
📅 Jatuh Tempo: {{dueDate}}
💰 Tagihan: Rp {{amount}}
━━━━━━━━━━━━━━━━━━━━━━

Segera lakukan pembayaran untuk menghindari suspend.

🔗 {{paymentLink}}
📞 {{companyPhone}}

_{{companyName}}_`,
    isActive: true,
  },
];

export async function seedWhatsAppTemplates(force = false) {
  console.log(`🌱 Seeding WhatsApp templates (always updates message content)...`);
  
  for (const template of whatsappTemplates) {
    await prisma.whatsapp_templates.upsert({
      where: { type: template.type },
      create: template,
      update: { name: template.name, message: template.message, isActive: template.isActive },
    });
    console.log(`   ✅ Template: ${template.name}`);
  }
}

// Run if executed directly
if (require.main === module) {
  const force = process.argv.includes('--force');
  seedWhatsAppTemplates(force)
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
