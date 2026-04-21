# Changelog

All notable changes to Salfanet RADIUS are documented in this file.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.21.0] — 2026-04-22

### Added
- **Panel "Konfigurasi VPS Built-in VPN" di halaman VPN Client** ([`1903085`]) — Panel baru (collapsible) untuk mengatur pool IP & gateway WireGuard dan L2TP yang terinstall langsung di VPS (bukan MikroTik CHR). Menampilkan IP Mulai, IP Akhir, Gateway VPS beserta tombol Edit inline. Konfigurasi ini terpisah sepenuhnya dari menu VPN Server yang khusus untuk MikroTik CHR.
- **PATCH endpoint `vps-wg-peer`** ([`1903085`]) — Endpoint baru `PATCH /api/network/vps-wg-peer` untuk update `poolStart`, `poolEnd`, `gatewayIp` di `wg-server-info.json`. Saat `gatewayIp` disimpan, endpoint juga otomatis memperbarui baris `Address =` di `wg0.conf` dan field `subnet` di info file, lalu reload WireGuard interface via `wg syncconf` (zero-downtime).
- **PATCH endpoint `vps-l2tp-peer`** ([`1903085`]) — Endpoint baru `PATCH /api/network/vps-l2tp-peer` untuk update `poolStart`, `poolEnd`, `gateway` di `l2tp-server-info.json`.
- **Pool IP menerima full IP address** ([`17d83da`]) — Input poolStart/poolEnd sebelumnya hanya menerima angka oktet terakhir (mis. `2`, `254`). Sekarang menerima full IP lengkap (mis. `172.16.212.2`) sehingga pool bisa dikonfigurasi ke subnet manapun, tidak terbatas pada subnet WireGuard interface default.

### Fixed
- **VPN Client page: redirect paksa jika tidak ada MikroTik CHR** ([`1903085`]) — Halaman VPN Client sebelumnya memaksa redirect ke menu VPN Server jika belum ada VPN Server (CHR) terdaftar, sehingga user tidak bisa pakai VPS built-in VPN (WG/L2TP) tanpa setup CHR dulu. Redirect dihapus sepenuhnya.
- **`loadWgServerInfo`: semua field undefined** ([`17d83da`]) — Fungsi membaca `data.info?.publicIp`, `data.info?.publicKey`, dst., padahal API `GET /api/network/vps-wg-peer` mengembalikan fields di top level (`data.publicIp`, bukan `data.info.publicIp`). Mapping diperbaiki ke `data.X` langsung.
- **`nextAvailableIp` (WG) & `getNextAvailableIp` (L2TP): selalu gunakan prefix `info.subnet`** ([`8636800`]) — Meskipun poolStart dikonfigurasi ke subnet lain (mis. `172.16.212.2`), IP yang dialokasikan tetap menggunakan prefix interface WireGuard default (`10.200.0.x`). Sekarang jika poolStart adalah full IP string, prefixnya digunakan sebagai base. Scan "IP yang sudah terpakai" juga dibatasi ke prefix yang sama untuk menghindari false conflict lintas subnet.
- **WG ADD response: `vpnSubnet` dan `gatewayIp` tidak mencerminkan pool prefix** ([`8636800`]) — Response POST add peer sekarang menghitung `effectiveVpnSubnet` dan `effectiveGatewayIp` dari prefix poolStart, bukan dari `info.subnet`. Script MikroTik yang di-generate (allowed-address, route, RADIUS address) otomatis menggunakan subnet yang benar.
- **Display subnet footer: selalu tampilkan subnet interface WG, bukan pool subnet** ([`6a8bd04`]) — Footer di panel kini menampilkan "Pool subnet" yang diturunkan dari prefix poolStart. Edit button prefill juga diperbaiki untuk menggunakan prefix dari poolStart yang sudah tersimpan (bukan selalu prefix `info.subnet`).
- **`wg0.conf Address` dan `info.subnet` tidak diupdate saat gatewayIp berubah** ([`62b0c88`]) — PATCH endpoint sekarang juga memperbarui baris `Address =` di `wg0.conf` dan `info.subnet` di JSON sehingga subnet yang ditampilkan di UI dan digunakan untuk alokasi IP selalu konsisten dengan konfigurasi pool.
- **Pool config dipindah ke halaman yang salah (VPN Server)** ([`1903085`]) — Konfigurasi pool IP built-in VPS sebelumnya salah ditempatkan di halaman VPN Server (khusus MikroTik CHR). Sekarang ada di halaman VPN Client yang tepat.

### Changed
- **VPN Server page dibersihkan dari state/handler/UI pool VPS** ([`1903085`]) — Semua state `wgPoolEdit`, `wgPoolForm`, `l2tpPoolEdit`, `l2tpPoolForm` beserta handler dan UI-nya dihapus dari `vpn-server/page.tsx`. Halaman VPN Server sekarang murni untuk manajemen MikroTik CHR.

---

## [2.20.0] — 2026-04-20

### Fixed
- **Script RADIUS: hapus perintah `rate-limit=""` di hotspot user profile** ([`9d5688d`]) — Command `/ip hotspot user profile add ... rate-limit=""` menyebabkan error `expected end of command` di RouterOS karena `rate-limit` bukan parameter valid di context tersebut. Block tersebut dihapus; RADIUS yang mengatur bandwidth via `Mikrotik-Rate-Limit` reply attribute.
- **Script RADIUS: `keepalive-timeout` dan `lcp-echo` tidak valid di `/ppp profile`** ([`fd3a1a0`], [`d0a9d82`]) — RouterOS tidak mengenal `keepalive-timeout` maupun `lcp-echo-interval`/`lcp-echo-failure` pada `/ppp profile set`. Kedua perintah dihapus dari generated script.
- **Script RADIUS: `address` selalu `127.0.0.1` saat `RADIUS_SERVER_IP` tidak di-set** ([`b511b88`]) — Fallback chain diperbarui: `RADIUS_SERVER_IP` → `VPS_IP` → **hostname dari `NEXTAUTH_URL`** → `127.0.0.1`. Instalasi tanpa env var eksplisit (VPS lokal/LXC) kini otomatis menggunakan IP yang benar dari `NEXTAUTH_URL`.
- **Script RADIUS: router non-VPN tidak menyertakan `src-address`** ([`34f953e`]) — Tanpa `src-address`, MikroTik memilih source IP dari routing table yang bisa berbeda dari `nasname` terdaftar di FreeRADIUS → request ditolak sebagai "unknown client". Sekarang `src-address` selalu di-set untuk semua router (VPN maupun direct/public IP).

### Added
- **Script RADIUS: Netwatch monitor RADIUS server** ([`9d5688d`]) — Generated script kini menyertakan `/tool netwatch add host=<RADIUS_IP> interval=30s` dengan `down-script` log warning dan `up-script` log info. MikroTik otomatis mencatat jika RADIUS tidak reachable.
- **`vpn-watchdog.sh`: RADIUS health check** ([`c2aa096`]) — Watchdog kini memeriksa apakah service `freeradius` sedang berjalan (Check A) dan apakah port UDP 1812 listening (Check B), serta auto-restart jika service mati. Ditambahkan log rotation otomatis (max 5000 baris).

### Changed
- **`Acct-Interim-Interval` FreeRADIUS: 60 → 300 detik** ([`c2aa096`]) — Interval akuntansi diperpanjang dari 1 menit ke 5 menit untuk mengurangi beban DB dan selaras dengan setting PPP interim-update MikroTik (`interim-update=5m`).
- **Stale session threshold `pppoe-session-sync.ts`: 1 HOUR → 30 MINUTE** ([`c2aa096`]) — Sesi tanpa `Accounting-Interim` lebih dari 30 menit (= 6× interval 5 menit) dianggap stale dan ditutup. Memberi window cukup bagi VPN untuk reconnect tanpa menutup sesi aktif secara prematur.

---

## [2.19.0] — 2026-04-11

### Added
- **Tab "📷 Foto" di `UserDetailModal`** ([`817887a`]) — Tab baru di sebelah kanan Invoice untuk melihat foto KTP dan foto instalasi pelanggan secara read-only. Fitur:
  - Foto KTP ditampilkan full-width dengan NIK di pojok kanan
  - Foto Instalasi ditampilkan grid 2×kolom dengan label "Foto 1/2/3…"
  - **Lightbox**: klik foto manapun → full screen overlay, klik luar atau tombol × untuk tutup
  - Placeholder kosong dengan ikon jika belum ada foto

### Improved
- **Kompresi foto otomatis sebelum upload** ([`8ff86c1`]) — Semua foto yang diambil via kamera maupun dipilih dari galeri dikompresi otomatis sebelum dikirim ke server:
  - Util baru `compressImage()` di `src/lib/utils.ts`: resize max **1280×1280px** + JPEG quality **78%**
  - Estimasi ukuran: foto ~5MB dari HP 50MP → **200–400KB** tersimpan di database
  - Berlaku di `CameraPhotoInput` (galeri, native capture, getUserMedia takePhoto) dan `CameraViewfinder` (takePhoto + native capture)
- **Tampilan viewfinder kamera diperbaiki** ([`8ff86c1`]) — Viewfinder live camera dari fixed `h-48` (192px) → `aspect-[4/3]` (proporsional). Ditambahkan **corner guide overlay** (4 sudut biru) di viewfinder dan `CameraViewfinder`.
- **Preview foto hasil diperbaiki** ([`8ff86c1`]) — Border berubah jadi hijau, badge "✓ Foto tersimpan" di pojok kiri atas, action bar (Galeri | Kamera) di bagian bawah foto.

### Fixed
- **`getUserMedia` error tidak fallback ke native camera** ([`382dbb3`]) — Sebelumnya jika `getUserMedia` melempar error apapun (`NotAllowedError`, Permissions Policy violation, tidak ada kamera, dll), komponen menampilkan pesan error merah "Izin kamera ditolak..." alih-alih fallback otomatis. Sekarang setiap error dari `getUserMedia` langsung memicu `captureRef.current?.click()` / `setUseNativeCapture(true)` sehingga native camera OS terbuka tanpa error.
  - `CameraPhotoInput.tsx` — `catch` block `startCamera()`: hapus seluruh `setCameraError(msg)` logic, ganti dengan `captureRef.current?.click()`
  - `CameraViewfinder.tsx` — `catch` block `startStream()`: hapus `setError(msg)`, ganti dengan `setUseNativeCapture(true)`
  - State `cameraError` dan render block error merah dihapus sepenuhnya dari `CameraPhotoInput`

---

## [2.18.0] — 2026-04-11

### Fixed
- **CRITICAL: Tombol "Kamera HP" tidak membuka kamera di iOS Safari / Android** — root cause: `<input type="file" capture="environment">` dengan `className="hidden"` (display:none) yang di-trigger via `ref.current?.click()` kehilangan "trusted user gesture" context, sehingga iOS Safari mengabaikan atribut `capture` dan membuka galeri biasa sebagai fallback.
  - `CameraPhotoInput.tsx` — Ganti `useRef` + `button` + `.click()` dengan `useId()` + `<label htmlFor>`. Label trigger input secara native tanpa JavaScript, iOS Safari menghormati `capture="environment"` dengan benar. Ganti `className="hidden"` (display:none) ke `className="sr-only"` (off-screen, elemen tetap aktif di DOM).
  - `admin/pppoe/users` Add form — `className="hidden"` → `"sr-only"`; tambah `pointer-events-none` pada label saat uploading.
  - `UserDetailModal` Edit form — sama seperti di atas.
- **Foto Instalasi hilang di form Teknisi (`/technician/register`)** — section Foto Instalasi sama sekali tidak ada di form tambah pelanggan teknisi. Ditambahkan `CameraPhotoInput` multi-foto dengan state `installationPhotos`, `uploadingInstallation`, dan dikirim ke API saat submit.

### Changed
- **Script RADIUS, Isolir, dan VPN Client dipisah tanggung jawabnya** *(commit d649bee)*:
  - `setup-radius` — Hapus profile duplikat `radius-default`, konsolidasi ke satu profile `salfanetradius`. Semua rule isolasi (SALFANET-ISOLIR) dipindahkan ke Setup Isolir.
  - `setup-isolir` — Diubah dari eksekusi API langsung (RouterOSAPI) ke **script generator** (paste-able ke terminal MikroTik). Script mencakup: `pool-isolir`, PPP profile `isolir`, firewall filter + NAT (SALFANET-ISOLIR), catatan route VPS.
  - `routers/page.tsx` — Ditambah tombol **Setup Isolir** (ikon gembok oranye) di samping tombol RADIUS, dengan handler `handleSetupIsolir()` yang menampilkan script modal.
  - `vpn-client/page.tsx` — Hapus `radiusSection` dan `wgRadiusSection` dari semua script VPN (L2TP/SSTP/PPTP/WireGuard). Script hanya berisi setup tunnel + API user + catatan langkah berikutnya.

---

## [2.17.0] — 2026-04-10

### Added
- **`CameraPhotoInput` component** — Komponen reusable baru `src/components/CameraPhotoInput.tsx`. Menampilkan dua tombol **[🖼 Galeri] [📷 Kamera HP]** side-by-side saat belum ada foto. Tombol *Kamera HP* menggunakan `capture="environment"` sehingga langsung membuka kamera belakang di HP tanpa melalui file picker. Setelah upload berhasil, komponen otomatis meminta izin GPS via `navigator.geolocation.getCurrentPosition` dan menampilkan badge **📍 lat, lng · Lihat di Maps ↗** yang dapat diklik. Theme `dark` (cyberpunk) untuk halaman publik, theme `light` untuk modal admin/teknisi.
- **Kamera HP langsung di form tambah pelanggan (`/daftar`)** — Upload foto KTP diganti dengan `CameraPhotoInput` (dark theme). GPS yang tertangkap otomatis mengisi `formData.latitude` dan `formData.longitude` — bisa melengkapi atau menggantikan input MapPicker manual.
- **Kamera HP + GPS di `AddPppoeUserModal` (`/admin/pppoe/users`)** — Foto KTP menggunakan `CameraPhotoInput`. Foto instalasi mendapat dua tombol [Galeri] [Kamera HP]; memilih via kamera HP otomatis menangkap GPS ke field latitude/longitude.
- **Kamera HP di form registrasi teknisi (`/technician/register`)** — Foto KTP diganti dengan `CameraPhotoInput`. Menampilkan badge GPS setelah foto diambil dari kamera.
- **Kamera HP + GPS di `UserDetailModal`** — Foto KTP menggunakan `CameraPhotoInput`. Foto instalasi mendapat [Galeri] [Kamera HP]; kamera otomatis mengisi GPS ke `formData.latitude/longitude`.

### Changed
- **Unified photo upload UX** — Semua 4 titik entry pelanggan (daftar publik, modal tambah admin, form teknisi, edit user) sekarang konsisten: dua aksi foto (galeri vs kamera HP), preview langsung, GPS otomatis setelah foto, badge koordinat clickable ke Google Maps.

---

## [2.16.0] — 2026-04-10

### Added
- **PWA Web Push — Sistem notifikasi push penuh (VAPID)** — notifikasi push browser bekerja di semua portal (customer, teknisi, admin). Teknisi dan admin kini dapat menerima notifikasi push Android/PWA untuk tiket, gangguan, dan broadcast.
- **`adminPushSubscription` model** — tabel baru `admin_push_subscriptions` untuk menyimpan push subscription admin/operator yang login melalui portal teknisi (`admin_user` type). Sebelumnya diabaikan dengan `{skipped:true}`.
- **Toggle notif push permanen di sidebar teknisi** — `SidebarPushToggle` selalu tampil di sidebar portal teknisi dengan state ON/OFF yang jelas. ([`d0a97ec`])
- **Dispatch tiket ke semua teknisi via WA + push** — saat tiket dibuat/di-assign, broadcast WhatsApp + push notification dikirim ke semua teknisi aktif. ([`1eb9358`])
- **GitHub Actions auto-deploy** — workflow `.github/workflows/deploy.yml` untuk auto-deploy ke VPS saat ada push ke branch `master`. ([`e195e4f`])
- **`update.sh` auto-rebuild jika standalone hilang** — jika `.next/standalone/server.js` tidak ada, build dipaksa meski kode tidak berubah. API `/api/admin/system/check` mengembalikan `needsBuild: true` dan UI menampilkan tombol rebuild. ([`8ee6c03`])
- **Bell push + badge di portal teknisi** — SW menangani `push` event, menampilkan notifikasi, badge, dan toast dari service worker. ([`72665f0`])
- **Silent sync push subscription** — saat portal teknisi/customer dimuat di browser, jika browser masih punya push subscription aktif, langsung di-sync ulang ke DB tanpa user perlu re-toggle.

### Fixed
- **CRITICAL: Push subscription tidak tersimpan ke DB (semua tabel 0 row)** — root cause: `fetch('/api/push/technician-subscribe', ...)` tidak mengirim cookie `technician-token` karena tidak ada `credentials: 'same-origin'`. Tanpa cookie, `admin_user` tidak terdeteksi → API mencari ID di tabel `technician` → 404 "Technician not found" → subscription tidak tersimpan. Fix: tambah `credentials: 'same-origin'` ke semua 3 fetch call (silent sync, subscribe, unsubscribe). ([`57f6169`])
- **CRITICAL: `admin_user` push subscription diabaikan** — route `POST /api/push/technician-subscribe` mengembalikan `{skipped:true}` untuk `admin_user` tanpa menyimpan data. Sekarang menyimpan ke `adminPushSubscription`. ([`7df3a8f`])
- **Push 404 untuk `admin_user`** — route `GET /api/push/vapid-public-key` dan subscribe/unsubscribe mengembalikan 404 saat user adalah `admin_user`. Diperbaiki dengan early return yang benar. ([`1ef8edc`])
- **`PushManager` in `window` vs `navigator`** — `SidebarPushToggle` menggunakan `PushManager in window` (sesuai spec) bukan `PushManager in navigator`, konsisten dengan `usePushNotification` hook. ([`c31a316`])
- **Dashboard teknisi: tiket selesai tidak muncul** — dashboard masih menggunakan model `work_orders` yang sudah dihapus. Diperbarui ke model `ticket`. ([`1602b7e`], [`ed3619b`])
- **PPPoE username GenieACS** — username untuk lookup GenieACS dinormalisasi dengan benar. ([`72665f0`])
- **WA notif teknisi melalui `WhatsAppService`** — notifikasi WhatsApp ke teknisi sekarang melalui service standar. ([`72665f0`])

### Changed
- **`push-notification.service.ts`** — `getPushDashboardStats()` mengembalikan `adminSubscribers` + `fcmUserCount`. `sendWebPushBroadcast()` juga mengirim ke admin saat target `technician` atau `all`. `sendToStoredSubscriptions()` mendukung role `'admin'`.
- **Admin push notifications page** — menampilkan breakdown terpisah: Teknisi X teknisi, Admin X admin, dan total penerima yang benar.
- **Cleanup: hapus file patch sementara** — `scripts/patch-push-fix.mjs`, `scripts/patch-push-toggle.mjs`, `scripts/patch-push-toggle2.mjs`, `tmp-check.sh` dihapus dari repo.

### Migration
- Tabel `admin_push_subscriptions` dibuat otomatis via `prisma db push` (field di schema.prisma sudah ditambahkan).

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
