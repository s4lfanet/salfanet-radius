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

### v2.29.56 — 2026-05-09

### Fixed
- **Port Map sync lambat setelah hapus VLAN gagal** — Root cause: uplink POST menggunakan `timeout: 20` untuk sesi Telnet konfigurasi. Dengan 2 attempt (`removeVlan`) yang keduanya gagal, total waktu zombie sessions bisa mencapai 2 × 35 detik = 70 detik. ZTE C320 membatasi concurrent Telnet sessions; chassis sync yang menyusul tidak bisa langsung konek. Fix:
  1. Timeout Telnet untuk POST action dikurangi ke **8 detik** (perintah config di LAN lokal selesai <3s; 8s cukup buffer).
  2. Loop `commandAttempts` sekarang **break** jika terjadi connection-level failure (`!result.success`) — tidak ada gunanya mencoba command berbeda jika OLT tidak bisa dikoneksi. Retry (continue) hanya terjadi pada **CLI error** (command ditolak OLT, bukan koneksi gagal).
### Files
- `src/app/api/olt/[id]/uplink/route.ts` — POST action: `timeout: 8`, break on connection failure

### v2.29.55 — 2026-05-09

### Fixed
- **removeVlan di uplink tag → 500** — Root cause: satu sesi Telnet mengirim `no switchport vlan X tag`, `no switchport default vlan`, `no switchport vlan X` sekaligus; perintah fallback yang tidak berlaku di ZTE C320 mengembalikan `%Error`, `firstError` menjadi true → 500. Fix: pisahkan menjadi dua `commandAttempts` terpisah — percobaan pertama hanya `no switchport vlan ${vid} tag`, fallback percobaan kedua `no switchport default vlan`. Setiap percobaan adalah sesi Telnet independen sehingga error dari satu tidak mengontaminasi yang lain.
- **ONU Type tidak terbaca di Register ONU** — Root cause: `show run | include onu-type` pada ZTE C320 V2.1 tidak mendukung pipe filter sehingga menghasilkan seluruh running-config atau timeout, menyebabkan sesi `executeMultipleCommands` 5-command gagal dan semua data (onuTypes, tcontProfiles, trafficProfiles, suggestedOnuId, detectedOnuType) kembali kosong. Fix: ganti ke 5 panggilan `executeCommand` paralel (`Promise.allSettled`) — satu command per sesi Telnet, kegagalan satu tidak mempengaruhi lainnya. Command ONU types diganti ke `show gpon onu-type`.
- **parseZteOnuTypes** — Diperbarui untuk menangani output format tabel dari `show gpon onu-type` (`ZTEG-F670L  F670L GPON ONT`) selain format running-config lama (`onu-type ZTEG-F670L gpon ...`). Header line (`Onu-type`, `---`) dan kata kunci umum di-skip.
### Files
- `src/app/api/olt/[id]/uplink/route.ts` — removeVlan: pisah jadi 2 commandAttempts terpisah
- `src/app/api/olt/[id]/onus/register/route.ts` — ONU type GET: `Promise.allSettled(5x executeCommand)` + `show gpon onu-type` + parser update

### v2.29.54 — 2026-05-09

### Fixed
- **VLAN tab masih kosong (Mode/TLS/Tagged VLANs —)** — Root cause: `executeMultipleCommands(['show vlan port …', 'show running-config interface …'])` kadang gagal/hang karena `show vlan port xgei_1/3/2` tidak valid atau menyebabkan sesi Telnet terganggu. Fix: VLAN tab sekarang hanya menggunakan satu `executeCommand('show running-config interface …')` yang sudah terbukti bekerja. `parseRunningConfigInterface` mengekstrak `Mode`, `TLS`, `Tagged Vlan` (dari `switchport vlan 1,30,69,100,151 tag` — comma-separated), `Description`, `Speed`, `Duplex`, `Flow Control`, `Physical Type`.
### Changed
- **Chassis stats row dihapus dari Port Map** — Baris stat (UPTIME, AVG CPU, AVG MEMORY, ACTIVE CARDS, FAN STATUS) di dalam panel "ZTE C320 Rack Diagram" dihapus. AVG CPU (11%) dan AVG MEMORY (32%) adalah static placeholder yang menyesatkan; FAN STATUS dan ACTIVE CARDS belum real-time. Tampilan chassis sekarang langsung ke rack diagram.
- **Tab Metrics dihapus** — Tab "Metrics" dihapus dari halaman OLT detail (ONU List | Port Map | Alerts | Settings | Logs). State `metrics`, `metricsHours`, `metricsLoading`, callback `fetchMetrics`, dan `useEffect`-nya juga dibersihkan.
### Files
- `src/app/api/olt/[id]/uplink/route.ts` — VLAN tab: ganti multi-command ke single `executeCommand('show running-config interface')`
- `src/app/admin/olt/[id]/page.tsx` — hapus chassis stats row; hapus Metrics TabsTrigger + TabsContent + state vars

### v2.29.53 — 2026-05-10

### Fixed
- **Temperature card dihapus dari top stat** — Kartu "Temperature" di baris 4 stat card atas selalu "Not available (C320)" karena ZTE C320 tidak melaporkan suhu via SNMP. Dihapus → layout sekarang 3 kolom (Status, Uptime, ONUs). Grid berubah dari `md:grid-cols-4` → `md:grid-cols-3`.
- **CHASSIS TEMP dihapus dari chassis stats row** — Kolom "CHASSIS TEMP" di stats row chassis diagram juga dihapus (selalu "Unknown"). Grid chassis stats: dari `xl:grid-cols-6` → `xl:grid-cols-5`, border logic diperbarui.
- **VLAN tab kosong (Mode/TLS/PVID semua —)** — `parseVlanPort` hanya menangani format key:value, tapi ZTE C320 bisa mengembalikan format tabular (`VLAN Port Mode Pvid TLS`). Ditambahkan tabular fallback parser. `parseRunningConfigInterface` juga diperluas untuk menangani ZTE non-switchport style (`vlan N tag`, `pvid N`, `mode hybrid` tanpa prefix `switchport`). VLAN tab sekarang selalu return raw output untuk diagnosis bahkan jika parsing gagal.
- **CONFIG tab kosong (No configuration data)** — Config tab tidak menampilkan apa pun jika `hasCliError` triggered pada output. Diubah: raw output selalu dikembalikan ke UI, user bisa melihat output asli OLT meski ada error-string di output.
- **`parseVlanPort` "Tagged vlan(s)" tidak dikenali** — Normalisasi key sebelumnya hanya mencocokkan `'tagged vlan'` (exact). Sekarang menggunakan `startsWith('tagged vlan')` sehingga varian `tagged vlan(s)` juga ditangkap.
### Files
- `src/app/admin/olt/[id]/page.tsx` — hapus Temperature card top stats; hapus CHASSIS TEMP dari chassis stats row
- `src/app/api/olt/[id]/uplink/route.ts` — tabular fallback di `parseVlanPort`; ZTE non-switchport variants di `parseRunningConfigInterface`; VLAN tab & CONFIG tab selalu return raw

### v2.29.52 — 2026-05-10

### Fixed
- **Uplink tab lambat (status/vlan/optical)** — Setiap tab dulu membuka 2 sesi Telnet terpisah (primary + fallback) masing-masing ~5 detik → total ~10 detik per tab. Sekarang: satu `executeMultipleCommands` session mengirim primary + fallback command sekaligus. Total: ~5 detik → **2× lebih cepat**.
- **SNMP fallback getInterfaceStatusSNMP lambat** — Dulu: `snmpWalk(ifDescr)` sequential, lalu baru `Promise.all([4 snmpGet])`. Sekarang: 5 `snmpWalk` berjalan **paralel** (ifDescr, ifAdmin, ifOper, ifHighSpeed, ifAlias) + O(1) Map lookup per index.
- **removeVlan 3 sesi Telnet** — `removeVlan` POST dulu loop 3 `commandAttempts` masing-masing sesi Telnet terpisah (~15 detik worst-case). Sekarang: satu sesi tunggal dengan ketiga `no switchport` command dikirim sekaligus — OLT mengabaikan command yang tidak berlaku.
- **OLT sync lambat (`discoverPonV21`)** — Dulu: per-ONU `Promise.all([5 snmpGet])` secara sequential antar ONU = N × 5 subprocess spawns. Sekarang: **7 `snmpWalk` paralel** untuk seluruh PON port sekaligus (regStatus, operState, serial, rxPower, description, distance, seenTable), lalu build Map + lookup O(1) per ONU. Telnet serial lookup yang gagal SNMP di-batch via `Promise.all` tanpa blokir ONU lain.
### Added
- **PVID Management di VLAN tab** — Sebelumnya PVID hanya tampil read-only. Sekarang: tombol **Remove** di samping PVID aktif, dropdown berubah antara "Tagged (Trunk)" dan "Set as PVID", tombol berubah label antara "Add VLAN" dan "Set PVID". Backend: actions `setPvid` dan `removePvid` baru di POST `/api/olt/[id]/uplink`.
- **Remove VLAN button lebih jelas** — Badge VLAN tagged kini punya tombol `×` yang lebih terlihat dengan hover merah dan border animasi.

### Files
- `src/app/api/olt/[id]/uplink/route.ts` — `executeMultipleCommands` per tab; 5 parallel walks SNMP; `removeVlan` single session; `setPvid`/`removePvid` actions baru
- `src/lib/olt/vendors/zte.ts` — `discoverPonV21` rewrite: 7 parallel bulk walks → O(1) Map lookup; batch Telnet serial fallback
- `src/app/admin/olt/[id]/page.tsx` — PVID remove button; "Set as PVID" dropdown; improved VLAN remove UX

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
