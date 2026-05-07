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

### v2.29.25 — 2026-05-11

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

### v2.29.23 — 2026-05-10

### Added
- **Realistic ZTE C320 chassis diagram** — Halaman detail OLT kini menampilkan diagram front-panel chassis ZTE C320 dengan semua 18 slot: MCU-A (slot 0), 14 service card slots (1–14), 2 uplink slots (15–16, GICF), MCU-B (slot 17), plus FAN dan PWR di kiri/kanan. Setiap slot menampilkan card type label (GTGQ/GTGH/GTGO/GICF/MCUD1), grid port berwarna (hijau=online, oranye=partial, merah=offline, hitam=kosong), dan slot kosong ditampilkan gelap. Chassis disertai panel detail per-port (persentase online, avg RX power) di bawahnya
- **ONU registration modal** — Tombol "Register" muncul di kolom aksi tabel ONU untuk ONU yang berstatus `auth_failed` (unregistered). Tombol membuka modal yang menampilkan: form ONU ID, ONU type (ZTE-F609, F660, F673, F600W, CZTE, All, dll), VLAN, TCONT profile (1G/100M/50M/20M/10M), deskripsi, serta preview command Telnet yang akan dikirim ke OLT
- **ONU register API** (`POST /api/olt/[id]/onus/register`) — Endpoint baru yang membangun dan mengirim command registrasi ZTE via Telnet (`configure terminal → interface gpon-olt → onu … type All sn … → tcont → gemport → service-port → exit/end`) menggunakan `executeMultipleCommands()`
- **Telnet multi-command** (`executeMultipleCommands()` di `telnet.ts`) — Fungsi baru yang membuat expect script untuk mengirim banyak command sekaligus ke OLT via sesi Telnet, menunggu prompt `[>#]` setelah setiap command
- **Chassis API** (`GET /api/olt/[id]/chassis`) — Endpoint baru yang mengembalikan layout slot chassis ZTE C320 beserta data per-port dari DB dan SNMP

### Changed
- **ONU action column** — Untuk ONU unregistered (`auth_failed`), kolom aksi menampilkan tombol "Register" (hijau) alih-alih tombol "Reboot"
- **Port diagram tab** — Diganti dari layout grup horizontal lama (`OLTPortDiagram`) ke komponen `ZTEChassisView` baru yang realistis

### Files
- `src/app/admin/olt/[id]/page.tsx` — Ganti `OLTPortDiagram`/`getOLTTemplate` dengan `ZTEChassisView`; tambah `ONURegisterModal`; tambah state `registeringOnu`; tombol Register di tabel ONU
- `src/app/api/olt/[id]/onus/register/route.ts` — **NEW** POST endpoint registrasi ONU via Telnet
- `src/app/api/olt/[id]/chassis/route.ts` — **NEW** GET endpoint layout chassis
- `src/lib/olt/telnet.ts` — Tambah `executeMultipleCommands()`

### v2.29.22 — 2026-05-09

### Added
- **ONU description/name (ZTE V2.1)** — `discoverPonV21()` kini fetch nama ONU dari `zxAnGponOnuCfgTable` col 2 (`.3.28.1.1.2.{ponIndex}.{onuId}`) secara paralel, disimpan ke kolom `description` di DB, dan ditampilkan sebagai kolom "Name" di tabel ONU pada halaman detail OLT
- **ONU distance (ZTE V2.1)** — Jarak ONU ke OLT diambil dari `zxAnGponOnuRegTable` col 21 (`.3.50.12.1.1.21.{ponIndex}.{slot}.{onuId}`) dalam satuan meter, disimpan ke DB, dan ditampilkan sebagai kolom "Distance" di tabel ONU
- **Unregistered ONU discovery (ZTE V2.1)** — Setelah menemukan ONU terdaftar, `discoverPonV21()` kini juga walk tabel `zxAnGponOnuDiscoveredInfoTable` (`.3.27.4.1.1.{ponIndex}`) untuk menemukan semua ONU yang terdeteksi OLT tetapi belum diregistrasi, ditambahkan dengan status `unregistered` (→ DB: `auth_failed`)
- **Parallel SNMP fetches (ZTE V2.1)** — Pengambilan oper-state, serial, RX power, description, dan distance dilakukan secara paralel menggunakan `Promise.all()` per ONU untuk mempercepat polling

### Changed
- **ONU table columns** — Halaman detail OLT kini menampilkan kolom "Name" (deskripsi ONU) dan "Distance" di tabel ONU list; status `auth_failed` kini ditampilkan sebagai "Unregistered" (bukan "Auth failed")
- **`poller.ts` upsertONU** — Kini menyimpan field `description` dari SNMP; `distance` dan `txPower` menggunakan `onu.distance`/`onu.txPower` sebagai fallback jika data optik tidak tersedia

### Files
- `src/lib/olt/vendors/zte.ts` — Update V21 constants (tambah `onuDescription`, `onuDistance`, `ZTE_V21_SEEN_ONU_TABLE`); rewrite `discoverPonV21()` dengan parallel fetch + unregistered ONU discovery
- `src/lib/olt/poller.ts` — `upsertONU()` simpan `description`, gunakan `onu.distance`/`onu.txPower` sebagai fallback
- `src/app/admin/olt/[id]/page.tsx` — Tambah field `description` di interface ONU; tambah kolom Name + Distance di tabel; fix label "Unregistered" untuk status `auth_failed`

### v2.29.21 — 2026-05-09

### Fixed
- **ONU discovery ZTE C320 V2.1.0 (CRITICAL)** — `discoverPonV21()` sebelumnya walk OID `.3.50.11.2.1.1` yang tidak ada di firmware V2.1.0, menyebabkan 0 ONU terdiskover. Kini menggunakan tabel registrasi yang telah diverifikasi live via SNMP: walk `zxAnGponOnuRegTable` col 1 (`.3.50.12.1.1.1.{ponIndex}`) untuk menemukan ONU terdaftar, lalu GET serial dari `zxAnGponOnuCfgTable` col 5 (`.3.28.1.1.5`), oper-state dari col 6 registrasi tabel (nilai 5=online), dan RX power dari col 10 (formula: `-(raw/1000)` dBm)
- **ONU RX power ZTE V2.1** — Kini membaca dari kolom 10 tabel registrasi (`3.50.12.1.1.10.{ponIndex}.{slot}.{onuId}`), disimpan sebagai integer positif dalam satuan 0.001 dBm, dikonversi dengan `-(raw/1000)`. Contoh: nilai 9501 → −9.501 dBm (valid GPON)
- **ZTE C320 template port count** — Template diagram ZTE C320 slot 1 diubah dari 8 menjadi 16 port agar sesuai dengan data SNMP aktual (16 PON port pada board 1). `getEffectivePortCount` tetap mengexpand lebih jauh jika ada ONU di port >15
- **Temperature/CPU/memory OIDs V2.1** — OID `C320_TEMP_V21/CPU/MEM` yang menunjuk ke tabel ONU yang salah kini diganti dengan alamat yang lebih tepat; jika tidak accessible, semua metrik return null dan UI menampilkan N/A dengan benar

### Files
- `src/lib/olt/vendors/zte.ts` — Update V21 OID constants; rewrite `discoverPonV21()` dengan OIDs terverifikasi dari SNMP live
- `src/app/admin/olt/[id]/page.tsx` — ZTE C320 template slot 1 portCount: 8 → 16

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
