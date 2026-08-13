# Catatan Deploy — pmyhome

## ⚠️ WAJIB — Cek Sebelum Deploy (di VPS)

### 1. Verifikasi PORT di backend/.env
Nginx meneruskan ke port 5002. Backend harus listen di port yang sama.
```bash
grep PORT /www/wwwroot/home.pmynet.id/backend/.env
# Harus ada: PORT=5002
```
Jika belum ada, tambahkan:
```bash
echo "PORT=5002" >> /www/wwwroot/home.pmynet.id/backend/.env
```

### 2. Jalankan Migrasi Database nas_id (WAJIB — sekali saja)
Kolom `nas_id` dibutuhkan di tabel `radcheck`, `radusergroup`, `radreply` untuk full local auth.
Tanpa ini: registrasi pelanggan, isolir, reaktivasi, dan autentikasi FreeRADIUS GAGAL.

```bash
mysql -h 127.0.0.1 -u pmyhome -p pmyhome < /www/wwwroot/home.pmynet.id/scripts/migrate-radcheck-nas-id.sql
```

### 3. Jalankan Fix tenant_id di installation_logs (jika ada data historis)
```bash
mysql -h 127.0.0.1 -u pmyhome -p pmyhome < /www/wwwroot/home.pmynet.id/scripts/fix-installation-logs-tenant.sql
```

---

## Langkah Deploy

```bash
# Di lokal
git add -A
git commit -m "..."
git push

# Di VPS
cd /www/wwwroot/home.pmynet.id
git pull
docker compose build backend
docker compose up -d backend
```

---

## ⚠️ WAJIB — Jalankan Setelah Deploy (sekali saja)

### Migrasi PPP Secret — Sinkronisasi MikroTik dengan DB

Jalankan dari browser console saat login sebagai **superadmin**:

```js
fetch('/api/sa/migrate-local-auth-all', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
}).then(r => r.json()).then(console.log)
```

**Yang dilakukan:** Mensinkronkan state PPP secret di semua MikroTik sesuai status DB.
- `is_suspended = true` → secret di-disable di MikroTik
- `is_suspended = false` → secret di-enable di MikroTik
- Pelanggan baru (belum ada secret) → secret dibuat otomatis

**Alternatif per mitra** — login sebagai admin mitra, jalankan:
```js
fetch('/api/admin/migrate-local-auth', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
}).then(r => r.json()).then(console.log)
```

---

## Catatan Teknis

- `nas_id` di radcheck/radusergroup/radreply = ID router MikroTik dari tabel `mikrotik_config`
- FreeRADIUS queries sudah dikustomisasi untuk JOIN ke `mikrotik_config` berdasarkan `nas_id`
- Request logging middleware dinonaktifkan di production (`NODE_ENV=production`)
- Polling `/ppp/active` berjalan tiap 2 menit untuk deteksi status online pelanggan
- Auto-isolir CRON berjalan tiap 15 menit (cek `auto_isolate_enabled` di `billing_settings`)
