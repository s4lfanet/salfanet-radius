import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// Default email templates with HTML
const defaultTemplates = [
  {
    name: 'Persetujuan Pendaftaran',
    type: 'registration-approval',
    subject: '🎉 Selamat Datang {{customerName}} - Akun Anda Telah Disetujui!',
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f7f9; }
    .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #0d9488 0%, #06b6d4 100%); padding: 30px 20px; text-align: center; color: white; }
    .content { padding: 30px 20px; }
    .credentials { background: #f0fdfa; border-left: 4px solid #0d9488; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">🎉 Selamat Datang di {{companyName}}!</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Pendaftaran Anda telah disetujui</p>
    </div>
    <div class="content">
      <p>Kepada Yth. <strong>{{customerName}}</strong>,</p>
      <p>Selamat! Pendaftaran Anda telah disetujui dan akun internet Anda sudah siap digunakan.</p>
      
      <div class="credentials">
        <p style="margin: 5px 0;"><strong>ID Pelanggan:</strong> {{customerId}}</p>
        <p style="margin: 5px 0;"><strong>Username:</strong> {{username}}</p>
        <p style="margin: 5px 0;"><strong>Password:</strong> {{password}}</p>
        <p style="margin: 5px 0;"><strong>Paket:</strong> {{profileName}}</p>
        <p style="margin: 5px 0;"><strong>Biaya Instalasi:</strong> {{installationFee}}</p>
      </div>
      
      <p>⚠️ <strong>Penting:</strong> Harap simpan kredensial Anda dengan aman dan jangan bagikan kepada siapa pun.</p>
      <p>Jika Anda memiliki pertanyaan atau memerlukan bantuan, silakan hubungi kami.</p>
      
      <p style="margin-top: 30px;">Hormat kami,<br><strong>{{companyName}}</strong></p>
    </div>
    <div class="footer">
      <p>📞 Hubungi kami: {{companyPhone}}</p>
      <p>Email otomatis, mohon tidak membalas.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    name: 'Admin Create User',
    type: 'admin-create-user',
    subject: '👤 Akun Baru Telah Dibuat - {{username}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f7f9; }
    .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 30px 20px; text-align: center; color: white; }
    .content { padding: 30px 20px; }
    .credentials { background: #eef2ff; border-left: 4px solid #6366f1; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">👤 Akun Baru Dibuat</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Akun internet Anda sudah siap</p>
    </div>
    <div class="content">
      <p>Kepada Yth. <strong>{{customerName}}</strong>,</p>
      <p>Admin telah membuat akun internet untuk Anda. Berikut adalah kredensial login Anda:</p>
      
      <div class="credentials">
        <p style="margin: 5px 0;"><strong>ID Pelanggan:</strong> {{customerId}}</p>
        <p style="margin: 5px 0;"><strong>Username:</strong> {{username}}</p>
        <p style="margin: 5px 0;"><strong>Password:</strong> {{password}}</p>
        <p style="margin: 5px 0;"><strong>Paket:</strong> {{profileName}}</p>
      </div>
      
      <p>⚠️ <strong>Penting:</strong> Harap simpan kredensial Anda dengan aman dan jangan bagikan kepada siapa pun.</p>
      <p>Jika Anda memiliki pertanyaan atau memerlukan bantuan, silakan hubungi kami.</p>
      
      <p style="margin-top: 30px;">Hormat kami,<br><strong>{{companyName}}</strong></p>
    </div>
    <div class="footer">
      <p>📞 Hubungi kami: {{companyPhone}}</p>
      <p>Email otomatis, mohon tidak membalas.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    name: 'Invoice Instalasi',
    type: 'installation-invoice',
    subject: '🔧 Invoice Instalasi - {{invoiceNumber}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f7f9; }
    .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px 20px; text-align: center; color: white; }
    .content { padding: 30px 20px; }
    .invoice-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">🔧 Invoice Instalasi</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Tagihan biaya instalasi</p>
    </div>
    <div class="content">
      <p>Kepada Yth. <strong>{{customerName}}</strong>,</p>
      <p>Terima kasih telah memilih layanan kami. Berikut adalah invoice untuk biaya instalasi:</p>
      
      <div class="invoice-box">
        <p style="margin: 5px 0;"><strong>ID Pelanggan:</strong> {{customerId}}</p>
        <p style="margin: 5px 0;"><strong>Nomor Invoice:</strong> {{invoiceNumber}}</p>
        <p style="margin: 5px 0;"><strong>Total Tagihan:</strong> {{amount}}</p>
        <p style="margin: 5px 0;"><strong>Jatuh Tempo:</strong> {{dueDate}}</p>
      </div>
      
      <p>Mohon lakukan pembayaran sebelum tanggal jatuh tempo untuk memulai proses instalasi.</p>
      
      <a href="{{paymentLink}}" class="button" style="color: white;">Bayar Sekarang</a>
      
      <p style="margin-top: 30px;">Hormat kami,<br><strong>{{companyName}}</strong></p>
    </div>
    <div class="footer">
      <p>📞 Hubungi kami: {{companyPhone}}</p>
      <p>Email otomatis, mohon tidak membalas.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    name: 'Invoice Bulanan / Jatuh Tempo',
    type: 'invoice-reminder',
    subject: '📅 Invoice {{invoiceNumber}} - Jatuh Tempo {{daysRemaining}} Hari Lagi',
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f7f9; }
    .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px 20px; text-align: center; color: white; }
    .content { padding: 30px 20px; }
    .invoice-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">📅 Pengingat Invoice</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Pembayaran segera jatuh tempo</p>
    </div>
    <div class="content">
      <p>Kepada Yth. <strong>{{customerName}}</strong>,</p>
      <p>Ini adalah pengingat untuk pembayaran invoice Anda yang akan segera jatuh tempo.</p>
      
      <div class="invoice-box">
        <p style="margin: 5px 0;"><strong>ID Pelanggan:</strong> {{customerId}}</p>
        <p style="margin: 5px 0;"><strong>Nomor Invoice:</strong> {{invoiceNumber}}</p>
        <p style="margin: 5px 0;"><strong>Username:</strong> {{username}}</p>
        <p style="margin: 5px 0;"><strong>Total Tagihan:</strong> {{amount}}</p>
        <p style="margin: 5px 0;"><strong>Jatuh Tempo:</strong> {{dueDate}}</p>
        <p style="margin: 5px 0;"><strong>Sisa Waktu:</strong> {{daysRemaining}} hari</p>
      </div>
      
      <p>Mohon lakukan pembayaran sebelum tanggal jatuh tempo untuk menghindari gangguan layanan.</p>
      
      <a href="{{paymentLink}}" class="button" style="color: white;">Bayar Sekarang</a>
      
      <p style="margin-top: 30px;">Hormat kami,<br><strong>{{companyName}}</strong></p>
    </div>
    <div class="footer">
      <p>📞 Hubungi kami: {{companyPhone}}</p>
      <p>Email otomatis, mohon tidak membalas.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    name: 'Invoice Terlambat (Overdue)',
    type: 'invoice-overdue',
    subject: '⚠️ Invoice {{invoiceNumber}} - Terlambat {{daysOverdue}} Hari',
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f7f9; }
    .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px 20px; text-align: center; color: white; }
    .content { padding: 30px 20px; }
    .invoice-box { background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .warning-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .button { display: inline-block; background: #ef4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">⚠️ Invoice Terlambat</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Pembayaran Anda sudah melewati jatuh tempo</p>
    </div>
    <div class="content">
      <p>Kepada Yth. <strong>{{customerName}}</strong>,</p>
      <p>Invoice Anda telah melewati tanggal jatuh tempo. Mohon segera lakukan pembayaran untuk menghindari pemutusan layanan.</p>
      
      <div class="invoice-box">
        <p style="margin: 5px 0;"><strong>ID Pelanggan:</strong> {{customerId}}</p>
        <p style="margin: 5px 0;"><strong>Nomor Invoice:</strong> {{invoiceNumber}}</p>
        <p style="margin: 5px 0;"><strong>Username:</strong> {{username}}</p>
        <p style="margin: 5px 0;"><strong>Total Tagihan:</strong> {{amount}}</p>
        <p style="margin: 5px 0;"><strong>Jatuh Tempo:</strong> {{dueDate}}</p>
        <p style="margin: 5px 0; color: #dc2626;"><strong>Keterlambatan:</strong> {{daysOverdue}} hari</p>
      </div>
      
      <div class="warning-box">
        <p style="margin: 0; color: #92400e;">
          <strong>⚠️ Perhatian:</strong> Layanan internet Anda dapat diputus sewaktu-waktu jika pembayaran tidak segera dilakukan.
        </p>
      </div>
      
      <p>Abaikan pesan ini jika Anda sudah melakukan pembayaran.</p>
      
      <a href="{{paymentLink}}" class="button" style="color: white;">Bayar Sekarang</a>
      
      <p style="margin-top: 30px;">Hormat kami,<br><strong>{{companyName}}</strong></p>
    </div>
    <div class="footer">
      <p>📞 Hubungi kami: {{companyPhone}}</p>
      <p>Email otomatis, mohon tidak membalas.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    name: 'Pembayaran Berhasil',
    type: 'payment-success',
    subject: '✅ Pembayaran Diterima - Invoice {{invoiceNumber}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f7f9; }
    .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px 20px; text-align: center; color: white; }
    .content { padding: 30px 20px; }
    .success-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">✅ Pembayaran Berhasil!</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Terima kasih atas pembayaran Anda</p>
    </div>
    <div class="content">
      <p>Kepada Yth. <strong>{{customerName}}</strong>,</p>
      <p>Kami telah menerima pembayaran Anda. Akun Anda telah diaktifkan.</p>
      
      <div class="success-box">
        <p style="margin: 5px 0;"><strong>ID Pelanggan:</strong> {{customerId}}</p>
        <p style="margin: 5px 0;"><strong>Nomor Invoice:</strong> {{invoiceNumber}}</p>
        <p style="margin: 5px 0;"><strong>Jumlah Dibayar:</strong> {{amount}}</p>
        <p style="margin: 5px 0;"><strong>Username:</strong> {{username}}</p>
        <p style="margin: 5px 0;"><strong>Paket:</strong> {{profileName}}</p>
        <p style="margin: 5px 0;"><strong>Aktif Hingga:</strong> {{expiredDate}}</p>
      </div>
      
      <p>Akun internet Anda sudah aktif dan siap digunakan. Terima kasih telah mempercayai layanan kami.</p>
      
      <p style="margin-top: 30px;">Hormat kami,<br><strong>{{companyName}}</strong></p>
    </div>
    <div class="footer">
      <p>📞 Hubungi kami: {{companyPhone}}</p>
      <p>Email otomatis, mohon tidak membalas.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    name: 'Informasi Gangguan',
    type: 'maintenance-outage',
    subject: '⚠️ Pemberitahuan Gangguan - {{issueType}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f7f9; }
    .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px 20px; text-align: center; color: white; }
    .content { padding: 30px 20px; }
    .alert-box { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">⚠️ Pemberitahuan Gangguan</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Informasi penting untuk Anda</p>
    </div>
    <div class="content">
      <p>Kepada Yth. <strong>{{customerName}}</strong>,</p>
      <p>Kami ingin menginformasikan adanya gangguan pada layanan internet Anda.</p>
      
      <div class="alert-box">
        <p style="margin: 5px 0;"><strong>ID Pelanggan:</strong> {{customerId}}</p>
        <p style="margin: 5px 0;"><strong>Jenis Gangguan:</strong> {{issueType}}</p>
        <p style="margin: 5px 0;"><strong>Username:</strong> {{username}}</p>
        <p style="margin: 5px 0;"><strong>Deskripsi:</strong> {{description}}</p>
        <p style="margin: 5px 0;"><strong>Estimasi Pemulihan:</strong> {{estimatedTime}}</p>
        <p style="margin: 5px 0;"><strong>Area Terdampak:</strong> {{affectedArea}}</p>
      </div>
      
      <p>Tim teknis kami sedang bekerja untuk menyelesaikan masalah ini sesegera mungkin. Kami mohon maaf atas ketidaknyamanan yang ditimbulkan.</p>
      
      <p>Untuk informasi lebih lanjut, silakan hubungi kami.</p>
      
      <p style="margin-top: 30px;">Hormat kami,<br><strong>{{companyName}}</strong></p>
    </div>
    <div class="footer">
      <p>📞 Hubungi kami: {{companyPhone}}</p>
      <p>Email otomatis, mohon tidak membalas.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    name: 'Perbaikan Selesai',
    type: 'maintenance-resolved',
    subject: '✅ Perbaikan Selesai - Layanan Kembali Normal',
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f7f9; }
    .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px 20px; text-align: center; color: white; }
    .content { padding: 30px 20px; }
    .success-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .info-box { background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .steps { background: #f0fdf4; padding: 15px; border-radius: 6px; margin: 20px 0; }
    .steps ol { margin: 10px 0; padding-left: 20px; }
    .steps li { margin: 8px 0; line-height: 1.6; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">✅ Perbaikan Selesai</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Layanan Kembali Normal</p>
    </div>
    <div class="content">
      <p>Kepada Yth. <strong>{{customerName}}</strong>,</p>
      <p>Kabar baik! Gangguan jaringan di area Anda telah berhasil diatasi dan layanan internet sudah kembali normal.</p>
      
      <div class="success-box">
        <p style="margin: 5px 0; font-size: 18px; font-weight: bold; color: #065f46;">🎉 Status: NORMAL</p>
        <p style="margin: 5px 0; color: #047857;">🚀 Internet: AKTIF</p>
        <p style="margin: 5px 0; color: #047857;">⏰ Update: Sekarang</p>
      </div>
      
      <div class="info-box">
        <p style="margin: 5px 0;"><strong>ID Pelanggan:</strong> {{customerId}}</p>
        <p style="margin: 5px 0;"><strong>Username:</strong> {{username}}</p>
        <p style="margin: 5px 0;"><strong>Informasi:</strong> {{description}}</p>
      </div>
      
      <p>Terima kasih atas kesabaran dan pengertian Anda selama proses perbaikan. Kami mohon maaf atas ketidaknyamanan yang ditimbulkan.</p>
      
      <div class="steps">
        <p style="margin: 0 0 10px 0; font-weight: bold; color: #065f46;">💡 Jika masih mengalami kendala, silakan:</p>
        <ol>
          <li>Restart perangkat/router Anda</li>
          <li>Reconnect ke internet</li>
          <li>Hubungi kami jika masalah berlanjut</li>
        </ol>
      </div>
      
      <p style="background: #dbeafe; padding: 12px; border-radius: 6px; border-left: 4px solid #3b82f6; margin: 20px 0;">
        📞 <strong>Customer Service:</strong> {{companyPhone}}<br>
        <span style="font-size: 14px;">Kami siap membantu 24/7</span>
      </p>
      
      <p style="text-align: center; font-size: 18px; color: #059669; font-weight: bold; margin: 30px 0;">
        Selamat berselancar kembali! 🌐
      </p>
      
      <p style="margin-top: 30px;">Hormat kami,<br><strong>{{companyName}}</strong></p>
    </div>
    <div class="footer">
      <p>📞 Hubungi kami: {{companyPhone}}</p>
      <p>Email otomatis, mohon tidak membalas.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    name: 'Pembelian Voucher',
    type: 'voucher-purchase',
    subject: '🎫 Voucher Internet Anda - {{profileName}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f7f9; }
    .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px 20px; text-align: center; color: white; }
    .content { padding: 30px 20px; }
    .voucher-box { background: #d1fae5; border: 2px dashed #10b981; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center; }
    .voucher-code { font-size: 24px; font-weight: bold; color: #065f46; letter-spacing: 2px; margin: 10px 0; font-family: 'Courier New', monospace; }
    .info-box { background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
    .highlight { background: #fef08a; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">🎫 Voucher Internet Anda</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Terima kasih atas pembelian Anda!</p>
    </div>
    <div class="content">
      <p>Kepada Yth. <strong>{{customerName}}</strong>,</p>
      <p>Terima kasih telah membeli voucher internet. Berikut adalah detail voucher Anda:</p>
      
      <div class="voucher-box">
        <p style="margin: 5px 0; font-size: 14px; color: #065f46;">KODE VOUCHER</p>
        <div class="voucher-code">{{voucherCodes}}</div>
        <p style="margin: 10px 0 5px 0; font-size: 12px; color: #059669;">Simpan kode ini dengan aman</p>
      </div>
      
      <div class="info-box">
        <p style="margin: 5px 0;"><strong>ID Pelanggan:</strong> {{customerId}}</p>
        <p style="margin: 5px 0;"><strong>Nama:</strong> {{customerName}}</p>
        <p style="margin: 5px 0;"><strong>No. HP:</strong> {{phone}}</p>
        <p style="margin: 5px 0;"><strong>Paket:</strong> {{profileName}}</p>
        <p style="margin: 5px 0;"><strong>Durasi:</strong> {{duration}}</p>
        <p style="margin: 5px 0;"><strong>Harga per Voucher:</strong> {{price}}</p>
        <p style="margin: 5px 0;"><strong>Jumlah:</strong> {{quantity}} voucher</p>
        <p style="margin: 5px 0;"><strong>Total Pembayaran:</strong> <span class="highlight">{{totalAmount}}</span></p>
        <p style="margin: 5px 0;"><strong>Tanggal Pembelian:</strong> {{purchaseDate}}</p>
        <p style="margin: 5px 0;"><strong>Berlaku Hingga:</strong> {{expiryDate}}</p>
      </div>
      
      <h3 style="color: #065f46; margin-top: 30px;">📝 Cara Menggunakan Voucher:</h3>
      <ol style="line-height: 1.8;">
        <li>Hubungkan perangkat Anda ke WiFi <strong>{{companyName}}</strong></li>
        <li>Buka browser dan tunggu halaman login muncul</li>
        <li>Masukkan kode voucher di atas</li>
        <li>Klik "Login" dan mulai browsing!</li>
      </ol>
      
      <p style="background: #fef3c7; padding: 12px; border-radius: 6px; border-left: 4px solid #f59e0b; margin: 20px 0;">
        ⚠️ <strong>Penting:</strong> Voucher ini bersifat pribadi. Jangan bagikan kode voucher Anda kepada orang lain untuk menghindari penyalahgunaan.
      </p>
      
      <p>Jika Anda mengalami kesulitan dalam menggunakan voucher atau memiliki pertanyaan, jangan ragu untuk menghubungi kami.</p>
      
      <p style="margin-top: 30px;">Hormat kami,<br><strong>{{companyName}}</strong></p>
    </div>
    <div class="footer">
      <p>📞 Hubungi kami: {{companyPhone}}</p>
      <p>Email otomatis, mohon tidak membalas.</p>
    </div>
  </div>
</body>
</html>`,
  },
  {
    name: 'Link Pembayaran Voucher',
    type: 'voucher-payment-link',
    subject: '💳 Link Pembayaran Voucher - {{profileName}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f7f9; }
    .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px 20px; text-align: center; color: white; }
    .content { padding: 30px 20px; }
    .order-box { background: #dbeafe; border: 2px solid #3b82f6; padding: 20px; margin: 20px 0; border-radius: 8px; }
    .order-token { font-size: 20px; font-weight: bold; color: #1e40af; letter-spacing: 1px; margin: 10px 0; font-family: 'Courier New', monospace; text-align: center; }
    .info-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .button { display: inline-block; background: #3b82f6; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; font-size: 16px; }
    .button:hover { background: #2563eb; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
    .highlight { background: #fef08a; padding: 2px 6px; border-radius: 3px; font-weight: bold; }
    .warning-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .steps { background: #f0fdf4; padding: 15px; border-radius: 6px; margin: 20px 0; }
    .steps ol { margin: 10px 0; padding-left: 20px; }
    .steps li { margin: 8px 0; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">💳 Link Pembayaran Voucher</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Selesaikan pembayaran untuk mendapatkan voucher</p>
    </div>
    <div class="content">
      <p>Kepada Yth. <strong>{{customerName}}</strong>,</p>
      <p>Terima kasih telah melakukan pemesanan voucher internet. Silakan lakukan pembayaran untuk mendapatkan kode voucher Anda.</p>
      
      <div class="order-box">
        <p style="margin: 5px 0; font-size: 14px; color: #1e40af; text-align: center;">TOKEN PESANAN</p>
        <div class="order-token">{{orderToken}}</div>
        <p style="margin: 10px 0 5px 0; font-size: 12px; color: #2563eb; text-align: center;">Simpan token ini untuk cek status</p>
      </div>
      
      <div class="info-box">
        <p style="margin: 5px 0;"><strong>ID Pelanggan:</strong> {{customerId}}</p>
        <p style="margin: 5px 0;"><strong>Nama:</strong> {{customerName}}</p>
        <p style="margin: 5px 0;"><strong>No. HP:</strong> {{phone}}</p>
        <p style="margin: 5px 0;"><strong>Paket Voucher:</strong> {{profileName}}</p>
        <p style="margin: 5px 0;"><strong>Harga per Voucher:</strong> {{price}}</p>
        <p style="margin: 5px 0;"><strong>Jumlah:</strong> {{quantity}} voucher</p>
        <p style="margin: 5px 0;"><strong>Total Pembayaran:</strong> <span class="highlight">{{totalAmount}}</span></p>
        <p style="margin: 5px 0;"><strong>Batas Waktu:</strong> <span style="color: #dc2626; font-weight: bold;">{{expiryTime}}</span></p>
      </div>
      
      <div style="text-align: center;">
        <a href="{{paymentLink}}" class="button" style="color: white;">💳 BAYAR SEKARANG</a>
      </div>
      
      <div class="steps">
        <h3 style="color: #065f46; margin-top: 0;">📝 Cara Pembayaran:</h3>
        <ol>
          <li>Klik tombol "BAYAR SEKARANG" di atas</li>
          <li>Pilih metode pembayaran (Transfer Bank, QRIS, E-Wallet, dll)</li>
          <li>Selesaikan pembayaran sebelum batas waktu</li>
          <li>Kode voucher akan dikirim otomatis via WhatsApp & Email</li>
        </ol>
      </div>
      
      <div class="warning-box">
        ⚠️ <strong>Penting:</strong>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>Pembayaran harus selesai sebelum <strong>{{expiryTime}}</strong></li>
          <li>Pastikan nominal transfer sesuai dengan total pembayaran</li>
          <li>Voucher akan dikirim otomatis setelah pembayaran dikonfirmasi</li>
          <li>Pembayaran yang sudah masuk tidak dapat dibatalkan atau dikembalikan</li>
          <li>Link pembayaran hanya berlaku untuk 1x transaksi</li>
        </ul>
      </div>
      
      <p style="background: #dbeafe; padding: 12px; border-radius: 6px; border-left: 4px solid #3b82f6; margin: 20px 0;">
        💡 <strong>Tips:</strong> Gunakan metode pembayaran yang tercepat agar voucher segera Anda terima. QRIS dan E-Wallet biasanya diproses instan!
      </p>
      
      <p>Jika Anda mengalami kesulitan dalam melakukan pembayaran atau memiliki pertanyaan, jangan ragu untuk menghubungi kami.</p>
      
      <p style="margin-top: 30px;">Hormat kami,<br><strong>{{companyName}}</strong></p>
    </div>
    <div class="footer">
      <p>📞 Hubungi kami: {{companyPhone}}</p>
      <p>Email otomatis, mohon tidak membalas.</p>
    </div>
  </div>
</body>
</html>`,
  }
];

// GET - List all email templates (auto-seed if empty)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let templates = await prisma.emailTemplate.findMany({
      orderBy: { createdAt: 'asc' },
    });

    // Auto-seed default templates if none exist
    if (templates.length === 0) {
      console.log('[Email Templates] No templates found, creating defaults...');
      
      for (const defaultTemplate of defaultTemplates) {
        await prisma.emailTemplate.create({
          data: {
            name: defaultTemplate.name,
            type: defaultTemplate.type,
            subject: defaultTemplate.subject,
            htmlBody: defaultTemplate.htmlBody,
            isActive: true,
          },
        });
      }
      
      // Fetch again after seeding
      templates = await prisma.emailTemplate.findMany({
        orderBy: { createdAt: 'asc' },
      });
      
      console.log(`[Email Templates] ✅ Created ${templates.length} default templates`);
    } else {
      // Check for missing templates and add them
      const existingTypes = templates.map(t => t.type);
      const missingTemplates = defaultTemplates.filter(dt => !existingTypes.includes(dt.type));
      
      if (missingTemplates.length > 0) {
        console.log(`[Email Templates] Adding ${missingTemplates.length} missing templates...`);
        
        for (const missingTemplate of missingTemplates) {
          await prisma.emailTemplate.create({
            data: {
              name: missingTemplate.name,
              type: missingTemplate.type,
              subject: missingTemplate.subject,
              htmlBody: missingTemplate.htmlBody,
              isActive: true,
            },
          });
        }
        
        // Fetch again after adding missing templates
        templates = await prisma.emailTemplate.findMany({
          orderBy: { createdAt: 'asc' },
        });
        
        console.log(`[Email Templates] ✅ Added missing templates: ${missingTemplates.map(t => t.type).join(', ')}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: templates,
    });
  } catch (error: any) {
    console.error('Get email templates error:', error);
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
    const { name, type, subject, htmlBody, isActive } = body;

    if (!name || !type || !subject || !htmlBody) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const template = await prisma.emailTemplate.create({
      data: {
        name,
        type,
        subject,
        htmlBody,
        isActive: isActive ?? true,
      },
    });

    return NextResponse.json({
      success: true,
      data: template,
    });
  } catch (error: any) {
    console.error('Create email template error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create template' },
      { status: 500 }
    );
  }
}
