# Catatan Perubahan Sesi — 24 Juli 2026

## 1. Hapus Section "Sync ke Router" dari Modal Paket

**File:** `frontend/src/hooks/useUsers.js`, `frontend/src/App.jsx`, `frontend/src/pages/admin/PaketPage.jsx`

- Hapus checkbox "Sync ke Router" dari modal buat/edit profil paket
- `handleCreateProfile` tidak lagi terima `selectedRouterIds` sebagai parameter
- `routerIds` sekarang diderive otomatis dari `routerOverrides` — router yang punya override = otomatis disync
- Tombol submit disederhanakan jadi "Simpan Profil"
- Prop `setSelectedRouterIds` dihapus dari PaketPage

---

## 2. Update Panduan Pengguna

**File:** `frontend/src/App.jsx`

- **Setup Awal** — tambah keterangan field **Mode Autentikasi** (Local/FreeRADIUS) di Step 3 tambah router, plus warning bahwa field ini wajib diisi
- **Tambah Paket Bandwidth** — Step 3 sekarang menjelaskan fitur Override Profil per Router (cara "↓ Ambil", pilih dropdown, router dengan override otomatis disync)
- **Monitoring → Troubleshooting** — "Menambah Router Baru" disebut pilihan mode autentikasi

---

## 3. Fix Bug: Tombol Edit Paket Tidak Bisa Diklik

**File:** `frontend/src/hooks/useUsers.js`

- `handleEditProfile` memanggil `setSelectedRouterIds` yang berasal dari `useMikrotik`, bukan `useUsers` → runtime error
- Fix: hapus baris `setSelectedRouterIds((mtConfigs || []).map(c => c.id))` dari `handleEditProfile`

---

## 4. Hapus Field Static IP dari Form PSB Tipe PPPoE

**File:** `frontend/src/pages/admin/PSBPage.jsx`

- Field "Static IP (Opsional)" yang muncul saat tipe PPPoE dihapus
- Static IP hanya relevan untuk tipe koneksi Static (ARP) dan Hotspot Binding

---

## 5. Hapus Field MAC Address dari Form PSB

**File:** `frontend/src/pages/admin/PSBPage.jsx`

- Field MAC Address dihapus dari form PSB untuk tipe Static (ARP) dan Hotspot Binding

---

## 6. Perubahan Logika PPP Secret saat PSB — RADIUS NAS

**File:** `backend/index.js`

- Sebelumnya: RADIUS NAS → skip create PPP Secret (atau opsional via checkbox)
- Sekarang: **selalu create PPP Secret**, tapi:
  - Local NAS → `disabled=no` (langsung bisa konek)
  - RADIUS NAS → `disabled=yes` (RADIUS yang handle auth, secret sebagai referensi)
- Checkbox "Buat PPP Secret di MikroTik" dihapus dari frontend (tidak lagi relevan)

---

## 7. Tambah Kolom `tikor` di Template Import

**File:** `frontend/src/hooks/useUsers.js`

- Kolom `tikor` ditambahkan di akhir template import Excel
- Format: `lat,long` dalam satu kolom (misal: `-6.912345,107.654321`)
- Saat import, `tikor` di-parse: split koma → `latitude` dan `longitude` dikirim ke backend terpisah
- Sheet Petunjuk diperbarui dengan penjelasan kolom `tikor`

---

## 8. Tab "Static IP" Gabung ARP + Hotspot Binding

**File:** `frontend/src/pages/admin/PelangganPage.jsx`

- Tab "Static (ARP)" berganti nama jadi **"Static IP"**
- Tab "Hotspot Binding" (yang sebelumnya muncul kondisional) dihapus
- Kedua tipe (`connection_type='static'` dan `connection_type='hotspot'`) sekarang masuk ke satu tab "Static IP"
- Counter dan filter base users diperbarui

---

## 9. Kolom PPPoE/IP Dinamis di Tab Static

**File:** `frontend/src/pages/admin/PelangganPage.jsx`

- Di tab **Static IP**: header kolom berubah jadi "IP STATIC", isi menampilkan `static_ip` pelanggan
- Di tab **Semua** dan **PPPoE**: tetap "PPPoE" dan isi username

---

## 10. Fix Bug: Migration `ont_removals` Blokir Semua Migration

**File:** `backend/index.js`

- `ALTER TABLE ont_removals` dijalankan sebelum tabel dibuat → throw → semua migration di bawahnya tidak jalan (termasuk `CREATE TABLE payment_promises`)
- Fix: tambah guard `ontRemovalsColNames.length > 0` — ALTER hanya dijalankan jika tabel sudah ada

---

## 11. Fix Bug: PPP Secret Tidak Berubah saat Username Diganti

**File:** `backend/index.js`

- Saat username berubah, kode lama hanya mencoba `update` PPP Secret dengan `newUsername` yang belum ada di MikroTik → tidak ketemu → tidak ada perubahan
- Fix: deteksi `usernameChanged`, lalu:
  1. Kick sesi lama pakai `oldUsername`
  2. Delete PPP Secret bernama `oldUsername`
  3. Create PPP Secret baru bernama `newUsername`

---

## Hal yang Masih Perlu Dilakukan (Pending)

- [ ] Deploy ke VPS: `git push` → `git pull` di VPS → `docker compose build backend` → `docker compose up -d backend` → `cd frontend && npm run build`
- [ ] Setelah deploy: cek log untuk `[MIGRATION] customer_details: PRIMARY KEY diubah ke id`
- [ ] Setelah deploy: cek log untuk `[MIGRATION] mikrotik_config: auth_mode ditambahkan`
- [ ] Set `auth_mode` pada router yang sudah ada via Settings > MikroTik → Edit
- [ ] Fix GA1 Access-Reject: `UPDATE mikrotik_config SET radius_nas_ip = '103.115.20.106' WHERE host = '103.115.20.2' AND tenant_id = 5;` lalu `/api/radius/sync`
- [ ] Test impor ulang pelanggan "soni" — harus berhasil setelah migration PK jalan
- [ ] Test PSB dengan router RADIUS: secret dibuat `disabled=yes` di MikroTik
- [ ] Test ganti username pelanggan: PPP Secret lama dihapus, baru dibuat
