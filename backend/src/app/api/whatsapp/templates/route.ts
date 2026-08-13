import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// Default templates (includes both broadcast and notification templates)
const defaultTemplates = [
  // === NOTIFICATION TEMPLATES (Auto-sent, with invoice variables) ===
  {
    name: 'Invoice Reminder (Auto)',
    type: 'invoice-reminder',
    message: `📅 *Pengingat Tagihan Internet*

Halo *{{customerName}}*,

Tagihan internet Anda akan segera jatuh tempo.

📋 *Detail Invoice:*
━━━━━━━━━━━━━━━━━━
📄 No. Invoice: *{{invoiceNumber}}*
👤 Username: {{username}}
💰 Jumlah: *{{amount}}*
📆 Jatuh Tempo: *{{dueDate}}*
⏰ Sisa Waktu: *{{daysRemaining}} hari*
━━━━━━━━━━━━━━━━━━

💳 *Bayar Sekarang:*
{{paymentLink}}

⚠️ *Penting:*
Pembayaran tepat waktu memastikan layanan Anda tetap aktif tanpa gangguan.

📞 Butuh bantuan? Hubungi: {{companyPhone}}

Terima kasih,
{{companyName}} 🙏`,
  },
  {
    name: 'Invoice Overdue (Auto)',
    type: 'invoice-overdue',
    message: `🚨 *TAGIHAN TELAT BAYAR*

Halo *{{customerName}}*,

Tagihan internet Anda sudah *MELEWATI* jatuh tempo!

📋 *Detail Invoice:*
━━━━━━━━━━━━━━━━━━
📄 No. Invoice: *{{invoiceNumber}}*
👤 Username: {{username}}
💰 Jumlah: *{{amount}}*
📆 Jatuh Tempo: *{{dueDate}}*
⚠️ Terlambat: *{{daysOverdue}} hari*
━━━━━━━━━━━━━━━━━━

⛔ *PERINGATAN:*
Layanan internet Anda akan/sudah dinonaktifkan karena keterlambatan pembayaran.

💳 *Bayar Sekarang untuk Mengaktifkan Kembali:*
{{paymentLink}}

📞 Hubungi segera: {{companyPhone}}

{{companyName}}`,
  },
  {
    name: 'Pendaftaran Disetujui (Auto)',
    type: 'registration-approval',
    message: `🎉 *Pendaftaran Disetujui!*

Halo *{{customerName}}*,

Selamat! Pendaftaran internet Anda telah disetujui.

📋 *Detail Akun PPPoE:*
━━━━━━━━━━━━━━━━━━
👤 Username: *{{username}}*
🔐 Password: *{{password}}*
📦 Paket: *{{profileName}}*
💰 Biaya Instalasi: *Rp {{installationFee}}*
━━━━━━━━━━━━━━━━━━

🚀 Internet akan aktif setelah:
1. Pembayaran biaya instalasi diterima
2. Tim teknisi menyelesaikan instalasi

📞 Hubungi kami: {{companyPhone}}

Terima kasih telah bergabung!
{{companyName}} 🙏`,
  },
  {
    name: 'Pembayaran Diterima (Auto)',
    type: 'payment-success',
    message: `✅ *Pembayaran Berhasil!*

Halo *{{customerName}}*,

Pembayaran invoice {{invoiceNumber}} sebesar *{{amount}}* telah kami terima.

🎉 *Internet Anda Sudah AKTIF!*

📋 *Detail Akun:*
━━━━━━━━━━━━━━━━━━
👤 Username: *{{username}}*
🔐 Password: *{{password}}*
📦 Paket: *{{profileName}}*
━━━━━━━━━━━━━━━━━━

🚀 Silakan koneksi sekarang!

📞 Butuh bantuan? Hubungi: {{companyPhone}}

Terima kasih,
{{companyName}} 🙏`,
  },
  {
    name: 'Invoice Instalasi (Auto)',
    type: 'installation-invoice',
    message: `📄 *Invoice Instalasi Internet*

Halo *{{customerName}}*,

Berikut adalah invoice untuk biaya instalasi internet Anda.

📋 *Detail Invoice:*
━━━━━━━━━━━━━━━━━━
📄 No. Invoice: *{{invoiceNumber}}*
💰 Jumlah: *{{amount}}*
📆 Jatuh Tempo: *{{dueDate}}*
━━━━━━━━━━━━━━━━━━

💳 *Bayar Sekarang:*
{{paymentLink}}

⚠️ *Penting:*
Internet akan diaktifkan setelah pembayaran diterima dan instalasi selesai.

📞 Butuh bantuan? Hubungi: {{companyPhone}}

Terima kasih,
{{companyName}} 🙏`,
  },
  {
    name: 'Link Pembayaran Voucher (Auto)',
    type: 'voucher-payment-link',
    message: `💳 *Link Pembayaran Voucher*

Halo *{{customerName}}*,

Pesanan voucher internet Anda telah dibuat! Silakan lakukan pembayaran untuk mendapatkan voucher.

📋 *Detail Pesanan:*
━━━━━━━━━━━━━━━━━━
🆔 ID Pelanggan: *{{customerId}}*
👤 Nama: *{{customerName}}*
📱 No. HP: *{{phone}}*
🎟️ Token Order: *{{orderToken}}*
📦 Paket: *{{profileName}}*
💰 Harga: *{{price}}*
🔢 Jumlah: *{{quantity}}* voucher
💵 *Total Pembayaran: {{totalAmount}}*
⏰ Batas Bayar: *{{expiryTime}}*
━━━━━━━━━━━━━━━━━━

💳 *Link Pembayaran:*
{{paymentLink}}

📌 *Cara Pembayaran:*
1. Klik link di atas
2. Pilih metode pembayaran (Transfer/QRIS/E-Wallet)
3. Selesaikan pembayaran sebelum batas waktu
4. Voucher akan dikirim otomatis via WhatsApp & Email

⚠️ *PENTING:*
- Lakukan pembayaran sebelum {{expiryTime}}
- Setelah pembayaran, voucher akan dikirim otomatis
- Simpan link ini untuk cek status pembayaran
- Pembayaran yang sudah masuk tidak dapat dibatalkan

💡 *Tips:*
- Pastikan nominal pembayaran sesuai dengan total tagihan
- Gunakan metode pembayaran yang tercepat
- Hubungi kami jika ada kendala pembayaran

📞 Butuh bantuan? Hubungi: {{companyPhone}}

Terima kasih!
{{companyName}} 🙏`,
  },
  {
    name: 'Pembelian Voucher Berhasil (Auto)',
    type: 'voucher-purchase-success',
    message: `� *Voucher Internet Anda*

Halo *{{customerName}}*,

Terima kasih telah membeli voucher internet! Berikut adalah detail voucher Anda:

━━━━━━━━━━━━━━━━━━
🎟️ *KODE VOUCHER:*
*{{voucherCodes}}*
━━━━━━━━━━━━━━━━━━

📋 *Detail Pembelian:*
━━━━━━━━━━━━━━━━━━
🆔 ID Pelanggan: *{{customerId}}*
👤 Nama: *{{customerName}}*
📱 No. HP: *{{phone}}*
📦 Paket: *{{profileName}}*
⏱️ Durasi: *{{duration}}*
💰 Harga: *{{price}}*
🔢 Jumlah: *{{quantity}}* voucher
💵 Total: *{{totalAmount}}*
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
{{companyName}} 🙏

Selamat berselancar! 🚀`,
  },
  
  // === BROADCAST TEMPLATES (Manual send, no invoice variables) ===
  {
    name: 'Admin Create User Manual',
    type: 'admin-create-user',
    message: `🎉 *Akun Internet Anda Telah Dibuat!*

Halo *{{customerName}}*,

Admin telah membuatkan akun internet untuk Anda.

📋 *Detail Akun PPPoE:*
━━━━━━━━━━━━━━━━━━
👤 Username: *{{username}}*
🔐 Password: [akan dikirim terpisah]
📦 Paket: *{{profileName}}*
💰 Biaya Bulanan: *{{price}}*
━━━━━━━━━━━━━━━━━━

🚀 *Status:* AKTIF
Internet Anda sudah bisa digunakan!

💡 *Tips:*
- Simpan username & password Anda
- Koneksi PPPoE akan otomatis tersambung
- Invoice bulanan akan dikirim otomatis setiap bulan

📞 Butuh bantuan? Hubungi: {{companyPhone}}

Terima kasih telah menggunakan {{companyName}}! 🙏`,
  },
  {
    name: 'Broadcast Umum ke Pelanggan',
    type: 'general-broadcast',
    message: `Halo *{{customerName}}*,

Kami ingin menginformasikan kepada Anda mengenai...

📋 *Informasi:*
━━━━━━━━━━━━━━━━━━
[Isi pesan Anda di sini]
━━━━━━━━━━━━━━━━━━

💡 *Detail Akun Anda:*
👤 Username: {{username}}
📦 Paket: {{profileName}}
💰 Biaya: {{price}}

📞 Butuh bantuan? Hubungi: {{companyPhone}}

Terima kasih,
{{companyName}} 🙏`,
  },
  {
    name: 'Pengingat Pembayaran Umum',
    type: 'payment-reminder-general',
    message: `📅 *Pengingat Pembayaran*

Halo *{{customerName}}*,

Kami ingatkan untuk segera melakukan pembayaran internet bulanan Anda.

📋 *Detail Akun:*
━━━━━━━━━━━━━━━━━━
👤 Username: *{{username}}*
📦 Paket: *{{profileName}}*
💰 Biaya Bulanan: *{{price}}*
━━━━━━━━━━━━━━━━━━

📌 Silakan hubungi admin untuk mendapatkan link pembayaran atau melakukan transfer manual.

💳 *Cara Bayar:*
Hubungi {{companyPhone}} untuk info rekening atau link pembayaran online.

⚠️ *Penting:*
Pembayaran tepat waktu memastikan layanan Anda tetap aktif tanpa gangguan.

📞 Hubungi: {{companyPhone}}

Terima kasih atas kepercayaan Anda! 🙏
{{companyName}}`,
  },
  {
    name: 'Informasi Akun Pelanggan',
    type: 'account-info',
    message: `📋 *Informasi Akun Internet*

Halo *{{customerName}}*,

Berikut informasi akun internet Anda:

━━━━━━━━━━━━━━━━━━
👤 Nama: {{customerName}}
🔐 Username: {{username}}
📦 Paket: {{profileName}}
💰 Biaya: {{price}}/bulan
📍 Alamat: {{address}}
📞 No. HP: {{phone}}
✉️ Email: {{email}}
━━━━━━━━━━━━━━━━━━

💡 *Tips:*
- Simpan informasi ini dengan baik
- Hubungi kami jika ada perubahan data
- Pastikan pembayaran tepat waktu

📞 Customer Service: {{companyPhone}}

Terima kasih,
{{companyName}} 🙏`,
  },
  {
    name: 'Ucapan Terima Kasih',
    type: 'thank-you',
    message: `🙏 *Terima Kasih*

Halo *{{customerName}}*,

Terima kasih telah mempercayai {{companyName}} sebagai penyedia layanan internet Anda.

📋 *Akun Anda:*
👤 Username: {{username}}
📦 Paket: {{profileName}}

Kami berkomitmen memberikan layanan terbaik untuk Anda.

📞 Butuh bantuan? Hubungi: {{companyPhone}}

Salam,
Tim {{companyName}} 🌐`,
  },
  {
    name: 'Peringatan Pembayaran Tertunda',
    type: 'payment-warning',
    message: `⚠️ *Peringatan Pembayaran*

Halo *{{customerName}}*,

Kami perhatikan pembayaran internet Anda belum kami terima.

📋 *Detail Akun:*
👤 Username: {{username}}
📦 Paket: {{profileName}}
💰 Tagihan: {{price}}

⏰ Harap segera lakukan pembayaran untuk menghindari pemutusan layanan.

📞 Hubungi kami: {{companyPhone}}

Terima kasih,
{{companyName}}`,
  },
  {
    name: 'Konfirmasi Pembayaran Diterima',
    type: 'payment-confirmed',
    message: `✅ *Pembayaran Diterima*

Halo *{{customerName}}*,

Pembayaran Anda telah kami terima! 🎉

📋 *Detail Akun:*
👤 Username: {{username}}
📦 Paket: {{profileName}}
💰 Biaya: {{price}}

🚀 Internet Anda sudah aktif dan dapat digunakan!

📞 Butuh bantuan? Hubungi: {{companyPhone}}

Terima kasih atas kepercayaan Anda,
{{companyName}} 🙏`,
  },
  {
    name: 'Selamat Datang Pelanggan Baru',
    type: 'welcome-message',
    message: `🎉 *Selamat Datang!*

Halo *{{customerName}}*,

Selamat bergabung dengan keluarga besar {{companyName}}!

📋 *Akun Internet Anda:*
━━━━━━━━━━━━━━━━━━
👤 Username: {{username}}
📦 Paket: {{profileName}}
💰 Biaya: {{price}}/bulan
━━━━━━━━━━━━━━━━━━

🚀 Nikmati internet cepat dan stabil!

💡 *Jika ada kendala:*
📞 Hubungi: {{companyPhone}}
📍 Alamat: {{companyAddress}}

Selamat berselancar! 🌐
{{companyName}}`,
  },
  {
    name: 'Promo & Penawaran Khusus',
    type: 'promo-offer',
    message: `🎁 *Promo Spesial!*

Halo *{{customerName}}*,

Ada penawaran khusus untuk Anda!

━━━━━━━━━━━━━━━━━━
[Isi detail promo di sini]
━━━━━━━━━━━━━━━━━━

📋 *Akun Anda saat ini:*
👤 Username: {{username}}
📦 Paket: {{profileName}}
💰 Biaya: {{price}}

📞 Info lebih lanjut: {{companyPhone}}

Jangan lewatkan kesempatan ini!
{{companyName}} 🎉`,
  },
  {
    name: 'Pemberitahuan Maintenance',
    type: 'maintenance-info',
    message: `🔧 *Pemberitahuan Maintenance*

Halo *{{customerName}}*,

Kami akan melakukan maintenance jaringan untuk meningkatkan kualitas layanan.

⏰ *Jadwal:*
[Isi tanggal dan waktu maintenance]

📋 *Yang perlu Anda tahu:*
- Layanan internet akan terputus sementara
- Durasi maintenance sekitar [durasi]
- Layanan akan normal kembali setelah selesai

Mohon maaf atas ketidaknyamanannya.

📞 Info: {{companyPhone}}

Terima kasih atas pengertiannya,
{{companyName}} 🙏`,
  },
  {
    name: 'Pemberitahuan Upgrade Paket',
    type: 'upgrade-notification',
    message: `⬆️ *Upgrade Paket Internet*

Halo *{{customerName}}*,

Tingkatkan kecepatan internet Anda!

📋 *Paket Saat Ini:*
📦 {{profileName}}
💰 {{price}}

🚀 *Paket Tersedia:*
[Isi daftar paket upgrade]

📞 Hubungi untuk upgrade: {{companyPhone}}

Nikmati internet lebih cepat!
{{companyName}} 🌐`,
  },
  {
    name: 'Informasi Gangguan',
    type: 'maintenance-outage',
    message: `⚠️ *Informasi Gangguan Jaringan*

Halo *{{customerName}}*,

Kami informasikan bahwa saat ini terjadi gangguan pada jaringan internet di area Anda.

🔧 *Status:* Sedang dalam perbaikan

Tim teknis kami sedang bekerja untuk mengatasi gangguan ini secepat mungkin. Kami mohon maaf atas ketidaknyamanan yang ditimbulkan.

📌 *Update:*
Kami akan menginformasikan kembali jika layanan sudah pulih normal.

📞 Butuh bantuan? Hubungi: {{companyPhone}}

Terima kasih atas pengertian Anda.
{{companyName}} 🙏`,
  },
  {
    name: 'Perbaikan Selesai',
    type: 'maintenance-resolved',
    message: `✅ *Perbaikan Selesai - Layanan Normal Kembali*

Halo *{{customerName}}*,

Kabar baik! Gangguan jaringan di area Anda telah berhasil diatasi dan layanan internet sudah kembali normal.

━━━━━━━━━━━━━━━━━━
🎉 *Status:* NORMAL
🚀 *Internet:* AKTIF
⏰ *Update:* Sekarang
━━━━━━━━━━━━━━━━━━

💡 *Informasi:*
{{description}}

📋 *Akun Anda:*
👤 Username: {{username}}

Terima kasih atas kesabaran dan pengertian Anda selama proses perbaikan. Kami mohon maaf atas ketidaknyamanan yang ditimbulkan.

Jika masih mengalami kendala, silakan:
1. Restart perangkat/router Anda
2. Reconnect ke internet
3. Hubungi kami jika masalah berlanjut

📞 Customer Service: {{companyPhone}}

Selamat berselancar kembali! 🌐
{{companyName}} 🙏`,
  },
];

// GET - List all templates (auto-seed if empty or missing)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let templates = await prisma.whatsapp_templates.findMany({
      orderBy: { createdAt: 'asc' },
    });

    // Auto-seed default templates if none exist
    if (templates.length === 0) {
      console.log('[Templates] No templates found, creating defaults...');
      
      for (const defaultTemplate of defaultTemplates) {
        await prisma.whatsapp_templates.create({
          data: {
            id: crypto.randomUUID(),
            name: defaultTemplate.name,
            type: defaultTemplate.type,
            message: defaultTemplate.message,
            isActive: true,
          },
        });
      }
      
      // Fetch again after seeding
      templates = await prisma.whatsapp_templates.findMany({
        orderBy: { createdAt: 'asc' },
      });
      
      console.log(`[Templates] ✅ Created ${templates.length} default templates`);
    } else {
      // Check for missing templates and add them
      const existingTypes = templates.map(t => t.type);
      const missingTemplates = defaultTemplates.filter(dt => !existingTypes.includes(dt.type));
      
      if (missingTemplates.length > 0) {
        console.log(`[Templates] Adding ${missingTemplates.length} missing templates...`);
        
        for (const missingTemplate of missingTemplates) {
          await prisma.whatsapp_templates.create({
            data: {
              id: crypto.randomUUID(),
              name: missingTemplate.name,
              type: missingTemplate.type,
              message: missingTemplate.message,
              isActive: true,
            },
          });
        }
        
        // Fetch again after adding missing templates
        templates = await prisma.whatsapp_templates.findMany({
          orderBy: { createdAt: 'asc' },
        });
        
        console.log(`[Templates] ✅ Added missing templates: ${missingTemplates.map(t => t.type).join(', ')}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: templates,
    });
  } catch (error: any) {
    console.error('Get templates error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

// POST - Create new template
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type, message, isActive } = body;

    if (!name || !type || !message) {
      return NextResponse.json(
        { success: false, error: 'Name, type, and message are required' },
        { status: 400 }
      );
    }

    const template = await prisma.whatsapp_templates.create({
      data: {
        id: crypto.randomUUID(),
        name,
        type,
        message,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    return NextResponse.json({
      success: true,
      data: template,
    });
  } catch (error: any) {
    console.error('Create template error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create template' },
      { status: 500 }
    );
  }
}
