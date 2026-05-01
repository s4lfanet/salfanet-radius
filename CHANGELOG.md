# Changelog

All notable changes to Salfanet RADIUS are documented in this file.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.25.15] — 2026-05-01

### Fixed
- **Import pelanggan PPPoE: username muncul sebagai `[object Object]`** — ExcelJS mem-parse cell yang berisi `@` (seperti `user@domain.id`) sebagai `CellHyperlinkValue` (`{ text, hyperlink }`). `String(cell.value)` menghasilkan `"[object Object]"` sehingga username salah terbaca. Diperbaiki dengan menangani semua tipe ExcelJS complex cell: hyperlink (ekstrak `.text`), richText (gabungkan `.richText[].text`), formula (ambil `.result`).
- **Import pelanggan PPPoE: semua baris gagal "Username already exists"** — Import sebelumnya hanya mendukung CREATE baru. File hasil Export berisi user yang sudah ada, sehingga semua baris gagal. Diperbaiki dengan logika **upsert**: jika username sudah ada di DB maka data diperbarui (password, nama, profile, IP, dll) + sync ulang ke RADIUS. Hasil import sekarang menampilkan `X Dibuat · Y Diperbarui`.
- **Template isolasi gagal disimpan ("data gagal disimpan")** — Endpoint `PUT /api/settings/isolation/templates/[id]` menggunakan pola params lama (`params: { id: string }`) tanpa `await`. Di Next.js 15+ `params` adalah Promise, sehingga `params.id` menjadi `undefined` dan Prisma gagal update. Diperbaiki dengan mengubah semua handler (GET/PUT/DELETE) ke `params: Promise<{ id: string }>` + `const { id } = await params`.

### Files
- `src/app/api/pppoe/users/bulk/route.ts` — Fix ExcelJS cell parsing + upsert logic untuk existing users
- `src/app/admin/pppoe/users/page.tsx` — Tampilkan counter "Diperbarui" di hasil import
- `src/app/api/settings/isolation/templates/[id]/route.ts` — Fix async params Next.js 15

---

## [2.25.14] — 2026-05-01

### Fixed
- **FreeRADIUS log error "Server returned no data"** — `rlm_rest` mencatat error ini setiap kali API radius mengembalikan `{}` (JSON kosong tanpa attribute RADIUS). Diperbaiki dengan mengubah semua response pass-through menjadi HTTP 204 No Content. `rlm_rest` mengenali 204 sebagai "tidak ada atribut yang di-set" dan tidak mencatat error.
- **FreeRADIUS error "Connection failed: 7 / Opening connection failed"** — REST module tidak punya timeout, sehingga saat app di-restart (npm build + pm2 restart) FreeRADIUS menunggu indefinitely dan menumpuk duplicate packets. Diperbaiki dengan menambahkan `connect_timeout = 4` detik dan `timeout = 4-5` detik per-seksi di konfigurasi REST module.
- **FreeRADIUS "Ignoring duplicate packet ... unfinished request in component authorize module rest"** — Akibat tidak adanya timeout di REST module. Setelah timeout ditambahkan, FreeRADIUS cepat fail-over ke SQL module (karena `-rest` non-fatal) tanpa menunggu.
- **Post-auth: voucher expired mengembalikan HTTP 403 dengan JSON non-RADIUS** — Response `{success: false, error: "Voucher expired"}` tidak dipahami rlm_rest. Diperbaiki menjadi RADIUS attribute format: `{"control:Auth-Type": "Reject", "reply:Reply-Message": "Voucher Kadaluarsa"}`.
- **FreeRADIUS REST `retry_delay` dikurangi** — Dari 30 detik menjadi 10 detik agar koneksi ke app pulih lebih cepat setelah restart.

### Added
- **Export PPPoE: filter status pembayaran** — Dropdown filter "Bayar" di halaman Pelanggan PPPoE dengan opsi: Semua, Sudah Bayar, Belum Bayar, Isolir. Filter berlaku untuk export Excel, PDF, dan CSV.
- **Export PPPoE: kolom Password di Excel dan PDF** — Password PPPoE sekarang disertakan di ekspor Excel dan PDF untuk keperluan backup/recovery (sebelumnya hanya tersedia di ekspor CSV).
- **Export PPPoE: filter paymentStatus di API** — Endpoint `/api/pppoe/users/export` dan `/api/pppoe/users/bulk?type=export` mendukung query param `paymentStatus=paid|unpaid|isolated` menggunakan join tabel Invoice.

### Files
- `freeradius-config/mods-available/rest` — Tambah `connect_timeout`, `timeout` per-seksi, kurangi `retry_delay`
- `src/app/api/radius/authorize/route.ts` — Pass-through responses → HTTP 204
- `src/app/api/radius/post-auth/route.ts` — Pass-through responses → HTTP 204, fix expired reject format
- `src/app/api/radius/accounting/route.ts` — Response → HTTP 204
- `src/app/api/pppoe/users/export/route.ts` — Tambah paymentStatus filter + kolom password
- `src/app/api/pppoe/users/bulk/route.ts` — Tambah paymentStatus filter pada type=export
- `src/app/admin/pppoe/users/page.tsx` — Filter UI "Bayar" + pass paymentStatus ke semua export handler

---

## [2.25.13] — 2026-05-01

### Fixed
- **Password PPPoE tidak berubah saat approval pembayaran manual** — Ditambahkan diagnostic logging di approval handler untuk membuktikan bahwa `pppoe_users.password` tidak berubah saat pembayaran disetujui. Perubahan yang terlihat di `radcheck.value` adalah perilaku yang disengaja (sinkronisasi RADIUS). Ditambahkan `autoComplete="new-password"` di modal edit user untuk mencegah browser autofill mengisi field password secara diam-diam.
- **Gambar bukti pembayaran manual tidak tampil** — URL gambar yang tersimpan di DB adalah path relatif (`/uploads/...`) sehingga komponen `Image` Next.js tidak bisa merendernya. Diperbaiki dengan membangun URL absolut menggunakan `NEXT_PUBLIC_BASE_URL` sebelum dikirim ke client.
- **Error approval pembayaran manual (500)** — Prisma update `manualPayment.status` gagal karena field `updatedAt` tidak ada di schema. Diperbaiki dengan menghapus field `updatedAt` dari data update.
- **Logo APK mobile tidak tampil** — Aset icon APK tidak ter-resolve dengan benar. Diperbaiki path resolusi icon.

### Changed
- **Diagnostic logging approval manual payment** — Log password sebelum dan sesudah transaksi approval agar dapat diverifikasi via `pm2 logs`.

### Files
- `src/app/api/manual-payments/[id]/route.ts` — Diagnostic logging + fix `updatedAt` field
- `src/components/UserDetailModal.tsx` — `autoComplete="new-password"` pada field password

---

## [2.25.12] — 2026-04-30

### Added
- **Backup & Restore GenieACS Config** — Tombol Backup dan Restore di halaman VP Scripts, Provisions, dan Presets. Format JSON, mendukung export per-tipe maupun backup semua sekaligus via `GET /api/genieacs/backup?type=all|vp|provisions|presets`. Restore via `POST /api/genieacs/backup`.

### Changed
- **Cache device list GenieACS 5 menit** — TTL cache device list ditingkatkan dari 60 detik ke 5 menit (stale-while-revalidate). Mengurangi load ke GenieACS NBI ~5x, response tetap instan.

### Files
- `src/app/admin/genieacs/vp-scripts/page.tsx` — Tombol Backup + Restore ditambahkan
- `src/app/admin/genieacs/provisions/page.tsx` — Tombol Backup + Restore ditambahkan
- `src/app/admin/genieacs/presets/page.tsx` — Tombol Backup + Restore ditambahkan
- `src/app/api/genieacs/backup/route.ts` — API endpoint baru (GET + POST)
- `src/app/api/settings/genieacs/devices/route.ts` — Cache TTL 60s → 300s

---

## [2.25.11] — 2026-05-02

### Added
- **Generate Tagihan Manual di Halaman Tagihan** — Tombol "Generate Tagihan" baru di header halaman `/admin/invoices`. Membuka dialog dengan opsi:
  - **Target**: Semua Pelanggan POSTPAID aktif, atau Satu Pelanggan (dengan pencarian nama/username/HP)
  - **Bulan Tagihan**: Picker bulan (`YYYY-MM`), default bulan berjalan
  - **Opsi**: Lewati jika tagihan bulan tersebut sudah ada (default aktif), Kirim notifikasi WhatsApp setelah generate
  - Setelah generate: tampilkan ringkasan (dibuat / dilewati / gagal) + detail error jika ada
- **API POST `/api/invoices/generate`** — Endpoint baru untuk generate tagihan manual. Mendukung `scope: 'all' | 'single'`, `targetMonth (YYYY-MM)`, `userId`, `skipExisting`, `sendWa`. Menghitung PPN otomatis sesuai profil. Due date = hari terakhir bulan target.

### Files
- `src/app/admin/invoices/page.tsx` — Dialog + tombol Generate Tagihan ditambahkan
- `src/app/api/invoices/generate/route.ts` — API endpoint baru

---

## [2.25.10] — 2026-05-01

### Changed
- **Redesign Form Tambah Pelanggan — 4 Tab Layout** — Form dibagi menjadi 4 tab: 📡 Akun RADIUS, 👤 Data Pelanggan, 🔧 Instalasi, ⚙️ Pengaturan. Navigasi via tombol Sebelumnya/Berikutnya + dot indicator. Tidak perlu scroll panjang. Tab menampilkan tanda hijau jika field wajib sudah terisi.
- **Support Pelanggan Tanpa Akun PPPoE** — Toggle "Punya Akun PPPoE / Tanpa Akun PPPoE" di tab Akun RADIUS. Jika dimatikan, username & password tidak wajib diisi — sistem auto-generate username `STATIC-{customerId}`. Cocok untuk pelanggan IP statis atau MAC-based. RADIUS sync dilewati kecuali `Framed-IP-Address` jika IP statis diisi.

### Files
- `src/app/admin/pppoe/users/new/page.tsx` — Rewritten with 4-tab layout
- `src/app/api/pppoe/users/route.ts` — Validation updated for optional PPPoE credentials
- `src/server/services/pppoe.service.ts` — Auto-generate username + skip RADIUS sync for static customers

---

## [2.25.9] — 2026-04-30

### Added
- **Subdomain Routing Frontend UI** — Admin → Settings → Subdomain Routing: halaman panduan interaktif untuk mengatur subdomain per portal (`customer.domain.com`, `agent.domain.com`, `teknisi.domain.com`, `admin.domain.com`). Input domain dinamis (auto-detect dari Base URL), tampilkan DNS records yang perlu ditambahkan, Nginx config siap pakai (bisa di-download .conf), panduan Certbot SSL, dan perintah test curl. Semua script bisa disalin dengan satu klik.
- **Subdomain Routing di Middleware (`proxy.ts`)** — Next.js middleware membaca header `Host`, parse subdomain, lalu `NextResponse.rewrite()` ke path portal yang sesuai tanpa redirect (URL tetap). Map: `customer`/`pelanggan` → `/customer`, `agent`/`agen` → `/agent`, `teknisi`/`technician` → `/technician`, `admin` → `/admin`.
- **Prorate Billing di Form Tambah Pelanggan PPPoE** — Untuk tipe POSTPAID: estimasi tagihan prorate dihitung otomatis (live) berdasarkan profil, tanggal jatuh tempo, dan tanggal daftar. Ditampilkan dalam kotak hijau "Estimasi Tagihan Pertama (Prorate)".
- **Info Alur Pembayaran di Form Tambah Pelanggan** — Kotak biru (POSTPAID) dan ungu (PREPAID) menjelaskan alur pembayaran 4-langkah, muncul otomatis sesuai pilihan tipe langganan.
- **Field Aksi Jatuh Tempo di Form Tambah Pelanggan** — Dropdown "⚡ Aksi Jatuh Tempo" di section Informasi Tambahan: pilih antara `ISOLIR INTERNET (Suspend)` atau `TETAP TERHUBUNG (No Action)`. Default: ISOLIR. Field ini sebelumnya tidak ada di form tambah pelanggan baru.
- **Entri nav sidebar: Subdomain Routing** — Menu Settings admin memiliki sub-menu baru "Subdomain Routing" di bawah Cloudflare Tunnel.

### Fixed
- **Isolasi PPPoE — user tetap online setelah expired** — Sebelumnya, user expired hanya diubah grup RADIUS ke `isolir` tapi session PPP lama tetap jalan. Fix 3-layer:
  1. **Langsung** (sebelum disconnect): API MikroTik tambahkan IP aktif ke address-list `isolir` → firewall `src-address-list=isolir action=drop` blokir internet saat itu juga.
  2. **CoA/disconnect**: disconnect PPP paksa re-auth.
  3. **Reconnect**: RADIUS kirim atribut `Mikrotik-Address-List=isolir` → MikroTik auto-add IP baru ke address-list.
- **Script MikroTik Setup Page — gunakan address-list bukan subnet** — Firewall filter dan NAT rules di halaman Setup MikroTik diubah dari `src-address=192.168.200.0/24` (subnet) ke `src-address-list=isolir` (address-list dinamis). Lebih presisi dan langsung efektif tanpa menunggu reconnect. PPP profile ditambah `use-mpls=no use-compression=no use-encryption=no`.
- **Export CSV PPPoE — kolom area, subscriptionType, billingDay hilang** — Export CSV kini menyertakan kolom `area`, `subscriptionType`, dan `billingDay`.
- **Form Tambah Pelanggan — field area, billingDay, registeredAt tidak ada** — Form tambah pelanggan baru kini menyertakan semua field yang diperlukan API.

### Files
- `src/proxy.ts` — subdomain routing middleware
- `src/app/admin/settings/subdomain/page.tsx` *(baru)* — UI panduan subdomain routing
- `src/app/admin/pppoe/users/new/page.tsx` — prorate billing, payment flow info, Aksi Jatuh Tempo field
- `src/app/api/pppoe/users/bulk/route.ts` — export CSV + kolom area/subscriptionType/billingDay
- `src/server/jobs/auto-isolation.ts` — isolasi langsung via address-list sebelum disconnect
- `src/server/services/radius/coa-handler.service.ts` — fungsi baru `addToMikrotikAddressList()`
- `src/app/api/settings/isolation/route.ts` — tambah `Mikrotik-Address-List` ke radgroupreply isolir
- `src/app/admin/settings/isolation/mikrotik/page.tsx` — script firewall/NAT pakai `src-address-list=isolir`
- `src/app/admin/AdminClientLayout.tsx` — nav entry Subdomain Routing
- `src/locales/id.json` — translation key `subdomainRouting`

---

## [2.25.8] — 2026-05-02

### Added
- **WAN Management di GenieACS Device Detail** — Halaman detail perangkat GenieACS kini mendukung manajemen koneksi WAN lengkap:
  - **Add WAN**: Tombol "Add WAN" di Quick Actions dan di header seksi WAN. Modal add menampilkan pemilihan Connection Type (PPPoE/IP), Nama koneksi, WANDevice index (port binding) 1–2, dan WANConnectionDevice index 1–8 untuk binding ke LAN port spesifik. Implementasi via GenieACS `addObject` diikuti `setParameterValues` pada instance baru.
  - **Edit WAN**: Edit username/password PPPoE, VLAN ID (0–4094), VLAN Priority (0–7), Service Type, dan toggle Enable/Disable per koneksi WAN. Implementasi via `setParameterValues` multi-parameter.
  - **Delete WAN**: Tombol hapus per kartu WAN, implementasi via GenieACS `deleteObject`.
  - **VLAN Configuration**: Set `X_HW_VLAN` (Huawei), `X_ZTE-COM_VLANIDMark`, `X_CMCC_VLANIDMark`, dan `X_HW_VLANPriority` dalam satu request.
  - **Service Type**: Pilihan INTERNET, TR069, VOIP, IPTV, INTERNET_TR069, OTHER — dikirim ke `X_HW_ServiceList` dan `X_ZTE-COM_ServiceList`.
  - **Port Binding**: WANDevice.{N} dan WANConnectionDevice.{N} bisa dipilih saat add WAN.
- **WAN Connection Display dengan Badge** — Kartu WAN menampilkan badge: service type (oranye), VLAN ID (cyan), connection type (abu), status connected/disconnected. Path TR-069 ditampilkan dalam teks monospace kecil.
- **In-Memory Cache untuk Device List GenieACS** — `GET /api/settings/genieacs/devices` kini menggunakan cache di level modul (PM2 process-persistent):
  - TTL 60 detik; response langsung dari cache saat masih fresh.
  - **Stale-while-revalidate**: Jika cache sudah kedaluwarsa, data lama langsung dikembalikan ke client (tanpa blocking) sambil refresh dilakukan di background secara async.
  - Cache key menggunakan hash `host:username` — otomatis invalid jika kredensial GenieACS berubah.
  - Response menyertakan field `fromCache: boolean` dan `cacheAge: number` (ms).
  - Strategi ini membuat halaman Perangkat GenieACS terasa instan setelah load pertama.

### API Files
- `src/app/api/settings/genieacs/devices/route.ts` — cache ditambahkan (module-level stale-while-revalidate)
- `src/app/api/genieacs/devices/[deviceId]/wan/route.ts` — API WAN baru (POST update, PUT add, DELETE)

### UI Files
- `src/app/admin/genieacs/devices/page.tsx` — WAN modal lengkap (add/edit/delete + VLAN/service/port binding)

---

## [2.25.7] — 2026-04-29

### Added
- **Halaman Cloudflare Tunnel Setup** — Admin → Settings → Cloudflare Tunnel: panduan langkah-langkah interaktif (6 step) install cloudflared di VPS, login, buat tunnel, simpan domain ke database, konfigurasi Nginx, dan verifikasi. Domain tunnel tersimpan ke `company.baseUrl` via API `POST /api/admin/cloudflare-tunnel`. Auto-compress backup >50MB sebelum kirim ke Telegram.
- **API `GET/POST /api/admin/cloudflare-tunnel`** — Endpoint baru untuk membaca status konfigurasi tunnel (`baseUrl`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`) dan menyimpan domain tunnel ke database.
- **Entry nav sidebar admin: Cloudflare Tunnel** — Menu Settings admin kini memiliki sub-menu "Cloudflare Tunnel" di antara Update Sistem dan Download APK.

### Fixed
- **Admin sidebar — semua halaman tema terang (light mode) perbaikan massal** — 62 halaman admin masih menggunakan warna neon cyberpunk (`#00f7ff`, `#bc13fe`, `#ff44cc`, dll.) tanpa prefix `dark:` sehingga teks/border/card tidak terbaca di light mode. Seluruh kelas diganti ke pola TailAdmin: title `text-foreground dark:text-transparent dark:bg-clip-text`, spinner `text-brand-500 dark:text-[#00f7ff]`, border `border-border dark:border-[#bc13fe]/30`, card `bg-card dark:bg-[#1a1525]/80`.

### Affected
- `src/app/admin/AdminClientLayout.tsx`
- `src/app/admin/settings/cloudflare-tunnel/page.tsx` *(baru)*
- `src/app/api/admin/cloudflare-tunnel/route.ts` *(baru)*
- `src/locales/id.json`
- 62 halaman admin (network, settings, tickets, notifications, dll.)

---

## [2.25.6] — 2026-04-28

### Fixed
- **Tema terang agent portal — seluruh teks/border neon tidak terbaca** — Halaman `vouchers`, `sessions`, dan `tickets` portal agen masih menggunakan warna hex neon (`#00f7ff`, `#bc13fe`, `#ff44cc`, `#00ff88`, dll.) yang di theme terang menjadi tidak terbaca karena di-override oleh `globals.css`. Seluruh warna tersebut diganti dengan pasangan class Tailwind standar yang aman untuk light dan dark mode.

### Added
- **Input lokasi GPS di form tiket agen** — Form "Buat Tiket" portal agen kini memiliki field tag lokasi (teks manual) dan tombol GPS yang mengambil koordinat dari browser (`navigator.geolocation`). Lokasi dan link Google Maps otomatis disisipkan ke deskripsi tiket agar teknisi lebih mudah menemukan lokasi pelanggan.

### Changed
- **Redesign UI agent/vouchers — pure Tailwind dark/light** — Loading spinner, container utama, filter controls, mobile cards, desktop table, pagination, dan dialog WhatsApp semuanya diperbarui ke class Tailwind standar (`bg-white dark:bg-slate-800/60`, `border-slate-200 dark:border-slate-700`, status badge `bg-emerald-100 text-emerald-700`, dll.).
- **Redesign UI agent/sessions — pure Tailwind dark/light** — Header, tombol refresh, stats cards (cyan/emerald/pink), search bar, daftar sesi (mobile card + desktop table) diperbarui; upload `text-emerald-600 dark:text-emerald-400`, download `text-pink-600 dark:text-pink-400`.
- **Redesign UI agent/tickets — pure Tailwind dark/light** — Header, tombol "Buat Tiket", form tiket, filter status, daftar tiket, chat bubble, dan reply box diperbarui dari neon gradient ke `from-violet-600 to-cyan-600`; active filter `bg-violet-100 dark:bg-violet-500/20`.

### Affected
- `src/app/agent/vouchers/page.tsx`
- `src/app/agent/sessions/page.tsx`
- `src/app/agent/tickets/page.tsx`

---

## [2.25.5] — 2026-04-28

### Added
- **APK Android: notifikasi native dengan suara, getaran & floating** — APK WebView kini menyertakan `NotificationChannel` (Android 8+), JavaScript bridge (`Android.showNotificationWithTag`) yang terhubung ke service worker push event (`PUSH_RECEIVED`), serta `NotificationWorker` berbasis WorkManager yang polling `/api/notifications` setiap 15 menit di background. Notifikasi tampil dengan prioritas HIGH, suara default, getaran, dan heads-up notification bahkan saat aplikasi ditutup.
- **Logo square 1:1 di semua halaman** — Semua container logo (login Admin/Customer/Technician/Agent, sidebar admin, settings company, download APK, halaman isolated) kini menggunakan rasio persegi (1:1) dengan `object-contain` sehingga logo 512×200 ditampilkan dalam kanvas 512×512 dengan letterbox — tidak distretch.

---

## [2.25.4] — 2026-04-28

### Added
- **Input lokasi GPS di form tiket pelanggan** — Halaman pembuatan tiket pelanggan kini mendukung tag lokasi, pengambilan koordinat GPS dari browser, dan penyisipan link Google Maps otomatis ke deskripsi tiket agar teknisi lebih mudah menemukan rumah pelanggan.
- **Tanggal Register editable untuk user PPPoE** — Form tambah dan edit user PPPoE kini menyediakan field `Tanggal Register` yang tersimpan ke `createdAt`, sehingga data historis pelanggan bisa dikoreksi tanpa manipulasi database manual.
- **Logo perusahaan di sidebar admin** — Sidebar admin kini menampilkan logo perusahaan secara langsung dengan fallback ke inisial jika logo belum tersedia.

### Fixed
- **CSV import/export PPPoE belum mendukung `registeredAt`** — Template CSV/XLSX, normalization map import, dan parsing data bulk kini mendukung `Tanggal Register` / `registeredAt` sehingga tanggal registrasi historis tidak lagi hilang saat impor massal.
- **Penyimpanan rate limit isolir ke tabel RADIUS tidak pernah update** — Endpoint pengaturan isolasi sebelumnya memakai `ON DUPLICATE KEY UPDATE` pada tabel `radgroupreply` yang tidak memiliki UNIQUE constraint. Diperbaiki ke pola `DELETE + INSERT` untuk atribut `Mikrotik-Rate-Limit`, `Mikrotik-Group`, dan `Framed-Pool`.
- **Label tanggal isolasi PPPoE masih memakai istilah kedaluwarsa** — Teks UI terkait `expiredAt` di form PPPoE dan detail user kini diseragamkan menjadi `Tanggal Isolir`.
- **Preview/logo branding belum konsisten di semua halaman** — Login Admin, Customer, Technician, Agent, halaman Isolated, Settings Company, dan Download APK kini memakai pola logo dinamis dengan `object-contain` dan batas layout ideal agar logo horizontal maupun vertikal tetap proporsional.

### Changed
- **Upload logo kini mendukung lebih banyak format** — Upload logo perusahaan sekarang menerima PNG, JPG, SVG, WebP, AVIF, dan GIF, dengan mapping ekstensi berbasis MIME type agar nama file hasil upload lebih konsisten.
- **Download APK memakai preview logo full-area** — Kartu logo pada halaman download APK kini memakai container preview lebih besar agar admin bisa melihat hasil branding secara proporsional sebelum build APK.
- **Versi aplikasi disinkronkan dengan changelog** — Metadata versi project dinaikkan ke `2.25.4` agar badge versi, package metadata, dan changelog tetap selaras.

### Affected
- `src/app/admin/AdminClientLayout.tsx`
- `src/app/admin/download-apk/page.tsx`
- `src/app/admin/login/page.tsx`
- `src/app/admin/pppoe/users/page.tsx`
- `src/app/admin/settings/company/page.tsx`
- `src/app/agent/page.tsx`
- `src/app/api/pppoe/users/bulk/route.ts`
- `src/app/api/settings/isolation/route.ts`
- `src/app/api/upload/logo/route.ts`
- `src/app/customer/login/page.tsx`
- `src/app/customer/tickets/create/page.tsx`
- `src/app/isolated/page.tsx`
- `src/app/technician/login/page.tsx`
- `src/components/UserDetailModal.tsx`
- `src/locales/id.json`
- `src/server/services/pppoe.service.ts`

## [2.25.3] — 2026-04-27

### Fixed
- **Nama perusahaan tidak terlihat di tema terang pada semua portal login role** — Beberapa halaman login menampilkan heading brand dengan gaya yang bisa kehilangan kontras di light mode (teks putih/gradient terhadap latar terang), sehingga nama perusahaan nyaris tidak terbaca. Diperbaiki dengan pola heading kontras yang konsisten (`text-slate-900` untuk light mode, `text-white` untuk dark mode) dan fallback nama perusahaan yang aman.

### Changed
- **Redesign UI login lintas role (Admin, Customer, Agent, Technician)** — Semua halaman login portal diseragamkan tata letaknya agar konsisten antar-role dan tetap responsif desktop/mobile.
  - Panel form login diseragamkan (`lg:w-[430px]`, background `bg-card`, batas `border-border`) untuk ritme visual yang sama.
  - Ditambahkan blok branding **"Nama Perusahaan"** di sisi form agar identitas tetap terbaca jelas pada tema terang maupun gelap.
  - Area hero kanan diperbarui dengan heading tunggal yang tegas + accent bar gradient per role untuk visual yang lebih clean dan kontras.
  - Gradien latar hero desktop dirapikan ke palet yang lebih lembut di light mode agar elemen teks tidak tenggelam.

### Affected
- `src/app/admin/login/page.tsx`
- `src/app/customer/login/page.tsx`
- `src/app/agent/page.tsx`
- `src/app/technician/login/page.tsx`

---

## [2.25.2] — 2026-04-26

### Added
- **WhatsApp Baileys — Native WhatsApp gateway built-in di VPS** — Provider baru `baileys` menggunakan library `@whiskeysockets/baileys` yang berjalan sebagai proses PM2 terpisah (`salfanet-wa`) di `127.0.0.1:4000`. Tidak perlu layanan pihak ketiga (Fonnte, WAHA, MPWA, dll).
  - `GET /api/whatsapp/providers/:id/qr` — Ambil QR code untuk scan WhatsApp Web
  - `GET /api/whatsapp/providers/:id/status` — Cek status koneksi (connected/disconnected)
  - `POST /api/whatsapp/providers/:id/restart` — Logout session & generate QR baru
  - `wa-service.js` — Express server standalone yang mengelola koneksi Baileys + generate QR (base64 PNG)
  - PM2 process `salfanet-wa` ditambahkan ke `production/ecosystem.config.js`
  - Auth session tersimpan di `/var/data/salfanet/baileys_auth` (persist across restart)
  - `vps-install/updater.sh` otomatis setup direktori auth + start `salfanet-wa`
- **QR Modal: success state + auto-refresh** — Setelah scan berhasil, modal WhatsApp QR menampilkan animasi centang hijau "WhatsApp Berhasil Terhubung!" beserta tombol tutup. Status provider card di-refresh otomatis tanpa reload halaman.

### Fixed
- **HTTP 400 saat QR belum siap (WAITING state)** — Saat Baileys masih inisialisasi (belum generate QR), `/qr` endpoint sebelumnya mengembalikan 400 → frontend tampil error dan tutup modal. Sekarang server balas 202 dengan `{ waiting: true }`, dan frontend otomatis retry setiap 2,5 detik dengan spinner loading tetap tampil.
- **Spinner menghilang saat WAITING** — Bug `finally { setQrLoading(false) }` selalu dieksekusi meskipun ada `return` di `try` block. Diperbaiki dengan flag `retrying` yang dideklarasi di luar `try` — `finally` hanya stop spinner jika `!retrying`.
- **Status tetap "terhubung" setelah device disconnect** — Saat perangkat melepas Linked Device dari HP, Baileys set status `logged_out` tapi tidak ada auto-reconnect. Klik tombol QR hanya mengembalikan WAITING tanpa pernah generate QR baru. Diperbaiki: endpoint `/qr` kini otomatis memanggil `connectToWhatsApp()` jika status `logged_out` atau `error`, sehingga QR baru muncul otomatis.
- **"Tidak dapat menautkan" saat scan QR** — WhatsApp menolak koneksi karena fingerprint browser `macOS Desktop` memicu deteksi bot. Diperbaiki dengan mengubah ke `Browsers.ubuntu('Chrome')` + `markOnlineOnConnect: false` + `connectTimeoutMs: 60000`.
- **`wa-service.js` crash: MODULE_NOT_FOUND `express`** — Modul `express` tidak ada di `node_modules` karena bukan dependency sebelumnya. Diperbaiki dengan menambahkan `"express": "^4.21.2"` ke `package.json` root.

### Changed
- **`whatsapp.service.ts`** — Menambahkan `'baileys'` ke union type provider dan method `sendViaBaileys()` yang memanggil `http://127.0.0.1:${WA_SERVICE_PORT}/send`
- **Dependencies tambahan di `package.json`** — `@whiskeysockets/baileys ^7.0.0-rc.9`, `pino ^10.3.1`, `express ^4.21.2`

---

## [2.25.1] — 2026-04-26

### Added
- **`vps-install/install-security.sh` — Modul keamanan server otomatis** — Script baru yang dipanggil di Step 8 installer dan setiap `updater.sh`. Memasang tiga lapisan perlindungan secara otomatis:
  - **fail2ban**: ban IP brute-force SSH setelah 5x gagal dalam 10 menit (ban 2 jam). Jail aktif: `sshd`, `nginx-http-auth`, `nginx-limit-req`. IP jaringan lokal (`192.168.x.x`, `10.x.x.x`) tidak pernah di-ban.
  - **UFW Firewall**: default deny semua incoming, allow hanya port yang dibutuhkan: 22/TCP (SSH), 80/TCP (HTTP), 443/TCP (HTTPS), 1812-1813/UDP (RADIUS), 3799/UDP (RADIUS CoA). Di-skip otomatis untuk LXC container (pakai Proxmox host firewall).
  - **Disk cleanup cronjob**: script `/usr/local/bin/salfanet-cleanup.sh` berjalan otomatis setiap hari jam 02:00. Membersihkan: journal systemd (max 200MB/7 hari), syslog lama, btmp (truncate jika >50MB), APT cache, tmp files, PM2 logs besar, Gradle cache >30 hari, APK build temp.
  - Bisa dijalankan manual: `bash vps-install/install-security.sh`
  - Log cleanup: `/var/log/salfanet-cleanup.log` (auto-trim jika >5MB)

### Fixed
- **Disk penuh 100% menyebabkan MySQL deadlock & API 500** — Disk VPS publik penuh akibat log systemd journal (~2.9GB) dan syslog (~2.2GB) menumpuk. MySQL tidak bisa commit karena disk penuh → semua query FreeRADIUS (`radpostauth`, `radacct`) stuck "waiting for handler commit" → Prisma connection pool exhausted (P2024) → semua API endpoint 500. Diatasi dengan cleanup log + install cronjob harian.
- **Build APK customer/technician/agent: connection pool exhausted saat 3 build serentak** — Menjalankan Gradle build untuk 3 role sekaligus menyebabkan VPS overload. Prisma connection pool (limit 10) habis karena server tidak bisa melayani request DB selama build berjalan. Build sebenarnya tetap berjalan di background; yang "berhenti" hanya tampilan UI karena polling API gagal 500.

### Changed
- **`vps-install/vps-installer.sh`: tambah Step 8 (Security)** — Installer utama kini memanggil `install-security.sh` secara otomatis setelah Step 7 (PM2 & Build). Instalasi baru langsung terlindungi fail2ban + UFW + cleanup cron tanpa langkah manual.
- **`vps-install/updater.sh`: security check saat setiap update** — Setiap kali `bash updater.sh` dijalankan, script memastikan: (1) cleanup cronjob terpasang, (2) fail2ban dalam keadaan running. Idempotent — aman dijalankan berulang kali.

### Fixed
- **Self-heal login pasca update GitHub (legacy install)** — `updater.sh` kini menjalankan `vps-install/fix-auth-after-update.sh` setelah `prisma db push` untuk mencegah kasus gagal login setelah update pada instalasi lama. Perbaikan otomatis meliputi:
  - Migrasi akun dari tabel legacy `admin_user` ke `admin_users` jika `admin_users` kosong
  - Menjamin minimal ada 1 akun `SUPER_ADMIN` aktif
  - Membuat fallback `superadmin` hanya jika database benar-benar kosong
- **Self-heal PM2 app mode** — `updater.sh` kini mendeteksi proses PM2 legacy yang masih jalan via `next start`/`npm start`, lalu migrasi otomatis ke `.next/standalone/server.js` dari `ecosystem.config.js`.

---

## [2.25.0] — 2026-04-26

### Added
- **Build APK Android langsung di server VPS** ([`91a45d5`]) — Fitur baru di halaman `/admin/download-apk`: build APK Android Kotlin (WebView wrapper) langsung di server menggunakan Gradle, tanpa perlu upload ke GitHub atau install Android Studio. APK tersimpan di server dan bisa didownload kapan saja.
  - `GET /api/admin/apk/trigger` — cek ketersediaan Java JDK dan Android SDK di server
  - `POST /api/admin/apk/trigger?role=admin|customer|technician|agent` — mulai build di background (detached process, tidak timeout)
  - `GET /api/admin/apk/status?role=...` — polling status build: `idle` / `building` / `done` / `failed` / `stale`
  - `GET /api/admin/apk/file?role=...` — download APK hasil build
  - UI polling otomatis setiap 3 detik selama build berjalan
  - Deteksi stale build: jika status masih `building` setelah 15 menit, otomatis ditandai `stale`
  - Panduan install Android SDK ditampilkan di UI jika environment belum siap (copy-able bash command)
  - Fallback ZIP download tetap tersedia via collapsible section
- **Setup Android SDK di VPS** (manual, satu kali) — Jalankan command berikut via SSH sebelum menggunakan fitur build:
  ```bash
  apt-get update && apt-get install -y openjdk-17-jdk wget unzip && \
  mkdir -p /opt/android/cmdline-tools && \
  wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O /tmp/cmdtools.zip && \
  unzip -q /tmp/cmdtools.zip -d /opt/android/cmdline-tools && \
  mv /opt/android/cmdline-tools/cmdline-tools /opt/android/cmdline-tools/latest && \
  yes | /opt/android/cmdline-tools/latest/bin/sdkmanager --licenses && \
  /opt/android/cmdline-tools/latest/bin/sdkmanager "platforms;android-34" "build-tools;34.0.0" && \
  echo 'export ANDROID_HOME=/opt/android' >> /etc/environment && \
  echo 'Selesai!'
  ```
  Build pertama ±3–5 menit (download Gradle dependencies). Build berikutnya ±1 menit (Gradle cache di `/var/data/salfanet/gradle-cache`).

---

## [2.24.0] — 2026-04-26

### Removed
- **Update otomatis via web panel dihapus** ([`4692059`]) — Fitur update via browser (SSE live log, tombol Apply Update / Force Rebuild) dihapus karena tidak reliable: bash script `update.sh` selalu mati saat `pm2 stop` dipanggil dari dalam Next.js process group, menyebabkan `.next` terhapus dan server 502 yang harus dipulihkan manual. File yang dihapus:
  - `scripts/update.sh` — script update yang dipanggil via API
  - `src/app/api/admin/system/update/route.ts` — SSE API endpoint (GET stream + POST trigger)
  - Halaman `/admin/system` diganti menjadi halaman **Informasi Sistem** statis: versi, commit, Node.js, uptime, banner update tersedia, dan panduan SSH siap-copy untuk update manual

### Fixed
- **`vps-install/updater.sh`: default ke `--branch master`** ([`5aa05b7`]) — Menjalankan `bash updater.sh` tanpa flag sebelumnya masuk ke Mode B (GitHub Releases) yang langsung error 404 karena repo tidak menggunakan GitHub Releases. Sekarang jika tidak ada `--branch` maupun `--version`, script otomatis pakai `--branch master`.

---

## [2.23.0] — 2026-04-26

### Removed
- **Coordinator role dihapus sepenuhnya** ([`e0cd701`]) — Role coordinator adalah fitur yang tidak pernah selesai diimplementasi. Semua endpoint API tidak pernah dibuat, sehingga halaman-halamannya selalu error. File yang dihapus:
  - `src/app/coordinator/` — seluruh direktori portal coordinator (dashboard, tasks)
  - `src/app/admin/coordinators/` — halaman manajemen coordinator di admin panel
  - `src/locales/id.json` — key `coordinator`, `coordinatorLogin`, `manageCoordinators`, namespace `"coordinator"` (~40 key), dan `"senderType_COORDINATOR"` dihapus
  - `src/app/admin/tickets/[id]/page.tsx` — `COORDINATOR` dihapus dari `SenderType` union type dan dari objek styling `getSenderBadgeColor()`
- **Firebase Admin SDK & FCM dihapus** ([`fdc730b`]) — Seluruh integrasi Firebase Cloud Messaging dihapus. Push notification kini menggunakan VAPID Web Push murni (tidak ada dependency firebase-admin). File yang dihapus: `src/server/push.service.ts`, `firebase-service-account.json`. Stub `firebase-admin` di `src/lib/` digantikan dengan implementasi VAPID native.

### Added
- **`src/cron/runner.ts` — Cron runner baru berbasis tsx** ([`fdc730b`]) — Menggantikan `cron-service.js` (Node.js CJS) dengan TypeScript runner yang dijalankan via `npx tsx`. 16 cron jobs diload dari satu entry point, distributed locking tetap aktif. FreeRADIUS Health Check berjalan 5 detik setelah startup.
- **`production/ecosystem.config.js` — Template konfigurasi PM2** ([`fdc730b`]) — File baru sebagai source of truth untuk konfigurasi PM2. `salfanet-cron` kini berjalan sebagai proses fork (`npx tsx src/cron/runner.ts`) dengan `NODE_OPTIONS: '--conditions=react-server'` (wajib agar `server-only` package tidak throw di luar Next.js).
- **`vps-install/cleanup-refactor.sh` — Script cleanup instalasi lama** ([`f71256c`], [`c41f44f`]) — Script idempotent untuk membersihkan file-file stale dari instalasi sebelum refactor. Fitur:
  - Support `--dry-run` (preview tanpa hapus)
  - Phase 1: cleanup Firebase/FCM push service, firebase-service-account.json
  - Phase 3: sync `ecosystem.config.js` dari `production/` (migrasi cron-service.js → tsx runner)
  - Phase 8: hapus `src/app/coordinator/`, `src/app/admin/coordinators/`
  - Auto-deteksi jika `salfanet-cron` masih pakai `cron-service.js` → migrate ke tsx runner otomatis
  - Usage: `bash vps-install/cleanup-refactor.sh [--dry-run] [--app-dir=/path]`

### Changed
- **`scripts/update.sh`: refactor-aware** ([`f71256c`]) — Update script (dipanggil via admin panel → `/api/admin/system/update`) ditingkatkan:
  - Setelah `git reset --hard`, otomatis copy `production/ecosystem.config.js` → root (file ini untracked, tidak tereset oleh git)
  - Cleanup stale files dari Phase 1-8 refactor (push.service.ts, coordinator, firebase, dll.) di setiap update
  - PM2 cron restart: jika `ecosystem.config.js` berubah → `pm2 delete` + `pm2 start` ulang (bukan sekedar `pm2 restart`)
  - `pm2 save` otomatis setelah restart
- **`vps-install/updater.sh`: refactor-aware** ([`f71256c`]) — CLI update script ditingkatkan:
  - `npm ci` dengan fallback ke `npm install --production=false` jika lock file tidak sinkron (umum terjadi setelah refactor)
  - Copy `production/ecosystem.config.js` setelah `git clean -fd`
  - Cleanup stale files refactor (list sama dengan update.sh)
  - Copy static assets ke `.next/standalone` setelah build
  - PM2 cron: deteksi perubahan script → `pm2 delete` + `pm2 start` jika perlu

### Fixed
- **`cleanup-refactor.sh`: `set -e` safe** ([`c41f44f`]) — Fungsi `remove_path()` sebelumnya `return 1` saat file tidak ditemukan → script keluar prematur karena `set -e`. Diperbaiki ke `return 0`. Kondisi `diff` juga diperbaiki (inversi `!` yang salah menyebabkan ecosystem.config.js tidak pernah disync).

---

## [2.22.0] — 2026-04-26

### Added
- **Script `scripts/backup-freeradius-local.sh`** ([`8652ea4`]) — Script bash untuk membuat arsip `.tar.gz` seluruh direktori `/etc/freeradius/3.0/` ke `backups/freeradius/` dengan nama file bertimestamp (`freeradius-config-YYYYMMDD-HHMMSS.tar.gz`). Otomatis cleanup backup lama (simpan 10 terbaru). Output baris `BACKUP_FILE: <nama>` di akhir agar UI polling bisa deteksi selesai. Script sebelumnya tidak ada sehingga tombol "Buat Backup" selalu gagal dengan error `Script not found`.

### Fixed
- **Restore FreeRADIUS: error "same file" saat restore `mods-enabled/`** ([`c268123`]) — File `mods-enabled/sql` dan `mods-enabled/rest` di FreeRADIUS adalah **symlink** ke `../mods-available/sql`. Saat tar mengekstrak backup, symlink tetap sebagai symlink. Perintah `cp symlink dest` gagal karena keduanya resolve ke file fisik yang sama (`cp: ... are the same file`). Fix: cek tipe file via `stat -c '%F'` sebelum restore — jika `symbolic link`, gunakan `ln -sf <target> <dest>` alih-alih `cp`.
- **Build VPS: OOM (Out of Memory) saat fase TypeScript check** ([`0aee02f`]) — Build `npm run build` menjalankan TypeScript type-checker (`tsc`) setelah compile selesai. Pada VPS 4GB dengan PM2 berjalan, proses `tsc` membutuhkan heap hingga 1.6GB dan di-kill oleh OOM killer (`FATAL ERROR: Ineffective mark-compacts near heap limit`). Fix: set `typescript.ignoreBuildErrors: true` di `next.config.ts` untuk skip fase `tsc` saat build produksi (type error tetap terdeteksi di development/editor).
- **Build VPS: OOM saat build karena PM2 mengonsumsi RAM** ([`08eba82`]) — PM2 process salfanet-radius mengonsumsi ~500MB RAM saat berjalan. Dengan heap build 1536MB (bawaan `npm run build`), total RAM yang dibutuhkan melebihi 4GB. Fix: `update.sh` kini stop PM2 sebelum build dan gunakan `npm run build:low-mem` (heap 1024MB). PM2 distart kembali setelah build selesai (atau gagal).
- **Build VPS: script baru tidak executable setelah `git reset --hard`** ([`8ce6421`]) — Script yang ditambahkan via commit baru tidak otomatis dapat izin execute di VPS setelah `git reset --hard`. Fix: tambah `chmod +x scripts/*.sh` di `update.sh` setelah git reset.
- **VPN Client: list tidak refresh setelah tambah client** ([`b55d3e6`]) — Setelah berhasil tambah WireGuard atau L2TP client, list VPN tidak diperbarui otomatis. Fix: panggil `loadClients()` di success path WireGuard dan L2TP.
- **VPN Client: modal tidak menutup / formData tidak ter-reset setelah submit** ([`b55d3e6`]) — Form WireGuard menggunakan `formData.name` setelah `formData` di-clear sehingga nama yang dikirim ke credentials dialog kosong. Fix: simpan nama ke variabel lokal `peerName` sebelum clear, gunakan `peerName` di credentials dialog.
- **VPN Client: IP pool tidak bisa dipakai ulang (orphan WG peers)** ([`288a094`]) — Peer WireGuard yang dihapus dari DB tetap tersisa di `wg.conf`. Saat tambah client baru, `nextAvailableIp` membaca `wg.conf` dan skip IP yang sebenarnya sudah bebas. Fix: tambah langkah cleanup orphan peers di `wg.conf` (compare dengan DB) sebelum alokasi IP baru.
- **VPN Client delete: peer tidak dihapus dari `wg.conf` di VPS** ([`db9ae7a`]) — Handler DELETE untuk `vpnServerId === '__vps_wg_server__'` hanya menghapus record DB tanpa menghapus `[Peer]` di `wg0.conf`. Fix: tambah call ke `POST /api/network/vps-wg-peer` dengan `action: 'remove'` sebelum delete DB.
- **Auto-create NAS/router saat tambah VPN client WireGuard** ([`701bfb7`]) — Endpoint `vps-wg-peer` secara otomatis membuat NAS record dan router saat tambah peer. Fix: hapus blok auto-create — NAS dikelola terpisah.
- **Auto-create NAS/router saat tambah VPN client L2TP** ([`8303308`]) — Sama seperti WireGuard, endpoint `vps-l2tp-peer` juga membuat NAS otomatis. Fix: hapus blok auto-create.
- **Panel redundansi di halaman VPN Client & VPN Server masih tampil** ([`8303308`], [`096d446`]) — Panel "Setup RADIUS Redundancy" yang sudah diputuskan untuk dihapus masih ter-render karena ada sisa JSX dan komponen stub. Fix: komponen `VpnServerRedundancyPanel` dijadikan stub `return null`, semua JSX orphan dibersihkan.

### Changed
- **`update.sh`: safe zero-downtime update** ([`08eba82`], [`8ce6421`], sesi ini) — Perbaikan menyeluruh pada script update:
  - `.env` di-backup ke `/tmp/salfanet-env-backup-<timestamp>` sebelum `git reset --hard` (extra safety meski `.env` ada di `.gitignore`)
  - Jika `.env` hilang setelah git reset, otomatis restore dari backup terakhir
  - Cleanup direktori orphan dari deployment lama (`srcappadmin`, `srclocales`, dll.) otomatis tiap update
  - PM2 `reload` (rolling zero-downtime) tetap digunakan saat restart — sesi PPPoE/Hotspot aktif tidak terputus oleh update kode
  - PM2 direstart (safety net) bahkan jika build gagal — server tidak dibiarkan mati
  - Tmp env backup lama (>7 hari) dibersihkan otomatis
  - Komentar safety guarantee ditambahkan di header script

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
