# CLAUDE.md — Konteks Proyek pmyhome

> **Instruksi untuk Claude:** Baca file ini di awal setiap sesi. Setiap kali ada perubahan signifikan (fitur baru, bug fix, perubahan arsitektur, keputusan teknis), **perbarui file ini** sebelum mengakhiri sesi. Jangan tunggu diminta.

---

## Gambaran Proyek

**pmyhome** adalah sistem manajemen ISP (Internet Service Provider) berbasis web untuk PMYNET. Digunakan oleh admin mitra, kolektor, NOC, teknisi, dan pelanggan (via portal).

**Path VPS:** `/www/wwwroot/home.pmynet.id/`
**Domain:** `home.pmynet.id`
**Stack:** Node.js (Express) + React (Vite) + MySQL + FreeRADIUS (Docker)

---

## ⚠️ CONSTRAINT KRITIS — JANGAN DILANGGAR

1. **Database `radius`** = database internal kantor. **JANGAN DISENTUH.**
2. **FreeRADIUS sistem di port 1812** = RADIUS internal kantor. **JANGAN DISENTUH.**
3. Proyek ini pakai:
   - Database: `pmyhome`
   - FreeRADIUS Docker: port **11812**
   - Backend port: **5002**
   - Nginx forward ke: **127.0.0.1:5002**

---

## Struktur Proyek

```
pmyhome/
├── backend/
│   └── index.js          # Semua API endpoint (satu file besar)
├── frontend/
│   └── src/
│       ├── App.jsx        # Main app, routing, semua modal, panduan
│       ├── Portal.jsx     # Portal pelanggan (self-service)
│       ├── index.css      # Global styles
│       ├── hooks/
│       │   ├── useUsers.js
│       │   ├── useBilling.js
│       │   └── useUI.js
│       ├── pages/
│       │   ├── admin/
│       │   │   ├── PelangganPage.jsx
│       │   │   ├── PaketPage.jsx
│       │   │   ├── FinancesPage.jsx
│       │   │   └── SettingsBillingPage.jsx
│       │   └── collector/
│       │       └── CollectorSettlementsPage.jsx
│       └── utils/
│           ├── format.js   # monthLabel, formatRupiah, dll
│           └── export.js   # Export Excel/PDF
├── core/raddb/             # Konfigurasi FreeRADIUS
├── scripts/
│   ├── migrate-radcheck-nas-id.sql
│   └── fix-installation-logs-tenant.sql
├── DEPLOY_NOTES.md         # Langkah deploy lengkap
└── CLAUDE.md               # File ini
```

---

## Arsitektur Autentikasi — Full Local Auth

Sistem menggunakan **full local auth** via PPP Secret MikroTik (bukan RADIUS untuk pelanggan baru):

| Aksi | Mekanisme |
|---|---|
| Daftar pelanggan (PSB) | Backend → RouterOS API → buat PPP Secret (enabled) |
| Isolir | Backend → RouterOS API → disable PPP Secret + kick session |
| Reaktivasi (bayar) | Backend → RouterOS API → enable PPP Secret + kick session |
| Deteksi online | Backend polling `/ppp/active` tiap 2 menit → tabel `ppp_active_cache` |
| Auto-isolir | CRON tiap 15 menit, cek `auto_isolate_enabled` & `isolate_hour` di `billing_settings` |

**Tidak perlu script apapun di MikroTik.** Semua dikendalikan via RouterOS API (port 8728).

### Fungsi Kunci di backend/index.js
- `managePppSecret(nas_id, action, opts)` — create/enable/disable/delete PPP secret
- `kickMikrotikUser(username)` — disconnect sesi aktif
- `reactivateLocalAuth(username)` — enable PPP secret saat pelanggan bayar
- `pollPppActiveAll()` — polling background tiap 2 menit

### Reaktivasi Terpanggil dari 4 Tempat
1. `POST /api/invoices/:id/pay` (single payment)
2. `POST /api/invoices/bulk-pay` (bulk payment)
3. Webhook payment gateway
4. `POST /api/admin/proofs/:id/approve` (approve bukti transfer)

---

## Database Penting

### Tabel Tambahan (dibuat manual / via migration)
- `ppp_active_cache` — hasil polling `/ppp/active` MikroTik
- `notifications` — notifikasi in-app
- `installation_logs` — log PSB
- `billing_invoices.addon_amount` — kolom addon (INT DEFAULT 0)
- `billing_invoices.tenant_id` — multi-tenant
- `billing_settings.tenant_id` — multi-tenant
- `radcheck.nas_id`, `radusergroup.nas_id`, `radreply.nas_id` — isolasi per-NAS multi-tenant

### Query Isolir Otomatis (billing auto-suspend)
Pakai `LEAST()` untuk handle bulan pendek (Feb, dll):
```sql
LEAST(COALESCE(d.due_date_day, ?), DAYOFMONTH(LAST_DAY(CURDATE()))) <= ?
```

---

## Endpoint API Penting

| Endpoint | Keterangan |
|---|---|
| `POST /api/users/:username/suspend` | Isolir manual (disable PPP secret + kick) |
| `POST /api/invoices/:id/pay` | Bayar invoice → reaktivasi jika was_suspended |
| `POST /api/admin/migrate-local-auth` | Migrasi PPP secret per mitra (admin mitra) |
| `POST /api/sa/migrate-local-auth-all` | Migrasi PPP secret semua mitra (superadmin) |
| `POST /api/users/:username/sync-secret` | Sync PPP secret satu user ke MikroTik |

---

## Role Pengguna

| Role | Akses |
|---|---|
| `admin` | Full akses semua fitur |
| `noc` | Lihat pelanggan, buat task cabut ONT |
| `collector` | Tagihan wilayah, catat pembayaran |
| `technician` | PSB, task pemasangan |
| `customer` | Portal self-service |
| Super Admin | Kelola semua mitra (lintas tenant) |

---

## Perubahan yang Sudah Dilakukan (Sesi Ini)

### Backend (backend/index.js)
- [x] Due date max `28` → `31` dengan logic `LEAST()` bulan-aware
- [x] Auto-isolir CRON: tambah `managePppSecret disable` + `kickMikrotikUser`
- [x] Tambah fungsi `reactivateLocalAuth(username)` — enable PPP secret setelah bayar
- [x] Panggil `reactivateLocalAuth` dari 4 endpoint pembayaran
- [x] Fix `SELECT DISTINCT ... ORDER BY` error (hapus ORDER BY dari DISTINCT query)
- [x] Tambah endpoint `POST /api/sa/migrate-local-auth-all` (superadmin, semua tenant)
- [x] Request logging middleware dinonaktifkan di production (`NODE_ENV !== 'production'`)
- [x] `handlePayInvoice` sekarang terima `amount` dan `period` untuk ditampilkan di modal
- [x] **Hybrid auth_mode**: Migration `auth_mode ENUM('local','radius') NULL` di `mikrotik_config`
- [x] `reactivateLocalAuth`: JOIN mikrotik_config, skip managePppSecret jika `auth_mode='radius'`
- [x] Auto-isolir CRON: JOIN mikrotik_config, skip managePppSecret disable jika `auth_mode='radius'`
- [x] Suspend endpoint: SELECT + `m.auth_mode`, skip managePppSecret disable jika radius
- [x] Activate endpoint: SELECT + `m.auth_mode`, skip managePppSecret enable jika radius
- [x] POST `/api/mikrotik/config`: terima + simpan `authMode`
- [x] PUT `/api/mikrotik/config/:id`: terima + simpan `authMode`
- [x] PSB endpoint: cek `auth_mode` router + `create_ppp_secret` dari body sebelum buat PPP Secret
- [x] GET `/api/mikrotik/config` + `/api/mikrotik/routers`: expose `auth_mode` ke frontend

### Frontend

**App.jsx**
- [x] Import `monthLabel` dari `./utils/format`
- [x] Import `useState` sudah ada; tambah `const [sidebarHovered, setSidebarHovered]`
- [x] Sidebar `<aside>`: tambah `onMouseEnter`/`onMouseLeave` untuk hover-expand
- [x] Tambah class `sidebar-hover-expanded` saat collapsed + hovered
- [x] Modal konfirmasi pembayaran: tampilkan periode dan total tagihan
- [x] Modal detail pelanggan: badge STATUS di samping nama
- [x] Semua tampilan periode: `inv.period` → `monthLabel(inv.period)`
- [x] Panduan pengguna: diperbarui total (tanpa RADIUS script, terminologi baru)

**PelangganPage.jsx**
- [x] Kolom STATUS dipindah ke posisi 2 (setelah ID)
- [x] Klik baris mana saja → buka modal detail (semua role, termasuk admin)
- [x] Tombol Edit & Detail admin: tambah `e.stopPropagation()`
- [x] Badge teks `SUSPEND` → `ISOLIR`

**PaketPage.jsx**
- [x] Hapus kolom IP Pool dari tabel
- [x] Update deskripsi halaman

**useUI.js**
- [x] Default `sidebarCollapsed`: mobile (< 1024px) = `false` (expanded), tablet (1024–1439px) = `true`, desktop ≥ 1440px = `false`

**useBilling.js**
- [x] Import `monthLabel`
- [x] `handlePayInvoice` terima `amount` dan `period`
- [x] Dialog hapus invoice: period diformat
- [x] Export Excel/PDF: period diformat

**Portal.jsx**
- [x] Import `monthLabel`
- [x] Semua tampilan periode diformat

**FinancesPage.jsx, CollectorSettlementsPage.jsx, export.js**
- [x] Import `monthLabel`, semua periode diformat

**index.css**
- [x] Tambah `.sidebar-hover-expanded` CSS block
- [x] Fix selector pakai `:not(.nav-label-short)` agar teks sidebar tidak dobel

**useMikrotik.js**
- [x] Tambah `authMode: ''` ke initial state `newMtConfig` + reset setelah submit
- [x] `prepareEditMt`: populate `authMode: cfg.auth_mode || ''` saat edit router

**App.jsx (NAS Modal)**
- [x] Tambah select `Mode Autentikasi` (required untuk router baru, opsional untuk edit)
- [x] Opsi: `local` (PPP Secret) dan `radius` (FreeRADIUS)
- [x] Hint text berbeda per mode yang dipilih

**PSBPage.jsx (Review Step)**
- [x] Checkbox "Buat PPP Secret di MikroTik" muncul HANYA jika router `auth_mode='radius'`
- [x] Default unchecked; jika dicentang → `create_ppp_secret=true` dikirim ke backend

### Fitur Override Profil per Router (PaketPage)
- [x] Tabel baru `bandwidth_profile_router_map` (profile_id, nas_id, mikrotik_profile, tenant_id)
- [x] `getMikrotikProfile(groupname, nasId)` — cek override per router dulu, fallback ke default, lalu nama paket
- [x] Semua 5 call site `getMikrotikProfile` diupdate dengan nas_id
- [x] Endpoint GET `/api/mikrotik/:nasId/ppp-profiles` — fetch profil PPP langsung dari router
- [x] Endpoint GET `/api/profiles/:id/router-map` — ambil override existing saat edit profil
- [x] POST/PUT `/api/profiles` — simpan `routerOverrides` ke `bandwidth_profile_router_map`
- [x] DELETE `/api/profiles/:id` — hapus juga dari `bandwidth_profile_router_map`
- [x] Modal paket: field "Profil Default MikroTik" + section "Override Profil per Router" dengan tombol "↓ Ambil" per router
- [x] **Hapus section "Sync ke Router"** — router yang punya override = otomatis di-sync; tanpa override = tidak disync
- [x] `handleCreateProfile` tidak lagi terima `selectedRouterIds`; `routerIds` diderive otomatis dari overrides

### Bug Fix
- [x] **Duplicate username lintas mitra**: Migration `customer_details` PRIMARY KEY dari `username` → auto-increment `id` + `UNIQUE KEY uq_username_tenant (username, tenant_id)`. Sekarang mitra A dan mitra B boleh punya pelanggan dengan username yang sama.
- [x] `reactivateLocalAuth(username)` → `reactivateLocalAuth(username, tenantId = null)`: query scoped per tenant agar tidak ambil data mitra lain saat username sama ada di beberapa mitra.
- [x] Semua 4 call sites `reactivateLocalAuth` diupdate untuk pass `tenantId`.

---

## Bug Fix Sesi Agustus 2026 (Setelah Deploy)

### Backend (backend/index.js) — Commit 5b76b1b1 & 33d7a03d & ab8f7b31

- [x] **is_online cross-tenant leak**: `ppp_active_cache` JOIN di GET /api/users dan dashboard query kurang `AND pac.tenant_id = d.tenant_id` → pelanggan di router salah IP bisa terdeteksi online → **fix: tambah tenant_id scope** di kedua query
- [x] **Stale cache cleanup**: Tidak ada pembersihan otomatis `ppp_active_cache` → router offline/salah IP tetap punya entry → **fix: DELETE stale > 10 menit** di akhir `pollPppActiveAll()`
- [x] **Buka isolir tidak enable PPP Secret (HINDUN)**: Suspend & activate endpoint query `customer_details WHERE username = ?` tanpa tenant_id → setelah duplicate username migration bisa ambil row mitra lain (nas_id=NULL) → kondisi `detail?.nas_id` false → PPP enable tidak dipanggil → **fix: tambah AND tenant_id = ?** di kedua query
- [x] **Profil strip "-" intermittent**: `PUT /api/users/:username` lakukan `DELETE FROM radusergroup WHERE username = ?` tanpa scope tenant → hapus radusergroup semua tenant yang punya username sama → INSERT baru juga tidak isi `nas_id` → **fix: DELETE scoped via subquery NAS per tenant + INSERT sertakan nas_id**

### Restorasi Data radusergroup (via MySQL langsung di VPS)

Bug profil strip sudah terlanjur menghapus 457 radusergroup entries. Tahap restorasi:

1. **INSERT pertama** (321 rows): JOIN `billing_invoices` untuk rekonstruksi groupname dari invoice history
2. **INSERT kedua** (283 rows): JOIN `billing_invoices` dengan filter `tenant_id`
3. **Update nas_id router 6 → 193**: Router id=6 ternyata sudah dihapus; 828 rows di `customer_details` + `radusergroup` diupdate ke nas_id=193 (PoP-Gang Lika)
4. **Fix 10 user tersisa** dengan nas_id ke router yang sudah dihapus (23, 27, 111, 185, 192) + arif/dadan (nas_id=16 milik tenant lain):
   ```sql
   DELETE FROM radusergroup WHERE username IN ('arif','dadan','pian','ont-anton',...);
   INSERT INTO radusergroup (...) VALUES (..., NULL);  -- nas_id=NULL sementara
   ```
5. **Verifikasi final**: `SELECT ... WHERE rg.groupname IS NULL` → Empty set ✅

### Kondisi Pasca-Restorasi

- ~140 pelanggan tenant 11 dengan nas_id=NULL dan tanpa paket — butuh admin tenant 11 assign paket manual
- arif, dadan, pian, ont-anton, WIKA, YUSUP, ZAHRA SALON, 01010015, oomabdulrohman@sukajadi, sucidwilestari@sukajadi — nas_id=NULL di radusergroup (sementara). **Minta admin masing-masing reassign ke router yang benar via Settings**

---

## Status Kondisi VPS (Post-Deploy Agustus 2026)

- ✅ Backend running (commit ab8f7b31 + sebelumnya sudah di-deploy)
- ✅ `nas_id` ada di radcheck, radusergroup, radreply
- ✅ PORT=5002 di backend/.env
- ✅ DB credentials benar (pmyhome)
- ✅ addon_amount, tenant_id di billing_invoices & billing_settings
- ✅ Tabel notifications & installation_logs ada
- ✅ Container backend & freeradius running
- ✅ radusergroup sudah dipulihkan, profil strip resolved
- ✅ ppp_active_cache scoped per tenant_id, stale cleanup aktif
- ✅ Suspend/activate endpoint scoped per tenant_id

---

## Yang Masih Perlu Dilakukan

- [ ] **Dhisty.net router (103.191.165.35:8754)**: Koneksi API timeout — user sedang coba tambah firewall rule allow VPS IP ke port 8754 manual via HP. Belum confirmed berhasil.
- [ ] Set `auth_mode` pada router yang belum diset via Settings > MikroTik (edit router, pilih mode)
- [ ] Fix GA1 Access-Reject: `UPDATE mikrotik_config SET radius_nas_ip = '103.115.20.106' WHERE host = '103.115.20.2' AND tenant_id = 5;` lalu `/api/radius/sync`
- [ ] Test end-to-end: PSB dengan router radius (checkbox muncul), PSB dengan router local (checkbox tersembunyi)
- [ ] Coba impor ulang pelanggan "soni" — harus berhasil setelah migration jalan
- [ ] Admin tenant 11: assign paket ke ~140 pelanggan yang nas_id=NULL
- [ ] Admin tenant masing-masing: reassign router untuk 10 pelanggan yang radusergroup.nas_id=NULL (arif, dadan, pian, ont-anton, WIKA, YUSUP, ZAHRA SALON, 01010015, oomabdulrohman@sukajadi, sucidwilestari@sukajadi)

---

## Roadmap Fitur Masa Depan

### DST-NAT Redirect (Isolasi dengan Halaman Notifikasi)

> Rekomendasi dari rekan — implementasikan setelah sistem stabil di full local auth.

**Konsep:** Pelanggan isolir tetap konek tapi semua traffic HTTP diarahkan ke halaman billing VPS. Pelanggan bisa bayar mandiri tanpa hubungi admin.

**Cara kerja:**
- Saat isolir: ganti PPP profile ke `profile-isolir` (bukan disable secret) + kick user
- Pelanggan reconnect → dapat IP pool isolir (cth: 173.16.20.x) → masuk address-list `isolir`
- Firewall redirect semua HTTP (port 80) ke halaman billing VPS
- Payment gateway (Midtrans, Xendit, dll) di-whitelist agar bisa bayar langsung
- Saat buka isolir: ganti profile balik ke semula + kick user

**Yang perlu disiapkan sebelum implementasi:**
1. VPN antara semua router MikroTik mitra ke VPS (IP VPS harus reachable dari jaringan pelanggan)
2. Setup `pool-isolir` + `profile-isolir` + firewall rule di SETIAP router mitra
3. Halaman billing VPS harus bisa serve HTTP (port 80), bukan hanya HTTPS
4. Ubah `managePppSecret` di backend: isolir = ganti profile, bukan disable
5. Simpan nama profile asli tiap pelanggan (agar bisa di-restore saat buka isolir)

**Catatan teknis:**
- HTTPS (port 443) tidak bisa redirect mulus → SSL error di browser (by design, tidak bisa dihindari tanpa intercepting proxy)
- Solusi umum: tambah DNS redirect agar semua query DNS dari IP isolir dijawab dengan IP VPS
- Cocok untuk **full local auth** — di mode hybrid/RADIUS, logika ganti profile bentrok dengan Auth-Type=Reject
- Script MikroTik lengkap sudah ada (dikirim rekan), tinggal deploy ke router + sesuaikan IP VPS

---

## Hal Teknis Lain yang Perlu Diingat

- MySQL strict mode aktif di server → `SELECT DISTINCT` tidak boleh `ORDER BY` field yang tidak ada di SELECT
- `IF NOT EXISTS` pada `ALTER TABLE ... ADD COLUMN` tidak didukung versi MySQL di server ini → pakai `information_schema` check atau cukup jalankan tanpa IF NOT EXISTS
- FreeRADIUS queries.conf sudah dikustomisasi: JOIN ke `mikrotik_config` via `nas_id` untuk multi-tenant
- `DEPLOY_NOTES.md` berisi langkah deploy lengkap termasuk perintah SQL dan browser console script
