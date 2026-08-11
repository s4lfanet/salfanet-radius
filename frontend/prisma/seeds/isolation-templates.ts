import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedIsolationTemplates() {
  console.log('🌱 Seeding isolation templates...');

  // WhatsApp Template
  await prisma.isolationTemplate.upsert({
    where: { id: 'isolation-wa-default' },
    update: {},
    create: {
      id: 'isolation-wa-default',
      type: 'whatsapp',
      name: 'Default WhatsApp Isolation Notice',
      message: `Halo *{{customerName}}* 👋

⚠️ *AKUN ANDA TELAH DIISOLIR*

Akun internet Anda telah dibatasi karena masa berlangganan telah habis.

📋 *Detail Akun:*
Username: {{username}}
Expired: {{expiredDate}}

🔒 *Status Saat Ini:*
✗ Akses internet dibatasi
✗ Bandwidth terbatas ({{rateLimit}})
✓ Bisa login PPPoE

💡 *Cara Mengaktifkan Kembali:*
1. Lakukan pembayaran tagihan
2. Logout dan login ulang PPPoE
3. Akses internet akan aktif otomatis

🔗 *Link Pembayaran:*
{{paymentLink}}

Atau scan QR Code berikut:
{{qrCode}}

Butuh bantuan?
📞 {{companyPhone}}
📧 {{companyEmail}}

Terima kasih,
*{{companyName}}*`,
      variables: {
        customerName: 'Nama pelanggan',
        username: 'Username PPPoE',
        expiredDate: 'Tanggal expired',
        rateLimit: 'Rate limit (misal: 64k/64k)',
        paymentLink: 'Link untuk pembayaran',
        qrCode: 'QR Code URL',
        companyName: 'Nama perusahaan',
        companyPhone: 'No telepon perusahaan',
        companyEmail: 'Email perusahaan'
      },
      isActive: true
    }
  });

  // Email Template
  await prisma.isolationTemplate.upsert({
    where: { id: 'isolation-email-default' },
    update: {},
    create: {
      id: 'isolation-email-default',
      type: 'email',
      name: 'Default Email Isolation Notice',
      subject: '⚠️ Akun Anda Telah Diisolir - {{username}}',
      message: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
    .alert-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
    .info-box { background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .button { display: inline-block; background: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; }
    .qr-code { text-align: center; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ Akun Anda Telah Diisolir</h1>
      <p>Layanan Internet Dibatasi</p>
    </div>
    
    <div class="content">
      <p>Halo <strong>{{customerName}}</strong>,</p>
      
      <div class="alert-box">
        <strong>Pemberitahuan Penting</strong><br>
        Akun internet Anda telah dibatasi karena masa berlangganan telah habis pada <strong>{{expiredDate}}</strong>.
      </div>
      
      <div class="info-box">
        <h3>📋 Detail Akun</h3>
        <table width="100%" cellpadding="5">
          <tr>
            <td width="150"><strong>Username</strong></td>
            <td>{{username}}</td>
          </tr>
          <tr>
            <td><strong>Expired Date</strong></td>
            <td>{{expiredDate}}</td>
          </tr>
          <tr>
            <td><strong>Rate Limit</strong></td>
            <td>{{rateLimit}}</td>
          </tr>
        </table>
      </div>
      
      <h3>🔒 Status Saat Ini:</h3>
      <ul>
        <li>✗ Akses internet dibatasi</li>
        <li>✗ Bandwidth terbatas</li>
        <li>✓ Masih bisa login PPPoE</li>
      </ul>
      
      <h3>💡 Cara Mengaktifkan Kembali:</h3>
      <ol>
        <li>Lakukan pembayaran tagihan</li>
        <li>Logout dan login ulang PPPoE Anda</li>
        <li>Akses internet akan aktif otomatis dalam 5-10 menit</li>
      </ol>
      
      <div style="text-align: center;">
        <a href="{{paymentLink}}" class="button">💳 Bayar Sekarang</a>
      </div>
      
      <div class="qr-code">
        <p><strong>Atau Scan QR Code:</strong></p>
        <img src="{{qrCodeImage}}" alt="QR Code" width="200" height="200">
      </div>
      
      <p style="margin-top: 30px;">
        <strong>Butuh Bantuan?</strong><br>
        📞 WhatsApp: {{companyPhone}}<br>
        📧 Email: {{companyEmail}}
      </p>
    </div>
    
    <div class="footer">
      <p>{{companyName}} © 2025</p>
      <p style="font-size: 12px; color: #6b7280;">
        Email ini dikirim otomatis oleh sistem.
      </p>
    </div>
  </div>
</body>
</html>`,
      variables: {
        customerName: 'Nama pelanggan',
        username: 'Username PPPoE',
        expiredDate: 'Tanggal expired (format: 5 November 2024)',
        rateLimit: 'Rate limit (misal: 64k/64k)',
        paymentLink: 'URL link untuk pembayaran',
        qrCodeImage: 'URL image QR code',
        companyName: 'Nama perusahaan',
        companyPhone: 'No telepon perusahaan',
        companyEmail: 'Email perusahaan'
      },
      isActive: true
    }
  });

  // HTML Landing Page Template
  await prisma.isolationTemplate.upsert({
    where: { id: 'isolation-html-default' },
    update: {},
    create: {
      id: 'isolation-html-default',
      type: 'html_page',
      name: 'Default HTML Landing Page',
      message: `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Akun Diisolir - {{companyName}}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }
    .header h1 { font-size: 32px; margin-bottom: 10px; }
    .header p { opacity: 0.9; }
    .content { padding: 40px; }
    .alert {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 20px;
      margin-bottom: 30px;
      border-radius: 5px;
    }
    .info-box {
      background: #f3f4f6;
      padding: 20px;
      border-radius: 10px;
      margin: 20px 0;
    }
    .info-box table { width: 100%; }
    .info-box td { padding: 8px 0; }
    .info-box td:first-child { font-weight: 600; width: 120px; }
    .status-list { margin: 20px 0; }
    .status-list li { padding: 8px 0; list-style: none; }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
      color: white;
      padding: 15px 40px;
      text-decoration: none;
      border-radius: 10px;
      font-weight: 600;
      text-align: center;
      margin: 20px 0;
      display: block;
    }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(220,38,38,0.3); }
    .qr-section {
      text-align: center;
      padding: 30px;
      background: #f9fafb;
      border-radius: 10px;
      margin: 20px 0;
    }
    .qr-section img { max-width: 200px; margin: 20px 0; }
    .contact {
      text-align: center;
      margin-top: 30px;
      padding-top: 30px;
      border-top: 1px solid #e5e7eb;
    }
    .contact a {
      display: inline-block;
      margin: 10px;
      padding: 10px 20px;
      background: #10b981;
      color: white;
      text-decoration: none;
      border-radius: 5px;
    }
    .footer {
      background: #f9fafb;
      padding: 20px;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
    }
    @media (max-width: 640px) {
      .header h1 { font-size: 24px; }
      .content { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛡️ Akun Anda Diisolir</h1>
      <p>Layanan Internet Telah Dibatasi</p>
    </div>
    
    <div class="content">
      <div class="alert">
        <strong>⚠️ Pemberitahuan Penting</strong><br>
        Akun internet Anda telah dibatasi karena masa berlangganan telah habis.
        Silakan lakukan pembayaran untuk mengaktifkan kembali layanan.
      </div>
      
      <div class="info-box">
        <h3 style="margin-bottom: 15px;">👤 Informasi Akun</h3>
        <table>
          <tr>
            <td>Username</td>
            <td><strong>{{username}}</strong></td>
          </tr>
          <tr>
            <td>Nama</td>
            <td><strong>{{customerName}}</strong></td>
          </tr>
          <tr>
            <td>Expired Date</td>
            <td><strong style="color: #dc2626;">{{expiredDate}}</strong></td>
          </tr>
          <tr>
            <td>Rate Limit</td>
            <td><strong>{{rateLimit}}</strong></td>
          </tr>
        </table>
      </div>
      
      <h3>🔒 Status Saat Ini:</h3>
      <ul class="status-list">
        <li>❌ Akses internet dibatasi</li>
        <li>❌ Bandwidth sangat terbatas</li>
        <li>✅ Masih bisa login PPPoE</li>
        <li>✅ Dapat akses halaman pembayaran</li>
      </ul>
      
      <h3>💡 Cara Mengaktifkan:</h3>
      <ol class="status-list">
        <li>1️⃣ Klik tombol "Bayar Sekarang" di bawah</li>
        <li>2️⃣ Selesaikan pembayaran</li>
        <li>3️⃣ Logout dan login ulang PPPoE</li>
        <li>4️⃣ Internet aktif otomatis!</li>
      </ol>
      
      <a href="{{paymentLink}}" class="btn">💳 Bayar Sekarang</a>
      
      <div class="qr-section">
        <h3>Atau Scan QR Code</h3>
        <p style="color: #6b7280; margin: 10px 0;">Scan dengan kamera smartphone Anda</p>
        <img src="{{qrCodeImage}}" alt="QR Code Payment">
      </div>
      
      <div class="contact">
        <h3>💬 Butuh Bantuan?</h3>
        <a href="https://wa.me/{{companyPhoneClean}}">📱 WhatsApp</a>
        <a href="mailto:{{companyEmail}}">📧 Email</a>
      </div>
    </div>
    
    <div class="footer">
      <p><strong>{{companyName}}</strong></p>
      <p>© 2025 - Halaman ini dibuat otomatis oleh sistem</p>
    </div>
  </div>
  
  <script>
    setTimeout(function() { location.reload(); }, 300000);
  </script>
</body>
</html>`,
      variables: {
        username: 'Username PPPoE',
        customerName: 'Nama pelanggan',
        expiredDate: 'Tanggal expired',
        rateLimit: 'Rate limit bandwidth',
        paymentLink: 'URL link pembayaran',
        qrCodeImage: 'URL image QR code',
        companyName: 'Nama perusahaan',
        companyPhone: 'No telepon dengan format (0895...)',
        companyPhoneClean: 'No telepon tanpa karakter (62895...)',
        companyEmail: 'Email perusahaan'
      },
      isActive: true
    }
  });

  // Update company to use default templates
  await prisma.company.updateMany({
    where: {
      OR: [
        { isolationWhatsappTemplateId: null },
        { isolationEmailTemplateId: null },
        { isolationHtmlTemplateId: null }
      ]
    },
    data: {
      isolationWhatsappTemplateId: 'isolation-wa-default',
      isolationEmailTemplateId: 'isolation-email-default',
      isolationHtmlTemplateId: 'isolation-html-default'
    }
  });

  console.log('✅ Isolation templates seeded successfully!');
}

// Run if called directly
if (require.main === module) {
  seedIsolationTemplates()
    .catch((e) => {
      console.error('❌ Error seeding isolation templates:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
