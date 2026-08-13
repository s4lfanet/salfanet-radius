# Catatan Konfigurasi VPS

## Database MySQL

| Komponen | Nama DB | User | Password |
|---|---|---|---|
| Aplikasi (backend + FreeRADIUS) | `pmyhome` | `pmyhome` | `LNDjxje2YjKGJh7A` |

> ⚠️ Jangan gunakan database `radius` — itu milik sistem internal kantor, terpisah dari project ini.

### File yang referensikan nama database:
- `backend/.env` → `DB_NAME=pmyhome`
- `core/raddb/mods-available/sql` → `radius_db = "pmyhome"`

## Path Project di VPS

```
/www/wwwroot/home.pmynet.id/
```

## FreeRADIUS Docker

- Container: `pmyhome-freeradius`
- Port: `11812` (bukan 1812 — port 1812 adalah FreeRADIUS sistem internal kantor)
- Test auth: `radclient -x 127.0.0.1:11812 auth testing123`
- Secret localhost: `testing123`

## Setelah ubah config FreeRADIUS

```bash
cd /www/wwwroot/home.pmynet.id
docker compose build freeradius
docker compose up -d freeradius
```

## Implementasi Static IP + Simple Queue (TODO - belum diimplementasi)

### Konsep
- Pelanggan tanpa PPPoE, punya IP tetap, dikontrol via MikroTik Simple Queue
- Suspend = ubah max-limit queue ke 1K/1K (tidak disconnect)
- Reaktivasi = restore max-limit ke bandwidth paket

### Perubahan yang diperlukan
1. Tambah kolom `auth_type` ENUM('pppoe','static_ip') DEFAULT 'pppoe' di `customer_details`
2. Registrasi pelanggan static_ip → buat Simple Queue di MikroTik via API
3. Auto-suspend cron → jika static_ip: ubah queue limit (bukan tambah Auth-Type:Reject)
4. Payment/reactivate → jika static_ip: restore queue limit (bukan hapus Auth-Type:Reject + kick)
5. Online tracking → cek ARP table MikroTik (`/ip/arp`) per IP static
6. Hapus pelanggan → hapus queue dari MikroTik
7. Queue: name=username pelanggan, target=static_ip

### Open question
- Jika MikroTik offline saat auto-suspend berjalan → perlu retry mechanism?

## PPPoE Secret di MikroTik sebagai Fallback RADIUS (TODO - belum diimplementasi)

### Latar belakang
Saat RADIUS server down, pelanggan baru/reconnect tidak bisa dial. Solusi: simpan juga secret di MikroTik lokal sebagai fallback.

### Mekanisme
- RADIUS aktif → MikroTik pakai RADIUS (primary)
- RADIUS down → MikroTik fallback ke /ppp/secret lokal

### Yang perlu diimplementasi di backend
1. Registrasi pelanggan → buat /ppp/secret di MikroTik (name, password, profile, service=pppoe)
2. Suspend → disable secret di MikroTik + Auth-Type:Reject di RADIUS
3. Reaktivasi/bayar → enable secret di MikroTik + hapus Auth-Type:Reject
4. Ganti password → update secret di MikroTik
5. Hapus pelanggan → hapus secret dari MikroTik

### Tabel status
| Kondisi | RADIUS | MikroTik local |
|---|---|---|
| Aktif | accept | enabled |
| Suspend | reject | disabled |
| RADIUS down + aktif | — | enabled → bisa dial ✓ |
| RADIUS down + suspend | — | disabled → tidak bisa ✓ |

### Open question
- nas_id di customer_details harus selalu terisi saat registrasi

## Fitur Bayar Sebagian / Hutang (TODO - belum diimplementasi)

### Konsep
Pelanggan bayar sebagian dari tagihan (misal 100rb dari 130rb), sisa 30rb carry-over ke tagihan bulan depan.

### Perubahan yang diperlukan
1. Tambah kolom `amount_paid` ke `billing_invoices` (DEFAULT NULL = lunas penuh / backward compat)
2. "Tandai Lunas" tetap berfungsi sebagai lunas penuh; tambah opsi "Bayar Sebagian"
3. Generate invoice bulan depan: cek hutang bulan lalu (`amount - amount_paid`), tambahkan ke `amount` baru
4. Laporan keuangan: hitung dari `amount_paid` bukan `amount` untuk invoice yang partial
5. Flow kolektor & bukti transfer: tambah pilihan nominal saat approve
