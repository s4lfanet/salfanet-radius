# Laporan & Analitik — Panduan Fitur

> Versi: 2.10.25 | Menu: **Laporan → Data & Export** dan **Laporan → Analitik Advanced**

---

## Ringkasan

Modul **Laporan** menyediakan ekspor dan preview data operasional ISP dalam format Excel dan PDF. Admin dapat memfilter data berdasarkan rentang tanggal dan status, melihat ringkasan statistik, lalu mengunduh laporan.

---

## Akses Menu

Tambahkan di sidebar `/admin/` melalui menu group **Laporan**:

| Menu | Path | Permission |
|---|---|---|
| Data & Export | `/admin/laporan` | `reports.view` |
| Analitik Advanced | `/admin/laporan/analitik` | `reports.view` |

---

## Tipe Laporan

### 1. Laporan Invoice

Laporan semua invoice dalam periode tertentu.

**Filter tersedia:**
- Rentang tanggal (berdasarkan `createdAt` invoice)
- Status: Semua / Lunas (`PAID`) / Menunggu (`PENDING`) / Jatuh Tempo (`OVERDUE`) / Dibatalkan (`CANCELLED`)

**Kolom data:**

| Kolom | Sumber Field |
|---|---|
| No. Invoice | `invoice.invoiceNumber` |
| Nama Pelanggan | `invoice.customerName` |
| Username | `invoice.customerUsername` |
| Telepon | `invoice.customerPhone` |
| Jumlah | `invoice.amount` (angka) |
| Jumlah (Rp) | `invoice.amount` (format Rupiah) |
| Status | `invoice.status` |
| Jenis | `invoice.invoiceType` |
| Jatuh Tempo | `invoice.dueDate` |
| Dibayar | `invoice.paidAt` |
| Dibuat | `invoice.createdAt` |
| **Catatan** | `invoice.notes` (field baru, `-` jika kosong) |

**Ringkasan statistik:**
- Total invoice
- Jumlah Lunas / Menunggu / Jatuh Tempo
- Total nilai semua invoice
- Total nilai yang sudah dibayar

---

### 2. Laporan Pembayaran

Laporan semua transaksi pembayaran yang berhasil.

**Filter tersedia:**
- Rentang tanggal (berdasarkan `paidAt`)

**Kolom data:**

| Kolom | Sumber Field |
|---|---|
| No. Invoice | `invoice.invoiceNumber` (via relasi) |
| Nama Pelanggan | `invoice.customerName` |
| Username | `invoice.customerUsername` |
| Telepon | `invoice.customerPhone` |
| Jumlah | `payment.amount` (angka) |
| Jumlah (Rp) | `payment.amount` (format Rupiah) |
| Metode | `payment.method` |
| Status | `payment.status` |
| Tanggal Bayar | `payment.paidAt` |
| **Catatan** | `payment.notes` (field baru, `-` jika kosong) |

**Ringkasan statistik:**
- Total transaksi
- Total nilai pembayaran

---

### 3. Laporan Pelanggan

Laporan status semua pelanggan PPPoE.

**Filter tersedia:**
- Status: Semua / Aktif (`active`) / Terisolir (`isolated`) / Dihentikan (`stopped`) / Kedaluwarsa (`expired`)

> **Catatan:** Laporan pelanggan tidak menggunakan filter tanggal karena menampilkan status terkini.

**Kolom data:**

| Kolom | Sumber Field |
|---|---|
| Username | `pppoeUser.username` |
| Nama | `pppoeUser.name` |
| Telepon | `pppoeUser.phoneNumber` |
| Alamat | `pppoeUser.address` |
| Paket | `pppoeUser.package.name` |
| Status | `pppoeUser.status` |
| Mulai | `pppoeUser.createdAt` |
| Tagihan Terakhir | `pppoeUser.lastBilledAt` |
| **Catatan** | `pppoeUser.comment` (field di model, `-` jika kosong) |

**Ringkasan statistik:**
- Total pelanggan
- Jumlah Aktif / Terisolir / Dihentikan / Kedaluwarsa

---

## Field Catatan (Baru — v2.10.25)

Kolom **Catatan** ditambahkan ke semua tiga tipe laporan pada versi 2.10.25:

| Model | Field | Database Column |
|---|---|---|
| `invoice` | `notes` | `notes TEXT NULL` |
| `payment` | `notes` | `notes TEXT NULL` |
| `pppoeUser` | `comment` | `comment TEXT NULL` (sudah ada sebelumnya) |

Field ini memungkinkan admin mencatat informasi tambahan per invoice atau pembayaran, dan informasi tersebut akan ikut diekspor dalam laporan Excel/PDF.

---

## Ekspor Data

### Excel (XLSX)

- Format: spreadsheet `.xlsx` via library `xlsx` (SheetJS)
- Semua kolom termasuk kolom numerik (untuk pivot/sum di Excel)
- Nama file: `laporan-{type}-{dateFrom}-{dateTo}.xlsx`

### PDF

- Format: PDF via print/export browser
- Menggunakan layout tabel yang sama dengan preview
- Nama file: `laporan-{type}-{dateFrom}-{dateTo}.pdf`

---

## Preview Tabel

Sebelum ekspor, admin bisa lihat preview data di halaman:
- Semua kolom ditampilkan (tidak ada batasan jumlah kolom)
- Kolom panjang (seperti Catatan) di-truncate dengan `...` dan tooltip saat hover
- Maksimal 5.000 baris per request

---

## API Endpoint

### `GET /api/admin/laporan`

Query parameters:

| Parameter | Nilai | Default |
|---|---|---|
| `type` | `invoice` \| `payment` \| `customer` | `invoice` |
| `dateFrom` | `YYYY-MM-DD` | Awal bulan ini |
| `dateTo` | `YYYY-MM-DD` | Hari ini |
| `status` | `all` / nilai status spesifik | `all` |

Response:

```json
{
  "success": true,
  "type": "invoice",
  "rows": [...],       // Array objek dengan semua kolom laporan
  "summary": {
    "total": 150,
    "paid": 120,
    "pending": 20,
    "overdue": 10,
    "totalAmount": 15000000,
    "paidAmount": 12000000
  }
}
```

**Autentikasi:** Wajib login (session check via NextAuth).  
**Limit:** 5.000 baris per request. Gunakan filter tanggal untuk data lebih besar.

---

## File Terkait

| File | Fungsi |
|---|---|
| [src/app/admin/laporan/page.tsx](../../src/app/admin/laporan/page.tsx) | Halaman utama laporan (filter, preview, ekspor) |
| [src/app/api/admin/laporan/route.ts](../../src/app/api/admin/laporan/route.ts) | API route — fetch & format data laporan |
| [src/app/admin/laporan/analitik/page.tsx](../../src/app/admin/laporan/analitik/page.tsx) | Halaman analitik advanced |
| [src/app/admin/layout.tsx](../../src/app/admin/layout.tsx) | Sidebar navigasi — menu group Laporan |
| [src/locales/id.json](../../src/locales/id.json) | Terjemahan Indonesia (key: `nav.catReports`, `nav.laporanData`, dll) |
| [src/locales/en.json](../../src/locales/en.json) | Terjemahan Inggris |
| [prisma/schema.prisma](../../prisma/schema.prisma) | Model `invoice` dan `payment` (field `notes`) |

---

## Skema Database (Perubahan v2.10.25)

```prisma
model invoice {
  // ... field lain ...
  notes  String? @db.Text   // ← BARU: catatan per invoice
}

model payment {
  // ... field lain ...
  notes  String? @db.Text   // ← BARU: catatan per pembayaran
}
```

Kedua field sudah di-push ke production database menggunakan `prisma db push`.
