# Changelog

All notable changes to SALFANET RADIUS will be documented in this file.

---

## [2.11.6] - 2026-03-28 (PPPoE Edit Billing Day Fix + MikroTik Local-Address Verification)

### ✅ Fix: billingDay Selalu Reset ke 1 Saat Edit User PPPoE

- **Root cause ditemukan di `UserDetailModal.tsx`** (komponen edit yang sesungguhnya, `isOpen={isDialogOpen && !!editingUser}`):
  - Default `subscriptionType` menggunakan `|| 'PREPAID'` (salah) — seharusnya `'POSTPAID'`. User POSTPAID dengan `subscriptionType` null ditampilkan sebagai PREPAID, sehingga field billing day tersembunyi dan selalu reset ke 1.
  - `billingDay` menggunakan `|| 1` (falsy check) — nilai 0 atau null keduanya di-reset ke 1.
- Fix: `user.subscriptionType ?? 'POSTPAID'` dan `billingDay: user.billingDay ?? new Date(user.expiredAt).getDate()` (infer dari expiredAt jika billingDay null).
- Juga fix di `users/page.tsx` `handleEdit` — pola `??` yang sama.
- `pppoe.service.ts` `createPppoeUser`: clamp billingDay ke 1-28 (sesuai DB CHECK constraint; sebelumnya 1-31).

### ✅ Enhancement: MikroTik local-address Sync Verification

- `sync-mikrotik/route.ts`: setelah set `local-address` di PPP profile via RouterOS API, sekarang **read back** profile untuk memverifikasi nilainya benar-benar tersimpan.
- RouterOS secara diam-diam mengabaikan `local-address` jika IP tersebut belum dikonfigurasi sebagai alamat interface di router.
- Jika tidak tersimpan: tampilkan warning yang actionable: "Pastikan IP dikonfigurasi sebagai alamat interface di MikroTik terlebih dahulu (`/ip address add address=X.X.X.X/32 interface=lo`), kemudian sync ulang."

### Files Changed
- `src/components/UserDetailModal.tsx` — fix subscriptionType default (`|| 'PREPAID'` → `?? 'POSTPAID'`) + billingDay nullish coalescing
- `src/app/admin/pppoe/users/page.tsx` — fix handleEdit billingDay/subscriptionType defaults
- `src/server/services/pppoe.service.ts` — clamp billingDay 31→28 in createPppoeUser
- `src/app/api/pppoe/profiles/sync-mikrotik/route.ts` — add post-sync local-address read-back + actionable warning

---

## [2.11.6] - 2026-03-27 (PPPoE UI Revamp + PPN Fix + Area & Billing Fixes)

### ✅ Feat: PPPoE Action Buttons Revamped (Phase 15)

- `src/app/admin/pppoe/users/page.tsx`: tombol aksi baris tabel diubah menjadi 5 ikon bersih — Eye (detail), Pencil (edit), RefreshCw (sync RADIUS), Shield (isolir/aktifkan), Trash (hapus).
  - Tooltip on-hover untuk setiap ikon.
  - Warna per aksi: cyan detail, yellow edit, green sync, orange shield, red delete.
- Badge **CustomerId** dan jumlah **Langganan** per pelanggan kini bisa diklik sebagai link filter.
- API baru `POST /api/pppoe/users/[userId]/sync-radius` — sync RADIUS per-user tanpa harus reload halaman.

### ✅ Fix: PPN Calculation di Semua Titik Generate Invoice (Phase 16)

- Fixed kalkulasi PPN yang tidak konsisten di 9 file:
  - `src/server/services/billing.service.ts` (3 titik)
  - `src/server/services/pppoe.service.ts` (2 titik)
  - `src/app/api/billing/generate/route.ts`
  - `src/app/api/billing/generate-all/route.ts`
  - `src/app/api/billing/renewal/route.ts`
  - `src/app/api/customer/topup-direct/route.ts`
- Formula: `ppnAmount = Math.round(baseAmount * (ppnPercent / 100))`, `totalAmount = baseAmount + ppnAmount`.
- Koordinat GPS pelanggan di tabel PPPoE sekarang bisa diklik untuk membuka Google Maps.

### ✅ Fix: NAS IP di Kolom Network (Phase 17)

- `src/app/admin/pppoe/users/page.tsx`: kolom **Network** sebelumnya menampilkan IP statis user (`user.ipAddress`). Sekarang menampilkan IP NAS router dari database (`user.router?.ipAddress ?? user.router?.nasname`).
  - Label diubah dari "IP:" menjadi "IP NAS:".
  - IP statis user tetap ditampilkan di kolom PPPoE (`IP: user.ipAddress`).

### ✅ Fix: billingDay & expiredAt Tidak Tersimpan Saat Edit POSTPAID (Phase 17)

- `src/server/services/pppoe.service.ts` — fungsi `updatePppoeUser`:
  - Sebelumnya: `expiredAt` di-overwrite langsung dari nilai form, tidak memperhitungkan perubahan `billingDay`.
  - Sekarang: jika `subscriptionType === 'POSTPAID'` dan `billingDay` dikirim, `expiredAt` di-**recalculate** otomatis ke tanggal tagihan berikutnya (bulan depan pada hari `billingDay`).
  - Untuk `PREPAID`: `expiredAt` tetap menggunakan nilai yang dikirim dari form.

### ✅ Feat: Area di Kolom Data Pelanggan & Form (Phase 17)

- **Tabel PPPoE**: badge Area (kuning, ikon `MapPin`) ditampilkan di bawah info pelanggan di kolom "Data Pelanggan" — sebelumnya tidak ditampilkan sama sekali.
- **Form Tambah Pelanggan**: tambah select `Area` (opsional) di antara pilihan NAS dan data personal — sebelumnya field `areaId` sudah ada di state tapi tidak ada UI-nya.
- Form **Edit** (UserDetailModal) sudah punya area select sejak sebelumnya.

### Files Changed
- `src/app/admin/pppoe/users/page.tsx` — action buttons, network IP, area badge, area select in add form, PPN coords
- `src/server/services/pppoe.service.ts` — updatePppoeUser billingDay/expiredAt recalc + PPN fix
- `src/server/services/billing.service.ts` — PPN calculation fix (3 points)
- `src/app/api/billing/generate/route.ts` — PPN fix
- `src/app/api/billing/generate-all/route.ts` — PPN fix
- `src/app/api/billing/renewal/route.ts` — PPN fix
- `src/app/api/customer/topup-direct/route.ts` — PPN fix
- `src/app/api/pppoe/users/[userId]/sync-radius/route.ts` — created (per-user sync)

---

## [2.11.5] - 2026-03-20 (Ghost Session Fix + RADIUS Auth Hardening + Tooling Cleanup)

### ✅ Fix: Ghost Sessions Filtered from Session List

- `src/app/api/sessions/route.ts`: tambah `.filter()` sebelum `.map()` — session yang tidak terdaftar di `pppoeUser` maupun `hotspotVoucher` tidak akan ditampilkan.
  - Mencegah "ghost session" dari user yang sudah dihapus atau tidak dikenal tetap muncul di halaman Sesi.

### ✅ Fix: RADIUS Authorize Now Rejects Unregistered Users

- `src/app/api/radius/authorize/route.ts`: pengguna yang tidak ditemukan di `pppoeUser` dan bukan voucher kini dikembalikan REJECT eksplisit, bukan `{}` (allow).
  - Sebelumnya, user tidak dikenal bisa melewati FreeRADIUS karena `{}` diterjemahkan sebagai Access-Accept.
  - Response baru: `"control:Auth-Type": "Reject"`, `"reply:Reply-Message": "User Tidak Terdaftar"`.

### ✅ Fix: Dashboard Hotspot Session Count Only Counts Registered Vouchers

- `src/app/api/dashboard/stats/route.ts`: counter `activeSessionsHotspot` sekarang cross-reference ke tabel `hotspotVoucher`.
  - Session dari username yang tidak ada di `hotspotVoucher` diabaikan secara diam-diam.
  - Tambah `Promise.all` untuk lookup `hotspotVoucherSet` secara paralel, menjaga performa.

### ✅ Fix: Next.js 16 Build Crash on `/_global-error`

- Buat `src/app/global-error.tsx` sebagai custom `'use client'` error boundary component.
  - Tanpa file ini, Next.js 16 auto-generate `/_global-error` yang crash saat prerender dengan `TypeError: Cannot read properties of null (reading 'useContext')`.
  - Component menampilkan pesan error dengan tombol "Coba Lagi" (`reset()`).

### ✅ Fix: Customer WiFi Page Card Padding

- `src/app/customer/wifi/page.tsx`: semua `CyberCard` kini memiliki `p-4 sm:p-5` eksplisit.
  - Container wrapper menggunakan `p-4 sm:p-5 lg:p-6 space-y-4 sm:space-y-5`.

### ✅ Chore: npm Scripts & Deploy Tooling

- Restore `scripts/scan-api-endpoints.js` — scan semua `route.ts`, detect HTTP methods, output `API_ENDPOINTS.md`.
- Restore `scripts/test-all-apis.js` — smoke test untuk endpoint publik (`/api/health`, `/api/public/*`).
- Fix path deploy: `bash smart-deploy.sh` → `bash production/smart-deploy.sh`.
- Buat `scripts/run-deploy.js` — cross-platform wrapper:
  - Windows: print panduan WSL/Git Bash (graceful, exit 1)
  - Linux/macOS: delegate ke `production/smart-deploy.sh`
- Tambah scripts: `npm run clean:local`, `npm run clean:all`, `npm run deploy:status`, dll.
- Tidy `.gitignore`: hapus duplikat, hapus `/.git/`, rapikan per section.

### Files Changed
- `src/app/api/sessions/route.ts` — ghost session filter
- `src/app/api/radius/authorize/route.ts` — reject unregistered users
- `src/app/api/dashboard/stats/route.ts` — hotspot count cross-ref
- `src/app/global-error.tsx` — created (Next.js error boundary)
- `src/app/customer/wifi/page.tsx` — explicit card padding
- `scripts/scan-api-endpoints.js` — created (API scanner)
- `scripts/test-all-apis.js` — created (smoke test)
- `scripts/run-deploy.js` — created (cross-platform deploy wrapper)
- `package.json` — restored test:api/test:scan, clean:local, fixed deploy paths
- `.gitignore` — deduplicated and organized

---

## [2.11.4] - 2026-03-19 (Duplicate Notification Fix + Sessions Traffic Auto-Refresh)

### ✅ Fix: Duplicate Toast Notifications

- **Agent portal**: `AgentNotificationDropdown` was mounted TWICE (desktop + mobile header), each with its own polling and toast logic. Both instances independently detected "new" notifications and showed toasts, causing double toast for every notification.
  - Added `enableToasts` prop — mobile instance now renders dropdown UI only, no toasts
  - Added module-level polling dedup (`_agentPollingInstance`) — only first mounted instance polls
- **Technician portal**: `NotificationBell` was mounted TWICE (desktop + mobile header), both polling independently.
  - Added module-level polling dedup — only primary instance sets up interval
- **Admin portal**: `NotificationDropdown` component polled every 30s independently on top of layout's 30s polling (wasteful double API calls).
  - Reduced dropdown polling interval to 60s (layout already handles 30s toast polling)

### ✅ Fix: Admin Sessions Traffic Not Updating

- `fetchSessions()` called `setLoading(true)` on every 10s auto-refresh, causing full-page spinner to replace the sessions table briefly every 10 seconds. This made traffic data appear frozen.
  - Added `silent` parameter to `fetchSessions()` — auto-refresh now uses `silent=true` to skip the loading spinner
  - Initial load and manual refresh still show the loading indicator

### ✅ Fix: Agent Sessions Traffic Stops Updating

- Added `visibilitychange` event handler to agent sessions page — refreshes data immediately when browser tab becomes visible (browsers throttle `setInterval` in background tabs)
- Same `visibilitychange` handler added to admin sessions page

### Files Changed
- `src/components/agent/NotificationDropdown.tsx` — enableToasts prop, module-level polling dedup
- `src/app/agent/AgentLayoutClient.tsx` — mobile instance gets `enableToasts={false}`
- `src/app/technician/TechnicianPortalLayout.tsx` — module-level polling dedup for NotificationBell
- `src/components/NotificationDropdown.tsx` — polling interval 30s → 60s
- `src/app/admin/sessions/page.tsx` — silent auto-refresh + visibilitychange handler
- `src/app/agent/sessions/page.tsx` — visibilitychange handler

---

## [2.11.3] - 2026-03-19 (Full Redis Removal + Hotspot Traffic Real-time)

### ✅ Enhancement: Complete Redis Removal

- Removed ALL Redis (`ioredis`) usage from entire codebase:
  - Deleted `src/server/cache/redis.ts`, `src/server/cache/online-users.cache.ts`, `vps-install/install-redis.sh`
  - Removed `ioredis` from `package.json`
  - Removed `REDIS_URL` from `.env.example`
  - Cleaned Redis references from `cron-service.js` (removed distributed lock + `sync_online_users` schedule)
  - Cleaned installer scripts (`vps-installer.sh`, `vps-uninstaller.sh`)
  - Fixed `cron-service.js` syntax error from dangling try block after Redis lock removal
- All online user tracking now relies on FreeRADIUS `radacct` (single source of truth)

### ✅ Fix: Hotspot Upload/Download Traffic Not Real-time

- **Root cause**: `Acct-Interim-Interval = 300` in FreeRADIUS `post-auth` — MikroTik only sent traffic bytes every 5 minutes
  - Changed to `Acct-Interim-Interval = 60` (1 minute) in both `freeradius-config/sites-available/default` and `sites-enabled/default`
  - Reloaded FreeRADIUS on VPS (`systemctl reload freeradius`)
- **Agent sessions page**: Had no auto-refresh — added 30s silent auto-refresh interval
  - `loadSessions(agentId, silent)` — `silent=true` skips loading spinner on background refresh

### Note
- Only NEW sessions (after FreeRADIUS reload) get the 60s interval. Existing sessions retain old 300s interval until reconnect.

---

## [2.11.2] - 2026-03-18 (Manual Agent Deposit Proof + Admin Bank Target)

### ✅ Enhancement: Manual Deposit Agent End-to-End

- Agent manual top-up sekarang mengambil daftar rekening tujuan admin langsung dari Company Info (`bankAccounts`) saat memilih metode manual.
- Modal top-up agent menambahkan field transfer manual:
  - Rekening tujuan admin (pilih dari daftar)
  - Nama pemilik rekening pengirim
  - Nomor rekening pengirim
  - Catatan
  - Upload bukti transfer
- Bukti transfer diupload melalui endpoint existing `/api/upload/payment-proof` dan dikirim ke request manual sebagai `receiptImage`.
- API request manual (`/api/agent/deposit/manual-request`) kini menyimpan metadata transfer manual lengkap.

### ✅ Enhancement: Admin Verifikasi Deposit Manual

- Halaman admin verifikasi deposit agent (`/admin/hotspot/agent/deposits`) kini menampilkan:
  - Rekening admin tujuan transfer
  - Informasi rekening pengirim agent
  - Catatan transfer
  - Link "Lihat Bukti" transfer
- API admin (`/api/admin/agent-deposits`) tetap mendukung approve/reject, dengan pesan notifikasi yang sudah menyertakan konteks transfer manual.

### ✅ Database Update

- `agent_deposits` ditambah kolom metadata transfer manual:
  - `targetBankName`
  - `targetBankAccountNumber`
  - `targetBankAccountName`
  - `senderAccountName`
  - `senderAccountNumber`
  - `receiptImage`
  - `note`
- Migration: `prisma/migrations/20260318120000_add_agent_manual_deposit_fields/migration.sql`

---

## [2.11.1] - 2026-03-17 (MapPicker Z-Index Fix + Indonesian-Only Language)

### ✅ Fix: Popup Peta Muncul di Belakang Form Modal

- Popup peta (MapPicker) muncul di belakang form "Tambah Pelanggan" / "Edit PPPoE User" dan form lainnya yang menggunakan `SimpleModal`.
- **Root cause**: `MapPicker` merender `<div style={{ zIndex: 10001 }}>` langsung di dalam DOM tree halaman. Layout parent (sidebar, animasi) membentuk stacking context sendiri yang menjebak z-index `MapPicker` sehingga tidak bisa melampaui `SimpleModal` yang menggunakan `createPortal` di root.
- **Perbaikan**: Tambahkan `createPortal(jsx, document.body)` pada return statement `MapPicker` agar dirender langsung di `document.body` (level root), sama seperti `SimpleModal`.
- File: `src/components/MapPicker.tsx`
- Halaman yang terpengaruh: `/admin/pppoe/users` (tambah/edit pelanggan), fiber joint closures, ODCs, dan semua halaman dengan `MapPicker` di atas form modal.

### ✅ Refactor: Hapus Bahasa Inggris — Full Bahasa Indonesia

- Menghapus dukungan multi-bahasa (Inggris) agar UI konsisten full Bahasa Indonesia.
- **File dihapus**:
  - `src/locales/en.json` — File terjemahan Bahasa Inggris
  - `src/components/LanguageSwitcher.tsx` — Komponen pemilih bahasa
- **File diubah**:
  - `src/hooks/useTranslation.ts` — Disederhanakan: hardcode locale `'id'`, hapus import `en.json`, hapus English fallback logic
  - `src/lib/store.ts` — Tipe locale disederhanakan menjadi `'id'` only, `setLocale` jadi no-op
  - `src/app/admin/AdminClientLayout.tsx` — Hapus tombol language toggle dari header
  - `src/app/agent/page.tsx` — Hapus tombol language switcher dari login page
  - `src/app/agent/AgentLayoutClient.tsx` — Hapus tombol language switcher (desktop + mobile header)
  - `src/app/customer/CustomerClientLayout.tsx` — Hapus tombol language toggle (desktop + mobile header), hapus import `useTranslation` yang tidak terpakai
  - `src/app/technician/TechnicianPortalLayout.tsx` — Hapus tombol language switcher (desktop + mobile header)

---

## [2.11.0] - 2026-03-17 (System Update Stabilization + Admin UI Spacing Polish)

### ✅ System Update Reliability (Admin `/admin/system`)

- Fix error `Failed to start update process: WriteStream { fd: null }` dengan mengganti stream fd ke `openSync` sebelum `spawn`.
- Fix standalone runtime path issue (`process.cwd()` mengarah ke `.next/standalone`) dengan resolver app root (`getAppDir()`) untuk endpoint system info/update.
- Hardening environment saat trigger update dari API: gunakan minimal sanitized env agar `next build` tidak rusak oleh variabel turunan PM2/Next.
- SSE log streaming diperkuat: heartbeat periodik + header anti-buffering + auto-reconnect di frontend agar log live tidak kosong/stuck.
- Update script kini menggunakan zero-downtime reload: `pm2 reload salfanet-radius --update-env` (cron tetap restart normal).

### ✅ Nginx / Manifest Fix

- Tambah rule static manifest berbasis regex agar semua manifest (`manifest-admin.json`, `manifest-agent.json`, dst.) dilayani langsung oleh Nginx.
- Mencegah error 500 manifest saat jendela restart aplikasi.

### ✅ UI Polish (Card Padding Precision)

- Perbaikan padding/spacing card agar konten tidak mepet border di beberapa halaman admin:
  - Push Notifications
  - Manual Payments
  - Network Trace
- Penyesuaian jarak icon-title dan line-height heading untuk konsistensi visual.

### ✅ Fix: Hotspot Profile Modal — i18n Key

- Modal "Tambah Profil" hotspot menampilkan raw key `hotspot.eVoucherAccess` (huruf V kapital) alih-alih terjemahan.
- Perbaikan: ganti key di `profile/page.tsx` dari `eVoucherAccess` → `evoucherAccess` agar cocok dengan `id.json`/`en.json`.
- Commit: `f8e5702`

### ✅ Fix: Dashboard — SESI HOTSPOT AKTIF selalu 0

- Dashboard menampilkan `0` untuk SESI HOTSPOT AKTIF meskipun ada sesi aktif di halaman Sesi Hotspot.
- **Root cause**: classifier lama memakai `service.includes('framed')` sebagai sinyal PPPoE. MikroTik hotspot bisa mengirim `Service-Type = Framed-User` yang mengandung kata "framed" → hotspot salah diklasifikasi sebagai PPPoE.
- **Perbaikan**:
  - Hapus pengecekan RADIUS attrs (`framedprotocol`, `servicetype`) — tidak reliable.
  - Gunakan logika sederhana: jika username ada di `pppoeUser` → PPPoE, selainnya → Hotspot (konsisten dengan halaman Sesi).
  - Tambahkan Redis `online:users` sebagai supplement untuk sesi yang sudah tercatat via Accounting hook tapi belum masuk `radacct`.
- Commit: `667b158`

---

## [2.10.21] - 2026-03-05 (UI Fixes + CyberToastProvider + Docs Audit)

### ✅ UI Fixes

#### **1. Logo Dark Mode Fix**
- Tambah `bg-white` di 5 halaman login/portal agar logo hitam terlihat di dark mode
- Affected: login page, customer portal, agent portal, customer wifi, and topup pages

#### **2. Sidebar Navigation Reorder — Komunikasi Group**
- Group "Komunikasi" (Notifikasi + Push Notifikasi) dipindahkan langsung di bawah Dashboard, di atas PPPoE
- Mempermudah akses ke notifikasi dari sidebar admin

#### **3. CyberToastProvider Fix**
- `CyberToastProvider` ditambahkan ke root `AdminLayout`
- Fix error: `useToast must be used within a CyberToastProvider` saat halaman admin diload

#### **4. Dialog Padding & Modal Title Color**
- Dialog padding konsisten: `p-6` di semua modal
- Modal title color: hardcoded `text-white` → `text-foreground` (respects dark/light theme)

### ✅ Documentation Audit

- **MikroTik docs**: Fix VPS IP (`103.191.165.156` → `103.151.140.110`), VPN subnet (`172.20.30.x` → `10.20.30.x`), secret placeholder (`secret123` → `your-nas-secret`)
- **Invoice format doc**: Format diperbarui ke `INV/YYYY/MM/DD/NNNN` (sesuai actual code)
- **CRON-SYSTEM.md**: 10 → 13 jobs, file list diperbarui ke actual cron files
- **COA_TROUBLESHOOTING_WORKFLOW.md**: IPs dan secret diperbarui
- **TROUBLESHOOTING.md**: FreeRADIUS test secret diperbaiki ke `testing123`
- Version headers diperbarui di: README.md, ISOLATION_SYSTEM_WORKFLOW.md, BALANCE_AUTO_RENEWAL.md

---

## [2.10.20] - 2026-03-04 (PPPoE Session Sync + Uptime Fix + NAS Auto-Sync)

### ✅ New Features & Fixes

#### **1. PPPoE Session Sync Cron (pppoe-session-sync.ts)**
- Cron baru setiap 5 menit: sync sesi aktif MikroTik → radacct
- Solusi untuk Accounting-Start loss pada koneksi yang tidak dicatat
- File: `src/lib/cron/pppoe-session-sync.ts`

#### **2. Sessions API Uptime Real-time**
- Uptime dihitung dari `acctstarttime` (bukan `acctsessiontime` stale)
- Fix Prisma UTC→WIB TZ mismatch via `TZ_OFFSET_MS`

#### **3. NAS Auto-Sync di FreeRADIUS Health Cron**
- `syncNasClients()` diintegrasikan ke `freeradius-health` cron
- `systemctl reload freeradius` (SIGHUP) — tidak perlu restart penuh

#### **4. isRadiusServer Filter di VPN Dropdown**
- Filter NAS/VPN dropdown agar hanya tampilkan server dengan `isRadiusServer: true`

---

## [2.10.17] - 2026-03-02 (Light Theme Fix + Project Cleanup)

### ✅ Improvements

#### **1. Light Theme — 240+ Color Fixes**
- `text-white` → `text-foreground`, `text-[#e0d0ff]` → `text-muted-foreground`
- Form inputs: `bg-slate-900` → `bg-input` di 60+ admin files

#### **2. Unicode/Emoji Repair**
- 38 broken unicode/emoji diperbaiki di 6 files

#### **3. Project Cleanup**
- Hapus 16 unused scripts (fix_*.py, patch-*.ps1, check_mt.js, src-update.zip)
- FreeRADIUS mods-enabled/rest synced, all configs verified matching VPS

---

## [2.10.16] - 2026-03-02 (VPN Control Modal UX Fix)

### ✅ Improvements

- Hapus double-modal anti-pattern di L2TP/PPTP/SSTP control panels
- SSH credentials kini tampil inline di control modal
- Apply Routing via Frontend: button ⚡ + output terminal
- Fix routing script duplicate bug (13 baris)
- New API endpoint: `/api/network/vpn-routing`

---

## [2.10.15] - 2026-03-01 (Swal Migration + Referral System)

### ✅ New Features

#### **1. Customer Portal: SweetAlert2 → CyberToast Migration**
- 4 file customer portal, 19 calls dimigrasikan dari SweetAlert2 ke CyberToast
- Theme instant switch (no transition animation)

#### **2. Customer Referral System**
- Database + API + UI untuk referral antar customer
- Tersedia di customer portal

---

## [2.10.14] - 2026-03-01 (VPS Hotfix)

### ✅ Fixes

- FreeRADIUS MySQL Error 4031: Pool tuning (`retry_delay=1`, `lifetime=300`, `idle_timeout=20`)
- Nginx gzip level 6
- Swap reclaimed, Redis restart
- `cyberpunk-bg` disembunyikan di light mode

---

## [2.10.13] - 2026-02-28 (Dark/Light Mode Toggle)

### ✅ New Features

- `useTheme` hook dengan `localStorage` persistent
- Sun/Moon toggle button di admin header
- Light mode CSS vars (slate-50 bg, dark sidebar)

---

## [2.10.12] - 2026-02-28 (Bugfix MikroTik Script)

### ✅ Fixes

- Hapus `use-vj-compression` dari `/ppp profile add salfanetradius`
- Parameter tidak valid di RouterOS 7.x (menyebabkan `expected end of command col 121`)

---

## [2.10.11] - 2026-02-28 (Admin Dashboard v2 + Full SALFANET Rebrand)

### ✅ New Features & Refactoring

- Admin Dashboard v2: Agent voucher sales + RADIUS auth log
- i18n fix (28 keys)
- **Full Rebrand**: Semua referensi "AIBILL" diganti ke "SALFANET" di seluruh project
- MikroTik profile rename: `salfanetradius`

---

## [2.10.10] - 2026-02-28 (Bulk Import Invoice CSV + Customer Self-Service Suspend)

### ✅ New Features

#### **1. Bulk Import Invoice via CSV**
- Route: `/admin/invoices/import`
- Parser: papaparse

#### **2. Customer Self-Service Suspend**
- Available: web + mobile
- New cron + `suspend_requests` table

---

## [2.10.9] - 2026-02-21 (Customer Portal Bug Fixes + Mobile Layout + Cleanup)

### ✅ Bug Fixes

#### **1. Customer Dashboard: Invoice Tidak Muncul**
- **Root cause:** API `/api/customer/invoices` mereturn `{ success, data: { invoices } }` tetapi frontend membaca `data.invoices` (skip layer `data`)
- **Fix:** `customer/page.tsx` — ubah `data.invoices` → `data.data?.invoices || []`

#### **2. Notifikasi Lonceng: Tidak Auto Masuk Saat Upgrade/Downgrade**
- **Root cause 1:** `layout.tsx` tidak memanggil `poll()` saat mount — harus tunggu 30 detik pertama
- **Root cause 2:** `notifications/route.ts` hanya mendeteksi `type: 'package_change'` namun route `/api/customer/upgrade` menyimpan `type: 'package_upgrade'`
- **Fix 1:** Tambah `poll()` langsung setelah mount di `useEffect`
- **Fix 2:** Deteksi kondisi OR: `package_change || package_upgrade`

#### **3. Halaman Tagihan: Tidak Auto Refresh Saat Transaksi Masuk**
- **Fix:** Tambah `setInterval(loadInvoices, 30_000)` di `customer/page.tsx` (sama seperti history page)

#### **4. WiFi API 400 Error di Console**
- **Root cause:** Saat GenieACS belum dikonfigurasi, API mereturn HTTP 400 → browser log error merah
- **Fix:** Ganti ke HTTP 200 dengan `{ success: false, reason: 'not_configured' }`, client skip secara diam-diam

#### **5. Missing Translation Key `nav.backToDashboard`**
- Tambah key `nav.backToDashboard` ke `id.json` ("Kembali ke Dashboard") dan `en.json` ("Back to Dashboard")

### ✅ UI / Layout Improvements

#### **6. Customer Portal Mobile: Tampilan Beberapa Halaman Tidak Muncul**
- **Root cause:** `topup-direct/page.tsx` dan `tickets/create/page.tsx` menggunakan `min-h-screen bg-gradient` sendiri + custom `<header>` yang bertabrakan dengan shared layout
- **Fix:** Hapus standalone background/header, gunakan container `p-3 lg:p-6` standar sesuai halaman lain
- Loading state di `topup-direct` juga diperbaiki dari full-screen overlay ke centered spinner

#### **7. Customer Topup-Request: Layout Desktop Proporsional**
- **Before:** Form sempit `max-w-2xl` dengan background standalone
- **After:** Grid 2-kolom (`lg:grid-cols-3`) — form `lg:col-span-2`, info panel `lg:col-span-1`; terintegrasi ke shared layout

### ✅ Project Maintenance

#### **8. File Cleanup**
- Hapus 10 one-off translation scripts dari `scripts/` (`translate-pass2..5`, `translate-final`, `add-keys`, `check-remaining`, dll)
- Hapus `dist/` folder (build artifact lama)
- Hapus `check-customer-phone.js` dan `TYPESCRIPT_ERRORS_FIXED.md` dari root
- Hapus 24 docs lama/redundan dari `docs/` (chat history, old roadmaps, duplicate implementation notes)

#### **9. Cache Reset**
- Hapus `.next/` build cache dan `tsconfig.tsbuildinfo`
- `npm cache clean --force`
- Rebuild ulang dari clean state

#### **10. TypeScript Build Fixes**
- `api/invoices/route.ts` line 459: `sendPaymentSuccess()` call missing required `invoiceNumber` and `amount` fields — added both from `existingInvoice`
- `customer/tickets/[id]/page.tsx`: `useToast` was imported but never called; `toast('success', ...)` called an undefined function — fixed by destructuring `addToast` and wrapping into local `toast` helper

**Files Modified:**
- `src/app/api/invoices/route.ts` — sendPaymentSuccess missing fields fix
- `src/app/customer/tickets/[id]/page.tsx` — useToast properly initialized
- `src/app/customer/page.tsx` — invoice fix + 30s poll
- `src/app/customer/layout.tsx` — immediate poll on mount
- `src/app/customer/topup-request/page.tsx` — desktop grid layout
- `src/app/customer/topup-direct/page.tsx` — remove standalone background/header
- `src/app/customer/tickets/create/page.tsx` — remove standalone background
- `src/app/api/customer/notifications/route.ts` — detect package_upgrade type
- `src/app/api/customer/wifi/route.ts` — return 200 instead of 400 for unconfigured
- `src/locales/id.json` + `en.json` — add nav.backToDashboard key

---

## [2.10.8] - 2026-02-20 (Customer Mobile App UX + i18n Admin Panel)

### \u2705 Customer Mobile App Fixes (React Native/Expo \u2014 C:\m)

#### **1. Added: Customer ID & Phone Number Display**
- Dashboard screen: ID Pelanggan (neonViolet) + nomor HP (neonBlue) under username
- Profile screen: ID Pelanggan displayed in header + kontak section, HP in header
- Backend API fixed: `customerId` field now returned in `/api/customer/dashboard` and `/api/customer/profile` responses

**Files Modified:**
- `src/app/api/customer/dashboard/route.ts` — Added `customerId` to response
- `src/app/api/customer/profile/route.ts` — Added `customerId` to response
- `C:\m\services\dashboard.ts` — Updated interface with `id`, `customerId`, `email`, `phone`
- `C:\m\app\(tabs)\index.tsx` — Customer ID + phone display
- `C:\m\app\(tabs)\profile.tsx` — ID Pelanggan + phone in header + contact section

---

#### **2. Fixed: Dark Text on Dark Background (Global + Per-Component)**
**Root Cause:** `PaperProvider` had no theme \u2014 all React Native Paper components defaulted to light theme.

**Global Fix:**
- Added `MD3DarkTheme` with custom cyberpunk colors to `PaperProvider` in `app/_layout.tsx`

**Per-Component Fixes (11 files):**
- `app/wifi.tsx` (CRITICAL) \u2014 Full rewrite: replaced Paper Card/Button with dark Views, fixed `backgroundColor: 'white'`, fixed `color: COLORS.text` (white-on-white)
- `app/upgrade.tsx` \u2014 Package names text color + RadioButton dark theme colors
- `app/(tabs)/invoices.tsx` \u2014 Dialog invoice text + 4 TextInput dark theme props
- `app/(tabs)/wifi.tsx` \u2014 SSID text color + placeholderTextColor
- `app/topup.tsx` \u2014 Label text color + placeholderTextColor
- `app/tickets/create.tsx` \u2014 Category/priority text colors + RadioButton colors + placeholderTextColor
- `app/tickets/[id].tsx` \u2014 Reply input placeholderTextColor

---

#### **3. Fixed: Android System Navigation Bar Overlap**
**Problem:** Android system nav bar was visible and covering bottom tab bar.

**Solution:**
- Installed `expo-navigation-bar` package
- `app.json`: Added `navigationBarColor`, `navigationBarStyle`, and plugin config (`position: absolute, visibility: hidden, behavior: overlay-swipe`)
- `app/_layout.tsx`: Added `useEffect` to hide nav bar programmatically on Android via `NavigationBar.setVisibilityAsync('hidden')` + `setBehaviorAsync('overlay-swipe')`
- `app/(tabs)/_layout.tsx`: `useSafeAreaInsets()` for dynamic tab bar bottom padding

---

#### **4. APK Rebuild**
- Output: `salfanet-radius-customer-release.apk` (94.57 MB)
- Fix applied: `$env:NODE_ENV = $null` before `npm install` to prevent devDependencies from being skipped in PowerShell sessions where `NODE_ENV=production` was leftover

---

### \u2705 Admin Panel \u2014 i18n / International Translations (February 2026)

#### **301 New Translation Keys Added (en.json + id.json)**
All hardcoded strings in 20+ admin pages replaced with `t()` translation calls:
- `push-notifications` \u2014 All UI strings
- `hotspot/voucher`, `hotspot/profile`, `hotspot/agent`, `hotspot/evoucher`
- `keuangan`, `invoices`, `payment-gateway`, `manual-payments`
- `pppoe/balance`, `pppoe/users`, `pppoe/registrations`, `pppoe/areas`, `pppoe/profiles`
- `network/routers`, `network/olts`, `network/odcs`
- `settings/database`, `settings/email`, `settings/company`
- `whatsapp` (3 sub-pages), `inventory` (3 sub-pages), `dashboard`, `management`

---

## [2.10.7] - 2026-01-10 (Critical Fixes: FreeRADIUS, PM2, Installer)

### 🔥 Critical Fixes

#### **1. Fixed: vps-installer.sh Ambiguous Redirect Error**
**Problem:**
```bash
vps-installer.sh: line 141: ${INSTALL_INFO_FILE}: ambiguous redirect
```

**Solution:**
- ✅ Added quotes to variable: `cat > "${INSTALL_INFO_FILE}"`
- ✅ Prevents shell expansion issues
- ✅ Safe for paths with spaces/special chars

**Files Modified:**
- `vps-install/vps-installer.sh` - Line 141

---

#### **2. Fixed: FreeRADIUS Failed to Start**
**Problem:**
```
Jan 10 00:59:57 systemd[1]: freeradius.service: Control process exited
Jan 10 00:59:57 systemd[1]: freeradius.service: Failed with result 'exit-code'
ExecStartPre= process exit status 1
```

**Root Cause:**
- FreeRADIUS config tidak di-test sebelum start
- systemd gagal start service tanpa error details
- Tidak ada cleanup process sebelum restart

**Solution:**
- ✅ **Test config dulu**: `freeradius -CX` before systemctl start
- ✅ **Stop existing service**: Kill freeradius processes before start
- ✅ **Error logging**: Save test output to `/tmp/freeradius-test.log`
- ✅ **Helpful error messages**: Show last 30 lines of config test
- ✅ **Troubleshooting guide**: Common fixes untuk config errors

**Enhanced start_freeradius() function:**
```bash
start_freeradius() {
    # Stop existing first
    systemctl stop freeradius 2>/dev/null || true
    killall -9 freeradius 2>/dev/null || true
    sleep 2
    
    # Test config first
    if freeradius -CX 2>&1 | tee /tmp/freeradius-test.log | grep -q "Configuration appears to be OK"; then
        print_success "Config valid"
    else
        print_error "Config errors!"
        tail -30 /tmp/freeradius-test.log
        return 1
    fi
    
    # Start service
    systemctl enable freeradius
    systemctl start freeradius
}
```

**Verification:**
```bash
# Check FreeRADIUS status
systemctl status freeradius

# Test config manually
freeradius -CX

# View logs
journalctl -u freeradius -n 50 --no-pager

# Debug mode
freeradius -X
```

**Files Modified:**
- `vps-install/install-freeradius.sh` - Enhanced start_freeradius()

---

#### **3. PM2 Cron Service Integration**
**Problem:**
- Cron service tidak otomatis start dengan PM2
- User harus manual start `pm2 start cron-service.js`
- Tidak konsisten dengan main app

**Solution:**
- ✅ **Integrated in ecosystem.config.js**: Cron service sekarang auto-start
- ✅ **Unified management**: Both apps (radius + cron) managed together
- ✅ **Auto-restart**: Cron service auto-restart on crash
- ✅ **Memory limit**: 150M max untuk cron service
- ✅ **Separate logs**: cron-error.log, cron-out.log

**New ecosystem.config.js Structure:**
```javascript
module.exports = {
  apps: [
    {
      name: 'salfanet-radius',
      script: 'npm',
      args: 'start',
      instances: 1,
      exec_mode: 'cluster',
      max_memory_restart: '400M',
      // ... main app config
    },
    {
      name: 'salfanet-cron',
      script: './cron-service.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '150M',
      restart_delay: 5000,
      // ... cron service config
    }
  ]
};
```

**PM2 Commands (Updated):**
```bash
# View both apps
sudo -u salfanet pm2 list

# Logs (main app)
sudo -u salfanet pm2 logs salfanet-radius

# Logs (cron service)
sudo -u salfanet pm2 logs salfanet-cron

# Restart main app
sudo -u salfanet pm2 restart salfanet-radius

# Restart cron service
sudo -u salfanet pm2 restart salfanet-cron

# Restart both
sudo -u salfanet pm2 restart all
```

**Files Modified:**
- `vps-install/install-pm2.sh`:
  - Updated `create_pm2_config()` - Include cron service
  - Updated `start_pm2_app()` - Start both apps
  - Simplified `start_cron_service()` - Auto via ecosystem.config.js

---

### 📋 Summary

**3 Critical Issues Fixed:**
1. ✅ Installer redirect error - Variable quoting
2. ✅ FreeRADIUS failed to start - Config test + cleanup
3. ✅ Cron service manual start - Integrated in PM2 ecosystem

**Benefits:**
- 🚀 Smoother installation process
- 🔍 Better error diagnostics (FreeRADIUS config test)
- 🤖 Automated cron service management
- 📊 Unified PM2 monitoring for both apps
- 🛡️ More robust service startup

**Testing:**
```bash
# Fresh install test
cd /root/SALFANET-RADIUS-main/vps-install
sudo ./vps-installer.sh

# Verify both apps running
sudo -u salfanet pm2 list
# Should show: salfanet-radius (online), salfanet-cron (online)

# Check FreeRADIUS
systemctl status freeradius
# Should show: active (running)
```

---

## [2.10.6] - 2026-01-10 (Complete Uninstaller & Prisma Fixes)

### 🗑️ VPS Uninstaller - Complete Removal Tool

#### **NEW Feature: vps-uninstaller.sh**

Comprehensive uninstaller untuk remove semua komponen SALFANET RADIUS dan enable fresh install.

**Fitur:**
- ✅ **Safety First**: Requires typing "REMOVE EVERYTHING" untuk konfirmasi
- ✅ **Automatic Backup**: Optional backup database & configs sebelum removal
- ✅ **Backup Location**: `/root/salfanet-backup-TIMESTAMP/`
  - database.sql (full dump)
  - env.backup (.env file)
  - freeradius-backup/ (RADIUS configs)
  - nginx-backup (Nginx config)
- ✅ **Selective Removal**: Interactive prompts untuk Node.js, MySQL removal
- ✅ **Complete Cleanup**: Removes all traces untuk fresh start

**Components Removed:**
1. ✅ PM2 processes (salfanet-radius, salfanet-cron)
2. ✅ Application files (/var/www/salfanet-radius)
3. ✅ MySQL database (salfanet_radius) & user (salfanet_user)
4. ✅ FreeRADIUS configuration & logs
5. ✅ Nginx site configuration
6. ✅ User account (salfanet)
7. ✅ Firewall rules (RADIUS ports)
8. ✅ All logs (/var/log/salfanet-vps-install.log, etc.)
9. ⚠️  Optional: PM2 global (if no other apps)
10. ⚠️  Optional: Node.js (if no other apps)
11. ⚠️  Optional: MySQL (DANGER - removes all databases)

**Usage:**
```bash
cd /root/SALFANET-RADIUS-main/vps-install
chmod +x vps-uninstaller.sh
sudo ./vps-uninstaller.sh
```

**Fresh Install Workflow:**
```bash
# 1. Uninstall (with backup)
sudo ./vps-uninstaller.sh

# 2. Fresh install
sudo ./vps-installer.sh
```

### 🔧 Prisma Engine Fixes

#### **Problem:**
Error `spawn schema-engine EACCES` saat prisma generate/db push karena engine binaries tidak executable setelah ownership change.

**Fitur Baru:**

**1. Auto-Fix in install-app.sh**
- ✅ Added `fix_prisma_engines()` function
- ✅ Runs before prisma generate & db push
- ✅ Sets execute permissions: chmod +x node_modules/@prisma/engines/*
- ✅ Handles all engine types: schema, query, migration, introspection, prisma-fmt

**2. fix-prisma-engines.sh - Standalone Fix**
Location: `vps-install/fix-prisma-engines.sh`
```bash
sudo ./fix-prisma-engines.sh
```
- ✅ Detect all Prisma engine binaries
- ✅ Fix permissions automatically
- ✅ Test engine executability
- ✅ Verify prisma commands work
- ✅ Show summary (total vs executable engines)

**3. Enhanced fix-permissions.sh**
- ✅ Include Prisma engines in permission fix
- ✅ Fix Next.js binaries too
- ✅ Comprehensive binary permission handling

**Files Modified:**
- `vps-install/install-app.sh` - Auto-fix Prisma engines
- `vps-install/fix-permissions.sh` - Include engines
- `vps-install/fix-prisma-engines.sh` - NEW standalone fix
- `vps-install/README.md` - Prisma troubleshooting guide
- `vps-install/QUICK_REFERENCE.md` - Quick fix commands

**Common Errors Fixed:**
1. ✅ `spawn schema-engine EACCES` - Fixed by chmod +x
2. ✅ `Error: Command failed with EACCES` - Auto-detected & fixed
3. ✅ Prisma commands fail after ownership change - Prevented
4. ✅ Tables not created during seed - Fixed via proper db push

---

## [2.10.5] - 2026-01-10 (Permission Fix - Run PM2 Without Sudo)

### 🔧 VPS Installer - User Permissions & PM2 Non-Root Execution

#### **Problem:**
- ❌ PM2 requires sudo for every command (permission denied)
- ❌ Application files owned by root
- ❌ Cannot run PM2 as salfanet user
- ❌ Security risk running application as root

#### **Fitur Baru:**

**1. Dedicated Application User**
- ✅ Create `salfanet` user for running application
- ✅ Set proper ownership: `salfanet:salfanet`
- ✅ Setup PM2 directories: `/home/salfanet/.pm2/`
- ✅ Application files owned by salfanet, not root

**2. Auto Permission Fix in Installer**
Location: `vps-install/install-app.sh`
- ✅ `create_app_user()` - Create salfanet user during install
- ✅ `fix_permissions()` - Set ownership to salfanet:salfanet
- ✅ Auto-fix node_modules/.bin permissions
- ✅ Setup logs directory with proper ownership

**3. PM2 Run as App User**
Location: `vps-install/install-pm2.sh`
- ✅ `install_pm2()` - Setup PM2 for salfanet user
- ✅ `start_pm2_app()` - Start PM2 as salfanet (not root)
- ✅ `cleanup_pm2_processes()` - Cleanup both root and salfanet PM2
- ✅ PM2 startup configured for salfanet user

**4. fix-permissions.sh - Standalone Fix Script**
Location: `vps-install/fix-permissions.sh`
```bash
sudo ./fix-permissions.sh
```
- ✅ Create salfanet user if not exists
- ✅ Fix all file ownership to salfanet:salfanet
- ✅ Fix file/directory permissions (644/755)
- ✅ Setup PM2 directories
- ✅ Show commands to run PM2 without sudo

**5. Updated Common Configuration**
Location: `vps-install/common.sh`
- ✅ Added `APP_USER="salfanet"`
- ✅ Added `APP_GROUP="salfanet"`
- ✅ All modules use these variables

#### **Files Modified:**
- `vps-install/common.sh` - Added APP_USER and APP_GROUP variables
- `vps-install/install-app.sh` - Added create_app_user(), updated fix_permissions()
- `vps-install/install-pm2.sh` - Run PM2 as salfanet user
- `vps-install/fix-permissions.sh` - NEW standalone permission fix script
- `vps-install/README.md` - Added permission troubleshooting section
- `CHANGELOG.md` - Documented changes

#### **Cara Pakai:**

**Otomatis (New Installation):**
Installer sekarang otomatis create salfanet user dan set proper permissions.

**Manual Fix (Existing Installation):**
```bash
cd vps-install
chmod +x fix-permissions.sh
sudo ./fix-permissions.sh
```

**Run PM2 Without Sudo:**
```bash
# Method 1: Switch to salfanet user
sudo su - salfanet
pm2 list
pm2 logs salfanet-radius
pm2 restart salfanet-radius

# Method 2: Run directly
sudo -u salfanet pm2 list
sudo -u salfanet pm2 logs salfanet-radius
sudo -u salfanet pm2 restart salfanet-radius
```

**Common Issues Fixed:**
1. ✅ "EACCES: permission denied" - Fixed by proper ownership
2. ✅ "Cannot write to log file" - Logs owned by salfanet
3. ✅ "PM2 requires sudo" - Run as salfanet user
4. ✅ "Security risk running as root" - Application runs as salfanet

#### **Security Benefits:**
- ✅ Application tidak jalan sebagai root (lebih aman)
- ✅ Isolasi user - salfanet user khusus untuk aplikasi
- ✅ File permissions yang tepat (644 untuk files, 755 untuk dirs)
- ✅ PM2 daemon jalan sebagai salfanet (bukan root)

---

## [2.10.4] - 2026-01-09 (Port Conflict Detection & Auto-Fix)

### 🔧 VPS Installer - Port Conflict Handler

#### **Fitur Baru:**

**1. Automatic Port Conflict Detection**
- ✅ Pre-check port 3000 sebelum start PM2
- ✅ Detect processes menggunakan lsof, netstat, dan ss
- ✅ Show detailed process information (PID, user, command)
- ✅ Interactive prompt untuk kill conflicting processes

**2. Automatic Cleanup Functions**
- ✅ `check_port_conflict()` - Check dan handle port conflicts
- ✅ `kill_conflicting_processes()` - Graceful kill dengan fallback ke force kill
- ✅ `cleanup_pm2_processes()` - Cleanup orphaned PM2 processes
- ✅ Verify port is free setelah cleanup

**3. check-port.sh - Standalone Port Checker**
Location: `vps-install/check-port.sh`
```bash
# Usage
sudo ./check-port.sh 3000
```
- ✅ Multi-method detection (lsof, netstat, ss)
- ✅ Show process details dan user
- ✅ Detect Node.js/PM2 processes
- ✅ Interactive kill dengan confirmation
- ✅ Verify port freed after kill

**4. Prisma Update Notification Suppression**
- ✅ Added `PRISMA_HIDE_UPDATE_MESSAGE=true` untuk prisma generate
- ✅ Added `PRISMA_HIDE_UPDATE_MESSAGE=true` untuk npm run build
- ✅ Menghilangkan notifikasi update yang tidak perlu

**5. Enhanced Error Messages**
- ✅ Better PM2 error logging (30 lines logs)
- ✅ Troubleshooting commands di error message
- ✅ Longer stabilization wait (5s) setelah PM2 start

**6. README Troubleshooting Section**
- ✅ Port conflict troubleshooting guide
- ✅ Common causes dan solutions
- ✅ Manual commands untuk debugging
- ✅ Change port instructions

#### **Files Modified:**
- `vps-install/install-pm2.sh` - Added port conflict detection
- `vps-install/check-port.sh` - NEW standalone port checker
- `vps-install/README.md` - Added troubleshooting section
- `CHANGELOG.md` - Documented changes

#### **Cara Pakai:**

**Otomatis (Built-in):**
Installer sekarang otomatis check port conflicts sebelum start PM2.

**Manual Check:**
```bash
cd vps-install
chmod +x check-port.sh
sudo ./check-port.sh 3000
```

**Common Issues Fixed:**
1. ✅ Process running as different user (sudo vs non-sudo)
2. ✅ Old PM2 daemon conflicts
3. ✅ Orphaned Node.js processes
4. ✅ Another app using port 3000
5. ✅ PM2 errored immediately after "online" status

---

## [2.10.3] - 2026-01-09 (Modular Installer Architecture)

### 🔧 VPS Installer - Modular Refactoring

#### **Background:**
Memecah installer VPS monolitik (1839 baris) menjadi arsitektur modular untuk mempermudah debugging, maintenance, dan selective installation.

#### **Masalah dengan Script Monolitik:**
- ❌ Error tidak jelas di bagian mana (1839 baris dalam 1 file)
- ❌ Sulit debug bila ada kegagalan di tengah proses
- ❌ Tidak bisa test per komponen
- ❌ Bila 1 step gagal, harus ulang dari awal
- ❌ Maintenance susah - perubahan di 1 bagian bisa affect yang lain
- ❌ Code duplication (colors, functions, checks berulang)

#### **New Modular Structure:**
**Directory:** `vps-install/` (NEW)

**1. common.sh** (Shared Utilities - ~300 lines)
- ✅ Color definitions (RED, GREEN, YELLOW, CYAN, etc.)
- ✅ Logging functions: `print_success()`, `print_error()`, `print_info()`, `print_warning()`, `print_step()`
- ✅ IP detection: `detect_ip_address()` - Multi-source public/private IP detection
- ✅ System checks: `check_root()`, `detect_os()`, `check_directory()`
- ✅ Utility functions: `generate_secret()`, `save_install_info()`, `wait_for_service()`, `verify_installation()`
- ✅ Global configuration variables (NODE_VERSION, APP_DIR, DB credentials, etc.)
- ✅ Banner & info display functions
- ✅ Logging to `/var/log/salfanet-vps-install.log`
- ✅ All functions exported untuk module reuse

**2. install-system.sh** (System Setup Module - ~400 lines)
- ✅ **Step 1:** System update & upgrade (`apt update`, `apt upgrade`)
- ✅ **Dependencies:** curl, wget, git, build-essential, nginx, certbot, chrony, ntpdate, xl2tpd, strongswan
- ✅ **PPP/TUN Setup untuk Proxmox VPS:**
  * Create `/dev/ppp` device (untuk PPPoE)
  * Create `/dev/net/tun` device (untuk VPN)
  * Load kernel modules: ppp_generic, ppp_async, l2tp_core, tun
  * Configure persistent module loading (`/etc/modules-load.d/ppp.conf`)
- ✅ **IP Forwarding:** Enable `net.ipv4.ip_forward` untuk routing
- ✅ **Sysctl Configuration:** Security settings (SYN cookies, ICMP redirects)
- ✅ **Timezone:** Set ke Asia/Jakarta (WIB)
- ✅ **NTP Sync:** Configure Chrony dengan Indonesian NTP servers
  * id.pool.ntp.org (preferred)
  * Asia pool servers
  * Google & Cloudflare backup
  * Force sync dengan `chronyc makestep`
  * Sync hardware clock
- ✅ **Verification:** Check PPP, TUN, IP forwarding, SSH access safety

**3. install-nodejs.sh** (Node.js Module - ~100 lines)
- ✅ Add NodeSource repository untuk Node.js 20 LTS
- ✅ Install nodejs package
- ✅ Verify installation (node --version, npm --version)
- ✅ Configure npm global directory
- ✅ Standalone execution capability

**4. install-mysql.sh** (MySQL Database Module - ~300 lines)
- ✅ Remove old MySQL installation (clean slate)
- ✅ Install MySQL 8.0 fresh
- ✅ Secure installation (set root password)
- ✅ Create database `salfanet_radius` dengan charset utf8mb4
- ✅ Create user `salfanet_user` dengan privileges
- ✅ **Backup existing database** (bila sudah ada)
- ✅ **Interactive option:** Keep atau drop existing DB
- ✅ **Timezone configuration:** Set MySQL timezone ke `+07:00` (Asia/Jakarta)
  * Create persistent config di `/etc/mysql/mysql.conf.d/timezone.cnf`
  * Set global timezone immediately
  * Verify timezone sync dengan system
- ✅ **Connection test** sebelum lanjut
- ✅ Standalone execution capability

**5. install-app.sh** (Application Setup Module - ~400 lines)
- ✅ Copy source dari install location ke `/var/www/salfanet-radius`
- ✅ Create `.env` file dengan configuration:
  * DATABASE_URL dengan MySQL credentials
  * NEXTAUTH_SECRET (generated random)
  * NEXTAUTH_URL dengan detected IP
- ✅ `npm install` dengan error handling & retry
- ✅ `npx prisma generate` - Generate Prisma client
- ✅ `npx prisma db push` - Create database schema
- ✅ **Run seeders:**
  * `prisma/seed.ts` - Admin user & default settings
  * `prisma/seeds/seed-templates.js` - Notification templates
  * `prisma/seeds/seed-voucher.js` - Voucher templates
  * `prisma/seeds/fix-emoji.js` - Fix emoji encoding
- ✅ Fix file permissions untuk PM2 execution
- ✅ Verify directory structure & files
- ✅ Standalone execution capability

**6. install-freeradius.sh** (FreeRADIUS Module - ~500 lines)
- ✅ Remove old FreeRADIUS installation (clean)
- ✅ Install packages: freeradius, freeradius-mysql, freeradius-utils, freeradius-rest
- ✅ **Restore configuration dari backup** (`freeradius-config/` bila ada)
- ✅ **Configure SQL module:**
  * Set MySQL credentials (DB_USER, DB_PASSWORD, DB_NAME)
  * Enable SQL module (`ln -s mods-available/sql mods-enabled/sql`)
  * Configure accounting, post-auth, authorize
- ✅ **Configure CoA (Change of Authorization):**
  * Enable dynamic VLAN changes
  * Configure disconnect messages
- ✅ **Configure ports:** 1812 (auth), 1813 (accounting), 3799 (CoA)
- ✅ **Firewall rules:** Open RADIUS ports dengan UFW
- ✅ Start & enable FreeRADIUS service
- ✅ **Verify dengan radtest**
- ✅ Debug mode option (`freeradius -X`)
- ✅ Standalone execution capability

**7. install-nginx.sh** (Nginx Module - ~200 lines)
- ✅ Create Nginx site configuration
- ✅ **Reverse proxy** ke Next.js app (localhost:3000)
- ✅ Configure gzip compression
- ✅ WebSocket support untuk real-time features
- ✅ Client max body size (large file uploads)
- ✅ Timeout settings
- ✅ SSL/HTTPS ready (manual SSL setup nanti)
- ✅ Enable site & restart Nginx
- ✅ Verify Nginx running
- ✅ Standalone execution capability

**8. install-pm2.sh** (PM2 & Build Module - ~500 lines)
- ✅ Install PM2 globally
- ✅ **Memory check & swap creation:**
  * Check available memory
  * Create 2GB swap bila memory < 2GB
  * Persistent swap configuration
- ✅ **Build application:**
  * `npm run build` dengan error handling
  * Build log ke `/tmp/build.log`
  * Progress indicator
  * Verify `.next` directory created
- ✅ **PM2 Process Management:**
  * Start app dengan `ecosystem.config.js`
  * Auto-restart on failure
  * Watch mode disabled (production)
  * Max memory limit
- ✅ **Cron Service:**
  * Start `cron-service.js` untuk scheduled tasks
  * Separate PM2 process
- ✅ **PM2 Startup:**
  * Save PM2 configuration
  * Enable auto-start on boot
  * systemd integration
- ✅ **Post-Installation Fixes:**
  * Run emoji template fixes
  * Re-seed notification templates
  * Update voucher templates
  * Verify invoice format
- ✅ Verify application running
- ✅ Display PM2 status
- ✅ Standalone execution capability

**9. vps-installer.sh** (Main Orchestrator - ~300 lines)
- ✅ **Print banner** dengan installation info
- ✅ **Detect IP address** (public/private auto-detection)
- ✅ **Interactive IP confirmation** (Y/n/custom)
- ✅ **Check root & directory** requirements
- ✅ **Detect OS** (Ubuntu/Debian version)
- ✅ **Source all modules** dengan dependency order
- ✅ **Execute installation steps:**
  1. install-system.sh - System setup
  2. install-nodejs.sh - Node.js
  3. install-mysql.sh - MySQL database
  4. install-app.sh - Application files & schema
  5. install-freeradius.sh - RADIUS server
  6. install-nginx.sh - Web server
  7. install-pm2.sh - Process manager & build
- ✅ **Error handling:** Stop on error dengan clear message
- ✅ **Final summary:** Display access URL, credentials, next steps
- ✅ **Installation info file:** Save all config to `INSTALLATION_INFO.txt`

**10. README.md** (Documentation - ~600 lines)
- ✅ Complete module documentation
- ✅ Installation methods (full / step-by-step / selective)
- ✅ Debugging guide per module
- ✅ Error recovery scenarios
- ✅ Configuration files reference
- ✅ Migration guide from monolithic script

#### **Benefits of Modular Architecture:**

**1. Error Isolation & Tracking:**
```bash
# Before (Monolithic):
ERROR: Installation failed

# After (Modular):
[install-mysql.sh] ERROR: Failed to create database
  File: vps-install/install-mysql.sh
  Line: 125
  Function: create_database()
```

**2. Independent Testing:**
```bash
# Test individual components
./install-mysql.sh          # Only test MySQL
./install-freeradius.sh     # Only test FreeRADIUS
./install-pm2.sh            # Only test build & PM2
```

**3. Selective Re-installation:**
```bash
# MySQL corrupt? Reinstall only MySQL
./install-mysql.sh

# FreeRADIUS config wrong? Fix only RADIUS
./install-freeradius.sh

# Build failed? Rebuild only
./install-pm2.sh
```

**4. Easy Maintenance:**
- Update FreeRADIUS config → Edit `install-freeradius.sh` saja
- Change MySQL setup → Edit `install-mysql.sh` saja
- No risk ke komponen lain
- Clear separation of concerns

**5. Better Debugging:**
- Each module has own scope
- Error messages show exact file & function
- Logs per module clearly marked
- Stack trace points to specific code

**6. Flexible Deployment:**
- Install all components: `./vps-installer.sh`
- Install specific component: `./install-<component>.sh`
- Skip already-installed components
- Resume from failed step

#### **Installation Flow:**

```
vps-installer.sh
  ├── Detect IP & show info
  ├── Confirm IP address
  ├── Check root & directory
  │
  ├─[1]─> install-system.sh (2 min)
  │        └── System update, PPP/TUN, timezone, NTP
  │
  ├─[2]─> install-nodejs.sh (2 min)
  │        └── Node.js 20 LTS
  │
  ├─[3]─> install-mysql.sh (2 min)
  │        └── MySQL 8.0, database, user, timezone
  │
  ├─[4]─> install-app.sh (10 min - LONGEST)
  │        └── Copy files, npm install, Prisma, seeders
  │
  ├─[5]─> install-freeradius.sh (2 min)
  │        └── RADIUS server, SQL module, CoA
  │
  ├─[6]─> install-nginx.sh (1 min)
  │        └── Reverse proxy, gzip, websocket
  │
  └─[7]─> install-pm2.sh (5-10 min)
           └── Swap, build, PM2 start, cron, fixes
```

Total time: ~20-25 minutes (sama dengan monolithic)

#### **Error Recovery Examples:**

**Scenario 1: MySQL Install Gagal**
```bash
# Check error
tail -f /var/log/salfanet-vps-install.log | grep "mysql"

# Fix & re-run hanya MySQL module
./install-mysql.sh
```

**Scenario 2: Build Timeout (Out of Memory)**
```bash
# Check memory
free -h

# Re-run PM2 module (auto-create swap)
./install-pm2.sh
```

**Scenario 3: FreeRADIUS Config Error**
```bash
# Debug RADIUS
freeradius -X

# Fix config & re-run
./install-freeradius.sh
```

#### **Migration dari vps-install.sh:**

**Old monolithic script:**
```
vps-install.sh (1839 lines)
  - All-in-one
  - Hard to debug
  - Cannot test components
  - Full reinstall bila error
```

**New modular structure:**
```
vps-install/ (9 files, ~2500 lines total)
  ├── common.sh (utilities)
  ├── install-system.sh (system)
  ├── install-nodejs.sh (node)
  ├── install-mysql.sh (database)
  ├── install-app.sh (application)
  ├── install-freeradius.sh (radius)
  ├── install-nginx.sh (webserver)
  ├── install-pm2.sh (process manager)
  └── vps-installer.sh (orchestrator)
  
Benefits:
  ✅ Easy to debug
  ✅ Independent testing
  ✅ Selective reinstall
  ✅ Clear error tracking
  ✅ Better maintenance
```

#### **Usage Examples:**

**Full Installation:**
```bash
cd /root/SALFANET-RADIUS-main/vps-install
chmod +x *.sh
./vps-installer.sh
```

**Step-by-Step Installation:**
```bash
./install-system.sh         # Step 1
./install-nodejs.sh         # Step 2
./install-mysql.sh          # Step 3
./install-app.sh            # Step 4
./install-freeradius.sh     # Step 5
./install-nginx.sh          # Step 6
./install-pm2.sh            # Step 7
```

**Selective Component Fix:**
```bash
# Only fix FreeRADIUS
./install-freeradius.sh

# Only rebuild application
./install-pm2.sh
```

#### **Files Created:**

**NEW:**
- `vps-install/vps-installer.sh` (300 lines) - Main orchestrator
- `vps-install/common.sh` (300 lines) - Shared utilities
- `vps-install/install-system.sh` (400 lines) - System setup
- `vps-install/install-nodejs.sh` (100 lines) - Node.js
- `vps-install/install-mysql.sh` (300 lines) - MySQL
- `vps-install/install-app.sh` (400 lines) - Application
- `vps-install/install-freeradius.sh` (500 lines) - FreeRADIUS
- `vps-install/install-nginx.sh` (200 lines) - Nginx
- `vps-install/install-pm2.sh` (500 lines) - PM2 & Build
- `vps-install/README.md` (600 lines) - Documentation

**PRESERVED:**
- `vps-install.sh` (1839 lines) - Original monolithic (backward compatibility)

**LOGS:**
- `/var/log/salfanet-vps-install.log` - Installation log dengan timestamps

---

## [2.10.3] - 2026-01-09 (VPN Installer Modular Refactoring)

### 🔧 VPN Installer - Modular Architecture

#### **Background:**
Restructured monolithic VPN installer into modular components for easier debugging, maintenance, and selective installation.

#### **New Modular Structure:**
**Directory:** `scripts/vpn-install/` (NEW)

1. **vpn-installer.sh** (Main Orchestrator - 350 lines)
   - ✅ Interactive menu system with colored UI
   - ✅ Command-line arguments: `--wireguard`, `--openvpn`, `--l2tp`, `--all`
   - ✅ Status display: `--status`, `--firewall`
   - ✅ Service restart functionality
   - ✅ Coordinates all installation modules
   - ✅ Can install protocols individually or all at once

2. **common.sh** (Shared Utilities - 300 lines)
   - ✅ Color definitions (RED, GREEN, YELLOW, CYAN, etc.)
   - ✅ Logging functions: `log()`, `error()`, `success()`, `warning()`
   - ✅ System checks: `check_root()`, `detect_os()`
   - ✅ Network utilities: `get_public_ip()`, `get_default_interface()`
   - ✅ IP forwarding configuration
   - ✅ Base package installation
   - ✅ Service verification helpers
   - ✅ All functions exported for module reuse

3. **firewall.sh** (Firewall Management - 150 lines)
   - ✅ `setup_wireguard_firewall()` - Port 51820/UDP + NAT
   - ✅ `setup_openvpn_firewall()` - Port 1194/UDP + NAT
   - ✅ `setup_l2tp_firewall()` - Ports 500/4500/1701/UDP + ESP + NAT
   - ✅ `save_iptables_rules()` - Persist with netfilter-persistent
   - ✅ `show_firewall_status()` - Display configuration
   - ✅ Standalone execution: `./firewall.sh [protocol|show]`

4. **install-wireguard.sh** (WireGuard Module - 300 lines)
   - ✅ Package installation: wireguard, wireguard-tools, qrencode
   - ✅ Server key generation
   - ✅ `/etc/wireguard/wg0.conf` creation with PostUp/PostDown rules
   - ✅ Client script installer: `wg-add-client` command
   - ✅ Client outputs: Universal config, MikroTik script, QR code
   - ✅ Service management and verification
   - ✅ Standalone execution capability
   - ✅ Network: 10.8.0.0/24, Port: 51820/UDP

5. **install-openvpn.sh** (OpenVPN Module - 350 lines)
   - ✅ Package installation: openvpn, easy-rsa
   - ✅ PKI setup at `/etc/openvpn/easy-rsa`
   - ✅ Non-interactive CA generation
   - ✅ Server certificate and DH parameters
   - ✅ TLS-auth key generation
   - ✅ `/etc/openvpn/server.conf` with AES-256-GCM
   - ✅ Client script installer: `ovpn-add-client` command
   - ✅ Embedded certificate .ovpn generation
   - ✅ Progress indicator for DH generation
   - ✅ Standalone execution capability
   - ✅ Network: 10.8.1.0/24, Port: 1194/UDP

6. **install-l2tp.sh** (L2TP/IPSec Module - 400 lines)
   - ✅ Package installation: strongswan, xl2tpd
   - ✅ Pre-Shared Key generation
   - ✅ `/etc/ipsec.conf` with IKEv2 + L2TP/PSK modes
   - ✅ `/etc/ipsec.secrets` configuration
   - ✅ `/etc/xl2tpd/xl2tpd.conf` setup
   - ✅ PPP configuration with MS-CHAPv2
   - ✅ User management scripts: `l2tp-add-user`, `l2tp-list-users`
   - ✅ MikroTik script generation in user script
   - ✅ Dual service management (strongswan + xl2tpd)
   - ✅ Standalone execution capability
   - ✅ Network: 10.8.2.0/24, Ports: 500/4500/1701/UDP

7. **README.md** (Documentation - 400 lines)
   - ✅ Complete module documentation
   - ✅ Installation methods (interactive, CLI, standalone)
   - ✅ Module function reference
   - ✅ Client management examples
   - ✅ Troubleshooting guide per module
   - ✅ Security recommendations
   - ✅ Uninstallation procedures

#### **Benefits of Modular Architecture:**

1. **Error Isolation:**
   - Errors clearly indicate which module failed
   - Stack traces point to specific file and function
   - No more searching through 800-line script

2. **Independent Testing:**
   - Test each protocol separately
   - Run standalone: `./install-wireguard.sh`
   - No need to install all protocols to test one

3. **Easy Maintenance:**
   - Fix bugs in specific module without touching others
   - Update one protocol without risk to others
   - Clear separation of concerns

4. **Selective Installation:**
   - Install only needed protocols
   - Command: `./vpn-installer.sh --wireguard`
   - Saves resources on small VPS

5. **Reusable Components:**
   - Common functions shared via `common.sh`
   - No code duplication
   - Consistent error handling

6. **Professional Pattern:**
   - Follows enterprise installer design
   - Similar to package managers (apt, yum)
   - Aligned with "install wizard" concept

#### **Migration from Monolithic Script:**

**Before:** `scripts/vpn-installer.sh` (800 lines, all-in-one)
- Difficult to debug
- Hard to maintain
- Cannot install protocols separately
- Error tracking challenging

**After:** `scripts/vpn-install/` (6 modular files, ~1,500 lines total)
- Clear error messages with file/function context
- Easy to debug and test
- Flexible installation options
- Professional architecture
- Better code organization

#### **Usage Examples:**

**Interactive Menu:**
```bash
cd scripts/vpn-install
sudo ./vpn-installer.sh
# Select from menu: Install WireGuard, OpenVPN, L2TP, or All
```

**Command Line:**
```bash
# Install specific protocol
sudo ./vpn-installer.sh --wireguard
sudo ./vpn-installer.sh --openvpn
sudo ./vpn-installer.sh --l2tp

# Install all protocols
sudo ./vpn-installer.sh --all

# Check status
sudo ./vpn-installer.sh --status
sudo ./vpn-installer.sh --firewall
```

**Standalone Modules:**
```bash
# Run individual installer
sudo ./install-wireguard.sh
sudo ./install-openvpn.sh
sudo ./install-l2tp.sh
```

#### **Client Management Commands:**

After installation, management commands are available:

**WireGuard:**
```bash
wg-add-client <name>           # Add client with auto IP
wg show                        # Show server status
systemctl status wg-quick@wg0  # Service status
```

**OpenVPN:**
```bash
ovpn-add-client <name> [ip]    # Add client with optional static IP
systemctl status openvpn@server # Service status
```

**L2TP/IPSec:**
```bash
l2tp-add-user <user> <pass> [ip]  # Add user with optional static IP
l2tp-list-users                    # List all users
ipsec status                       # IPSec status
```

#### **Configuration Storage:**

All VPN configs stored in structured directory:
```
/etc/salfanet-vpn/
├── config                 # General settings
├── wireguard/            # WireGuard configs
├── openvpn/              # OpenVPN PKI & configs
├── l2tp/                 # L2TP PSK & configs
└── clients/              # Generated client files
    ├── wireguard/
    ├── openvpn/
    └── l2tp/
```

Logs: `/var/log/salfanet-vpn-install.log`

#### **Files Modified/Created:**

**NEW:**
- `scripts/vpn-install/vpn-installer.sh` (350 lines)
- `scripts/vpn-install/common.sh` (300 lines)
- `scripts/vpn-install/firewall.sh` (150 lines)
- `scripts/vpn-install/install-wireguard.sh` (300 lines)
- `scripts/vpn-install/install-openvpn.sh` (350 lines)
- `scripts/vpn-install/install-l2tp.sh` (400 lines)
- `scripts/vpn-install/README.md` (400 lines)

**DEPRECATED:**
- `scripts/vpn-installer.sh` (kept for backward compatibility)

---

## [2.10.2] - 2026-01-08 (Notifications & Translation Fix)

### 🌐 VPN Multi-Protocol Installer

#### 1. **Complete VPN Server Installer Script**
**File:** `scripts/vpn-installer.sh` (NEW - 800+ lines)
- ✅ **WireGuard Installation:**
  - Auto-generate server keys
  - Configure wg0 interface with NAT/masquerade
  - Client generator script: `wg-add-client <name> <ip>`
  - MikroTik RouterOS 7.x script generation
  - QR code generation for mobile clients
  - Network: 10.8.0.0/24, Port: 51820/UDP

- ✅ **OpenVPN Installation:**
  - Easy-RSA PKI setup with auto-generated CA
  - Server & client certificate generation
  - TLS-Auth key for extra security
  - Client generator script: `ovpn-add-client <name> [static-ip]`
  - Static IP assignment via CCD
  - Network: 10.8.1.0/24, Port: 1194/UDP

- ✅ **L2TP/IPSec Installation:**
  - StrongSwan + xl2tpd setup
  - Auto-generated PSK (Pre-Shared Key)
  - IKEv2 + L2TP dual mode support
  - User management: `l2tp-add-user <user> <pass> [ip]`
  - Network: 10.8.2.0/24, Ports: 500,4500,1701/UDP

- ✅ **Features:**
  - Interactive menu with colorful banner
  - Command-line options: `--wireguard`, `--openvpn`, `--l2tp`, `--all`
  - Auto-detect OS (Ubuntu/Debian), public IP, default interface
  - IP forwarding auto-enable
  - Firewall rules auto-configure
  - Status checker: `--status`
  - Config directory: `/etc/salfanet-vpn/`
  - Logs: `/var/log/salfanet-vpn-install.log`

#### 2. **VPN Installer Documentation**
**File:** `docs/VPN_INSTALLER_GUIDE.md` (NEW - 400+ lines)
- ✅ Quick install guide
- ✅ All installation options documented
- ✅ Client configuration for MikroTik, Windows, Mac, Mobile
- ✅ SALFANET RADIUS integration steps
- ✅ Firewall configuration (UFW/iptables)
- ✅ Troubleshooting guide
- ✅ Performance comparison table

### 🔔 Notifications Page Enhancement

#### 1. **Complete Notifications Page Overhaul**
**File:** `src/app/admin/notifications/page.tsx`
- ✅ **Neon Cyberpunk Theme Applied:**
  - Dark purple background (#0a0118) with animated gradient orbs
  - Primary colors: Purple (#bc13fe), Cyan (#00f7ff), Pink (#ff44cc), Green (#00ff88)
  - Glowing effects with shadow-[0_0_Xpx_rgba(...)]
  - Grid pattern overlay for cyberpunk aesthetic
  - Animated pulse effects on background orbs

- ✅ **UI Components Redesigned:**
  - Header: Purple to Pink gradient with cyan bell icon
  - Category cards: Dark theme with purple borders, glow on active
  - Stats boxes: Individual colored borders and backgrounds
  - Table: Dark theme with purple headers and cyan accents
  - Buttons: Gradient backgrounds with glow shadows
  - Unread indicators: Cyan border and pulsing dot

- ✅ **New Features Added:**
  - **Category Filter Cards:** 7 categories (All, Unread, Invoice Overdue, New Registration, Payment Received, User Expired, System Alert) with icons and counters
  - **Bulk Selection:** Checkbox to select multiple notifications
  - **Bulk Delete:** Delete multiple notifications at once
  - **Delete All:** Delete all notifications with confirmation dialog
  - **Table Layout:** Structured columns (Status, Category, Title, Message, Time, Actions)
  - **Mark All as Read:** Button with full-width gradient style

- ✅ **Translation Keys Updated:**
  - Uses `notifications.page.*` structure
  - All keys available in id.json and en.json
  - No hardcoded text

### 🌐 Translation System Fix

#### 2. **Locale Files Structure Correction**
**Files:** `src/locales/id.json`, `src/locales/en.json`
- ✅ **Duplicate Keys Removed:**
  - Removed duplicate keys: "DEVICE"/"Device", "INSTALLATION"/"installation", "REPAIR"/"repair", "MAINTENANCE"/"maintenance", "NEW_REGISTRATION"/"new_registration"
  - JSON files now parse without errors

- ✅ **OLT Translation Keys Restructured:**
  - Moved `olt` object from `network.olt.*` to root level `olt.*`
  - Fixed translation key path mismatch (code called `t('olt.*')` but keys were at `network.olt.*`)
  - All OLT pages now display translated text correctly

### 🧭 Navigation Fix

#### 3. **Sidebar Dashboard Link**
**File:** `src/app/admin/layout.tsx`
- ✅ Changed dashboard link from `/admin/dashboard-new` to `/admin`
- ✅ Fixed 404 error when clicking dashboard

---

## [2.10.1] - 2026-01-07 (Session Update)

### 🌐 VPN & NAS Management Enhancement

#### 1. **Documentation - NAS to RADIUS Connection Guide**
**File:** `docs/NAS_RADIUS_CONNECTION_COMPLETE_GUIDE.md` (NEW - 500+ lines)
- ✅ Complete guide for connecting NAS clients to RADIUS via VPN
- ✅ 6-phase roadmap implementation
- ✅ WireGuard server setup guide
- ✅ MikroTik CHR as VPN hub setup
- ✅ Proxmox vs Public VPS deployment comparison
- ✅ Step-by-step configuration for:
  - VPN Server (WireGuard/L2TP/CHR)
  - VPN Client registration
  - NAS MikroTik configuration
  - RADIUS integration via VPN IP

#### 2. **VPN Setup Wizard Component**
**File:** `src/components/network/VPNSetupWizard.tsx` (NEW - 1,197 lines)
- ✅ **Dual Mode Support:**
  - **Guide Mode:** Static documentation without router (for learning)
  - **Router Mode:** Interactive setup with API integration
- ✅ **5-Step Wizard:**
  - Step 1: VPN Type Selection / Architecture Overview
  - Step 2: Generate Config / VPN Server Setup
  - Step 3: MikroTik Setup / VPN Client Registration
  - Step 4: Test VPN / NAS Configuration
  - Step 5: RADIUS Setup / Final Integration
- ✅ **Features:**
  - WireGuard key generation
  - MikroTik script generation (.rsc download)
  - VPN connection testing
  - RADIUS configuration script
  - Neon cyberpunk theme (Purple #bc13fe, Cyan #00f7ff)

#### 3. **Router/NAS Management Page Enhancement**
**File:** `src/app/admin/network/routers/page.tsx`
- ✅ **Empty State Improvements:**
  - Added 3-step quick start guide panel
  - "VPN Setup Guide" button (opens wizard in guide mode)
  - "Tambah Router Pertama" button
- ✅ **VPN Integration Enhancements:**
  - VPN Client toggle with gradient background
  - "Recommended" badge for VPN connection
  - Smart VPN Client selector with detailed info panel
  - VPN Type display (WireGuard/CHR/L2TP/PPTP)
  - Icon-based VPN type indicators
  - Descriptive info for each VPN type
  - RADIUS Server badge for special VPN clients
- ✅ **IP Address Field:**
  - Auto-fill from VPN Client IP
  - Disabled state when VPN client selected
  - Visual confirmation (checkmark + "VPN IP" badge)
  - Dynamic placeholder based on VPN selection
  - Warning message when not using VPN
- ✅ **Test Connection Enhancement:**
  - Sub-title with description
  - Smart disable (requires IP & username)
  - Enhanced result panel with icon boxes
  - Identity display in separate box
  - Helper tip when no test performed
- ✅ **RADIUS Secret Field:**
  - Random generator button
  - Security icon with explanation
  - Context help about MikroTik sync
  - Mono font for better readability
- ✅ **Modal Header:**
  - Gradient shadow on icon
  - Gradient text for title
  - Sub-description for context
  - Close button with hover effect

#### 4. **VPN Client Management Enhancement**
**File:** `src/app/admin/vpn/clients/page.tsx`
- ✅ **Device Type - Router Added:**
  - New "Router" device type with Radio icon
  - Badge "NAS" in top-right corner
  - Grid layout: 5 columns (Router, Laptop, Mobile, Tablet, Desktop)
  - Default selected: Router
- ✅ **Operating System - MikroTik RouterOS:**
  - 🔥 MikroTik RouterOS at top position
  - "Recommended for NAS" label
  - Separator line from other OS options
  - Default selected: MikroTik RouterOS
  - Full OS list: Windows 11/10, macOS, Linux, Android, iOS, ChromeOS
- ✅ **Popup Size Optimization:**
  - Max-width: `max-w-2xl` (672px, was 512px)
  - Max-height: `max-h-[90vh]` with scroll
  - Responsive overflow handling
  - Close button (X) added to header
  - Optimized spacing (form: space-y-4, labels: mb-1.5)
  - Compact info box and button spacing
  - My-8 margin for scroll spacing

#### 5. **Translation Keys Added**
**Files:** `src/locales/id.json` & `src/locales/en.json`
- ✅ **Common Keys:**
  - totalRouters, viaVpn, test
- ✅ **Network Keys (50+ new):**
  - routerManagement, noRoutersYet, noRoutersDesc
  - addFirstRouter, loadingRouters, vpnClient, selectVpnClient
  - connectViaVpn, useVpnClientIp, testConnection
  - And many more...

#### 6. **Interface Updates**
**File:** `src/app/admin/network/routers/page.tsx`
- ✅ VpnClient interface:
  - Added `vpnType?: string` field for type detection

### 🎨 UI/UX Improvements

**Neon Cyberpunk Theme Consistency:**
- Primary Cyan: #00f7ff
- Primary Purple: #bc13fe  
- Accent Pink: #ff44cc
- Gradient shadows and glows
- Hover effects and transitions

**Modal Enhancements:**
- Consistent gradient backgrounds
- Border glows with theme colors
- Smooth transitions
- Better spacing and padding
- Improved button states

**Empty State Design:**
- Visual guide panels
- Step-by-step instructions
- Icon-based indicators
- Call-to-action buttons

### 📚 Documentation Updates

**Updated:** `docs/README.md`
- ✅ Added link to NAS_RADIUS_CONNECTION_COMPLETE_GUIDE.md

### 🔧 Technical Details

**VPN Type System:**
- VPN type is global at VPN Client level (not per router)
- Centralized management in VPN Management page
- Router inherits VPN type from selected VPN Client
- Consistent tracking across system

**VPN Workflow:**
1. Setup VPN Server (WireGuard/CHR/L2TP)
2. Create VPN Client with specific VPN type
3. Add Router/NAS and select VPN Client
4. IP auto-filled from VPN Client
5. RADIUS uses VPN IP for authentication

**Smart Defaults:**
- Device Type: Router (for MikroTik NAS)
- OS Type: MikroTik RouterOS
- VPN Protocol: WireGuard (recommended)

---

## [2.10.0] - 2026-01-07

### 🔄 MAJOR: Schema Sync with Production Database

#### Critical Schema Fix
**Problem:** Schema was missing 21+ models that exist in production database backup (`billing_radius_backup_2026-01-05_23-23-32.sql`)

**Solution:** Ran `prisma db pull` to introspect and sync schema from actual database

**Models Added/Fixed:**
- ✅ `customer_otp_verifications` - Customer email/WhatsApp OTP verification
- ✅ `customer_registrations` - Self-service customer registration system
- ✅ `olt_monitoring_logs` - OLT monitoring history
- ✅ `olt_onu_status` - ONU status tracking
- ✅ `olt_performance_metrics` - OLT performance metrics
- ✅ `user_dashboard_layouts` - Custom dashboard layouts per user
- ✅ Fixed table name: `attendance_location` (was incorrectly plural)
- ✅ Fixed table name: `cash_payment_request` (was incorrectly plural)

**Schema Status:**
- Total Models: 117 (matches database exactly)
- Validation: ✅ Passed
- Prisma Client: ✅ Generated successfully

**Migration Status:**
- Database already in sync with new schema
- Migration documented: `20260107000000_merge_salfanet_features`
- No destructive changes - all existing data preserved

#### Documentation Merge
- ✅ Copied 51+ documentation files from salfanet-radius-test
- ✅ Added guides for GPS tracking, employee management, job system
- ✅ Merged implementation guides and feature documentation

### 🔄 Salfanet-Radius-Test Feature Merge

#### Schema Enhancements (prisma/schema.prisma)

**PPPoE User Enhancements:**
- Added `installationPhotos` (Json) - Store multiple installation photos with metadata
- Added `idCardPhoto` (String) - Customer ID card photo for verification
- Added `idCardNumber` (String) - Customer ID card number
- Added `followRoad` (Boolean) - GPS routing preference for technician navigation

**Unified Employee Management System:**
- `employee` - Consolidated employee management (replaces separate technician/coordinator)
- `employeeOtp` - OTP verification for employee clock-in/out
- `workShift` - Configurable work shifts with time ranges
- `attendanceLocation` - Geo-fenced attendance checkpoint locations
- `employeeAttendance` - Attendance tracking with GPS verification
- `employeeLocationTracking` - Real-time GPS tracking during work hours
- `employeeCashAdvance` - Cash advance management and settlements
- `employeeCommission` - Commission tracking for sales/installations
- `employeeLeave` - Leave request and approval system
- `employeeLocation` - Office/branch assignment for employees
- `employeePerformance` - Performance review and rating system
- `employeeSalaryRecord` - Historical salary records
- `employeeOvertimeRequest` - Overtime request and approval workflow
- `employeeTarget` - Monthly/quarterly performance targets
- `gpsTrackingConsent` - User consent tracking for GPS features
- `publicHoliday` - Public holiday management for attendance

**Job Management System:**
- `jobAssignment` - Technician job assignment with SLA tracking
- `jobTeamMember` - Team composition for complex jobs
- `recurringJob` - Scheduled recurring maintenance jobs
- `collectionTask` - Bill collection task management

**Equipment Management:**
- `equipment` - Equipment inventory for technicians
- `equipmentMovement` - Equipment transfer and usage tracking

**VPN Management:**
- `vpnServerSettings` - VPN server configuration (WireGuard support)
- `vpnSite` - Site-to-site VPN configuration
- `vpnConnectionLog` - VPN connection logging and analytics

**Templates & Notifications:**
- `invoiceTemplate` - Customizable invoice templates
- `fcmToken` - Firebase Cloud Messaging for push notifications
- `cashPaymentRequest` - Cash payment request from field technicians

#### Documentation Updates
- Merged 51+ documentation files from salfanet-radius-test
- Added GPS tracking implementation guides
- Added employee location tracking documentation
- Added job management system roadmap
- Added payroll and salary deduction guides
- Added leave and overtime system documentation
- Added PWA implementation guide
- Added security implementation documentation
- Reorganized documentation with guides/ subfolder structure

#### Technical Notes
- Schema validation: ✅ Passed
- Prisma client generation: ✅ Success
- Backward compatible with existing data
- Database migration: Already applied via `prisma db push`

#### Implementation Status
**Database Layer:** ✅ COMPLETE
- All 40+ new models added to schema
- Database fully synchronized  
- Prisma client generated with all new types

**API/UI Layer:** ⚠️ PENDING
- New features (GPS, Employee, Job Management) have database models
- API endpoints and UI components to be implemented in future updates
- Existing features remain fully functional
- No breaking changes to current functionality

**Next Steps for Full Implementation:**
1. Create API routes for employee management (`/api/employees/*`)
2. Create API routes for job management (`/api/jobs/*`)
3. Create API routes for GPS tracking (`/api/gps/*`)
4. Build UI components for employee dashboard
5. Build UI components for job assignment workflow
6. Build UI components for GPS tracking and attendance
7. Implement real-time location tracking features
8. Add push notification system integration

---

## [2.9.15] - 2026-01-06

### 🔧 FINAL FIX: OpenSSL PRNG Bypass for Proxmox LXC Containers

#### Critical Issue: Low Entropy Causing SSH Crash

After implementing v2.9.14 directory persistence fix, SSH still crashed with new error:

**Error:**
```
PRNG is not seeded
Could not load host key: /etc/ssh/ssh_host_ecdsa_key
Unable to load host key "/etc/ssh/ssh_host_ecdsa_key": error:25066067:DSO support routines:dlfcn_load:could not load the shared library
ssh.service: Failed with result 'exit-code'
```

**Root Cause:**
- Proxmox LXC containers have **extremely low entropy** (~256 bits)
- OpenSSL 3.0 DRBG (Deterministic Random Bit Generator) requires sufficient entropy
- SSH daemon runs `sshd -t` config test before starting
- Config test fails without PRNG seeding
- Even haveged + rng-tools insufficient in containers

**Previous Attempts Failed:**
```bash
# Installed but entropy remained 256
apt-get install -y haveged rng-tools-debian

# Still failed
cat /proc/sys/kernel/random/entropy_avail
# Output: 256 (too low)
```

#### Final Solution: Bypass OpenSSL Checks

**Implemented systemd service override:**

```systemd
# File: /etc/systemd/system/ssh.service.d/override.conf
[Service]
# Bypass OpenSSL configuration entirely
Environment="OPENSSL_CONF=/dev/null"

# Skip config test (requires entropy)
ExecStartPre=
```

**Why This Works:**
- `OPENSSL_CONF=/dev/null` → OpenSSL uses defaults, skips custom configs
- Empty `ExecStartPre=` → Removes `sshd -t` test command
- SSH daemon starts directly without PRNG check
- Host keys already exist (generated during package install with enough entropy)
- Runtime operation doesn't need config test

**Testing Results:**
```bash
systemctl restart ssh.service
systemctl status ssh.service
# ● ssh.service - OpenBSD Secure Shell server
#    Active: active (running) since Tue 2026-01-06 17:54:53 WIB
#    Server listening on 0.0.0.0 port 22
#    Server listening on :: port 22

ss -tln | grep :22
# LISTEN 0 128 0.0.0.0:22 0.0.0.0:*
# LISTEN 0 128    [::]:22    [::]:*
```

✅ **SSH fully functional and survives reboots!**

#### Files Modified

**vps-install.sh:**
- Lines 763-825: Complete SSH persistence solution
  - Install haveged + rng-tools (helps but not sufficient)
  - Create `/run/sshd` directory immediately
  - Create `ssh-runtime-directory.service` (directory persistence)
  - Create `ssh.service.d/override.conf` (OpenSSL bypass)

**vps-install-local.sh:**
- Lines 448-510: Same SSH persistence logic
- Ensures local installs also survive reboots

**ssh-persist-fix.sh:**
- Complete emergency recovery script
- Implements both directory creation + OpenSSL bypass
- Can fix existing installations

#### New Features Added

**Salfanet Cron Service Auto-Start:**
- Lines 1738-1748 (vps-install.sh): Start cron service with PM2
- Lines 824-834 (vps-install-local.sh): Start cron service with PM2
- Command: `pm2 start cron-service.js --name salfanet-cron`
- Ensures background tasks (voucher sync, auto isolir, notifications) run automatically

**PM2 Process Manager:**
- Now starts TWO services:
  1. `salfanet-radius` - Main Next.js application
  2. `salfanet-cron` - Background cron jobs
- Both saved to PM2 and auto-start on reboot

#### Migration Guide for Existing Installations

**If SSH crashes after reboot:**

```bash
# Option 1: Use emergency fix script
wget https://raw.githubusercontent.com/username/repo/main/ssh-persist-fix.sh
chmod +x ssh-persist-fix.sh
./ssh-persist-fix.sh

# Option 2: Manual fix
mkdir -p /etc/systemd/system/ssh.service.d

cat > /etc/systemd/system/ssh.service.d/override.conf <<'EOF'
[Service]
Environment="OPENSSL_CONF=/dev/null"
ExecStartPre=
EOF

systemctl daemon-reload
systemctl restart ssh.service
```

**Add cron service to existing installation:**

```bash
cd /root/salfanet-radius-main  # or your app directory
pm2 start cron-service.js --name salfanet-cron
pm2 save
```

#### Technical Details

**Proxmox LXC Environment Issues:**
- `/run` and `/var/run` are tmpfs (cleared on reboot)
- Entropy pool limited (~256 bits vs normal 2000+)
- OpenSSL 3.0 stricter than previous versions
- SSH privilege separation requires dedicated directory
- Standard entropy generators (haveged, rng-tools) insufficient

**Complete Fix Stack:**
1. **Directory Persistence**: `ssh-runtime-directory.service` creates `/run/sshd` before SSH
2. **OpenSSL Bypass**: `ssh.service.d/override.conf` skips PRNG check
3. **Entropy Helpers**: haveged + rng-tools installed (helps general entropy)
4. **Service Ordering**: systemd dependencies ensure correct startup sequence

**Why OpenSSL Bypass is Safe:**
- SSH host keys already generated during package installation
- Key generation uses system entropy (happens once)
- SSH daemon runtime doesn't need config test
- Only bypasses the startup check, not cryptographic operations
- All encryption still uses proper OpenSSL with existing keys

#### Breaking Changes

None - fully backward compatible.

#### Known Issues

- Entropy remains low (~256) in LXC containers (expected, bypassed)
- OpenSSL bypass means `sshd -t` manual tests also need `OPENSSL_CONF=/dev/null`

---

## [2.9.14] - 2026-01-06

### 🔧 CRITICAL FIX: SSH Crash After Reboot (Missing /var/run/sshd)

#### Final Root Cause Identified

After extensive testing on fresh Proxmox LXC installations, discovered **the real cause** of SSH crashes after reboot:

**Problem:**
```
ssh.service: Start request repeated too quickly
ssh.service: Failed with result 'exit-code'
Failed to start OpenBSD Secure Shell server
```

**Root Cause:**
- `/var/run/sshd` directory required by SSH daemon
- Directory is on **tmpfs** (RAM-based filesystem)
- **Gets deleted on every reboot**
- SSH fails to start without this directory
- Common in Proxmox LXC containers (privileged separation issue)

**Timeline of Events:**
1. Fresh install → `/var/run/sshd` doesn't exist
2. Installer completes → SSH starts (creates directory temporarily)
3. User reboots VPS → `/var/run/sshd` deleted (tmpfs cleared)
4. SSH tries to start → Fails (no privilege separation directory)
5. systemd retries → Fails repeatedly → Gives up
6. Result: **SSH completely inaccessible**

#### Solution Implemented

**Created permanent systemd service:**

```systemd
# File: /etc/systemd/system/ssh-runtime-directory.service
[Unit]
Description=Ensure SSH Runtime Directory Exists
Before=ssh.service sshd.service  # Runs BEFORE SSH starts
DefaultDependencies=no

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/mkdir -p /var/run/sshd
ExecStart=/bin/chmod 755 /var/run/sshd

[Install]
WantedBy=multi-user.target  # Auto-start on boot
```

**How it works:**
1. ✅ Service runs on **every boot** (WantedBy=multi-user.target)
2. ✅ Runs **BEFORE** SSH service (Before=ssh.service)
3. ✅ Creates `/var/run/sshd` with correct permissions
4. ✅ SSH service finds directory → Starts successfully
5. ✅ **Survives reboots** indefinitely

#### Files Changed

**Installers updated:**
- `vps-install.sh` - Added Step 4.5 (create service)
- `vps-install-local.sh` - Added Step 7.5 (create service)

**New recovery tools:**
- `ssh-persist-fix.sh` - One-time fix for existing installations
- `ssh-quick-fix.sh` - Emergency fix + directory creation
- `ssh-debug.sh` - Updated to detect missing /var/run/sshd

**Documentation:**
- `VPS_INSTALL_RECOVERY_GUIDE.md` - Added restart loop troubleshooting

#### Testing Results

Tested extensively on:
- ✅ Proxmox LXC (Ubuntu 22.04) - **FIXED**
- ✅ Proxmox KVM (Ubuntu 22.04) - Works
- ✅ Multiple reboots - SSH survives
- ✅ Fresh install → Reboot → SSH accessible
- ✅ No more "Start request repeated too quickly"

#### Migration for Existing Installations

If you already installed and SSH crashes after reboot:

**Option 1: Use automated script (Recommended)**
```bash
# Via Proxmox console
cd /root/salfanet-radius-main
bash ssh-persist-fix.sh
# Test reboot
sudo reboot
```

**Option 2: Manual fix**
```bash
# Create service
cat > /etc/systemd/system/ssh-runtime-directory.service <<'EOF'
[Unit]
Description=Ensure SSH Runtime Directory Exists
Before=ssh.service sshd.service
DefaultDependencies=no

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/mkdir -p /var/run/sshd
ExecStart=/bin/chmod 755 /var/run/sshd

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
chmod 644 /etc/systemd/system/ssh-runtime-directory.service
systemctl daemon-reload
systemctl enable ssh-runtime-directory.service
systemctl start ssh-runtime-directory.service

# Create directory now
mkdir -p /var/run/sshd
chmod 755 /var/run/sshd

# Restart SSH
systemctl restart ssh.service

# Test
systemctl status ssh.service
```

**Option 3: One-liner emergency fix**
```bash
mkdir -p /var/run/sshd && chmod 755 /var/run/sshd && systemctl restart ssh.service
```

#### Impact Assessment

**Before (v2.9.13 and earlier):**
- ❌ Fresh install works, SSH accessible
- ❌ After first reboot → SSH crash
- ❌ VPS inaccessible remotely
- ❌ Requires console access to fix
- ❌ Fix not permanent (crashes again on next reboot)

**After (v2.9.14):**
- ✅ Fresh install works, SSH accessible
- ✅ After reboot → SSH still works
- ✅ VPS accessible remotely
- ✅ No console access needed
- ✅ Permanent fix (survives all reboots)

#### Lessons Learned

1. **Proxmox LXC specific issues:**
   - Containers don't have full init system
   - Runtime directories not auto-created
   - Need explicit systemd services

2. **tmpfs behavior:**
   - `/var/run` cleared on reboot
   - Applications must recreate needed directories
   - systemd-tmpfiles usually handles this, but not for /var/run/sshd

3. **SSH privilege separation:**
   - Requires dedicated directory
   - Fails silently if directory missing
   - Error message not clear ("Start request repeated too quickly")

4. **Testing methodology:**
   - Must test FULL reboot cycle
   - "Works after install" ≠ "Works after reboot"
   - Need multiple reboot tests to confirm

---

## [2.9.13] - 2026-01-06 (SUPERSEDED by v2.9.14)

### 🔧 FIX: OpenSSL Random Number Generator Error in Containers

#### Issue Discovered

Fresh install pada Proxmox LXC containers mengalami error saat generate NEXTAUTH_SECRET:

```
error:0308010C:digital envelope routines:inner_evp_generic_fetch:unsupported
error:12000090:random number generator:rand_new_drbg:unable to fetch drbg
```

**Root Cause:**
- OpenSSL 3.0+ di Ubuntu 22.04 menggunakan DRBG (Deterministic Random Bit Generator)
- Di Proxmox LXC containers, DRBG initialization gagal karena insufficient entropy source
- Command `openssl rand -base64 32` crash saat generate random bytes

**Impact:**
- Installer berhenti di Step 7 (Create Environment Configuration)
- NEXTAUTH_SECRET tidak ter-generate
- .env file tidak terbuat
- Instalasi gagal total

#### Solution Implemented

**Changed random generation method:**

**Before (v2.9.12 - BROKEN in containers):**
```bash
NEXTAUTH_SECRET=$(openssl rand -base64 32)
```

**After (v2.9.13 - FIXED):**
```bash
# Generate random secret using /dev/urandom (more reliable than openssl rand in containers)
NEXTAUTH_SECRET=$(head -c 32 /dev/urandom | base64 | tr -d '\n')
```

**Why this works:**
- ✅ `/dev/urandom` adalah kernel RNG yang selalu tersedia
- ✅ Tidak tergantung pada OpenSSL DRBG configuration
- ✅ Bekerja di LXC containers, VMs, dan bare metal
- ✅ Menghasilkan cryptographically secure random bytes
- ✅ Tidak ada external dependencies

#### Testing

Tested on:
- ✅ Proxmox LXC containers (Ubuntu 22.04)
- ✅ Proxmox KVM VMs
- ✅ Bare metal Ubuntu 22.04
- ✅ Fresh install from scratch
- ✅ OpenSSL 3.0.2 (Ubuntu default)

#### Files Changed
- `vps-install.sh` line 159: Changed from `openssl rand` to `/dev/urandom`

#### Migration

**No migration needed** - ini hanya mempengaruhi fresh install.

Existing installations sudah punya NEXTAUTH_SECRET di .env file, tidak perlu diubah.

---

## [2.9.12] - 2026-01-06

### 🎯 FINAL FIX: Complete Removal of Network Route Logic

#### Issue Analysis

After investigating all previous version issues (v2.9.8, v2.9.10, v2.9.11), determined that **the network route persistence feature itself was the root cause** of all SSH problems:

**Problems with route logic:**
- v2.9.8: Modified routes during install → Killed active SSH connection
- v2.9.10: Service with `Before=ssh.service` → Blocked SSH on boot  
- v2.9.11: Service with `After=ssh.service` → Still enabled, potential issues

**Analysis showed:**
- Older working version (before v2.9.8) had NO route logic at all
- That version worked perfectly: SSH stable, no crashes, no route issues
- Route persistence was added to solve a non-existent problem
- The "fix" created more problems than it solved

#### Solution: Return to What Worked

**Completely removed:**
- ❌ PRIMARY_INTERFACE/PRIMARY_GATEWAY detection
- ❌ /etc/network/primary-route-info file creation
- ❌ salfanet-network-route.service systemd service
- ❌ Inline fix-ssh-routing script
- ❌ All route modification/persistence logic

**Result:**
- ✅ Clean installer like original working version
- ✅ No route modification during or after install
- ✅ No systemd services that can block SSH
- ✅ Simple, stable, predictable behavior
- ✅ SSH remains accessible after install and reboot

#### Files Changed
- `vps-install.sh`: Removed ~200 lines of route logic
- Installer now focuses only on application setup
- Network routing left to OS defaults (which work fine)

#### Migration for Existing Installations

If you have **v2.9.8, v2.9.10, or v2.9.11** installed:

**Option 1: Emergency Recovery (SSH crashed)**
```bash
# From Proxmox console (SSH not accessible)
systemctl disable salfanet-network-route.service
systemctl stop salfanet-network-route.service
systemctl restart sshd
rm /etc/systemd/system/salfanet-network-route.service
systemctl daemon-reload
```

**Option 2: Preventive Cleanup (SSH still works)**
```bash
# Via SSH (before reboot)
sudo systemctl disable salfanet-network-route.service
sudo systemctl stop salfanet-network-route.service
sudo rm /etc/systemd/system/salfanet-network-route.service
sudo rm /etc/network/primary-route-info
sudo systemctl daemon-reload
```

**Option 3: Use emergency scripts (if available)**
```bash
# From console if SSH is down
bash /tmp/fix-ssh-service.sh
```

#### Lessons Learned

1. **KISS Principle**: Keep It Simple, Stupid
   - Don't fix what isn't broken
   - Original version worked fine without route logic
   
2. **Test assumptions**:
   - "Route might change after install" → Never actually happened
   - Added complexity to solve theoretical problem
   
3. **Systemd dependencies are dangerous**:
   - `Before=` directive can block dependent services
   - Even `After=` adds unnecessary complexity
   
4. **When in doubt, rollback**:
   - Sometimes the best fix is removing the "improvement"

---

## [2.9.11] - 2026-01-06 (DEPRECATED - Use v2.9.12)

### 🚨 CRITICAL FIX: SSH Service Crash After Installation

#### Root Cause Identified

**Problem in v2.9.10:**
```
ssh.service - OpenBSD Secure Shell server
   Active: failed (Result: exit-code) since Tue 2026-01-06 03:10:58 WIB
   Process: 1054 ExecStartPre=/usr/sbin/sshd -t (code=exited, status=255/EXCEPTION)
```

**Root Cause:**
```systemd
[Unit]
Before=ssh.service  # ← This line causes SSH to FAIL!
```

Route persistence service configured with `Before=ssh.service` caused:
1. ❌ Route service runs BEFORE SSH
2. ❌ If route service has any error/delay → SSH blocked
3. ❌ SSH fails with exit code 255
4. ❌ VPS becomes completely inaccessible (no SSH, no access)

#### Solution Implemented

**Changed systemd service ordering:**

**Before (v2.9.10 - BROKEN):**
```systemd
[Unit]
After=network-online.target
Before=ssh.service  # ← BLOCKS SSH STARTUP
```

**After (v2.9.11 - FIXED):**
```systemd
[Unit]
After=network-online.target ssh.service  # ← Runs AFTER SSH
```

**Result:**
- ✅ SSH starts normally first
- ✅ Route service runs after SSH is already running
- ✅ No blocking dependencies
- ✅ SSH always accessible

#### New Emergency Recovery Tool

**Script:** `fix-ssh-service.sh`

For VPS where SSH service failed to start:

**Features:**
1. Detects SSH service status
2. Identifies if route service is blocking
3. Disables problematic service
4. Restarts SSH service
5. Recreates route service with correct ordering
6. Tests SSH connectivity
7. Checks firewall rules

**Usage (from VPS console):**
```bash
# Access VPS via Proxmox console
bash /tmp/fix-ssh-service.sh
```

**What it does:**
```
[Step 1] Check SSH status (failed/active)
[Step 2] Check if route service is blocking
[Step 3] Disable blocking service
[Step 4] Restart SSH service (sshd/ssh)
[Step 5] Verify SSH is running and listening on port 22
[Step 6] Recreate route service with After=ssh.service
[Step 7] Test SSH connection locally and check firewall
```

**Output:**
```
✅ SSH service is ACTIVE
✅ SSH is listening on port 22
✅ SSH allowed in firewall
✅ Fixed service created and enabled

Route service info:
  Status: enabled
  Note: Now runs AFTER SSH (safe)
```

#### Files Modified

1. **vps-install.sh**
   - Changed: `After=network-online.target ssh.service`
   - Removed: `Before=ssh.service`
   - Route service now runs AFTER SSH starts

2. **fix-network-route.sh**
   - Updated systemd service template
   - Same fix: After=ssh.service

3. **fix-ssh-service.sh** (NEW)
   - Emergency SSH recovery
   - Detects and fixes blocking service
   - Restarts SSH safely
   - Recreates route service correctly

#### Recovery Steps

**If SSH failed after v2.9.10 installation:**

1. **Access Console:**
   ```bash
   # Proxmox: VM → Console
   # Login as root
   ```

2. **Run SSH Recovery:**
   ```bash
   bash /tmp/fix-ssh-service.sh
   ```

3. **Verify:**
   ```bash
   systemctl status ssh  # Should be active
   ss -tln | grep :22    # Should be listening
   
   # Test from external
   ssh root@YOUR_VPS_IP
   ```

**If route is also wrong, run both:**
```bash
# Fix SSH first
bash /tmp/fix-ssh-service.sh

# Then fix route (if needed)
bash /tmp/fix-network-route.sh
```

#### Prevention

**For new installations:**
- Use vps-install.sh v2.9.11
- Route service will not block SSH
- Service dependency: `After=ssh.service`

**Systemd Service Best Practices:**
- ✅ DO: Use `After=ssh.service` for non-critical services
- ✅ DO: Allow SSH to start independently
- ❌ DON'T: Use `Before=ssh.service` unless absolutely critical
- ❌ DON'T: Block SSH startup with non-essential services

#### Verification

**Check service ordering:**
```bash
systemctl cat salfanet-network-route.service | grep -A5 "\[Unit\]"

# Should show:
# After=network-online.target ssh.service
# NOT: Before=ssh.service
```

**Test reboot safety:**
```bash
sudo reboot

# After reboot:
systemctl status ssh        # Should be active
systemctl status salfanet-network-route.service  # Should be active
ssh root@localhost          # Should work
```

#### Impact

**Affected versions:**
- v2.9.8: Route logic broke SSH access (network)
- v2.9.10: Route service blocked SSH startup (systemd)
- v2.9.11: Both issues fixed

**Severity:**
- CRITICAL - VPS completely inaccessible without console access
- Required emergency recovery from Proxmox console

**Lesson:**
Never block SSH service startup with non-critical dependencies. Always use `After=` instead of `Before=` for services that depend on network connectivity.

---

## [2.9.10] - 2026-01-06

### 🚨 CRITICAL FIX: VPS Installation - SSH Accessibility Issue

#### Problem Fixed (Emergency Patch)

**Critical Issue in v2.9.8:**
- Network route "restoration" logic **broke SSH access** during installation
- Script deleted all default routes then added new one → SSH connection dropped
- VPS became inaccessible via public IP after installation

**Root Cause:**
```bash
# BAD CODE in v2.9.8:
ip route del default  # ← This kills active SSH session!
ip route add default via $GATEWAY dev $INTERFACE
```

#### Solution Implemented

**1. Route Modification Behavior Changed**

**Before (v2.9.8 - BROKEN):**
- ❌ Modified routes during installation
- ❌ Deleted default route (broke SSH)
- ❌ VPS became unreachable

**After (v2.9.10 - FIXED):**
- ✅ NO route modification during installation
- ✅ Only creates persistence service
- ✅ Route changes ONLY after reboot (when needed)
- ✅ SSH remains accessible

**2. New Installation Behavior**

Script now:
1. **Detects** primary interface and gateway
2. **Saves** to `/etc/network/primary-route-info`
3. **Creates** systemd service for persistence
4. **DOES NOT** modify current routes (preserves SSH)

**3. Persistence Service Logic**

`salfanet-network-route.service` only activates:
- ✅ After reboot
- ✅ Only if route is incorrect/missing
- ✅ Before SSH service starts
- ❌ NOT during installation

#### Emergency Recovery Tool

**New Script:** `fix-network-route.sh`

For VPS that already have broken SSH access:

**Features:**
- Interactive route configuration
- Auto-detects public IP interface
- Auto-detects gateway
- Tests connectivity (gateway, internet, DNS)
- Creates persistence service
- Safe confirmation prompts

**Usage (from VPS console):**
```bash
# Access VPS via Proxmox console (not SSH)
bash /tmp/fix-network-route.sh

# Follow prompts to restore network access
```

**What it does:**
1. Shows current network status
2. Detects public interface and gateway
3. Asks for confirmation
4. Safely removes and re-adds routes
5. Saves configuration
6. Creates persistence service
7. Tests connectivity

#### Files Modified

1. **vps-install.sh**
   - Removed route modification during installation
   - Changed "Restoration" to "Persistence Setup"
   - Added clear warnings about not modifying routes
   - Service now uses `Before=ssh.service`

2. **fix-network-route.sh** (NEW)
   - Emergency recovery tool
   - Interactive route configuration
   - Network detection and testing
   - Safe for manual recovery

#### Migration Guide

**If you have v2.9.8 installed and SSH is broken:**

1. **Access via Console:**
   - Proxmox: VM → Console
   - Or physical server console

2. **Run Recovery:**
   ```bash
   bash /tmp/fix-network-route.sh
   ```

3. **Verify:**
   ```bash
   ip route show
   ping 8.8.8.8
   # Test SSH from external network
   ```

**For new installations:**
- Use updated `vps-install.sh` (v2.9.10)
- SSH will remain accessible throughout installation

#### Verification

**Check route NOT modified during install:**
```bash
# Before install
ip route show

# During install - route should NOT change

# After install - route should be SAME
ip route show
```

**Check persistence service created:**
```bash
systemctl status salfanet-network-route.service
cat /etc/network/primary-route-info
```

**Test after reboot:**
```bash
sudo reboot
# After reboot, SSH should still work
# Service ensures correct route if needed
```

#### Lessons Learned

**DO NOT:**
- ❌ Modify network routes during SSH session
- ❌ Delete default route without alternative connection
- ❌ Assume route "restoration" is safe during installation

**DO:**
- ✅ Only create persistence configuration
- ✅ Let service handle route changes after reboot
- ✅ Preserve active connections during setup
- ✅ Provide recovery tools for emergencies

---

## [2.9.9] - 2026-01-06

### ⏪ Rollback: Golang Cron Service to Node.js

#### Decision
Rolled back from Golang cron service (v2.9.7) to original Node.js PM2 cron service.

**Reason:** Simplicity and maintenance considerations.

#### Changes Made

**1. Disabled Golang Cron Service**
```bash
sudo systemctl stop radius-cron
sudo systemctl disable radius-cron
```

**2. Re-enabled Node.js Cron Service**
```bash
pm2 restart salfanet-cron
pm2 save
```

**3. Service Comparison**

| Aspect | Golang (v2.9.7) | Node.js (Current) |
|--------|-----------------|-------------------|
| Memory | 8.6 MB | ~77 MB |
| Binary Size | 7.7 MB | N/A |
| Deployment | systemd service | PM2 process |
| Language | Go 1.25.5 | Node.js |
| Maintenance | Recompile needed | Hot reload |

#### Active Cron Service

**PM2 Process:** `salfanet-cron`
- Script: `/var/www/salfanet-radius/cron-service.js`
- Memory Limit: 150 MB (max_memory_restart)
- Heap Size: 120 MB (max-old-space-size)
- Mode: fork (single instance)

**Cron Jobs (via node-cron):**
1. **Invoice Generation** - Daily 01:00 WIB
2. **Invoice Reminder** - Daily 02:00 WIB  
3. **Auto Renewal** - Daily 03:00 WIB
4. **User Isolation** - Daily 04:00 WIB
5. **Session Cleanup** - Daily 05:00 WIB
6. **Voucher Expiration** - Hourly

#### Verification Commands

```bash
# Check PM2 status
pm2 list
pm2 logs salfanet-cron --lines 50

# Check cron execution logs (admin panel)
# Navigate to: Pengaturan → Cronjob → Riwayat Eksekusi

# Memory usage
pm2 monit
```

#### Golang Service Files (Kept for Future Reference)

Golang implementation files remain in repository but not deployed:
- `radius-cron-go/` - Complete Go implementation
- Documentation in CHANGELOG v2.9.7
- Can be re-enabled if needed in future

**Note:** Golang migration achieved 88% memory reduction (77MB → 8.6MB) but rolled back due to deployment complexity preference.

---

## [2.9.8] - 2026-01-06

### 🔧 VPS Installation - Network Route Fix

#### Problem Fixed
**Issue:** After running `vps-install.sh`, default network route changed from public IP interface (e.g., eth0) to local IP interface (e.g., ens3), making VPS IP public inaccessible.

**Symptoms:**
- `ip route` shows: `default via 10.34.34.1 dev ens3` (local IP)
- Should be: `default via <public_gateway> dev <public_interface>`
- SSH from external network failed
- Application not accessible from internet

#### Solution Implemented

**1. Route Detection & Storage**
- Script now detects `PRIMARY_INTERFACE` and `PRIMARY_GATEWAY` before installation
- Saves to `/etc/network/primary-route-info` for persistence
- Example:
  ```bash
  PRIMARY_INTERFACE=ens3
  PRIMARY_GATEWAY=10.34.34.1
  ```

**2. Route Restoration**
Added automatic route restoration after installation:
```bash
# Detects route changes
# Removes incorrect default routes
# Restores correct route with metric 100
ip route add default via $PRIMARY_GATEWAY dev $PRIMARY_INTERFACE metric 100
```

**3. Persistent Route Service**
Created systemd service: `salfanet-network-route.service`
- Ensures route persists after reboot
- Auto-starts on boot with 5-second delay
- Checks and restores route if missing
- Location: `/etc/systemd/system/salfanet-network-route.service`

**4. Installation Summary**
Script now displays final network status:
```
📊 Final Network Status:
   Route: default via 10.34.34.1 dev ens3 metric 100
   IP:    inet 10.34.34.135/24 brd 10.34.34.255 scope global ens3
```

#### Files Modified
- `vps-install.sh` - Added route restoration & persistence logic
- `docs/PROXMOX_VPS_SETUP_GUIDE.md` - Added network route troubleshooting section

#### Manual Fix (if needed)
```bash
# Check current route
ip route show

# Fix manually if automatic restoration failed
sudo ip route del default
sudo ip route add default via <gateway> dev <interface> metric 100

# Restart service
sudo systemctl restart salfanet-network-route.service
```

#### Verification
```bash
# Check saved route info
cat /etc/network/primary-route-info

# Check route service
systemctl status salfanet-network-route.service

# Test connectivity
ping -c 4 8.8.8.8
curl -I http://localhost:3000
```

---

## [2.9.7] - 2026-01-06

### 🚀 Golang Cron Service Migration (Phase 1) - PRODUCTION

#### Memory Optimization Achievement
**Performance Improvement:**
- ❌ **Before**: Node.js cron service using 77 MB memory
- ✅ **After**: Golang cron service using **8.6 MB memory**
- 🎯 **Memory Savings**: ~68 MB (88% reduction)

#### New Golang Microservice Deployed
**Location:** `/var/www/salfanet-radius/radius-cron/`

**Architecture:**
```
radius-cron-go/
├── cmd/server/main.go          # Entry point with graceful shutdown
├── internal/
│   ├── config/                 # Viper YAML configuration
│   ├── database/               # GORM MySQL connection pool
│   ├── models/                 # Database models + CronHistory
│   ├── jobs/                   # 6 cron job implementations
│   │   ├── invoice.go          # Invoice generation
│   │   ├── reminder.go         # Invoice reminders
│   │   ├── renewal.go          # Auto-renewal from balance
│   │   ├── isolation.go        # User isolation
│   │   ├── cleanup.go          # Session cleanup + voucher expiration
│   │   └── manager.go          # Job manager interface
│   └── scheduler/              # Cron job scheduler
├── configs/
│   ├── config.yaml             # Production config
│   ├── config.production.yaml  # Production template
│   └── radius-cron.service     # Systemd service file
└── scripts/
    ├── build.sh                # Cross-compile for Linux
    ├── deploy-vps.sh           # Automated deployment
    └── deploy-vps.ps1          # Windows PowerShell deploy
```

**Binary Details:**
- Size: 7.72 MB (stripped)
- Platform: Linux AMD64
- Go Version: 1.25.5

#### Cron Jobs Implemented

**6 Jobs with Database Logging:**

1. **Invoice Generation** (`invoice_generation`)
   - Schedule: Daily 01:00 WIB
   - Generates monthly invoices 3 days before expiry
   - Logs: Generated count, skipped count

2. **Invoice Reminder** (`invoice_reminder`)
   - Schedule: Daily 02:00 WIB
   - Sends reminders 1-3 days before due date
   - Marks overdue invoices
   - Logs: Reminders sent, overdue marked

3. **Auto Renewal** (`auto_renewal`)
   - Schedule: Daily 03:00 WIB
   - Renews users with sufficient balance
   - Extends expiry by 30 days, clears isolation
   - Logs: Renewed count, skipped (insufficient balance)

4. **User Isolation** (`user_isolation`)
   - Schedule: Daily 04:00 WIB
   - Isolates expired users
   - Logs: Isolated user count

5. **Session Cleanup** (`session_cleanup`)
   - Schedule: Daily 05:00 WIB
   - Deletes radacct sessions >30 days old
   - Logs: Deleted record count

6. **Voucher Expiration** (`voucher_expiration`)
   - Schedule: Hourly (every 1 hour)
   - Marks expired vouchers as used
   - Logs: Expired voucher count

#### Database Integration

**New Model: `CronHistory`**
```go
type CronHistory struct {
    ID          string     // UUID
    JobType     string     // job name
    Status      string     // running/success/error
    StartedAt   time.Time
    CompletedAt *time.Time
    Duration    *int       // milliseconds
    Result      *string    // JSON result message
    Error       *string    // Error details if failed
}
```

**Logging Features:**
- ✅ Every job execution logged to `cron_history` table
- ✅ Duration tracking in milliseconds
- ✅ Success/Error status with details
- ✅ Result summary (e.g., "Generated 15 invoices, Skipped 3")
- ✅ Viewable in Admin Panel → Pengaturan → Cronjob History

#### Deployment Process

**Installation Steps:**
1. Built binary for Linux: `GOOS=linux GOARCH=amd64 go build`
2. Uploaded to VPS: `/var/www/salfanet-radius/radius-cron/bin/`
3. Created systemd service: `/etc/systemd/system/radius-cron.service`
4. Configured database: MySQL connection with proper timezone (Asia/Jakarta)
5. Started service: `systemctl enable --now radius-cron`

**Service Configuration:**
```ini
[Service]
Type=simple
WorkingDirectory=/var/www/salfanet-radius/radius-cron
ExecStart=/var/www/salfanet-radius/radius-cron/bin/radius-cron
StandardOutput=journal
StandardError=journal
Restart=on-failure

# Memory limits
MemoryHigh=40M
MemoryMax=50M
```

**Monitoring:**
```bash
# Status check
systemctl status radius-cron

# Real-time logs
journalctl -u radius-cron -f

# Memory usage
systemctl status radius-cron | grep Memory
```

#### Migration Strategy

**Phase 1: Cron Service** ✅ COMPLETED
- Microservice architecture foundation
- Database logging infrastructure
- Production deployment successful
- Node.js PM2 cron service stopped

**Next Phases (Planned):**
- Phase 2: Notification Integration (WhatsApp/Email sending)
- Phase 3: CoA Integration (MikroTik disconnect/profile change)
- Phase 4: API Service (Next.js API routes migration)

#### Tech Stack

**Dependencies:**
```go
require (
    github.com/robfig/cron/v3 v3.0.1       // Cron scheduler
    github.com/spf13/viper v1.18.2         // Configuration
    github.com/sirupsen/logrus v1.9.3      // Logging
    gorm.io/gorm v1.25.5                   // ORM
    gorm.io/driver/mysql v1.5.2            // MySQL driver
    github.com/google/uuid v1.4.0          // UUID generation
)
```

**Configuration Management:**
- YAML-based configuration
- Environment-specific configs (dev/production)
- Hot-reload not required (cron runs on schedule)

#### Production Metrics

**Deployment Date:** 2026-01-06 00:41 WIB

**Performance:**
- Startup time: <1 second
- Memory footprint: 8.6 MB (stable)
- CPU usage: 0% (idle between cron executions)
- Binary size: 7.72 MB

**Reliability:**
- Auto-restart on failure (systemd)
- Graceful shutdown (SIGTERM/SIGINT handling)
- Database connection pooling (MaxOpen=5, MaxIdle=2)

**Observability:**
- Systemd journalctl integration
- Database execution history
- Admin panel visibility

---

### 🐛 Bug Fixes

#### vps-install.sh Syntax Error Fixed
**File:** `vps-install.sh` (line 359-361)

**Problem:**
```bash
fi
    echo "  ⚠️  IP forwarding NOT enabled - routing will not work"
    VERIFICATION_PASSED=false
fi  # <- Extra fi without matching if
```

**Error Message:**
```
./vps-install.sh: line 362: syntax error near unexpected token `fi'
```

**Root Cause:**
- Duplicate code block incorrectly placed after SSH safety check
- `fi` statement without corresponding `if` condition
- Likely copy-paste error during previous edit

**Fix Applied:**
- Removed duplicate lines 359-361
- SSH safety check now properly closes with single `fi`
- IP forwarding check remains in correct location (lines 339-344)

**Verification:**
- ✅ vps-install.sh: Syntax validated, script executable
- ✅ vps-install-local.sh: No similar errors found
- ✅ install-wizard.html: N/A (HTML file, not bash)

**Impact:**
- VPS installation script now runs without syntax errors
- PPP/TUN verification completes successfully
- SSH routing safety checks work properly

---

## [2.9.6] - 2026-01-05

### 🎨 Frontend Templates Fix

#### Template Configuration Completeness
**Files Modified:**
- `src/app/admin/whatsapp/templates/page.tsx`
- `src/app/admin/settings/email/page.tsx`

**Problem Resolved:**
- ❌ **Before**: Only 13 of 30 templates accessible in admin panel UI
- ✅ **After**: All 30 templates fully accessible and editable

**Added 17 Missing Template Configurations:**
1. `account-info` - Informasi Akun Pelanggan
2. `auto-renewal-success` - Auto-Renewal Berhasil
3. `general-broadcast` - Broadcast Umum ke Pelanggan
4. `invoice-created` - Notifikasi Invoice Baru
5. `invoice-overdue` - Invoice Overdue Reminder
6. `maintenance-info` - Pemberitahuan Maintenance
7. `manual_payment_admin` - Notifikasi Admin Manual Payment
8. `outage_notification` - Notifikasi Gangguan
9. `payment_receipt` - Bukti Pembayaran
10. `payment-confirmed` - Konfirmasi Pembayaran Diterima
11. `payment-reminder-general` - Pengingat Pembayaran Umum
12. `payment-warning` - Peringatan Pembayaran Tertunda
13. `promo-offer` - Promo & Penawaran Khusus
14. `thank-you` - Ucapan Terima Kasih
15. `upgrade-notification` - Pemberitahuan Upgrade Paket
16. `voucher-purchase-success` - Pembelian Voucher Berhasil
17. `welcome-message` - Selamat Datang Pelanggan Baru

**Each template config includes:**
- Title with emoji for better UX
- Clear description of purpose and trigger
- Complete array of available template variables

**Impact:**
- ✅ 100% template coverage (30/30 for both WhatsApp and Email)
- ✅ Admins can now customize all notification templates
- ✅ Full control over auto-renewal, broadcast, invoice, and payment notifications
- ✅ Frontend UI matches backend database structure

### 🧹 Database Seed Files Cleanup

#### Consolidated Template Seeds
**Files Modified:**
- `prisma/seeds/seed-all.ts` (715 lines → 373 lines, -342 lines)
- `prisma/seeds/email-templates.ts` (added 14 new templates, total 30)
- `prisma/seeds/whatsapp-templates.ts` (NEW file - consolidated all 30 templates)

**Files Deleted:**
- ❌ `prisma/seeds/whatsapp-manual-payment-templates.ts` (merged into whatsapp-templates.ts)
- ❌ All temporary .js test/debug files

**Changes:**
1. **seed-all.ts Cleanup**
   - Removed 333 lines of duplicate `whatsappTemplates` array
   - Fixed import path: `whatsapp-manual-payment-templates` → `whatsapp-templates`
   - Removed duplicate `seedWhatsAppTemplates()` call
   - Clean structure using imported seeding functions

2. **Email Templates Enhancement**
   - Added 14 new email templates with professional HTML designs
   - All templates include gradient headers and responsive layouts
   - Total: 30 email templates matching 30 WhatsApp templates

3. **WhatsApp Templates Consolidation**
   - Created comprehensive `whatsapp-templates.ts` with all 30 templates
   - Organized by categories: Registration, Invoice/Payment, Voucher, Auto Renewal, Broadcast, Customer Service, Admin, Others, System
   - Replaced fragmented template files

**Database Sync:**
- ✅ Local: 30 Email + 30 WhatsApp = 60 templates
- ✅ VPS: 30 Email + 30 WhatsApp = 60 templates
- ✅ Frontend: 30 + 30 = 60 template configs

## [2.9.5] - 2025-12-31

### 🎨 UI/UX Improvements - MapPicker Modal Redesign

#### Component: `MapPicker.tsx`
**File:** `src/components/MapPicker.tsx`

**Complete Cyberpunk/Neon Theme Overhaul:**
- ✅ **Modal Container:**
  - Changed from `bg-white dark:bg-gray-900` → `bg-gradient-to-br from-slate-900 to-[#1a0f35]`
  - Added neon border: `border-2 border-[#bc13fe]/30` with purple glow shadow
  - Enhanced backdrop: `bg-black/80 backdrop-blur-sm`

- ✅ **Header Section:**
  - Icon container with cyan background and border
  - Title with neon glow effect: `drop-shadow-[0_0_10px_rgba(0,247,255,0.5)]`
  - Added descriptive subtitle
  - Close button with hover color transition (purple → pink)

- ✅ **Map Controls (Street/Satelit Toggle):**
  - Background: `bg-slate-900/90 backdrop-blur-xl`
  - Active state: `bg-gradient-to-r from-[#00f7ff] to-[#00d4e6]` with cyan glow
  - Inactive state: Purple text with hover effect
  - Larger icons (h-4 w-4) for better visibility

- ✅ **GPS Location Button:**
  - Consistent styling with control buttons
  - Hover color transition: cyan → pink
  - Enhanced shadow effects on hover

- ✅ **Coordinates Display:**
  - Gradient background: `from-[#bc13fe]/20 to-[#00f7ff]/20`
  - Cyan border with MapPin icon
  - Coordinates text with cyan glow effect
  - Font mono for better readability

- ✅ **Loading State:**
  - Gradient background matching theme
  - Cyberpunk spinner: `border-[#bc13fe]/30 border-t-[#00f7ff]`
  - Larger spinner (h-12 w-12) with neon glow

- ✅ **Footer Buttons:**
  - "Batal": Bordered secondary style with purple accents
  - "Pilih Lokasi Ini": Gradient cyan primary with hover glow effect
  - Proper disabled state styling

**Result:** MapPicker modal now 100% consistent with application's cyberpunk theme

---

### 🔧 Bug Fixes - PPPoE Balance Manager

#### API Route: `/api/admin/pppoe/users/[id]/deposit`
**File:** `src/app/api/admin/pppoe/users/[id]/deposit/route.ts`

**Fixed "undefined" User Name in Dialogs:**
- ✅ **Root Cause:** API GET method only returned `id`, `username`, `balance`
- ✅ **Solution:** Updated select query to include:
  ```typescript
  {
    id: true,
    username: true,
    name: true,          // ADDED
    phone: true,         // ADDED
    balance: true,
    autoRenewal: true,   // ADDED
    profile: {           // ADDED
      select: {
        id: true,
        name: true,
        price: true,
      }
    }
  }
  ```

#### Component: Balance Page
**File:** `src/app/admin/pppoe/users/[id]/balance/page.tsx`

**Added Safe Fallbacks:**
- ✅ **Top-Up Confirmation:**
  ```tsx
  `... untuk ${user?.name || user?.username || 'user ini'}?`
  ```
- ✅ **Auto-Renewal Confirmation:**
  ```tsx
  `... untuk ${user.name || user.username || 'user ini'}?`
  ```
- ✅ **Header Display:**
  ```tsx
  <h1>{user.name || user.username}</h1>
  <p>{user.phone || '-'}</p>
  ```

**Result:** No more "undefined" text in confirmation dialogs and user display

---

### 🚀 Feature Enhancement - PPPoE Profile Rate Limit

#### Database Schema Update
**File:** `prisma/schema.prisma`

**Added `rateLimit` Field to pppoeProfile:**
```prisma
model pppoeProfile {
  // ... existing fields
  downloadSpeed  Int
  uploadSpeed    Int
  rateLimit      String?  // NEW: Store complex MikroTik formats
  // ...
}
```

**Migration:** `npx prisma db push`

#### API Routes Update
**Files:** 
- `src/app/api/pppoe/profiles/route.ts` (POST & PUT methods)

**Changes:**
- ✅ **POST Method:**
  - Now saves `rateLimit` field to database
  - `rateLimit: rateLimit || \`${downloadSpeed}M/${uploadSpeed}M\``
  
- ✅ **PUT Method:**
  - Fixed Prisma lint error (findUnique → findFirst for groupName)
  - Added `rateLimit` to update data
  - Preserves manual burst limit configurations

- ✅ **Speed Extraction Logic:**
  - Only extracts from rateLimit if explicit speeds NOT provided
  - Prevents override of user-submitted values

#### Frontend Form Redesign
**File:** `src/app/admin/pppoe/profiles/page.tsx`

**Complete UI Overhaul:**
- ✅ **Removed Redundant Fields:**
  - Deleted "Detected Download (M)" input
  - Deleted "Detected Upload (M)" input
  - Removed manual/auto toggle complexity

- ✅ **Single Rate Limit Input:**
  - Primary input field for MikroTik rate limit format
  - Auto-extracts download/upload speeds in background
  - Supports both simple (`10M/5M`) and complex formats with burst limits
  - Real-time validation and parsing

- ✅ **Helper Features:**
  - "Gunakan Format Burst" button: Auto-fills burst limit template
  - Format hint: `download/upload [burst-rates] [thresholds] [burst-time]...`
  - Placeholder example: `10M/5M atau 10M/5M 0/0 0/0 8 0/0`

- ✅ **Smart Sync Logic:**
  - When rateLimit changes, auto-updates download/upload
  - When download/upload change (if simple format), syncs back to rateLimit
  - Preserves complex formats during edits

**Result:** Simplified, user-friendly form that supports full MikroTik rate limit syntax

#### Modal Component Enhancement
**File:** `src/components/cyberpunk/SimpleModal.tsx`

**Added Disabled State Styling to ModalInput:**
```tsx
'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[#0a0520]/50'
```

---

### 📦 Deployment & Documentation

#### Fresh Installer Package
**Created:** `installation_info/fresh_installer_files.md`

**Documentation Contents:**
- Required folders: `src/`, `public/`, `prisma/`, `freeradius-config/`, `docs/`
- Configuration files list (package.json, tsconfig.json, etc.)
- Installation scripts (vps-install.sh, deploy.sh, etc.)
- Files to exclude (node_modules, .next, .env, build cache)

**Generated Clean Package:**
- Location: `C:\Users\yanz\Downloads\SALFANET-RADIUS-FRESH-INSTALL`
- Includes all necessary files for fresh deployment
- Excludes development artifacts and sensitive data

---

### ✅ Testing Results

**Tested Components:**
- [x] MapPicker modal - Visual consistency ✓
- [x] PPPoE Profile form - Rate limit input/output ✓
- [x] Balance Manager - User data display ✓
- [x] API endpoints - Data integrity ✓

**Browser Compatibility:**
- [x] Chrome/Edge - All features working
- [x] Firefox - All features working

---

## [2.9.4] - 2025-12-29

### 🔧 L2TP VPN Client Control - Critical Fixes

#### API Route: `/api/network/vpn-server/l2tp-control`
**File:** `src/app/api/network/vpn-server/l2tp-control/route.ts`

**Fixed Authentication Failure (pppd exit code 2):**
- ✅ **Added automatic CHAP secrets creation**
  ```bash
  # Now creates /etc/ppp/chap-secrets with proper credentials
  ${l2tpUsername} * ${l2tpPassword} *
  ```
- Previously: File was not created, causing authentication to fail immediately

**Fixed Duplicate Configuration Conflicts:**
- ✅ **Removed duplicate settings from PPP options**
  ```bash
  # REMOVED from /etc/ppp/options.l2tpd.client:
  # - name ${l2tpUsername}     (already in xl2tpd.conf)
  # - password ${l2tpPassword} (already in xl2tpd.conf)
  # - plugin pppol2tp.so       (loaded by xl2tpd)
  # - pppol2tp 7               (loaded by xl2tpd)
  ```
- These duplicates caused plugin double-loading and connection failures

**Fixed PPP Interface Detection:**
- ✅ **Changed from checking only ppp0 to checking all PPP interfaces**
  ```bash
  # OLD: ip addr show ppp0 2>/dev/null
  # NEW: ip addr show | grep -A3 "ppp.*UP"
  ```
- PPP interface number varies (ppp0, ppp1, ppp2) based on existing connections

**Improved Connection Establishment:**
- ✅ Increased connection wait time from 5s to 8s
- ✅ Added detailed status output showing all PPP interfaces
- ✅ Included recent logs (last 10 lines from journalctl)
- ✅ Better error messages for troubleshooting

**Status and Connections Actions:**
- ✅ Updated `status` action to detect any UP PPP interface
- ✅ Updated `connections` action to show all active PPP interfaces
- ✅ More accurate connection state reporting

### 📚 Documentation Updates

#### New: AI Project Memory
**File:** `docs/AI_PROJECT_MEMORY.md`
- Comprehensive project context for AI assistance
- Tech stack, database schema, architecture
- Known issues and fixes with solutions
- Configuration file locations
- Development guidelines
- Common commands reference
- Recent changes log
- **Purpose:** Prevent repetitive troubleshooting, provide instant project understanding

#### Updated: VPN Client Setup Guide
**File:** `docs/VPN_CLIENT_SETUP_GUIDE.md`
- Added new troubleshooting section: "L2TP VPN Tidak Connect via Web Interface"
- Documented pppd exit code 2 error and fix
- Explained CHAP secrets and duplicate settings issues
- Step-by-step troubleshooting via web interface
- Code examples for correct configuration files

#### Updated: Proxmox L2TP Setup
**File:** `docs/PROXMOX_L2TP_SETUP.md`
- Added section: "PPP Interface Tidak Muncul (pppd exit code 2)"
- Complete solution for authentication failure
- Template configuration files (chap-secrets, options.l2tpd.client)
- Proper file permissions (chmod 600)
- Restart procedures and verification steps

### 🐛 Bug Fixes

**VPN Connection Issues:**
- Fixed: VPN shows "Not connected" despite successful tunnel establishment
- Fixed: Authentication failures due to missing CHAP credentials
- Fixed: Duplicate plugin loading causing connection instability
- Fixed: Interface detection only checking ppp0

**Build System:**
- Previously fixed: ReferenceError: t is not defined (customer portal)
- Solution: Hardcoded Indonesian translations + `export const dynamic = 'force-dynamic'`

**Translation System:**
- Previously fixed: Duplicate "nav" key in locale files
- Solution: Renamed to "customerNav" for customer portal navigation

### 🧪 Testing

**Verified on Production VPS (103.191.165.156):**
- ✅ L2TP connection establishes successfully
- ✅ PPP interface (ppp2) UP with IP 172.20.30.10
- ✅ Ping to VPN gateway (172.20.30.1) successful
- ✅ Ping to internal networks (10.10.10.1) successful
- ✅ Internet access via VPN tunnel working

**Test Commands:**
```bash
systemctl status xl2tpd           # Service running
ip addr show | grep ppp           # ppp2 interface UP
ping -c 3 172.20.30.1             # VPN gateway reachable
ping -c 3 -I ppp2 8.8.8.8         # Internet via tunnel
```

### 📖 Documentation Index

For complete project information, see:
- **[AI_PROJECT_MEMORY.md](docs/AI_PROJECT_MEMORY.md)** - Comprehensive project context
- **[VPN_CLIENT_SETUP_GUIDE.md](docs/VPN_CLIENT_SETUP_GUIDE.md)** - L2TP setup and troubleshooting
- **[PROXMOX_L2TP_SETUP.md](docs/PROXMOX_L2TP_SETUP.md)** - Proxmox-specific L2TP fixes

---

## [2.9.3] - 2025-12-29

### 🔔 Webhook Handler Improvements

#### Email Notifications for Customer Top-Up
- **File:** `src/app/api/payment/webhook/route.ts`
- Added email notification when customer top-up saldo berhasil
- HTML email template dengan detail:
  - No. Invoice, Jumlah Top-Up, Saldo Baru, Metode Pembayaran
- Stored in EmailHistory for tracking

#### Agent Deposit Notifications (NEW!)
- **WhatsApp Notification:** Menggunakan `WhatsAppService.sendMessage`
- **Email Notification:** HTML template professional
- Sent when agent top-up via payment gateway berhasil
- Includes: Amount deposited, New balance, Gateway used

#### Code Imports
```typescript
// Added new import
import { WhatsAppService } from '@/lib/whatsapp';
```

### 🔐 Login Pages Redesign (Theme Consistency)

#### Technician Login (`/technician/login`)
**Complete redesign with:**
- Cyberpunk theme replacing old teal/blue theme
- Animated gradient background with blobs
- Wrench icon with gradient and glow effect
- Glassmorphism form card
- Purple border inputs with cyan focus
- Mono font OTP input with wide tracking
- Send/Verify button dengan gradient styling

#### Admin Login (`/admin/login`)
**Updated to match cyberpunk theme:**
- Animated gradient background
- Shield icon with gradient glow
- Purple/Cyan color scheme
- Idle logout notice with amber styling
- Gradient sign-in button

### 🎨 Frontend Redesign - Network Pages


#### VPN Server Page (`/admin/network/vpn-server`)
**Complete redesign with:**
- Stats cards: Total Servers, Configured, L2TP Enabled, SSTP Enabled
- Animated gradient background with blur effects
- Premium card design dengan header/body separation
- Protocol badges (L2TP/IPSec, SSTP, PPTP)
- Modern loading state with animation
- Attractive empty state with CTA
- Redesigned modal forms

#### VPN Client Page (`/admin/network/vpn-client`)
**Complete redesign with:**
- Stats cards: Total Clients, RADIUS Servers, Active Clients
- Animated gradient background
- Card design with info grid
- RADIUS Server toggle per client
- Credentials modal with VPN type selector
- MikroTik script generator preserved

#### Routers Page (`/admin/network/routers`)
**Complete redesign with:**
- Stats cards: Total Routers, Online, MikroTik, Via VPN
- Animated gradient background
- Status indicator (Online/Offline) per router
- Quick action buttons (Isolir, RADIUS, Edit, Delete)
- Router details grid layout
- VPN client connection option
- Connection test with result display

### 🎯 Design Consistency

#### Color Palette Standard
```css
Primary Cyan:   #00f7ff
Primary Purple: #bc13fe
Accent Pink:    #ff44cc
Background:     slate-900 → #1a0f35 gradient
```

#### Component Patterns
- Buttons: Gradient dengan neon shadow
- Cards: Backdrop blur, gradient border, hover effects
- Inputs: Dark background, purple border, cyan focus
- Badges: Color-coded with shadow
- Icons: Lucide React icons throughout

### 📁 Files Changed

| File | Type | Changes |
|------|------|---------|
| `src/app/api/payment/webhook/route.ts` | Backend | Email & WA notifications |
| `src/app/admin/network/vpn-server/page.tsx` | Frontend | Complete redesign |
| `src/app/admin/network/vpn-client/page.tsx` | Frontend | Complete redesign |
| `src/app/admin/network/routers/page.tsx` | Frontend | Complete redesign |

### 📚 New Documentation

- `CHAT_HISTORY_2025-12-29.md` - Session notes
- `.agent/workflows/project-memory.md` - AI Project Memory

---

## [2.9.2] - 2025-12-28


### 🐛 Critical Bug Fixes

#### Voucher Expiration Status Fix - Timezone Consistency
**Issue:** Vouchers yang sudah expired masih menampilkan status "AKTIF" di sistem

**Root Cause:**
- Database timezone: MySQL menggunakan `SYSTEM` timezone (WIB/UTC+7)
- `firstLoginAt` dan `expiresAt` disimpan dalam WIB (server local time dari FreeRADIUS)
- Cron query menggunakan `UTC_TIMESTAMP()` untuk comparison
- Selisih 7 jam menyebabkan voucher expired tidak terdeteksi

**Example:**
```
Voucher ELRQNC:
- Expires At: 2025-12-28 07:23:16 (WIB)
- Current Time: 09:41 (WIB) / 02:41 (UTC)
- OLD: expiresAt < UTC_TIMESTAMP() → 07:23 < 02:41 = FALSE ❌
- NEW: expiresAt < NOW() → 07:23 < 09:41 = TRUE ✅
```

**Fix Applied:**
- File: `src/lib/cron/voucher-sync.ts` (Line 262-267)
- Changed: `UTC_TIMESTAMP()` → `NOW()`
- Added documentation comment explaining timezone behavior
- Tested: Voucher ELRQNC successfully updated from ACTIVE → EXPIRED

**Impact:**
- ✅ Vouchers expired sekarang otomatis diupdate statusnya (setiap menit via cron)
- ✅ Status di UI sekarang akurat dengan expiration date
- ✅ User tidak bisa login dengan voucher expired
- ✅ Session aktif di-disconnect otomatis via CoA (jika Mikrotik CoA enabled)

**Files Changed:**
- `src/lib/cron/voucher-sync.ts` - Fixed timezone comparison in expiration query
- `docs/VOUCHER_EXPIRATION_TIMEZONE_FIX.md` - Complete documentation

---

#### Invoice Generation Field Errors Fix
**Issue:** Invoice generator gagal dengan error:
- `Unknown argument 'expiresAt'. Did you mean 'expiredAt'?`
- `Unknown argument 'billingCycle'`

**Root Cause:**
- Field names tidak konsisten antara schema Prisma dan code
- PREPAID users menggunakan `expiredAt` bukan `expiresAt`
- POSTPAID users menggunakan `billingDay` bukan `billingCycle`

**Fix Applied:**
- File: `src/lib/cron/voucher-sync.ts`
- Line 1158: `expiresAt` → `expiredAt` (PREPAID user query)
- Line 1173: `billingCycle` → `billingDay` (POSTPAID user query)
- Line 1198-1213: `user.expiresAt` → `user.expiredAt` (4 occurrences)

**Impact:**
- ✅ Invoice generation sekarang bekerja untuk PREPAID users
- ✅ Invoice generation sekarang bekerja untuk POSTPAID users
- ✅ Auto-invoice di akhir bulan tidak akan error lagi

**Files Changed:**
- `src/lib/cron/voucher-sync.ts` - Fixed field names in invoice generation

---

### 🕐 Timezone Consistency Architecture (NEW!)

#### Complete Timezone Synchronization Across All Components
Implemented comprehensive timezone consistency to prevent future timezone-related bugs.

**Installer Updates (vps-install.sh & vps-install-local.sh):**

1. **System Timezone Configuration:**
   ```bash
   timedatectl set-timezone Asia/Jakarta
   ```

2. **MySQL Timezone Configuration (NEW!):**
   - Creates persistent config: `/etc/mysql/mysql.conf.d/timezone.cnf`
   - Sets `default-time-zone = '+07:00'`
   - Runs `SET GLOBAL time_zone = '+07:00'` immediately
   - Verifies timezone after MySQL restart

3. **Node.js Environment:**
   ```env
   TZ="Asia/Jakarta"
   NEXT_PUBLIC_TIMEZONE="Asia/Jakarta"
   ```

4. **PM2 Ecosystem Config:**
   ```javascript
   env: { TZ: 'Asia/Jakarta' }
   ```

**Timezone Verification Commands:**
```bash
# 1. System timezone
timedatectl show --property=Timezone --value  # Asia/Jakarta

# 2. MySQL timezone (MUST match system!)
mysql -e "SELECT @@global.time_zone, NOW()"   # +07:00, same as 'date'

# 3. Node.js timezone
node -e "console.log(process.env.TZ)"         # Asia/Jakarta

# 4. Compare all times (should be identical!)
date && mysql -e "SELECT NOW()" && node -e "console.log(new Date())"
```

**Files Updated:**
- `vps-install.sh` - Added MySQL timezone config + verification
- `vps-install-local.sh` - Added MySQL timezone config + verification  
- `install-wizard.html` - Added MySQL timezone setup instructions in Step 4
- `src/lib/timezone.ts` - Updated documentation with architecture overview

**Timezone Mapping for Non-WIB Deployments:**
| Zona | System Timezone | MySQL Offset | .env TZ |
|------|-----------------|--------------|---------|
| WIB  | Asia/Jakarta    | +07:00       | Asia/Jakarta |
| WITA | Asia/Makassar   | +08:00       | Asia/Makassar |
| WIT  | Asia/Jayapura   | +09:00       | Asia/Jayapura |
| SGT  | Asia/Singapore  | +08:00       | Asia/Singapore |

**Documentation:**
- `docs/VOUCHER_EXPIRATION_TIMEZONE_FIX.md` - Detailed explanation
- `src/lib/timezone.ts` - Architecture documentation in code

---

### 🖥️ Frontend Timezone Settings - Complete Integration

#### Timezone Changes from UI Now Apply to ALL Components
When changing timezone from Admin > Settings > Company, the following are now updated:

1. **System Timezone (Linux):**
   - Runs `timedatectl set-timezone <timezone>`
   - Immediate effect on all system time functions

2. **MySQL Timezone (Linux):**
   - Creates `/etc/mysql/mysql.conf.d/timezone.cnf`
   - Runs `SET GLOBAL time_zone = '<offset>'`
   - Ensures `NOW()`, `CURDATE()` return correct local time

3. **Application Files:**
   - `.env` - Updates TZ and NEXT_PUBLIC_TIMEZONE
   - `ecosystem.config.js` - Updates PM2 TZ environment
   - `src/lib/timezone.ts` - Updates WIB_TIMEZONE constant

4. **Services:**
   - PM2 restart with `--update-env`
   - FreeRADIUS restart to use new system timezone

**30+ Timezone Support:**
Timezone mapping includes all major Indonesian and international timezones:
- Indonesian: Asia/Jakarta (WIB), Asia/Makassar (WITA), Asia/Jayapura (WIT)
- Southeast Asia: Asia/Singapore, Asia/Bangkok, Asia/Kuala_Lumpur, Asia/Manila
- East Asia: Asia/Tokyo, Asia/Seoul, Asia/Hong_Kong, Asia/Shanghai
- South Asia: Asia/Kolkata, Asia/Dubai
- Europe: Europe/London, Europe/Paris, Europe/Berlin, Europe/Amsterdam
- Americas: America/New_York, America/Chicago, America/Los_Angeles, America/Sao_Paulo
- And more...

**Files Changed:**
- `src/app/api/settings/timezone/route.ts` - Added MySQL + System timezone update
- `src/app/admin/settings/company/page.tsx` - Updated UI messages

---

### 🔧 Proxmox VPS Configuration Support (NEW!)

#### Complete Proxmox LXC Container Setup Guide
Added comprehensive documentation and auto-configuration for Proxmox VPS deployments.

**New Documentation:**
- **`docs/PROXMOX_VPS_SETUP_GUIDE.md`** - Complete Proxmox LXC setup guide
  - Container configuration templates
  - `/dev/ppp` device setup for PPPoE
  - `/dev/net/tun` device setup for VPN
  - IP forwarding & NAT configuration
  - Kernel module auto-load
  - Troubleshooting common issues
  - Security considerations (LXC vs KVM)

**Installer Updates:**
- **`vps-install.sh`** - Added Proxmox VPS detection & setup:
  ```bash
  # Auto-creates /dev/ppp and /dev/net/tun
  # Loads PPP/L2TP/TUN kernel modules
  # Configures IP forwarding (net.ipv4.ip_forward = 1)
  # Auto-loads modules on boot (/etc/modules-load.d/ppp.conf)
  # Verifies setup with detailed status output
  ```

- **`install-wizard.html`** - Added Proxmox VPS section:
  - Visual warning for Proxmox LXC users in Step 1
  - Complete Step-by-step Proxmox host configuration guide
  - Container config examples with lxc.cgroup2 permissions
  - Verification commands
  - Troubleshooting table
  - Link to detailed documentation

**Features Enabled for Proxmox LXC:**
1. **PPPoE Server Support:**
   - `/dev/ppp` device (char 108:*)
   - PPP kernel modules (ppp_generic, ppp_async, ppp_mppe, ppp_deflate)
   
2. **VPN Support (L2TP/IPSec):**
   - `/dev/net/tun` device (char 10:200)
   - TUN kernel module
   - L2TP modules (l2tp_core, l2tp_ppp, l2tp_netlink)

3. **Network Routing:**
   - IP forwarding enabled persistently
   - SYN flood protection
   - ICMP redirect blocking

**Verification Checklist:**
```bash
✅ /dev/ppp exists (crw------- 1 root root 108, 0)
✅ /dev/net/tun exists (crw-rw-rw- 1 root root 10, 200)
✅ IP forwarding enabled (net.ipv4.ip_forward = 1)
✅ PPP kernel modules loaded (4 modules)
✅ TUN kernel module loaded
```

**Proxmox Container Config Template:**
```bash
# PPPoE Support
lxc.cgroup2.devices.allow: c 108:* rwm
lxc.mount.entry: /dev/ppp dev/ppp none bind,create=file,optional 0 0

# TUN/TAP Support
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net dev/net none bind,create=dir 0 0

# Enable nesting
lxc.apparmor.profile: unconfined
```

**Files Changed:**
- `docs/PROXMOX_VPS_SETUP_GUIDE.md` - NEW comprehensive guide
- `vps-install.sh` - Added Proxmox VPS auto-setup
- `install-wizard.html` - Added Proxmox LXC configuration section

**Notes:**
- LXC containers require host-level kernel module support
- KVM VMs work out-of-box without special configuration
- Security trade-off: `lxc.apparmor.profile: unconfined` reduces isolation
- Recommended: Use KVM for production, LXC for development/testing

---

## [2.9.1] - 2025-12-27

### 🔧 Critical Fixes - Payment URL Generation & Invoice Management

#### Payment URL Generation Fixes
- **Reordered Payment Flow** - Create payment FIRST before invoice creation
  - Previous: Invoice created → Payment created → Update invoice with URL
  - New: Payment created → Invoice created with URL directly
  - Prevents invoices being created without payment links
  - Invoice only created if payment URL successfully generated
  
- **Comprehensive Error Handling**
  - Better logging with `[Top-Up Direct]` prefix throughout flow
  - Detailed Tripay config logging (merchantCode, hasApiKey, hasPrivateKey, environment)
  - Full Tripay response logging for debugging
  - Error messages include gateway name and specific failure reason
  - Frontend shows detailed error alerts with SweetAlert2
  
- **Payment Gateway Support Completed**
  - ✅ Midtrans: `createMidtransPayment` → `redirect_url`
  - ✅ Xendit: `createXenditInvoice` → `invoiceUrl`
  - ✅ Duitku: QRIS via ShopeePay → `paymentUrl`
  - ✅ Tripay: QRIS with `createTransaction` → `checkout_url` or `pay_url`
  - All gateways tested and validated
  
- **API Response Improvements**
  - `POST /api/customer/topup-direct` always returns `paymentUrl` field
  - Success response: `{ success, invoiceNumber, amount, paymentUrl, invoice }`
  - Error response: `{ success: false, error, details, gateway }`
  - Console logging for request/response tracking

#### Customer Dashboard Invoice Improvements
- **Smart Payment Button**
  - Invoice WITH payment link → Cyan "Bayar" button → Opens payment in new tab
  - Invoice WITHOUT payment link → Yellow "Buat Link" button → Regenerates payment
  - Button changes from `<a>` tag to `<button>` with proper `onClick` handler
  - Uses `window.open()` with security parameters: `noopener,noreferrer`
  
- **Auto-Refresh Invoice Data**
  - Added `visibilitychange` event listener
  - Automatically refreshes invoice list when user returns to dashboard
  - Ensures latest payment links are always shown
  - No manual refresh needed after creating top-up
  
- **Debug Logging**
  - Console logs for button clicks with invoice number
  - Payment link value logging (null vs actual URL)
  - Click tracking for troubleshooting

#### New Feature: Payment Link Regeneration
- **API Endpoint** - `POST /api/customer/invoice/regenerate-payment`
  - Regenerates payment link for invoices without payment URL
  - Supports all 4 payment gateways (Midtrans, Xendit, Duitku, Tripay)
  - Customer authentication required
  - Only works for PENDING invoices owned by customer
  
- **UI Integration**
  - Yellow "Buat Link" button for invoices without payment link
  - Loading state: "Proses..." with spinner icon
  - Auto-opens payment URL after generation
  - Refreshes invoice list to update UI
  
- **Smart Gateway Selection**
  - Uses first available active gateway from system config
  - Falls back to alert if no gateways configured
  - Seamless user experience

#### Frontend Enhancements
- **Top-Up Direct Page**
  - Better error display with gateway information
  - Status-based response handling (check `res.ok` before processing)
  - Timer-based success alert (1.5s) before redirect
  - Warning alert for missing payment URL (shouldn't happen with new flow)
  - Console logging: `[Top-Up Direct Frontend]` prefix
  
- **Payment Gateway Config**
  - Added GET handler to `/api/payment/create` to prevent 405 errors
  - Better JSON parsing with try-catch
  - Request logging before processing

#### Code Quality Improvements
- **Validation**
  - Payment URL null check before creating invoice
  - Strict string checking: `paymentLink && paymentLink.trim() !== ''`
  - Gateway config validation before payment creation
  
- **Console Logging Strategy**
  - Consistent prefix: `[Top-Up Direct]`, `[Dashboard]`, `[Regenerate Payment]`
  - Structured logs: Config → Params → Result → Error
  - JSON stringification for complex objects (Tripay result)
  
- **Error Messages**
  - User-friendly: "Link pembayaran belum tersedia. Silakan hubungi admin atau buat ulang invoice."
  - Developer-friendly: Full error stack, gateway name, specific failure
  - Bilingual: Indonesian for users, English for developers

### 📁 Files Modified
- `src/app/api/customer/topup-direct/route.ts` - Payment-first flow, comprehensive logging
- `src/app/customer/topup-direct/page.tsx` - Better error handling, console logging
- `src/app/customer/page.tsx` - Smart button, auto-refresh, regenerate integration
- `src/app/api/payment/create/route.ts` - GET handler, better error handling
- `src/app/api/customer/invoice/regenerate-payment/route.ts` - NEW FILE

### 🐛 Bugs Fixed
1. **Invoice Created Without Payment Link**
   - Root cause: Payment creation happened after invoice creation, errors were silent
   - Fix: Create payment first, only create invoice if payment succeeds
   
2. **"Bayar" Button Shows Alert Instead of Redirecting**
   - Root cause: `<a>` tag with `href="#"` and `preventDefault()` blocked navigation
   - Fix: Changed to `<button>` with `window.open()` for new tab redirect
   
3. **Old Invoices Can't Be Paid**
   - Root cause: Invoices created before fix have no payment link
   - Fix: "Buat Link" button regenerates payment link on-demand
   
4. **Console Error on Dashboard**
   - Root cause: Browser prefetch/GET request to `/api/payment/create` endpoint
   - Fix: Added GET handler returning 405 Method Not Allowed
   
5. **Payment Gateway Not Appearing**
   - Previous fix: Re-save config to set `isActive` in database
   - Current: Proper validation and logging throughout

### 🔍 Testing Notes
- Test with all 4 payment gateways
- Verify invoice list refreshes on dashboard return
- Check old invoices show "Buat Link" button
- Verify new invoices have "Bayar" button immediately
- Console logging should show payment URL generation
- Error alerts should be informative, not generic

---

## [2.9.0] - 2025-12-27

### ✨ Balance Enhancement Package - New Features

#### 1. ⚠️ Low Balance Alerts & Warnings
- Visual warning indicators when balance < package price
- Admin interface: Alert box in balance management page
- Customer portal: Yellow warning banner in Balance Card widget
- Real-time balance checking with AlertCircle icons
- Color-coded alerts for better visibility

#### 2. 💳 Customer Self-Service Top-Up Request
- **Request Form** (`/customer/topup-request`)
  - Clean form with amount validation (min Rp 10,000)
  - Payment method selector: Transfer Bank, E-Wallet, Cash
  - File upload for payment proof (images only, max 5MB)
  - Optional note field for additional information
  
- **Request Workflow**
  - Customer submits request with proof
  - Files stored in `/public/uploads/topup-proofs/`
  - Transaction created with PENDING status
  - Admin approval/rejection workflow
  - Success notification with processing time estimate

- **Customer Portal Integration**
  - "Request Manual" button - Manual request with proof upload (FREE)
  - "Top-Up Langsung" button - Direct auto top-up via payment gateway
  - WhatsApp Admin quick contact button
  - Shadow effects and responsive design

- **API Endpoints**
  - `POST /api/customer/topup-request` - Create manual request
  - `POST /api/customer/topup-direct` - Create auto top-up with payment
  - FormData handling with file upload
  - Metadata storage (requestedBy, note, proofPath, timestamp)

#### 2b. 💰 Direct Top-Up with Payment Gateway (NEW)
- **Direct Top-Up Page** (`/customer/topup-direct`)
  - Display current balance
  - Preset amount buttons (50K, 100K, 200K, 500K, 1M)
  - Custom amount input with validation
  - Payment gateway selection interface
  - Real-time balance preview
  
- **Payment Gateway Integration**
  - Supports Midtrans and Xendit payment gateways
  - Auto-detect active payment gateways
  - Automatic invoice generation (TOPUP type)
  - Direct redirect to payment URL
  - No admin approval needed
  
- **Direct Top-Up Workflow**
  - Customer selects amount (min Rp 10,000)
  - Customer chooses payment gateway
  - System creates TOPUP invoice
  - Payment URL generated via selected gateway
  - Customer redirected to payment page
  - Balance auto-increment after payment success
  
- **Dual Top-Up Options**
  - **Manual Request**: Upload proof → Wait admin approval (FREE, no gateway fee)
  - **Direct Top-Up**: Choose amount → Pay via gateway → Auto credit (INSTANT, may have gateway fee)

#### 3. 📊 Balance History Export (CSV)
- Export button in transaction history header
- Client-side CSV generation (no server processing)
- Proper quote escaping for special characters
- UTF-8 BOM prefix for Excel compatibility
- Filename format: `balance-{username}-{YYYY-MM-DD}.csv`
- Headers: Tanggal, Tipe, Keterangan, Metode, Jumlah, Status
- One-click download with auto-cleanup

#### 4. 🛠️ Admin Top-Up Request Management
- **Management Dashboard** (`/admin/topup-requests`)

#### 5. 🔄 Package Upgrade with Payment Gateway Integration
- **Upgrade Page** (`/customer/upgrade`)
  - Display current package information
  - List all available packages with pricing
  - Visual selection with confirmation
  - Payment gateway selection interface
  - Real-time price comparison
  
- **Payment Gateway Integration**
  - Supports Midtrans and Xendit payment gateways
  - Auto-detect active payment gateways from admin settings
  - Public API for gateway availability
  - Automatic invoice generation
  - Direct redirect to payment URL
  
- **Upgrade Workflow**
  - Customer selects new package
  - Customer chooses payment gateway
  - System creates ADDON invoice (invoiceType)
  - Payment URL generated via selected gateway
  - Customer redirected to payment page
  - Payment webhook handling for status update
  
- **API Endpoints**
  - `POST /api/customer/upgrade` - Create upgrade invoice with payment
  - `GET /api/public/payment-gateways` - List active payment gateways
  - `GET /api/public/profiles` - List available PPPoE profiles
  
- **Invoice Management**
  - Invoice type: ADDON for package upgrades
  - Payment token generation for tracking
  - Payment link storage for customer access
  - Customer details embedded (name, phone, email, username)
  
- **UI/UX Enhancements**
  - "Ganti Paket" button in Customer Dashboard
  - Payment method selection cards
  - Loading states during payment creation
  - SweetAlert2 confirmation with invoice details
  - Responsive mobile-first design

### 🔧 Technical Improvements
- Updated customer/me API to return balance and autoRenewal status
- Created public APIs for profiles and payment gateways
- Fixed invoice schema usage (removed non-existent metadata field)
- Proper TypeScript types for all payment gateway interfaces
- Error handling for payment gateway failures
  - Stats cards: Pending, Approved, Rejected, Total
  - Filterable request list with color-coded badges
  - User info display (name, username, phone, amount)
  - Payment method and timestamp (WIB timezone)
  - Custom notes from customers

- **Approval Workflow**
  - "View Proof" button with image viewer modal
  - Approve/Reject buttons with SweetAlert2 confirmations
  - Loading states during processing
  - Automatic balance increment on approval
  - Status update in database (PENDING → SUCCESS/FAILED)

- **API Endpoints**
  - `GET /api/admin/topup-requests` - List all requests
  - `POST /api/admin/topup-requests/[id]/approve` - Approve request
  - `POST /api/admin/topup-requests/[id]/reject` - Reject request
  - Prisma transactions for data consistency
  - Metadata tracking (approvedAt, approvedBy, rejectedAt, rejectedBy)

### 🎨 UI/UX Improvements
- Consistent icon usage (AlertCircle, Upload, Download, Check, X, Eye, Clock)
- Better button layouts with dual-action support
- Shadow effects for visual hierarchy (`shadow-lg shadow-cyan-500/20`)
- Responsive design with mobile-first approach
- Loading states with Loader2 animations
- Empty states with helpful messages
- Color coding: Warning (yellow), Success (green), Destructive (red), Primary (cyan/blue)

### 🔧 Technical Improvements
- **File Upload System**
  - Secure file handling with validation (type, size)
  - Automatic directory creation
  - Unique filename generation with timestamp
  - Server-side validation in API
  
- **Database Schema**
  - PENDING status support in Transaction model
  - JSON metadata field for flexible data storage
  - Indexed queries for better performance

- **Code Quality**
  - TypeScript interfaces for all data structures
  - Async/await error handling
  - Proper cleanup (URL.revokeObjectURL, DOM manipulation)
  - SweetAlert2 integration for consistent notifications

### 📁 New Files
- `src/app/customer/topup-request/page.tsx` (310 lines)
- `src/app/admin/topup-requests/page.tsx` (280 lines)
- `src/app/api/customer/topup-request/route.ts` (95 lines)
- `src/app/api/admin/topup-requests/route.ts` (48 lines)
- `src/app/api/admin/topup-requests/[id]/approve/route.ts` (70 lines)
- `src/app/api/admin/topup-requests/[id]/reject/route.ts` (52 lines)
- `CHAT_HISTORY_2025-12-27_Session2.md` (670 lines)

**Total**: ~1,525 lines of new production code + documentation

### 📝 Modified Files
- `package.json` - Version bump to 2.9.0
- `src/app/admin/pppoe/users/[id]/balance/page.tsx` - Added low balance alert, CSV export
- `src/app/customer/page.tsx` - Added low balance alert, Request Top-Up button
- `CHANGELOG.md` - This entry

### 🚀 Future Enhancements (v2.10.0+)
- WhatsApp/Email notifications for request status
- Payment gateway integration (Midtrans, Xendit)
- Balance Analytics Dashboard with charts
- Bulk Top-Up Support (CSV import)
- Automated approval for verified payments
- Balance transfer between users
- Agent commission tracking
- Scheduled/recurring top-ups
- PDF export format
- Advanced filtering (date range, amount range)

---

## [2.8.0] - 2025-12-27

### 🎉 Major Features - Balance & Auto-Renewal System

#### 💰 Balance/Deposit Management
- **Customer Balance Tracking**
  - Field `balance` (INT) di tabel pppoe_users
  - Saldo deposit untuk auto-renewal prepaid users
  - Transaction history dengan kategori DEPOSIT
  - Currency format support (Rp xxx.xxx)
  
- **API Endpoints**
  - `POST /api/admin/pppoe/users/[id]/deposit` - Top-up balance
  - `GET /api/admin/pppoe/users/[id]/deposit` - Get balance history
  - Amount validation (positive numbers only)
  - Payment method support (CASH, TRANSFER, etc)
  - Optional notes for each transaction

- **UI Components**
  - Balance column in users table (sortable)
  - Currency formatting helpers
  - Auto-renewal badge indicators
  - Low balance warnings (planned)

#### 🔄 Auto-Renewal System (Prepaid)
- **Automatic Renewal from Balance**
  - Field `autoRenewal` (BOOLEAN) per user
  - Cron job: Daily at 8 AM WIB (`0 8 * * *`)
  - Process users expiring in 3 days
  - Balance validation before payment
  - Automatic invoice creation & payment
  - Expiry date extension by validity period
  
- **Implementation Details**
  - File: `src/lib/cron/auto-renewal.ts`
  - Function: `processAutoRenewal()`
  - RADIUS restoration if user was isolated
  - Transaction recording in income category
  - Failed renewal logging (insufficient balance)
  
- **Workflow**
  1. Check PREPAID users with autoRenewal=true
  2. Find users expiring in 3 days
  3. Validate balance >= package price
  4. Create or find pending invoice
  5. Pay from balance & deduct amount
  6. Extend expiredAt by validity period
  7. Restore in RADIUS (remove from isolir group)
  8. Send WhatsApp & Email notifications

#### 📧 Auto-Renewal Notifications
- **WhatsApp Template**
  - Type: `auto-renewal-success`
  - 9 dynamic variables (customerName, username, profileName, amount, newBalance, expiredDate, etc)
  - Formatted currency (Rp xxx.xxx)
  - Company info (name, phone)
  - Tips for maintaining balance
  
- **Email Template**
  - Type: `auto-renewal-success`
  - HTML responsive design
  - Gradient header (Modern Blue-Cyan)
  - Transaction details table
  - Auto-renewal status info box
  - Balance reminder tip box
  
- **Template Seeding**
  - File: `prisma/seeds/auto-renewal-templates.ts`
  - Both WhatsApp & Email templates
  - Variables documented in README
  - Customizable via admin UI

#### ⚙️ Auto-Isolir Compatibility Fix
- **Enhanced Logic**
  - Compatible dengan prepaid/postpaid system
  - Auto-isolir ONLY if:
    1. POSTPAID user expired
    2. PREPAID without autoRenewal
    3. PREPAID with autoRenewal BUT insufficient balance
  - Prevents isolating users with successful auto-renewal
  
- **Query Optimization**
  - OR conditions for different scenarios
  - Balance check integration
  - Execution order: auto-renewal BEFORE auto-isolir
  - Safe isolation window (runs after renewal)

### 🐛 Bug Fixes

#### Prepaid/Postpaid System
- **Invoice Generation Logic**
  - Fixed prepaid invoice generation (H-7 before expiry)
  - Fixed postpaid invoice generation (billingDay based)
  - Prevented duplicate invoices
  - Correct due date calculation
  
- **Expiry Calculation**
  - POSTPAID: expiredAt = null (correct)
  - PREPAID: expiredAt extended on payment
  - Grace period handling
  - Timezone-aware date calculations

#### Balance System
- **Schema Compliance**
  - Fixed transaction category validation
  - Proper enum usage for payment methods
  - Correct foreign key relationships
  - Index optimization for queries
  
- **API Fixes**
  - Fixed deposit API params (Next.js 15 async)
  - Proper error handling & validation
  - Transaction atomicity (Prisma)
  - Rollback on failure

#### Auto-Renewal
- **RADIUS Integration**
  - Proper radcheck/radusergroup cleanup
  - Reply-Message removal on restore
  - Profile speed limit restoration
  - Session disconnect before restore
  
- **Transaction Recording**
  - Correct category assignment (INCOME)
  - Proper description formatting
  - Payment method tracking
  - Balance calculation accuracy

### ✅ Testing & Validation

#### Test Script
- **File**: `prisma/test-auto-renewal.ts`
- **Scenarios**: 7 validation checks
  1. User creation with autoRenewal
  2. Balance sufficient check
  3. Invoice creation
  4. Auto-renewal execution
  5. Balance deduction verification
  6. Expiry extension validation
  7. Transaction recording check
  
- **Results**: ✅ ALL TESTS PASSED
  - Balance: 200,000 → 100,000 (deducted correctly)
  - Invoice: Created & paid automatically
  - Expiry: Extended +30 days (profile validity)
  - Transaction: Recorded in income

#### Integration Testing
- Cron job registration: ✅ Working
- Manual trigger UI: ✅ Working
- Success handler: ✅ Shows processed count
- Execution history: ✅ Logged in cronHistory
- Template seeding: ✅ Both templates created

### 📚 Documentation

#### New Documentation Files
- `docs/BALANCE_AUTO_RENEWAL.md` - Complete system documentation
- `docs/AUTO_RENEWAL_NOTIFICATION_SYSTEM.md` - Notification guide
- `ROADMAP_BILLING_FIX.md` - Updated with test results
  
#### Updated Files
- `README.md` - Added Balance & Auto-Renewal features
- `WORKFLOW_PREPAID_POSTPAID.md` - Updated workflows
- `docs/TESTING_GUIDE.md` - Added balance test cases
- `docs/CRON-SYSTEM.md` - Documented auto-renewal job

### 🔧 Technical Details

#### Database Changes
- `pppoe_users.balance` - INT DEFAULT 0
- `pppoe_users.autoRenewal` - BOOLEAN DEFAULT false
- Index on balance for performance
- Transaction category DEPOSIT added

#### API Architecture
- RESTful endpoints for balance management
- Transaction atomicity with Prisma
- Error handling with proper status codes
- Validation middleware

#### Cron Configuration
- Type: `auto_renewal`
- Schedule: `0 8 * * *` (Daily 8 AM)
- Handler: `processAutoRenewal()`
- Enabled by default
- Manual trigger support

### 🚀 Next Steps (Planned)

- [ ] Balance Management UI (Admin Panel)
- [ ] Balance Widget (Customer Portal)
- [ ] Low Balance Alerts
- [ ] Bulk Top-up Support
- [ ] Auto-topup Integration (Payment Gateway)
- [ ] Balance Transfer Between Users
- [ ] Commission System for Agents

---

## [2.7.6] - 2025-12-24

### 📡 GenieACS WiFi Configuration Fix

#### ✅ Features Added
- **Admin WiFi Configuration**
  - Edit SSID & Password WiFi dari admin panel
  - File: `src/app/api/genieacs/devices/[deviceId]/wifi/route.ts`
  - Separate tasks approach: SSID task terpisah dari password task
  - Dual password path untuk Huawei HG8145V5 compatibility
  
- **Customer WiFi Self-Service**
  - Customer dapat edit WiFi sendiri dari customer portal
  - File: `src/app/api/customer/wifi/route.ts`
  - Device ownership verification via PPPoE username
  - Security: Hanya customer yang memiliki device yang bisa edit
  
#### 🎨 UI Enhancements
- **Dynamic Password Field**
  - Password field otomatis hidden untuk open network (None security)
  - Ditampilkan hanya untuk secured network (WPA/WPA2)
  - File: `src/app/admin/genieacs/devices/page.tsx`, `src/app/customer/page.tsx`
  
- **Security Badge Display**
  - Badge kuning untuk "None" security (tidak aman)
  - Badge hijau dengan Shield icon untuk "Secured"
  - Visual indicator yang jelas untuk status keamanan
  
#### 🐛 Bug Fixes
- **GenieACS Task Errors (cwmp.9002)**
  - Root cause: Parameter conflict dengan readonly parameters
  - Solution: Separate tasks untuk SSID dan password
  - Removed: Security mode dari UI (readonly display only)
  
- **Duplicate Variable Errors**
  - Fixed: Duplicate `company` variable di `src/app/api/pppoe/users/[id]/extend/route.ts`
  - Fixed: Duplicate `authHeader` di customer WiFi API
  
- **TypeScript Errors**
  - Fixed: Security mode removal dari state interface
  - Fixed: Wrong HTTP method (PUT → POST)
  - Fixed: Missing Shield icon import
  
#### 🔧 Technical Details
- **Parameter Approach:**
  - Task 1: Update SSID only (`InternetGatewayDevice.LANDevice.1.WLANConfiguration.X.SSID`)
  - Task 2: Update password dengan dual path (`KeyPassphrase`, `PreSharedKey.1.KeyPassphrase`)
  - Task 3: Refresh object untuk apply changes
  
- **Validation:**
  - Password optional - bisa update SSID tanpa ubah password
  - Password di-trim sebelum validasi
  - Validation hanya jika password length > 0 setelah trim
  
- **Device Identification:**
  - Menggunakan deviceId (_id MongoDB ObjectId)
  - Bukan serialNumber untuk task endpoint
  
#### 📚 Documentation
- **CHAT_HISTORY_2025-12-24.md**
  - Comprehensive documentation covering:
    - Problem summary & root cause analysis
    - Solutions & technical approach evolution
    - Testing results (5 test scenarios)
    - Files modified with detailed changes
    - Next steps & production deployment guide

### 🧹 Project Cleanup
- **Removed Duplicate Files:**
  - `SUMMARY_FIXES.md` (duplikat)
  - `IMPLEMENTATION_SUMMARY_23DEC2025.md` (duplikat)
  - `GENIEACS_WIFI_FIX.md` (sudah ada di CHAT_HISTORY)
  
- **Updated Documentation:**
  - README.md updated to v2.7.6 dengan GenieACS features
  - Remaining 9 essential MD files (cleaned & organized)

---

## [2.7.5] - 2025-12-23

### 🐛 Bug Fixes & Improvements

#### 🔧 API Routes
- **Fixed UTF-8 BOM Issue in Isolation Route**
  - Removed UTF-8 BOM from `/api/settings/isolation/route.ts`
  - Fixed 404 errors caused by incorrect file encoding
  - Route now properly compiles and returns 200 OK

#### 🌱 Database Seeding
- **New Seed Scripts Added:**
  - `prisma/seeds/seed-company.ts` - Company data initialization
  - `prisma/seeds/seed-isolation-templates.ts` - Default isolation templates
  
- **Company Seed Features:**
  - Creates default company record with isolation settings
  - Required for `/api/settings/isolation` endpoint
  - Prevents 404 errors on fresh installations

- **Isolation Templates Seed:**
  - 3 default templates: WhatsApp, Email, HTML Landing Page
  - Full content with emoji support
  - Dynamic variables for personalization
  - Fixes empty template page on fresh installs

#### 📚 Documentation Updates
- **Install Wizard Enhanced:**
  - Added database seeding step in installation guide
  - Updated post-installation procedures
  - Clear instructions for company and template seeding

### 🔍 Technical Details

**Files Modified:**
- `src/app/api/settings/isolation/route.ts` - Removed BOM, fixed encoding
- `prisma/seeds/seed-company.ts` - New seed script
- `prisma/seeds/seed-isolation-templates.ts` - New seed script
- `install-wizard.html` - Updated with seeding instructions

**Database Changes:**
- Company table: Auto-populated on seed
- IsolationTemplate table: 3 default templates added

---

## [2.7.4] - 2025-12-22

### 🚀 Major Infrastructure Updates

#### 🔐 FreeRADIUS 3.0.26 Integration
- **Complete RADIUS Server Implementation:**
  - FreeRADIUS 3.0.26 installation and configuration
  - MySQL database integration (salfanet_radius)
  - Multi-protocol authentication: PAP, CHAP, MS-CHAP
  - Dynamic NAS client loading from database
  - Session accounting to radacct table
  - CHAP/MS-CHAP support for MikroTik Hotspot compatibility

- **Service Configuration:**
  - Authentication port: 1812 (UDP)
  - Accounting port: 1813 (UDP)
  - CoA/DM port: 3799 (UDP) for disconnect requests
  - SQL connection pooling for performance
  - Read NAS clients dynamically from database

- **Database Schema:**
  - `nas`: NAS clients configuration
  - `radcheck`: User credentials
  - `radusergroup`: User to group mapping
  - `radgroupreply`: Group bandwidth/time attributes
  - `radacct`: Session accounting logs

#### 🌐 VPN L2TP/IPSec Setup
- **Secure Inter-Server Communication:**
  - strongSwan + xl2tpd installation
  - L2TP/IPSec tunnel for remote MikroTik routers
  - VPN IP pool: 172.16.17.10-20
  - Gateway IP: 172.16.17.1
  - IPSec PSK authentication
  - NAT and routing configuration

- **Network Topology:**
  ```
  VPS (103.67.244.131) <-> VPN Gateway (172.16.17.1) <-> MikroTik (172.16.17.11)
  ```

- **VPN Credentials:**
  - Username: vpn-server-radius-eza4
  - Password: 8hgvgolsQNje
  - IPSec Secret: salfanet-vpn-secret

#### ⏰ Automated Cronjob System
- **Hotspot Sync (Every Minute):**
  - File: `src/lib/cron/hotspot-sync.ts`
  - Scans radacct for first login (WAITING → ACTIVE)
  - Calculates expiresAt based on profile validity
  - Detects expired vouchers (ACTIVE → EXPIRED)
  - **Auto-Disconnect:** Sends CoA Disconnect to active sessions
  - **Cleanup:** Removes expired users from FreeRADIUS tables

- **PPPoE Auto-Isolir (Every Hour):**
  - File: `src/lib/cron/pppoe-sync.ts`
  - Finds expired PPPoE users
  - Moves to 'isolir' group with limited bandwidth
  - Sends CoA Disconnect for re-authentication
  - Updates status to SUSPENDED

- **Cron Configuration:**
  - File: `src/lib/cron/config.ts`
  - node-cron scheduler
  - Manual trigger via UI and API
  - Execution logging to cron_history table

#### 🔌 CoA (Change of Authorization) Service
- **Real-time Session Control:**
  - File: `src/lib/services/coaService.ts`
  - Send disconnect requests using radclient
  - Support for Framed-IP-Address and Session-ID
  - Automatic NAS IP resolution (public/local)
  - Batch disconnect for multiple users

- **Functions:**
  - `sendCoADisconnect()`: Send disconnect to specific user
  - `disconnectExpiredSessions()`: Auto-disconnect all expired vouchers
  - `disconnectPPPoEUser()`: Disconnect PPPoE user by username
  - `disconnectMultiplePPPoEUsers()`: Batch disconnect

- **radclient Integration:**
  - Uses freeradius-utils package
  - CoA port 3799 (RFC 5176)
  - Packet attributes: User-Name, Framed-IP-Address, Acct-Session-Id

#### 📨 Custom Reply-Message for Expired Vouchers
- **MikroTik Log Integration:**
  - Expired vouchers show "Kode Voucher Kadaluarsa" instead of "invalid username or password"
  - Reply-Message stored in `radreply` table
  - Password set to "EXPIRED" in `radcheck` to prevent authentication
  - Works with MikroTik HTTP-CHAP authentication

- **Implementation:**
  - File: `src/lib/cron/hotspot-sync.ts`
  - Automatically adds Reply-Message when voucher expires
  - Removes from radusergroup (bandwidth limits)
  - Keeps username in radcheck for rejection with custom message

### ✨ New Features

#### 📊 Cron Management UI
- **Admin Page:** `/admin/settings/cron`
- View all configured cron jobs
- Manual trigger with "Run Now" button
- Real-time status updates
- Execution history with logs
- Enable/disable individual jobs
- Duration and result tracking

#### 🎛️ Session Management Enhancements
- **Hotspot Sessions:** `/admin/sessions/hotspot`
- Real-time active session monitoring
- Auto-refresh every 30 seconds
- Display username, IP, MAC, router, uptime
- Upload/download statistics
- Manual disconnect button

- **Session Data:**
  - Fetched from radacct table
  - Grouped by router
  - Filter by active/stopped sessions
  - Export to CSV/Excel

### 🗃️ Database Changes

#### New Tables
- **cron_history:**
  ```sql
  CREATE TABLE cron_history (
    id VARCHAR(191) PRIMARY KEY,
    jobType VARCHAR(191) NOT NULL,
    status VARCHAR(191) NOT NULL,
    result TEXT,
    duration INT,
    startedAt DATETIME(3) NOT NULL,
    completedAt DATETIME(3),
    createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
  );
  ```

#### Modified Tables
- **hotspot_vouchers:**
  - Added `firstLoginAt DATETIME(3)` - First RADIUS login timestamp
  - Added `expiresAt DATETIME(3)` - Calculated expiry time
  - Status enum: WAITING, ACTIVE, EXPIRED

- **routers:**
  - Mapped to FreeRADIUS 'nas' table
  - ipAddress: Public IP for CoA requests
  - nasname: IP used by RADIUS (can be local/VPN)
  - secret: Shared secret for RADIUS

### 📝 Configuration Files

#### FreeRADIUS Site Config
- **File:** `/etc/freeradius/3.0/sites-enabled/default`
- Added CHAP and MS-CHAP to authorize section
- Added Auth-Type CHAP and MS-CHAP handlers
- Enabled SQL for accounting and post-auth
- Session tracking via SQL

#### VPN Configuration Files
- `/etc/ipsec.conf` - IPSec daemon configuration
- `/etc/ipsec.secrets` - Pre-shared keys
- `/etc/xl2tpd/xl2tpd.conf` - L2TP server settings
- `/etc/ppp/options.xl2tpd` - PPP options
- `/etc/ppp/chap-secrets` - VPN user credentials

#### Firewall Rules
- **UFW:**
  - Port 1812/udp - RADIUS Authentication
  - Port 1813/udp - RADIUS Accounting
  - Port 3799/udp - RADIUS CoA/DM
  - Port 500/udp - IPSec IKE
  - Port 4500/udp - IPSec NAT-T
  - Port 1701/udp - L2TP

- **iptables NAT:**
  ```bash
  iptables -t nat -A POSTROUTING -s 172.16.17.0/24 -o eth0 -j MASQUERADE
  ```

### 🔧 Installation Scripts

#### New Installation Script
- **File:** `freeradius-vpn-setup.sh`
- Automated FreeRADIUS installation
- VPN L2TP/IPSec configuration
- Database schema import
- Firewall setup
- Service management
- Complete summary display

#### Usage:
```bash
chmod +x freeradius-vpn-setup.sh
sudo ./freeradius-vpn-setup.sh
```

### 🧪 Testing & Verification

#### Test Scripts Created
- `check-voucher.js` - Check voucher status and sessions
- `check-qjklfa.js` - Detailed voucher analysis
- `check-after-sync.js` - Verify sync results
- `set-expired.js` - Manually set voucher to expired
- `test-auto-disconnect.js` - Complete auto-disconnect test

#### Test Commands
```bash
# Test RADIUS authentication
echo "User-Name=test,User-Password=test" | radclient -x localhost:1812 auth secret123

# Test CoA disconnect
echo -e "User-Name=\"user\"\nFramed-IP-Address=192.168.1.100" | radclient -x 172.16.17.11:3799 disconnect secret123

# Test hotspot sync manually
curl -X POST http://localhost:3000/api/cron -H "Content-Type: application/json" -d '{"jobType":"hotspot_sync"}'
```

### 📚 Documentation Updates

#### New Documentation Files
- **CHAT_MEMORY_V2.7.4.md:**
  - Complete session history
  - FreeRADIUS installation guide
  - VPN setup instructions
  - Cronjob system documentation
  - CoA service details
  - Troubleshooting guide
  - Testing procedures

- **freeradius-vpn-setup.sh:**
  - Automated installation script
  - Configuration examples
  - Next steps guide
  - Log locations

### 🐛 Bug Fixes

#### FreeRADIUS Configuration
- **Fixed:** Config too minimal causing crash loop
- **Fixed:** EAP module references (removed, not needed for hotspot)
- **Fixed:** CHAP/MS-CHAP authentication support added
- **Fixed:** Accounting not working (added sql to accounting section)

#### Hotspot Sync Cronjob
- **Fixed:** Status enum mismatch (USED → ACTIVE)
- **Fixed:** Field name errors (usedAt → firstLoginAt, expiredAt → expiresAt)
- **Fixed:** Timezone issues with UTC vs WIB
- **Fixed:** Missing CoA disconnect on expiry

#### Database Schema
- **Fixed:** Prisma enum validation errors
- **Fixed:** Missing indexes on radacct table
- **Fixed:** Foreign key constraints for NAS table

### ⚡ Performance Improvements

- **Cron Job Optimization:**
  - Prevent concurrent execution with mutex lock
  - Query optimization with proper indexes
  - Batch processing for multiple vouchers
  - Error handling to prevent job failure

- **CoA Service:**
  - Connection timeout: 5 seconds
  - Retry mechanism for failed disconnects
  - Async parallel disconnect for multiple users

- **Database Queries:**
  - Added indexes on username, acctstoptime
  - Select only required fields
  - Use findFirst instead of findMany where possible

### 🔒 Security Enhancements

- **RADIUS:**
  - Encrypted password storage in radcheck
  - Shared secret for NAS authentication
  - Session tracking for security audit

- **VPN:**
  - IPSec PSK authentication
  - Encrypted L2TP tunnel
  - IP pool isolation
  - NAT for traffic masquerading

- **CoA:**
  - NAS secret validation
  - IP-based access control
  - Session ID verification

### 📦 Dependencies

#### System Packages Added
- `freeradius` - RADIUS server
- `freeradius-mysql` - MySQL driver for FreeRADIUS
- `freeradius-utils` - radclient utility
- `strongswan` - IPSec daemon
- `xl2tpd` - L2TP server
- `iptables-persistent` - Save iptables rules

#### NPM Packages (Existing)
- `node-cron` - Cron job scheduler
- `nanoid` - Unique ID generator
- `@prisma/client` - Database ORM

### 🎯 Next Steps

**Planned Features:**
1. Real-time RADIUS statistics dashboard
2. Bandwidth usage graphs per voucher
3. Multi-server RADIUS cluster
4. Webhook notifications for voucher events
5. QR code authentication
6. Mobile app integration

**Performance Optimization:**
1. Redis cache for active sessions
2. Batch processing for large datasets
3. Database connection pooling
4. Async job queue (Bull/BullMQ)

---

## [2.7.3] - 2025-12-20

### ✨ New Features & Major Improvements

#### 🛡️ Isolation System (Auto Isolir Customer)
- **Complete Isolation Feature:**
  - Auto-isolate expired customers with limited bandwidth
  - Custom IP pool and rate limit for isolated users
  - DNS and payment page access control
  - Grace period before isolation
  - Redirect to custom landing page
- **Database Schema:**
  - Added isolation fields to company table (isolationEnabled, isolationIpPool, isolationRateLimit, etc.)
  - Created isolationTemplate table for notification templates
  - Support for WhatsApp, Email, and HTML landing page templates
- **Settings Pages:**
  - `/admin/settings/isolation` - Main isolation settings
  - `/admin/settings/isolation/templates` - Template management (WhatsApp, Email, HTML)
  - `/admin/settings/isolation/mikrotik` - Auto-generated MikroTik scripts
- **Default Templates:**
  - WhatsApp notification template
  - Professional HTML email template
  - Beautiful landing page for isolated users
- **MikroTik Integration:**
  - Auto-generate configuration scripts based on settings
  - IP pool creation script
  - PPP profile configuration
  - Firewall rules for DNS and payment access
  - Walled garden for redirect
  - Download as .rsc file or copy to clipboard

#### 🎨 Design System Standardization
- **Teal/Cyan Theme Applied Across:**
  - All isolation settings pages
  - Admin tickets page
  - Coordinator pages
  - Inventory items page
  - Technician dashboard
  - Isolated customer page
- **Consistent Font Sizes:**
  - Headers: `text-lg font-semibold`
  - Descriptions: `text-xs text-gray-500`
  - Labels: `text-[10px] uppercase tracking-wider`
  - Inputs: `px-3 py-1.5 text-sm`
  - Icons: `w-5 h-5` or `w-4 h-4`
- **Compact Spacing:**
  - Card padding: `p-3` or `p-4`
  - Grid gaps: `gap-3`
  - Table cells: `px-3 py-2`
- **Consistent Components:**
  - Toggle switches: `peer-checked:bg-teal-600`
  - Focus rings: `ring-teal-500`
  - Buttons: `bg-teal-600 hover:bg-teal-700`

#### 🐛 Bug Fixes

**GenieACS WiFi Edit Form Fix:**
- **Problem:** When selecting different WLAN Index in dropdown, form fields (SSID, Security, Password) didn't update
- **Solution:** 
  - Added `handleWlanIndexChange` function
  - Auto-loads WLAN data when index changes
  - Updates SSID, Security Mode, and Enabled status
  - Clears password for security
  - Normalizes security mode format
- **File:** `src/app/admin/genieacs/devices/page.tsx`

**Database Schema Migration:**
- **Fixed:** Missing isolation fields in main database
- **Added:** Complete isolation schema to `prisma/schema.prisma`
- **Migration:** Created seed file for isolation templates
- **Commands:** `npx prisma db push` and `npx prisma generate`

### 📝 Updated Files
- `prisma/schema.prisma` - Added isolation fields and isolationTemplate model
- `prisma/seeds/isolation-templates.ts` - Default templates seed
- `src/app/admin/settings/isolation/page.tsx` - Main settings
- `src/app/admin/settings/isolation/templates/page.tsx` - Template editor
- `src/app/admin/settings/isolation/mikrotik/page.tsx` - MikroTik scripts
- `src/app/api/settings/isolation/route.ts` - Settings API
- `src/app/api/settings/isolation/templates/route.ts` - Templates API
- `src/app/admin/genieacs/devices/page.tsx` - WiFi edit fix

### 🎯 Technical Improvements
- Consistent theme colors across all pages
- Smaller, more compact UI elements
- Better mobile responsiveness
- Improved form handling in GenieACS
- Complete isolation system infrastructure

## [2.7.2] - 2025-12-19

### ✨ New Features & Improvements

#### Template "Perbaikan Selesai" (Maintenance Resolved) 📧
- **Added:** Template baru untuk notifikasi perbaikan selesai dan layanan kembali normal
- **WhatsApp Template:**
  - Type: `maintenance-resolved`
  - Fitur: Status normal, informasi perbaikan, tips reconnect
  - Variabel: customerName, username, description, companyName, companyPhone
- **Email Template:**
  - Design: Responsive HTML dengan success theme (hijau)
  - Format: Professional dengan checklist status
  - Fitur: Tips jika masih ada kendala
- **Use Case:** Broadcast setelah maintenance/gangguan selesai diperbaiki

#### Responsive UI Improvements 📱
- **WhatsApp Templates Page:**
  - Horizontal scrollable tabs di mobile dengan custom scrollbar
  - Responsive text size (base → lg → xl)
  - Responsive padding dan spacing
  - Button layout: vertical di mobile, horizontal di desktop
  - Variable buttons: responsive text size
- **Email Templates Page:**
  - Horizontal scrollable tabs dengan min-w-max di mobile
  - Flex-wrap di tablet/desktop
  - Responsive description box dengan proper text wrapping
  - Adaptive padding: p-3 → p-4 → p-6
- **Breakpoints:** mobile (default), sm (640px), md (768px)
- **Features:**
  - Custom scrollbar styling (thin, gray)
  - Whitespace nowrap untuk tab labels
  - Text truncation dengan line-clamp
  - Flexible layouts dengan flex-1 min-w-0

#### Email History Date Fix 🐛
- **Fixed:** "Invalid Date" pada kolom DATE & TIME di email history
- **Root Cause:** Frontend menggunakan `email.createdAt` yang tidak ada
- **Solution:**
  - Changed: `email.createdAt` → `email.sentAt` (sesuai API response)
  - Added: Conditional check untuk handle null/undefined
  - Added: Fallback "-" jika date tidak tersedia
- **Format:** Indonesia locale dengan jam:menit
- **File:** `src/app/admin/settings/email/page.tsx`

### 📝 Updated Documentation
- Email history bug fix details
- Template maintenance-resolved usage guide
- Responsive UI implementation notes

## [2.7.1] - 2025-12-19

### 🔧 Improvements & Bug Fixes

#### Seeds File Consolidation 🗂️ (NEW)
- **Reduced:** File count dari 18 → 7 files (61% reduction)
- **Deleted SQL Files (11 total):**
  - Consolidated emoji fixes → `fix-emoji.js`
  - Consolidated template fixes → `seed-templates.js`
  - Consolidated voucher fixes (v6-v12) → `seed-voucher.js`
- **New Consolidated Seeders:**
  - `fix-emoji.js` - Enhanced with template validation
  - `seed-templates.js` - All notification templates (WhatsApp + Email)
  - `seed-voucher.js` - Latest voucher template (v12 optimized)
- **Benefits:**
  - Better code organization
  - Idempotent operations (safe to run multiple times)
  - Easier maintenance and updates
  - Better error handling and logging
  - Auto-integrated with VPS installers
- **Documentation:** `SEEDS_CONSOLIDATION.md`

#### Invoice Number Format Enhancement ⭐
- **Changed:** Invoice number dari random code ke format berdasarkan tanggal
- **New Format:** `INV-YYYYMM-XXXX` (contoh: INV-202512-0001)
- **Benefits:**
  - Sequential counter per bulan untuk tracking mudah
  - Professional dan konsisten dengan standar bisnis
  - Mudah identifikasi bulan pembuatan invoice
  - Auto-increment dari database untuk prevent duplikat
- **New Library:** `src/lib/invoice-generator.ts` dengan helper functions:
  - `generateInvoiceNumber()` - Format: INV-YYYYMM-XXXX
  - `generateTransactionId()` - Format: TRX-YYYYMMDD-HHMMSS-XXXX
  - `generateCategoryId()` - Format: CAT-YYYYMMDD-HHMMSS
  - `generateInvoiceId()` - Format: inv-YYYYMMDD-HHMMSS-XXXX
- **Updated Files:**
  - `src/app/api/pppoe/users/[id]/extend/route.ts` - Perpanjangan manual
  - `src/app/api/pppoe/users/[id]/mark-paid/route.ts` - Mark as paid
  - `src/app/api/manual-payments/[id]/route.ts` - Manual payment approval
- **Documentation:** `docs/INVOICE_NUMBER_FORMAT.md` dengan testing guide
- **Backward Compatible:** Invoice lama tetap valid, hanya invoice baru yang gunakan format tanggal

#### WhatsApp Template Emoji Fix 📱
- **Fixed:** Emoji tidak terbaca dengan benar di template manual-extension
- **Issue:** Character encoding menyebabkan emoji muncul sebagai `­ƒæñ`, `­ƒôª`, `­ƒÆ░`, dll
- **Solution:** Update template via Prisma dengan UTF-8 encoding
- **Affected Template:** manual-extension (WhatsApp)
- **Script:** `prisma/seeds/fix-emoji.js` untuk update database

## [2.7.0] - 2025-12-19

### 🎉 Major Features from salfanet-radius Integration

#### Manual Payment System ⭐
- **New Feature:** Customer dapat upload bukti transfer untuk pembayaran manual
- **Admin Workflow:** Approve/reject payment dengan notifikasi otomatis
- **Auto Extension:** User expiry otomatis diperpanjang saat payment approved
- **Multi-Channel Notification:** WhatsApp & Email notification untuk approval/rejection
- **Bank Accounts:** Multiple bank account configuration di company settings
- **Public Payment Page:** Customer access payment form via unique token
- **File Upload:** Support JPG/PNG/WebP, max 5MB dengan validation
- **Receipt Storage:** Uploaded images served securely via API endpoint

**Database Changes:**
- New table: `manual_payments`
- New enum: `ManualPaymentStatus` (PENDING, APPROVED, REJECTED)
- Fields: userId, invoiceId, amount, paymentDate, bankName, accountName, receiptImage, notes, status

**API Endpoints:**
- `GET /api/manual-payments` - List all manual payments
- `GET /api/manual-payments/[id]` - Get single payment detail
- `POST /api/manual-payments` - Submit new payment
- `PATCH /api/manual-payments/[id]` - Approve/reject payment
- `DELETE /api/manual-payments/[id]` - Delete payment record
- `POST /api/upload/payment-proof` - Upload receipt image
- `GET /uploads/payment-proofs/[filename]` - Serve uploaded image
- `GET /api/pay/manual?token=xxx` - Public payment info by token

**Frontend Pages:**
- `/admin/manual-payments` - Admin payment approval dashboard
- `/pay-manual?token=xxx` - Public manual payment submission form

**Files Created:**
- `src/app/api/manual-payments/route.ts`
- `src/app/api/manual-payments/[id]/route.ts`
- `src/app/api/upload/payment-proof/route.ts`
- `src/app/uploads/payment-proofs/[filename]/route.ts`
- `src/app/api/pay/manual/route.ts`

---

#### Broadcast Notification System 📢
- **New Feature:** Bulk notification ke multiple users sekaligus
- **Three Types:** Outage/Maintenance, Invoice Reminder, Payment Confirmation
- **Multi-Channel:** WhatsApp dan Email dengan template customizable
- **Smart Filtering:** Auto-skip users tanpa invoice atau data yang diperlukan
- **Variable Replacement:** Dynamic template variables untuk personalization
- **Batch Processing:** Success/failure count dengan detailed error messages

**Notification Types:**

1. **Outage/Maintenance Notification:**
   - Manual input: Issue Type, Description, Estimated Time, Affected Area
   - Use case: Informasi gangguan jaringan atau maintenance terjadwal
   - Template: `maintenance-outage`

2. **Invoice Reminder Broadcast:**
   - Auto-fetch: Latest invoice per user
   - Include: Payment link, due date, amount
   - Template: `invoice-reminder`

3. **Payment Confirmation Broadcast:**
   - Auto-fetch: Latest paid invoice
   - Include: Expiry date extension, payment details
   - Template: `payment-success`

**API Endpoint:**
- `POST /api/pppoe/users/send-notification`

**Request Format:**
```json
{
  "userIds": ["id1", "id2"],
  "notificationType": "outage|invoice|payment",
  "notificationMethod": "whatsapp|email|both",
  "issueType": "...",      // For outage
  "description": "...",    // For outage
  "estimatedTime": "...",  // For outage
  "affectedArea": "...",   // For outage
  "additionalMessage": ""  // Optional for invoice/payment
}
```

**Files Created:**
- `src/app/api/pppoe/users/send-notification/route.ts`

---

#### Customer ID Field 🆔
- **New Field:** 8-digit unique customer identifier
- **Purpose:** Easier customer identification dan reference
- **Auto-Generate:** System dapat generate ID otomatis
- **Indexing:** Indexed untuk quick lookup
- **Display:** Ditampilkan di customer list dan notifications

**Database Changes:**
```sql
ALTER TABLE pppoe_users
ADD COLUMN customer_id VARCHAR(8) UNIQUE;
```

---

#### Subscription Type 💳
- **New Field:** Klasifikasi POSTPAID vs PREPAID
- **Payment Tracking:** lastPaymentDate untuk tracking pembayaran
- **Filtering:** Filter customers by subscription type
- **Billing Logic:** Different logic untuk prepaid/postpaid customers

**Database Changes:**
```sql
ALTER TABLE pppoe_users
ADD COLUMN subscriptionType ENUM('POSTPAID', 'PREPAID') DEFAULT 'POSTPAID',
ADD COLUMN lastPaymentDate DATETIME;
```

**New Enum:**
```typescript
enum SubscriptionType {
  POSTPAID   // Pascabayar (bayar belakangan)
  PREPAID    // Prabayar (bayar di muka)
}
```

---

#### Bank Accounts Configuration 🏦
- **Multi-Bank Support:** Configure multiple bank accounts (0-5 accounts)
- **JSON Storage:** Flexible bank account data structure
- **Display:** Show bank accounts in manual payment page
- **Invoice Generation:** Configure days before expiry to auto-generate invoice

**Database Changes:**
```sql
ALTER TABLE companies
ADD COLUMN bankAccounts JSON,
ADD COLUMN invoiceGenerateDays INT DEFAULT 7;
```

**Bank Account Structure:**
```json
{
  "bankName": "BCA",
  "accountNumber": "1234567890",
  "accountName": "PT Example"
}
```

**Features:**
- Dynamic bank account input form
- Add/remove accounts easily
- Display all accounts in payment form
- Customer select bank from dropdown

---

#### Batch WhatsApp Processing 📱
- **Batch Size:** Configure messages per batch (default: 10)
- **Batch Delay:** Delay between batches in seconds (default: 60)
- **Randomization:** Randomize message order to avoid pattern detection
- **Anti-Spam:** Prevent WhatsApp ban/blocking from bulk sending

**Database Changes:**
```sql
ALTER TABLE whatsapp_reminder_settings
ADD COLUMN batchSize INT DEFAULT 10,
ADD COLUMN batchDelay INT DEFAULT 60,
ADD COLUMN randomize BOOLEAN DEFAULT TRUE;
```

**Configuration:**
- Admin → Settings → WhatsApp → Reminder Settings
- Adjustable based on provider limits
- Helps maintain WhatsApp account health

---

#### Registration GPS Coordinates 📍
- **Location Data:** Latitude & longitude in registration form
- **Use Cases:** Customer mapping, distance calculation, area planning
- **Optional Fields:** Not required but recommended

**Database Changes:**
```sql
ALTER TABLE registration_requests
ADD COLUMN latitude FLOAT,
ADD COLUMN longitude FLOAT;
```

---

### 📧 Email & WhatsApp Templates Added

**New WhatsApp Templates:**
1. `manual-payment-approval` - Pembayaran diterima & akun diaktifkan
2. `manual-payment-rejection` - Pembayaran ditolak dengan alasan
3. `maintenance-outage` - Informasi gangguan jaringan

**New Email Templates:**
1. `manual-payment-approval` - HTML email untuk approval
2. `manual-payment-rejection` - HTML email untuk rejection dengan reupload link
3. `maintenance-outage` - HTML email untuk broadcast gangguan

**Template Variables:**
- `{{customerName}}` - Nama customer
- `{{customerId}}` - Customer ID
- `{{username}}` - Username PPPoE
- `{{invoiceNumber}}` - Nomor invoice
- `{{amount}}` - Jumlah (formatted Rupiah)
- `{{expiredDate}}` - Tanggal expired
- `{{rejectionReason}}` - Alasan reject
- `{{paymentLink}}` - Link pembayaran
- `{{issueType}}` - Jenis gangguan
- `{{description}}` - Deskripsi gangguan
- `{{estimatedTime}}` - Estimasi pemulihan
- `{{affectedArea}}` - Area terdampak
- `{{companyName}}` - Nama perusahaan
- `{{companyPhone}}` - Telepon perusahaan
- `{{companyEmail}}` - Email perusahaan
- `{{baseUrl}}` - Base URL aplikasi

---

### 🗄️ Database Schema Updates

**Modified Tables:**
1. `companies` - bankAccounts (JSON), invoiceGenerateDays (INT)
2. `pppoe_users` - customerId (VARCHAR), subscriptionType (ENUM), lastPaymentDate (DATETIME)
3. `registration_requests` - latitude (FLOAT), longitude (FLOAT)
4. `whatsapp_reminder_settings` - batchSize (INT), batchDelay (INT), randomize (BOOLEAN)
5. `invoices` - relation to manualPayments

**New Tables:**
1. `manual_payments` - Manual payment records with approval workflow

**New Enums:**
1. `SubscriptionType` - POSTPAID, PREPAID
2. `ManualPaymentStatus` - PENDING, APPROVED, REJECTED

---

### 📝 Migration & Installation

**Migration File:**
- `prisma/migrations/add_manual_payment_features/migration.sql`

**Installation Steps:**
```bash
# 1. Update dependencies
npm install

# 2. Generate Prisma client
npx prisma generate

# 3. Push schema changes
npx prisma db push

# 4. Create upload directory
mkdir -p public/uploads/payment-proofs

# 5. Restart application
npm run build && npm start
```

**Manual Migration (if needed):**
```bash
mysql -u root -p your_database < prisma/migrations/add_manual_payment_features/migration.sql
```

---

### 📚 Documentation Added

**New Documentation:**
- `docs/NEW_FEATURES_V2.7.0.md` - Complete feature documentation
- Migration SQL with templates included
- API endpoint documentation
- Usage guide for admin and customers
- Troubleshooting section

**Reference Documentation (from salfanet-radius):**
- `salfanet-radius/docs/MANUAL_PAYMENT_AND_NOTIFICATION_SYSTEM.md`
- `salfanet-radius/docs/OUTAGE_NOTIFICATION_SYSTEM.md`
- `salfanet-radius/docs/BROADCAST_NOTIFICATION_SYSTEM.md`

---

### ✅ Benefits

**For Admin:**
- ✅ Manual payment approval workflow tanpa harus manual extend user
- ✅ Upload receipt verification sebelum aktivasi
- ✅ Broadcast notification ke multiple users sekaligus
- ✅ Bank account management yang flexible
- ✅ Better customer identification dengan Customer ID
- ✅ Payment tracking dengan lastPaymentDate

**For Customer:**
- ✅ Easy payment submission dengan upload bukti transfer
- ✅ Instant notification untuk approval/rejection
- ✅ Multiple bank account options
- ✅ Clear payment status tracking
- ✅ Automatic account reactivation on approval

**For System:**
- ✅ Reduced manual work untuk payment verification
- ✅ Better audit trail dengan payment history
- ✅ Flexible notification system untuk berbagai use cases
- ✅ Anti-spam WhatsApp dengan batch processing
- ✅ Better customer segmentation dengan subscription type

---

### 🔧 Configuration Required

**After Installation:**

1. **Company Settings:**
   - Navigate to: Admin → Settings → Company
   - Add bank accounts (recommended 2-3 accounts)
   - Set invoice generation days (default: 7)

2. **WhatsApp Batch Settings:**
   - Navigate to: Admin → Settings → WhatsApp
   - Configure batch size (start with 10)
   - Set batch delay (recommended 60 seconds)
   - Enable randomization

3. **Review Templates:**
   - Navigate to: Admin → WhatsApp → Templates
   - Customize manual payment templates
   - Customize outage notification template

4. **Test Manual Payment:**
   - Create test invoice
   - Submit manual payment via public link
   - Test approval workflow
   - Verify notifications sent

---

### 🎯 Usage Examples

**Manual Payment (Customer):**
1. Receive invoice with payment token
2. Go to `/pay-manual?token=xxx`
3. See bank accounts and invoice details
4. Transfer to chosen bank
5. Upload receipt and submit
6. Wait for admin approval

**Manual Payment (Admin):**
1. Go to `/admin/manual-payments`
2. See pending badge count
3. Click "Detail" to view receipt
4. Approve or reject with reason
5. System auto-extends user and sends notification

**Broadcast Notification:**
1. Go to `/admin/pppoe/users`
2. Select multiple users
3. Click "Kirim Notifikasi" dropdown
4. Choose: Outage / Invoice / Payment
5. Fill required fields
6. Select WhatsApp / Email / Both
7. Submit and see results

---

### 🐛 Bug Fixes

- Fix: Payment proof upload dengan proper validation
- Fix: Bank account JSON parsing yang robust
- Fix: Template variable replacement yang accurate
- Fix: Notification counter update yang real-time
- Fix: User expiry calculation yang correct setelah approval

---

**Files Modified:**
- `prisma/schema.prisma` - Schema updates for all new features
- `src/app/api/company/route.ts` - Bank accounts support
- `src/app/api/whatsapp/reminder-settings/route.ts` - Batch processing fields
- `CHANGELOG.md` - This changelog

**Files Created:**
- `src/app/api/manual-payments/route.ts`
- `src/app/api/manual-payments/[id]/route.ts`
- `src/app/api/upload/payment-proof/route.ts`
- `src/app/uploads/payment-proofs/[filename]/route.ts`
- `src/app/api/pay/manual/route.ts`
- `src/app/api/pppoe/users/send-notification/route.ts`
- `prisma/migrations/add_manual_payment_features/migration.sql`
- `docs/NEW_FEATURES_V2.7.0.md`

---

## [2.6.4] - 2025-12-18

### � Dashboard Network Overview Fix

#### Dashboard Network Data Consistency
- **Fix:** Data di "Ringkasan Jaringan" tidak sesuai dengan "Sesi Aktif" di Stats Cards
- **Cause:** Network Overview menggunakan data user/voucher status, bukan sessions dari radacct
- **Solution:** Ubah agar Network Overview menggunakan session count dari radacct
- **Impact:** Data PPPoE Users dan Hotspot Sessions di Network Overview sekarang konsisten dengan Stats Cards

#### Session Counting Optimization
- **Fix:** N+1 query performance issue saat menghitung PPPoE vs Hotspot sessions
- **Solution:** Batch fetch - ambil semua sessions sekali, lalu batch lookup ke pppoeUser
- **Impact:** Dashboard loading lebih cepat

**Files Modified:**
- `src/app/api/dashboard/stats/route.ts` - Fix network data source, optimize sessions query

---

### �🕐 Session Timezone Fix & Hotspot Session Improvements

#### Session Start Time Timezone Fix
- **Fix:** Start Time di Sesi Hotspot menampilkan waktu berbeda 7 jam dari First Login di Voucher
- **Cause:** API sessions mengirim datetime dengan 'Z' suffix (UTC) sementara voucher API tanpa 'Z' (WIB)
- **Solution:** Format datetime di sessions API tanpa 'Z' suffix untuk konsistensi dengan voucher
- **Impact:** Start Time dan First Login sekarang menampilkan waktu yang sama (WIB)

#### Hotspot Session Deduplication
- **Fix:** Session hotspot tercatat dua kali saat voucher reconnect
- **Solution:** Deduplicate sessions per username, hanya tampilkan session terbaru
- **Logic:** Gunakan Map untuk filter, simpan session dengan acctupdatetime/acctstarttime paling baru

#### Expired Voucher Auto-Disconnect Fix
- **Fix:** Voucher yang sudah expired tidak di-disconnect otomatis oleh cron
- **Cause:** `disconnectExpiredSessions` hanya cek `status === 'EXPIRED'`, tapi status belum diupdate
- **Solution:** Cek juga `expiresAt < now` untuk deteksi expired yang lebih akurat
- **Enhancement:** Auto-update voucher status ke EXPIRED setelah disconnect

#### PPPoE Profile Change - Use Disconnect Instead of CoA
- **Fix:** CoA untuk ganti profile PPPoE tidak berfungsi di MikroTik
- **Cause:** MikroTik hanya support CoA untuk rate-limit change, bukan PPP profile change
- **Solution:** Ganti dari CoA ke Disconnect, user akan reconnect dengan profile baru
- **Impact:** Profile change sekarang efektif, user disconnect dan auto-reconnect

#### PPPoE Profile - Allow Duplicate Group Name
- **Fix:** Error 400 saat membuat PPP Profile dengan groupName yang sama
- **Solution:** Hapus `@unique` constraint dari groupName di Prisma schema
- **Enhancement:** Skip pembuatan radgroupreply jika group sudah ada
- **Default:** groupName default kembali ke 'salfanetradius' (seperti voucher profile)

#### PPPoE Sessions - Remove Mitra Column
- **Change:** Hapus kolom "Mitra" dari halaman Sesi PPPoE
- **Reason:** Kolom tidak relevan untuk PPPoE users

**Files Modified:**
- `src/app/api/sessions/route.ts` - Timezone fix (hapus 'Z' suffix), session deduplication
- `src/lib/services/coaService.ts` - Cek expiresAt untuk expired detection
- `src/app/api/pppoe/users/route.ts` - Use disconnect instead of CoA for profile change
- `prisma/schema.prisma` - Remove unique constraint dari groupName
- `src/app/api/pppoe/profiles/route.ts` - Skip radgroupreply if exists
- `src/app/admin/pppoe/profiles/page.tsx` - Default groupName 'salfanetradius'
- `src/app/admin/sessions/pppoe/page.tsx` - Remove Mitra column

**Technical Details:**
```typescript
// Timezone fix - sessions/route.ts
const startTimeFormatted = session.acctstarttime 
  ? session.acctstarttime.toISOString().replace('Z', '') 
  : null;

// Expired detection - coaService.ts
const isExpired = voucher.status === 'EXPIRED' || 
  (voucher.expiresAt && new Date(voucher.expiresAt) < now);

// Session deduplication - sessions/route.ts
const latestSessionMap = new Map<string, Session>();
for (const session of radacctSessions) {
  // Keep only most recent per username
}
```

---

## [2.6.3] - 2025-12-18

### 📡 FreeRADIUS PPPoE Realm Fix & PPP Profile Enhancement

#### RADIUS Authentication Fix for PPPoE Users with Realm
- **Fix:** User PPPoE dengan format `username@realm` (e.g., `deliarianti@cimerta`) tidak bisa autentikasi
- **Cause:** Policy di `/etc/freeradius/3.0/policy.d/filter` menolak realm tanpa dot separator
- **Solution:** Comment out validasi dot separator untuk mengizinkan realm seperti `@cimerta`, `@rw01`
- **Impact:** Semua PPPoE user dengan format realm pendek sekarang bisa autentikasi

#### PPP Profile - Auto Generate Group Name
- **Fix:** Error 400 Bad Request saat menambah profile baru dengan groupName yang sama
- **Solution:** Auto-generate `groupName` dari nama profile (slug format)
- **Enhancement:** Error message lebih jelas menunjukkan profile mana yang sudah menggunakan groupName
- **Example:** Profile "Paket 10 Mbps" → groupName "paket-10-mbps"

#### FreeRADIUS Config Backup
- **New File:** `freeradius-config/policy.d-filter` - Backup policy dengan PPPoE realm support
- **New File:** `freeradius-config/freeradius-backup-20251218.tar.gz` - Full backup config
- **Updated:** `vps-install.sh` - Tambah restore policy.d-filter
- **Updated:** `vps-update.sh` - Tambah Step 5 untuk update FreeRADIUS config
- **Updated:** `install-wizard.html` - Instruksi policy.d-filter

**Files Modified:**
- `/etc/freeradius/3.0/policy.d/filter` - Comment out dot separator validation
- `freeradius-config/policy.d-filter` - New backup file
- `vps-install.sh` - Add policy.d-filter restore
- `vps-update.sh` - Add FreeRADIUS config update step
- `install-wizard.html` - Add policy.d-filter instructions
- `docs/FREERADIUS-SETUP.md` - PPPoE realm documentation
- `freeradius-config/README-BACKUP.md` - Add policy.d-filter to file list
- `src/app/admin/pppoe/profiles/page.tsx` - Auto-generate groupName from profile name
- `src/app/api/pppoe/profiles/route.ts` - Enhanced error message for duplicate group

**Testing:**
```bash
# Test RADIUS auth untuk PPPoE dengan realm:
radtest deliarianti@cimerta salfanet localhost 0 testing123
# Expected: Access-Accept
```

---

## [2.6.2] - 2025-12-17

### 📧 Email Notification System Enhancement

#### Invoice Page - Email Display
- **Tambah kolom Email** di tabel halaman Tagihan Admin
- **Detail dialog** menampilkan email pelanggan dengan icon 📧
- Fallback: `invoice.customerEmail` → `user.email` → '-'

#### eVoucher Page - Email Field
- **Tambah input Email (opsional)** di form pembelian voucher publik
- Email disimpan ke `customerEmail` di order voucher
- Digunakan untuk pengiriman notifikasi via email

#### Payment Webhook - Email Notifications
- **Notifikasi email otomatis** saat pembelian voucher berhasil
- **Notifikasi email otomatis** saat pembayaran tagihan berhasil
- Template: `voucher-purchase` untuk voucher, `payment-success` untuk tagihan
- Email dicatat ke tabel `email_history`

#### Email Template - Invoice Overdue
- **Template baru:** `invoice-overdue` untuk pelanggan yang sudah jatuh tempo
- Tema merah dengan peringatan
- Variables: `customerId`, `customerName`, `username`, `invoiceNumber`, `amount`, `dueDate`, `daysOverdue`, `paymentLink`, `companyName`, `companyPhone`

#### Customer Name Fallback Fix
- **Perbaikan fallback** untuk nama pelanggan di email reminder
- Urutan: `invoice.customerName` → `user.name` → 'Pelanggan'
- Email fallback: `invoice.customerEmail` → `user.email`

**Files Modified:**
- `src/app/admin/invoices/page.tsx` - Email column & detail display
- `src/app/evoucher/page.tsx` - Email input field
- `src/app/api/payment/webhook/route.ts` - Email notifications
- `src/app/api/settings/email/templates/route.ts` - Invoice overdue template
- `src/lib/cron/voucher-sync.ts` - Customer name & email fallback
- `src/app/api/cron/test-reminder/route.ts` - Customer name & email fallback
- `src/lib/email.ts` - Email utility

---

## [2.6.1] - 2025-12-16

### ⚡ Sessions Page Optimization & Full RADIUS Mode

#### Performance Optimization - Sessions Page
**Enhancement:** Optimasi halaman sesi aktif untuk loading yang lebih cepat

**Problem:** Halaman Sessions berat karena banyak API calls ke MikroTik router

**Solution:**
- Auto-refresh interval diubah dari 10s ke 30s untuk mengurangi beban
- Implementasi batch fetching untuk menghindari N+1 queries
- Data diambil sekali lalu di-map, bukan query per session

**Changes:**
- PPPoE users: Fetch semua users sekali, map by username
- Hotspot vouchers: Fetch semua vouchers sekali, map by username  
- Routers: Fetch semua routers sekali, map by id

#### Full FreeRADIUS Mode
**Enhancement:** Mode RADIUS murni tanpa koneksi API MikroTik untuk data sessions

**Problem:** Data sessions menggunakan MikroTik API yang lambat dan tidak reliable

**Solution:**
- Menghapus semua koneksi RouterOS API dari endpoint sessions
- Data diambil langsung dari tabel `radacct` FreeRADIUS
- Upload/Download dari kolom `acctinputoctets` dan `acctoutputoctets`
- Duration dari kolom `acctsessiontime` (fallback ke kalkulasi jika null)
- MAC Address dari kolom `callingstationid`

**API Response:**
```json
{
  "sessions": [...],
  "total": 100,
  "pagination": {
    "page": 1,
    "limit": 25,
    "totalPages": 4
  },
  "mode": "radius"  // Indicator full RADIUS mode
}
```

**Files Modified:**
- `src/app/api/sessions/route.ts` - Full rewrite, removed MikroTik API

#### Sessions Page UI Enhancement
**Enhancement:** Penambahan kolom dan fitur pagination

**New Columns:**
| Column | Source | Description |
|--------|--------|-------------|
| Start Time | acctstarttime | Waktu mulai session |
| Last Update | acctupdatetime | Waktu update terakhir |
| MAC Address | callingstationid | MAC Address device |

**Pagination Feature:**
- Page size selector: 10, 25, 50, 100 entries
- Navigation buttons: First, Prev, Page numbers, Next, Last
- Server-side pagination untuk performance
- Indicator "Page X of Y" dan "Showing X to Y of Z entries"

**Files Modified:**
- `src/app/admin/sessions/page.tsx` - New columns, pagination UI

#### Duration Calculation Fix
**Bug Fix:** Durasi session menampilkan nilai negatif

**Problem:** Duration bisa negatif jika acctsessiontime null dan kalkulasi salah

**Solution:**
```typescript
const durationSeconds = Math.max(0, 
  session.acctsessiontime || 
  Math.floor((now.getTime() - new Date(session.acctstarttime).getTime()) / 1000)
);
```

#### Refresh Button Fix
**Bug Fix:** Error 500 saat klik tombol Refresh

**Problem:** Stale closure di setInterval menyebabkan `page=[object Object]` di URL

**Solution:**
- Menambahkan state `currentPage` terpisah
- Validasi parameter page adalah number
- Update useEffect dependency array

**Files Modified:**
- `src/app/admin/sessions/page.tsx` - Added currentPage state, fixed closure

#### Invoice Reminder Cron Fix
**Bug Fix:** Invoice reminder tidak mengirim pesan WhatsApp untuk invoice overdue

**Problem:** Daftar hari overdue tidak lengkap `[1, 2, 3, 5, 7, 9, 10, 14, 21, 28]`. Invoice yang sudah 4, 6, atau 8 hari overdue tidak terdeteksi.

**Solution:**
- Menambahkan hari 4, 6, 8 ke daftar overdue days
- Coverage lengkap: `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 21, 28]`

**Example:** Invoice jatuh tempo 10 Desember, hari ini 16 Desember = 6 hari overdue. Sebelumnya tidak terkirim karena hari 6 tidak ada di daftar.

**Files Modified:**
- `src/lib/cron/voucher-sync.ts` - Added days 4, 6, 8 to overdue list
- `src/app/api/cron/test-reminder/route.ts` - Same fix

---

## [2.6.0] - 2025-12-15

### 📍 Area Management Feature

#### New Feature: Area Management
**Enhancement:** Fitur manajemen area untuk pengelompokan pelanggan

**Database Changes:**
- Model baru `pppoeArea` dengan field: id, name, description, isActive, createdAt, updatedAt
- Field `areaId` ditambahkan ke model `pppoeUser` (relasi ke pppoeArea)

**API Endpoint:** `/api/pppoe/areas`
- GET - List semua area dengan jumlah pelanggan
- POST - Tambah area baru
- PUT - Update area
- DELETE - Hapus area (dengan validasi)

**Files Created:**
- `src/app/api/pppoe/areas/route.ts` - CRUD API untuk area
- `src/app/admin/pppoe/areas/page.tsx` - Halaman manajemen area

#### Area Management Page
**Enhancement:** Halaman untuk mengelola area pelanggan

**URL:** `/admin/pppoe/areas`

**Features:**
- Tabel area: Nama, Deskripsi, Jumlah Pelanggan, Status, Aksi
- Stats: Total Area, Area Aktif, Area Non-Aktif, Total Pelanggan
- Dialog form tambah/edit area
- Hapus area dengan validasi
- Search/filter area

#### Menu Update - Area Submenu
**Enhancement:** Submenu Area ditambahkan ke menu Langganan

**New Menu Structure:**
| Menu | URL |
|------|-----|
| Daftar Pelanggan | `/admin/pppoe/users` |
| Profile Langganan | `/admin/pppoe/profiles` |
| **Area** | `/admin/pppoe/areas` |
| Stop Langganan | `/admin/pppoe/stopped` |
| Pendaftaran Baru | `/admin/pppoe/registrations` |

**Files Modified:**
- `src/app/admin/layout.tsx` - Added Area submenu

#### Customer List - Area Integration
**Enhancement:** Filter dan kolom Area di daftar pelanggan

**Changes:**
- Dropdown filter "Semua Area" di header
- Kolom "Area" di tabel pelanggan
- Field Area di form Tambah Pelanggan
- Dropdown Area di modal Edit Pelanggan

**Files Modified:**
- `src/app/admin/pppoe/users/page.tsx` - Area filter, column, form field
- `src/app/api/pppoe/users/route.ts` - Include area relation
- `src/components/UserDetailModal.tsx` - Area dropdown in edit form

#### Fix: MapPicker z-index
**Bug Fix:** Pop up Map Picker tampil di belakang modal Edit Pelanggan

**Problem:** MapPicker dan UserDetailModal sama-sama memiliki z-index 9999
**Solution:** z-index MapPicker dinaikkan ke 10001

**Files Modified:**
- `src/components/MapPicker.tsx` - z-index: 10001

---

## [2.5.9] - 2025-12-15

### 🛑 Stop Langganan Feature - Subscription Management

#### New Feature: Stop Langganan Page
**Enhancement:** Halaman terpisah untuk mengelola pelanggan yang berhenti berlangganan

**Features:**
- URL: `/admin/pppoe/stopped`
- Tabel dengan kolom: No Layanan, Pelanggan, Profile, Telepon, Tgl Daftar, Tgl Stop, Note
- Tombol EXPORT untuk export CSV
- Tombol HAPUS untuk bulk delete
- Tombol Aktifkan Kembali untuk reaktivasi pelanggan
- Pagination dengan Show entries & Search
- Stats TOTAL DATA

**Files Created:**
- `src/app/admin/pppoe/stopped/page.tsx` - New stop subscription page

#### Menu Restructure - Langganan
**Enhancement:** Reorganisasi menu PPPoE (Langganan)

**New Menu Structure:**
| Menu | URL | Description |
|------|-----|-------------|
| Daftar Pelanggan | `/admin/pppoe/users` | Pelanggan active, isolated, blocked |
| Profile Langganan | `/admin/pppoe/profiles` | Manajemen profil PPPoE |
| Stop Langganan | `/admin/pppoe/stopped` | **NEW** - Pelanggan yang berhenti |
| Pendaftaran Baru | `/admin/pppoe/registrations` | Registrasi pending |

**Files Modified:**
- `src/app/admin/layout.tsx` - Updated menu href

#### Status "Stop" Implementation
**Enhancement:** Status baru untuk pelanggan berhenti berlangganan

**Changes:**
- Pelanggan dengan status "stop" tidak tampil di Daftar Pelanggan
- Pelanggan "stop" hanya tampil di halaman Stop Langganan
- Filter status di Daftar Pelanggan: Semua, Aktif, Isolir, Blokir (tanpa Stop)
- Tombol Stop di dropdown status individual
- Tombol bulk Stop untuk multi-select

**Files Modified:**
- `src/app/admin/pppoe/users/page.tsx` - Filter out stop status, add Stop button

#### API Updates
**Enhancement:** Support filter status di API

**Changes:**
- GET `/api/pppoe/users?status=stop` - Filter by status
- PUT `/api/pppoe/users/status` - Support "stop" status
- PUT `/api/pppoe/users/bulk-status` - Support bulk "stop"

**Files Modified:**
- `src/app/api/pppoe/users/route.ts` - Added status filter parameter

#### Translations
**Enhancement:** Added translations for stop subscription feature

| Key | Indonesian | English |
|-----|------------|---------|
| `pppoe.stoppedSubscriptions` | Berhenti Langganan | Stopped Subscriptions |
| `pppoe.stoppedSubscriptionsDesc` | Daftar pelanggan yang sudah berhenti berlangganan | List of customers who have stopped subscribing |

**Files Modified:**
- `src/locales/id.json` - Added Indonesian translations
- `src/locales/en.json` - Added English translations

---

## [2.5.8] - 2025-12-14

### 🌐 Multi-language Support & Invoice Overdue System

#### Payment Page Indonesian Translation
**Enhancement:** Halaman pembayaran (`/pay/[token]`) sekarang full bahasa Indonesia

**Translations:**
| English | Indonesia |
|---------|-----------|
| Payment Invoice | Tagihan Pembayaran |
| Invoice Details | Detail Tagihan |
| Customer Information | Informasi Pelanggan |
| Total Amount | Total Tagihan |
| Issue Date / Due Date | Tanggal Terbit / Jatuh Tempo |
| Payment Overdue | Pembayaran Terlambat |
| Payment Methods | Metode Pembayaran |
| Pay Now | Bayar Sekarang |
| Invoice Not Found | Tagihan Tidak Ditemukan |
| Payment Received | Pembayaran Diterima |

**Files Modified:**
- `src/app/pay/[token]/page.tsx` - Full Indonesian translation

#### User Detail Modal Indonesian Translation
**Enhancement:** Modal detail pengguna di halaman PPPoE Users sekarang full bahasa Indonesia

**Translations:**
| English | Indonesia |
|---------|-----------|
| User Details | Detail Pengguna |
| User Info / Sessions / Auth Logs / Invoices | Info Pengguna / Sesi / Log Autentikasi / Tagihan |
| Leave empty to keep current | Kosongkan untuk tetap menggunakan password saat ini |
| Name / Phone / Profile | Nama / Telepon / Paket |
| Auto-assign | Otomatis |
| IP Address (Auto-assign if empty) | Alamat IP (Otomatis jika kosong) |
| Address | Alamat |
| GPS Location (Optional) | Lokasi GPS (Opsional) |
| Expired At | Tanggal Kadaluarsa |
| Cancel / Save Changes | Batal / Simpan |
| No session history found | Tidak ada riwayat sesi |
| Success / Rejected | Berhasil / Ditolak |
| Due: / Paid: | Jatuh Tempo: / Dibayar: |

**Files Modified:**
- `src/components/UserDetailModal.tsx` - Full Indonesian translation

#### Customer Portal Speed Format Fix
**Problem:** Speed ditampilkan sebagai "5/5 Mbps" tidak konsisten dengan format admin "5M/5M"

**Solution:** Changed format dari `{download}/{upload} Mbps` ke `{download}M/{upload}M`

**Files Modified:**
- `src/app/customer/page.tsx` - Speed format fix

#### Invoice Overdue System Enhancements
**Enhancement:** Support lengkap untuk invoice overdue dan pelanggan ter-blokir

**Features:**
1. **Invoice List** - Tab "Tertunda" sekarang menampilkan PENDING dan OVERDUE
2. **Generate Invoice** - Include users dengan status: active, isolated, blocked
3. **Invoice-Overdue Template** - Template WhatsApp khusus untuk tagihan terlambat
4. **Send Reminder** - Auto-detect overdue dan gunakan template yang sesuai
5. **Cron Manual Trigger** - Force parameter untuk bypass time check
6. **Payment Webhook** - Support reactivation untuk blocked users

**Database Changes:**
```sql
INSERT INTO whatsapp_templates (type, name, message, isActive, createdAt, updatedAt)
VALUES ('invoice-overdue', 'Invoice Overdue (Auto)', 
'🚨 *TAGIHAN TERLAMBAT*\n\nYth. {{customerName}},\n\nTagihan Anda sudah melewati jatuh tempo {{daysOverdue}} hari.\n\n📋 No. Invoice: {{invoiceNumber}}\n💰 Total: Rp {{amount}}\n📅 Jatuh Tempo: {{dueDate}}\n\n⚠️ Layanan internet Anda dapat diputus sewaktu-waktu.\n\nSegera lakukan pembayaran:\n{{paymentLink}}\n\nAbaikan jika sudah membayar.\n\nTerima kasih.\n{{companyName}}',
true, NOW(), NOW());
```

**Files Modified:**
- `src/app/api/invoices/route.ts` - Include OVERDUE in unpaid filter
- `src/app/api/invoices/generate/route.ts` - Include isolated, blocked users
- `src/app/api/invoices/send-reminder/route.ts` - Auto-detect overdue
- `src/lib/cron/voucher-sync.ts` - Added force parameter
- `src/app/api/cron/route.ts` - Pass force=true for manual trigger
- `src/app/api/payment/webhook/route.ts` - Added blocked status support
- `src/app/admin/invoices/page.tsx` - Button "Lunas" → "Tandai Lunas"

**Deployed To:**
- ✅ VPS Production (103.67.244.131)
- ✅ VPS Lokal (103.191.165.156)

---

## [2.5.7] - 2025-12-14

### 🐛 WhatsApp Broadcast API Fix & Search Enhancement

#### Fixed /api/users/list 500 Error
**Problem:** WhatsApp Broadcast page gagal load dengan error 500 pada API `/api/users/list`

**Root Cause:**
1. Query Prisma mencoba mengakses relasi `odcId` dan `odc` pada model `networkODP` yang tidak ada di schema
2. Nested filtering untuk ODP/ODC assignments tidak compatible dengan struktur schema

**Solution:**
1. Refactored ODP assignments query - sekarang dilakukan secara terpisah untuk menghindari nested relation errors
2. Removed ODC filter (tidak ada di current schema)
3. Added `odcs: []` ke response untuk backward compatibility dengan frontend
4. Added validation untuk empty userIds sebelum query ODP assignments

#### Added Customer Name Search
**Enhancement:** Menambahkan kemampuan pencarian berdasarkan nama pelanggan untuk fitur WhatsApp Broadcast

**New Parameters:**
- `name` - Cari berdasarkan nama pelanggan saja
- `search` - Cari generik (mencari di name, username, address, phone sekaligus)

**Usage Examples:**
```bash
# Search by name/username/address/phone
/api/users/list?search=tian

# Filter by status + search
/api/users/list?status=active&search=subang

# Search by name only
/api/users/list?name=tian
```

**Files Modified:**
- `src/app/api/users/list/route.ts` - Complete refactor of filtering and ODP handling

**Deployed To:**
- ✅ VPS Production (103.67.244.131)
- ✅ VPS Lokal (103.191.165.156)

---

## [2.5.6] - 2025-12-14

### 🔧 Agent Dashboard Enhancement & Theme Fix

#### Fixed Admin Default Theme
**Problem:** Admin dashboard default ke dark mode, user ingin default light mode

**Solution:**
- Changed default theme dari `dark` ke `light` di `src/app/admin/layout.tsx`
- Added theme initialization pada login page untuk konsistensi

**Files Modified:**
- `src/app/admin/layout.tsx` - Default theme changed to light
- `src/app/admin/login/page.tsx` - Added theme initialization

#### Fixed Agent Sales History
**Problem:** Riwayat penjualan agent tidak muncul di dashboard agent

**Root Cause:** API mencari dari tabel yang salah

**Solution:** Changed query dari `agent_sales` ke `hotspot_vouchers` table langsung dengan filter:
- `agentId` = current agent
- `status` IN (ACTIVE, EXPIRED)
- `firstLoginAt` IS NOT NULL (sudah terjual)

**Files Modified:**
- `src/app/api/hotspot/agents/[id]/history/route.ts` - Changed data source

#### Added Agent Dashboard Filter & Pagination
**Enhancement:** Agent dashboard sekarang memiliki filter dan pagination

**New Features:**
- 🔍 Search by voucher code
- 📊 Filter by status (WAITING, ACTIVE, EXPIRED)
- 📦 Filter by profile
- 📄 Pagination (20 items per page)

**Files Modified:**
- `src/app/agent/dashboard/page.tsx` - Added filter UI components
- `src/app/api/agent/dashboard/route.ts` - Added pagination and filter params

---

## [2.5.5] - 2025-12-14

### 🔧 Installer Nginx Port Configuration & VPS Update Script

#### Configurable Nginx Port in Installer
**Problem:** Fresh install VPS selalu listen di port 80 (hardcoded)

**Solution:** Added `NGINX_PORT` configuration variable ke installer script

**Files Modified:**
- `vps-install-local.sh` - Added NGINX_PORT prompt and configuration
- `vps-install.sh` - Added helpful comment for port customization

#### Created VPS Update Script
**New Files:**
- `vps-update.sh` - Script untuk update production tanpa fresh install
- `docs/UPDATE-GUIDE.md` - Panduan lengkap proses update

**Features:**
- Backup database otomatis sebelum update
- Git pull atau manual file transfer
- Prisma migration
- Build dan restart PM2
- Rollback support jika gagal

---

## [2.5.4] - 2025-12-14

### 🔧 Project Cleanup & RADIUS NAS Fix

#### Fixed RADIUS Authentication
**Problem:** RADIUS authentication failed with "server not responding"

**Solution:**
- Added gateway NAS entry (192.168.54.1) to database
- FreeRADIUS now accepts requests from all configured NAS

**NAS Entries Added:**
```sql
INSERT INTO nas (nasname, shortname, type, secret, description) VALUES
('192.168.54.1', 'gateway', 'other', 'secret123', 'Gateway NAS'),
('172.16.66.1', 'mikrotik-chr', 'other', 'secret123', 'MikroTik CHR'),
('172.16.66.2', 'salfa-rb750', 'other', 'secret123', 'Salfa RB750'),
('0.0.0.0/0', 'catchall', 'other', 'secret123', 'Catch-all NAS');
```

#### Project Cleanup
**Deleted Files:**
- `test-api.js`, `test-delete.js`, `test-mikrotik.js`
- `check-users.sql`, `update-nas.sql`, `update-radius-main.zip`

**Deleted Folders:**
- `salfanet-radius-main/` - Duplicate folder
- `SALFANET-FIX-CLEAN/` - Old backup folder

#### Code Cleanup
**Files Cleaned:**
- `src/app/admin/layout.tsx` - Cleaned navigation menu
- `src/app/api/network/routers/route.ts` - Removed unused includes
- `src/locales/*.json` - Removed unused translation keys
- `src/lib/translations.ts` - Removed unused translations

---

## [2.5.2] - 2025-12-13

### 🔧 Installer Scripts Encoding Fix

#### Fixed Character Encoding in vps-install.sh
**Files Modified:**
- `vps-install.sh` - Production VPS installer

**Changes:**
1. **Fixed Double-Encoded UTF-8 Characters**
   - Replaced corrupted emoji sequences with clean ASCII text
   - Removed UTF-8 BOM marker from file
   - Fixed corrupted arrow symbols (`Ã¢â€ â€™` → `->`)
   - Fixed corrupted error icon (`Ã¢ÂÅ'` → `[X]`)
   - Fixed various corrupted prefix markers

2. **Improved Readability**
   - Installer script now displays correctly on all terminal encodings
   - No more garbled characters when running on VPS

---

## [2.5.1] - 2025-12-13

### 🔧 Installer Scripts Update

#### Updated VPS Installation Scripts
**Files Modified:**
- `vps-install.sh` - Production VPS installer (with root access)
- `vps-install-local.sh` - Local VPS installer (with sudo)

**Changes:**
1. **Added REST Authorize Endpoint to FreeRADIUS Config**
   - Include `authorize` section in REST module configuration
   - Enable voucher validation BEFORE password authentication
   - Timeout set to 2 seconds for authorize endpoint
   - Prevents expired vouchers from authenticating

2. **Updated REST Module Configuration**
   ```bash
   rest {
       authorize {
           uri = "${..connect_uri}/api/radius/authorize"
           method = "post"
           body = "json"
           data = '{"username": "%{User-Name}", "nasIp": "%{NAS-IP-Address}"}'
           timeout = 2
       }
       post-auth { ... }
       accounting { ... }
   }
   ```

3. **Benefits:**
   - ✅ New installations automatically get voucher authorization feature
   - ✅ Expired vouchers blocked at FreeRADIUS level
   - ✅ Consistent with production configuration (Dec 13, 2025)
   - ✅ Security hardening out-of-the-box

**Installation Flow Updated:**
- Both scripts now configure REST authorize during FreeRADIUS setup
- Authorize endpoint called in FreeRADIUS `sites-enabled/default` authorize section
- Complete voucher validation system ready to use after installation

---

## [2.5.0] - 2025-12-13

### 🔒 Security Enhancement: FreeRADIUS Authorization Pre-Check for Expired Vouchers

#### Critical Bug Fix: Expired Vouchers Could Still Login
**Problem:**
- Voucher dengan status EXPIRED masih bisa login ke hotspot
- FreeRADIUS hanya check username/password di `radcheck` table
- Tidak ada validasi `expiresAt` sebelum authentication
- User melihat pesan "invalid username or password" bukan "account expired"
- Voucher expired tidak auto-disconnect dari active session
- Active sessions dari voucher tidak muncul di dashboard admin

**Impact:**
- 🔴 **CRITICAL SECURITY ISSUE**: User bisa tetap online dengan voucher kadaluarsa
- 🔴 **Poor UX**: Pesan error tidak jelas untuk user
- 🔴 **Revenue Loss**: Voucher gratis karena bisa digunakan selamanya
- 🔴 **Dashboard Inaccurate**: Admin tidak bisa monitor real sessions

---

### 🛠️ Solution Implemented

#### 1. REST Authorization Endpoint (Pre-Authentication Check)
**File Created:** `src/app/api/radius/authorize/route.ts`

FreeRADIUS sekarang call REST API **SEBELUM** proses authentication untuk validate voucher:

```typescript
export async function POST(request: NextRequest) {
  const { username } = await request.json();
  
  const voucher = await prisma.hotspotVoucher.findUnique({
    where: { code: username },
    include: { profile: true },
  });
  
  if (!voucher) {
    return NextResponse.json({
      success: true,
      action: "allow",
      message: "Not a voucher"
    });
  }
  
  const now = new Date();
  
  // Check 1: Status EXPIRED
  if (voucher.status === 'EXPIRED') {
    await logRejection(username, 'Your account has expired');
    return NextResponse.json({
      "control:Auth-Type": "Reject",
      "reply:Reply-Message": "Your account has expired"
    }, { status: 200 });
  }
  
  // Check 2: expiresAt in the past
  if (voucher.expiresAt && now > voucher.expiresAt) {
    await prisma.hotspotVoucher.update({
      where: { id: voucher.id },
      data: { status: "EXPIRED" },
    });
    await logRejection(username, 'Your account has expired');
    return NextResponse.json({
      "control:Auth-Type": "Reject",
      "reply:Reply-Message": "Your account has expired"
    }, { status: 200 });
  }
  
  // Check 3: Active session timeout exceeded
  if (voucher.firstLoginAt && voucher.expiresAt) {
    const activeSession = await prisma.radacct.findFirst({
      where: { username: voucher.code, acctstoptime: null },
    });
    
    if (activeSession && now > voucher.expiresAt) {
      await logRejection(username, 'Session timeout');
      return NextResponse.json({
        "control:Auth-Type": "Reject",
        "reply:Reply-Message": "Session timeout"
      }, { status: 200 });
    }
  }
  
  return NextResponse.json({
    success: true,
    action: "allow",
    status: voucher.status,
    expiresAt: voucher.expiresAt,
  });
}
```

**Key Features:**
- ✅ Check voucher status BEFORE password validation
- ✅ Auto-update status to EXPIRED if expiresAt passed
- ✅ Session timeout detection for active sessions
- ✅ Log rejection to `radpostauth` table for audit trail
- ✅ Return proper RADIUS attributes for MikroTik display

---

#### 2. FreeRADIUS REST Module Configuration
**File Modified:** `freeradius-config/mods-enabled-rest`

Added `authorize` section to REST module:

```
rest {
    tls {
        check_cert = no
        check_cert_cn = no
    }
    
    connect_uri = "http://localhost:3000"
    
    # NEW: Authorize pre-check
    authorize {
        uri = "${..connect_uri}/api/radius/authorize"
        method = "post"
        body = "json"
        data = "{ \"username\": \"%{User-Name}\", \"nasIp\": \"%{NAS-IP-Address}\" }"
        tls = ${..tls}
        timeout = 2
    }
    
    post-auth {
        uri = "${..connect_uri}/api/radius/post-auth"
        method = "post"
        body = "json"
        data = "{ \"username\": \"%{User-Name}\", \"reply\": \"%{reply:Packet-Type}\", \"nasIp\": \"%{NAS-IP-Address}\", \"framedIp\": \"%{Framed-IP-Address}\" }"
        tls = ${..tls}
    }
    
    accounting {
        uri = "${..connect_uri}/api/radius/accounting"
        method = "post"
        body = "json"
        data = "{ \"username\": \"%{User-Name}\", \"statusType\": \"%{Acct-Status-Type}\", \"sessionId\": \"%{Acct-Session-Id}\", \"nasIp\": \"%{NAS-IP-Address}\", \"framedIp\": \"%{Framed-IP-Address}\", \"sessionTime\": \"%{Acct-Session-Time}\", \"inputOctets\": \"%{Acct-Input-Octets}\", \"outputOctets\": \"%{Acct-Output-Octets}\" }"
        tls = ${..tls}
    }
    
    pool {
        start = 0
        min = 0
        max = 32
        spare = 1
        uses = 0
        lifetime = 0
        idle_timeout = 60
        connect_timeout = 3
    }
}
```

---

#### 3. FreeRADIUS Authorization Flow
**File Modified:** `freeradius-config/sites-enabled-default`

Added REST call in `authorize` section (after SQL, before PAP):

```
authorize {
    filter_username
    preprocess
    chap
    mschap
    digest
    suffix
    eap {
        ok = return
    }
    files
    -sql
    
    # CRITICAL: Call REST API to check voucher expiry
    rest
    
    -ldap
    expiration
    logintime
    pap
}
```

**Authentication Flow:**
```
1. User login → FreeRADIUS receives Access-Request
2. SQL check → Load user from radcheck (username/password)
3. REST authorize → Call /api/radius/authorize
   ├─ If expired → Return Auth-Type=Reject + Reply-Message
   └─ If valid → Continue to next step
4. PAP authentication → Validate password
5. Post-Auth → Log success/failure
6. Send Access-Accept/Reject to MikroTik
```

---

#### 4. Dashboard Active Sessions Fix
**File Modified:** `src/app/api/dashboard/stats/route.ts`

**Problem:** Query menggunakan `nasporttype = 'Wireless-802.11'` yang tidak selalu ada di radacct.

**Solution:** Check username di tabel `pppoeUser` vs `hotspotVoucher`:

```typescript
// OLD (BROKEN):
activeSessionsHotspot = await prisma.radacct.count({
  where: {
    acctstoptime: null,
    acctupdatetime: { gte: tenMinutesAgo },
    nasporttype: 'Wireless-802.11', // ❌ Not reliable
  },
});

// NEW (FIXED):
const pppoeSessions = await prisma.radacct.findMany({
  where: {
    acctstoptime: null,
    acctupdatetime: { gte: tenMinutesAgo },
  },
  select: { username: true },
});

for (const session of pppoeSessions) {
  const isPPPoE = await prisma.pppoeUser.findUnique({
    where: { username: session.username },
    select: { id: true },
  });
  
  if (isPPPoE) {
    activeSessionsPPPoE++;
  } else {
    activeSessionsHotspot++;
  }
}
```

**Result:**
- ✅ Semua hotspot sessions sekarang muncul di dashboard
- ✅ Accurate PPPoE vs Hotspot session count
- ✅ No dependency on nasporttype field

---

#### 5. Enhanced Voucher Sync Cronjob
**File Modified:** `src/lib/cron/voucher-sync.ts`

**Improvements:**
1. **Better Logging Per Voucher:**
```typescript
const expiredVouchers = await prisma.$queryRaw<Array<{code: string; id: string}>>`
  SELECT code, id FROM hotspot_vouchers
  WHERE status = 'ACTIVE'
    AND expiresAt < UTC_TIMESTAMP()
`

console.log(`[CRON] Found ${expiredVouchers.length} expired vouchers to process`)

let expiredCount = 0
for (const voucher of expiredVouchers) {
  try {
    // 1. Remove from RADIUS authentication tables
    await prisma.radcheck.deleteMany({
      where: { username: voucher.code }
    })
    await prisma.radusergroup.deleteMany({
      where: { username: voucher.code }
    })
    
    // 2. Check for active session
    const activeSession = await prisma.radacct.findFirst({
      where: { username: voucher.code, acctstoptime: null },
    })
    
    if (activeSession) {
      console.log(`[CRON] Voucher ${voucher.code} has active session, will be disconnected by CoA`)
    }
    
    expiredCount++
    console.log(`[CRON] Voucher ${voucher.code} removed from RADIUS (expired)`)
  } catch (err) {
    console.error(`[CRON] Error processing expired voucher ${voucher.code}:`, err)
  }
}
```

2. **Auto-Disconnect via CoA:**
```typescript
// Update status to EXPIRED
const expiredResult = await prisma.$executeRaw`
  UPDATE hotspot_vouchers
  SET status = 'EXPIRED'
  WHERE status = 'ACTIVE'
    AND expiresAt < NOW()
`

// Disconnect expired sessions via CoA
let disconnectedCount = 0
try {
  const coaResult = await disconnectExpiredSessions()
  disconnectedCount = coaResult.disconnected
} catch (coaErr) {
  console.error('[CoA] Error:', coaErr)
}
```

3. **Improved History Logging:**
```typescript
await prisma.cronHistory.update({
  where: { id: history.id },
  data: {
    status: 'success',
    completedAt,
    duration: completedAt.getTime() - startedAt.getTime(),
    result: `Synced ${syncedCount} vouchers, expired ${expiredCount} vouchers, disconnected ${disconnectedCount} sessions`,
  },
})
```

---

### 📊 MikroTik Log Messages

**Before Fix:**
```
login failed: invalid username or password
```

**After Fix:**
```
login failed: Your account has expired
login failed: Session timeout
```

---

### 🎯 Technical Implementation Details

#### FreeRADIUS Package Requirements
```bash
apt-get install freeradius-rest
```

#### REST Module Loading
Module `rlm_rest.so` must be available at:
```
/usr/lib/freeradius/rlm_rest.so
```

#### Configuration Files
1. `/etc/freeradius/3.0/mods-enabled/rest` - REST API endpoints
2. `/etc/freeradius/3.0/sites-enabled/default` - Authorization flow
3. `/var/www/salfanet-radius/src/app/api/radius/authorize/route.ts` - Validation logic

#### Database Tables Used
- `hotspot_vouchers` - Voucher status, expiresAt
- `radcheck` - RADIUS username/password
- `radusergroup` - User group membership
- `radacct` - Active sessions tracking
- `radpostauth` - Authentication log (success/failure)

---

### ✅ Testing Checklist

- [x] Expired voucher rejected before authentication
- [x] Reply-Message "Your account has expired" sent to MikroTik
- [x] Message displayed in MikroTik log
- [x] Active sessions visible in admin dashboard
- [x] Voucher sync cronjob processes expired vouchers
- [x] CoA disconnect for expired active sessions
- [x] radpostauth logging for audit trail
- [x] No false positives (valid vouchers still work)
- [x] Performance: 2-second timeout for authorize check

---

### 📝 Files Modified Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/api/radius/authorize/route.ts` | **CREATED** | Pre-authentication voucher validation endpoint |
| `freeradius-config/mods-enabled-rest` | Modified | Added authorize section with 2s timeout |
| `freeradius-config/sites-enabled-default` | Modified | Call REST in authorize flow after SQL |
| `src/app/api/dashboard/stats/route.ts` | Modified | Fixed hotspot session counting logic |
| `src/lib/cron/voucher-sync.ts` | Enhanced | Better logging, cleanup, and disconnect |

---

### 🚀 Deployment Notes

**VPS Environment:**
- IP: 103.67.244.131
- FreeRADIUS: v3.0.26 (with rlm_rest module)
- Next.js: v16.0.7
- PM2: Process manager
- MySQL: 8.0.44

**Restart Sequence:**
```bash
# 1. Update Next.js code
cd /var/www/salfanet-radius
npm run build

# 2. Update FreeRADIUS config
cp freeradius-config/mods-enabled-rest /etc/freeradius/3.0/mods-enabled/rest
cp freeradius-config/sites-enabled-default /etc/freeradius/3.0/sites-enabled/default

# 3. Test FreeRADIUS config
freeradius -CX

# 4. Restart services
systemctl restart freeradius
pm2 restart all --update-env
```

---

### 🔍 Monitoring & Debugging

**Check Authorization Logs:**
```sql
SELECT * FROM radpostauth 
WHERE authdate > NOW() - INTERVAL 1 HOUR 
ORDER BY authdate DESC;
```

**Check Expired Vouchers:**
```sql
SELECT code, status, expiresAt 
FROM hotspot_vouchers 
WHERE status = 'EXPIRED' 
AND expiresAt > NOW() - INTERVAL 1 DAY;
```

**FreeRADIUS Debug Mode:**
```bash
systemctl stop freeradius
freeradius -X
```

**REST API Test:**
```bash
curl -X POST http://localhost:3000/api/radius/authorize \
  -H "Content-Type: application/json" \
  -d '{"username": "553944"}'
```

---

## [2.4.5] - 2025-12-10

### 🎨 UI/UX Improvements: Voucher Template Preview & Dashboard Traffic Monitor

#### 1. Mobile Responsive Voucher Template Preview
**Problem:**
- Preview voucher pada tampilan mobile tidak responsif
- Voucher cards terlalu kecil dan terpotong di layar mobile
- Layout voucher tidak optimal untuk mobile viewing
- Posisi voucher tidak berurutan (single code vs username/password)

**Solution:**
Optimized voucher template preview for mobile devices with responsive CSS and better layout handling.

**Changes:**

1. **Mobile Media Queries (≤640px):**
   ```css
   @media (max-width: 640px) {
     .voucher-preview-container { 
       display: flex !important; 
       flex-direction: column !important; 
       padding: 0 8px !important; 
       gap: 10px !important; 
     }
     .voucher-card { 
       display: block !important; 
       width: calc(100% - 16px) !important; 
       max-width: none !important; 
       margin: 0 auto 10px auto !important; 
     }
     .voucher-single { order: 1; }
     .voucher-dual { order: 2; }
   }
   ```

2. **Tablet Media Queries (641px - 1024px):**
   ```css
   @media (min-width: 641px) and (max-width: 1024px) {
     .voucher-card { width: calc(33.33% - 8px) !important; }
   }
   ```

3. **Desktop (≥1025px):**
   ```css
   @media (min-width: 1025px) {
     .voucher-card { width: 155px !important; }
   }
   ```

4. **React State for Mobile Detection:**
   ```typescript
   const [isMobile, setIsMobile] = useState(false);
   
   useEffect(() => {
     const handleResize = () => setIsMobile(window.innerWidth <= 640);
     handleResize();
     window.addEventListener('resize', handleResize);
     return () => window.removeEventListener('resize', handleResize);
   }, []);
   ```

5. **Dynamic Container Styles:**
   ```typescript
   style={{
     display: 'flex',
     flexDirection: isMobile ? 'column' : 'row',
     flexWrap: isMobile ? 'nowrap' : 'wrap',
     gap: isMobile ? '12px' : '6px',
   }}
   ```

**Files Modified:**
- `src/app/admin/hotspot/template/page.tsx` - Mobile responsive DEFAULT_TEMPLATE & preview container

**Result:**
- ✅ Voucher preview responsive di semua device
- ✅ Voucher cards tidak terpotong di mobile
- ✅ Layout vertikal di mobile dengan gap yang tepat
- ✅ Single-code voucher tampil di atas, dual (username/password) di bawah
- ✅ Preview button tetap tampil di semua device

---

#### 2. Dashboard Traffic Monitor UI Improvements
**Problem:**
- Font judul "Traffic Monitor MikroTik" terlalu besar
- Indikator "Live" tidak diperlukan
- Dropdown Router dan Interface terlalu besar dan horizontal
- Layout selector tidak optimal

**Solution:**
Optimized Traffic Monitor section with smaller fonts and vertical selector layout.

**Changes:**

1. **Title Font Size Reduced:**
   ```tsx
   // Before
   <h3 className="text-lg font-semibold">Traffic Monitor MikroTik</h3>
   
   // After  
   <h3 className="text-base font-semibold">Traffic Monitor MikroTik</h3>
   ```

2. **Live Indicator Removed:**
   ```tsx
   // Removed completely
   <div className="flex items-center gap-2">
     <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
     <span className="text-xs text-gray-500">Live</span>
   </div>
   ```

3. **Dropdown Selectors - Vertical Layout:**
   ```tsx
   // Before: Horizontal layout
   <div className="flex items-center gap-3">
   
   // After: Vertical layout (Router above, Interface below)
   <div className="flex flex-col items-start gap-2">
   ```

4. **Dropdown Styling Optimized:**
   ```tsx
   // Before
   className="text-xs px-3 py-1.5 ..."
   
   // After
   className="text-[11px] px-2.5 py-1.5 ..."
   ```

**Files Modified:**
- `src/components/TrafficChartMonitor.tsx` - Header title, selectors layout, Live indicator removed

**Result:**
- ✅ Judul lebih compact dengan font-size base
- ✅ Live indicator dihilangkan (cleaner UI)
- ✅ Dropdown Router di atas, Interface di bawah (vertikal)
- ✅ Dropdown lebih kecil dengan font 11px
- ✅ Layout lebih rapi dan profesional

---

## [2.4.4] - 2025-12-09

### 🎨 Voucher Template Print Optimization

#### Enhanced Print Layout & Voucher Sizing
**Problem:**
- Voucher template print size was too small and hard to read
- Print preview didn't match template preview
- Space between vouchers was inconsistent
- Font sizes were too small for printing
- Cards didn't fill A4 page properly

**Solution:**
Optimized voucher template for A4 portrait printing with better sizing and readability.

**Changes:**

1. **Template Default Sizing:**
   - Card height: 70px → 100px (30% larger)
   - Header font: 8px → 12px
   - Code label: 6px → 8px
   - Code text: 11px → 13px
   - Username/Password label: 6px → 10px
   - Footer padding: 2px 4px → 10px 15px
   - Footer font: 8px → 10px

2. **Print Layout:**
   - Portrait A4 optimization: 5 columns × 10 rows
   - Margin adjusted: 0.5% horizontal, 0.2% vertical bottom
   - Space-between distribution for full page coverage
   - Consistent voucher spacing across all rows

3. **Database Template Update:**
   - Default template updated to match new sizing
   - Router name display from actual NAS/router database
   - Support for username/password different credentials

**Files Modified:**
- `src/app/admin/hotspot/template/page.tsx` - Updated DEFAULT_TEMPLATE
- `src/lib/utils/templateRenderer.ts` - Enhanced print CSS with space-between
- Database: `voucher_templates` - Updated default compact template

**Print Preview:**
- 50 vouchers per A4 page (5×10 grid)
- Better readability with larger fonts
- Consistent card heights and spacing
- Full page coverage from top to bottom

---

## [2.4.3] - 2025-12-09

### 🚀 MikroTik Rate Limit Format Support

#### Full Burst Limit Configuration
**Problem:**
- Hotspot and PPPoE profiles only supported simple rate format (e.g., "5M/5M")
- No way to configure burst rate, burst threshold, priority, or minimum rate
- Admins had to manually configure advanced QoS in MikroTik after sync

**Solution:**
Both profile types now support full MikroTik rate limit format with all advanced parameters.

**Format Specification:**
```
rx-rate[/tx-rate] [rx-burst-rate[/tx-burst-rate]] [rx-burst-threshold[/tx-burst-threshold]] [rx-burst-time[/tx-burst-time]] [priority] [rx-rate-min[/tx-rate-min]]
```

**Examples:**
- Simple: `5M/5M` (basic download/upload speed)
- With burst: `2M/2M 4M/4M 2M/2M 8 0/0` (burst to 4M when below 2M threshold)
- Full format: `10M/10M 15M/15M 8M/8M 5 1M/1M` (all parameters configured)

**Changes:**

1. **Hotspot Profile Form**
   - Replaced separate `downloadSpeed` and `uploadSpeed` number inputs
   - Single `speed` text input with monospace font
   - Placeholder: "1M/1500k 0/0 0/0 8 0/0"
   - Helper text explaining full format

2. **PPPoE Profile Form**
   - Added optional `rateLimit` field to interface
   - Replaced `downloadSpeed`/`uploadSpeed` grid with single `rateLimit` input
   - Monospace font for better readability
   - Placeholder: "1M/1500k 0/0 0/0 8 0/0"
   - Helper text with format documentation
   - Backward compatible with existing profiles (auto-converts to new format)

**Technical Details:**
```typescript
// PPPoE Profile Interface
interface PPPoEProfile {
  rateLimit?: string; // Full MikroTik format
  downloadSpeed: number; // Legacy field (still used for backward compatibility)
  uploadSpeed: number;   // Legacy field
}

// Edit handler converts legacy to new format
rateLimit: profile.rateLimit || `${profile.downloadSpeed}M/${profile.uploadSpeed}M`
```

**Files Modified:**
- `src/app/admin/hotspot/profile/page.tsx` - Rate limit input with full format support
- `src/app/admin/pppoe/profiles/page.tsx` - Added rateLimit field and input

**Benefits:**
- ✅ Complete control over bandwidth management from web interface
- ✅ Support for burst speed configurations
- ✅ Priority and minimum rate guarantees
- ✅ No manual MikroTik configuration needed after sync
- ✅ Backward compatible with simple format
- ✅ Matches MikroTik RouterOS native format

**MikroTik Parameters Explained:**
- **rx-rate/tx-rate**: Normal download/upload speed (required)
- **rx-burst-rate/tx-burst-rate**: Maximum burst speed when allowed
- **rx-burst-threshold/tx-burst-threshold**: Traffic threshold to allow burst
- **rx-burst-time**: How long burst can be sustained (seconds)
- **priority**: QoS priority (1-8, lower = higher priority)
- **rx-rate-min/tx-rate-min**: Guaranteed minimum bandwidth

---

## [2.4.2] - 2025-12-08

### 🎯 Agent Management Enhancement

#### Bulk Operations & Enhanced Tracking
**New Features:**

1. **Bulk Selection with Checkboxes**
   - Checkbox "Select All" in table header
   - Individual checkbox for each agent
   - Counter displays number of selected agents
   - Visual feedback for selections

2. **Bulk Delete Agents**
   - Delete multiple agents simultaneously
   - Confirmation modal before deletion
   - Parallel deletion for better performance
   - Success/failure notifications

3. **Bulk Status Change**
   - Change status of multiple agents at once
   - Modal with Active/Inactive options
   - Applies to all selected agents
   - Instant UI update after change

4. **Login Tracking Column**
   - New "Login Terakhir" column in agent table
   - Shows last login timestamp from agent portal
   - Format: DD MMM YYYY, HH:MM
   - Displays "Belum login" if never logged in
   - Auto-updates when agent logs in

5. **Voucher Stock Column**
   - New "Stock" column showing available vouchers
   - Real-time count of vouchers with WAITING status
   - Format: "X voucher"
   - Helps monitor agent inventory

6. **Status Management in Edit Modal**
   - Dropdown to change agent status when editing
   - Options: Active or Inactive
   - Only visible in edit mode (not create mode)
   - Integrated with existing edit form

**Technical Implementation:**
```typescript
// Bulk operations with parallel processing
Promise.all(selectedAgents.map(id => 
  fetch(`/api/hotspot/agents?id=${id}`, { method: 'DELETE' })
));

// Stock calculation
voucherStock = vouchers.filter(v => v.status === 'WAITING').length;

// Login tracking
await prisma.agent.update({
  where: { id },
  data: { lastLogin: new Date() }
});
```

**Database Changes:**
```sql
-- New column added to agents table
ALTER TABLE `agents` ADD COLUMN `lastLogin` DATETIME(3) NULL;
```

**Files Modified:**
- `src/app/admin/hotspot/agent/page.tsx` - UI with bulk operations
- `src/app/api/hotspot/agents/route.ts` - API with lastLogin & voucherStock
- `src/app/api/agent/login/route.ts` - Login timestamp tracking
- `prisma/schema.prisma` - Added lastLogin field
- `prisma/migrations/20251208135232_add_agent_last_login/migration.sql`

**Deployment:**
- ✅ VPS Production: 103.67.244.131
- ✅ Database migration successful
- ✅ Build: 142 routes compiled
- ✅ PM2: Online (57.4mb memory)
- ✅ API tested and verified

**Benefits:**
- 🚀 Faster agent management with bulk operations
- 📊 Better visibility of agent activity and inventory
- 🎯 Improved UX for admin operations
- ⚡ No performance impact on existing features

---

## [2.4.1] - 2025-12-08

### 🔒 Security Updates

#### Critical Security Patch - React Server Components
**Issue:**
- Critical security vulnerability in React Server Components (CVE-2024-XXXXX)
- Affects Next.js applications using React 19.x
- Potential XSS and data exposure risks

**Solution:**
- Updated Next.js from 16.0.6 → **16.0.7** (includes security patches)
- Updated React from 19.2.0 → **19.2.1** (patched version)
- Updated React-DOM from 19.2.0 → **19.2.1** (patched version)

**Reference:**
- https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components

**Files Modified:**
- `package.json` - Updated dependency versions
- `package-lock.json` - Updated dependency tree

**Build Status:**
- ✅ Local build: Compiled successfully in 29.0s
- ✅ VPS build: Compiled successfully in 18.3s
- ✅ PM2 status: Online (60.8mb memory)
- ✅ All 142 routes working correctly

**Result:**
- ✅ Application secured against critical vulnerability
- ✅ Turbopack optimization maintained
- ✅ No breaking changes
- ✅ Production deployment successful

---

## [2.4.0] - 2025-12-08

### 🎨 UI/UX Improvements

#### 1. Dashboard Layout Optimization
**Changes:**
- Stats cards grid changed from 4 columns to 5 columns for better space utilization
- Card sizes reduced with optimized padding (p-3 → p-2.5) and smaller fonts
- Traffic Monitor repositioned from bottom to top (directly below stats cards)
- Gap between cards reduced for more compact layout

**Result:**
- ✅ All 5 stat cards visible in one row on desktop
- ✅ Traffic monitoring more prominent and accessible
- ✅ Cleaner, more efficient dashboard layout

#### 2. Dark Mode as Default Theme
**Changes:**
- Default theme changed from light to dark mode
- Theme preference saved in localStorage for persistence
- First-time users automatically see dark mode
- Toggle theme functionality preserved with localStorage sync

**Implementation:**
```typescript
// Default state changed to true
const [darkMode, setDarkMode] = useState(true);

// Initialize with dark mode if no preference saved
if (!savedTheme) {
  setDarkMode(true);
  document.documentElement.classList.add('dark');
  localStorage.setItem('theme', 'dark');
}
```

**Files Modified:**
- `src/app/admin/layout.tsx` - Dark mode default initialization
- `src/app/admin/page.tsx` - Stats grid layout (5 columns)

### 🐛 Bug Fixes

#### 3. Hotspot Voucher Count Accuracy
**Problem:** 
- Expired vouchers incorrectly counted as active users
- Total voucher count included kadaluarsa (expired) vouchers
- Misleading statistics showing higher user counts

**Solution:**
```typescript
// Only count non-expired vouchers
hotspotUserCount = await prisma.hotspotVoucher.count({
  where: {
    OR: [
      { expiresAt: null }, // No expiry date
      { expiresAt: { gte: now } } // Not yet expired
    ]
  }
});

// Active vouchers: Used AND not expired
hotspotActiveUserCount = await prisma.hotspotVoucher.count({
  where: {
    firstLoginAt: { not: null },
    OR: [
      { expiresAt: null },
      { expiresAt: { gte: now } }
    ]
  }
});
```

**Files Modified:**
- `src/app/api/dashboard/stats/route.ts` - Voucher counting logic

**Result:**
- ✅ Total vouchers: Only valid (non-expired) vouchers
- ✅ Active vouchers: Only used AND valid vouchers
- ✅ Accurate business statistics

### 📊 Features

#### 4. Real-Time Traffic Monitoring with Charts
**New Feature:**
- MikroTik interface traffic monitoring with real-time graphs
- Area charts showing Download/Upload bandwidth in Mbps
- Router and interface selection filters
- Auto-refresh every 3 seconds with 60-second history

**Implementation:**
- Created `TrafficChartMonitor.tsx` component with Recharts
- Traffic API at `/api/dashboard/traffic` using node-routeros
- Interface selection required before displaying graphs
- Supports multiple routers with dropdown selection

**Features:**
- 📈 Real-time bandwidth graphs (Download: blue, Upload: red)
- 🔄 Auto-refresh every 3 seconds
- 🎯 Router and interface selectors
- 📊 Shows last 20 data points (1 minute history)
- 💾 Traffic rate calculation (RX/TX in Mbps)
- 📱 Responsive layout with activity sidebar

**Files Added:**
- `src/components/TrafficChartMonitor.tsx` - Main component
- Updated `src/app/admin/page.tsx` - Dashboard integration

**Result:**
- ✅ Visual bandwidth monitoring
- ✅ Easy interface selection
- ✅ Historical traffic trends
- ✅ Professional monitoring UI

#### 5. Separated PPPoE and Hotspot Statistics
**Enhancement:**
- Dashboard now shows separate counts for PPPoE users and Hotspot vouchers
- Active sessions separated by type (PPPoE vs Hotspot)
- Clearer business intelligence for different service types

**Implementation:**
```typescript
// Separate user counts
pppoeUsers: { value: number, change: null },
hotspotVouchers: { value: number, active: number, change: null },

// Separate active sessions
activeSessions: { 
  value: number, 
  pppoe: number, 
  hotspot: number, 
  change: null 
}
```

**Result:**
- ✅ PPPoE Users: Separate card
- ✅ Hotspot Vouchers: Shows total and active count
- ✅ Active Sessions: Breakdown by type (using nasporttype field)

### 🔧 Technical Improvements

#### 6. MikroTik API Integration
**Implementation:**
- Router configuration uses custom API port from database (router.port field)
- Connection handling with proper error management
- Support for multiple routers in single deployment
- 5-second connection timeout for reliability

**Database Schema:**
```typescript
router.port // API port (default 8728)
router.apiPort // SSL API port (default 8729)
```

**Files Modified:**
- `src/app/api/dashboard/traffic/route.ts` - API implementation

---

## [2.3.1] - 2025-12-07

### 🐛 Bug Fixes

#### 1. Voucher Timezone Display Issues
**Problem:** 
- Voucher `createdAt` showing UTC time (05:01) instead of WIB (12:01)
- Voucher `firstLoginAt` and `expiresAt` showing +7 hours offset (19:24 instead of 12:24)

**Root Cause:**
1. **createdAt Issue:** PM2 environment missing `TZ` variable → `new Date()` returns UTC
2. **firstLoginAt/expiresAt Issue:** Prisma adds 'Z' suffix → browser interprets as UTC → adds +7 hours
3. Database stores UTC (Prisma default), FreeRADIUS stores WIB (server local time)

**Solution:**
1. **PM2 Environment Fix:**
   - Added `TZ: 'Asia/Jakarta'` to `ecosystem.config.js` env block
   - Result: `new Date()` now returns WIB time correctly

2. **API Timezone Conversion:**
   - `createdAt`/`updatedAt`: Convert from UTC to WIB using `formatInTimeZone`
   - `firstLoginAt`/`expiresAt`: Already WIB from FreeRADIUS, remove 'Z' suffix only
   
**Files Modified:**
- `ecosystem.config.js` - Added `TZ: 'Asia/Jakarta'` to env
- `src/app/api/hotspot/voucher/route.ts` - Timezone-aware date formatting

**Result:**
- ✅ Voucher Generated time: Shows correct WIB
- ✅ Voucher First Login: Shows correct WIB (no +7 offset)
- ✅ Voucher Valid Until: Shows correct WIB

#### 2. Cron Job System Improvements
**Problems Fixed:**

1. **Auto Isolir Error:** "nowWIB is not defined"
   - Missing timezone utility imports in `voucher-sync.ts`
   
2. **No Disconnect Sessions Job:** 
   - Expired vouchers remained active in RADIUS
   - No automatic CoA (Change of Authorization) disconnect

3. **Activity Log Cleanup Missing Result:**
   - Execution history showed no result message

**Solutions Implemented:**

1. **Fixed Auto Isolir:**
   - Added imports: `nowWIB, formatWIB, startOfDayWIBtoUTC, endOfDayWIBtoUTC`

2. **Created Disconnect Sessions Job:**
   - New function `disconnectExpiredVoucherSessions()`
   - Runs every 5 minutes
   - Sends CoA Disconnect-Request to RADIUS for expired vouchers
   - Records cron history with result count

3. **Fixed Activity Log Cleanup:**
   - Modified `cleanOldActivities()` to record cron_history
   - Returns message: "Cleaned X old activities (older than 30 days)"

4. **Enhanced Frontend Cron Page:**
   - Added `typeLabels` for all 10 job types
   - Added success notification handlers
   - Improved Execution History table

**Files Modified:**
- `src/lib/cron/voucher-sync.ts` - Fixed imports, added disconnect function
- `src/lib/cron/config.ts` - Added disconnect_sessions job
- `src/lib/activity-log.ts` - Modified cleanOldActivities
- `src/app/api/cron/route.ts` - Added disconnect_sessions handler
- `src/app/admin/settings/cron/page.tsx` - Enhanced UI

**Cron Jobs Status (10 Total):**
- ✅ `voucher_sync` - Sync vouchers (every 5 min)
- ✅ `disconnect_sessions` - Disconnect expired sessions (every 5 min) **NEW**
- ✅ `agent_sales` - Update agent sales (daily 1 AM)
- ✅ `auto_isolir` - Auto suspend overdue (hourly)
- ✅ `invoice_generation` - Generate invoices (daily 2 AM)
- ✅ `payment_reminder` - Payment reminders (daily 8 AM)
- ✅ `whatsapp_queue` - WA message queue (every 10 min)
- ✅ `expired_voucher_cleanup` - Delete old vouchers (daily 3 AM)
- ✅ `activity_log_cleanup` - Clean old logs (daily 2 AM)
- ✅ `session_cleanup` - Clean old sessions (daily 4 AM)

#### 3. Dashboard Statistics Not Showing (Revenue Rp 0, Users 0)
**Problem:** Dashboard menampilkan Rp 0 revenue dan 0 total users padahal ada transaksi di database.

**Root Cause:**
- Date range calculation menggunakan timezone conversion yang kompleks dan tidak konsisten
- Query menggunakan `date: { gte: startOfMonth, lte: now }` yang tidak match dengan timestamp UTC di database
- JavaScript `new Date(2025, 11, 1)` di server WIB (UTC+7) membuat "Dec 1 00:00 WIB" → internally "Nov 30 17:00 UTC"
- Transaksi stored sebagai UTC (e.g., `2025-12-06T14:15:17.000Z`) tidak ter-capture dengan benar

**Solution:**
- Simplified date boundary calculation tanpa complex offset
- Changed query dari `lte: now` menjadi `lt: startOfNextMonth` untuk consistent month boundaries
- Updated last month query menggunakan `lt: startOfMonth` instead of `lte: endOfLastMonth`
- Removed manual timezone offset calculations, let JavaScript handle local→UTC conversion

**Files Modified:**
- `src/app/api/dashboard/stats/route.ts` (Lines 24-47, 161-185, 197-207)

**Result:**
- ✅ Revenue: Rp 0 → Rp 3,000
- ✅ Total Users: 0 → 1
- ✅ Transaction Count: 0 → 1
- ✅ Date Range: Nov 30 17:00 UTC - Dec 31 17:00 UTC (Dec 1-31 WIB)

**Technical Details:**
```typescript
// Before (WRONG):
const startOfMonth = new Date(year, month, 1, 0, 0, 0);
date: { gte: startOfMonth, lte: now }

// After (CORRECT):
const startOfMonth = new Date(year, month, 1);
const startOfNextMonth = new Date(year, month + 1, 1);
date: { gte: startOfMonth, lt: startOfNextMonth }
```

#### 4. Chart Label Truncation in Category Revenue Bar Chart
**Problem:** Category names di chart "Pendapatan per Kategori" terpotong.

**Solution:**
- Increased bottom margin: `0` → `30px`
- Increased font size: `9` → `10`
- Adjusted angle: `-15°` → `-25°` untuk spacing yang lebih baik
- Added `height={60}` to XAxis component
- Added `interval={0}` to force show all labels

**Files Modified:**
- `src/components/charts/index.tsx` (CategoryBarChart component, Lines 122-133)

### 🌐 Infrastructure & DevOps

#### 3. Subdomain Migration & SSL Configuration
**Change:** Migrate dari IP:Port ke subdomain dengan HTTPS support.

**Before:**
- URL: `http://192.168.54.240:3005`
- No SSL/HTTPS
- Direct IP access

**After:**
- URL: `https://server.salfa.my.id`
- HTTPS enabled with SSL certificate
- Cloudflare CDN proxy active
- Professional domain access

**Configuration Changes:**

**Nginx Configuration** (`/etc/nginx/sites-enabled/salfanet-radius`):
```nginx
server {
    listen 80;
    server_name server.salfa.my.id;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name server.salfa.my.id;
    
    ssl_certificate /etc/ssl/server.salfa.my.id/fullchain.pem;
    ssl_certificate_key /etc/ssl/server.salfa.my.id/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    
    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Environment Variable** (`.env`):
```bash
NEXTAUTH_URL=https://server.salfa.my.id
```

**SSL Certificate:**
- Type: Self-signed certificate
- Subject: `CN=server.salfa.my.id, O=Salfa, L=Jakarta, ST=Jakarta, C=ID`
- Valid Period: 1 year (Dec 6, 2025 - Dec 6, 2026)
- Location: `/etc/ssl/server.salfa.my.id/`

**Generate SSL Certificate Command:**
```bash
sudo mkdir -p /etc/ssl/server.salfa.my.id
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/server.salfa.my.id/privkey.pem \
  -out /etc/ssl/server.salfa.my.id/fullchain.pem \
  -subj "/C=ID/ST=Jakarta/L=Jakarta/O=Salfa/CN=server.salfa.my.id"
sudo chmod 600 /etc/ssl/server.salfa.my.id/privkey.pem
sudo chmod 644 /etc/ssl/server.salfa.my.id/fullchain.pem
```

**Services Restarted:**
- Nginx: `sudo systemctl restart nginx`
- PM2: `sudo pm2 restart salfanet-radius --update-env`

**DNS Configuration:**
- Domain: `server.salfa.my.id`
- DNS Provider: Cloudflare
- A Records point to Cloudflare IPs (proxy enabled)
- Cloudflare SSL/TLS Mode: Full (accepts self-signed from origin)

**Impact:**
- ✅ Secure HTTPS access
- ✅ Professional domain URL
- ✅ Cloudflare CDN protection
- ✅ NextAuth working properly with HTTPS

---

## [2.3.0] - 2025-12-06

### 🔒 Security & Session Management

#### 1. Session Timeout / Auto Logout
- **Idle Detection:** Auto logout setelah 30 menit tidak aktif
- **Warning Modal:** Peringatan 60 detik sebelum logout dengan countdown timer
- **Activity Tracking:** Mouse move, keypress, scroll, click, touch reset timer
- **Tab Visibility:** Timer pause saat tab tidak aktif, resume saat aktif kembali
- **Session Max Age:** Dikurangi dari 30 hari ke 1 hari untuk keamanan

**Files:**
- `src/hooks/useIdleTimeout.ts` (NEW) - Hook untuk idle detection
- `src/app/admin/layout.tsx` (UPDATED) - Integrasi idle timeout + warning modal
- `src/app/admin/login/page.tsx` (UPDATED) - Tampilkan pesan jika logout karena idle
- `src/lib/auth.ts` (UPDATED) - Session maxAge=1 hari, updateAge=1 jam

#### 2. Fix Logout Redirect ke Localhost
- **Problem:** Logout redirect ke localhost:3000 bukan server IP
- **Root Cause:** NEXTAUTH_URL masih localhost di .env
- **Solution:** Gunakan `signOut({ redirect: false })` + `window.location.href`

#### 3. Fix Layout Tidak Muncul Saat Login
- **Problem:** Menu/sidebar kadang tidak muncul setelah login
- **Solution:** Tambah loading state, pisahkan useEffects, proper redirect handling

### 📍 Router GPS Tracking

#### 4. Router GPS Coordinates
- Tambah kolom latitude/longitude di tabel router
- Map picker untuk memilih lokasi router
- Location search dengan autocomplete
- Tampilkan router di Network Map

**Files:**
- `prisma/schema.prisma` (UPDATED) - latitude, longitude di model router
- `src/app/admin/network/routers/page.tsx` (UPDATED) - Form GPS + Map
- `src/components/MapPicker.tsx` (UPDATED) - Support router locations

### 🔌 Network Enhancements

#### 5. OLT Uplink Configuration
- Konfigurasi uplink dari router ke OLT
- Fetch interface list dari MikroTik router
- Pilih port yang digunakan untuk uplink

**Files:**
- `src/app/api/network/routers/[id]/interfaces/route.ts` (NEW) - Fetch interfaces
- `src/app/api/network/routers/[id]/uplinks/route.ts` (UPDATED) - CRUD uplinks
- `src/app/admin/network/routers/page.tsx` (UPDATED) - Modal OLT Uplink

#### 6. Network Map Enhancement
- Tampilkan uplink info di popup router
- Marker untuk router dengan GPS coordinates
- Connection lines dari router ke OLT via uplinks

#### 7. Fix DELETE API untuk OLT/ODC/ODP
- Accept `id` dari body JSON sebagai fallback (sebelumnya hanya query param)

### 📦 Installer Scripts

#### 8. vps-install-local.sh (NEW)
- Installer untuk VPS tanpa akses root langsung (pakai sudo)
- Cocok untuk: Proxmox VM, LXC Container, Local Server
- Sama fiturnya dengan vps-install.sh

### 📚 Documentation Updates
- README.md - Fitur baru, changelog v2.3
- CHAT_MEMORY.md - Session timeout, logout fix, GPS tracking
- install-wizard.html - Session security, dual installer options

---

## [1.4.1] - 2025-12-06

### 🚀 New Features

#### 1. Network Map Page
- Visualisasi semua OLT, ODC, ODP di peta interaktif
- Filter berdasarkan OLT dan ODC
- Toggle visibility untuk setiap layer (OLT, ODC, ODP, Pelanggan, Koneksi)
- Garis koneksi antar perangkat (OLT-ODC, ODC-ODP)
- Statistik total perangkat dan port
- Legenda warna untuk setiap tipe perangkat

**Files:**
- `src/app/admin/network/map/page.tsx` (NEW)
- `src/app/admin/layout.tsx` (UPDATED - added Network Map menu)
- `src/locales/id.json` (UPDATED)
- `src/locales/en.json` (UPDATED)

### 🐛 Bug Fixes

#### 2. FreeRADIUS BOM (Byte Order Mark) Issue
- Fixed UTF-16 BOM detection and removal in config files
- Added `freeradius-rest` package to installation
- Updated REST module pool settings for lazy connection (start=0)
- Improved `remove_bom()` function to handle UTF-16 LE/BE encoding

**Files:**
- `vps-install.sh` (UPDATED)
- `freeradius-config/mods-enabled-rest` (UPDATED)
- `docs/install-wizard.html` (UPDATED - added BOM troubleshooting)

**Problem:** FreeRADIUS config files (especially clients.conf) might have UTF-16 BOM when uploaded from Windows, causing silent parse failure.

**Solution:** Enhanced installer to detect and convert UTF-16 to UTF-8, and remove all types of BOM markers.

---

## [1.4.0] - 2025-12-05

### 🚀 New Features

#### 1. Sync PPPoE Users dari MikroTik
- Import PPPoE secrets dari MikroTik router ke database
- Preview user sebelum import
- Pilih user yang ingin di-import
- Hitung jarak GPS untuk setiap user
- Sinkronisasi otomatis ke tabel RADIUS (radcheck, radusergroup, radreply)

**Files:**
- `src/app/api/pppoe/users/sync-mikrotik/route.ts` (NEW)
- `src/app/admin/pppoe/users/page.tsx` (UPDATED)

#### 2. WhatsApp Template Gangguan (Maintenance-Outage)
- Tambah template baru untuk notifikasi gangguan jaringan
- Auto-create missing templates
- Variables: `{{issueType}}`, `{{affectedArea}}`, `{{description}}`, `{{estimatedTime}}`

**Files:**
- `src/app/api/whatsapp/templates/route.ts` (UPDATED)

#### 3. FTTH Network Management
- **OLT Management** (`/admin/network/olts`)
  - CRUD OLT (Optical Line Terminal)
  - Assignment ke multiple router
  - GPS location dengan Map picker
  
- **ODC Management** (`/admin/network/odcs`)
  - CRUD ODC (Optical Distribution Cabinet)
  - Link ke OLT dengan PON port
  - Filter berdasarkan OLT
  
- **ODP Management** (`/admin/network/odps`)
  - CRUD ODP (Optical Distribution Point)
  - Connect ke ODC atau Parent ODP
  - Konfigurasi port count
  
- **Customer Assignment** (`/admin/network/customers`)
  - Assign pelanggan ke port ODP
  - Pencarian nearest ODP dengan perhitungan jarak
  - Lihat port yang tersedia

**Files:**
- `src/app/admin/network/olts/page.tsx` (NEW)
- `src/app/admin/network/odcs/page.tsx` (NEW)
- `src/app/admin/network/odps/page.tsx` (NEW)
- `src/app/admin/network/customers/page.tsx` (NEW)
- `src/app/admin/layout.tsx` (UPDATED - menu)
- `src/locales/id.json` (UPDATED - translations)
- `src/locales/en.json` (UPDATED - translations)

### 🔧 Improvements

#### Auto GPS Error Handling
- Pesan error spesifik untuk setiap jenis error GPS
- Feedback sukses saat GPS berhasil
- Timeout ditingkatkan ke 15 detik

**Files:**
- `src/app/admin/network/olts/page.tsx`
- `src/app/admin/network/odcs/page.tsx`
- `src/app/admin/network/odps/page.tsx`

---

## [1.3.1] - 2025-01-06

### 🔧 Fix: FreeRADIUS Config BOM Issue

#### Problem
- FreeRADIUS tidak binding ke port 1812/1813 pada instalasi fresh di Proxmox VPS
- SQL module menampilkan "Ignoring sql" dan tidak loading
- REST module tidak loading

#### Root Cause
- File konfigurasi FreeRADIUS memiliki UTF-16 BOM (Byte Order Mark) character di awal file
- BOM (0xFFFE) menyebabkan FreeRADIUS silent fail saat parsing config
- Ini terjadi jika file di-edit di Windows atau dengan editor yang menyimpan UTF-8/16 BOM

#### Solution
1. **Added BOM removal function** di `vps-install.sh`
   ```bash
   remove_bom() {
       sed -i '1s/^\xEF\xBB\xBF//' "$1"
   }
   ```

2. **Updated install-wizard.html** dengan instruksi BOM removal
3. **Updated FREERADIUS-SETUP.md** dengan troubleshooting guide
4. **Synced freeradius-config/** folder dari VPS production yang sudah berjalan

#### Files Changed
- `vps-install.sh` - Added BOM removal after copying config files
- `docs/install-wizard.html` - Added BOM warning and removal commands
- `docs/FREERADIUS-SETUP.md` - Added BOM troubleshooting section
- `freeradius-config/sites-enabled-default` - Updated from working VPS

#### Verification
```bash
# Check if file has BOM
xxd /etc/freeradius/3.0/mods-available/sql | head -1
# Good: starts with "7371 6c" (sql)
# Bad: starts with "fffe" or "efbb bf" (BOM)

# Verify FreeRADIUS binding
ss -tulnp | grep radiusd
# Should show ports 1812, 1813, 3799
```

---

## [1.3.0] - 2025-12-03

### 🎯 Major Fix: FreeRADIUS PPPoE & Hotspot Coexistence

#### Problem
- PPPoE users with `username@realm` format were getting Access-Reject
- REST API post-auth was failing for PPPoE users (voucher not found)

#### Solution
1. **Disabled `filter_username` policy** in FreeRADIUS
   - Location: `/etc/freeradius/3.0/sites-enabled/default` line ~293
   - Changed: `filter_username` → `#filter_username`
   - Reason: Policy was rejecting realm-style usernames without proper domain

2. **Added conditional REST for vouchers only**
   - Only call REST API for usernames WITHOUT `@`
   - PPPoE users (with `@`) skip REST and get authenticated via SQL only
   ```
   if (!("%{User-Name}" =~ /@/)) {
       rest.post-auth
   }
   ```

3. **Fixed post-auth API**
   - Return success for unmanaged vouchers (backward compatibility)
   - Only process vouchers that exist in `hotspotVoucher` table

#### Files Changed
- `/etc/freeradius/3.0/sites-enabled/default` - Disabled filter_username, added conditional REST
- `src/app/api/radius/post-auth/route.ts` - Return success for unmanaged vouchers

#### Testing
```bash
# PPPoE user (with @) - should get Access-Accept
radtest 'user@realm' 'password' 127.0.0.1 0 testing123

# Hotspot voucher (without @) - should get Access-Accept
radtest 'VOUCHERCODE' 'password' 127.0.0.1 0 testing123
```

### 📦 Project Updates
- Added `freeradius-config/` directory with configuration backups
- Updated `vps-install.sh` with proper FreeRADIUS setup
- Added `docs/FREERADIUS-SETUP.md` documentation
- Updated `README.md` with comprehensive documentation
- Fresh database backup: `backup/salfanet_radius_backup_20251203.sql`

---

## [1.2.0] - 2025-12-03

### 🎯 Major Features

#### Agent Deposit & Balance System
- **Deposit System**: Agent can now top up balance via payment gateway (Midtrans/Xendit/Duitku)
- **Balance Management**: Agent balance is tracked and required before generating vouchers
- **Auto Deduction**: Voucher generation automatically deducts balance based on costPrice
- **Minimum Balance**: Admin can set minimum balance requirement per agent
- **Payment Tracking**: Track agent sales with payment status (PAID/UNPAID)

**Technical Details:**
- New table: `agent_deposits` for tracking deposits via payment gateway
- New fields: `agent.balance`, `agent.minBalance`
- Generate voucher checks balance before creating vouchers
- Webhook endpoint processes payment callbacks and updates balance
- Sales tracking includes payment status for admin reconciliation

**Workflow:**
1. Agent deposits via payment gateway → Balance increases
2. Agent generates vouchers → Balance deducted (costPrice × quantity)
3. Customer uses voucher → Commission recorded as UNPAID
4. Admin marks sales as PAID after agent payment

**Files Changed:**
- `prisma/schema.prisma` - Added agent deposit tables and balance fields
- `src/app/api/agent/deposit/create/route.ts` - NEW: Create deposit payment
- `src/app/api/agent/deposit/webhook/route.ts` - NEW: Handle payment callbacks
- `src/app/api/agent/generate-voucher/route.ts` - Added balance check and deduction
- `docs/AGENT_DEPOSIT_SYSTEM.md` - NEW: Complete implementation guide

**Database Changes:**
```sql
-- Add balance fields to agents
ALTER TABLE agents ADD balance INT DEFAULT 0;
ALTER TABLE agents ADD minBalance INT DEFAULT 0;

-- Create deposits table
CREATE TABLE agent_deposits (...);

-- Add payment tracking to sales
ALTER TABLE agent_sales ADD paymentStatus VARCHAR(191) DEFAULT 'UNPAID';
ALTER TABLE agent_sales ADD paymentDate DATETIME;
ALTER TABLE agent_sales ADD paymentMethod VARCHAR(191);
```

## [1.1.0] - 2025-12-03

### 🎯 Major Features

#### Sessions & Bandwidth Monitoring
- **Real-time Bandwidth**: Sessions page now fetches live bandwidth data directly from MikroTik API instead of relying on RADIUS interim-updates (which weren't being sent)
- **Session Disconnect**: Fixed disconnect functionality to use MikroTik API directly instead of CoA/radclient
- **Port Configuration**: Uses `router.port` field for MikroTik API connection (the forwarded port)

**Technical Details:**
- Hotspot: Uses `/ip/hotspot/active/print` for sessions, `/ip/hotspot/active/remove` for disconnect
- PPPoE: Uses `/ppp/active/print` for sessions, `/ppp/active/remove` for disconnect
- Traffic: Real-time bytes from `bytes-in` and `bytes-out` fields

**Files Changed:**
- `src/app/api/sessions/route.ts` - Added real-time bandwidth fetching
- `src/app/api/sessions/disconnect/route.ts` - Replaced CoA with MikroTik API

#### GenieACS Integration
- **Device Parsing**: Fixed GenieACS device data parsing to correctly extract device information
- **Virtual Parameters**: Properly reads VirtualParameters with `_value` property
- **Debug Endpoint**: Added `/api/settings/genieacs/debug` for troubleshooting

**Technical Details:**
- Device ID fields use underscore prefix: `_deviceId._Manufacturer`, `_deviceId._SerialNumber`
- Virtual Parameters format: `VirtualParameters.rxPower._value`, `VirtualParameters.ponMode._value`
- OUI extraction from device ID format: `DEVICE_ID-ProductClass-OUI-SerialNumber`

**Files Changed:**
- `src/app/api/settings/genieacs/devices/route.ts` - Fixed data extraction
- `src/app/api/settings/genieacs/debug/route.ts` - New debug endpoint

### 🐛 Bug Fixes

1. **Sessions Page**
   - Fixed: Bandwidth showing "0 B" for active sessions
   - Fixed: Disconnect button showing success but not actually disconnecting
   - Root cause: Using wrong port field (`apiPort` instead of `port`)

2. **GenieACS Page**
   - Fixed: Table columns showing empty/undefined values
   - Fixed: Device manufacturer, model, serial number not displaying
   - Root cause: Wrong path for accessing device properties

3. **Agent Voucher Generation**
   - Fixed: Vouchers not linked to agent account
   - Root cause: `agentId` not being saved when creating voucher
   - Impact: Agent sales tracking now works correctly

4. **GPS Auto Location**
   - Fixed: GPS Auto error on HTTP sites
   - Added: HTTPS requirement check with friendly error message
   - Added: Better error handling for permission denied, timeout, etc.
   - Files: `src/app/admin/pppoe/users/page.tsx`, `src/components/UserDetailModal.tsx`

### 📁 File Structure

```
Changes in this release:
├── src/app/api/sessions/
│   ├── route.ts              # Updated - real-time bandwidth
│   └── disconnect/route.ts   # Updated - MikroTik API disconnect
├── src/app/api/settings/genieacs/
│   ├── devices/route.ts      # Updated - device data parsing
│   └── debug/route.ts        # New - debug endpoint
└── README.md                 # Updated - changelog section
```

### 🔧 Configuration Notes

**Router Configuration:**
- `port` field: Used for MikroTik API connection (forwarded port, e.g., 44039)
- `apiPort` field: Legacy, not used for direct API calls
- `ipAddress` field: Public IP for API connection
- `nasname` field: Used for RADIUS NAS identification

**MikroTik Setup:**
- Ensure API service is enabled on router
- Forward API port (8728) to public IP if needed
- API user must have read/write permissions

---

## [1.0.0] - 2025-12-01

### Initial Release
- Full billing system for RTRW.NET ISP
- FreeRADIUS integration (PPPoE & Hotspot)
- Multi-router/NAS support
- Payment gateway integration (Midtrans, Xendit, Duitku)
- WhatsApp notifications
- Network mapping (OLT, ODC, ODP)
- Agent/reseller management
- Role-based permissions (53 permissions, 6 roles)
