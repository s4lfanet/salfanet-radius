import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function seedInvoiceOverdueTemplates() {
  console.log('Creating/updating invoice overdue reminder templates...')

  // WhatsApp Template - Invoice Overdue Reminder
  await prisma.whatsapp_templates.upsert({
    where: { type: 'invoice-overdue' },
    update: {
      name: 'Invoice Overdue Reminder',
      message: `Halo *{{customerName}}* 👋

⚠️ *PEMBERITAHUAN KETERLAMBATAN PEMBAYARAN*

Invoice Anda sudah melewati tanggal jatuh tempo:

📋 No. Invoice: *{{invoiceNumber}}*
� Username: *{{username}}*
📦 Paket: *{{profileName}}*
📍 Area: *{{area}}*
💰 Total Tagihan: *{{amount}}*
📅 Jatuh Tempo: *{{dueDate}}*
⏰ Terlambat: *{{daysOverdue}} hari*

⚠️ *Layanan Anda mungkin akan diisolir jika tidak segera melakukan pembayaran.*

Silakan lakukan pembayaran melalui:
{{paymentLink}}

{{bankAccounts}}

Jika sudah melakukan pembayaran, mohon abaikan pesan ini.

Butuh bantuan? Hubungi kami di:
📞 {{companyPhone}}

Terima kasih,
*{{companyName}}*`,
      updatedAt: new Date(),
    },
    create: {
      id: 'invoice-overdue-wa',
      type: 'invoice-overdue',
      name: 'Invoice Overdue Reminder',
      message: `Halo *{{customerName}}* 👋

⚠️ *PEMBERITAHUAN KETERLAMBATAN PEMBAYARAN*

Invoice Anda sudah melewati tanggal jatuh tempo:

📋 No. Invoice: *{{invoiceNumber}}*
👤 Username: *{{username}}*
📦 Paket: *{{profileName}}*
📍 Area: *{{area}}*
💰 Total Tagihan: *{{amount}}*
📅 Jatuh Tempo: *{{dueDate}}*
⏰ Terlambat: *{{daysOverdue}} hari*

⚠️ *Layanan Anda mungkin akan diisolir jika tidak segera melakukan pembayaran.*

Silakan lakukan pembayaran melalui:
{{paymentLink}}

{{bankAccounts}}

Jika sudah melakukan pembayaran, mohon abaikan pesan ini.

Butuh bantuan? Hubungi kami di:
📞 {{companyPhone}}

Terima kasih,
*{{companyName}}*`,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })

  // Email Template - Invoice Overdue Reminder
  await prisma.emailTemplate.upsert({
    where: { type: 'invoice-overdue' },
    update: {
      name: 'Invoice Overdue Reminder',
      subject: '⚠️ Tagihan Terlambat - Invoice {{invoiceNumber}}',
      htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .content { padding: 30px; }
    .warning-badge { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .warning-badge strong { color: #92400e; display: block; margin-bottom: 5px; }
    .invoice-details { background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .invoice-details table { width: 100%; border-collapse: collapse; }
    .invoice-details td { padding: 8px 0; font-size: 14px; }
    .invoice-details td:first-child { color: #6b7280; width: 40%; }
    .invoice-details td:last-child { font-weight: 600; color: #111827; }
    .overdue-highlight { background-color: #fee2e2; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; }
    .overdue-highlight .days { font-size: 36px; font-weight: bold; color: #dc2626; margin: 5px 0; }
    .overdue-highlight .label { color: #7f1d1d; font-size: 14px; }
    .button { display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .footer { background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 5px 0; font-size: 13px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ TAGIHAN TERLAMBAT</h1>
    </div>
    
    <div class="content">
      <p>Halo <strong>{{customerName}}</strong>,</p>
      
      <div class="warning-badge">
        <strong>⚠️ Pemberitahuan Keterlambatan Pembayaran</strong>
        <p style="margin: 5px 0 0 0; color: #78350f;">Invoice Anda sudah melewati tanggal jatuh tempo. Mohon segera lakukan pembayaran untuk menghindari pemutusan layanan.</p>
      </div>

      <div class="overdue-highlight">
        <div class="label">Sudah Terlambat</div>
        <div class="days">{{daysOverdue}} Hari</div>
      </div>
      
      <div class="invoice-details">
        <table>
          <tr>
            <td>📋 No. Invoice</td>
            <td>{{invoiceNumber}}</td>
          </tr>
          <tr>
            <td>👤 Username</td>
            <td>{{username}}</td>
          </tr>
          <tr>
            <td>📦 Paket</td>
            <td>{{profileName}}</td>
          </tr>
          <tr>
            <td>📍 Area</td>
            <td>{{area}}</td>
          </tr>
          <tr>
            <td>💰 Total Tagihan</td>
            <td style="color: #dc2626; font-size: 18px;">{{amount}}</td>
          </tr>
          <tr>
            <td>📅 Tanggal Jatuh Tempo</td>
            <td style="color: #dc2626;">{{dueDate}}</td>
          </tr>
        </table>
      </div>

      <div class="warning-badge">
        <strong>⚠️ Peringatan</strong>
        <p style="margin: 5px 0 0 0; color: #78350f;">Layanan Anda mungkin akan diisolir jika tidak segera melakukan pembayaran. Mohon segera selesaikan pembayaran untuk melanjutkan layanan.</p>
      </div>

      <div style="text-align: center;">
        <a href="{{paymentLink}}" class="button">Bayar Sekarang</a>
      </div>

      {{bankAccounts}}

      <p style="margin-top: 20px; font-size: 13px; color: #6b7280;">
        Jika Anda sudah melakukan pembayaran, mohon abaikan pesan ini. Pembayaran Anda akan segera diverifikasi oleh sistem kami.
      </p>

      <p style="margin-top: 20px; font-size: 13px; color: #6b7280;">
        Butuh bantuan? Hubungi kami di <strong>{{companyPhone}}</strong>
      </p>
    </div>
    
    <div class="footer">
      <p><strong>{{companyName}}</strong></p>
      <p>📞 {{companyPhone}}</p>
      <p style="margin-top: 15px; color: #9ca3af; font-size: 11px;">
        Email ini dikirim secara otomatis. Mohon tidak membalas email ini.
      </p>
    </div>
  </div>
</body>
</html>`,
      updatedAt: new Date(),
    },
    create: {
      name: 'Invoice Overdue Reminder',
      type: 'invoice-overdue',
      subject: '⚠️ Tagihan Terlambat - Invoice {{invoiceNumber}}',
      htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .content { padding: 30px; }
    .warning-badge { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .warning-badge strong { color: #92400e; display: block; margin-bottom: 5px; }
    .invoice-details { background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .invoice-details table { width: 100%; border-collapse: collapse; }
    .invoice-details td { padding: 8px 0; font-size: 14px; }
    .invoice-details td:first-child { color: #6b7280; width: 40%; }
    .invoice-details td:last-child { font-weight: 600; color: #111827; }
    .overdue-highlight { background-color: #fee2e2; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; }
    .overdue-highlight .days { font-size: 36px; font-weight: bold; color: #dc2626; margin: 5px 0; }
    .overdue-highlight .label { color: #7f1d1d; font-size: 14px; }
    .button { display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .footer { background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 5px 0; font-size: 13px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ TAGIHAN TERLAMBAT</h1>
    </div>
    
    <div class="content">
      <p>Halo <strong>{{customerName}}</strong>,</p>
      
      <div class="warning-badge">
        <strong>⚠️ Pemberitahuan Keterlambatan Pembayaran</strong>
        <p style="margin: 5px 0 0 0; color: #78350f;">Invoice Anda sudah melewati tanggal jatuh tempo. Mohon segera lakukan pembayaran untuk menghindari pemutusan layanan.</p>
      </div>

      <div class="overdue-highlight">
        <div class="label">Sudah Terlambat</div>
        <div class="days">{{daysOverdue}} Hari</div>
      </div>
      
      <div class="invoice-details">
        <table>
          <tr>
            <td>📋 No. Invoice</td>
            <td>{{invoiceNumber}}</td>
          </tr>
          <tr>
            <td>👤 Username</td>
            <td>{{username}}</td>
          </tr>
          <tr>
            <td>📦 Paket</td>
            <td>{{profileName}}</td>
          </tr>
          <tr>
            <td>📍 Area</td>
            <td>{{area}}</td>
          </tr>
          <tr>
            <td>💰 Total Tagihan</td>
            <td style="color: #dc2626; font-size: 18px;">{{amount}}</td>
          </tr>
          <tr>
            <td>📅 Tanggal Jatuh Tempo</td>
            <td style="color: #dc2626;">{{dueDate}}</td>
          </tr>
        </table>
      </div>

      <div class="warning-badge">
        <strong>⚠️ Peringatan</strong>
        <p style="margin: 5px 0 0 0; color: #78350f;">Layanan Anda mungkin akan diisolir jika tidak segera melakukan pembayaran. Mohon segera selesaikan pembayaran untuk melanjutkan layanan.</p>
      </div>

      <div style="text-align: center;">
        <a href="{{paymentLink}}" class="button">Bayar Sekarang</a>
      </div>

      {{bankAccounts}}

      <p style="margin-top: 20px; font-size: 13px; color: #6b7280;">
        Jika Anda sudah melakukan pembayaran, mohon abaikan pesan ini. Pembayaran Anda akan segera diverifikasi oleh sistem kami.
      </p>

      <p style="margin-top: 20px; font-size: 13px; color: #6b7280;">
        Butuh bantuan? Hubungi kami di <strong>{{companyPhone}}</strong>
      </p>
    </div>
    
    <div class="footer">
      <p><strong>{{companyName}}</strong></p>
      <p>📞 {{companyPhone}}</p>
      <p style="margin-top: 15px; color: #9ca3af; font-size: 11px;">
        Email ini dikirim secara otomatis. Mohon tidak membalas email ini.
      </p>
    </div>
  </div>
</body>
</html>`,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })

  console.log('✅ Invoice overdue templates created/updated successfully')
}

// Run if called directly
if (require.main === module) {
  seedInvoiceOverdueTemplates()
    .catch((e) => {
      console.error('❌ Error:', e)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
