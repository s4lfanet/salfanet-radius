# Format Invoice Number Berdasarkan Tanggal

## Perubahan
Invoice number sekarang menggunakan format berdasarkan tanggal, bukan random code lagi.

## Format Baru

### Invoice Number
**Format:** `INV/YYYY/MM/DD/NNNN`
**Contoh:** `INV/2026/03/05/0001`, `INV/2026/03/05/0002`, dll.

- `YYYY` = Tahun (4 digit)
- `MM` = Bulan (2 digit dengan leading zero)
- `DD` = Tanggal (2 digit dengan leading zero)
- `NNNN` = Counter sequential per hari (4 digit dengan leading zero)

### Transaction ID
**Format:** `TRX-YYYYMMDD-HHMMSS-XXXX`
**Contoh:** `TRX-20251219-153045-1234`

- `YYYYMMDD` = Tanggal lengkap
- `HHMMSS` = Waktu lengkap
- `XXXX` = Random 4 digit untuk uniqueness

### Category ID
**Format:** `CAT-YYYYMMDD-HHMMSS`
**Contoh:** `CAT-20251219-153045`

### Invoice ID (Database)
**Format:** `inv-YYYYMMDD-HHMMSS-XXXX`
**Contoh:** `inv-20251219-153045-1234`

## File yang Diupdate

1. **src/lib/invoice-generator.ts** (BARU)
   - `generateInvoiceNumber()` - Generate invoice number dengan format INV/YYYY/MM/DD/NNNN
   - `generateTransactionId()` - Generate transaction ID dengan timestamp
   - `generateCategoryId()` - Generate category ID dengan timestamp
   - `generateInvoiceId()` - Generate invoice database ID dengan timestamp

2. **src/app/api/pppoe/users/[id]/extend/route.ts**
   - Update dari: `INV-${Date.now()}-${random}` 
   - Ke: `INV/2026/03/05/0001` (dengan counter per bulan)
   
3. **src/app/api/pppoe/users/[id]/mark-paid/route.ts**
   - Update transaction ID dan category ID ke format berdasarkan tanggal
   
4. **src/app/api/manual-payments/[id]/route.ts**
   - Update payment ID ke format berdasarkan tanggal

## Auto-generate Invoice
File **src/app/api/invoices/generate/route.ts** sudah menggunakan format yang benar sejak awal, tidak perlu diubah.

## Testing

### 1. Test Perpanjangan Manual (Extend)
```
1. Login ke admin panel
2. Ke menu PPPoE Users
3. Pilih user, klik "Perpanjang"
4. Cek invoice number di notifikasi WhatsApp/Email
5. Expected: INV/2026/03/05/0001, INV/2026/03/05/0002, dst.
```

### 2. Test Manual Payment
```
1. User upload bukti pembayaran manual
2. Admin approve payment
3. Cek invoice number di notifikasi
4. Expected: Format INV/YYYY/MM/DD/NNNN (contoh: INV/2026/03/05/0001)
```

### 3. Test Auto Generate Invoice
```
1. Tunggu job `invoice_generate` (07:00) atau jalankan manual dari Settings, Cron (`POST /api/cron` dengan `{"type":"invoice_generate"}`)
2. Cek invoice yang di-generate
3. Expected: Sequential per bulan (INV/2026/03/05/0001, 0002, dst.)
```

### 4. Test Counter Reset di Bulan Baru
```
1. Tunggu sampai bulan berikutnya (Januari 2026)
2. Generate invoice baru
3. Expected: INV/2026/04/01/0001 (counter reset ke 0001)
```

## Database Query Testing

### Cek Invoice Number Format
```sql
SELECT invoiceNumber, createdAt 
FROM invoice 
ORDER BY createdAt DESC 
LIMIT 10;
```

### Cek Invoice per Bulan
```sql
SELECT 
  DATE_FORMAT(createdAt, '%Y-%m') as bulan,
  COUNT(*) as jumlah_invoice,
  MIN(invoiceNumber) as invoice_pertama,
  MAX(invoiceNumber) as invoice_terakhir
FROM invoice 
WHERE invoiceNumber LIKE 'INV%'
GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
ORDER BY bulan DESC;
```

### Cek Transaction ID Format
```sql
SELECT id, description, createdAt 
FROM transaction 
WHERE id LIKE 'TRX-%' 
ORDER BY createdAt DESC 
LIMIT 10;
```

## Keuntungan Format Baru

1. **Mudah Dibaca**: Invoice number langsung terlihat bulan pembuatannya
2. **Sequential**: Counter berurutan per hari, mudah tracking
3. **Konsisten**: Semua API menggunakan format yang sama
4. **Tidak Duplikat**: Counter otomatis increment dari database
5. **Professional**: Format standar invoice bisnis (INV/YYYY/MM/DD/NNNN)

## Backward Compatibility

- Invoice lama dengan format `INV-1766139060741-4rf3z6r0j` tetap valid di database
- Tidak ada perubahan pada invoice yang sudah ada
- Hanya invoice baru yang akan menggunakan format tanggal

## Deployment ke VPS

```bash
# 1. Pull latest changes
git pull origin main

# 2. Build
npm run build

# 3. Restart PM2
pm2 restart salfanet-backend

# 4. Test perpanjangan manual untuk verifikasi format baru
```

## Troubleshooting

### Invoice Number Duplikat
Jika terjadi duplikat (sangat jarang karena menggunakan database count):
- Fungsi `generateInvoiceNumber()` akan otomatis increment
- Database akan reject jika ada duplikat (invoiceNumber adalah unique)

### Counter Tidak Sequential
Jika ada gap dalam numbering (misal: 0001, 0003, 0005):
- Ini normal jika ada invoice yang di-delete atau failed transaction
- Counter tetap naik berdasarkan COUNT() dari database

### Format Lama Masih Muncul
- Clear cache: `npm run build`
- Restart PM2: `pm2 restart salfanet-backend`
- Cek import statement di file API route

