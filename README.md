# SALFANET RADIUS - Billing System for ISP/RTRW.NET

Modern, full-stack billing & RADIUS management system for ISP/RTRW.NET with FreeRADIUS integration supporting PPPoE and Hotspot authentication.

> **Latest:** v2.25.2 — Native Baileys WhatsApp gateway built-in di VPS, QR modal auto-retry, auto-reconnect setelah device disconnect (Apr 26, 2026)

---

## 🤖 AI Development Assistant

**READ FIRST:** [docs/AI_PROJECT_MEMORY.md](docs/AI_PROJECT_MEMORY.md) — contains full architecture, VPS details, DB schema, known issues, and proven solutions.

---

## 🎯 Features

| Category | Key Capabilities |
|----------|-----------------|
| **RADIUS / Auth** | FreeRADIUS 3.0.26, PAP/CHAP/MS-CHAP, VPN L2TP/IPSec, PPPoE & Hotspot, CoA real-time speed/disconnect |
| **VPN Management** | MikroTik CHR via API, VPS built-in WireGuard & L2TP/IPsec peer management, configurable IP pool & gateway per protocol, auto-generated RouterOS scripts |
| **PPPoE Management** | Customer accounts, profile-based bandwidth, isolation, IP assignment, MikroTik auto-sync, foto KTP+instalasi via kamera HP, GPS otomatis |
| **Hotspot Voucher** | 8 code types, batch up to 25,000, agent distribution, auto-sync with RADIUS, print templates |
| **Billing** | Postpaid/prepaid invoices, auto-generation, payment reminders, balance/deposit, auto-renewal |
| **Payment** | Manual upload (bukti transfer), Midtrans/Xendit/Duitku gateway, approval workflow, 0–5 bank accounts |
| **Notifications** | WhatsApp (Fonnte/WAHA/GOWA/MPWA/Wablas/WABlast/**Kirimi.id**/**Baileys native**), Email SMTP, broadcast (outage/invoice/payment), webhook pesan masuk |
| **Agent/Reseller** | Balance-based voucher generation, commission tracking, sales stats |
| **Financial** | Income/expense tracking with categories, keuangan reconciliation |
| **Network (FTTH)** | OLT/ODC/ODP management, customer port assignment, network map, distance calculation |
| **GenieACS TR-069** | CPE/ONT management, WiFi config (SSID/password), device status & uptime |
| **Isolation** | Auto-isolate expired customers, customizable WhatsApp/Email/HTML landing page templates |
| **Cron Jobs** | 16 automated background jobs (tsx runner via PM2 fork), history, distributed locking, manual trigger |
| **Roles & Permissions** | 53 permissions, 5 portals (Admin/Customer/Agent/Technician + SuperAdmin) |
| **Activity Log** | Audit trail with auto-cleanup (30 days) |
| **Security** | Session timeout 30 min, idle warning, RBAC, HTTPS/SSL |
| **Bahasa** | Bahasa Indonesia (full) |
| **PWA** | Installable di semua portal (admin, customer, agent, technician), offline fallback, service worker cache |
| **Web Push** | VAPID-based browser push notifications, subscribe/unsubscribe toggle, admin broadcast |
| **System Update** | Update via SSH menggunakan `updater.sh`, tidak ada web-based update |
| **Mobile App** | Flutter customer portal (WiFi control, invoice, payment) |
| **WhatsApp Baileys** | Native WhatsApp gateway built-in VPS via `@whiskeysockets/baileys`, PM2 proses terpisah, scan QR langsung di admin panel, auto-reconnect |

---

## 📱 WhatsApp Baileys (Native Gateway)

Provider WhatsApp bawaan tanpa layanan pihak ketiga. Berjalan sebagai proses PM2 terpisah (`salfanet-wa`) di VPS.

### Setup

Provider Baileys otomatis di-setup saat menjalankan `updater.sh`. Tidak ada konfigurasi tambahan.

```bash
# Cek status wa-service
pm2 status
pm2 logs salfanet-wa --lines 20
```

### Cara Pakai

1. Buka **Admin → Pengaturan → WhatsApp → Penyedia**
2. Klik **+ Tambah Provider**, pilih tipe **Baileys**
3. Klik **QR Code** → scan dengan HP (WhatsApp → Linked Devices)
4. Setelah scan berhasil, modal menampilkan centang hijau konfirmasi
5. Provider siap digunakan untuk kirim notifikasi

### PM2 Processes

| Process | Mode | Port | Purpose |
|---------|------|------|---------|
| `salfanet-radius` | cluster | 3000 | Next.js app |
| `salfanet-wa` | fork | 4000 (internal) | Baileys WA service |
| `salfanet-cron` | fork | — | Background jobs |

### Auth Session

Session WhatsApp tersimpan di `/var/data/salfanet/baileys_auth/` dan persist meski PM2 restart. Untuk logout/scan ulang, klik **Restart Session** di admin panel.

---

## 🚀 Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 16 (App Router, standalone output) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | MySQL 8.0 + Prisma ORM |
| RADIUS | FreeRADIUS 3.0.26 |
| Process Manager | PM2 (cluster × 2) |
| Session Tracking | FreeRADIUS radacct (real-time) |
| Maps | Leaflet / OpenStreetMap |

---

## 📁 Project Structure

```
salfanet-radius/
├── src/
│   ├── app/
│   │   ├── admin/          # Admin panel
│   │   ├── agent/          # Agent/reseller portal
│   │   ├── api/            # API route handlers
│   │   ├── customer/       # Customer self-service portal
│   │   └── technician/     # Technician portal
│   ├── server/             # DB, services, jobs, cache, auth
│   ├── features/           # Vertical slices (queries, schemas, types)
│   ├── components/         # Shared React components
│   ├── locales/            # i18n translations (id, en)
│   └── types/              # Shared TypeScript types
├── prisma/
│   ├── schema.prisma       # Database schema (~45 models)
│   └── seeds/              # Seed scripts
├── freeradius-config/      # FreeRADIUS config (deployed by installer)
├── vps-install/            # One-command VPS installer scripts
├── production/             # PM2 & Nginx config templates
├── mobile-app/             # Flutter customer app
├── scripts/                # Utility & tuning scripts
└── docs/                   # Documentation & AI memory
```

---

## ⚙️ Installation

### Metode 1 — Git Clone (Recommended)

```bash
ssh root@YOUR_VPS_IP

git clone https://github.com/s4lfanet/salfanet-radius.git /root/salfanet-radius
cd /root/salfanet-radius
bash vps-install/vps-installer.sh
```

Installer akan berjalan **interaktif** — mendeteksi environment otomatis, memandu konfigurasi, lalu menjalankan semua step.

---

### Metode 2 — Upload Manual via SCP (Tanpa Akses Internet di Server)

```bash
# Jalankan di terminal LOKAL (bukan di server)
scp -r ./salfanet-radius root@YOUR_VPS_IP:/root/salfanet-radius

# SSH ke server, lalu jalankan installer
ssh root@YOUR_VPS_IP
cd /root/salfanet-radius
bash vps-install/vps-installer.sh
```

---

### Environment yang Didukung

| Environment | Flag | Akses |
|------------|------|-------|
| **Public VPS** (DigitalOcean, Vultr, Hetzner, AWS) | `--env vps` | Internet |
| **Proxmox LXC** | `--env lxc` | LAN/VLAN |
| **Proxmox VM / VirtualBox** | `--env vm` | LAN |
| **Bare Metal / Server Fisik** | `--env bare` | LAN |

```bash
# Contoh: paksa environment + IP
bash vps-install/vps-installer.sh --env lxc --ip 192.168.1.50
```

---

### Updating Existing Installation

Cara paling aman. **Semua data upload (logo, foto KTP pelanggan, bukti bayar) otomatis dipreservasi.**

```bash
bash /var/www/salfanet-radius/vps-install/updater.sh
```

Atau update dari branch terbaru secara manual:

```bash
cd /var/www/salfanet-radius
git pull origin master
npm install --legacy-peer-deps
npx prisma db push
npm run build
pm2 reload all
```

Lihat detail lengkap di [vps-install/README.md](vps-install/README.md).

---

### Data yang Aman Saat Update

| Data | Status |
|------|--------|
| Logo perusahaan (`public/uploads/logos/`) | ✅ Dipreservasi |
| Foto KTP & dokumen pelanggan | ✅ Dipreservasi |
| Bukti pembayaran | ✅ Dipreservasi |
| File `.env` (database, secrets) | ✅ Tidak disentuh |
| **Database MySQL (semua data pelanggan)** | ✅ Tidak disentuh |

---

### Default Credentials

| | |
|--|--|
| Admin URL | `http://YOUR_VPS_IP/admin/login` |
| Username | `superadmin` |
| Password | `admin123` |

⚠️ **Ganti password segera setelah login pertama!**

---

## 🔌 FreeRADIUS

Key config files at `/etc/freeradius/3.0/`:

| File | Purpose |
|------|---------|
| `mods-enabled/sql` | MySQL connection for user auth |
| `mods-enabled/rest` | REST API for voucher management |
| `sites-enabled/default` | Main auth logic (PPPoE realm support) |
| `clients.conf` | NAS/router clients (+ `$INCLUDE clients.d/`) |
| `sites-enabled/coa` | CoA/Disconnect-Request virtual server |

Config backup in `freeradius-config/` is auto-deployed by the installer.

### Auth Flow

**PPPoE:** `MikroTik → FreeRADIUS → MySQL (radcheck/radusergroup/radgroupreply)` → Access-Accept with Mikrotik-Rate-Limit

**Hotspot Voucher:** Same RADIUS path + `REST /api/radius/post-auth` → sets firstLoginAt, expiresAt, syncs keuangan

### RADIUS Tables

| Table | Purpose |
|-------|---------|
| `radcheck` | User credentials |
| `radreply` | User-specific reply attrs |
| `radusergroup` | User → Group mapping |
| `radgroupreply` | Group reply (bandwidth, session timeout) |
| `radacct` | Session accounting |
| `nas` | NAS/Router clients (dynamic) |

---

## ⏰ Cron Jobs (16 automated)

| Job | Schedule | Function |
|-----|----------|----------|
| Voucher Sync | Every 5 min | Sync voucher status with RADIUS |
| Disconnect Sessions | Every 5 min | CoA disconnect expired vouchers |
| Auto Isolir (PPPoE) | Every hour | Suspend overdue customers |
| FreeRADIUS Health | Every 5 min | Auto-restart if down |
| PPPoE Session Sync | Every 10 min | Sync radacct sessions |
| Agent Sales | Daily 1 AM | Update sales statistics |
| Invoice Generate | Daily 2 AM | Generate monthly invoices |
| Activity Log Cleanup | Daily 2 AM | Delete logs >30 days |
| Invoice Reminder | Daily 8 AM | Send payment reminders |
| Invoice Status | Daily 9 AM | Mark overdue invoices |
| Notification Check | Every 10 min | Process notification queue |
| Auto Renewal | Daily 8 AM | Prepaid auto-renew from balance |
| Webhook Log Cleanup | Daily 3 AM | Delete webhook logs >30 days |
| Session Monitor | Every 5 min | Security session monitoring |
| Cron History Cleanup | Daily 4 AM | Keep last 50 per job type |
| Suspend Check | Every hour | Activate/restore suspend requests |

All jobs can be triggered manually from **Settings → Cron** in the admin panel.

---

## � Android APK Builder

Buat APK Android (WebView wrapper) untuk 4 portal langsung di server VPS — tanpa GitHub Actions, tanpa Android Studio.

### 1) Setup Android SDK (satu kali via SSH)

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

> **Perkiraan waktu:** ~5–10 menit (download ~500MB). Disk yang dibutuhkan: ~2GB.

### 2) Build APK via Admin Panel

Buka **Admin → Download Aplikasi Android** → klik **Build APK** pada role yang diinginkan.

- Build berjalan di background (tidak timeout meski butuh beberapa menit)
- Status diperbarui otomatis setiap 3 detik
- Setelah selesai, tombol **Download APK** muncul

### 3) Build via API (opsional)

```bash
# Cek environment
curl http://YOUR_VPS/api/admin/apk/trigger

# Mulai build (role: admin | customer | technician | agent)
curl -X POST http://YOUR_VPS/api/admin/apk/trigger?role=customer \
  -H "Cookie: next-auth.session-token=..."

# Cek status
curl http://YOUR_VPS/api/admin/apk/status?role=customer

# Download APK
curl -OJ http://YOUR_VPS/api/admin/apk/file?role=customer \
  -H "Cookie: next-auth.session-token=..."
```

### Storage APK

| Path | Keterangan |
|------|------------|
| `/var/data/salfanet/apk/{role}/app.apk` | File APK hasil build |
| `/var/data/salfanet/apk/{role}/status.json` | Status & metadata build |
| `/var/data/salfanet/apk/{role}/build.log` | Log Gradle |
| `/var/data/salfanet/gradle-cache` | Cache Gradle (mempercepat build berikutnya) |

### Paket Aplikasi

| Role | Package ID | Warna |
|------|-----------|-------|
| Admin | `net.salfanet.admin` | Biru |
| Customer | `net.salfanet.customer` | Cyan |
| Technician | `net.salfanet.technician` | Hijau |
| Agent | `net.salfanet.agent` | Ungu |

---

## �🛠️ Common Commands

```bash
# PM2
pm2 status ; pm2 logs salfanet-radius
pm2 restart ecosystem.config.js --update-env

# FreeRADIUS
systemctl restart freeradius
freeradius -XC    # Test config
radtest 'user@realm' password 127.0.0.1 0 testing123

# Database
mysql -u salfanet_user -psalfanetradius123 salfanet_radius
mysqldump -u salfanet_user -psalfanetradius123 salfanet_radius > backup.sql
```

---

## 🧯 Troubleshooting Cepat

### 1) Website tidak bisa diakses dari IP VPS

Jika `Nginx` dan app sudah jalan di server tapi dari internet tetap tidak bisa akses, biasanya masalah ada di layer jaringan (NAT/forwarding/firewall external), bukan di aplikasi.

```bash
# Di VM/VPS guest
ss -tulpn | grep -E ':80|:443|:3000'
curl -I http://127.0.0.1:3000
curl -I http://127.0.0.1
systemctl status nginx --no-pager
pm2 status
```

Jika semua check local di atas OK, cek mapping di host Proxmox/router/cloud firewall:

1. `Public:2020 -> VM:22` (SSH)
2. `Public:80 -> VM:80` (HTTP)
3. `Public:443 -> VM:443` (HTTPS)

Catatan: `IP:2020` adalah port SSH, bukan URL web aplikasi.

### 2) PM2 jalan tapi web tetap blank/error

```bash
pm2 status
pm2 logs salfanet-radius --lines 100
cd /var/www/salfanet-radius
npm run build
pm2 restart ecosystem.config.js --update-env
```

### 4) Jalankan diagnosa Nginx otomatis dari installer

Installer Nginx terbaru menambahkan self-check internal (`127.0.0.1:3000`, `127.0.0.1`) dan best-effort check publik (HTTP/HTTPS).

```bash
cd /var/www/salfanet-radius
bash vps-install/install-nginx.sh
```

Jika warning menunjukkan HTTP publik tidak reachable, fokus perbaikan di NAT/port-forward/security-group, bukan di Next.js.

---

## 🔐 Security

```bash
# Firewall
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw allow 1812/udp && ufw allow 1813/udp && ufw allow 3799/udp
```

1. Change default admin password on first login
2. Change MySQL passwords in `.env`
3. Configure SSL (Let's Encrypt or Cloudflare)
4. Enable UFW

---

## 📡 CoA (Change of Authorization)

Sends real-time speed/disconnect commands to MikroTik without dropping PPPoE connections.

**MikroTik requirement:** `/radius incoming set accept=yes port=3799`

**API:** `POST /api/radius/coa` — actions: `disconnect`, `update`, `sync-profile`, `test`

Auto-triggered when: PPPoE profile speed is edited (syncs all active sessions).

---

## 📲 WhatsApp Providers

| Provider | Base URL | Auth |
|----------|----------|------|
| Fonnte | `https://api.fonnte.com/send` | Token |
| WAHA | `http://IP:PORT` | API Key |
| GOWA | `http://IP:PORT` | `user:pass` |
| MPWA | `http://IP:PORT` | API Key |
| Wablas | `https://pati.wablas.com` | Token |

---

## ⏱️ Timezone

| Layer | Timezone | Note |
|-------|----------|------|
| Database (Prisma) | UTC | Prisma default |
| FreeRADIUS | WIB (UTC+7) | Server local time |
| PM2 env | WIB | `TZ: 'Asia/Jakarta'` in ecosystem.config.js |
| API / Frontend | WIB | Auto-converts UTC ↔ WIB |

For WITA (UTC+8) or WIT (UTC+9): change `TZ` in `.env`, `ecosystem.config.js`, and `src/lib/timezone.ts`.

---

## 📋 Admin Modules

Dashboard · PPPoE · Hotspot · Agent · Invoice · Payment · Keuangan · Sessions · WhatsApp · Network (OLT/ODC/ODP) · GenieACS · Settings

**Roles:** SUPER_ADMIN · FINANCE · CUSTOMER_SERVICE · TECHNICIAN · MARKETING · VIEWER

---

## 📝 Changelog

Bagian ini otomatis sinkron dari `CHANGELOG.md` saat file changelog berubah di GitHub.

<!-- AUTO-CHANGELOG:START -->

### v2.25.15 — 2026-05-01

### Fixed
- **Import pelanggan PPPoE: username muncul sebagai `[object Object]`** — ExcelJS mem-parse cell yang berisi `@` (seperti `user@domain.id`) sebagai `CellHyperlinkValue` (`{ text, hyperlink }`). `String(cell.value)` menghasilkan `"[object Object]"` sehingga username salah terbaca. Diperbaiki dengan menangani semua tipe ExcelJS complex cell: hyperlink (ekstrak `.text`), richText (gabungkan `.richText[].text`), formula (ambil `.result`).
- **Import pelanggan PPPoE: semua baris gagal "Username already exists"** — Import sebelumnya hanya mendukung CREATE baru. File hasil Export berisi user yang sudah ada, sehingga semua baris gagal. Diperbaiki dengan logika **upsert**: jika username sudah ada di DB maka data diperbarui (password, nama, profile, IP, dll) + sync ulang ke RADIUS. Hasil import sekarang menampilkan `X Dibuat · Y Diperbarui`.
- **Template isolasi gagal disimpan ("data gagal disimpan")** — Endpoint `PUT /api/settings/isolation/templates/[id]` menggunakan pola params lama (`params: { id: string }`) tanpa `await`. Di Next.js 15+ `params` adalah Promise, sehingga `params.id` menjadi `undefined` dan Prisma gagal update. Diperbaiki dengan mengubah semua handler (GET/PUT/DELETE) ke `params: Promise<{ id: string }>` + `const { id } = await params`.

### Files
- `src/app/api/pppoe/users/bulk/route.ts` — Fix ExcelJS cell parsing + upsert logic untuk existing users
- `src/app/admin/pppoe/users/page.tsx` — Tampilkan counter "Diperbarui" di hasil import
- `src/app/api/settings/isolation/templates/[id]/route.ts` — Fix async params Next.js 15

### v2.25.14 — 2026-05-01

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

### v2.25.13 — 2026-05-01

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

### v2.25.12 — 2026-04-30

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

### v2.25.11 — 2026-05-02

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

<!-- AUTO-CHANGELOG:END -->

See full changelog: [docs/getting-started/CHANGELOG.md](docs/getting-started/CHANGELOG.md)

## 📚 Documentation

| File | Description |
|------|-------------|
| [docs/INSTALLATION-GUIDE.md](docs/INSTALLATION-GUIDE.md) | Complete VPS installation |
| [docs/GENIEACS-GUIDE.md](docs/GENIEACS-GUIDE.md) | GenieACS TR-069 setup & WiFi management |
| [docs/AGENT_DEPOSIT_SYSTEM.md](docs/AGENT_DEPOSIT_SYSTEM.md) | Agent balance & deposit |
| [docs/RADIUS-CONNECTIVITY.md](docs/RADIUS-CONNECTIVITY.md) | RADIUS architecture |
| [docs/FREERADIUS-SETUP.md](docs/FREERADIUS-SETUP.md) | FreeRADIUS configuration guide |

## 📝 License

MIT License - Free for commercial and personal use

## 👨‍💻 Development

Built with ❤️ for Indonesian ISPs

**Important**: Always use `formatWIB()` and `toWIB()` functions when displaying dates to users.
