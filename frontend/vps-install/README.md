# VPS Installer — SALFANET RADIUS

Satu installer untuk semua environment: **Public VPS**, **Proxmox LXC**, **Proxmox VM**, **Bare Metal**.

---

## ⚡ INSTALL BARU (FRESH INSTALL)

### Metode 1 — Via Git Clone (Recommended)

```bash
# SSH ke VPS / server
ssh root@IP_SERVER

# Clone repo
git clone https://github.com/s4lfanet/salfanet-radius.git /root/salfanet-radius

# Jalankan installer
cd /root/salfanet-radius
bash frontend/vps-install/vps-installer.sh
```

---

### Metode 3 — Upload Manual dari PC (SCP)

Gunakan ini jika server tidak bisa akses internet / GitHub.

```bash
# Jalankan di PowerShell / terminal LOKAL (bukan di server)
scp -r ./salfanet-radius root@IP_SERVER:/root/salfanet-radius

# Lalu SSH ke server dan jalankan installer
ssh root@IP_SERVER
cd /root/salfanet-radius
bash frontend/vps-install/vps-installer.sh
```

---

### Paksa Environment Tertentu (Non-interactive)

```bash
# Public VPS (DigitalOcean, Vultr, AWS, dll)
bash frontend/vps-install/vps-installer.sh --env vps

# Proxmox LXC Container
bash frontend/vps-install/vps-installer.sh --env lxc

# Proxmox VM / VirtualBox
bash frontend/vps-install/vps-installer.sh --env vm

# Bare Metal / Server Fisik
bash frontend/vps-install/vps-installer.sh --env bare

# Paksa IP tertentu (berguna di LXC/VM)
bash frontend/vps-install/vps-installer.sh --env lxc --ip 192.168.1.50
```

---

## 🔄 UPDATE KE VERSI TERBARU

### Metode 1 — updater.sh (Recommended)

Cara paling aman dan cepat. **Semua data upload (logo, foto KTP, bukti bayar) otomatis dipreservasi.**

```bash
bash /var/www/salfanet-radius/frontend/vps-install/updater.sh
```

---

### Metode 2 — Update via Git (Manual)

```bash
bash /var/www/salfanet-radius/frontend/vps-install/updater.sh --branch master
```

Script akan: pull kode terbaru → preserve uploads → npm install → prisma db push → rebuild → restart PM2.

---

### Opsi Tambahan Updater

```bash
# Lihat bantuan lengkap
bash updater.sh --help

# Skip backup sebelum update (lebih cepat, tidak disarankan di produksi)
bash updater.sh --skip-backup

# Update ke versi spesifik
bash updater.sh --version v2.12.0

# Update dari branch tertentu
bash updater.sh --branch master
```

---

## 🛡️ KEAMANAN DATA SAAT UPDATE

**Semua file yang diupload pengguna TIDAK AKAN terhapus saat update.** Updater secara eksplisit melindungi direktori-direktori berikut:

| Direktori | Isi | Status |
|-----------|-----|--------|
| `public/uploads/logos/` | Logo perusahaan yang diupload admin | ✅ Aman |
| `public/uploads/pppoe-customers/` | Foto KTP & dokumen pelanggan | ✅ Aman |
| `public/uploads/payment-proofs/` | Bukti pembayaran pelanggan | ✅ Aman |
| `public/uploads/topup-proofs/` | Bukti topup saldo | ✅ Aman |
| `public/uploads/registrations/` | Dokumen pendaftaran pelanggan | ✅ Aman |
| `public/uploads/payments/` | File terkait transaksi | ✅ Aman |
| `.env` | Konfigurasi database & secrets | ✅ Aman |
| **Database MySQL** | **Semua data pelanggan, tagihan, dll** | ✅ Aman |

### Cara Kerja Perlindungan Data

**Mode ZIP Release (default):**
1. File `public/uploads/` di-copy ke tempat sementara sebelum deploy
2. File baru di-deploy (replace kode lama)
3. File `public/uploads/` dikembalikan ke posisi semula
4. `.env` tidak pernah disentuh

**Mode Git Branch (`--branch`):**
1. `public/uploads/` disimpan sebelum `git reset --hard`
2. `git clean` dijalankan (kode lama dibersihkan)
3. `public/uploads/` dikembalikan ke posisi semula

> **Database (MySQL)** sepenuhnya AMAN — update hanya menyentuh file kode aplikasi, bukan database. `prisma db push` hanya menambah kolom/tabel baru, tidak pernah menghapus data.

---

## 🏗️ Proses Fresh Install (Detail Step)

Installer menjalankan 7 step wajib, Redis dan keamanan (gagal di dua step ini tidak menghentikan instalasi), dan beberapa step opsional:

| Step | Module | Yang Dilakukan | Waktu |
|------|--------|----------------|-------|
| 1 | `install-system.sh` | System packages, UFW, PPP/TUN, timezone, swap | 2-3 menit |
| 2 | `install-nodejs.sh` | Node.js 22 LTS dari repositori NodeSource (versi bisa diganti lewat `NODE_VERSION`) | 2-3 menit |
| 3 | `install-mysql.sh` | MySQL 8, buat database & user | 3-5 menit |
| 4 | `install-app.sh` | Copy kode, buat `.env`, `pnpm install` (monorepo pnpm), Prisma generate dan `db push`, seed | 5-10 menit |
| 4b | `install-redis.sh` | Redis untuk cache dan pembatas laju (non-fatal bila gagal; aplikasi tetap jalan tanpa cache) | 1 menit |
| 5 | `install-freeradius.sh` | FreeRADIUS + rlm_sql MySQL, hook REST ke backend (port 3001) | 2-3 menit |
| 6 | `install-nginx.sh` | Nginx reverse proxy, termasuk `/uploads/` | 1 menit |
| 7 | `install-pm2.sh` | PM2, `next build` backend dan frontend, ecosystem config (4 proses) | 5-10 menit |
| 8 | `install-security.sh` | fail2ban, firewall UFW, pengamanan GenieACS NBI, pembersihan disk harian | 1-2 menit |
| - | `install-apk.sh` | *(Usang, jangan dipakai)* Untuk APK lihat [docs/BUILD-APK.md](../../docs/BUILD-APK.md) | - |
| - | `install-vpn-client.sh`, `install-wg-server.sh`, `install-l2tp-server.sh` | *(Opsional)* Klien SSTP, server WireGuard, server L2TP | 2 menit |

---

## 🌐 Environment yang Didukung

| Environment | Flag | UFW | Akses | Keterangan |
|------------|------|-----|-------|------------|
| **Public VPS** | `--env vps` | Aktif | Internet | DigitalOcean, Vultr, Hetzner, AWS |
| **Proxmox LXC** | `--env lxc` | Dilewati | LAN/VLAN | Container lokal di Proxmox |
| **Proxmox VM** | `--env vm` | Aktif | LAN | VM lokal, IP private |
| **Bare Metal** | `--env bare` | Aktif | LAN | Server fisik di lokasi |

---

## Proxmox LXC — Persiapan Host

Sebelum menjalankan installer di dalam LXC container, lakukan ini di **host Proxmox**:

### 1. Enable PPP & TUN untuk LXC (required untuk PPPoE/VPN)
```bash
# Di Proxmox host, ganti 100 dengan ID container Anda
pct set 100 --features nesting=1,tun=1

# Atau edit config manual
nano /etc/pve/lxc/100.conf
# Tambahkan:
# lxc.cgroup2.devices.allow: c 108:0 rwm
# lxc.cgroup2.devices.allow: c 10:200 rwm
# lxc.mount.entry: /dev/net dev/net none bind,create=dir
```

### 2. Proxmox Firewall — Buka Port
Di **Proxmox Datacenter Firewall** atau di konfigurasi CT, buka:

| Port | Protokol | Fungsi |
|------|----------|--------|
| 80 | TCP | HTTP Web App |
| 443 | TCP | HTTPS |
| 1812 | UDP | RADIUS Authentication |
| 1813 | UDP | RADIUS Accounting |
| 3799 | UDP | RADIUS CoA |
| 1701 | UDP | L2TP Tunnel |
| 500 | UDP | IPSec IKE |
| 4500 | UDP | IPSec NAT-T |

### 3. Akses Aplikasi
```
http://IP_LXC_CONTAINER
```

---

## 📂 Path Penting

| Path | Keterangan |
|------|------------|
| `/var/www/salfanet-radius/` | Root direktori aplikasi |
| `/var/www/salfanet-radius/backend/.env` | Environment variables backend (database, secrets, `CRON_SECRET`, kunci VAPID). Salinannya di `backend/.next/standalone/backend/.env` yang dibaca proses PM2 |
| `/var/data/salfanet/uploads/` | **File upload pengguna: bukti transfer, KTP, foto instalasi, logo. Di luar folder aplikasi supaya aman dari update dan build. Jangan hapus, dan masukkan ke backup!** |
| `/var/data/salfanet/baileys_auth/` | Sesi WhatsApp Baileys (tanpa ini harus scan QR ulang) |
| `/var/data/salfanet/backups/freeradius/` | Arsip backup konfigurasi FreeRADIUS |
| `/var/www/salfanet-radius/INSTALLATION_INFO.txt` | Ringkasan hasil instalasi |
| `/root/salfanet-backups/` | Backup otomatis sebelum update |
| `/var/log/salfanet-vps-install.log` | Log proses instalasi |

---

## 🔧 Perintah Berguna Setelah Install

```bash
# Cek status aplikasi
pm2 status

# Lihat log real-time
pm2 logs salfanet-backend

# Restart aplikasi
pm2 restart salfanet-backend

# Restart cron service
pm2 restart salfanet-cron

# Cek database
mysql -u salfanet -p salfanet_radius -e "SHOW TABLES;"

# Fix permission jika ada error akses file
bash /var/www/salfanet-radius/frontend/vps-install/fix-permissions.sh

# Cek port yang sedang digunakan
bash /var/www/salfanet-radius/frontend/vps-install/check-port.sh
```

---

## install-apk.sh — Build APK Android Customer (usang)

> ⚠️ **Usang.** Script ini membangun dari folder `mobile-app/` (Expo/React Native), yang sudah tidak ada di repo. Aplikasi Android sekarang Flutter di `mobile/customer_app/` dan `mobile/admin_app/`, dibangun di mesin pengembang (lihat README masing-masing), lalu APK-nya diunggah di panel admin, **Build APK, Rilis APK**. Panel memeriksa nama paket, nomor build, dan tanda tangan sebelum menerimanya. Bagian di bawah dipertahankan sebagai arsip. Panduan yang berlaku untuk semua APK (WebView, QRIS Listener, native): [docs/BUILD-APK.md](../../docs/BUILD-APK.md).

Script untuk membangun APK Android untuk customer self-service app.

### Perintah

```bash
# Install lengkap + build APK (pertama kali)
bash /var/www/salfanet-radius/frontend/vps-install/install-apk.sh

# Rebuild APK saja (SDK sudah ada, lebih cepat)
bash /var/www/salfanet-radius/frontend/vps-install/install-apk.sh --rebuild

# Cek status APK
bash /var/www/salfanet-radius/frontend/vps-install/install-apk.sh --status

# Install Java + SDK saja (tanpa build)
bash /var/www/salfanet-radius/frontend/vps-install/install-apk.sh --sdk-only

# Build APK saja (skip install SDK)
bash /var/www/salfanet-radius/frontend/vps-install/install-apk.sh --build-only
```

### Requirement
- Ubuntu 20.04+ / Debian 11+
- Minimum 2 GB RAM (atau swap)
- Minimum 3 GB disk space

### Output
```
/var/www/salfanet-radius/public/downloads/salfanet-radius.apk
http://VPS_IP/downloads/salfanet-radius.apk
```

### Estimasi Waktu

| Langkah | Waktu |
|---------|-------|
| Install Java 17 | 2-3 menit |
| Download Android SDK | 5-10 menit |
| Install SDK packages | 5-10 menit |
| npm install mobile-app | 3-5 menit |
| Gradle build APK | 10-20 menit |
| **Total** | **~25-48 menit** |

---

## 🆘 Troubleshooting

### LXC: PPP/TUN tidak tersedia
```bash
# Di Proxmox host:
pct set 100 --features nesting=1,tun=1
pct stop 100 ; pct start 100
```

### Gradle build gagal: "JAVA_HOME is not set"
```bash
source /etc/profile.d/android-sdk.sh
bash /var/www/salfanet-radius/frontend/vps-install/install-apk.sh --build-only
```

### Gradle build gagal: "SDK location not found"
```bash
echo "sdk.dir=/opt/android-sdk" > /var/www/salfanet-radius/mobile-app/android/local.properties
bash /var/www/salfanet-radius/frontend/vps-install/install-apk.sh --build-only
```

### Out of memory saat build
```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
bash /var/www/salfanet-radius/frontend/vps-install/install-apk.sh --build-only
```

### Prisma error setelah update
```bash
cd /var/www/salfanet-radius
npx prisma generate
npx prisma db push
pm2 restart salfanet-backend
```

### Logo / upload tidak muncul setelah update
Upload seharusnya aman. Jika tidak muncul, cek permission:
```bash
chown -R www-data:www-data /var/www/salfanet-radius/public/uploads/
chmod -R 755 /var/www/salfanet-radius/public/uploads/
```

---

## 🗑️ Uninstall

```bash
bash /var/www/salfanet-radius/frontend/vps-install/vps-uninstaller.sh
```

---

*Versi terakhir: Maret 2026*

**Metode 1: Git Clone (disarankan)**
```bash
git clone https://github.com/s4lfanet/salfanet-radius.git /root/salfanet-radius
cd /root/salfanet-radius
bash frontend/vps-install/vps-installer.sh
```

**Metode 2: Upload manual via SCP**
```bash
# Upload dari PC (jalankan di PowerShell/terminal lokal)
scp -r ./salfanet-radius root@IP_VPS:/root/salfanet-radius

# Lalu SSH ke VPS dan jalankan installer
ssh root@IP_VPS
cd /root/salfanet-radius
bash frontend/vps-install/vps-installer.sh
```

Installer akan otomatis mendeteksi environment, menampilkan pilihan, dan memandu semua konfigurasi.

### Paksa Environment Tertentu (Non-interactive)
```bash
# Force Proxmox LXC mode
bash frontend/vps-install/vps-installer.sh --env lxc

# Force Public VPS mode
bash frontend/vps-install/vps-installer.sh --env vps

# Force VM / local server mode
bash frontend/vps-install/vps-installer.sh --env vm

# Paksa IP tertentu (berguna di LXC/VM)
bash frontend/vps-install/vps-installer.sh --env lxc --ip 192.168.1.50
```
