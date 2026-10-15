/**
 * Built-in texts for e-voucher order messages. Used to seed new installs,
 * by the "missing template" auto-create in the admin template pages, and as
 * the fallback when an install has no template of that type at all.
 *
 * Every placeholder here is one that voucherOrderVariables() fills in.
 * No imports: the Prisma seed scripts load this file directly.
 */

export const VOUCHER_ORDER_TTL_HOURS = 24;

/** Variables filled for every e-voucher message, for the admin template pages. */
export const VOUCHER_ORDER_VARIABLES = [
  '{{customerName}}', '{{phone}}', '{{email}}', '{{orderNumber}}', '{{profileName}}',
  '{{duration}}', '{{quantity}}', '{{price}}', '{{totalAmount}}', '{{paymentLink}}',
  '{{expiryTime}}', '{{voucherCodes}}', '{{purchaseDate}}', '{{companyName}}',
  '{{companyPhone}}', '{{companyEmail}}', '{{companyAddress}}',
];

export const WA_VOUCHER_PAYMENT_LINK = `Halo {{customerName}},

Pesanan voucher internet Anda sudah kami terima.

No. pesanan: {{orderNumber}}
Paket: {{profileName}} ({{duration}})
Jumlah: {{quantity}} voucher
Total: *{{totalAmount}}*

Bayar lewat link ini:
{{paymentLink}}

Link berlaku sampai {{expiryTime}}. Kode voucher kami kirim ke nomor ini setelah pembayaran masuk.

{{companyName}}
{{companyPhone}}`;

export const WA_VOUCHER_PURCHASE_SUCCESS = `Halo {{customerName}},

Pembayaran pesanan {{orderNumber}} sudah kami terima. Ini kode voucher Anda:

*{{voucherCodes}}*

Paket: {{profileName}}
Masa aktif: {{duration}}, dihitung sejak pertama login
Total dibayar: {{totalAmount}}

Cara pakai:
1. Sambungkan HP atau laptop ke WiFi hotspot kami.
2. Tunggu halaman login muncul. Kalau tidak muncul, buka browser.
3. Masukkan kode voucher, lalu tekan Login.

Simpan pesan ini. Kode juga bisa dilihat lagi di:
{{paymentLink}}

Butuh bantuan? Hubungi {{companyPhone}}.
{{companyName}}`;

const emailShell = (title: string, body: string) => `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #d1d5db;border-radius:8px;">
    <tr><td style="padding:24px 24px 8px;">
      <p style="margin:0 0 4px;font-size:13px;color:#4b5563;">{{companyName}}</p>
      <h1 style="margin:0;font-size:20px;line-height:1.3;color:#111827;">${title}</h1>
    </td></tr>
    <tr><td style="padding:8px 24px 24px;font-size:14px;line-height:1.6;">
${body}
    </td></tr>
    <tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#4b5563;">
      Butuh bantuan? Hubungi {{companyPhone}}.<br>{{companyName}}
    </td></tr>
  </table>
</body>
</html>`;

const orderTable = `      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px;">
        <tr><td style="padding:4px 0;color:#4b5563;">No. pesanan</td><td style="padding:4px 0;text-align:right;">{{orderNumber}}</td></tr>
        <tr><td style="padding:4px 0;color:#4b5563;">Paket</td><td style="padding:4px 0;text-align:right;">{{profileName}}</td></tr>
        <tr><td style="padding:4px 0;color:#4b5563;">Masa aktif</td><td style="padding:4px 0;text-align:right;">{{duration}}</td></tr>
        <tr><td style="padding:4px 0;color:#4b5563;">Jumlah</td><td style="padding:4px 0;text-align:right;">{{quantity}} voucher</td></tr>
        <tr><td style="padding:8px 0 4px;border-top:1px solid #e5e7eb;font-weight:bold;">Total</td><td style="padding:8px 0 4px;border-top:1px solid #e5e7eb;text-align:right;font-weight:bold;">{{totalAmount}}</td></tr>
      </table>`;

export const EMAIL_VOUCHER_PAYMENT_LINK = {
  subject: 'Selesaikan pembayaran voucher {{orderNumber}}',
  htmlBody: emailShell('Pesanan voucher Anda menunggu pembayaran', `      <p style="margin:0 0 8px;">Halo {{customerName}},</p>
      <p style="margin:0;">Pesanan voucher internet Anda sudah kami terima.</p>
${orderTable}
      <p style="margin:0 0 16px;"><a href="{{paymentLink}}" style="display:inline-block;padding:12px 20px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">Bayar {{totalAmount}}</a></p>
      <p style="margin:0;color:#4b5563;">Link berlaku sampai {{expiryTime}}. Kode voucher kami kirim ke email ini setelah pembayaran masuk.</p>`),
};

export const EMAIL_VOUCHER_PURCHASE = {
  subject: 'Kode voucher {{profileName}} untuk pesanan {{orderNumber}}',
  htmlBody: emailShell('Pembayaran diterima, ini kode voucher Anda', `      <p style="margin:0 0 8px;">Halo {{customerName}},</p>
      <p style="margin:0 0 12px;">Pembayaran pesanan {{orderNumber}} sudah kami terima.</p>
      <div style="margin:0 0 16px;padding:16px;border:1px solid #99f6e4;background:#f0fdfa;border-radius:6px;text-align:center;font-family:'Courier New',monospace;font-size:22px;font-weight:bold;letter-spacing:2px;color:#115e59;">{{voucherCodes}}</div>
${orderTable}
      <p style="margin:0 0 4px;font-weight:bold;">Cara pakai</p>
      <ol style="margin:0 0 16px;padding-left:20px;">
        <li>Sambungkan HP atau laptop ke WiFi hotspot kami.</li>
        <li>Tunggu halaman login muncul. Kalau tidak muncul, buka browser.</li>
        <li>Masukkan kode voucher, lalu tekan Login.</li>
      </ol>
      <p style="margin:0;color:#4b5563;">Masa aktif dihitung sejak pertama login. Kode juga bisa dilihat lagi di <a href="{{paymentLink}}" style="color:#0f766e;">halaman pesanan Anda</a>.</p>`),
};
