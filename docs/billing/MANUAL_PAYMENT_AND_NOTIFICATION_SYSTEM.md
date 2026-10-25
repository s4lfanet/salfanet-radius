# Manual Payment & Notification System

Sistem ini menangani alur pembayaran manual di mana customer melakukan upload bukti pembayaran dan admin melakukan review.

## Overview

Alur lengkap:
1. Customer memilih invoice yang ingin dibayar
2. Customer memilih metode pembayaran "Manual"
3. Customer upload bukti transfer
4. Admin menerima notifikasi (WhatsApp & Email)
5. Admin review bukti pembayaran
6. Admin approve atau reject
7. Customer menerima notifikasi hasil review

## Features

### 1. Customer Side

#### a. Payment Page
- **URL**: `/payment/{invoiceNumber}`
- Customer dapat melihat detail invoice
- Pilihan metode pembayaran:
  - Payment Gateway (Midtrans/Xendit/etc)
  - Manual Payment

#### b. Manual Payment Form
- Upload bukti transfer (image)
- Nama pengirim
- Bank pengirim
- Nomor rekening pengirim
- Catatan (optional)
- Preview image sebelum submit

#### c. Thank You Page
- Konfirmasi bukti sudah diupload
- Informasi bahwa pembayaran sedang direview
- Estimasi waktu review

### 2. Admin Side

#### a. Review Page
- **URL**: `/admin/payments/review`
- Table semua pembayaran dengan status MANUAL_REVIEW
- Detail:
  - Customer info
  - Invoice info
  - Bukti transfer (full size preview)
  - Bank pengirim dan nama
- Actions:
  - Approve: Update status ke PAID, extend user expiry
  - Reject: Update status ke REJECTED, tambah catatan alasan

#### b. Notification to Admin
Ketika customer upload bukti:
- **WhatsApp**: Kirim ke admin dengan detail pembayaran
- **Email**: Kirim ke admin dengan attachment bukti

### 3. Notification System

#### a. Admin Notification (New Manual Payment)
**Trigger**: Saat customer upload bukti pembayaran

**WhatsApp Template**:
```
🔔 *NOTIFIKASI PEMBAYARAN MANUAL*

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

⏰ Waktu: {{uploadTime}}

🔗 Review: {{reviewLink}}

⚠️ Silakan cek dan verifikasi pembayaran ini.
```

**Email Template**:
- Subject: "[REVIEW NEEDED] Pembayaran Manual - {invoiceNumber}"
- Body: Detail pembayaran dengan attachment bukti

#### b. Customer Notification (Payment Approved)
**Trigger**: Saat admin approve pembayaran

**WhatsApp Template**:
```
✅ *PEMBAYARAN DIKONFIRMASI*

Halo {{customerName}},

Terima kasih! Pembayaran Anda telah kami konfirmasi.

📋 *Detail*
━━━━━━━━━━━━━━━━━━━━
📌 Invoice: {{invoiceNumber}}
💰 Jumlah: {{amount}}
✅ Status: LUNAS
📅 Aktif hingga: {{newExpiry}}

Layanan Anda telah diperpanjang.

Terima kasih telah menjadi pelanggan setia kami! 🙏

{{companyName}}
```

#### c. Customer Notification (Payment Rejected)
**Trigger**: Saat admin reject pembayaran

**WhatsApp Template**:
```
❌ *PEMBAYARAN DITOLAK*

Halo {{customerName}},

Mohon maaf, pembayaran Anda tidak dapat kami proses.

📋 *Detail*
━━━━━━━━━━━━━━━━━━━━
📌 Invoice: {{invoiceNumber}}
💰 Jumlah: {{amount}}
❌ Status: Ditolak
📝 Alasan: {{rejectionReason}}

Silakan lakukan pembayaran ulang atau hubungi kami jika ada pertanyaan.

{{companyName}}
📞 {{companyPhone}}
```

## API Endpoints

Pembayaran manual disimpan di tabel `manualPayment` (status `PENDING`, `APPROVED`, `REJECTED`). Ada dua jalur masuk: pelanggan mengunggah sendiri dari portal atau aplikasi, atau admin mencatatkan atas nama pelanggan.

### 1. Pelanggan mengunggah bukti
**Endpoint**: `POST /api/customer/invoices/{invoiceId}/manual-payment` (token pelanggan)

Hanya untuk tagihan milik pelanggan itu yang belum lunas. Bila sudah ada bukti `PENDING` untuk tagihan yang sama, jawabannya 409 ("Bukti transfer sudah dikirim dan sedang menunggu konfirmasi admin").

### 2. Admin mencatat pembayaran manual
**Endpoint**: `POST /api/manual-payments` (izin `invoices.create`)

**Request**:
```json
{
  "invoiceId": "…",
  "userId": "…",
  "amount": 150000,
  "bankName": "BCA",
  "accountNumber": "1234567890",
  "accountName": "John Doe",
  "paymentDate": "2026-10-20",
  "receiptImage": "/uploads/…",
  "notes": "Transfer dari rekening istri"
}
```
`invoiceId`, `userId`, `amount`, `bankName`, `accountName`, `paymentDate`, dan `receiptImage` wajib; selain itu jawabannya 400.

### 3. Daftar dan detail
- `GET /api/manual-payments` memuat daftar pembayaran manual untuk ditinjau
- `GET /api/manual-payments/{id}` memuat detailnya

### 4. Setujui atau tolak
**Endpoint**: `PATCH /api/manual-payments/{id}` (izin `invoices.edit`)

```json
{ "action": "APPROVE" }
```
```json
{ "action": "REJECT", "rejectionReason": "Bukti tidak jelas, nominal tidak sesuai" }
```
`action` adalah `APPROVE` atau `REJECT` (huruf besar atau kecil). Alasan penolakan wajib. Menyetujui menandai invoice lunas, memperpanjang masa aktif, mengaktifkan kembali pelanggan yang terisolir, dan mengirim notifikasi lewat WhatsApp serta push.

### 5. Hapus
`DELETE /api/manual-payments/{id}` menghapus catatan pembayaran manual.

## Database Schema

### ManualPayment Table
```sql
CREATE TABLE manual_payments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  invoice_id INT NOT NULL,
  proof_image_url VARCHAR(255) NOT NULL,
  sender_name VARCHAR(100) NOT NULL,
  sender_bank VARCHAR(50) NOT NULL,
  sender_account VARCHAR(50) NOT NULL,
  notes TEXT,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
  rejection_reason TEXT,
  reviewed_by INT,
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);
```

## Template Variables

### Admin Notification Template
| Variable | Description |
|----------|-------------|
| `{{invoiceNumber}}` | Nomor invoice |
| `{{customerName}}` | Nama pelanggan |
| `{{customerId}}` | ID pelanggan |
| `{{amount}}` | Jumlah pembayaran (formatted) |
| `{{senderBank}}` | Bank pengirim |
| `{{senderName}}` | Nama pengirim |
| `{{senderAccount}}` | Nomor rekening pengirim |
| `{{notes}}` | Catatan dari customer |
| `{{uploadTime}}` | Waktu upload bukti |
| `{{reviewLink}}` | Link ke halaman review |

### Customer Approved Template
| Variable | Description |
|----------|-------------|
| `{{customerName}}` | Nama pelanggan |
| `{{invoiceNumber}}` | Nomor invoice |
| `{{amount}}` | Jumlah pembayaran (formatted) |
| `{{newExpiry}}` | Tanggal expired baru |
| `{{companyName}}` | Nama perusahaan |

### Customer Rejected Template
| Variable | Description |
|----------|-------------|
| `{{customerName}}` | Nama pelanggan |
| `{{invoiceNumber}}` | Nomor invoice |
| `{{amount}}` | Jumlah pembayaran (formatted) |
| `{{rejectionReason}}` | Alasan penolakan |
| `{{companyName}}` | Nama perusahaan |
| `{{companyPhone}}` | Nomor telepon perusahaan |

## Implementation Notes

### 1. Image Upload
- Format: JPEG, PNG
- Max size: 5MB
- Storage: Local `/public/uploads/proofs/` atau S3
- Generate unique filename

### 2. Notification Priority
- WhatsApp dikirim terlebih dahulu
- Email sebagai backup/record

### 3. Security
- Validate image before save
- Admin-only access untuk review page
- Rate limiting untuk upload

### 4. Mobile Responsiveness
- Upload form mobile-friendly
- Review page responsive

## Testing Checklist

- [ ] Customer dapat upload bukti dengan berbagai format image
- [ ] Admin menerima WhatsApp notifikasi
- [ ] Admin menerima Email notifikasi
- [ ] Admin dapat approve pembayaran
- [ ] Customer menerima notifikasi approved
- [ ] User expiry terupdate setelah approved
- [ ] Admin dapat reject dengan alasan
- [ ] Customer menerima notifikasi rejected
