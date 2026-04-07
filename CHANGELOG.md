# Changelog

All notable changes to Salfanet RADIUS are documented in this file.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.15.0] — 2026-01-15

### Fixed — Cron Job & Backup System Audit
- **CRITICAL: `backupTopicId` non-nullable** — field di schema `telegramBackupSettings` sebelumnya `String` (wajib), menyebabkan Prisma error saat simpan settings tanpa Topic ID → settings tidak tersimpan → backup Telegram selalu di-skip. Diubah ke `String?` (nullable)
- **CRITICAL: `MYSQL_PWD` shell syntax** — sebelumnya menggunakan `MYSQL_PWD="${password}" mysqldump ...` yang gagal jika password DB mengandung karakter khusus (`"`, `$`, `` ` ``, `\`). Sekarang menggunakan `env` option dari `execAsync` yang lebih aman
- **CRITICAL: `/api/cron/telegram` GET undefined `status`** — variabel `status` tidak pernah di-declare, `getTelegramCronStatus()` diimport tapi tidak dipanggil → runtime error saat cek status. Fixed
- **CRITICAL: `/api/cron` POST tanpa auth** — endpoint bisa dipanggil siapa saja dari internet. Ditambahkan auth check: `CRON_SECRET` header, User-Agent `SALFANET-CRON-SERVICE`, atau session SUPER_ADMIN
- **Double cron execution** — `initCronJobs()` di `instrumentation.ts` DAN `cron-service.js` menjalankan job yang sama (voucher sync, agent sales, invoice, dll). Sekarang `initCronJobs()` hanya menginisialisasi Telegram cron (yang memang tidak ada di cron-service.js)
- **Placeholder `/api/backup/telegram/settings`** — endpoint mengembalikan data hardcoded `{ enabled: false }` dan tidak baca/tulis DB. Sekarang baca/tulis ke database `telegramBackupSettings`

### Improved
- **Health report Telegram** — sekarang menampilkan informasi lengkap: active sessions, total users, active users, overdue invoices, issues (sebelumnya hanya status, size, tables, connections, uptime)
- **Telegram file size check** — tambah validasi 50MB limit sebelum kirim backup ke Telegram, mencegah silent failure dari Telegram API

### Migration
- `prisma/migrations/20260615_fix_telegram_backup_topic_nullable.sql` — `ALTER TABLE telegram_backup_settings MODIFY COLUMN backupTopicId VARCHAR(191) NULL`

---

## [2.14.0] — 2026-01-15

### Added
- **ID Pelanggan (`customerId`) di semua template notifikasi WA** — template yang diperbarui:
  - `registration-approval` — menampilkan ID pelanggan sebelum username
  - `admin-create-user` — menampilkan ID pelanggan + area
  - `invoice-reminder` — menampilkan ID pelanggan di detail invoice
  - `payment-success` — menampilkan ID pelanggan, paket, dan area
  - `auto-renewal-success` — menampilkan ID pelanggan + area
  - `manual-payment-approval` — menampilkan ID pelanggan, paket, dan area
  - `manual-payment-rejection` — menampilkan ID pelanggan dan username
  - `account-info` — menampilkan ID pelanggan
- **ID Pelanggan di template email** — ditambahkan ke:
  - `registration-approval` — baris ID Pelanggan sebelum Username
  - `manual-payment-approval` — baris ID Pelanggan di tabel detail
  - `manual-payment-rejection` — baris ID Pelanggan + Username di tabel detail
- **Field `customerId` di service interfaces** — `sendRegistrationApproval`, `sendPaymentSuccess`, `sendAutoRenewalSuccess`, `sendInvoiceReminder` (WA + Email) sekarang menerima `customerId?: string`
- **Field `area` di notifikasi payment-success dan auto-renewal-success** — service interfaces + variabel template diperbarui

### Fixed
- **Seed template tidak update `message`/`htmlBody`** — bug di `whatsapp-templates.ts` dan `email-templates.ts`: branch `update` tanpa flag `--force-templates` hanya meng-update `name` dan `isActive`, BUKAN konten pesan. Sekarang `message`/`htmlBody` selalu diupdate pada setiap seed.
- **`update.sh` tidak menjalankan seed** — seed hanya berjalan jika file di `prisma/seeds/` berubah. Sekarang seed selalu berjalan di setiap update.

### Changed
- **`update.sh` menggunakan `stdbuf`** — `npm run db:seed` dibungkus dengan `stdbuf -oL` agar output log muncul secara real-time di SSH / admin live log panel

---

## [2.13.2] — 2026-04-05

### Changed
- **Redesign UI: Modern Clean Blue/Indigo theme** — seluruh halaman login (admin, technician, customer, agent) didesain ulang dari cyberpunk/neon ke tampilan modern bersih dengan palette biru/indigo. Sidebar dan komponen global mengikuti skema warna baru. ([`6ec9783`])
- **`CyberButton` — warna diperbarui** — semua warna neon (cyan/pink/yellow/green) diganti ke blue/indigo/emerald palette yang konsisten dengan tema baru. ([`6ec9783`])
- **`globals.css` — CSS variables diperbarui** — dark mode: navy background + blue primary; light mode: blue-600 primary; dark mode neon remap dihapus; custom scrollbar diperbarui. ([`6ec9783`])

### Fixed
- **VPN Client: VPS IP field hanya manual** — auto-fill VPS IP sekarang skip domain name (Cloudflare-proxied, dsb). Field VPS IP di halaman VPN Client menjadi input manual penuh — tidak lagi menarik domain dari API. ([`910cddd`], [`5049e02`])
- **`scripts/update.sh` — abort jika copy static gagal** — sebelumnya menggunakan `|| true` sehingga kegagalan copy aset statis diabaikan dan `pm2 reload` tetap dipanggil dengan build stale. Sekarang menggunakan `|| err "..."` untuk abort. ([`7c85dd3`])
- **`scripts/update.sh` — nesting bug `cp -r`** — `cp -r .next/static .next/standalone/.next/static` bisa membuat nested directory jika target sudah ada. Diperbaiki ke `mkdir -p` + `cp -r src/. dst/`. ([`7c85dd3`])

---

## [2.13.1] — 2026-04-05

### Fixed
- **Wablas send gagal** — ganti dari `POST /api/v2/send-message` (JSON body) ke `GET /api/send-message?token=...` (v1 simple endpoint). V2 endpoint tidak tersedia di semua server Wablas (`wa`, `deu`, `jakarta`, dll). Format token tetap `token.secret_key`. ([`e8bdf6b`])
- **Hint form Wablas** diperjelas: sebelumnya hanya "Opsional: token.secret_key", sekarang "Format: token.secret_key (dari Device → Settings di dashboard Wablas)".

---

## [2.13.0] — 2026-04-05

### Added
- **WhatsApp webhook endpoint** (`/api/whatsapp/webhook`) — terima pesan masuk dari Kirimi.id, Wablas, Fonnte, WAHA. Pesan dicatat ke `whatsapp_history` dengan `status: incoming`. Mendukung GET untuk challenge verification. ([`d2ff368`])
- **Webhook URL display** di halaman providers — panel info dengan URL webhook dan tombol copy. ([`48a213d`])
- **Kirimi.id native broadcast** — `sendBroadcastViaKirimi()` menggunakan endpoint `/v1/broadcast-message` untuk kirim ke banyak nomor sekaligus. Pesan dikelompokkan per konten unik untuk efisiensi. 1 penerima otomatis pakai `/v1/send-message`. ([`fa136f1`], [`f4b3d4c`])
- **Per-provider error detail** — saat semua provider gagal, response API menyertakan detail error per provider (nama, tipe, pesan error) agar mudah diagnosa. ([`b7e0544`])

### Fixed
- **Kirimi.id endpoint salah** — `/send-message` → `/v1/send-message` (sesuai docs resmi Kirimi.id v2.0). ([`11bc666`])
- **Kirimi.id field penerima salah** — `number` → `receiver` (sesuai docs resmi). ([`11bc666`])
- **Kirimi.id trailing slash** — `provider.apiUrl` sekarang di-strip trailing slash seperti provider lain. ([`b7e0544`])
- **Broadcast response mismatch** — route broadcast sekarang return `successCount` / `failCount` di top-level agar frontend toast menampilkan angka yang benar. ([`f4b3d4c`])
- **HTTP status 502 diubah ke 500** — 502 secara semantik berarti upstream proxy error; 500 lebih tepat untuk kegagalan provider. ([`b7e0544`])

### Changed
- **Broadcast delay Kirimi.id** diubah dari 5 detik → **30 detik** (rekomendasi resmi Kirimi.id untuk menghindari blokir WhatsApp). ([`2af263c`])

---

## [2.12.0] — 2026-04-02

### Fixed
- **Isolasi PPPoE manual: radusergroup dioverwrite saat edit user** — `updatePppoeUser` selalu menulis ulang `radusergroup = profile.groupName` tanpa memeriksa status user. Sekarang menghormati `effectiveStatus`: `isolated` → group `isolir`, `blocked`/`stop` → RADIUS kosong, `active` → sync penuh. ([`958fc3a`])
- **`radclient disconnect` tidak memuat MikroTik vendor dictionary** — tambahkan flag `-d /usr/share/freeradius` ke `coa-handler.service.ts` agar `Disconnect-Request` dikirim dengan format yang benar ke MikroTik. ([`958fc3a`])
- **CoA "Bad Requests=133, Acks=0"** — `coa.service.ts` tidak memuat MikroTik vendor dict, membuat `Mikrotik-Rate-Limit` dikirim tanpa vendor ID. Tambahkan `-d /usr/share/freeradius` ke `executeRadclient()`. ([`b2fe4fa`])
- **setup-isolir hardcode IP pool dan rate limit** — `setup-isolir/route.ts` tidak lagi hardcode `10.255.255.2-254 @ 64k/64k`. Sekarang baca `isolationIpPool` + `isolationRateLimit` dari DB company. ([`cb91699`])
- **9739 duplicate rows di `radgroupreply`** — `freeradius-health.ts` menggunakan `INSERT IGNORE` pada tabel tanpa UNIQUE constraint. Diganti pola `DELETE + INSERT` untuk semua 3 atribut isolir. ([`cb91699`])
- **footerAgent tidak tersimpan ke database** — field `footerAgent` ada di CREATE query tapi tidak di UPDATE. ([`2adef92`])
- **Footer login agent hardcoded** — hapus fallback `"Powered by ${poweredBy}"` yang dihardcode di `agent/page.tsx`. ([`f70967f`])

### Added
- **`production/99-vpn-routes`** — script PPP ip-up untuk otomatis menambahkan route `10.20.30.0/24` via ppp0 ke VPS saat VPN tunnel connect. Diperlukan agar CoA/disconnect packet bisa reach MikroTik.

### Changed
- Nginx config (`production/nginx-salfanet-radius.conf`) disinkronkan dengan VPS aktual: tambah blok `/api/` dengan no-cache headers, CSP header Cloudflare, `Referrer-Policy`, hide upstream security headers.

---

## [2.11.8] — 2026-03-31

### Fixed
- **billingDay reset ke 1 saat edit user** — `UserDetailModal.tsx` menggunakan `user.subscriptionType || 'PREPAID'` (wrong default). User POSTPAID tampil di view PREPAID, billingDay selalu reset ke 1. Fix: `subscriptionType: user.subscriptionType ?? 'POSTPAID'` dan `billingDay: user.billingDay ?? new Date(user.expiredAt).getDate()`.
- **MikroTik local-address verification** — setelah sync local-address ke RouterOS PPP profile, sekarang membaca kembali untuk verifikasi.
- **NAS IP di kolom tabel PPPoE** — menampilkan IP NAS/router, bukan IP statis user.
- **updatePppoeUser POSTPAID billingDay** — saat billingDay berubah, `expiredAt` di-recalculate ke tanggal tagihan berikutnya.
- **Ghost sessions** — `sessions/route.ts` skip session yang tidak ada di `pppoeUser` maupun `hotspotVoucher`. `authorize/route.ts` kirim REJECT untuk user tidak terdaftar.
- **Dashboard hotspot count selalu 0** — hapus pengecekan Service-Type yang keliru, ganti ke lookup `pppoeUser` vs `hotspotVoucher`.
- **Next.js prerender crash pada `/_global-error`** — buat `src/app/global-error.tsx` sebagai `'use client'` component.
- **MapPicker z-index di balik modal** — tambah `createPortal(jsx, document.body)` ke `MapPicker.tsx`.
- **Nginx manifest 404** — ganti `alias + try_files` (broken dengan regex location) ke `root /var/www/salfanet-radius/public`.

### Added
- Area badge (kuning, ikon MapPin) di kolom Data Pelanggan PPPoE.
- Form Tambah Pelanggan: select Area (opsional).
- 5 action button baru: Eye, Pencil, RefreshCw, Shield, Trash.
- Agent manual top-up: pilih rekening admin tujuan, upload bukti transfer.

---

## [2.11.6] — 2026-03-28

### Fixed
- **expiredAt reset otomatis saat save user** — dihapus kalkulasi otomatis `expiredAt` dari `billingDay` di setiap `updatePppoeUser`. `expiredAt` hanya diupdate jika eksplisit dikirim dari form.
- **Redis crash-loop setelah install** — hardening konfigurasi Redis installer.
- **Ubuntu UFW tidak auto-enabled** — installer sekarang auto-detect SSH port dan enable UFW.

### Added
- `scripts/run-deploy.js` — cross-platform deploy wrapper.
- `npm run clean:local` dan `clean:all`.
- GenieACS TR-069 device management (`/admin/network/olt`).
- WiFi configuration dari customer portal.

---

## [2.10.27] — 2026-03-15

### Added
- Technician portal (11 pages + 19 API routes).
- Restructuring complete (5 phases).

---

## [2.6.x] — 2025-12

### Added
- PPPoE isolation system dengan template WhatsApp/Email/HTML.
- `radgroupreply` untuk group `isolir`: `Mikrotik-Rate-Limit`, `Mikrotik-Group`, `Framed-Pool`.

---

## [2.4.x] — 2025-10

### Added
- CoA service (real-time disconnect via radclient + MikroTik API).
- Auto-disconnect cronjob.
