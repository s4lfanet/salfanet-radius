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

### v2.34.5 — 2026-05-17

### Added
- **Go: 17 new handler files** — notifications, public, freeradius, invoices_ext, referrals, admin_users, technician_admin, activity_log, hotspot_ext, voucher_templates, ticket_ext, analytics, settings_ext, backup_handler, telegram_handler, push_handler, olt_ext
- **Go: Notification routes** — `GET/PUT /api/notifications`, `DELETE /api/notifications/:id`
- **Go: Public routes (no auth)** — `GET /api/public/company|areas|profiles|stats|payment-gateways`, `POST /api/public/upload-registration`
- **Go: FreeRADIUS management** — `GET /api/freeradius/status|logs|radcheck|config/list|config/read`, `POST /api/freeradius/start|stop|restart|radtest|config/save`
- **Go: Root-level invoice routes** — `GET/POST/DELETE /api/invoices`, counts, generate, export, send-reminder, send-reminders-bulk, by-token, PDF
- **Go: Referral routes** — `GET/PUT/DELETE /api/admin/referrals`, `GET/PUT /api/admin/referrals/config`
- **Go: Admin User CRUD** — `GET/POST/PUT/DELETE /api/admin/users/:id`, `GET/PUT /api/admin/users/:id/permissions`
- **Go: Technician Admin CRUD** — `GET/POST/PUT/DELETE /api/admin/technicians/:id`
- **Go: Activity Log** — `GET /api/admin/activity-logs`
- **Go: Hotspot extensions** — bulk generate/delete, export, resync, validate, send-whatsapp, delete-expired, rekap-voucher, agent balance/history
- **Go: Voucher Templates CRUD** — `GET/POST/PUT/DELETE /api/voucher-templates/:id`
- **Go: Ticket extensions** — categories CRUD, stats, messages, dispatch
- **Go: Analytics** — `GET /api/admin/analytics`, `GET /api/dashboard/analytics|traffic`
- **Go: Settings extensions** — email templates, test email, timezone, map settings, email history
- **Go: Backup** — history, create (mysqldump+gzip), delete, download, restore, telegram settings
- **Go: Telegram & Push notification routes**
- **Go: OLT alert management** — list, get, resolve; monitoring, metrics
- **Go: Health endpoint** — `GET /api/health`
- **Go: `generateID()` helper** — shared UUID generator in handlers package
### Fixed
- **ticket_ext.go** — `Preload("Customer")` (was `Preload("User")`), `assigned_to_id` column
- **invoices_ext.go** — `user.Profile.Price` direct access (Profile is not a pointer)
### Files
- `internal/api/handlers/helpers.go` — added `generateID()` helper
- `internal/api/handlers/notifications.go` — new
- `internal/api/handlers/public.go` — new
- `internal/api/handlers/freeradius.go` — new
- `internal/api/handlers/invoices_ext.go` — new
- `internal/api/handlers/referrals.go` — new
- `internal/api/handlers/admin_users.go` — new
- `internal/api/handlers/technician_admin.go` — new
- `internal/api/handlers/activity_log.go` — new
- `internal/api/handlers/hotspot_ext.go` — new
- `internal/api/handlers/voucher_templates.go` — new
- `internal/api/handlers/ticket_ext.go` — new
- `internal/api/handlers/analytics.go` — new
- `internal/api/handlers/settings_ext.go` — new
- `internal/api/handlers/backup_handler.go` — new
- `internal/api/handlers/telegram_handler.go` — new
- `internal/api/handlers/push_handler.go` — new
- `internal/api/handlers/olt_ext.go` — new
- `internal/api/router.go` — registered all 17 new handlers (~140 new routes)

### v2.34.4 — 2026-05-14

### Added
- **Sidebar: Permintaan Top-Up & Suspend** — tambah `nav.topupRequests` (`/admin/topup-requests`) dan `nav.suspendRequests` (`/admin/suspend-requests`) sebagai child PPPoE
- **Sidebar: ODC, ODP, Peta Jaringan** — tambah 3 item ke Topology: Network Map, ODC, ODP
- **Sidebar: Fiber ODC & Fiber ODP** — tambah ke seksi Manajemen Fiber
- **Sidebar: GenieACS Files** — tambah child `nav.files` ke seksi GenieACS
- **Sidebar: Kelola Teknisi** — tambah item standalone di catManagement
- **Sidebar: Log Aktivitas** — tambah item standalone di catManagement
- **Sidebar: Pengaturan Keamanan** — tambah child `/admin/settings/security` ke settingsMenu
- **Sidebar: WhatsApp jadi submenu** — ubah dari single link ke children (Settings, Riwayat, Template, Kirim, Notifikasi, Providers)
- **i18n: tambah nav keys** — `topupRequests`, `suspendRequests`, `activityLogs`, `security`, `fiberOdcs`, `fiberOdps`
### Files
- `src/app/admin/AdminClientLayout.tsx` — tambah menu items, WhatsApp jadi submenu, import UserCog
- `src/locales/id.json` — tambah 6 nav translation keys


### Added
- **Go: GenieACS proxy handler** — `POST /api/genieacs/devices/:deviceId/wifi` (TR-069 setParameterValues), `POST /api/genieacs/devices/:deviceId/connection-request`, `GET /api/genieacs/tasks`, `DELETE /api/genieacs/tasks/:taskId`
- **Go: GenieACS settings** — `GET/POST /api/settings/genieacs` (simpan host/username/password ke DB)
- **Go: Admin Employees full CRUD** — `GET /api/admin/employees` (enhanced: stats byRole, pagination, filters), `POST /api/admin/employees`, `PUT /api/admin/employees/:id`, `DELETE /api/admin/employees/:id`
- **Go: Job Assignments routes** — `GET /api/admin/job-assignments` (alias untuk jobH.List), `DELETE /api/admin/job-assignments/:id`
- **Go: GenieacsSettings model** — `genieacs_settings` table
### Files
- `internal/api/handlers/genieacs.go` — baru
- `internal/api/handlers/employees_admin.go` — baru
- `internal/api/handlers/jobs.go` — tambah DeleteJob
- `internal/db/models/extra.go` — tambah GenieacsSettings model
- `internal/api/router.go` — tambah semua routes batch 4

### v2.34.2 — 2026-05-13

### Added
- **Go: Manual Payments handler** — `GET/POST /api/manual-payments`, `PUT /api/manual-payments/:id` (approve/reject dengan extend expiry + buat transaction), `DELETE /api/manual-payments/:id`
- **Go: Jobs handler** — `GET/POST /api/admin/jobs`, `GET /api/admin/jobs/stats`, `GET /api/admin/jobs/:id`, `PATCH /api/admin/jobs/:id/status`
- **Go: Employees list** — `GET /api/admin/employees` (for job assignment dropdown)
- **Go: Users list with ODP/ODC filter** — `GET /api/users/list`
- **Go: Employee, JobAssignment, OdpCustomerAssignment models**
### Changed
- **Go: ManualPayment model** — updated sesuai schema actual (bankName, accountName, transferDate, reviewedBy, dll)
- **Go: PppoeUser model** — tambah Router + ODPAssignment relations
- **Go: NetworkODP model** — tambah Status field + ODC relation
### Fixed
- **Go: billing.go** — fix ManualPayment struct creation sesuai model baru
### Files
- `internal/api/handlers/manual_payments.go` — baru
- `internal/api/handlers/jobs.go` — baru
- `internal/api/handlers/pppoe.go` — tambah ListUsersForSelect
- `internal/db/models/models.go` — ManualPayment + PppoeUser update
- `internal/db/models/extra.go` — Employee, JobAssignment, OdpCustomerAssignment, NetworkODP update
- `internal/api/router.go` — manual-payments, jobs, employees, users/list routes

### v2.34.1 — 2026-05-13

### Added
- **Go: Inventory handler** — `GET/POST/PUT/DELETE /api/inventory/categories`, `/suppliers`, `/items`; `GET/POST /api/inventory/movements` dengan stock transaction
- **Go: Keuangan handler** — `GET/POST/DELETE /api/keuangan/transactions` (dengan stats totalIncome/Expense/balance), `GET/POST /api/keuangan/categories`, `GET /api/keuangan/export`
- **Go: InventoryCategory, InventoryItem, InventorySupplier, InventoryMovement models**
### Changed
- **Go: Transaction model** — tambah field `Reference`, `CreatedBy`, `JournalEntryID`; `CategoryID` jadi non-nullable string
### Files
- `internal/api/handlers/inventory.go` — baru
- `internal/api/handlers/keuangan.go` — baru
- `internal/db/models/extra.go` — inventory models + Transaction update
- `internal/api/router.go` — inventory + keuangan routes

### v2.34.0 — 2026-05-13

### Added
- **Go: Settings handler** — `GET/POST /api/settings/email`, `GET/PUT /api/settings/isolation`, `GET/PUT /api/settings/company` alias
- **Go: Permissions handler** — `GET /api/permissions`, `GET/PUT /api/permissions/role/:role`, `GET /api/permissions/role-templates`
- **Go: Customer portal extended** — 14 new endpoints: `/me`, `/dashboard`, `/packages`, `/auto-renewal`, `/notifications`, `/payment-history`, `/usage`, `/topup-request`, `/suspend-request` (GET/POST/DELETE), `/tickets` (GET/POST)
### Changed
- **Go: Ticket model** — update schema sesuai DB (`ticketNumber`, `customerId`, `customerName`, `description`, `categoryId`, dll); fix `CloseTicket` ke status `CLOSED`
- **Go: Company model** — tambah isolation fields (`isolationIpPool`, `isolationServerIp`, `isolationRateLimit`, dll) dan `bankAccounts`
- **Go: SuspendRequest model** — tambah `startDate`, `endDate`, `adminNotes`, `approvedAt`, `approvedBy`
- **Go: Customer portal** — fix `GetInvoices` query dari `user_id/created_at` ke `userId/createdAt`
### Added (models)
- `EmailSetting`, `Permission`, `RolePermission`, `Notification`, `TicketCategory` models
### Files
- `internal/api/handlers/settings.go` — baru
- `internal/api/handlers/permissions.go` — baru
- `internal/api/handlers/customer_portal.go` — extended (14 new methods)
- `internal/api/handlers/ticket.go` — fix Preload, status casing
- `internal/db/models/models.go` — Company + Ticket struct update
- `internal/db/models/extra.go` — SuspendRequest update + 5 new models
- `internal/api/router.go` — settings + permissions + customer portal routes

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
