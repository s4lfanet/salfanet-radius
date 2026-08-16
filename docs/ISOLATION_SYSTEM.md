# ISOLATION SYSTEM — Dokumentasi Lengkap

> Sistem isolasi otomatis untuk PPPoE users yang masa berlangganannya habis (expired), dengan redirect ke halaman pembayaran.

---

## Daftar Isi

1. [Gambaran Umum](#1-gambaran-umum)
2. [Alur Kerja Lengkap](#2-alur-kerja-lengkap)
3. [Komponen Sistem](#3-komponen-sistem)
4. [Cron Job — Auto Isolir](#4-cron-job--auto-isolir)
5. [Konfigurasi MikroTik](#5-konfigurasi-mikrotik)
6. [Konfigurasi FreeRADIUS](#6-konfigurasi-freeradius)
7. [Database & Status PPPoE User](#7-database--status-pppoe-user)
8. [Halaman Isolated (Customer-Facing)](#8-halaman-isolated-customer-facing)
9. [Pengaturan Isolasi di Admin Panel](#9-pengaturan-isolasi-di-admin-panel)
10. [Troubleshooting](#10-troubleshooting)
11. [Perbedaan Status: isolated vs blocked vs stop](#11-perbedaan-status-isolated-vs-blocked-vs-stop)

---

## 1. Gambaran Umum

Sistem isolasi bekerja dengan cara **membatasi akses internet** user yang sudah expired — bukan memblokir login sepenuhnya. User tetap bisa connect PPPoE, namun:

- Mendapat IP dari **pool isolir** (misal: `192.168.200.x`) bukan IP normal
- **Bandwidth dibatasi** (misal: `64k/64k`)
- **Semua HTTP/HTTPS** di-redirect ke halaman `/isolated` (halaman pembayaran)
- Hanya boleh akses **DNS**, **payment gateway**, dan **billing server**

Setelah user melakukan pembayaran dan invoice terverifikasi, status kembali ke `active` dan isolasi otomatis dicabut.

---

## 2. Alur Kerja Lengkap

```
┌─────────────────────────────────────────────────────────────────────┐
│                       ALUR ISOLASI OTOMATIS                         │
└─────────────────────────────────────────────────────────────────────┘

1. CRON JOB (setiap jam)
   └─► Cek pppoe_users WHERE status='active' AND expiredAt < CURDATE()
   
2. UNTUK SETIAP USER EXPIRED (dibungkus prisma.$transaction):
   ├─► Update status: active → isolated (di tabel pppoe_users)
   ├─► Radcheck: Cleartext-Password TETAP ADA (user boleh login!)
   ├─► Radcheck: HAPUS Auth-Type:Reject (kalau ada dari sebelumnya)
   ├─► Radusergroup: Pindah ke group 'isolir'
   ├─► Radreply: HAPUS Framed-IP-Address (IP statis dicopot)
   ├─► MikroTik: Add IP aktif ke address-list 'isolir' (blokir internet segera)
   ├─► MikroTik API: Disconnect session aktif (CoA + API kick)
   └─► Notifikasi: WhatsApp/Email ke user

3. USER RECONNECT PPPoE:
   ├─► FreeRADIUS: Auth sukses (password OK, tidak di-reject)
   ├─► FreeRADIUS: Assign PPP profile 'isolir' (dari radusergroup)
   ├─► MikroTik: Assign rate-limit dari profile 'isolir' (64k/64k)
   └─► MikroTik: Assign IP dari pool-isolir (192.168.200.x)

4. USER BUKA BROWSER:
   ├─► MikroTik NAT: Redirect HTTP(80) & HTTPS(443) ke billing server
   ├─► Next.js Middleware (proxy.ts): Deteksi IP dari isolation pool
   └─► Redirect ke /isolated?ip=192.168.200.x

5. HALAMAN /isolated:
   ├─► Tampilkan info akun (nama, expired date)
   ├─► Tampilkan invoice belum dibayar + link pembayaran
   └─► Tampilkan kontak support

6. SETELAH PEMBAYARAN (webhook handler):
   ├─► Invoice status: PENDING → PAID
   ├─► Status user: isolated → active (dibungkus prisma.$transaction)
   ├─► Radcheck: Hapus Auth-Type, restore Cleartext-Password
   ├─► Radusergroup: Pindah kembali ke group/profile normal (priority: 1)
   ├─► Radreply: Set Framed-IP-Address kembali (jika pakai IP statis)
   ├─► MikroTik: Restore PPP secret ke profile normal (await, bukan fire-and-forget)
   ├─► MikroTik: Kick active session agar reconnect dengan profile baru
   ├─► CoA Disconnect: Force re-authentication
   └─► Notifikasi: WhatsApp/Email/Push ke user
```

---

## 3. Komponen Sistem

| Komponen | File | Peran |
|---|---|---|
| **Cron Job** | `src/server/cron/auto-isolir.ts` | Logika isolasi PPPoE users (transaction + address-list) |
| **Cron API** | `src/app/api/cron/route.ts` | Endpoint handler cron job |
| **Settings API** | `src/app/api/settings/isolation/route.ts` | GET/PUT isolation settings |
| **Check API** | `src/app/api/pppoe/users/check-isolation/route.ts` | Cek status isolasi by username/IP |
| **Middleware** | `src/proxy.ts` | Deteksi IP isolasi & redirect |
| **Isolation Settings** | `src/lib/isolation-settings.ts` | Cache settings dari DB |
| **Isolated Page** | `src/app/isolated/page.tsx` | Halaman customer-facing |
| **Admin Settings** | `src/app/admin/settings/isolation/page.tsx` | Halaman konfigurasi admin |
| **MikroTik Scripts** | `src/app/admin/settings/isolation/mikrotik/page.tsx` | Generator script MikroTik |

---

## 4. Cron Job — Auto Isolir

### Schedule
```
0 * * * *   →   Setiap jam tepat (00 menit)
```

### Yang Dilakukan Cron (file: `src/server/cron/auto-isolir.ts`)

```typescript
// 1. Find expired users: status='active' AND expiredAt < now - graceDays
//    (PREPAID: expiredAt check, POSTPAID: overdue invoice check)
// 2. Per user (RADIUS updates dibungkus prisma.$transaction):
//    a. Update status → 'isolated' (atomic conditional update)
//    b. Hapus Auth-Type:Reject dari radcheck (allow login!)
//    c. Pastikan Cleartext-Password ada di radcheck
//    d. Pindah ke radusergroup 'isolir' (priority: 1)
//    e. Hapus Framed-IP-Address dari radreply
//    f. Add IP aktif ke MikroTik address-list 'isolir' (blokir segera)
//    g. MikroTik API: enable PPP secret + change profile ke 'isolir'
//    h. MikroTik API: kick active PPPoE session
//    i. CoA disconnect (force re-auth)
// 3. Auto-stop: isolated > 30 hari → stop (hapus dari semua RADIUS table)
//    CATATAN: 30 hari dihitung dari expiredAt, bukan tanggal isolasi
//    (known limitation — belum ada field isolatedAt)
```

### Cara Manual Trigger

```bash
# Via API (dari server)
curl -X POST http://localhost:3000/api/cron \
  -H "Content-Type: application/json" \
  -d '{"type": "pppoe_auto_isolir"}'
```

### Log Cron

```bash
# Cek log PM2
pm2 logs salfanet-cron --lines 50

# Contoh log sukses:
# [CRON] Running PPPoE Auto Isolir (attempt 1/3)...
# [PPPoE Auto-Isolir] Found 3 expired user(s) to isolate
# ✅ [PPPoE Auto-Isolir] User john123 isolated (expired: 2024-01-15)
# [CRON] PPPoE Auto Isolir completed: ✓ Isolated 3/3 users
```

---

## 5. Konfigurasi MikroTik

> **PENTING**: Script ini bisa di-generate otomatis dari Admin Panel → Settings → Isolation → MikroTik Setup

### Script 1: IP Pool

```routeros
/ip pool
add name=pool-isolir ranges=192.168.200.2-192.168.200.254 comment="IP Pool untuk user yang diisolir"
```

### Script 2: PPP Profile

```routeros
/ppp profile
add name=isolir \
    local-address=pool-isolir \
    remote-address=pool-isolir \
    rate-limit=64k/64k \
    comment="Profile untuk user yang diisolir"
```

> **Catatan**: Name profile HARUS `isolir` karena sistem menulis `isolir` ke `radusergroup`. FreeRADIUS membaca dari sini untuk menentukan PPP profile yang digunakan.

### Script 3: Firewall Filter (Allow DNS & Billing Server)

> **PENTING**: Firewall rules menggunakan `src-address-list=isolir` (dynamic, di-populate oleh RADIUS `Mikrotik-Address-List` attribute) sebagai primary, dengan `src-address=CIDR` sebagai fallback untuk sesi yang belum mendapat address-list.

```routeros
/ip firewall filter
# Primary: Allow DNS untuk user isolir (dynamic address-list)
add chain=forward \
    src-address-list=isolir \
    protocol=udp dst-port=53 \
    action=accept \
    comment="SALFANET-ISOLIR Allow DNS UDP"

add chain=forward \
    src-address-list=isolir \
    protocol=tcp dst-port=53 \
    action=accept \
    comment="SALFANET-ISOLIR Allow DNS TCP"

# Allow akses ke billing server
add chain=forward \
    src-address-list=isolir \
    dst-address=BILLING_SERVER_IP \
    dst-port=80,443 protocol=tcp \
    action=accept \
    comment="SALFANET-ISOLIR Allow billing"

# Block semua akses internet lainnya
add chain=forward \
    src-address-list=isolir \
    action=drop \
    comment="SALFANET-ISOLIR Block internet"

# Fallback: CIDR statis (untuk sesi yang belum dapat address-list)
add chain=forward \
    src-address=192.168.200.0/24 \
    protocol=udp dst-port=53 \
    action=accept \
    comment="SALFANET-ISOLIR Allow DNS UDP (CIDR fallback)"

add chain=forward \
    src-address=192.168.200.0/24 \
    dst-address=BILLING_SERVER_IP \
    dst-port=80,443 protocol=tcp \
    action=accept \
    comment="SALFANET-ISOLIR Allow billing (CIDR fallback)"

add chain=forward \
    src-address=192.168.200.0/24 \
    action=drop \
    comment="SALFANET-ISOLIR Block internet (CIDR fallback)"
```

### Script 4: Payment Gateway Address List

```routeros
/ip firewall address-list
add list=payment-gateways address=api.midtrans.com comment="Midtrans API"
add list=payment-gateways address=app.midtrans.com comment="Midtrans Snap"
add list=payment-gateways address=api.xendit.co comment="Xendit API"
add list=payment-gateways address=checkout.xendit.co comment="Xendit Checkout"
add list=payment-gateways address=passport.duitku.com comment="Duitku API"
```

### Script 5: Firewall NAT (Redirect HTTP/HTTPS)

```routeros
/ip firewall nat
# Redirect HTTP ke halaman isolasi
# ⚠️  GANTI 103.x.x.x DENGAN IP ADDRESS REAL SERVER ANDA!
add chain=dstnat \
    src-address=192.168.200.0/24 \
    protocol=tcp dst-port=80 \
    dst-address=!103.x.x.x \
    dst-address-list=!payment-gateways \
    action=dst-nat \
    to-addresses=103.x.x.x \
    to-ports=80 \
    comment="Redirect HTTP to isolation page"

add chain=dstnat \
    src-address=192.168.200.0/24 \
    protocol=tcp dst-port=443 \
    dst-address=!103.x.x.x \
    dst-address-list=!payment-gateways \
    action=dst-nat \
    to-addresses=103.x.x.x \
    to-ports=443 \
    comment="Redirect HTTPS to isolation page"
```

### Troubleshooting MikroTik

```routeros
# Cek IP yang dapat dari pool-isolir
/ip pool used print where pool=pool-isolir

# Cek PPPoE user aktif dan profilenya
/ppp active print

# Cek apakah user dapat IP isolir
/ppp active print where name=USERNAME

# Test redirect (dari PC user)
# Buka browser → buka website apa saja → harus redirect ke billing

# Cek log MikroTik
/log print where topics~"ppp" and message~"USERNAME"

# Cek firewall connection dari IP isolir
/ip firewall connection print where src-address~"192.168.200"
```

---

## 6. Konfigurasi FreeRADIUS

Sistem isolasi memanfaatkan tabel RADIUS standar. Berikut bagaimana FreeRADIUS membaca konfigurasi isolasi:

### Tabel yang Digunakan

| Tabel | Kolom | Nilai untuk User Isolated |
|---|---|---|
| `radcheck` | `attribute=Cleartext-Password` | Password user (tetap ada) |
| `radcheck` | `attribute=Auth-Type` | **TIDAK ADA** (dihapus saat isolasi) |
| `radusergroup` | `groupname` | `isolir` |
| `radgroupreply` | `groupname=isolir, attribute=Mikrotik-Rate-Limit` | `64k/64k` |
| `radgroupreply` | `groupname=isolir, attribute=Framed-Pool` | `pool-isolir` |
| `radreply` | `attribute=Framed-IP-Address` | **DIHAPUS** (pakai pool) |

### Setup radgroupreply untuk Group 'isolir'

Pastikan ada entry berikut di tabel `radgroupreply`:

```sql
INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES
('isolir', 'Framed-Pool', ':=', 'pool-isolir'),
('isolir', 'Mikrotik-Rate-Limit', ':=', '64k/64k'),
('isolir', 'Session-Timeout', ':=', '3600');
```

> **Catatan**: Nilai `64k/64k` dan `pool-isolir` harus sesuai dengan setting di Admin Panel dan PPP profile di MikroTik.

### Cara Kerja Authentication

```
User Connect PPPoE
        │
        ▼
Authorize hook (src/app/api/radius/authorize/route.ts)
        │
        ├─► status = blocked/stop? → REJECT (Auth-Type: Reject)
        │
        ├─► status = isolated? → ALLOW (204) — radusergroup applies isolir profile
        │
        ├─► expiredAt < now AND autoIsolationEnabled = true?
        │    → ALLOW (204) — cron akan isolir, radusergroup applies isolir profile
        │    (NOTE: tidak lagi REJECT! User boleh login agar isolir profile bisa diterapkan)
        │
        ├─► expiredAt < now AND autoIsolationEnabled = false?
        │    → ALLOW (204) — user tetap terhubung (No Action mode)
        │
        └─► Status OK & belum expired? → ALLOW (204)
                        │
                        ▼
              Baca radusergroup → group = 'isolir' (atau group normal)
                        │
                        ▼
              Baca radgroupreply → Framed-Pool=pool-isolir
                                   Rate-Limit=64k/64k
                                   Mikrotik-Address-List=isolir
```

---

## 7. Database & Status PPPoE User

### Model pppoeUser (Prisma)

```typescript
model pppoeUser {
  status    String  // 'active' | 'isolated' | 'blocked' | 'stop'
  expiredAt DateTime?  // Tanggal expired (PREPAID) / null (POSTPAID)
  autoIsolationEnabled Boolean @default(true)
}
```

### Status Penjelasan

| Status | Bisa Login RADIUS | Akses Internet | Keterangan |
|---|---|---|---|
| `active` | ✅ Ya | ✅ Penuh | User aktif normal |
| `isolated` | ✅ Ya | ⚠️ Terbatas | Expired, dibatasi ke halaman pembayaran |
| `blocked` | ❌ Tidak | ❌ Tidak | Diblokir admin (Auth-Type:Reject) |
| `stop` | ❌ Tidak | ❌ Tidak | Dihentikan (tagihan menunggak parah) |

### Tabel RADIUS yang Dimodifikasi Saat Isolasi

```sql
-- radcheck: Password tetap ada, tapi Auth-Type:Reject DIHAPUS
DELETE FROM radcheck WHERE username = ? AND attribute = 'Auth-Type';

-- radusergroup: Pindah ke group isolir
DELETE FROM radusergroup WHERE username = ?;
INSERT INTO radusergroup (username, groupname, priority) VALUES (?, 'isolir', 1);

-- radreply: IP statis dicopot (dapat dari pool)
DELETE FROM radreply WHERE username = ? AND attribute = 'Framed-IP-Address';
```

---

## 8. Halaman Isolated (Customer-Facing)

### URL

```
https://domain-anda.com/isolated?ip=192.168.200.50
```
atau
```
https://domain-anda.com/isolated?username=john123
```

### Cara Redirect Terjadi

1. **MikroTik NAT** meng-intercept HTTP/HTTPS dari IP isolation pool
2. Request diteruskan ke billing server (`103.x.x.x:80/443`)
3. **Next.js Middleware** (`src/proxy.ts`) mendeteksi source IP dari isolation pool
4. Middleware melakukan redirect ke `/isolated?ip=192.168.200.x`
5. Halaman `/isolated` menampilkan info user dan invoice

### Isi Halaman

- Nama perusahaan & logo
- Pesan isolasi (customizable di Admin Panel)
- Informasi akun (username, nama, tanggal expired)
- Daftar invoice belum dibayar + tombol **Bayar Sekarang**
- Kontak support (WhatsApp & Email)
- Langkah-langkah untuk mengaktifkan kembali layanan

### API yang Digunakan Halaman /isolated

```
GET /api/pppoe/users/check-isolation?ip=192.168.200.50
```
atau
```
GET /api/pppoe/users/check-isolation?username=john123
```

> **Catatan**: Endpoint ini **publik** (tidak perlu login admin) karena diakses oleh customer yang sedang diisolasi.

---

## 9. Pengaturan Isolasi di Admin Panel

### Lokasi

```
Admin Panel → Settings → Isolation (Settings & MikroTik Setup)
```

### Parameter Konfigurasi

| Setting | Default | Keterangan |
|---|---|---|
| `isolationEnabled` | `true` | Aktifkan/matikan auto-isolasi |
| `isolationIpPool` | `192.168.200.0/24` | CIDR pool IP untuk user isolated |
| `isolationRateLimit` | `64k/64k` | Bandwidth limit format MikroTik |
| `isolationRedirectUrl` | `{baseUrl}/isolated` | URL redirect halaman isolasi |
| `isolationMessage` | (teks default) | Pesan yang ditampilkan ke user |
| `isolationAllowDns` | `true` | User isolated boleh query DNS |
| `isolationAllowPayment` | `true` | User isolated boleh akses payment |
| `isolationNotifyWhatsapp` | `true` | Kirim notif WhatsApp saat isolasi |
| `isolationNotifyEmail` | `false` | Kirim notif email saat isolasi |
| `gracePeriodDays` | `0` | Hari toleransi setelah expired |

### Cara Konfigurasi

1. Buka Admin Panel → **Settings → Isolation**
2. Atur **IP Pool** sesuai network MikroTik (harus sama dengan `pool-isolir`)
3. Atur **Rate Limit** sesuai kebutuhan
4. Pastikan **Redirect URL** terisi (default: `{baseUrl}/isolated`)
5. Klik **Save Settings**
6. Buka tab **MikroTik Setup** untuk download/copy script

---

## 10. Troubleshooting

### User Expired Tidak Diisolir

```bash
# 1. Cek apakah cron berjalan
pm2 logs salfanet-cron --lines 100 | grep "Auto Isolir"

# 2. Trigger manual via API
curl -X POST http://localhost:3000/api/cron \
  -H "Content-Type: application/json" \
  -d '{"type": "pppoe_auto_isolir"}'

# 3. Cek database
SELECT username, status, expiredAt 
FROM pppoe_users 
WHERE status = 'active' AND expiredAt < CURDATE();
```

### User Isolated Masih Bisa Akses Internet

```bash
# 1. Cek apakah user dapat IP dari pool-isolir
# Di MikroTik:
/ppp active print where name=USERNAME

# 2. Cek radusergroup
SELECT * FROM radusergroup WHERE username = 'USERNAME';
-- Harus: groupname = 'isolir'

# 3. Cek firewall filter MikroTik (order harus benar)
/ip firewall filter print

# 4. Pastikan user reconnect setelah diisolir
# User harus disconnect dan reconnect PPPoE
```

### Halaman /isolated Tidak Muncul (Tetap ke Website Biasa)

```
Kemungkinan penyebab:
1. MikroTik NAT rule belum ada atau salah konfigurasi
2. IP user tidak dalam range pool-isolir
3. Next.js middleware tidak berjalan

Cek:
- /ip firewall nat print (pastikan rule redirect ada)
- /ip pool used print where pool=pool-isolir
- pm2 logs salfanet-radius --lines 20 | grep PROXY
```

### Info User Tidak Muncul di Halaman /isolated

```
Kemungkinan penyebab:
1. User belum reconnect → IP lama, bukan dari pool-isolir
2. radacct belum update dengan IP baru
3. check-isolation API error

Cek:
- Pastikan user disconnect dan reconnect PPPoE
- Cek /api/pppoe/users/check-isolation?ip=IP_USER
```

### User Isolated Tidak Bisa Bayar (Payment Page Error)

```
Kemungkinan penyebab:
1. IP billing server belum ditambah ke firewall filter
2. Domain billing server tidak bisa di-resolve (DNS blocked?)
3. Payment gateway belum ada di address-list

Cek MikroTik:
/ip firewall filter print where comment~"billing"
/ip firewall address-list print where list=payment-gateways
```

### Setelah Bayar, User Masih Terisolasi

```
Sistem harus (semua dalam prisma.$transaction):
1. Invoice → PAID
2. Status user → active
3. Radcheck → Hapus Auth-Type, restore Cleartext-Password
4. Radusergroup → dikembalikan ke group normal (priority: 1)
5. Radreply → Framed-IP-Address dikembalikan
6. MikroTik: PPP secret di-restore ke profile normal (await)
7. MikroTik: Active session di-kick (await)
8. CoA Disconnect: Force re-authentication

User HARUS disconnect dan reconnect PPPoE setelah pembayaran!
(CoA + MikroTik kick seharusnya otomatis melakukan ini)

Cek:
SELECT status FROM pppoe_users WHERE username = 'USERNAME';
SELECT * FROM radusergroup WHERE username = 'USERNAME';
SELECT * FROM radreply WHERE username = 'USERNAME';
SELECT * FROM radcheck WHERE username = 'USERNAME';
```

---

## 11. Perbedaan Status: isolated vs blocked vs stop

```
┌──────────┬──────────────┬──────────────┬────────────────────────────────┐
│  Status  │ Login RADIUS │  Internet    │           Penjelasan           │
├──────────┼──────────────┼──────────────┼────────────────────────────────┤
│ active   │ ✅ Boleh     │ ✅ Penuh     │ Berlangganan aktif             │
├──────────┼──────────────┼──────────────┼────────────────────────────────┤
│ isolated │ ✅ Boleh     │ ⚠️ Terbatas  │ Expired, redirect ke /isolated │
│          │              │              │ Group RADIUS: isolir            │
│          │              │              │ IP dari pool-isolir             │
│          │              │              │ Bandwidth: 64k/64k             │
├──────────┼──────────────┼──────────────┼────────────────────────────────┤
│ blocked  │ ❌ Tolak     │ ❌ Tidak ada │ Diblokir manual oleh admin     │
│          │              │              │ radcheck: Auth-Type=Reject      │
├──────────┼──────────────┼──────────────┼────────────────────────────────┤
│ stop     │ ❌ Tolak     │ ❌ Tidak ada │ Dihentikan (tagihan lama)      │
│          │              │              │ radcheck: Auth-Type=Reject      │
└──────────┴──────────────┴──────────────┴────────────────────────────────┘
```

### Kenapa isolated TIDAK menggunakan Auth-Type:Reject?

Berbeda dengan `blocked`/`stop`, user `isolated` **masih boleh login** PPPoE karena:
1. Mereka perlu connect untuk bisa melihat halaman pembayaran
2. Tanpa connect, mereka tidak tahu harus bayar ke mana
3. Sistem membatasi akses mereka via MikroTik (IP pool + firewall), bukan via RADIUS reject

---

## Ringkasan Alur Singkat

```
expiredAt < hari ini
        │
        ▼  (Cron setiap jam)
status = isolated
        │
        ▼
radusergroup = 'isolir'
        │
        ▼  (User reconnect)
Dapat IP 192.168.200.x
        │
        ▼  (User buka browser)
MikroTik NAT redirect → /isolated
        │
        ▼
User bayar invoice
        │
        ▼  (Webhook / manual confirm)
status = active + radusergroup normal
        │
        ▼  (User reconnect)
Internet penuh kembali ✅
```
