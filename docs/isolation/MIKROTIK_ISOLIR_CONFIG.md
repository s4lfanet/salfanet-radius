# Konfigurasi MikroTik NAS untuk Fitur Isolir

## Gambaran Alur Isolir

```
PPPoE Client (192.168.200.x)
    ↓ PPPoE
NAS MikroTik (10.20.30.12)  ──L2TP──►  MikroTik CHR Hub (10.20.30.1)  ──L2TP──►  VPS (10.20.30.10)
    ↑                                                                                    |
    └── HTTP/80 dari client → DNAT ke VPS → nginx → Next.js middleware → /isolated ◄───┘
```

Saat user ber-status `isolated`:
1. RADIUS mengembalikan `Framed-Pool = pool-isolir` → user mendapat IP `192.168.200.x`
2. MikroTik DNAT mengarahkan HTTP (port 80) dari `192.168.200.0/24` ke VPS billing
3. VPS nginx meneruskan ke Next.js middleware
4. Middleware mendeteksi IP isolation pool → redirect ke halaman `/isolated`

---

## A. Konfigurasi MikroTik NAS (10.20.30.12)

### 1. IP Pool untuk Pelanggan Isolir

```routeros
/ip pool
add name=pool-isolir ranges=192.168.200.2-192.168.200.254 comment="PPPoE isolated users"
```

### 2. PPP Profile untuk Isolir

```routeros
/ppp profile
add name=isolir \
    local-address=192.168.200.1 \
    remote-address=pool-isolir \
    rate-limit=64k/64k \
    session-timeout=86400 \
    comment="Isolated user profile - billing only"
```

> **Catatan:** `local-address=192.168.200.1` adalah gateway interface di NAS untuk subnet isolir.

### 3. Firewall DNAT – Redirect HTTP ke VPS Billing

**PENTING:** Gunakan `to-addresses=10.20.30.10` (VPS via VPN), BUKAN IP publik, agar traffic tidak keluar ke internet.

```routeros
/ip firewall nat
add chain=dstnat \
    src-address=192.168.200.0/24 \
    protocol=tcp \
    dst-port=80 \
    action=dst-nat \
    to-addresses=10.20.30.10 \
    to-ports=80 \
    comment="Isolir: redirect HTTP ke billing VPS"
```

> **JANGAN** tambahkan `srcnat`/`masquerade` untuk traffic ini.  
> VPS harus melihat IP asli client (192.168.200.x) agar middleware bisa redirect ke `/isolated`.

### 4. Firewall Filter – Batasi Akses Pelanggan Isolir

Tambahkan rule berikut **sebelum** rule `forward drop` yang sudah ada:

```routeros
/ip firewall filter
# Izinkan DNS dari pelanggan isolir
add chain=forward src-address=192.168.200.0/24 protocol=udp dst-port=53 \
    action=accept comment="Isolir: allow DNS"
add chain=forward src-address=192.168.200.0/24 protocol=tcp dst-port=53 \
    action=accept comment="Isolir: allow DNS-TCP"

# Izinkan akses ke VPS billing
add chain=forward src-address=192.168.200.0/24 dst-address=10.20.30.10 \
    action=accept comment="Isolir: allow billing VPS (via VPN)"

# Blokir semua traffic lain dari pelanggan isolir
add chain=forward src-address=192.168.200.0/24 \
    action=drop comment="Isolir: block all other traffic"
```

### 5. Route ke VPS untuk Reply Traffic (jika diperlukan)

Traffic dari `192.168.200.x` yang di-DNAT ke `10.20.30.10` harus bisa kembali ke client.  
NAS biasanya sudah tahu rute ke 192.168.200.0/24 karena itu subnet PPPoE-nya sendiri.

Pastikan ada rute ke VPS (10.20.30.10) via CHR (10.20.30.1):

```routeros
/ip route
# Rute ini seharusnya sudah ada via L2TP ke CHR
# Verifikasi dengan: /ip route print where dst-address=10.20.30.10
```

---

## B. Konfigurasi MikroTik CHR Hub (10.20.30.1)

CHR perlu tahu bahwa `192.168.200.0/24` bisa dicapai via NAS (10.20.30.12):

```routeros
/ip route
add dst-address=192.168.200.0/24 gateway=10.20.30.12 \
    comment="Route ke isolation pool via NAS"
```

---

## C. VPS – Sudah Dikonfigurasi Otomatis

**Route** `192.168.200.0/24 via 10.20.30.1` sudah ditambahkan ke:
- `/etc/ppp/ip-up.d/99-vpn-routes` (otomatis saat ppp0 up)
- Live route sudah aktif (tidak perlu reboot)

**Iptables** port 80 dari `192.168.200.0/24` sudah dibuka.

**Nginx** sudah dikonfigurasi sebagai `default_server` untuk semua request ke port 80.

**Next.js middleware** (`src/proxy.ts`) sudah mendeteksi IP isolasi dan redirect ke `/isolated`.

---

## D. Verifikasi End-to-End

### Test dari VPS (simulasi redirect)

```bash
# Harus mengembalikan: HTTP/1.1 307 Temporary Redirect → location: /isolated?ip=192.168.200.1
curl -s -H 'X-Forwarded-For: 192.168.200.1' -I http://localhost:3000/
```

### Test routing ke isolation pool

```bash
# Dari VPS, harus bisa ping NAS (10.20.30.12)
ping -c2 10.20.30.1

# Cek route aktif
ip route show | grep 192.168.200
```

### Verifikasi DNAT di MikroTik NAS

```routeros
/ip firewall nat print where comment~"Isolir"
/ip firewall filter print where comment~"Isolir"
```

---

## E. Catatan Penting tentang HTTPS

Redirect hanya bekerja untuk **HTTP (port 80)**. Browser modern mencoba HTTPS terlebih dahulu, tetapi:

1. **Captive Portal Detection** – Android, iOS, Windows secara otomatis melakukan HTTP check ke:
   - `http://connectivitycheck.gstatic.com/generate_204` (Android)
   - `http://www.apple.com/library/test/success.html` (iOS)
   - `http://www.msftconnecttest.com/connecttest.txt` (Windows)
   
   Semua request ini menggunakan HTTP dan akan di-redirect ke halaman `/isolated`.

2. **Notifikasi Login** – OS akan menampilkan notifikasi "Sign in to network" yang membuka halaman `/isolated` dalam browser.

3. **Tidak perlu redirect HTTPS** – Jangan arahkan port 443 ke VPS karena akan menyebabkan certificate mismatch error.

---

## F. Troubleshooting

| Gejala | Kemungkinan Penyebab | Solusi |
|--------|---------------------|--------|
| User isolir tidak diredirect | DNAT di NAS belum ada | Tambahkan rule DNAT (langkah A.3) |
| Redirect loop atau error | VPS tidak punya route balik | Cek `ip route show` di VPS |
| User isolir bisa akses internet | Filter rule tidak aktif | Tambahkan rule drop (langkah A.4) |
| IP pool tidak diberikan | pool-isolir tidak ada di NAS | Buat pool (langkah A.1) |
| X-Forwarded-For salah IP | NAS melakukan SRCNAT/masquerade | Hapus srcnat untuk 192.168.200.0/24 |
