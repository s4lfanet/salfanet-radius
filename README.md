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

### v2.29.4 — 2026-05-08

### Fixed
- **SQL migration: `ADD COLUMN IF NOT EXISTS` tidak didukung MySQL (hanya MariaDB)** — Semua file migration yang pakai syntax MariaDB-only ini sekarang dipecah menjadi satu `ALTER TABLE ADD COLUMN` per statement dan syntax `IF NOT EXISTS` dihapus. `CREATE TABLE IF NOT EXISTS` tetap digunakan (MySQL sudah support). File yang diperbaiki: `20251223_add_billing_fields.sql`, `20260228_add_registration_fields.sql`, `20260320_add_pppoe_profile_hpp_ppn.sql`, `20260421_add_vpn_pool_config.sql`, `20260506_add_olt_monitoring_tables.sql`, `add_wireguard_fields.sql`.
- **`apply_sql_migrations()` di `updater.sh`: migration gagal tidak dicatat, muncul ulang tiap update** — Sebelumnya file hanya dicatat ke APPLIED_LOG jika exit code 0; jika ada error (termasuk yang benign seperti ERROR 1060 duplicate column), file akan dijalankan ulang di setiap update. Sekarang: (1) `mysql --force` digunakan agar error di satu statement tidak menghentikan statement lainnya; (2) semua file selalu dicatat sebagai applied setelah dijalankan (prisma db push adalah source of truth untuk schema); (3) hanya error real (bukan 1060 duplicate column / 1061 duplicate index) yang ditampilkan ke user.
- **`CREATE INDEX IF NOT EXISTS` di migration billing** — Diganti dengan `CREATE INDEX` biasa (MySQL tidak support IF NOT EXISTS untuk INDEX; --force handle duplikasi).

### Files
- `vps-install/updater.sh` — `apply_sql_migrations()`: `mysql --force`, selalu mark applied, filter error 1060/1061
- `prisma/migrations/20251223_add_billing_fields.sql` — split ADD COLUMN, hapus IF NOT EXISTS
- `prisma/migrations/20260228_add_registration_fields.sql` — split ADD COLUMN, hapus IF NOT EXISTS
- `prisma/migrations/20260320_add_pppoe_profile_hpp_ppn.sql` — split ADD COLUMN, hapus IF NOT EXISTS
- `prisma/migrations/20260421_add_vpn_pool_config.sql` — hapus IF NOT EXISTS dari ADD COLUMN
- `prisma/migrations/20260506_add_olt_monitoring_tables.sql` — split 21 ADD COLUMN, hapus IF NOT EXISTS
- `prisma/migrations/add_wireguard_fields.sql` — hapus IF NOT EXISTS dari ADD COLUMN

### v2.29.3 — 2026-05-06

### Fixed
- **Invoice number: format seragam `INV-YYYYMMDD-XXXXXX` di semua tempat** — Sebelumnya ada 3 format berbeda yang dipakai secara tidak konsisten: `INV-YYYYMM-0001` (sequential counter — di cron generate & extend API), `INV-YYYYMM-A3F9B2C1` (8 char UUID prefix — di registrasi user baru & manual generate UI), dan `INV-YYYYMM-0001` (sequential counter dengan DB count — di import CSV). Sekarang semua tempat menggunakan format tunggal: **`INV-YYYYMMDD-XXXXXX`** (tanggal 8 digit + 6 karakter random uppercase hex). Tidak ada lagi DB query untuk hitung urutan; tidak ada lagi race condition pada concurrent invoice generation.

### Changed
- `generateInvoiceNumber()` di `invoice.service.ts` sekarang fungsi **sync** (tidak async), tidak lagi butuh Prisma DB count.

### Files
- `src/server/services/billing/invoice.service.ts` — `generateInvoiceNumber()`: format baru, sync, tidak perlu DB
- `src/server/services/pppoe.service.ts` — pakai `generateInvoiceNumber()` dari billing service
- `src/server/jobs/voucher-sync.ts` — pakai `generateInvoiceNumber()`; hapus `invoiceCount` DB query
- `src/app/api/invoices/generate/route.ts` — pakai `generateInvoiceNumber()`; hapus inline format
- `src/app/api/admin/invoices/import/route.ts` — hapus local `generateInvoiceNumber()`, pakai dari billing service
- `src/app/api/pppoe/users/[id]/extend/route.ts` — hapus `await` (fungsi sudah sync)

### v2.29.2 — 2026-05-06

### Fixed
- **Invoice PREPAID: window mulai dari hari ini (H+0), bukan H+invoiceGenerateDays** — Sebelumnya `prepaidStartDate = today + 7`, sehingga user yang jatuh tempo besok (misal May 7 saat today=May 6) tidak termasuk dalam query dan invoice tidak di-generate — bahkan saat manual trigger (force=true). Sekarang window dimulai dari H+0 sehingga semua user yang expire hari ini hingga 30 hari ke depan tercakup. Duplikasi dicegah oleh check `existingInvoice` yang sudah ada.
- **Invoice PREPAID force mode: window diperlebar 90 hari ke belakang** — Saat admin trigger manual (force=true), query PREPAID sekarang mencakup `H-90` hingga `H+30` sehingga semua user yang missed bisa di-catch-up sekaligus.
- **Invoice first-period check: gunakan validitas paket, bukan hardcode 31 hari** — Check `firstPeriodEnd = createdAt + 31 hari` memblokir semua user paket 30-hari (karena `expiredAt ≈ createdAt + 30` selalu ≤ `createdAt + 31`). Sekarang `firstPeriodEnd = createdAt + validityDays + invoiceGenerateDays`, di mana `validityDays` diambil dari profil user. Invoice baru di-skip jika user belum pernah renew (masih periode pertama); setelah renew, `expiredAt > firstPeriodEnd` dan invoice di-generate normal.
- **Invoice catch-up: juga include user ACTIVE yang expiredAt sudah lewat** — Sebelumnya catch-up hanya untuk status `isolated/blocked/suspended`. User ACTIVE yang statusnya belum terupdate tapi `expiredAt` sudah lewat tidak tercakup. Sekarang menggunakan `eligibleStatuses` (termasuk `active`) untuk catch-up query.

### Files
- `src/server/jobs/voucher-sync.ts` — `generateInvoices()`: fix PREPAID window start, force mode wide window, first-period check berbasis validitas paket, catch-up include active users

### v2.29.1 — 2026-05-06

### Fixed
- **GenieACS WiFi: task pending/fault tidak lagi menumpuk** — Sebelumnya `POST /api/genieacs/devices/[id]/wifi` mengirim 3 task terpisah (SSID, security mode, password). Hanya task pertama yang manfaatkan `connection_request`; task berikutnya masuk antrean dan bisa fault jika device offline di antara task. Sekarang semua parameter (SSID, mode, password) digabung dalam **1 task `setParameterValues`** → 1 connection request → device menerapkan semua sekaligus.
- **GenieACS WAN: vendor VLAN params tidak lagi memblokir koneksi** — Parameter vendor-specific (`X_HW_VLAN`, `X_ZTE-COM_VLANIDMark`, `X_CMCC_VLANIDMark`) berada dalam task yang sama dengan PPPoE username/password. Jika device tidak support salah satu path, seluruh task fault termasuk koneksi. Sekarang dipisah jadi task tersendiri (best-effort) — koneksi PPPoE tetap diterapkan meski VLAN vendor gagal.
- **GenieACS: stale task accumulation** — Setiap kali user ubah setting, task baru ditumpuk di atas task pending lama. Ditambah helper `clearPendingTasks()` yang membersihkan semua pending/fault task milik device sebelum task baru dikirim.
- **GenieACS: 202 response ditangani benar** — Status 200 = task langsung dieksekusi di device; 202 = task diantrekan (device akan terapkan pada sesi TR-069 berikutnya). Keduanya dianggap sukses dengan pesan berbeda. Tidak ada lagi error palsu saat device lambat merespons.
- **GenieACS WiFi: hapus `refreshObject` task yang redundan** — Setelah update, sebelumnya ada task `refreshObject` tambahan yang kirim connection request lagi tanpa manfaat nyata.

### Files
- `src/app/api/genieacs/devices/[deviceId]/wifi/route.ts` — POST: gabung 3 task → 1 task; tambah `clearPendingTasks()`; hapus `refreshObject`; handle 202
- `src/app/api/genieacs/devices/[deviceId]/wan/route.ts` — POST/PUT/DELETE: tambah `clearPendingTasks()`; pisah vendor VLAN ke task best-effort; handle 202; tambah field `executed` di response

### v2.29.0 — 2026-05-10

### Fixed
- **TSC errors in `poller.ts`** — 3 TypeScript errors (TS2352/TS2322) saat Prisma `JsonValue` di-cast ke custom types. Fixed dengan double-cast `as unknown as Type` dan `as unknown as Prisma.InputJsonValue`.
- **OLT Add/Edit form missing SSH/Telnet port fields** — Form OLT hanya punya checkbox `sshEnabled`/`telnetEnabled` tanpa input port. Ditambah input field "SSH Port" (22) dan "Telnet Port" (23) yang muncul kondisional saat enabled. Juga tambah SNMP Port (161).
- **OLT API tidak menyimpan field credentials** — `POST` dan `PUT` `/api/network/olts` hanya menyimpan `name, ipAddress, latitude, longitude, status, followRoad`. Sekarang juga menyimpan: `vendor, model, username, password, snmpCommunity, sshEnabled, telnetEnabled, sshPort, telnetPort, snmpPort`.
- **OLT Test Connection gagal untuk OLT baru** — Backend hanya menerima `oltId` (DB lookup). Sekarang juga menerima direct params (`ipAddress, username, password, snmpCommunity, sshPort, telnetPort, snmpPort`) sebagai fallback saat `oltId` tidak ada. Semua protocol (SNMP/SSH/Telnet) bisa ditest sekaligus tanpa harus simpan OLT dulu.
- **Telegram Health double-send race condition** — `startHealthCron()` dan `startBackupCron()` bisa dipanggil dua kali bersamaan (concurrent requests) karena `healthCronJob === null` diperiksa sebelum async DB await selesai. Fixed dengan mutex flag `healthCronStarting` / `backupCronStarting`.
- **GenieACS task timeout terlalu singkat** — WiFi route menggunakan `timeout=3000ms`, WAN route `timeout=5000ms`. Kedua dinaikan ke `timeout=30000ms` agar device yang lambat merespons tidak langsung fault.

### Files
- `src/lib/olt/poller.ts` — Fix TSC2352: `as unknown as RuleCondition[]`, `as unknown as RuleAction[]`, `as unknown as Prisma.InputJsonValue`
- `src/app/api/network/olts/route.ts` — POST/PUT: simpan semua field OLT termasuk credentials dan port
- `src/app/admin/network/olts/page.tsx` — Tambah `sshPort`, `telnetPort`, `snmpPort` ke state; tambah input fields SSH/Telnet port kondisional; pass port ke test-connection
- `src/app/api/olt/test-connection/route.ts` — Rewrite: terima direct params ATAU oltId; test semua protocol jika tidak ada protocol tertentu
- `src/server/jobs/telegram-cron.ts` — Tambah mutex flag `healthCronStarting`/`backupCronStarting` untuk cegah race condition double-send
- `src/app/api/genieacs/devices/[deviceId]/wifi/route.ts` — Timeout: 3000ms/5000ms → 30000ms
- `src/app/api/genieacs/devices/[deviceId]/wan/route.ts` — Timeout: 5000ms → 30000ms (semua 3 handler: POST/PUT/DELETE)

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
