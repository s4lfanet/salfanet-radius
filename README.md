# SALFANET RADIUS - Billing System for ISP/RTRW.NET

Modern, full-stack billing & RADIUS management system for ISP/RTRW.NET with FreeRADIUS integration supporting PPPoE and Hotspot authentication.

> **Architecture:** pnpm monorepo — **Two Next.js apps** (frontend UI + backend API) + Baileys WhatsApp service
> **Version:** 4.0.0 — Two-Next.js-app architecture, realtime online/offline status, PPPoE reconnect fix

---

## 🤖 AI Development Assistant

**READ FIRST:** [docs/AI_PROJECT_MEMORY.md](docs/AI_PROJECT_MEMORY.md) — contains full architecture, VPS details, DB schema, known issues, and proven solutions.

---

## 🎯 Features

| Category | Key Capabilities |
|----------|-----------------|
| **RADIUS / Auth** | FreeRADIUS 3.0.26, PAP/CHAP/MS-CHAP, VPN L2TP/IPSec, PPPoE & Hotspot, CoA real-time speed/disconnect, **IP Pool management**, **Multi-NAS isolation** |
| **VPN Management** | MikroTik CHR via API, VPS built-in WireGuard & L2TP/IPsec peer management, configurable IP pool & gateway per protocol, auto-generated RouterOS scripts |
| **PPPoE Management** | Customer accounts, profile-based bandwidth, isolation, IP assignment, MikroTik auto-sync, foto KTP+instalasi via kamera HP, GPS otomatis, **realtime online/offline status (polling 10s)** |
| **IP Pool** | RADIUS ippool module — dynamic IP allocation per speed tier, pool create/expand/delete, Pool-Name → group mapping, utilization stats |
| **Data Usage Reporting** | Per-user bandwidth tracking (daily aggregation via cron), monthly summary, top consumers, GB upload/download per period |
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
| `salfanet-frontend` | cluster | 3000 | Next.js standalone (UI + NextAuth routes) |
| `salfanet-backend` | fork | 3001 | Next.js standalone (API routes + Prisma + services) |
| `salfanet-cron` | fork | — | Cron runner (calls backend APIs on schedule) |
| `salfanet-wa` | fork | 4000 (internal) | Baileys WA service |

### Auth Session

Session WhatsApp tersimpan di `/var/data/salfanet/baileys_auth/` dan persist meski PM2 restart. Untuk logout/scan ulang, klik **Restart Session** di admin panel.

---

## � RADIUS Enhancements (v3.1.0)

Diadopsi dari FreeRADIUS 3.2.8 schema (`home.pmynet.id-main` project).

### IP Pool Management (`/api/v1/ippool`)

Dynamic IP allocation via FreeRADIUS `ippool` module — tidak perlu IP static per user.

| Endpoint | Method | Fungsi |
|----------|--------|--------|
| `/api/v1/ippool` | GET | List semua pool dengan summary |
| `/api/v1/ippool/stats` | GET | Statistik global (total, allocated, free, utilization) |
| `/api/v1/ippool/:name` | GET | Detail pool + recent allocations |
| `/api/v1/ippool` | POST | Create pool (pool_name, network, start, end) |
| `/api/v1/ippool/expand` | PUT | Expand pool dengan IP tambahan |
| `/api/v1/ippool` | DELETE | Hapus pool (hanya jika tidak ada allocation) |
| `/api/v1/ippool/mappings/list` | GET | List Pool-Name → group mappings |
| `/api/v1/ippool/mappings` | POST | Map pool ke RADIUS group |
| `/api/v1/ippool/mappings/:id` | DELETE | Hapus mapping |

**Seed IP Pool per speed tier:**
```bash
cd frontend && npx prisma db seed -- --ippool
# Creates: 10Mbps-Pool, 20Mbps-Pool, 30Mbps-Pool, 50Mbps-Pool
# Each: 1022 IPs (/22 subnet) + auto-mapped to RADIUS groups
```

### Data Usage Reporting (`/api/v1/data-usage`)

Bandwidth tracking per user per period — diadopsi dari FreeRADIUS `process-radacct.sql`.

| Endpoint | Method | Fungsi |
|----------|--------|--------|
| `/api/v1/data-usage` | GET | Bandwidth per user untuk date range |
| `/api/v1/data-usage/monthly` | GET | Monthly summary per user (sorted by usage) |
| `/api/v1/data-usage/top` | GET | Top bandwidth consumers |
| `/api/v1/data-usage/aggregate` | POST | Manual trigger aggregation |

**Cron:** Daily at 00:05 — aggregate `radacct` → `data_usage_by_period` table.

### Multi-NAS Isolation

Username isolation per-NAS untuk ISP dengan multiple router/MikroTik:
- Column `nas_identifier` di `radcheck`, `radreply`, `radusergroup`
- Auto-sync dari `pppoeUser.routerId` saat sync ke RADIUS
- Memungkinkan username yang sama di router berbeda tanpa konflik

### CUI (Chargeable User Identity)

Persistent user tracking across sessions/NAS untuk billing & audit:
- Table `cui` (FreeRADIUS `cui` module)
- Unique identifier per user+IP+MAC combination

---

## �🚀 Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16 (App Router, standalone output) — UI + NextAuth |
| Backend | Next.js 16 (App Router, standalone output) — API routes + Prisma + services |
| Cron | Separate tsx runner (PM2 fork, calls backend APIs) |
| Language | TypeScript (shared types via @salfanet/shared-types) |
| Styling | Tailwind CSS |
| Database | MySQL 8.0 + Prisma ORM |
| RADIUS | FreeRADIUS 3.0.26 |
| Process Manager | PM2 (4 processes) |
| Reverse Proxy | Nginx (`/api/auth/*` → frontend, `/api/*` → backend, `/` → frontend) |
| Session Tracking | FreeRADIUS radacct + MikroTik /ppp/active (realtime polling) |
| Maps | Leaflet / OpenStreetMap |
| Package Manager | pnpm (monorepo workspaces) |

---

## 📁 Project Structure

```
salfanet-radius/                  # pnpm monorepo root
├── frontend/                     # Next.js — UI + NextAuth (port 3000)
│   ├── src/
│   │   ├── app/                  # Admin, agent, customer, technician portals
│   │   │   └── api/auth/         # NextAuth routes only
│   │   ├── components/           # Shared React components
│   │   ├── features/             # Vertical slices (queries, schemas)
│   │   ├── lib/api-client.ts     # Centralized API client (→ backend port 3001)
│   │   ├── locales/              # i18n (id, en)
│   │   └── hooks/                # React hooks (usePermissions, useTranslation, etc.)
│   ├── scripts/postbuild.js      # Copy static assets to standalone (monorepo)
│   └── package.json
├── backend/                      # Next.js — API + Prisma + services (port 3001)
│   ├── src/
│   │   ├── app/api/              # API route handlers (/api/pppoe, /api/invoices, etc.)
│   │   ├── server/               # Services (mikrotik, radius, cron, pppoe, billing)
│   │   │   ├── services/mikrotik/  # MikroTik API integration
│   │   │   ├── cron/               # Cron job logic
│   │   │   └── db/client.ts        # Prisma client
│   │   └── lib/api-response.ts    # Standard API response helpers
│   ├── prisma/                   # Prisma schema + migrations + seeds
│   ├── freeradius-config/        # FreeRADIUS config templates
│   ├── scripts/postbuild.js      # Copy static assets to standalone (monorepo)
│   ├── cron-runner.ts            # Standalone cron runner entry point
│   └── package.json
├── packages/                     # Shared TypeScript types
│   └── shared-types/
├── deploy/                       # Deployment configuration
│   ├── ecosystem.config.js       # PM2 config (4 processes: frontend, backend, cron, wa)
│   ├── nginx-salfanet.conf       # Nginx reverse proxy (2-app routing)
│   └── README.md
├── docs/                         # Documentation
├── frontend/vps-install/         # VPS installer scripts (installer, updater, uninstaller)
├── frontend/production/          # Production deployment configs
└── pnpm-workspace.yaml
```

---

## ⚙️ Installation

### Metode 1 — Git Clone (Recommended)

```bash
ssh root@YOUR_VPS_IP

git clone https://github.com/s4lfanet/salfanet-radius.git /root/salfanet-radius
cd /root/salfanet-radius
bash frontend/vps-install/vps-installer.sh
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
bash frontend/vps-install/vps-installer.sh
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
bash frontend/vps-install/vps-installer.sh --env lxc --ip 192.168.1.50
```

---

### Updating Existing Installation

Cara paling aman. **Semua data upload (logo, foto KTP pelanggan, bukti bayar) otomatis dipreservasi.**

```bash
bash /var/www/salfanet-radius/frontend/vps-install/updater.sh
```

Atau update dari branch terbaru secara manual:

```bash
cd /var/www/salfanet-radius
git pull origin master
pnpm install
cd backend && npx prisma generate && npx prisma db push && cd ..
cd frontend && npx prisma generate && cd ..
# Build both apps
cd backend && NODE_OPTIONS='--max-old-space-size=1536' npx next build && node scripts/postbuild.js && cd ..
cd frontend && NODE_OPTIONS='--max-old-space-size=1536' npx next build && node scripts/postbuild.js && cd ..
# Restart PM2
pm2 restart salfanet-frontend salfanet-backend salfanet-cron --update-env
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
pm2 status
pm2 logs salfanet-frontend --lines 50
pm2 logs salfanet-backend --lines 50
pm2 logs salfanet-cron --lines 50
pm2 restart salfanet-frontend salfanet-backend salfanet-cron --update-env

# FreeRADIUS
systemctl restart freeradius
freeradius -XC    # Test config
radtest 'user@realm' password 127.0.0.1 0 testing123

# Database
mysql -u salfanet_user -psalfanetradius123 salfanet_radius
mysqldump -u salfanet_user -psalfanetradius123 salfanet_radius > backup.sql

# Build (manual)
cd /var/www/salfanet-radius
cd backend && npx prisma generate && NODE_OPTIONS='--max-old-space-size=1536' npx next build && node scripts/postbuild.js && cd ..
cd frontend && NODE_OPTIONS='--max-old-space-size=1536' npx next build && node scripts/postbuild.js && cd ..
pm2 restart salfanet-frontend salfanet-backend --update-env
```

---

## 🧯 Troubleshooting Cepat

### 1) Website tidak bisa diakses dari IP VPS

Jika `Nginx` dan app sudah jalan di server tapi dari internet tetap tidak bisa akses, biasanya masalah ada di layer jaringan (NAT/forwarding/firewall external), bukan di aplikasi.

```bash
# Di VM/VPS guest
ss -tulpn | grep -E ':80|:443|:3000|:3001'
curl -I http://127.0.0.1:3000   # frontend
curl -I http://127.0.0.1:3001   # backend
curl http://127.0.0.1:3001/api/health  # backend health check
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
pm2 logs salfanet-frontend --lines 100
pm2 logs salfanet-backend --lines 100
cd /var/www/salfanet-radius
# Rebuild both apps
cd backend && NODE_OPTIONS='--max-old-space-size=1536' npx next build && node scripts/postbuild.js && cd ..
cd frontend && NODE_OPTIONS='--max-old-space-size=1536' npx next build && node scripts/postbuild.js && cd ..
pm2 restart salfanet-frontend salfanet-backend --update-env
```

### 3) API returns 404 (route not found)

Pastikan nginx routing benar — `/api/auth/*` → frontend (3000), `/api/*` → backend (3001):

```bash
nginx -T 2>&1 | grep -A2 'location.*api'
# Should show:
#   location /api/auth/  → proxy_pass http://127.0.0.1:3000
#   location /api/       → proxy_pass http://127.0.0.1:3001
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

## � Realtime Online/Offline Status

Status online/offline pelanggan PPPoE di admin page (`/admin/pppoe/users`) diperbarui otomatis setiap **10 detik** tanpa reload halaman.

**Cara kerja:**
1. Frontend polling `GET /api/pppoe/users/online-status` setiap 10 detik
2. Backend cek `radacct` (RADIUS users) + MikroTik `/ppp/active` (local users)
3. Frontend update `isOnline` field hanya jika ada perubahan (cegah unnecessary re-render)
4. Badge **"Live"** dengan indikator pulse di filter Sesi

**Endpoint:** `GET /api/pppoe/users/online-status?usernames=user1,user2,...`

Response:
```json
{ "online": ["user1", "user3"], "onlineCount": 2, "total": 5, "timestamp": "..." }
```

---

## 🔧 PPPoE Reconnect Setelah Payment

Saat pelanggan isolir dilunaskan (manual atau auto-renewal), sistem otomatis:

1. Update status user → `active`
2. Restore RADIUS `radcheck` (password) + `radusergroup` (profile group) dengan `nas_identifier`
3. Hapus entry isolir dari `radreply`
4. Restore `Framed-IP-Address` jika user punya IP static
5. Restore MikroTik PPP secret: enable + set profile ke group user (bukan `isolir`)
6. Kick session lama via MikroTik + RADIUS CoA disconnect
7. User reconnect otomatis dengan profile yang benar

**FreeRADIUS config penting:**
- `rest` module → `connect_uri = "http://localhost:3001"` (backend, bukan frontend)
- `sqlippool`, `sql`, `cuisql` di post-auth → non-fatal (`-` prefix) agar auth tetap berhasil jika pool gagal

---

## �📝 Changelog

Bagian ini otomatis sinkron dari `CHANGELOG.md` saat file changelog berubah di GitHub.

<!-- AUTO-CHANGELOG:START -->

### v4.0.0 — 2026-08-13

### Architecture — Two Independent Next.js Apps
- **Migrated from NestJS backend back to Next.js** — both frontend and backend are now Next.js 16 standalone apps
- `frontend/` (port 3000): UI pages, components, NextAuth authentication routes
- `backend/` (port 3001): API routes, Prisma, MikroTik services, RADIUS services, cron business logic
- `packages/shared-types/`: Shared TypeScript types between apps
- Frontend communicates with backend over HTTP via `lib/api-client.ts`
- Nginx routes: `/api/auth/*` → frontend (3000), `/api/*` → backend (3001), `/` → frontend (3000)
- PM2 processes: `salfanet-frontend`, `salfanet-backend`, `salfanet-cron`, `salfanet-wa`
- Cron runner: standalone tsx process that calls backend APIs on schedule
- Monorepo standalone build: `scripts/postbuild.js` copies static assets to nested standalone dirs

### Fixed — PPPoE Tidak Reconnect Setelah Payment dari Isolir
- **Root cause 1**: Isolir flow mengubah MikroTik PPP secret profile ke `isolir`, tapi payment restoration hanya update RADIUS tables tanpa restore PPP secret
- **Root cause 2**: FreeRADIUS `rest` module `connect_uri` masih ke port 3000 (frontend) — seharusnya port 3001 (backend). Setelah split, route `/api/radius/authorize` ada di backend
- **Root cause 3**: `sqlippool` di FreeRADIUS post-auth bersifat fatal — jika gagal allocate IP, Access-Accept berubah menjadi Access-Reject
- **Root cause 4**: Auto-renewal cron hanya update `status: 'active'` tanpa restore RADIUS/PPP secret untuk user yang sebelumnya isolated

#### Fixes Applied
- `backend/src/app/api/invoices/route.ts` (PUT): Tambah `managePppSecret` + `kickPppoeSession` + `nas_identifier` di RADIUS queries
- `backend/src/server/cron/invoice-jobs.ts`: Auto-renewal sekarang restore RADIUS + PPP secret untuk user isolated
- `backend/freeradius-config/mods-enabled/rest`: `connect_uri` → `http://localhost:3001` (backend)
- `backend/freeradius-config/sites-enabled/default`: `sqlippool`, `sql`, `cuisql` di post-auth → non-fatal (`-` prefix)
- Clear stale `radippool` entries yang expired

#### Verification
- User `muhammadluthfi@rw02`: Access-Accept dengan `Mikrotik-Group=PAKET 100MBPS`
- IP `192.168.14.2` dari `100mbps-pool` (bukan `pool-isolir`)
- MikroTik: ACTIVE, session tersimpan di `radacct` dengan `acctstoptime=NULL`

### Added — Realtime Online/Offline Status
- **New API endpoint**: `GET /api/pppoe/users/online-status` — lightweight endpoint yang hanya return set username online
  - Cek `radacct` (RADIUS auth users) + `batchListPppActive` (MikroTik local auth users)
  - Support filter `?usernames=` untuk restrict ke user yang ditampilkan saja
- **Frontend polling**: Setiap 10 detik, update `isOnline` field tanpa reload full data
  - Hanya trigger re-render jika ada perubahan status (cegah unnecessary renders)
  - Badge **"Live"** dengan indikator pulse di filter Sesi
- File: `backend/src/app/api/pppoe/users/online-status/route.ts`
- File: `frontend/src/app/admin/pppoe/users/page.tsx` — polling effect

### Updated — FreeRADIUS Configuration
- `rest` module: `connect_uri` diupdate dari `localhost:3000` → `localhost:3001` (backend API)
- `sites-enabled/default` post-auth: semua modules (`sql`, `sqlippool`, `cuisql`, `rest`) sekarang non-fatal
- Comment diupdate untuk reflect 2-app architecture

### Updated — Deployment Configuration
- `deploy/ecosystem.config.js`: 4 PM2 processes (frontend, backend, cron, wa)
- `deploy/nginx-salfanet.conf`: 2-app routing (`/api/auth/*` → 3000, `/api/*` → 3001, `/` → 3000)
- `frontend/production/ecosystem.config.js`: Updated untuk 2-app architecture
- `frontend/production/nginx-salfanet-radius.conf`: Updated untuk 2-app routing

### Updated — Installer/Updater/Uninstaller
- `frontend/vps-install/install-pm2.sh`: Build dan setup 2 Next.js apps terpisah
- `frontend/vps-install/updater.sh`: Build dan restart 2 apps + cron
- `frontend/vps-install/vps-uninstaller.sh`: Hapus 4 PM2 processes (frontend, backend, cron, wa)
- `frontend/vps-install/install-app.sh`: Install dependencies untuk frontend + backend
- `frontend/vps-install/install-nginx.sh`: 2-app routing + nested static paths
- `frontend/vps-install/vps-installer.sh`: Path `frontend/vps-install/`, 4 PM2 status

### v3.2.0 — 2026-08-12

### FreeRADIUS Server Configuration (Stage 1 — Verified on VPS)
- Enabled `sqlippool` module (SQL-backed IP pool, not file-based `rlm_ippool`)
- Enabled `cui` module with MySQL backend (`cuisql`)
- Imported stored procedure `fr_allocate_previous_or_new_framedipaddress`
- Configured `queries.conf` to use stored procedure for atomic IP allocation
- Added `sqlippool` + `cuisql` to `sites-enabled/default` post-auth section
- Added `sqlippool` to accounting section for lease release on STOP/ON/OFF
- Fixed `Pool-Name` attribute: moved from `radgroupreply` to `radgroupcheck`
- Verified with `radtest`: Access-Accept + `Framed-IP-Address` from pool
- Verified CUI table populated on auth
- FreeRADIUS config validation: `freeradius -XC` exit 0

### Admin UI (Stage 2)
- New page: `/admin/ippool` — IP Pool Management
- New page: `/admin/data-usage` — Data Usage Reports
- Added sidebar menu entries under FreeRADIUS group: IP Pool, Data Usage

### v2.34.9 — 2026-08-11

### Fixed
- **Admin sidebar "Log Aktivitas" menu returned 404** — Created `src/app/admin/logs/activity/page.tsx` and fixed `.gitignore` overly-broad `logs/` rule.

### v2.34.5 — 2026-08-11

### Removed
- **Go backend cleanup — full revert to pure Next.js** — Menghapus seluruh sisa eksperimen migrasi backend ke Go.

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
