# SALFANET RADIUS - Billing System for ISP/RTRW.NET

Modern, full-stack billing & RADIUS management system for ISP/RTRW.NET with FreeRADIUS integration supporting PPPoE and Hotspot authentication.

> **Latest:** v2.21.0 — VPS Built-in VPN pool IP config (WireGuard & L2TP): full IP input, correct subnet routing, auto-sync wg0.conf (Apr 22, 2026)

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
| **Notifications** | WhatsApp (Fonnte/WAHA/GOWA/MPWA/Wablas/WABlast/**Kirimi.id**), Email SMTP, broadcast (outage/invoice/payment), webhook pesan masuk |
| **Agent/Reseller** | Balance-based voucher generation, commission tracking, sales stats |
| **Financial** | Income/expense tracking with categories, keuangan reconciliation |
| **Network (FTTH)** | OLT/ODC/ODP management, customer port assignment, network map, distance calculation |
| **GenieACS TR-069** | CPE/ONT management, WiFi config (SSID/password), device status & uptime |
| **Isolation** | Auto-isolate expired customers, customizable WhatsApp/Email/HTML landing page templates |
| **Cron Jobs** | 16 automated background jobs with history, distributed locking, manual trigger |
| **Roles & Permissions** | 53 permissions, 6 role templates (SuperAdmin/Finance/CS/Technician/Marketing/Viewer) |
| **Activity Log** | Audit trail with auto-cleanup (30 days) |
| **Security** | Session timeout 30 min, idle warning, RBAC, HTTPS/SSL |
| **Bahasa** | Bahasa Indonesia (full) |
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

### v2.20.0 — April 20, 2026
- **Fix: Script RADIUS `address=127.0.0.1`** — Fallback chain diperbarui: `RADIUS_SERVER_IP` → `VPS_IP` → hostname dari `NEXTAUTH_URL` → `127.0.0.1`. Instalasi tanpa env var eksplisit (VPS lokal/LXC) kini otomatis pakai IP yang benar.
- **Fix: Script RADIUS `src-address` hilang untuk non-VPN router** — Tanpa `src-address`, MikroTik memilih source IP otomatis yang bisa berbeda dari `nasname` di FreeRADIUS → ditolak sebagai "unknown client". Sekarang selalu di-set untuk semua router.
- **Fix: Script RADIUS hapus perintah `rate-limit=""` di hotspot user profile** — Command menyebabkan error `expected end of command` di RouterOS karena bukan parameter valid.
- **Fix: Script RADIUS hapus `keepalive-timeout` dan `lcp-echo`** — Kedua parameter tidak dikenal di `/ppp profile set` pada RouterOS.
- **Added: Netwatch monitor RADIUS** — Generated script kini menyertakan `/tool netwatch` yang memonitor RADIUS server setiap 30 detik dengan log warning/info otomatis.
- **Added: `vpn-watchdog.sh` RADIUS health check** — Watchdog kini cek service `freeradius` + port UDP 1812 dan auto-restart jika mati. Log rotation otomatis.
- **Changed: `Acct-Interim-Interval` 60 → 300 detik** — Selaras dengan `interim-update=5m` MikroTik, kurangi beban DB.
- **Changed: Stale session threshold 1 HOUR → 30 MINUTE** — Deteksi sesi zombie lebih cepat (6× interval), tapi tetap beri window reconnect VPN.

### v2.17.0 — April 10, 2026
- **Feat: Kamera HP langsung + GPS otomatis di semua form foto pelanggan** — Komponen baru `CameraPhotoInput` dengan tombol [🖼 Galeri] / [📷 Kamera HP] side-by-side. Tombol *Kamera HP* pakai `capture="environment"` sehingga langsung membuka kamera belakang tanpa file picker. Setelah foto diupload, GPS otomatis ditangkap via `navigator.geolocation` dan ditampilkan sebagai badge 📍 lat,lng clickable ke Google Maps.
- **Files diperbarui:** `src/components/CameraPhotoInput.tsx` (baru), `src/app/daftar/page.tsx`, `src/app/admin/pppoe/users/page.tsx` (AddPppoeUserModal), `src/app/technician/(portal)/register/page.tsx`, `src/components/UserDetailModal.tsx`

### v2.16.0 — April 10, 2026
- **Feat: PWA Web Push penuh (VAPID)** — notifikasi push browser bekerja di semua portal (customer, teknisi, admin). Subscribe/unsubscribe toggle di sidebar teknisi berhasil menyimpan subscription ke DB.
- **Fix: Push subscription tidak tersimpan (credentials:same-origin)** — root cause: fetch ke `/api/push/technician-subscribe` tidak menyertakan cookie `technician-token`. Fix: tambah `credentials: 'same-origin'` ke semua 3 fetch call (silent sync, subscribe, unsubscribe).
- **Fix: `admin_user` push subscription diabaikan** — route mengembalikan `{skipped:true}` untuk admin tanpa simpan. Fix: tambah model `adminPushSubscription` + tabel `admin_push_subscriptions`, route kini menyimpan subscription admin.
- **Feat: Dispatch tiket ke semua teknisi via WA + push** — saat tiket dibuat/di-assign, broadcast WA + push notification ke semua teknisi aktif.
- **Feat: GitHub Actions auto-deploy** — workflow `.github/workflows/deploy.yml` → SSH ke VPS + `update.sh` saat push ke `master`.
- **Fix: update.sh auto-rebuild standalone** — jika `.next/standalone/server.js` hilang, build otomatis dipaksa.
- **Fix: Dashboard teknisi pakai model `ticket`** — sebelumnya masih referensi model `work_orders` yang sudah dihapus.

### v2.15.0 — January 2026
- **Fix: Cron Job & Backup System Audit** — audit dan perbaikan menyeluruh sistem cron job + backup + Telegram:
  - `backupTopicId` non-nullable → nullable (penyebab utama settings gagal tersimpan)
  - `MYSQL_PWD` shell syntax → env option (aman untuk password dengan karakter khusus)
  - `/api/cron/telegram` GET undefined status → panggil `getTelegramCronStatus()`
  - `/api/cron` POST tanpa auth → tambah CRON_SECRET + User-Agent + session check
  - Double cron execution dihapus (initCronJobs hanya untuk Telegram cron)
  - Placeholder `/api/backup/telegram/settings` → implementasi penuh dari DB
  - Health report Telegram lebih lengkap (sessions, users, invoices)
  - Validasi 50MB Telegram file size limit

### v2.14.0 — January 2026
- **Feat: ID Pelanggan di semua notifikasi** — `{{customerId}}` ditambahkan ke semua template WA & email (registration approval, invoice reminder, payment success, auto-renewal, manual payment approval/rejection, account info, admin create user)
- **Feat: Area pelanggan di notifikasi** — `{{area}}` ditambahkan ke admin-create-user, payment-success, auto-renewal-success templates
- **Fix: Seed template selalu update message** — bug di `whatsapp-templates.ts` & `email-templates.ts` di mana `message`/`htmlBody` tidak diupdate tanpa flag `--force-templates` sudah diperbaiki; sekarang selalu update
- **Fix: update.sh selalu jalankan seed** — seed tidak lagi bersyarat pada file diff, selalu berjalan dengan `stdbuf` untuk output real-time
- **Infra: stdbuf untuk live log** — gunakan `stdbuf -oL npm run db:seed` agar log seed muncul secara real-time di admin panel

### v2.13.1 — April 5, 2026
- **Fix: Wablas send gagal** — ganti dari `POST /api/v2/send-message` ke `GET /api/send-message?token=...` (v1 simple endpoint, kompatibel semua server Wablas). API key format: `token.secret_key`
- **Clarify: Hint form Wablas** diperjelas format API key `token.secret_key`

### v2.13.0 — April 5, 2026
- **Feat: Kirimi.id native broadcast** — broadcast menggunakan `/v1/broadcast-message`, 1 penerima otomatis pakai `/v1/send-message`. Delay 30 detik (rekomendasi resmi)
- **Feat: WhatsApp webhook endpoint** — `POST /api/whatsapp/webhook` menerima pesan masuk, dicatat ke `whatsapp_history`. Panel webhook URL + tombol copy di halaman Providers
- **Feat: Per-provider error detail** — saat semua provider gagal, response menyertakan detail error per provider
- **Fix: Kirimi.id endpoint** — `/send-message` → `/v1/send-message`, field `number` → `receiver`
- **Fix: Broadcast response** — tambah `successCount`/`failCount` di top-level response agar toast UI tidak menampilkan `undefined`
- **Fix: HTTP status** — catch block WhatsApp send 502 → 500

### v2.12.0 — April 2, 2026
- Fix: PPPoE isolasi manual — `radusergroup` tidak lagi dioverwrite saat edit user tanpa ubah status isolir
- Fix: CoA/disconnect MikroTik — tambah `-d /usr/share/freeradius` ke perintah `radclient disconnect`
- Fix: `setup-isolir` hardcoded IP pool → baca dari DB company settings

### v2.11.7 — March 29, 2026
- **Fix: PWA manifest 404 pada fresh install** — nginx `alias` + regex + `try_files` diganti `root /var/www/salfanet-radius/public` (sesuai VPS production)
- **Fix: `cp -r public` nesting bug** — `cp -r public .next/standalone/public/` → `cp -r public/. .next/standalone/public/` (hindari nested `public/public/`)
- **Rewrite: `fix-pwa-nginx.sh`** — script perbaikan otomatis ditulis ulang dengan pendekatan yang benar
- Files: `install-nginx.sh`, `install-pm2.sh`, `fix-pwa-nginx.sh`, `nginx-salfanet-radius.conf`

### v2.11.5 — March 20, 2026
- Fix: ghost sessions filtered from session list (sessions not in `pppoeUser` or `hotspotVoucher` are hidden)
- Fix: RADIUS authorize now returns explicit REJECT for unregistered users (was allowing access via empty `{}`)
- Fix: dashboard hotspot count cross-referenced against `hotspotVoucher` table (no more phantom counts)
- Fix: `src/app/global-error.tsx` created to prevent Next.js 16 prerender crash on `/_global-error`
- Fix: customer WiFi page card padding (explicit `p-4 sm:p-5` on all CyberCard instances)
- Chore: restore `scripts/scan-api-endpoints.js` and `scripts/test-all-apis.js`
- Chore: fix deploy script paths, add cross-platform `scripts/run-deploy.js` wrapper
- Chore: add `npm run clean:local` and `clean:all` scripts, tidy `.gitignore`

### v2.11.0 — March 17, 2026
- System Update admin hardened (spawn fd fix, app root resolver, sanitized env)
- Live update log stabilized (SSE heartbeat, anti-buffering, auto reconnect)
- Nginx manifest handling fixed for all manifest files
- Zero-downtime reload on update (`pm2 reload salfanet-radius`)
- Admin UI card spacing polish (Push Notifications, Manual Payments, Network Trace)
- Fix: hotspot profile modal showing raw i18n key (`hotspot.evoucherAccess` case fix)
- Fix: dashboard SESI HOTSPOT AKTIF counting 0 despite active sessions (classification logic simplified)

### v2.10.28 — March 12, 2026
- Bank Accounts moved to Payment menu as separate page

### v2.10.x — March 2026 (Performance)
- Fixed N+1 query in PPPoE user listing (1 query instead of N+1)
- Invoice stats now parallel (`Promise.all`) — ~7x faster
- cron_history auto-cleanup (daily 4 AM, keep last 50 per job type)
- MySQL auto-tuned to server RAM during install
- Nginx global tuning: upstream keepalive, epoll, open_file_cache
- PM2: removed `--optimize-for-size`, increased heap

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
