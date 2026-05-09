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

### v2.31.3 — 2026-05-10

### Fixed
- **Postbuild: copy `.next/static` to standalone** — Static assets (CSS, JS, fonts) were returning 404/wrong MIME type because postbuild script did not copy `.next/static` into `.next/standalone/.next/static`; all browser console errors resolved
### Files
- `package.json` — postbuild now copies `.next/static` to `.next/standalone/.next/static`
- `baileys_whatsapp_patch/package.json` — same fix

### v2.31.2 — 2026-05-10

### Added
- **Next.js frontend deployed on VPS** — Full stack running at `http://103.151.140.110`: Go API backend (port 8080) + Next.js frontend (port 3000) behind nginx reverse proxy
- **Database schema migrated** — `prisma db push` applied all 100+ tables to MariaDB `salfanet_radius`; custom SQL migrations confirmed already included in schema
- **PM2 process management** — `salfanet-frontend` and `wa-service` managed by PM2, auto-start on boot via `pm2-root.service` systemd unit
- **nginx proxy updated** — `/api/*` → `:8080` (Go), `/ws/*` → `:8080` (Go), `/*` → `:3000` (Next.js)
- **Company seed data** — Initial company record seeded via `npm run db:seed:company`
### Files
- `nginx-frontend.conf` — nginx config template with frontend proxy
### Notes
- Admin login: `http://103.151.140.110/admin/login`
- Customer portal: `http://103.151.140.110/customer/login`
- API health: `http://103.151.140.110/api/system/health`

### v2.31.1 — 2026-05-10

### Fixed
- **CustomerAuthMiddleware** — Replace placeholder with real DB-backed session validation (`customer_sessions` table, token lookup, expiry check)
- **Customer OTP send** — Plug in `notify.SendOTP` in `CustomerLogin` handler (was TODO)
### Files
- `internal/api/middleware/auth.go` — `NewCustomerAuthMiddleware(db)` factory, real session DB lookup
- `internal/api/handlers/auth.go` — Import `notify` package, call `SendOTP` on customer login
- `internal/api/router.go` — Pass DB to `NewCustomerAuthMiddleware`
- `vps-install/wa-package.json` — Valid package.json for wa-service npm install on VPS

### v2.31.0 — 2026-05-10

### Added
- **Go backend Phase 2+ — Full API migration** — Complete Go backend covering all major feature domains. Zero Next.js dependency for API layer.
  - `internal/db/models/extra.go` — Extra GORM models: HotspotProfile, HotspotVoucher, Agent, AgentSale, AgentDeposit, TransactionCategory, Transaction, NetworkODC/ODP/OTB, PaymentGateway, RegistrationRequest, SuspendRequest, PushSubscription, WhatsappHistory, WhatsappReminderSetting, TicketReply
  - `internal/radius/radius.go` — FreeRADIUS service: direct MySQL manipulation (radcheck/radreply/radusergroup), isolate/unisolate, rate-limit upsert, session query
  - `internal/notify/whatsapp.go` — WA sidecar HTTP client (POST to wa-service.js :3001/send), phone normalization, invoice/payment/isolation/activation templates
  - `internal/cron/scheduler.go` — robfig/cron v3 scheduler (Asia/Jakarta TZ): generate invoices (00:01), send reminders (hourly), auto-isolate unpaid (00:05), sync voucher expiry (5min); manual trigger API; CronHistory tracking
  - `internal/api/handlers/pppoe.go` — PPPoE areas, profiles, customers, users CRUD + suspend/activate/isolate/unisolate + radius sync + registrations approve/reject
  - `internal/api/handlers/billing.go` — Invoices CRUD + pay (ManualPayment + WA notify) + monthly generation + transactions + payment gateway webhooks (Midtrans/Xendit/Duitku/Tripay)
  - `internal/api/handlers/radius.go` — RADIUS user management, active sessions, stats, soft disconnect
  - `internal/api/handlers/hotspot.go` — Hotspot profiles + voucher batch generation/management
  - `internal/api/handlers/agent.go` — Agent CRUD + sales/deposits + balance topup + voucher assignment
  - `internal/api/handlers/network.go` — Network map: OLT list + ODC/ODP/OTB/Router CRUD
  - `internal/api/handlers/whatsapp.go` — WhatsApp providers + templates + manual send + history + reminder settings
  - `internal/api/handlers/ticket.go` — Support tickets: list/create/get/update/reply/close
  - `internal/api/handlers/company.go` — Company settings get/update
  - `internal/api/handlers/cronhandler.go` — Cron history + manual job trigger API
  - `internal/api/handlers/customer_portal.go` — Customer self-service: profile, invoices, pay, push-subscribe
  - `internal/api/middleware/auth.go` — Added `CustomerAuthMiddleware` for customer portal
  - `internal/api/handlers/auth.go` — Added `AgentLogin` endpoint (phone + PIN → JWT)
  - `internal/api/router.go` — Full route wiring for all domains (PPPoE, Billing, Radius, Hotspot, Agent, Network, WhatsApp, Tickets, Company, Cron, Customer)
  - `cmd/server/main.go` — Wire FreeRADIUS service + cron scheduler into startup/shutdown lifecycle
  - `vps-install/install-go.sh` — Full VPS clean install script (Go 1.23, Node.js 20, PM2, Nginx, UFW, FreeRADIUS, systemd)
### Fixed
- `internal/api/handlers/helpers.go` — `pageParams` now accepts `fiber.Ctx` directly instead of a custom interface (Fiber v3 variadic `Query` signature)
- `internal/api/handlers/billing.go` — Removed redundant `strconv` import and workaround stub
### Files
- `internal/db/models/extra.go` — new
- `internal/radius/radius.go` — new
- `internal/notify/whatsapp.go` — new
- `internal/cron/scheduler.go` — new
- `internal/api/handlers/helpers.go` — updated
- `internal/api/handlers/pppoe.go` — new
- `internal/api/handlers/billing.go` — new (fixed)
- `internal/api/handlers/radius.go` — new
- `internal/api/handlers/hotspot.go` — new
- `internal/api/handlers/agent.go` — new
- `internal/api/handlers/network.go` — new
- `internal/api/handlers/whatsapp.go` — new
- `internal/api/handlers/ticket.go` — new
- `internal/api/handlers/company.go` — new
- `internal/api/handlers/cronhandler.go` — new
- `internal/api/handlers/customer_portal.go` — new
- `internal/api/middleware/auth.go` — updated
- `internal/api/handlers/auth.go` — updated (AgentLogin)
- `internal/api/router.go` — updated (full route wiring)
- `cmd/server/main.go` — updated (wire radius + cron)
- `vps-install/install-go.sh` — new

### Added
- **Go backend Phase 1 — OLT Monitoring** — Full Go backend scaffolded alongside the existing Next.js frontend. Compiles to a single binary (`bin/server.exe`), Fiber v3 HTTP framework, GORM (MySQL, shares existing DB), zerolog structured logging.
  - `cmd/server/main.go` — entrypoint with graceful SIGTERM/SIGINT shutdown
  - `internal/config/config.go` — godotenv-based config (all env vars from `.env`)
  - `internal/db/db.go` — GORM connection pool (25 max open, 10 idle, 5min lifetime)
  - `internal/db/models/` — GORM models mirroring Prisma schema (OLT, ONU, alerts, metrics, customers, invoices, …)
  - `internal/olt/snmp/` — gosnmp walk/get thin wrapper (thread-safe, per-call session)
  - `internal/olt/telnet/` — persistent Telnet pool (max 3 sessions/OLT, 30s keepalive)
  - `internal/olt/vendors/zte/` — ZTE C320 V2.1: concurrent SNMP walk + Telnet authoritative ONU discovery, register/deregister, ONU types, T-CONT profiles
  - `internal/olt/poller/` — per-OLT polling goroutines, DB upsert, alert detection, WebSocket broadcast
  - `internal/ws/hub.go` — WebSocket broadcast hub (fasthttp upgrader, OLT-scoped subscriptions)
  - `internal/api/` — Fiber v3 router, JWT Bearer middleware, auth/admin/OLT handlers
  - `Makefile`, `Dockerfile`, `docker-compose.yml`, `.air.toml` — build/deploy tooling
### Files
- `cmd/server/main.go` — new
- `internal/**/*.go` — new (24 files)
- `Makefile`, `Dockerfile`, `docker-compose.yml`, `.air.toml` — new

### v2.29.63 — 2026-05-09

### Fixed
- **Ghost ONU "N/A" unregistered dari SNMP stale seen-table** — Root cause: `ZTE_V21_SEEN_ONU_TABLE` SNMP walk mengembalikan ONU ID yang stale/pernah tersambung sebelumnya (bukan ONU fisik aktif). Code lama menambah SNMP IDs yang tidak ada di `uncfgSerials` Telnet sebagai entri kosong → tampil di UI sebagai ONU Unregistered ke-3 dengan serial "N/A". Fix: track `hadTelnetData` — jika globalUncfgMap sudah dibangun (Telnet global berhasil), jangan tambahkan ID dari SNMP seen-table. Telnet dipercaya sebagai sumber otoritatif. SNMP fallback hanya digunakan saat Telnet benar-benar tidak tersedia.
- **Per-port Telnet extra call saat globalUncfgMap tersedia** — `else if (globalUncfgMap?.has(portKey))` salah: jika port tidak ada di map (0 ONU uncfg), jatuh ke per-port Telnet call. Fix: cek `globalUncfgMap !== null` dulu.
### Files
- `src/lib/olt/vendors/zte.ts` — `discoverPonV21`: tambah `hadTelnetData` flag, fix kondisi globalUncfgMap check

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
