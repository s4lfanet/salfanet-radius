# Panduan Setup SALFANET RADIUS di Proxmox LXC

Panduan lengkap untuk deploy SALFANET RADIUS di dalam **Proxmox LXC Container** —
mulai dari membuat container, konfigurasi host, hingga menjalankan installer.

---

## Daftar Isi

1. [Persyaratan](#1-persyaratan)
2. [Buat LXC Container](#2-buat-lxc-container)
3. [Konfigurasi Host Proxmox](#3-konfigurasi-host-proxmox)
4. [Setting Jaringan LXC](#4-setting-jaringan-lxc)
5. [Proxmox Firewall](#5-proxmox-firewall)
6. [Install SALFANET RADIUS di LXC](#6-install-salfanet-radius-di-lxc)
7. [Akses Aplikasi](#7-akses-aplikasi)
8. [Port Forwarding (Opsional)](#8-port-forwarding-opsional)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Persyaratan

**Proxmox Host:**
- Proxmox VE 7.4 atau lebih baru
- CPU: minimal 2 core tersedia untuk container
- RAM: minimal 3 GB tersedia untuk container
- Disk: minimal 20 GB tersedia

**Network:**
- Bridge `vmbr0` sudah tersedia (default Proxmox)
- Akses internet dari container (untuk download packages)

---

## 2. Buat LXC Container

### Cara A: Via Proxmox Web UI

1. Buka **Proxmox Web UI** → `Create CT`
2. Isi konfigurasi:

   | Field | Nilai yang Direkomendasikan |
   |-------|---------------------------|
   | CT ID | `100` (atau bebas) |
   | Hostname | `salfanet-radius` |
   | Password | *(isi password root)* |
   | Template | `ubuntu-22.04-standard` |
   | Disk | minimal `20 GB` |
   | CPU | minimal `2 cores` |
   | RAM | minimal `2048 MB` (2 GB) |
   | Swap | `512 MB` |
   | Network | Bridge: `vmbr0`, DHCP atau IP statis |
   | DNS | `8.8.8.8, 1.1.1.1` |

3. Centang **"Start after created"**
4. Klik **Finish**

### Cara B: Via Command Line di Proxmox Host

```bash
# Download template Ubuntu 22.04 (jika belum ada)
pveam update
pveam download local ubuntu-22.04-standard_22.04-1_amd64.tar.zst

# Buat container (ganti nilai sesuai kebutuhan)
pct create 100 \
  local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst \
  --hostname salfanet-radius \
  --password YourRootPass123 \
  --cores 2 \
  --memory 2048 \
  --swap 512 \
  --rootfs local-lvm:20 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --nameserver "8.8.8.8 1.1.1.1" \
  --unprivileged 1 \
  --features nesting=1,tun=1

# Jalankan container
pct start 100
```

> **Catatan:** `--unprivileged 1` adalah mode yang direkomendasikan untuk keamanan.
> `--features nesting=1,tun=1` diperlukan untuk PPPoE dan VPN.

---

## 3. Konfigurasi Host Proxmox

Langkah ini **wajib** dilakukan di **host Proxmox** (bukan di dalam container).

### 3.1 Enable PPP & TUN (untuk PPPoE dan VPN)

```bash
# Di Proxmox HOST — ganti 100 dengan CT ID Anda
pct set 100 --features nesting=1,tun=1

# Restart container agar settings berlaku
pct reboot 100
# Atau cold boot (lebih disarankan untuk perubahan hardware features)
pct stop 100 ; pct start 100
```

### 3.2 Konfigurasi Manual (jika cara di atas tidak cukup)

Untuk container yang memerlukan akses perangkat `/dev/ppp` (PPPoE):

```bash
# Edit config LXC di Proxmox host
nano /etc/pve/lxc/100.conf
```

Tambahkan baris berikut di akhir file:

```ini
# PPP device untuk PPPoE
lxc.cgroup2.devices.allow: c 108:0 rwm
lxc.mount.entry: /dev/ppp dev/ppp none bind,optional,create=file

# TUN device untuk VPN
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net dev/net none bind,create=dir
```

Simpan dan restart container:

```bash
pct stop 100 ; pct start 100
```

### 3.3 Verifikasi di Dalam Container

```bash
# Masuk ke container
pct enter 100

# Cek PPP
ls -la /dev/ppp
# Output: crw------- 1 root root 108, 0 ...

# Cek TUN
ls -la /dev/net/tun
# Output: crw-rw-rw- 1 root root 10, 200 ...
```

---

## 4. Setting Jaringan LXC

### Opsi A: IP Statis (Recommended untuk Server)

Lebih stabil karena IP tidak berubah — penting untuk konfigurasi NAS/router RADIUS.

```bash
# Edit config container di host Proxmox
nano /etc/pve/lxc/100.conf
```

Ubah baris `net0`:
```ini
net0: name=eth0,bridge=vmbr0,ip=192.168.1.50/24,gw=192.168.1.1
```

Atau via pct command:
```bash
pct set 100 --net0 name=eth0,bridge=vmbr0,ip=192.168.1.50/24,gw=192.168.1.1
pct reboot 100
```

### Opsi B: DHCP + IP Reservation

1. Biarkan container pakai DHCP
2. Cek MAC address container:
   ```bash
   pct config 100 | grep net0
   # net0: name=eth0,bridge=vmbr0,hwaddr=BC:24:11:xx:xx:xx,...
   ```
3. Di router/DHCP server, buat reservation untuk MAC tersebut
4. Restart container: `pct reboot 100`

### Cek IP di Dalam Container

```bash
pct enter 100
ip addr show eth0
```

---

## 5. Proxmox Firewall

> Karena LXC unprivileged tidak bisa menjalankan UFW, firewall dikelola di **Proxmox**.

### 5.1 Enable Firewall untuk Container

Di **Proxmox Web UI**:
1. Klik CT `100` → tab **Firewall**
2. Klik **Options** → set **Firewall: Yes**

### 5.2 Tambah Rules Firewall

Di tab **Firewall** container, tambahkan rules berikut:

| Direction | Action | Protocol | Port | Comment |
|-----------|--------|----------|------|---------|
| IN | ACCEPT | TCP | 22 | SSH |
| IN | ACCEPT | TCP | 80 | HTTP Web App |
| IN | ACCEPT | TCP | 443 | HTTPS |
| IN | ACCEPT | UDP | 1812 | RADIUS Authentication |
| IN | ACCEPT | UDP | 1813 | RADIUS Accounting |
| IN | ACCEPT | UDP | 3799 | RADIUS CoA |

### 5.3 Cara Cepat via Command Line di Host Proxmox

```bash
# Buat file firewall untuk CT 100
mkdir -p /etc/pve/firewall
cat > /etc/pve/firewall/100.fw <<'EOF'
[OPTIONS]
enable: 1

[RULES]
IN ACCEPT -p tcp --dport 22 -comment "SSH"
IN ACCEPT -p tcp --dport 80 -comment "HTTP"
IN ACCEPT -p tcp --dport 443 -comment "HTTPS"
IN ACCEPT -p udp --dport 1812 -comment "RADIUS Auth"
IN ACCEPT -p udp --dport 1813 -comment "RADIUS Acct"
IN ACCEPT -p udp --dport 3799 -comment "RADIUS CoA"
IN ACCEPT -p tcp --dport 3000 -comment "App Direct"
EOF
```

---

## 6. Install SALFANET RADIUS di LXC

### 6.1 Masuk ke Container

```bash
# Dari Proxmox host
pct enter 100

# Atau via SSH (setelah tahu IP)
ssh root@192.168.1.50
```

### 6.2 Update System & Install Git

```bash
apt update && apt upgrade -y
apt install -y git unzip curl wget
```

### 6.3 Upload Source Code

**Cara A — Upload ZIP dari Windows:**

Di Windows (PowerShell):
```powershell
# Export dulu dari project folder
cd C:\Users\yanz\Downloads\salfanet-radius-main\production
.\export-production.ps1

# Upload ZIP ke container
scp ..\salfanet-radius-*.zip root@192.168.1.50:/root/
```

Di dalam container:
```bash
cd /root
unzip salfanet-radius-*.zip
cd salfanet-radius
```

**Cara B — Copy langsung via Proxmox host (jika file ada di host):**

```bash
# Di Proxmox host
pct push 100 /path/to/salfanet-radius.zip /root/salfanet-radius.zip

# Di container
cd /root && unzip salfanet-radius.zip
cd salfanet-radius
```

### 6.4 Jalankan Installer

```bash
# Jalankan installer dengan mode LXC
bash vps-install/vps-installer.sh --env lxc

# Atau biarkan auto-detect (akan terdeteksi sebagai LXC otomatis)
bash vps-install/vps-installer.sh
```

Installer akan otomatis:
- Men-skip UFW (tidak support di LXC unprivileged)
- Menampilkan perintah PPP/TUN yang perlu dijalankan di host
- Menggunakan IP private sebagai URL aplikasi

### 6.5 Ikuti Wizard Installer

```
Step 0: Pilih Environment
  > Otomatis terdeteksi: Proxmox LXC Container
  > Konfirmasi: [2] Proxmox LXC Container

Step 0: Pilih User
  > [1] Gunakan user existing (ubuntu/root)
  > [2] Buat user khusus: salfanet

  IP yang terdeteksi: 192.168.1.50 (Private - Proxmox LXC)
  Gunakan IP ini? [Y/n]:  → tekan Enter

Ringkasan:
  Environment : Proxmox LXC Container
  IP Address  : 192.168.1.50
  UFW         : DILEWATI (LXC)
  
Mulai instalasi? [Y/n]:  → tekan Enter (atau Y)
```

Proses instalasi berlangsung **20-35 menit**.

---

## 7. Akses Aplikasi

Setelah instalasi selesai, akses dari browser di jaringan yang sama:

```
http://192.168.1.50
http://192.168.1.50/admin
```

### Login Default
- Username: `superadmin`
- Password: `admin123`

> **Ganti password segera setelah login pertama!**

### Lokasi File Info Instalasi

```bash
cat /var/www/salfanet-radius/INSTALLATION_INFO.txt
```

---

## 8. Port Forwarding (Opsional)

Jika ingin mengakses aplikasi dari luar jaringan lokal (internet):

### Opsi A: Port Forwarding di Router

Di router rumah/kantor, tambahkan aturan:
| WAN Port | LAN IP | LAN Port | Protokol |
|----------|--------|----------|----------|
| 80 | 192.168.1.50 | 80 | TCP |
| 443 | 192.168.1.50 | 443 | TCP |
| 1812 | 192.168.1.50 | 1812 | UDP |
| 1813 | 192.168.1.50 | 1813 | UDP |
| 3799 | 192.168.1.50 | 3799 | UDP |

### Opsi B: Cloudflare Tunnel (Tanpa IP Publik)

Solusi terbaik jika tidak punya IP publik statik:

```bash
# Di dalam container LXC
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Login ke Cloudflare
cloudflared tunnel login

# Buat tunnel
cloudflared tunnel create salfanet-radius

# Konfigurasi
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml <<EOF
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: salfanet.yourdomain.com
    service: http://localhost:80
  - service: http_status:404
EOF

# Jalankan sebagai service
cloudflared service install
systemctl enable cloudflared
systemctl start cloudflared
```

### Opsi C: IP Forwarding di Proxmox Host

```bash
# Di Proxmox host — forward port 80 dari WAN ke container
iptables -t nat -A PREROUTING -i vmbr0 -p tcp --dport 80 -j DNAT --to-destination 192.168.1.50:80
iptables -t nat -A PREROUTING -i vmbr0 -p tcp --dport 443 -j DNAT --to-destination 192.168.1.50:443
iptables -t nat -A PREROUTING -i vmbr0 -p udp --dport 1812 -j DNAT --to-destination 192.168.1.50:1812
iptables -t nat -A PREROUTING -i vmbr0 -p udp --dport 1813 -j DNAT --to-destination 192.168.1.50:1813
iptables -t nat -A PREROUTING -i vmbr0 -p udp --dport 3799 -j DNAT --to-destination 192.168.1.50:3799

# Simpan iptables rules
iptables-save > /etc/iptables/rules.v4
```

---

## 9. Troubleshooting

### Container tidak bisa connect ke internet

```bash
# Di dalam container
ping 8.8.8.8           # Test koneksi
ping google.com        # Test DNS

# Jika DNS bermasalah
echo "nameserver 8.8.8.8" > /etc/resolv.conf
echo "nameserver 1.1.1.1" >> /etc/resolv.conf
```

### /dev/ppp tidak ada setelah restart

```bash
# Di Proxmox host — verifikasi features sudah di-set
pct config 100 | grep features
# Output harus: features: nesting=1,tun=1

# Jika belum ada, set ulang
pct set 100 --features nesting=1,tun=1
pct stop 100 ; pct start 100
```

### Aplikasi tidak bisa diakses dari jaringan lain

```bash
# Di dalam container — cek Nginx berjalan
systemctl status nginx

# Cek port yang mendengarkan
ss -tlnp | grep -E "80|443|3000"

# Cek PM2
pm2 list
pm2 logs salfanet-backend --lines 50
```

### MySQL gagal start di LXC

```bash
# Cek status
systemctl status mysql

# Cek error log
journalctl -u mysql -n 50

# Perbaikan umum untuk LXC
chown -R mysql:mysql /var/lib/mysql
chmod 750 /var/lib/mysql
systemctl restart mysql
```

### FreeRADIUS tidak bisa listen di port 1812

```bash
# Test manual dengan debug mode
freeradius -X 2>&1 | head -50

# Cek port
ss -ulnp | grep 1812

# Restart
systemctl restart freeradius
```

### Swap tidak tersedia (build gagal kehabisan memori)

```bash
# Buat swap file di dalam container
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

# Permanen (tambahkan ke /etc/fstab)
echo "/swapfile none swap sw 0 0" >> /etc/fstab

# Verifikasi
free -h
```

> **Catatan:** Swap di dalam LXC unprivileged memerlukan setting `swap` di konfigurasi container:
> ```bash
> # Di Proxmox host
> pct set 100 --swap 1024
> ```

---

## Referensi Perintah Proxmox Host

```bash
# Lihat semua container
pct list

# Start / Stop / Reboot container
pct start 100
pct stop 100
pct reboot 100                  # Graceful restart (ACPI)
# pct stop 100 ; pct start 100  # Cold restart (setelah ubah features/hardware)

# Masuk ke container (console)
pct enter 100

# Lihat config container
pct config 100

# Update config container
pct set 100 --memory 4096       # Tambah RAM
pct set 100 --cores 4           # Tambah CPU
pct set 100 --swap 1024         # Tambah swap
pct set 100 --features nesting=1,tun=1  # Enable PPP/TUN

# Snapshot (backup cepat sebelum update)
pct snapshot 100 before-update --description "Before SALFANET update"
pct listsnapshot 100
pct rollback 100 before-update

# Clone container
pct clone 100 101 --hostname salfanet-radius-2
```

---

*Last updated: February 2026*
