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

### v2.29.28 — 2026-05-09

### Fixed
- **Unregistered ONU serial number** — Serial number ONU yang belum terdaftar (status `auth_failed`) kini tampil di UI. Fix 2 bug di `zte.ts`:
  1. Port 0-based vs 1-based: command Telnet `show pon onu uncfg gpon-olt_1/{board}/{pon-1}` — sebelumnya salah kirim `pon` (SNMP 1-based), sekarang benar kirim `pon-1` (CLI 0-based)
  2. Regex parser salah format: sebelumnya cari `gpon-onu_` (format ONU terdaftar), kini parse format aktual ZTE C320 — `gpon_olt-1/1/0  N/A  ZTEGDA5918AC  unknown` (field[2] = serial)
- **CPU/Memory/Temp display** — Panel ZTE Chassis kini menampilkan `—` (dash) alih-alih `N/A` untuk metrik yang tidak didukung hardware ZTE C320 V2.1, dengan tooltip penjelasan. Status card Temperature juga menampilkan `—` dan sub-label "Not available (C320)"

### Changed
- **OLT Detail page redesign** — Halaman `/admin/olt/[id]` diperbarui:
  - Status cards (4 kartu): tambah `border-l-4` dengan warna aksen per tipe (hijau/merah untuk status, amber untuk temp, biru untuk uptime, teal untuk ONU). Setiap kartu kini punya sub-label informatif (waktu polling terakhir, vendor, model, jumlah offline)
  - Header: tampilkan vendor badge, model, firmware version di subtitle IP address
  - Tabel ONU: status kini ditampilkan sebagai **pill badge** berwarna (hijau/kuning/merah/abu). Row hover fix dark mode (`dark:hover:bg-gray-800/50`). Header tabel punya `bg-gray-50 dark:bg-gray-900/60`. Padding semua cell konsisten (`py-2.5`). Kolom Actions rapi dengan `rounded-md` dan `transition-colors`
  - Cancel button di confirm-reboot kini support dark mode: `dark:bg-gray-700 dark:text-gray-300`
  - Tabel dibungkus `rounded-lg border border-gray-200 dark:border-gray-800`
- **Command preview block** — Terminal preview di modal Register ONU kini: background `bg-gray-950 dark:bg-black`, border `border-gray-800`, label uppercase tracking, fake blinking block cursor di akhir
- **Input caret color** — Field ONU ID dan VLAN di modal Register ONU kini explicit `caret-gray-900 dark:caret-white` agar cursor terlihat di semua tema

### Files
- `src/lib/olt/vendors/zte.ts` — Fix unregistered ONU serial: port 0-based + regex parser format ZTE C320
- `src/app/admin/olt/[id]/page.tsx` — Redesign status cards, header, ONU table, command preview, cursor color
- `package.json` — Bump ke 2.29.28

### v2.29.27 — 2026-05-08

### Added
- **Vendor-aware ONU Registration Modal** — Modal Register ONU di halaman OLT Detail kini otomatis menyesuaikan field dan preview command berdasarkan vendor OLT:
  - **ZTE C320** — ONU Type (All/ZTE-F6xx) + TCONT Profile (1G/100M/…) + Telnet CLI `configure terminal → interface gpon-olt → onu N type All sn SN → tcont/gemport/service-port → end`
  - **Huawei MA5608T/MA5800** — Line Profile ID + Service Profile ID + Telnet CLI `enable → config → interface gpon → ont add → service-port → quit`
  - **FiberHome AN5516/AN6010** — ONU Type (AN5506-04-FA/…) + Service Profile Name + Telnet CLI `enable → config → interface gpon-olt → onu add → onu profile → onu vlan → commit → exit`
- **Vendor-aware Register API** — `POST /api/olt/[id]/onus/register` kini membangun urutan command yang berbeda per vendor berdasarkan referensi `zte_command.py → register_onu_stepbystep()` dari oltc320_v2.1.1_linux
- **ZTE Telnet System Metrics (best-effort)** — Tambah `getSystemMetricsTelnet()` di `zte.ts` yang mencoba `show card` dan `show environment` via Telnet untuk parse CPU/Memory/Temp. Pada ZTE C320 V2.1 akan selalu return null (hardware tidak support), tapi tersedia untuk model ZTE lain (C600/C300)

### Notes
- ZTE C320 V2.1 CPU/Memory/Temp via Telnet tetap tidak tersedia — dikonfirmasi oleh oltc320_v2.1.1_linux CHANGELOG: "Removed unsupported CPU/memory/temperature monitoring". UI menampilkan N/A, perilaku ini sudah benar.

### Files
- `src/app/admin/olt/[id]/page.tsx` — ONURegisterModal rewritten: vendor-aware fields + preview; prop `vendor` ditambahkan ke render call
- `src/app/api/olt/[id]/onus/register/route.ts` — Full rewrite: vendor detection + per-vendor CLI command sequence
- `src/lib/olt/vendors/zte.ts` — Tambah `getSystemMetricsTelnet()` best-effort function

### v2.29.26 — 2026-05-08

### Fixed
- **OLT Management ONU count** — Halaman OLT Management (network/olts) sebelumnya selalu menampilkan "0 ONUs" karena API `GET /api/network/olts` tidak menyertakan `_count.onuStatuses`. Kini field `olt_onu_status` (jumlah ONU) dan `onu_stats` (online/offline) disertakan dari field `totalOnu` & `onlineOnu` yang sudah tersimpan di DB setelah polling
- **Password OLT tidak muncul** — Halaman Settings di OLT Detail (`/admin/olt/[id]`) selalu me-reset field password ke kosong saat halaman di-refresh. Kini password diambil dari API response dan ditampilkan. PUT handler juga diubah agar tidak menghapus password yang tersimpan jika field dikirim kosong (hanya update jika ada isi)
- **updater.sh clean build** — Tambah `rm -rf .next` sebelum `npm run build` di updater agar tidak ada artifact build lama yang menyebabkan update tidak efektif / lock file conflict
- **package.json version sync** — Versi di `package.json` kini diselaraskan dengan versi CHANGELOG (sebelumnya masih `2.29.20`)

### Files
- `vps-install/updater.sh` — Tambah `rm -rf .next` sebelum build
- `package.json` — Bump version ke `2.29.26`
- `src/app/api/network/olts/route.ts` — Tambah `_count.onuStatuses` + mapping `olt_onu_status` + `onu_stats`
- `src/app/admin/olt/[id]/page.tsx` — Load `password` dari API response di `fetchOLT`
- `src/app/api/olt/[id]/route.ts` — PUT: skip update password jika kosong

### v2.29.25 — 2026-05-08

### Fixed
- **ZTE C320 unregistered ONU discovery** — ONU yang belum diregister (tampak di seen-ONU table SNMP tapi tidak di reg table) kini berhasil di-discover dan disimpan ke DB dengan status `auth_failed`. Serial number diambil via **Telnet** (`show pon onu uncfg gpon-olt_1/{board}/{pon}`) karena SNMP cfg table tidak memiliki entry untuk ONU yang belum register. Parsing mendukung dua format output ZTE C320: `gpon-onu_1/1/1:2  ZTEGDA5918AC` dan `  2  ZTEGDA5918AC`
- **upsertONU serial update** — Kolom `serialNumber` kini ikut di-update ketika polling berikutnya berhasil mendapat serial (sebelumnya hanya disimpan saat create, tidak di-update)
- **discoverONUsSNMP telnet passthrough** — Fungsi `discoverONUsSNMP` kini menerima parameter `telnetConfig` opsional dan meneruskannya ke `discoverPonV21`, memungkinkan fetch serial via Telnet ketika OLT memiliki Telnet enabled
- **Poller telnet passthrough** — `pollOLT` kini meneruskan `telnetConfig` ke `discoverONUsSNMP` agar unregistered ONU dapat memiliki serial

### Files
- `src/lib/olt/vendors/zte.ts` — `discoverPonV21` + Telnet serial fetch untuk unregistered ONU; `discoverONUsSNMP` signature + telnetConfig passthrough
- `src/lib/olt/poller.ts` — Pass `telnetConfig` ke `discoverONUsSNMP`; update `serialNumber` di block update upsert

### v2.29.24 — 2026-05-07

### Changed
- **ZTE C320 chassis diagram redesign** — Ganti tampilan horizontal strip (slot chip berjejer) ke layout **vertical rack blade** ala NMS profesional: setiap slot ditampilkan sebagai baris horizontal (card label | port grid | slot number), FAN column di kiri dengan animasi, 6 stats card di header (Uptime, Chassis Temp, Avg CPU, Avg Memory, Active Cards, Fan Status), legend di bawah (Online/Disabled/Admin UP Port DOWN/LOS ONU/Unregistered), dan indikator LED PWR/SYS/ALM di header. Port squares 6×24px berwarna dengan dot di dalam (hijau=online, merah=LOS, oranye=partial, biru=uplink, kosong=slate). Badge kuning kecil muncul di atas port yang punya unregistered ONU.

### Files
- `src/app/admin/olt/[id]/page.tsx` — Rewrite `ZTEChassisView` dari horizontal chip → vertical rack blade NMS-style

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
