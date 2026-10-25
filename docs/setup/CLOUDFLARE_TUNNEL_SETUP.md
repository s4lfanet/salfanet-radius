# CLOUDFLARE TUNNEL SETUP - VPS Lokal ke Zero Trust

## Panduan Lengkap Setup Cloudflare Tunnel untuk VPS Ubuntu Lokal

**Tujuan**: Mengekspos VPS lokal (IP private) ke internet melalui subdomain dengan Cloudflare Zero Trust Tunnel

**Kebutuhan**:
- Domain yang sudah ditambahkan ke Cloudflare
- VPS Ubuntu (lokal/private IP)
- Akun Cloudflare dengan Zero Trust aktif
- Aplikasi RADIUS berjalan di port 3000

---

## METODE 1: Install Cloudflared Manual (Recommended untuk Ubuntu)

### Step 1: Install Cloudflared di VPS Ubuntu

SSH ke VPS lokal Anda, lalu jalankan:

```bash
# Download cloudflared untuk Ubuntu/Debian
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb

# Install package
sudo dpkg -i cloudflared-linux-amd64.deb

# Verifikasi instalasi
cloudflared --version
```

**Output yang diharapkan**:
```
cloudflared version 2024.x.x (built xxxx-xx-xx)
```

### Step 2: Login ke Cloudflare Account

```bash
# Login ke Cloudflare
cloudflared tunnel login
```

**Proses**:
1. Command akan generate URL seperti: `https://dash.cloudflare.com/argotunnel?callback=...`
2. Copy URL tersebut dan buka di browser
3. Login ke Cloudflare account Anda
4. Pilih domain yang akan digunakan
5. Authorize tunnel

**File yang tercipta**:
- Certificate tersimpan di: `~/.cloudflared/cert.pem`

### Step 3: Buat Tunnel Baru

```bash
# Buat tunnel dengan nama "salfanet-radius"
cloudflared tunnel create salfanet-radius
```

**Output**:
```
Tunnel credentials written to /root/.cloudflared/<TUNNEL-ID>.json
Created tunnel salfanet-radius with id <TUNNEL-ID>
```

**Catat TUNNEL-ID** yang muncul (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)

### Step 4: Konfigurasi Tunnel

Buat file konfigurasi:

```bash
nano ~/.cloudflared/config.yml
```

**Isi file konfigurasi** (sesuaikan TUNNEL-ID dan domain):

```yaml
tunnel: <TUNNEL-ID>
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json

# Ingress rules
ingress:
  # Route subdomain ke aplikasi RADIUS
  - hostname: radius.salfa.my.id
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # Route tambahan jika ada service lain
  # - hostname: admin.salfa.my.id
  #   service: http://localhost:8080
  
  # Catch-all rule (HARUS ADA DI PALING BAWAH)
  - service: http_status:404
```

**Penjelasan**:
- `hostname`: Subdomain yang akan digunakan
- `service`: Aplikasi lokal yang akan diekspos (http://localhost:3000)
- `noTLSVerify`: Jika aplikasi lokal tidak pakai HTTPS
- `connectTimeout`: Timeout koneksi
- Catch-all rule wajib ada di baris terakhir

**Simpan** dengan `Ctrl+X`, `Y`, `Enter`

### Step 5: Route DNS ke Tunnel

```bash
# Route subdomain ke tunnel
cloudflared tunnel route dns salfanet-radius radius.salfa.my.id
```

**Output**:
```
2024-xx-xx INF Added CNAME radius.salfa.my.id which will route to this tunnel
```

**Otomatis membuat**:
- DNS CNAME record di Cloudflare
- Pointing ke `<TUNNEL-ID>.cfargotunnel.com`

### Step 6: Test Run Tunnel

```bash
# Test jalankan tunnel
cloudflared tunnel run salfanet-radius
```

**Output yang baik**:
```
INF Starting tunnel tunnelID=<TUNNEL-ID>
INF Version 2024.x.x
INF GOPROCS: 2
INF Connection registered connIndex=0 ip=xxx.xxx.xxx.xxx
INF Connection registered connIndex=1 ip=xxx.xxx.xxx.xxx
INF Connection registered connIndex=2 ip=xxx.xxx.xxx.xxx
INF Connection registered connIndex=3 ip=xxx.xxx.xxx.xxx
```

**Artinya**: 4 koneksi ke Cloudflare edge berhasil terbentuk

**Akses dari browser**: `https://radius.salfa.my.id`

Jika berhasil, lanjut ke Step 7. Jika gagal, `Ctrl+C` dan troubleshoot.

### Step 7: Setup Systemd Service (Jalankan Otomatis)

Buat systemd service agar tunnel berjalan otomatis:

```bash
# Install service
sudo cloudflared service install
```

**Enable dan start service**:

```bash
# Enable autostart
sudo systemctl enable cloudflared

# Start service
sudo systemctl start cloudflared

# Check status
sudo systemctl status cloudflared
```

**Output yang baik**:
```
● cloudflared.service - cloudflared
   Loaded: loaded (/etc/systemd/system/cloudflared.service; enabled)
   Active: active (running) since Sun 2024-xx-xx
```

**Manage service**:
```bash
# Stop tunnel
sudo systemctl stop cloudflared

# Restart tunnel
sudo systemctl restart cloudflared

# Check logs
sudo journalctl -u cloudflared -f
```

---

## METODE 2: Via Cloudflare Zero Trust Dashboard (GUI)

Jika ingin menggunakan dashboard web:

### Step 1: Buka Cloudflare Zero Trust

1. Login ke: https://one.dash.cloudflare.com/
2. Pilih account Anda
3. Menu: **Access** → **Tunnels**
4. Klik: **Create a tunnel**

### Step 2: Pilih Tipe Tunnel

- Pilih: **Cloudflared**
- Klik: **Next**

### Step 3: Nama Tunnel

- Nama: `salfanet-radius`
- Klik: **Save tunnel**

### Step 4: Install Connector

**Karena Ubuntu tidak ada di pilihan**, pilih **"Debian"** atau ikuti instruksi manual:

1. Copy command yang muncul, contoh:
```bash
sudo cloudflared service install <TOKEN>
```

2. SSH ke VPS, paste command tersebut

### Step 5: Configure Route

Di dashboard:

1. **Public Hostname**:
   - Subdomain: `radius`
   - Domain: `salfa.my.id` (pilih dari dropdown)
   - Path: (kosongkan)

2. **Service**:
   - Type: `HTTP`
   - URL: `localhost:3000`

3. **Additional settings** (opsional):
   - No TLS Verify: ✅ (jika app tidak pakai HTTPS)
   - HTTP Host Header: (kosongkan)

4. Klik: **Save tunnel**

### Step 6: Verifikasi

1. Status connector harus: **HEALTHY** (hijau)
2. Akses: `https://radius.salfa.my.id`

---

## VERIFIKASI & TROUBLESHOOTING

### Cek Status Tunnel

```bash
# List semua tunnel
cloudflared tunnel list

# Info tunnel spesifik
cloudflared tunnel info salfanet-radius

# Check DNS
dig radius.salfa.my.id
```

### Cek Koneksi

```bash
# Dari VPS, pastikan aplikasi berjalan
curl http://localhost:3000

# Check cloudflared logs
sudo journalctl -u cloudflared -n 100
```

### Troubleshooting Common Issues

#### ❌ Error: "tunnel credentials file not found"

**Solusi**:
```bash
# Pastikan file credentials ada
ls -la ~/.cloudflared/

# Atau specify path di config.yml
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json
```

#### ❌ Error: "Cannot reach origin service"

**Penyebab**: Aplikasi tidak berjalan di port yang dikonfigurasi

**Solusi**:
```bash
# Check app berjalan
sudo netstat -tlnp | grep 3000

# Atau
sudo ss -tlnp | grep 3000

# Pastikan PM2 running
pm2 status
```

#### ❌ Error: "DNS record already exists"

**Solusi**:
```bash
# Hapus record lama di Cloudflare Dashboard
# Atau route ulang
cloudflared tunnel route dns salfanet-radius radius.salfa.my.id --overwrite-dns
```

#### ❌ 502 Bad Gateway

**Penyebab**: Service di VPS tidak respond

**Solusi**:
```bash
# Check app logs
pm2 logs salfanet-backend

# Restart app
pm2 restart salfanet-backend

# Restart tunnel
sudo systemctl restart cloudflared
```

#### ❌ 404 Not Found

**Penyebab**: DNS belum route atau catch-all rule salah

**Solusi**:
- Pastikan ada catch-all rule di `config.yml`
- Route ulang DNS
- Restart cloudflared

---

## SETUP MULTIPLE SERVICES

Jika ingin ekspos beberapa service sekaligus:

**Edit config**:
```bash
nano ~/.cloudflared/config.yml
```

**Tambahkan routes**:
```yaml
tunnel: <TUNNEL-ID>
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json

ingress:
  # Service 1: RADIUS App
  - hostname: radius.salfa.my.id
    service: http://localhost:3000
  
  # Service 2: FreeRADIUS Admin (jika ada)
  - hostname: admin.salfa.my.id
    service: http://localhost:8080
  
  # Service 3: Monitoring (jika ada)
  - hostname: monitor.salfa.my.id
    service: http://localhost:9090
  
  # Catch-all
  - service: http_status:404
```

**Route setiap subdomain**:
```bash
cloudflared tunnel route dns salfanet-radius radius.salfa.my.id
cloudflared tunnel route dns salfanet-radius admin.salfa.my.id
cloudflared tunnel route dns salfanet-radius monitor.salfa.my.id
```

**Restart**:
```bash
sudo systemctl restart cloudflared
```

---

## KEAMANAN TAMBAHAN - Zero Trust Access

Tambahkan proteksi akses dengan Zero Trust:

### Step 1: Buat Access Policy

1. Dashboard: **Access** → **Applications**
2. Klik: **Add an application**
3. Pilih: **Self-hosted**

### Step 2: Configure Application

- **Application name**: RADIUS Admin
- **Session Duration**: 24 hours
- **Application domain**:
  - Subdomain: `radius`
  - Domain: `salfa.my.id`

### Step 3: Add Policy

**Policy name**: Admin Only

**Action**: Allow

**Rules**:
- Rule type: **Emails**
- Value: `admin@salfa.my.id` (atau email Anda)

Atau pakai **Access Group** untuk multiple users.

### Step 4: Save

Sekarang akses ke `https://radius.salfa.my.id` akan meminta login dulu.

---

## SSL CERTIFICATE SETUP

### 🎉 Good News: SSL Otomatis Dari Cloudflare!

**Dengan Cloudflare Tunnel, SSL sudah otomatis!**

✅ Ketika Anda akses `https://radius.salfa.my.id`:
- SSL certificate otomatis dari Cloudflare
- Valid dan trusted (tidak ada warning browser)
- Auto-renewal (tidak perlu perpanjang manual)
- Support HTTP/2 dan HTTP/3

**Tidak perlu**:
- ❌ Install Let's Encrypt / Certbot
- ❌ Setup nginx SSL
- ❌ Perpanjang certificate manual
- ❌ Beli SSL certificate

### Cara Kerja SSL di Cloudflare Tunnel

```
User Browser  ←→  Cloudflare Edge  ←→  Tunnel  ←→  VPS (localhost:3000)
  [HTTPS]           [HTTPS/SSL]       [Encrypted]    [HTTP]
```

**Flow**:
1. User mengakses `https://radius.salfa.my.id`
2. Cloudflare serve SSL certificate (auto-managed)
3. Traffic di-encrypt dari browser ke Cloudflare
4. Cloudflare Tunnel encrypt traffic ke VPS Anda
5. Di VPS, aplikasi tetap pakai HTTP (localhost:3000)

### Verifikasi SSL

```bash
# Check SSL dari terminal
curl -I https://radius.salfa.my.id

# Output yang baik:
# HTTP/2 200
# server: cloudflare
# ...
```

Atau buka di browser dan klik ikon gembok 🔒 di address bar:
- Certificate issued by: Cloudflare Inc
- Valid period: 1 tahun (auto-renewal)

---

## SSL MODE DI CLOUDFLARE (Opsional)

### Check & Set SSL Mode

1. Login ke Cloudflare Dashboard
2. Pilih domain: **salfa.my.id**
3. Menu: **SSL/TLS** → **Overview**

### SSL Mode Options

**🟢 Recommended: Flexible** (Default untuk HTTP origin)
```
Browser ←HTTPS→ Cloudflare ←HTTP→ Origin (VPS)
```
- ✅ SSL antara user dan Cloudflare
- ✅ Tidak perlu SSL di VPS
- ✅ Cocok untuk aplikasi internal

**🟡 Full** (Jika VPS pakai self-signed certificate)
```
Browser ←HTTPS→ Cloudflare ←HTTPS→ Origin (VPS)
```
- ✅ End-to-end encryption
- ⚠️ Perlu SSL di nginx (bisa self-signed)

**🟢 Full (Strict)** (Paling aman - dengan Origin Certificate)
```
Browser ←HTTPS→ Cloudflare ←HTTPS→ Origin (VPS)
```
- ✅ End-to-end encryption
- ✅ Certificate validation
- ⚠️ Perlu Cloudflare Origin Certificate di VPS

---

## SETUP ORIGIN CERTIFICATE (Optional - Extra Security)

Untuk enkripsi end-to-end antara Cloudflare dan VPS Anda:

### Step 1: Generate Origin Certificate

1. Cloudflare Dashboard → Domain → **SSL/TLS**
2. Tab: **Origin Server**
3. Klik: **Create Certificate**

**Settings**:
- Private key type: **RSA (2048)**
- Hostnames: 
  - `radius.salfa.my.id`
  - `*.salfa.my.id` (untuk wildcard)
- Certificate validity: **15 years**
- Klik: **Create**

### Step 2: Save Certificate Files

Copy dan save 2 file:

**1. Origin Certificate** (`origin-cert.pem`):
```
-----BEGIN CERTIFICATE-----
MIIEpDCCAowCCQC...
(copy seluruh isi)
-----END CERTIFICATE-----
```

**2. Private Key** (`origin-key.pem`):
```
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBg...
(copy seluruh isi)
-----END PRIVATE KEY-----
```

### Step 3: Upload ke VPS

SSH ke VPS dan buat directory:

```bash
# Buat folder untuk SSL
sudo mkdir -p /etc/ssl/cloudflare
cd /etc/ssl/cloudflare

# Buat file certificate
sudo nano origin-cert.pem
# Paste isi Origin Certificate, save (Ctrl+X, Y, Enter)

# Buat file private key
sudo nano origin-key.pem
# Paste isi Private Key, save

# Set permissions
sudo chmod 600 origin-key.pem
sudo chmod 644 origin-cert.pem
```

### Step 4: Configure Nginx untuk SSL

Edit nginx config:

```bash
sudo nano /etc/nginx/sites-available/salfanet-radius
```

**Ubah konfigurasi**:

```nginx
server {
    listen 3000 ssl http2;
    server_name radius.salfa.my.id;

    # SSL Certificates dari Cloudflare Origin
    ssl_certificate /etc/ssl/cloudflare/origin-cert.pem;
    ssl_certificate_key /etc/ssl/cloudflare/origin-key.pem;

    # SSL Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    
    # Logs
    access_log /var/log/nginx/radius-access.log;
    error_log /var/log/nginx/radius-error.log;

    # Body size
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3001;  # Aplikasi Next.js di port 3001
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

**Test & Restart Nginx**:

```bash
# Test config
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx

# Verify nginx listening on SSL
sudo ss -tlnp | grep :3000
```

### Step 5: Update Cloudflared Config

Edit tunnel config untuk gunakan HTTPS:

```bash
nano ~/.cloudflared/config.yml
```

**Update service ke HTTPS**:

```yaml
tunnel: <TUNNEL-ID>
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: radius.salfa.my.id
    service: https://localhost:3000  # Changed from http to https
    originRequest:
      noTLSVerify: false  # Changed to false karena sekarang pakai valid certificate
      originServerName: radius.salfa.my.id
      connectTimeout: 30s
  
  - service: http_status:404
```

**Restart Cloudflared**:

```bash
sudo systemctl restart cloudflared
sudo journalctl -u cloudflared -f
```

### Step 6: Set Cloudflare SSL Mode ke Full (Strict)

1. Cloudflare Dashboard → Domain
2. **SSL/TLS** → **Overview**
3. SSL/TLS encryption mode: Pilih **Full (strict)**
4. Save

### Step 7: Verifikasi End-to-End Encryption

```bash
# Check dari VPS
curl -v https://localhost:3000

# Check dari internet
curl -I https://radius.salfa.my.id
```

**Sekarang Anda punya**:
- ✅ SSL dari browser ke Cloudflare (auto)
- ✅ SSL dari Cloudflare ke VPS (Origin Certificate)
- ✅ End-to-end encryption penuh
- ✅ No SSL warnings

---

## ALTERNATIF: Setup SSL dengan Let's Encrypt (Tidak Direkomendasikan)

⚠️ **Tidak perlu jika pakai Cloudflare Tunnel**, tapi jika Anda tetap ingin:

### Install Certbot

```bash
# Install certbot
sudo apt update
sudo apt install -y certbot python3-certbot-nginx

# Generate certificate (DNS challenge mode)
sudo certbot certonly --manual --preferred-challenges dns -d radius.salfa.my.id
```

**Problem**: 
- Cloudflare Tunnel tidak expose port 80/443 secara langsung
- HTTP challenge tidak akan work
- Harus pakai DNS challenge (manual setiap 90 hari)

**Solusi lebih baik**: Pakai Cloudflare Origin Certificate (15 tahun validity)

---

## TROUBLESHOOTING SSL

### ❌ Error: ERR_SSL_VERSION_OR_CIPHER_MISMATCH

**Penyebab**: SSL mode di Cloudflare tidak match dengan origin

**Solusi**:
- Set SSL mode ke **Flexible** jika origin pakai HTTP
- Set SSL mode ke **Full** jika origin pakai HTTPS (self-signed)
- Set SSL mode ke **Full (strict)** jika pakai Origin Certificate

### ❌ Error: 525 SSL Handshake Failed

**Penyebab**: Cloudflare tidak bisa connect ke origin via SSL

**Solusi**:
```bash
# Check nginx SSL config
sudo nginx -t

# Check nginx listening
sudo ss -tlnp | grep nginx

# Check certificate files
ls -la /etc/ssl/cloudflare/

# Check cloudflared config
cat ~/.cloudflared/config.yml

# Restart services
sudo systemctl restart nginx
sudo systemctl restart cloudflared
```

### ❌ Error: 526 Invalid SSL Certificate

**Penyebab**: Origin certificate tidak valid atau expired

**Solusi**:
- Regenerate Origin Certificate di Cloudflare Dashboard
- Update certificate files di VPS
- Restart nginx

### ❌ Warning: NET::ERR_CERT_AUTHORITY_INVALID (di localhost)

**Ini normal** jika test langsung ke `https://localhost:3000` karena Origin Certificate hanya valid melalui Cloudflare.

Test via: `https://radius.salfa.my.id` (bukan localhost)

---

## MONITORING & MANAGEMENT

### Dashboard Cloudflare

1. **Traffic**: Zero Trust → **Analytics** → **Access**
2. **Tunnel health**: Zero Trust → **Networks** → **Tunnels**
3. **DNS records**: Cloudflare → Domain → **DNS**
4. **SSL/TLS**: Cloudflare → Domain → **SSL/TLS** → **Edge Certificates**

### Commands Reference

```bash
# List tunnels
cloudflared tunnel list

# Tunnel info
cloudflared tunnel info <NAME>

# Delete tunnel
cloudflared tunnel delete <NAME>

# Cleanup unused connections
cloudflared tunnel cleanup <NAME>

# Logs
sudo journalctl -u cloudflared -f
sudo journalctl -u cloudflared --since "1 hour ago"
sudo journalctl -u cloudflared --since today
```

---

## UPDATE CLOUDFLARED

```bash
# Download versi terbaru
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb

# Update
sudo dpkg -i cloudflared-linux-amd64.deb

# Restart service
sudo systemctl restart cloudflared

# Check version
cloudflared --version
```

---

## UNINSTALL TUNNEL

Jika ingin remove tunnel:

```bash
# Stop service
sudo systemctl stop cloudflared
sudo systemctl disable cloudflared

# Uninstall service
sudo cloudflared service uninstall

# Delete tunnel
cloudflared tunnel delete salfanet-radius

# Hapus DNS record manual dari Cloudflare Dashboard

# Uninstall cloudflared
sudo dpkg -r cloudflared

# Hapus config
rm -rf ~/.cloudflared/
```

---

## INTEGRASI DENGAN VPS INSTALL SCRIPT

Untuk menambahkan Cloudflare Tunnel ke installer otomatis, tambahkan di `vps-install-local.sh`:

```bash
# ===================================
# CLOUDFLARE TUNNEL SETUP (Optional)
# ===================================
setup_cloudflare_tunnel() {
    print_step "Cloudflare Tunnel Setup"
    
    # Install cloudflared
    print_info "Installing cloudflared..."
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    sudo dpkg -i cloudflared-linux-amd64.deb
    rm cloudflared-linux-amd64.deb
    
    print_success "Cloudflared installed"
    echo ""
    echo "Untuk setup tunnel, jalankan:"
    echo "  cloudflared tunnel login"
    echo ""
    echo "Panduan lengkap: docs/CLOUDFLARE_TUNNEL_SETUP.md"
}

# Panggil fungsi (tambahkan prompt yes/no)
read -p "Setup Cloudflare Tunnel? (y/n): " SETUP_TUNNEL
if [[ "$SETUP_TUNNEL" == "y" || "$SETUP_TUNNEL" == "Y" ]]; then
    setup_cloudflare_tunnel
fi
```

---

## KESIMPULAN

✅ **Tunnel berhasil jika**:
- Status tunnel: HEALTHY
- DNS record otomatis tercipta
- Subdomain dapat diakses dari internet
- Tidak perlu port forwarding router
- Tidak perlu IP public

✅ **Keuntungan Cloudflare Tunnel**:
- VPS dengan IP private bisa diakses public
- Gratis (tidak perlu bayar)
- SSL/TLS otomatis dari Cloudflare
- DDoS protection built-in
- Bisa tambahkan Zero Trust authentication
- Bisa ekspos multiple services dengan subdomain berbeda

✅ **Next Steps**:
1. Install cloudflared di VPS
2. Login & create tunnel
3. Configure routes
4. Setup systemd service
5. Tambahkan Zero Trust access policy (opsional)

**Support**: Jika ada error, check logs dengan `sudo journalctl -u cloudflared -f`
