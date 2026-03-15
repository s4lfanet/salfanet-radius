# SALFANET RADIUS - Billing System for ISP/RTRW.NET

Modern, full-stack billing & RADIUS management system for ISP/RTRW.NET with FreeRADIUS integration supporting PPPoE and Hotspot authentication.

> **Latest:** v2.11.0 — PWA (installable semua portal), Web Push Notifications (VAPID), halaman System Update admin

---

## 🤖 AI Development Assistant

**READ FIRST:** [docs/AI_PROJECT_MEMORY.md](docs/AI_PROJECT_MEMORY.md) — contains full architecture, VPS details, DB schema, known issues, and proven solutions.

---

## 🎯 Features

| Category | Key Capabilities |
|----------|-----------------|
| **RADIUS / Auth** | FreeRADIUS 3.0.26, PAP/CHAP/MS-CHAP, VPN L2TP/IPSec, PPPoE & Hotspot, CoA real-time speed/disconnect |
| **PPPoE Management** | Customer accounts, profile-based bandwidth, isolation, IP assignment, MikroTik auto-sync |
| **Hotspot Voucher** | 8 code types, batch up to 25,000, agent distribution, auto-sync with RADIUS, print templates |
| **Billing** | Postpaid/prepaid invoices, auto-generation, payment reminders, balance/deposit, auto-renewal |
| **Payment** | Manual upload (bukti transfer), Midtrans/Xendit/Duitku gateway, approval workflow, 0–5 bank accounts |
| **Notifications** | WhatsApp (Fonnte/WAHA/GOWA/MPWA/Wablas), Email SMTP, broadcast (outage/invoice/payment) |
| **Agent/Reseller** | Balance-based voucher generation, commission tracking, sales stats |
| **Financial** | Income/expense tracking with categories, keuangan reconciliation |
| **Network (FTTH)** | OLT/ODC/ODP management, customer port assignment, network map, distance calculation |
| **GenieACS TR-069** | CPE/ONT management, WiFi config (SSID/password), device status & uptime |
| **Isolation** | Auto-isolate expired customers, customizable WhatsApp/Email/HTML landing page templates |
| **Cron Jobs** | 16 automated background jobs with history, distributed locking, manual trigger |
| **Roles & Permissions** | 53 permissions, 6 role templates (SuperAdmin/Finance/CS/Technician/Marketing/Viewer) |
| **Activity Log** | Audit trail with auto-cleanup (30 days) |
| **Security** | Session timeout 30 min, idle warning, RBAC, HTTPS/SSL |
| **Multi-language** | Indonesian & English (i18n) |
| **PWA** | Installable di semua portal (admin, customer, agent, technician), offline fallback, service worker cache |
| **Web Push** | VAPID-based browser push notifications, subscribe/unsubscribe toggle, admin broadcast, FCM parallel |
| **System Update** | One-click update dari GitHub via admin panel, live log streaming, no SSH required |
| **Mobile App** | Flutter customer portal (WiFi control, invoice, payment) |

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
| Cache | Redis (optional) |
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
│   │   ├── coordinator/    # Coordinator portal
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

### Quick Start (Recommended)

```bash
# SSH to your VPS
ssh root@YOUR_VPS_IP

# Clone repository (replace with your repo URL)
git clone https://github.com/YOUR_USERNAME/salfanet-radius.git /root/salfanet-radius
cd /root/salfanet-radius

# Run installer (interactive — detects environment automatically)
bash vps-install/vps-installer.sh
```

The installer handles everything:
- Node.js 20, MySQL 8.0 (auto-tuned to your RAM), FreeRADIUS 3.0.26, Nginx (performance-tuned), PM2, Redis
- Database creation, Prisma schema push, seed data
- FreeRADIUS config from `freeradius-config/` backup
- Nginx upstream keepalive + gzip + SSL (Let's Encrypt or self-signed)
- PM2 cluster start with ecosystem.config.js

Supported environments: **Public VPS**, **Proxmox LXC**, **Proxmox VM**, **Bare Metal**

### Manual Step-by-Step

```bash
bash vps-install/install-system.sh      # System packages
bash vps-install/install-nodejs.sh      # Node.js 20
bash vps-install/install-mysql.sh       # MySQL 8.0 + performance tuning
bash vps-install/install-redis.sh       # Redis
bash vps-install/install-nginx.sh       # Nginx + global tuning
bash vps-install/install-pm2.sh         # PM2 + build + start
bash vps-install/install-freeradius.sh  # FreeRADIUS 3.0
```

### Updating Existing Installation

```bash
# On your local machine:
git pull origin master                  # Get latest changes

# Deploy to VPS (copy changed files then rebuild):
scp -r src/ root@VPS_IP:/var/www/salfanet-radius/
ssh root@VPS_IP "cd /var/www/salfanet-radius && npm run build && pm2 restart ecosystem.config.js --update-env"
```

### Default Credentials

| | |
|--|--|
| Admin URL | `http://YOUR_VPS_IP/admin/login` |
| Username | `superadmin` |
| Password | `admin123` |

⚠️ **Change the password immediately after first login!**

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

## 🛠️ Common Commands

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

### 2) Redis gagal start (`redis-server.service failed`)

```bash
systemctl status redis-server --no-pager
journalctl -xeu redis-server.service --no-pager -n 120
tail -n 120 /var/log/redis/redis-server.log
redis-cli -h 127.0.0.1 ping
```

Jalankan ulang installer Redis terbaru (sudah termasuk hardening config + diagnostic output):

```bash
cd /var/www/salfanet-radius
bash vps-install/install-redis.sh
```

### 3) PM2 jalan tapi web tetap blank/error

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

### v2.10.28 — March 12, 2026
- Bank Accounts moved to Payment menu as separate page

### v2.10.x — March 2026 (Performance)
- Fixed N+1 query in PPPoE user listing (1 query instead of N+1)
- Invoice stats now parallel (`Promise.all`) — ~7× faster
- cron_history auto-cleanup (daily 4 AM, keep last 50 per job type)
- MySQL auto-tuned to server RAM during install
- Nginx global tuning: upstream keepalive, epoll, open_file_cache
- PM2: removed `--optimize-for-size`, increased heap

### v2.10.0 — February 2026
- L2TP watchdog auto-reconnect
- Isolation template preview uses company baseUrl
- Removed "Setup Isolir di Router" button (system uses NAT redirect)

### v2.9.x — January 2026
- Mobile app (Flutter) customer portal
- Suspend/restore system
- GenieACS ONT reboot support

See [docs/](docs/) for full historical changelog.

  - Auth: Login/Logout tracking
  - PPPoE: User CRUD operations
  - Session: Disconnect logging
  - Payment: Webhook logging
  - Invoice: Generation logging
  - Transaction: Income/expense CRUD
  - WhatsApp: Broadcast logging
  - Network: Router CRUD
  - System: RADIUS restart
- ✅ **Automatic Log Cleanup** - Cron job daily at 2 AM (30 days retention)
- ✅ **Voucher Performance** - Up to 70% faster using Prisma createMany
- ✅ **Voucher Limit Increased** - 500 → 25,000 vouchers per batch
- ✅ **Voucher Pagination** - Complete pagination system (50-1000 per page)
- ✅ **Voucher Stats Accuracy** - Stats show ALL vouchers, not just current page
- ✅ **Modal Redesign** - Modern 2-column layout with better UX
- ✅ **Notification Z-Index Fixed** - Notifications appear above all modals (z-index: 999999)
- ✅ **Notification Flow** - Dialog closes before showing success notification
- ✅ **Dashboard Bug Fix** - Fixed revenue Rp 0 → Rp 3,000
- ✅ Fixed total users count (0 → correct value)
- ✅ Fixed date range queries for transactions (UTC timezone issue)
- ✅ Simplified date boundary calculations
- ✅ **Chart Label Fix** - Category names no longer truncated
- ✅ Increased chart bottom margin for better label visibility
- ✅ **Subdomain Migration** - http://IP:3005 → https://server.salfa.my.id
- ✅ **SSL Certificate** - Self-signed certificate configured
- ✅ **Nginx HTTPS** - HTTP→HTTPS redirect enabled
- ✅ **Cloudflare Integration** - Domain via Cloudflare CDN
- ✅ Updated NEXTAUTH_URL to use subdomain
- ✅ PM2 restart with --update-env flag

### December 6, 2025 (v2.3) - Session & Network Improvements
- ✅ **Session Timeout** - Auto logout setelah 30 menit tidak aktif
- ✅ **Idle Warning Popup** - Warning 1 menit sebelum logout dengan countdown
- ✅ **Stay Logged In** - Tombol perpanjang sesi dari warning popup
- ✅ **Fix Logout Redirect** - Gunakan `redirect: false` + manual redirect untuk hindari NEXTAUTH_URL issue
- ✅ **Router GPS** - Tambah koordinat GPS untuk router/NAS dengan Map Picker
- ✅ **Auto GPS** - Deteksi lokasi otomatis dari browser (HTTPS required)
- ✅ **OLT Uplink Config** - Konfigurasi uplink dari router ke OLT dengan interface dropdown
- ✅ **MikroTik Interfaces API** - Endpoint baru untuk fetch interface dari router
- ✅ **Network Map Enhancement** - Tampilkan uplink info di popup router
- ✅ **Fix Layout Loading** - Perbaiki sidebar tidak muncul saat pertama login
- ✅ **Installer Baru** - `vps-install-local.sh` untuk VPS tanpa root access

### December 5, 2025 (v2.2) - FTTH Network Management
- ✅ **Network Map** - Visualisasi interaktif jaringan FTTH di peta
- ✅ **OLT Management** - CRUD OLT dengan assignment router
- ✅ **ODC Management** - CRUD ODC terhubung ke OLT  
- ✅ **ODP Management** - CRUD ODP dengan parent ODC/ODP
- ✅ **Customer Assignment** - Assign pelanggan ke port ODP
- ✅ **Sync PPPoE MikroTik** - Import PPPoE secrets dari MikroTik
- ✅ **WhatsApp Maintenance Template** - Template gangguan/maintenance
- ✅ **FreeRADIUS BOM Fix** - Auto remove UTF-16 BOM dari config files

### December 4, 2025 (v2.1.5) - System Improvements
- ✅ **Admin Management** - Fixed permission checkboxes not showing
- ✅ **Settings/Cron** - Complete page rewrite with teal theme
- ✅ **Settings/Database** - Complete page rewrite with Telegram backup
- ✅ **Agent Dashboard** - Fixed API paths, Router column added to voucher table
- ✅ **Payment Gateway** - Added validation for deposit (show error if not configured)
- ✅ **WhatsApp Providers** - Multi-provider support (Fonnte, WAHA, GOWA, MPWA, Wablas)
- ✅ **FreeRADIUS Config** - Updated backup configs from production
- ✅ **Install Wizard** - Added FreeRADIUS config restore option
- ✅ **vps-install.sh** - Updated with FreeRADIUS config restore

### December 4, 2025 (v2.1) - GenieACS WiFi Management
- ✅ **GenieACS TR-069 Integration** - Complete CPE management via Web UI
- ✅ **WiFi Configuration** - Edit SSID, password, security mode (WPA/WPA2/Open)
- ✅ **Real-time Updates** - Changes applied instantly without waiting periodic inform
- ✅ **Task Monitoring** - Track all TR-069 tasks with auto-refresh
- ✅ **Multi-WLAN Support** - Manage WiFi 2.4GHz, 5GHz, and Guest networks
- ✅ **Force Sync** - Manual connection request trigger
- ✅ **Device Details** - View ONT info, uptime, RX power, WiFi clients
- ✅ Fixed GenieACS menu structure (separate from Settings)

### December 3, 2025 (v2.0)
- ✅ **RADIUS CoA Support** - Real-time speed changes & disconnect
- ✅ CoA sent directly to MikroTik NAS (not FreeRADIUS)
- ✅ Auto-sync profile changes to active sessions
- ✅ `/api/radius/coa` endpoint for CoA operations
- ✅ Router secret from database for CoA authentication
- ✅ Fixed FreeRADIUS PPPoE authentication
- ✅ Disabled `filter_username` policy for realm-style usernames
- ✅ Added conditional REST for voucher-only post-auth
- ✅ Fixed post-auth API to allow unmanaged vouchers
- ✅ Added NAS-IP-Address sync for PPPoE users
- ✅ Updated FreeRADIUS config backup

### December 2, 2025
- ✅ Agent voucher system with balance management
- ✅ Router/NAS assignment for vouchers
- ✅ Fixed generate-voucher routerId handling
- ✅ Multi-router support improvements

### Previous Updates
- Agent deposit system with payment gateway
- GenieACS integration for TR-069
- Real-time bandwidth monitoring
- Session disconnect via MikroTik API

## 📚 Documentation

| File | Description |
|------|-------------|
| [docs/INSTALLATION-GUIDE.md](docs/INSTALLATION-GUIDE.md) | Complete VPS installation |
| [docs/GENIEACS-GUIDE.md](docs/GENIEACS-GUIDE.md) | GenieACS TR-069 setup & WiFi management |
| [docs/AGENT_DEPOSIT_SYSTEM.md](docs/AGENT_DEPOSIT_SYSTEM.md) | Agent balance & deposit |
| [docs/RADIUS-CONNECTIVITY.md](docs/RADIUS-CONNECTIVITY.md) | RADIUS architecture |
| [docs/FREERADIUS-SETUP.md](docs/FREERADIUS-SETUP.md) | FreeRADIUS configuration guide |                 2`QQQQQQQ `````````

## 📝 License

MIT License - Free for commercial and personal use

## 👨‍💻 Development

Built with ❤️ for Indonesian ISPs

**Important**: Always use `formatWIB()` and `toWIB()` functions when displaying dates to users.
