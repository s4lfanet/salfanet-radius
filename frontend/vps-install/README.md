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
bash vps-install/vps-installer.sh
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
bash vps-install/vps-installer.sh
```

---

### Paksa Environment Tertentu (Non-interactive)

```bash
# Public VPS (DigitalOcean, Vultr, AWS, dll)
bash vps-install/vps-installer.sh --env vps

# Proxmox LXC Container
bash vps-install/vps-installer.sh --env lxc

# Proxmox VM / VirtualBox
bash vps-install/vps-installer.sh --env vm

# Bare Metal / Server Fisik
bash vps-install/vps-installer.sh --env bare

# Paksa IP tertentu (berguna di LXC/VM)
bash vps-install/vps-installer.sh --env lxc --ip 192.168.1.50
```

---

## 🔄 UPDATE KE VERSI TERBARU

### Metode 1 — updater.sh (Recommended)

Cara paling aman dan cepat. **Semua data upload (logo, foto KTP, bukti bayar) otomatis dipreservasi.**

```bash
bash /var/www/salfanet-radius/vps-install/updater.sh
```

---

### Metode 2 — Update via Git (Manual)

```bash
bash /var/www/salfanet-radius/vps-install/updater.sh --branch master
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

Installer menjalankan 7 step wajib + 2 step opsional:

| Step | Module | Yang Dilakukan | Waktu |
|------|--------|----------------|-------|
| 1 | `install-system.sh` | System packages, UFW, PPP/TUN, timezone, swap | 2-3 menit |
| 2 | `install-nodejs.sh` | Node.js 20 LTS via nvm | 2-3 menit |
| 3 | `install-mysql.sh` | MySQL 8, buat database & user | 3-5 menit |
| 4 | `install-app.sh` | Copy kode, buat `.env`, npm install, Prisma | 5-10 menit |
| 5 | `install-freeradius.sh` | FreeRADIUS + rlm_sql MySQL | 2-3 menit |
| 6 | `install-nginx.sh` | Nginx reverse proxy | 1 menit |
| 7 | `install-pm2.sh` | PM2, `next build`, ecosystem config | 5-10 menit |
| 8 | `install-apk.sh` | *(Opsional)* Build APK Android customer | 25-48 menit |
| 9 | `install-vpn-client.sh` | *(Opsional)* SSTP VPN client tools | 2 menit |

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
| `/var/www/salfanet-radius/.env` | Environment variables (database, secrets) |
| `/var/www/salfanet-radius/public/uploads/` | **File upload pengguna — jangan hapus!** |
| `/var/www/salfanet-radius/public/uploads/logos/` | Logo perusahaan |
| `/var/www/salfanet-radius/public/uploads/pppoe-customers/` | KTP & dokumen pelanggan |
| `/var/www/salfanet-radius/INSTALLATION_INFO.txt` | Ringkasan hasil instalasi |
| `/root/salfanet-backups/` | Backup otomatis sebelum update |
| `/var/log/salfanet-vps-install.log` | Log proses instalasi |

---

## 🔧 Perintah Berguna Setelah Install

```bash
# Cek status aplikasi
pm2 status

# Lihat log real-time
pm2 logs salfanet-radius

# Restart aplikasi
pm2 restart salfanet-radius

# Restart cron service
pm2 restart salfanet-cron

# Cek database
mysql -u salfanet -p salfanet_radius -e "SHOW TABLES;"

# Fix permission jika ada error akses file
bash /var/www/salfanet-radius/vps-install/fix-permissions.sh

# Cek port yang sedang digunakan
bash /var/www/salfanet-radius/vps-install/check-port.sh
```

---

## install-apk.sh — Build APK Android Customer

Script untuk membangun APK Android untuk customer self-service app.

### Perintah

```bash
# Install lengkap + build APK (pertama kali)
bash /var/www/salfanet-radius/vps-install/install-apk.sh

# Rebuild APK saja (SDK sudah ada, lebih cepat)
bash /var/www/salfanet-radius/vps-install/install-apk.sh --rebuild

# Cek status APK
bash /var/www/salfanet-radius/vps-install/install-apk.sh --status

# Install Java + SDK saja (tanpa build)
bash /var/www/salfanet-radius/vps-install/install-apk.sh --sdk-only

# Build APK saja (skip install SDK)
bash /var/www/salfanet-radius/vps-install/install-apk.sh --build-only
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
bash /var/www/salfanet-radius/vps-install/install-apk.sh --build-only
```

### Gradle build gagal: "SDK location not found"
```bash
echo "sdk.dir=/opt/android-sdk" > /var/www/salfanet-radius/mobile-app/android/local.properties
bash /var/www/salfanet-radius/vps-install/install-apk.sh --build-only
```

### Out of memory saat build
```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
bash /var/www/salfanet-radius/vps-install/install-apk.sh --build-only
```

### Prisma error setelah update
```bash
cd /var/www/salfanet-radius
npx prisma generate
npx prisma db push
pm2 restart salfanet-radius
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
bash /var/www/salfanet-radius/vps-install/vps-uninstaller.sh
```

---

*Versi terakhir: Maret 2026*

**Metode 1: Git Clone (disarankan)**
```bash
git clone https://github.com/s4lfanet/salfanet-radius.git /root/salfanet-radius
cd /root/salfanet-radius
bash vps-install/vps-installer.sh
```

**Metode 2: Upload manual via SCP**
```bash
# Upload dari PC (jalankan di PowerShell/terminal lokal)
scp -r ./salfanet-radius root@IP_VPS:/root/salfanet-radius

# Lalu SSH ke VPS dan jalankan installer
ssh root@IP_VPS
cd /root/salfanet-radius
bash vps-install/vps-installer.sh
```

Installer akan otomatis mendeteksi environment, menampilkan pilihan, dan memandu semua konfigurasi.

### Paksa Environment Tertentu (Non-interactive)
```bash
# Force Proxmox LXC mode
bash vps-install/vps-installer.sh --env lxc

# Force Public VPS mode
bash vps-install/vps-installer.sh --env vps

# Force VM / local server mode
bash vps-install/vps-installer.sh --env vm

# Paksa IP tertentu (berguna di LXC/VM)
bash vps-install/vps-installer.sh --env lxc --ip 192.168.1.50
```

---

## Environment yang Didukung

| Environment | Flag | UFW | PPP/TUN | IP | Akses |
|------------|------|-----|---------|----|-------|
| **Public VPS** | `--env vps` | Aktif | ✅ | Public | Internet |
| **Proxmox LXC** | `--env lxc` | Dilewati | Perlu config host | Private | LAN/VLAN |
| **Proxmox VM** | `--env vm` | Aktif | ✅ | Private | LAN |
| **Bare Metal** | `--env bare` | Aktif | ✅ | Private | LAN |

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
| 80 | TCP | HTTP (Web App) |
| 443 | TCP | HTTPS |
| 1812 | UDP | RADIUS Authentication |
| 1813 | UDP | RADIUS Accounting |
| 3799 | UDP | RADIUS CoA |
| 500 | UDP | IPSec IKE (L2TP/IPSec VPN) |
| 4500 | UDP | IPSec NAT-T (L2TP/IPSec VPN) |
| 1701 | UDP | L2TP Tunnel |

```bash
# Atau di Proxmox host dengan iptables:
iptables -I FORWARD -d 192.168.1.50 -p tcp --dport 80 -j ACCEPT
```

### 3. Akses Aplikasi
```
http://IP_LXC_CONTAINER
```

---

## Daftar Module

| File | Fungsi | Dipanggil |
|------|--------|----------|
| `vps-installer.sh` | **Main orchestrator** | `bash vps-installer.sh` |
| `common.sh` | Variabel, fungsi, detect environment | `source common.sh` |
| `install-system.sh` | System packages, PPP/TUN, timezone, NTP | Step 1 |
| `install-nodejs.sh` | Node.js 20 LTS via nvm | Step 2 |
| `install-mysql.sh` | MySQL 8, database, migrations, seed | Step 3 |
| `install-app.sh` | Copy app files, .env, npm install | Step 4 |
| `install-freeradius.sh` | FreeRADIUS + rlm_sql MySQL | Step 5 |
| `install-nginx.sh` | Nginx reverse proxy | Step 6 |
| `install-pm2.sh` | PM2, next build, ecosystem.config | Step 7 |
| `install-apk.sh` | Java 17, Android SDK, build APK customer | Step 8 (opsional) |
| `fix-permissions.sh` | Repair file permissions | Manual |
| `fix-prisma-engines.sh` | Repair Prisma binary | Manual |
| `check-port.sh` | Cek port yang digunakan | Manual |
| `vps-uninstaller.sh` | Uninstall lengkap | Manual |

---

## install-apk.sh — Panduan Lengkap

Script untuk membangun APK Android customer self-service.

### Perintah

```bash
# Install lengkap + build APK (pertama kali)
bash /var/www/salfanet-radius/vps-install/install-apk.sh

# Rebuild APK saja (SDK sudah ada, lebih cepat)
bash /var/www/salfanet-radius/vps-install/install-apk.sh --rebuild

# Cek status APK
bash /var/www/salfanet-radius/vps-install/install-apk.sh --status

# Install Java + SDK saja (tanpa build)
bash /var/www/salfanet-radius/vps-install/install-apk.sh --sdk-only

# Build APK saja (skip install SDK)
bash /var/www/salfanet-radius/vps-install/install-apk.sh --build-only
```

### Requirement
- Ubuntu 20.04+ / Debian 11+
- Minimum 2 GB RAM (atau swap)
- Minimum 3 GB disk space bebas

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

## Path Penting

| Path | Keterangan |
|------|------------|
| `/var/www/salfanet-radius/` | Root aplikasi (APP_DIR) |
| `/var/www/salfanet-radius/.env` | Environment variables |
| `/var/www/salfanet-radius/mobile-app/` | Source Expo/React Native |
| `/var/www/salfanet-radius/public/downloads/` | APK untuk download |
| `/opt/android-sdk/` | Android SDK |
| `/etc/profile.d/android-sdk.sh` | Android env vars |
| `/var/www/salfanet-radius/INSTALLATION_INFO.txt` | Info hasil instalasi |
| `/var/log/salfanet-vps-install.log` | Log instalasi |

---

## Troubleshooting

### LXC: PPP/TUN tidak tersedia
```bash
# Di Proxmox host:
pct set 100 --features nesting=1,tun=1
pct stop 100 ; pct start 100
```

### Gradle build gagal: "JAVA_HOME is not set"
```bash
source /etc/profile.d/android-sdk.sh
bash /var/www/salfanet-radius/vps-install/install-apk.sh --build-only
```

### Gradle build gagal: "SDK location not found"
```bash
echo "sdk.dir=/opt/android-sdk" > /var/www/salfanet-radius/mobile-app/android/local.properties
bash /var/www/salfanet-radius/vps-install/install-apk.sh --build-only
```

### Out of memory saat Gradle build
```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
bash /var/www/salfanet-radius/vps-install/install-apk.sh --build-only
```

---

## Uninstall

```bash
bash /root/salfanet-radius/vps-install/vps-uninstaller.sh
```

---

*Last updated: February 2026*

Kumpulan script untuk instalasi otomatis SALFANET RADIUS di Ubuntu/Debian VPS.

## Cara Pakai

### Install Pertama Kali (Full)
```bash
cd /root/salfanet-radius
bash vps-install/vps-installer.sh
```
Installer akan berjalan interaktif, memandu semua konfigurasi dan menjalankan 7-8 step.

### Jalankan Module Tertentu Saja
```bash
# Contoh: install ulang Nginx saja
source vps-install/common.sh
source vps-install/install-nginx.sh
install_nginx
```

---

## Daftar Module

| File | Fungsi | Jalankan Via |
|------|--------|-------------|
| `vps-installer.sh` | **Main orchestrator** — jalankan ini untuk install full | `bash vps-installer.sh` |
| `common.sh` | Variabel & fungsi shared (APP_DIR, warna, logging) | `source common.sh` |
| `install-system.sh` | System packages, UFW, timezone, swap | Step 1 |
| `install-nodejs.sh` | Node.js 20 LTS via nvm | Step 2 |
| `install-mysql.sh` | MySQL 8, database, migrations, seed | Step 3 |
| `install-app.sh` | Copy app files, .env, npm install, permissions | Step 4 |
| `install-freeradius.sh` | FreeRADIUS + rlm_sql MySQL module | Step 5 |
| `install-nginx.sh` | Nginx reverse proxy config | Step 6 |
| `install-pm2.sh` | PM2, ecosystem.config.js, `next build`, cron | Step 7 |
| `install-apk.sh` | Java 17, Android SDK, build APK customer | Step 8 (opsional) |
| `fix-permissions.sh` | Repair file permissions jika error | Manual |
| `fix-prisma-engines.sh` | Repair Prisma binary jika crash | Manual |
| `check-port.sh` | Cek port yang digunakan | Manual |
| `vps-uninstaller.sh` | Uninstall lengkap (hapus semua) | Manual |

---

## install-apk.sh — Panduan Lengkap

Script untuk membangun APK Android customer self-service.

### Requirement
- Ubuntu 20.04+ / Debian 11+
- Minimum 2 GB RAM (atau swap)
- Minimum 3 GB disk space bebas
- Aplikasi sudah ter-install (`install-app.sh` selesai)

### Perintah

```bash
# Install lengkap + build APK (pertama kali)
bash /var/www/salfanet-radius/vps-install/install-apk.sh

# Rebuild APK saja (SDK sudah ada, lebih cepat)
bash /var/www/salfanet-radius/vps-install/install-apk.sh --rebuild

# Cek status APK (sudah ada atau belum)
bash /var/www/salfanet-radius/vps-install/install-apk.sh --status

# Install Java + SDK saja (tanpa build APK)
bash /var/www/salfanet-radius/vps-install/install-apk.sh --sdk-only

# Build APK saja (skip install Java/SDK)
bash /var/www/salfanet-radius/vps-install/install-apk.sh --build-only
```

### Yang Dilakukan Script

1. Install **OpenJDK 17**
2. Download & install **Android SDK command-line tools**
3. Install SDK packages: `platforms;android-35`, `build-tools;35.0.0`, `platform-tools`
4. Accept Android SDK licenses otomatis
5. Set `mobile-app/.env` dengan `API_URL=http://VPS_IP`
6. `npm install` di `mobile-app/`
7. Build APK via `./gradlew assembleRelease`
8. Copy APK ke `public/downloads/salfanet-radius.apk`
9. Config Nginx untuk serve endpoint `/downloads/`

### Output

```
/var/www/salfanet-radius/public/downloads/salfanet-radius.apk
/var/www/salfanet-radius/public/downloads/apk-info.json
```

APK dapat didownload customer di:
```
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

## Path Penting

| Path | Keterangan |
|------|------------|
| `/var/www/salfanet-radius/` | Root aplikasi (APP_DIR) |
| `/var/www/salfanet-radius/.env` | Environment variables |
| `/var/www/salfanet-radius/mobile-app/` | Source Expo/React Native |
| `/var/www/salfanet-radius/public/downloads/` | APK output untuk download |
| `/opt/android-sdk/` | Android SDK |
| `/etc/profile.d/android-sdk.sh` | Android env vars |
| `/etc/nginx/sites-enabled/salfanet-radius` | Nginx config |
| `/var/www/salfanet-radius/INSTALLATION_INFO.txt` | Info hasil instalasi |

---

## Troubleshooting

### Gradle build gagal: "JAVA_HOME is not set"
```bash
source /etc/profile.d/android-sdk.sh
bash /var/www/salfanet-radius/vps-install/install-apk.sh --build-only
```

### Gradle build gagal: "SDK location not found"
```bash
# Buat local.properties
echo "sdk.dir=/opt/android-sdk" > /var/www/salfanet-radius/mobile-app/android/local.properties
bash /var/www/salfanet-radius/vps-install/install-apk.sh --build-only
```

### Out of memory saat Gradle build
```bash
# Tambah swap jika RAM < 2GB
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
# Lalu coba build lagi
bash /var/www/salfanet-radius/vps-install/install-apk.sh --build-only
```

### Download Android SDK gagal (timeout)
```bash
# Download manual lalu copy ke /opt/android-sdk
# URL: https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
wget -O /tmp/cmdline-tools.zip \
  "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
mkdir -p /opt/android-sdk/cmdline-tools/latest
unzip /tmp/cmdline-tools.zip -d /tmp/ct-extract
cp -r /tmp/ct-extract/cmdline-tools/. /opt/android-sdk/cmdline-tools/latest/
```

### Nginx tidak serve APK
```bash
# Cek lokasi config nginx
ls /etc/nginx/sites-enabled/
# Manual tambah location
nano /etc/nginx/sites-enabled/salfanet-radius
# Tambahkan di dalam server {}:
# location /downloads/ {
#     alias /var/www/salfanet-radius/public/downloads/;
# }
nginx -t && systemctl reload nginx
```

---

## Uninstall

```bash
# Hapus semua (hati-hati: menghapus data!)
bash /root/salfanet-radius/vps-install/vps-uninstaller.sh
```

---

*Last updated: February 2026*
