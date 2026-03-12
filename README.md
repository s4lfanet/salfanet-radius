# SALFANET RADIUS - Billing System for ISP/RTRW.NET

Modern, full-stack billing system for ISP/RTRW.NET with FreeRADIUS integration supporting both **PPPoE** and **Hotspot** authentication.

> **Latest Update**: March 11, 2026 - FreeRADIUS deployed, VPS production ready v2.10.27 🎉

---

## 🤖 AI Development Assistant

**For AI/LLM helping with this project:**

👉 **READ FIRST:** [docs/AI_PROJECT_MEMORY.md](docs/AI_PROJECT_MEMORY.md)

This file contains:
- Complete project architecture and tech stack
- Production VPS details and credentials layout
- Database schema and relationships
- Known issues and proven solutions
- Configuration file locations
- Common commands and workflows
- Recent changes and fixes

**Benefits:** No need to repeatedly ask about project structure, prevents solving already-fixed issues, instant context understanding.

---

## 🎯 Key Features

### Core Features
- ✅ **FreeRADIUS 3.0.26 Integration** - Full RADIUS support with PAP/CHAP/MS-CHAP
- ✅ **VPN L2TP/IPSec** - Secure tunnel for remote MikroTik routers
- ✅ **Automated Cronjobs** - Hotspot sync, PPPoE isolir, auto-disconnect
- ✅ **CoA Service** - Real-time session disconnect when voucher expires
- ✅ **Custom Reply-Message** - "Kode Voucher Kadaluarsa" in MikroTik log
- ✅ **Full RADIUS Mode** - Sessions data dari radacct tanpa MikroTik API
- ✅ **RADIUS CoA Support** - Real-time speed changes & disconnect without reconnection
- ✅ **Multi-Router/NAS Support** - Manage multiple MikroTik routers
- ✅ **PPPoE Management** - Customer accounts with profile-based bandwidth
- ✅ **Isolation System** - Auto-isolate expired customers with limited bandwidth
- ✅ **Isolation Templates** - Customizable WhatsApp, Email & HTML landing page templates
- ✅ **Area Management** - Kelompokkan pelanggan berdasarkan area/wilayah
- ✅ **Stop Langganan** - Halaman terpisah untuk pelanggan berhenti berlangganan
- ✅ **Sync PPPoE MikroTik** - Import PPPoE secrets dari MikroTik ke database
- ✅ **Hotspot Voucher System** - Advanced voucher with pagination (up to 25,000 vouchers/batch)
- ✅ **Agent/Reseller System** - Balance-based voucher generation
- ✅ **Payment Gateway** - Midtrans, Xendit, Duitku integration
- ✅ **Manual Payment System** - Upload bukti transfer dengan approval workflow
- ✅ **WhatsApp Integration** - Automated notifications & reminders
- ✅ **Email Notifications** - Gmail SMTP with auto reminders
- ✅ **Broadcast Notification** - Mass notification untuk gangguan/invoice/payment
- ✅ **Role-Based Permissions** - 53 permissions, 6 role templates
- ✅ **Financial Reporting** - Income/expense tracking with categories
- ✅ **Activity Log System** - Comprehensive activity tracking with auto-cleanup
- ✅ **Cron Job System** - 10 automated background jobs with execution history
- ✅ **WIB Timezone** - Proper Western Indonesia Time handling (UTC+7)
- ✅ **Timezone-Aware** - Database UTC, FreeRADIUS WIB, API converts automatically
- ✅ **Complete Database Seeding** - All templates & initial data included

### FreeRADIUS & Hotspot Features 🔐
- ✅ **FreeRADIUS 3.0.26** - Complete RADIUS server setup
- ✅ **PAP/CHAP/MS-CHAP** - Multi-protocol authentication for MikroTik
- ✅ **VPN L2TP/IPSec** - Secure tunnel for remote routers
- ✅ **Hotspot Sync Cronjob** - Auto-activate voucher on first login
- ✅ **Auto-Disconnect** - Session terminated when voucher expires
- ✅ **Reply-Message** - Custom "Kode Voucher Kadaluarsa" message
- ✅ **Session Accounting** - Full session data in radacct table
- ✅ **Dynamic NAS** - NAS clients loaded from database

### Payment & Billing Features (v2.7.0) 💳
- ✅ **Manual Payment Upload** - Customer upload bukti transfer (JPG/PNG/WebP)
- ✅ **Payment Approval Workflow** - Admin approve/reject dengan notifikasi
- ✅ **Auto Extend Expiry** - Otomatis perpanjang masa aktif saat approval
- ✅ **Multiple Bank Accounts** - Configure 0-5 bank accounts untuk transfer
- ✅ **Customer ID** - 8-digit unique identifier untuk setiap customer
- ✅ **Subscription Type** - POSTPAID (pascabayar) / PREPAID (prabayar)
- ✅ **Payment Tracking** - Last payment date tracking
- ✅ **Public Payment Page** - Customer access via unique token
- ✅ **Receipt Verification** - View uploaded receipt image sebelum approve

### Balance & Auto-Renewal Features (v2.8.0) 💰
- ✅ **Balance/Deposit System** - Customer saldo deposit untuk auto-renewal
- ✅ **Auto-Renewal (Prepaid)** - Perpanjangan otomatis dari saldo 3 hari sebelum expired
- ✅ **Balance API** - POST/GET deposit transactions & history
- ✅ **Transaction Tracking** - Complete audit trail dengan kategori
- ✅ **Auto-Payment** - Invoice otomatis dibayar dari saldo
- ✅ **RADIUS Restoration** - Auto-restore dari isolir saat renewal sukses
- ✅ **Notifications** - WhatsApp & Email pada renewal berhasil
- ✅ **Smart Isolation** - Compatible dengan prepaid/postpaid & auto-renewal
- ✅ **Balance Column** - Sortable balance display di users table
- ✅ **Cron Job** - Daily at 8 AM (0 8 * * *) untuk auto-renewal

### Broadcast & Notification Features (v2.7.0) 📢
- ✅ **Outage Notification** - Broadcast gangguan jaringan ke multiple users
- ✅ **Invoice Reminder Broadcast** - Send invoice reminder secara massal
- ✅ **Payment Confirmation Broadcast** - Konfirmasi pembayaran ke multiple users
- ✅ **Maintenance Resolved Template** - **v2.7.2** Notifikasi perbaikan selesai
- ✅ **Multi-Channel** - WhatsApp dan Email dalam satu broadcast
- ✅ **Batch WhatsApp Processing** - Anti-spam dengan batch & delay
- ✅ **Message Randomization** - Randomize order untuk avoid pattern detection
- ✅ **Template Variables** - Dynamic variable replacement
- ✅ **Success/Fail Tracking** - Detailed success & failure count

### FTTH Network Features
- 📡 **OLT Management** - Kelola Optical Line Terminal dengan router uplink
- 📦 **ODC Management** - Kelola Optical Distribution Cabinet
- 📍 **ODP Management** - Kelola Optical Distribution Point
- 👥 **Customer Assignment** - Assign pelanggan ke port ODP
- 🗺️ **Network Map** - Visualisasi interaktif jaringan FTTH
- 📏 **Distance Calculation** - Hitung jarak pelanggan ke ODP terdekat

### GenieACS TR-069 Features (v2.7.6) 📡
- ✅ **Device Management** - Kelola CPE/ONT via GenieACS TR-069
- ✅ **WiFi Configuration** - Edit SSID & Password WiFi dari admin/customer portal
- ✅ **Dynamic Password Field** - Password field hidden untuk open network (None security)
- ✅ **Security Display** - Badge security status (None=yellow, Secured=green)
- ✅ **Customer WiFi Control** - Customer dapat ubah WiFi sendiri dengan ownership verification
- ✅ **Separate Task Approach** - SSID dan password task terpisah untuk hindari parameter conflict
- ✅ **Dual Password Path** - Support Huawei HG8145V5 dual password path compatibility
- ✅ **Device Verification** - PPPoE username ownership check untuk keamanan

### Router/NAS Features (NEW!)
- 🛰️ **GPS Coordinates** - Set lokasi router dengan Map Picker
- 🔗 **OLT Uplink Config** - Konfigurasi uplink dari router ke OLT
- 📊 **Interface Detection** - Auto-detect interface MikroTik
- 🌐 **Auto IP Detection** - Detect public IP otomatis

### Security Features (NEW!)
- ⏱️ **Session Timeout** - Auto logout setelah 30 menit tidak aktif
- ⚠️ **Idle Warning** - Popup warning 1 menit sebelum logout
- 🔄 **Stay Logged In** - Opsi perpanjang sesi dari popup warning
- 🔐 **Session Max Age** - Maksimal session 1 hari

### Technical Features
- 🎨 **Premium UI** - Mobile-first responsive design with dark mode
- 📱 **Fully Responsive** - **NEW v2.7.2!** Template pages optimized untuk mobile/tablet/desktop
- ⚡ **Modern Stack** - Next.js 16, TypeScript, Tailwind CSS, Prisma
- 🔐 **Secure** - Built-in authentication with role-based permissions
- 📱 **SPA Experience** - Fast, smooth navigation without page reloads
- 🌍 **Multi-language** - Indonesian & English support

## 🚀 Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | MySQL 8.0 with Prisma ORM |
| RADIUS | FreeRADIUS 3.0 with MySQL backend |
| Icons | Lucide React |
| Date | date-fns with timezone support |
| Maps | Leaflet / OpenStreetMap |

## 📁 Project Structure

```
salfanet-radius/
├── src/
│   ├── app/
│   │   ├── admin/          # Admin panel pages
│   │   ├── agent/          # Agent/reseller portal
│   │   ├── api/            # Thin API route handlers
│   │   ├── customer/       # Customer self-service portal
│   │   ├── coordinator/    # Coordinator portal
│   │   ├── technician/     # Technician portal
│   │   │   └── (portal)/   # Route group for all technician pages
│   │   └── page.tsx        # Landing/redirect
│   ├── server/             # Server-only: db, services, jobs, cache, auth
│   ├── features/           # Vertical slices (queries, schemas, types)
│   ├── components/         # Shared React components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities & re-export proxies
│   ├── locales/            # i18n translations (id, en)
│   └── types/              # Shared TypeScript types
├── prisma/
│   ├── schema.prisma       # Database schema (~45 models)
│   └── seeds/              # Seed scripts (run via seed-all.ts)
├── freeradius-config/      # FreeRADIUS config backup (deployed by installer)
│   ├── mods-available/     # sql, rest, mschap modules
│   ├── mods-enabled/       # Enabled module files
│   ├── sites-available/    # default, coa virtual servers
│   ├── sites-enabled/      # Enabled site files
│   ├── policy.d/           # Custom policies (PPPoE realm support)
│   └── clients.conf        # NAS/router clients config
├── vps-install/            # VPS installer scripts
│   ├── install-freeradius.sh
│   ├── install-nodejs.sh
│   ├── install-mysql.sh
│   └── common.sh           # Shared functions & DB credentials
├── production/             # Production config templates
│   ├── ecosystem.config.js # PM2 config (deployed to app dir)
│   └── nginx-salfanet-radius.conf
├── mobile-app/             # React Native / Expo mobile app
├── scripts/                # Utility scripts
└── docs/                   # Documentation & AI memory
    └── AI_PROJECT_MEMORY.md  # 👈 AI context file
```

## ️ Installation

### Quick Start (New VPS)

```bash
# 1. Upload project to VPS
scp -r salfanet-radius-main root@YOUR_VPS_IP:/var/www/salfanet-radius

# 2. SSH to VPS
ssh root@YOUR_VPS_IP
cd /var/www/salfanet-radius

# 3. Upload installer scripts
scp -r vps-install/ root@YOUR_VPS_IP:/tmp/vps-install/

# 4. Run full installer
bash /tmp/vps-install/vps-installer.sh
```

Or run each step individually:
```bash
bash /tmp/vps-install/install-system.sh      # System packages
bash /tmp/vps-install/install-nodejs.sh      # Node.js 20
bash /tmp/vps-install/install-mysql.sh       # MySQL 8.0
bash /tmp/vps-install/install-redis.sh       # Redis
bash /tmp/vps-install/install-nginx.sh       # Nginx
bash /tmp/vps-install/install-pm2.sh         # PM2 + build + start
bash /tmp/vps-install/install-freeradius.sh  # FreeRADIUS 3.0 (run from /var/www/salfanet-radius)
```

The installer will:
- Install Node.js 20, MySQL 8.0, FreeRADIUS 3.0.26, Nginx, PM2, Redis
- Configure database and create tables via `prisma db push`
- Deploy FreeRADIUS config from `freeradius-config/` backup
- Setup SQL + REST modules with MySQL backend
- Configure Nginx with HTTP→HTTPS redirect
- Build Next.js and start via PM2 (cluster mode)
- Seed database with default admin, templates, and categories

### Manual Installation

See [docs/INSTALLATION-GUIDE.md](docs/INSTALLATION-GUIDE.md) for detailed manual setup.

### GenieACS TR-069 Integration

See [docs/GENIEACS-GUIDE.md](docs/GENIEACS-GUIDE.md) for complete setup and usage guide.

### Default Credentials

After installation:
- **Admin Login**: http://YOUR_VPS_IP/admin/login
- **Username**: `superadmin`
- **Password**: `admin123`

⚠️ **Change password immediately after first login!**

## 🔌 FreeRADIUS Configuration

### Key Configuration Files

Located in `/etc/freeradius/3.0/`:

| File | Purpose |
|------|---------|
| `mods-enabled/sql` | MySQL connection for user auth |
| `mods-enabled/rest` | REST API for voucher management |
| `sites-enabled/default` | Main authentication logic |
| `clients.conf` | NAS/router clients |

### Important Settings

**1. Disable filter_username** (line ~293 in default):
```
#filter_username   # DISABLED - allows username@realm format for PPPoE
```

**2. Conditional REST for Vouchers** (in post-auth section):
```
# Only call REST API for vouchers (username without @)
if (!("%{User-Name}" =~ /@/)) {
    rest.post-auth
}
```

**3. SQL Client Loading** (in mods-enabled/sql):
```
read_clients = yes
client_table = "nas"
```

### Backup FreeRADIUS Config

Backup files included in `freeradius-config/` directory (auto-deployed by installer):
- `mods-available/sql` — SQL/MySQL module config
- `mods-available/rest` — REST API integration module
- `mods-available/mschap` — MS-CHAP module
- `sites-available/default` — Main auth virtual server
- `sites-available/coa` — CoA/Disconnect-Request server
- `sites-enabled/default` — Active default site (standalone file, not symlink)
- `policy.d/filter` — PPPoE realm support policy
- `clients.conf` — NAS/router clients (+ `$INCLUDE clients.d/`)

To restore on new VPS (automated):
```bash
# Run from app directory — installer detects freeradius-config/ automatically
cd /var/www/salfanet-radius
bash /tmp/vps-install/install-freeradius.sh
```

Manual restore:
```bash
FR=/etc/freeradius/3.0
BACKUP=/var/www/salfanet-radius/freeradius-config

cp $BACKUP/mods-available/sql $FR/mods-available/sql
cp $BACKUP/mods-available/rest $FR/mods-available/rest
cp $BACKUP/sites-enabled/default $FR/sites-enabled/default
cp $BACKUP/clients.conf $FR/clients.conf

# Update DB credentials
sed -i "s/login = .*/login = \"salfanet_user\"/" $FR/mods-available/sql
sed -i "s/password = .*/password = \"YOUR_DB_PASS\"/" $FR/mods-available/sql

chown -R freerad:freerad $FR
freeradius -CX && systemctl restart freeradius
```

## 🌐 RADIUS Authentication Flow

### PPPoE Users
```
MikroTik → FreeRADIUS → MySQL (radcheck/radusergroup/radgroupreply)
                     ↓
              Access-Accept with:
              - Mikrotik-Group (profile name)
              - Mikrotik-Rate-Limit (bandwidth)
```

### Hotspot Vouchers
```
MikroTik → FreeRADIUS → MySQL (radcheck/radusergroup/radgroupreply)
                     ↓
                REST API (/api/radius/post-auth)
                     ↓
              - Set firstLoginAt & expiresAt
              - Sync to Keuangan (income)
              - Track agent commission
```

### Database Tables (RADIUS)

| Table | Purpose |
|-------|---------|
| `radcheck` | User credentials (Cleartext-Password, NAS-IP-Address) |
| `radreply` | User-specific reply attributes |
| `radusergroup` | User → Group mapping |
| `radgroupcheck` | Group check attributes |
| `radgroupreply` | Group reply (Mikrotik-Rate-Limit, Session-Timeout) |
| `radacct` | Accounting/session data |
| `radpostauth` | Authentication logs |
| `nas` | NAS/Router clients |

## 📋 Features Overview

### Admin Panel Modules

1. **Dashboard** - Overview with stats and real-time data
2. **PPPoE Management** - Users and profiles with RADIUS sync
3. **Hotspot Management**
   - Multi-router/NAS support
   - Agent-based distribution
   - 8 code type combinations
   - Batch generation up to 25,000 vouchers
   - Complete pagination (50-1000 per page)
   - Accurate stats for all vouchers
   - Modern 2-column modal UI
   - Print templates
   - WhatsApp delivery
4. **Agent Management** - Balance, commission, sales tracking
5. **Invoices** - Billing with auto-reminder
6. **Payment Gateway** - Midtrans, Xendit, Duitku
7. **Keuangan** - Financial reporting
8. **Sessions** - Active connections monitoring
9. **WhatsApp** - Automated notifications
10. **Network** - Router/NAS, OLT, ODC, ODP
11. **GenieACS** - TR-069 CPE management ([Complete Guide](docs/GENIEACS-GUIDE.md))
    - Device list with real-time status
    - WiFi configuration (SSID, password, security)
    - Task monitoring with auto-refresh
    - Connection request trigger
    - Device details (uptime, RX power, clients)
12. **Settings** - Company, cron, backup

### Hotspot Voucher Code Types

| Type | Example | Characters |
|------|---------|------------|
| alpha-upper | ABCDEFGH | A-Z (no I,O) |
| alpha-lower | abcdefgh | a-z (no i,o) |
| alpha-mixed | AbCdEfGh | Mixed case |
| alpha-camel | aBcDeFgH | CamelCase |
| numeric | 12345678 | 1-9 only |
| alphanumeric-lower | abc12345 | a-z + 1-9 |
| alphanumeric-upper | ABC12345 | A-Z + 1-9 |
| alphanumeric-mixed | aBc12345 | Mixed + 1-9 |

### Admin Roles

| Role | Description |
|------|-------------|
| SUPER_ADMIN | Full access to all features |
| FINANCE | Invoices, payments, reports |
| CUSTOMER_SERVICE | User management, support |
| TECHNICIAN | Network, router, sessions |
| MARKETING | Reports, customer data |
| VIEWER | Read-only access |

## ⏰ Timezone & Date Handling

### Architecture (v2.3.1)

The application uses a multi-layer timezone strategy:

| Layer | Timezone | Notes |
|-------|----------|-------|
| **Database (Prisma)** | UTC | Default Prisma behavior |
| **FreeRADIUS** | WIB (UTC+7) | Server local time |
| **PM2 Environment** | WIB (`TZ=Asia/Jakarta`) | Critical for `new Date()` |
| **API Layer** | WIB | Converts UTC ↔ WIB automatically |
| **Frontend Display** | WIB | All times shown without browser offset |

### PM2 Environment Setup

**IMPORTANT**: Ensure `ecosystem.config.js` includes TZ environment:

```javascript
module.exports = {
  apps: [{
    name: 'salfanet-radius',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      TZ: 'Asia/Jakarta'  // ⚠️ CRITICAL!
    }
  }]
}
```

**Verify timezone:**
```bash
pm2 env 0 | grep TZ
# Output: TZ=Asia/Jakarta
```

### Date Handling Examples

```typescript
// Voucher API converts automatically:
// - createdAt/updatedAt: UTC → WIB (formatInTimeZone)
// - firstLoginAt/expiresAt: Already WIB (remove 'Z' suffix)

// All displayed times are in WIB:
// Generated: 2025-12-07 12:20:54 (WIB)
// First Login: 2025-12-07 12:24:14 (WIB)
// Valid Until: 2025-12-07 13:24:14 (WIB)
```

### Multi-Timezone Support

Application supports any timezone. For regions outside WIB (Jakarta):

**Indonesia Timezones:**
- **WIB** (UTC+7): Sumatera, Jawa, Kalimantan Barat/Tengah → `Asia/Jakarta`
- **WITA** (UTC+8): Sulawesi, Bali, Kalimantan Selatan/Timur → `Asia/Makassar`
- **WIT** (UTC+9): Maluku, Papua → `Asia/Jayapura`

**Configuration required:**
1. System timezone: `sudo timedatectl set-timezone Asia/Makassar`
2. `ecosystem.config.js`: `TZ: 'Asia/Makassar'`
3. `.env`: `TZ="Asia/Makassar"`
4. `src/lib/timezone.ts`: `LOCAL_TIMEZONE = 'Asia/Makassar'`
5. Restart: `pm2 restart --update-env && systemctl restart freeradius`

**International deployment** also supported (Singapore, Malaysia, Thailand, etc.)

See [docs/CRON-SYSTEM.md](docs/CRON-SYSTEM.md#multi-timezone-support) for complete guide.

## 🤖 Cron Job System

### Automated Background Jobs

10 scheduled jobs running automatically:

| Job | Schedule | Function |
|-----|----------|----------|
| **Voucher Sync** | Every 5 min | Sync voucher status with RADIUS |
| **Disconnect Sessions** | Every 5 min | Disconnect expired voucher sessions (CoA) |
| **Agent Sales** | Daily 1 AM | Update agent sales statistics |
| **Auto Isolir** | Every hour | Suspend overdue customers |
| **Invoice Generation** | Daily 2 AM | Generate monthly invoices |
| **Payment Reminder** | Daily 8 AM | Send payment reminders |
| **WhatsApp Queue** | Every 10 min | Process WhatsApp message queue |
| **Expired Voucher** | Daily 3 AM | Delete old expired vouchers |
| **Activity Log** | Daily 2 AM | Clean logs older than 30 days |
| **Session Cleanup** | Daily 4 AM | Clean old session data |

### Manual Trigger

All cron jobs can be triggered manually from:
- **Settings → Cron** in admin panel
- Click "Trigger Now" button on any job
- View execution history with results

### Execution History

Each job records:
- Start time
- End time
- Duration
- Status (success/error)
- Result message

Example results:
- "Synced 150 vouchers"
- "Disconnected 5 expired sessions"
- "Cleaned 245 old activities (older than 30 days)"

## 🔧 Useful Commands

### Application Management
```bash
pm2 status                    # Check status
pm2 logs salfanet-radius        # View logs
pm2 restart salfanet-radius     # Restart app
pm2 restart salfanet-radius --update-env  # Restart with updated env
pm2 stop salfanet-radius        # Stop app
pm2 env 0 | grep TZ           # Verify timezone setting
```

### FreeRADIUS Management
```bash
systemctl status freeradius   # Check status
systemctl restart freeradius  # Restart
freeradius -X                 # Debug mode (stop service first)
freeradius -XC                # Test configuration
```

### RADIUS Testing
```bash
# Test PPPoE user
radtest 'user@realm' 'password' 127.0.0.1 0 testing123

# Test Hotspot voucher
radtest 'vouchercode' 'password' 127.0.0.1 0 testing123
```

### Database Management
```bash
# Connect to database
mysql -u salfanet_user -psalfanetradius123 salfanet_radius

# Backup database
mysqldump -u salfanet_user -psalfanetradius123 salfanet_radius > backup.sql

# Restore database
mysql -u salfanet_user -psalfanetradius123 salfanet_radius < backup.sql
```

## 🔐 Security

### Best Practices
1. Change default admin password immediately
2. Change MySQL passwords
3. Setup SSL certificate (Let's Encrypt)
4. Configure firewall (ufw)
5. Regular database backups
6. Monitor application logs

### Firewall Rules
```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 1812/udp  # RADIUS Auth
ufw allow 1813/udp  # RADIUS Accounting
ufw allow 3799/udp  # RADIUS CoA
```

## 📡 RADIUS CoA (Change of Authorization)

CoA allows real-time changes to active PPPoE sessions without disconnecting users.

### Features
- **Speed Change** - Update bandwidth instantly via CoA
- **Session Disconnect** - Terminate sessions remotely
- **Profile Sync** - Auto-apply profile changes to all active sessions
- **Direct to NAS** - CoA sent directly to MikroTik, not via FreeRADIUS

### MikroTik Requirements
```
/radius incoming set accept=yes port=3799
```

### API Endpoints

**Check CoA Status:**
```bash
GET /api/radius/coa
```

**Disconnect User:**
```bash
POST /api/radius/coa
{
  "action": "disconnect",
  "username": "user@realm"
}
```

**Update Speed:**
```bash
POST /api/radius/coa
{
  "action": "update",
  "username": "user@realm",
  "attributes": {
    "downloadSpeed": 20,
    "uploadSpeed": 10
  }
}
```

**Sync Profile to All Sessions:**
```bash
POST /api/radius/coa
{
  "action": "sync-profile",
  "profileId": "profile-uuid"
}
```

**Test CoA Connection:**
```bash
POST /api/radius/coa
{
  "action": "test",
  "host": "103.191.165.156"
}
```

### Auto-Sync on Profile Edit
When you edit a PPPoE profile's speed, the system automatically:
1. Updates radgroupreply in database
2. Finds all active sessions using that profile
3. Sends CoA to each MikroTik NAS
4. Speed changes instantly without disconnect

### Troubleshooting CoA
```bash
# Test radclient
radtest testuser password 127.0.0.1 0 testing123

# Check if radclient installed
which radclient

# Install if missing
apt install freeradius-utils

# Debug CoA
echo "User-Name=testuser" | radclient -x 103.191.165.156:3799 coa secret123
```

### WhatsApp Providers Configuration

| Provider | Base URL | API Key Format |
|----------|----------|----------------|
| **Fonnte** | `https://api.fonnte.com/send` | Token from Fonnte dashboard |
| **WAHA** | `http://IP:PORT` (e.g., `http://10.0.0.1:3000`) | WAHA API Key |
| **GOWA** | `http://IP:PORT` (e.g., `http://10.0.0.1:2451`) | `username:password` |
| **MPWA** | `http://IP:PORT` | MPWA API Key |
| **Wablas** | `https://pati.wablas.com` | Wablas Token |

## 📊 Database Backup

Latest backup: `backup/salfanet_radius_backup_20251204.sql`

To restore:
```bash
mysql -u salfanet_user -psalfanetradius123 salfanet_radius < backup/salfanet_radius_backup_20251204.sql
```

## 📝 Changelog

### December 7, 2025 (v2.4) 🆕 - Activity Log & Performance
- ✅ **Activity Log System COMPLETE** - All priority endpoints implemented
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
| [docs/FREERADIUS-SETUP.md](docs/FREERADIUS-SETUP.md) | FreeRADIUS configuration guide |

## 📝 License

MIT License - Free for commercial and personal use

## 👨‍💻 Development

Built with ❤️ for Indonesian ISPs

**Important**: Always use `formatWIB()` and `toWIB()` functions when displaying dates to users.
