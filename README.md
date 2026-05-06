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

### v2.28.0 — 2026-05-06

### Added
- **OLT Detail: tab Metrics dengan recharts** — Halaman `/admin/olt/[id]` kini memiliki tab "Metrics" berisi 4 chart interaktif: CPU & Memory (LineChart), Temperature (AreaChart), ONU Status online/offline (AreaChart), Network Traffic TX/RX (AreaChart). Range waktu bisa dipilih: 6h, 12h, 24h, 48h.
- **OLT Detail: batch reboot ONU** — Di tab ONU List, setiap baris kini memiliki checkbox. Pilih beberapa ONU lalu klik "Reboot N ONUs" untuk reboot massal (maks 50 sekaligus). Progress bar real-time menampilkan status per-ONU.
- **OLT Detail: single ONU reboot** — Tombol "Reboot" per baris ONU dengan confirm step sebelum eksekusi.
- **OLT Detail: CSV export** — Tombol "Export CSV" di header halaman untuk mengunduh daftar ONU lengkap dengan data customer.
- **OLT Detail: kolom Signal Quality** — Kolom baru "Signal" di tabel ONU menampilkan kualitas sinyal (Excellent/Good/Fair/Poor) berdasarkan nilai RX Power.
- **API: POST `/api/olt/[id]/onus/[onuId]/reboot`** — Endpoint baru untuk reboot satu ONU via SSH ke OLT. Mendukung command vendor spesifik: Huawei, ZTE, FiberHome, BDCOM, Raisecom.
- **API: POST `/api/olt/[id]/onus/batch-reboot`** — Endpoint baru untuk batch reboot ONUs, mengembalikan hasil per-ONU.

### Fixed
- **OLT Test Connection 404** — Halaman `/admin/network/olts` memanggil `/api/admin/olt/test-connection` yang tidak ada. URL dikoreksi ke `/api/olt/test-connection`.

### Files
- `src/app/admin/olt/[id]/page.tsx` — Tambah tab Metrics (recharts), batch/single ONU reboot, CSV export, Signal Quality column, layout kompak
- `src/app/api/olt/[id]/onus/[onuId]/reboot/route.ts` — **BARU** — Single ONU reboot via SSH
- `src/app/api/olt/[id]/onus/batch-reboot/route.ts` — **BARU** — Batch ONU reboot via SSH
- `src/app/admin/network/olts/page.tsx` — Fix URL test-connection `/api/admin/olt/...` → `/api/olt/...`

### v2.27.0 — 2026-05-06

### Added
- **OLT Monitoring: field "IP Lokal / Subnet di Balik NAS" saat tambah VPN WireGuard peer** — Form tambah VPN client (WireGuard VPS) kini memiliki input opsional untuk memasukkan IP/subnet lokal di balik NAS Mikrotik (contoh: `192.168.75.0/24,136.1.1.100/32`). Network lokal yang diisikan otomatis:
  - Ditambahkan ke `AllowedIPs` peer block di `wg.conf` VPS sehingga WireGuard tahu harus meneruskan traffic ke peer tersebut.
  - Ditambahkan route kernel di VPS (`ip route add`) sehingga VPS bisa menjangkau jaringan lokal dan IP OLT di balik Mikrotik tanpa konfigurasi manual.
- **OLT Monitoring UI: tampilan halaman `/admin/olt/monitoring` diperbarui** — Seluruh halaman diubah mengikuti gaya admin kompak (bukan `container mx-auto p-6`): heading kecil `text-lg font-semibold` + ikon teal, stat card native Tailwind tanpa shadcn, filter menggunakan `<select>/<input>` native, card OLT grid ringkas dengan dark mode support.
- **OLT Alerts UI: tampilan halaman `/admin/olt/alerts` diperbarui** — Konsisten dengan gaya admin: stat summary 4 kolom, filter native select, alert card compact dengan badge severity inline.

### Fixed
- **OLT Monitoring: link mati ke `/admin/olt/model-profiles-new/new`** — Tiga link yang mengarah ke halaman yang tidak ada dihapus dari halaman daftar OLT.
- **OLT Monitoring: dropdown vendor/model kosong** — Vendor diganti ke static dropdown (Huawei, ZTE, FiberHome, BDCOM, Raisecom, Other) dan model diubah ke input teks bebas, karena tabel `oltProfiles` belum ada di database.
- **Build error `ssh2` bundling** — Paket `ssh2`, `cpu-features`, dan `sshcrypto` ditambahkan ke `serverExternalPackages` di `next.config.ts` untuk mencegah Next.js mencoba bundling modul native crypto.

### Files
- `src/app/admin/network/vpn-client/page.tsx` — Tambah field `localNetworks` di form + UI input subnet lokal
- `src/app/api/network/vps-wg-peer/route.ts` — Terima `localNetworks`, tambahkan ke `AllowedIPs` wg.conf + `ip route` di VPS
- `src/app/admin/olt/monitoring/page.tsx` — Rewrite UI ke gaya admin kompak
- `src/app/admin/olt/alerts/page.tsx` — Rewrite UI ke gaya admin kompak
- `src/app/admin/network/olts/page.tsx` — Hapus link mati; vendor static dropdown; model free-text input
- `next.config.ts` — Tambah `ssh2`, `cpu-features`, `sshcrypto` ke `serverExternalPackages`

### v2.25.17 — 2026-05-03

### Fixed
- **Generate tagihan manual hanya untuk POSTPAID** — Endpoint `POST /api/invoices/generate` sebelumnya memfilter `subscriptionType: 'POSTPAID'` sehingga pelanggan PREPAID tidak pernah mendapat tagihan dari fitur generate manual. Filter dihapus sehingga semua pelanggan aktif (POSTPAID dan PREPAID) diproses.
- **Generate tagihan menggunakan tanggal jatuh tempo yang salah** — Due date sebelumnya selalu diset ke hari terakhir `targetMonth` untuk semua user. Diperbaiki dengan logika per-user:
  - **POSTPAID**: `dueDate = billingDay user di targetMonth` (diclamped ke hari terakhir bulan jika billingDay > jumlah hari di bulan tersebut)
  - **PREPAID**: `dueDate = user.expiredAt` (tanggal kedaluwarsa aktual yang sudah tersimpan di profil user)
- **PREPAID tanpa expiredAt dilewati** — PREPAID user yang belum memiliki `expiredAt` tidak akan di-generate invoice (di-skip) karena tidak ada tanggal jatuh tempo yang bisa dipakai.
- **Cek duplikat invoice sekarang mencakup tipe RENEWAL** — Batch check existing invoices sebelumnya hanya mengecek `invoiceType: 'MONTHLY'`. Sekarang mengecek keduanya (`MONTHLY` dan `RENEWAL`) agar PREPAID tidak ter-generate ulang.
- **Invoice PREPAID menggunakan `invoiceType: 'RENEWAL'`** — Sebelumnya semua invoice di-create dengan `invoiceType: 'MONTHLY'`. Invoice untuk PREPAID sekarang menggunakan `RENEWAL` sesuai konvensi sistem.
- **UI: deskripsi dialog generate tagihan diperbarui** — Teks "Buat tagihan bulanan untuk pelanggan POSTPAID" diganti menjadi "Buat tagihan untuk pelanggan POSTPAID dan PREPAID". Info teks scope "all" juga diperbarui.

### Files
- `src/app/api/invoices/generate/route.ts` — Hapus filter POSTPAID-only; per-user dueDate (billingDay / expiredAt); invoiceType MONTHLY/RENEWAL; cek duplikat RENEWAL
- `src/app/admin/invoices/page.tsx` — Update deskripsi dialog generate tagihan

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
