# SALFANET RADIUS — Roadmap 2026

> Last updated: **March 10, 2026** | Version: **2.10.27**  
> Legend: ✅ Done · 🔄 In Progress · 📅 Planned · 🐛 Bug/Debt · 🔒 Security

---

## ✅ Completed — Core Features

### ISP Management
- [x] PPPoE User management (CRUD, import, bulk actions)
- [x] Profile/Package management with pricing
- [x] Area/Zone management
- [x] Router/NAS management (multi-NAS same IP supported)
- [x] FreeRADIUS integration (radcheck, radreply, radgroupcheck, radacct)
- [x] MikroTik CoA (Change of Authorization) — isolasi & aktivasi real-time
- [x] GenieACS integration (ONT/device management, parameter monitoring)
- [x] GPON/OLT network mapping (OLT → ODC → ODP → Customer)
- [x] PPPoE Customer Documents — NIK KTP, foto KTP, foto instalasi, followRoad GPS ✅ (Feb 27, 2026)

### Billing & Payment
- [x] Auto invoice generation (monthly, prepaid/postpaid)
- [x] Invoice number standar: `INV/YYYY/MM/DD/NNNN`
- [x] Midtrans payment gateway
- [x] Xendit payment gateway
- [x] Duitku payment gateway
- [x] Tripay payment gateway
- [x] Manual payment (upload bukti transfer, approval admin + notifikasi WA)
- [x] Payment webhook handling + webhook logs
- [x] Isolation system (auto-putus saat jatuh tempo via MikroTik CoA)
- [x] Auto-renewal subscription berbasis saldo deposit
- [x] Agent komisi system
- [x] Accounting / COA / Jurnal keuangan
- [x] **POSTPAID auto-expiry extension after payment** — Webhook extends expiry from `max(expiredAt, paymentDate)` + validity period. Admin PUT handler same logic. `billingDay` branch removed from both. ✅ (Mar 8, 2026)
- [x] **Duitku payment methods API** — `/api/payment/duitku-methods`, individual method buttons with `MIN_AMOUNT` filter, `BV`=BSI VA / `BC`=BCA VA corrected. ✅ (Mar 8, 2026)
- [x] **Invoice catch-up cron** — Auto-generate missing invoices for isolated/expired users in scheduled cron & admin manual trigger. ✅ (Mar 8, 2026)

### Customer Portal (Web)
- [x] Customer login via username+password (atau OTP WhatsApp)
- [x] Dashboard: status langganan, tagihan, device ONT, saldo deposit
- [x] Halaman invoice terpisah — list + filter + pagination + auto-poll 15s ✅ (v2.10.9)
- [x] Payment status tracking — polling 15s, toast konfirmasi/tolak ✅ (v2.10.9)
- [x] Profile edit — nama/nomor HP/email, validasi input ✅ (v2.10.9)
- [x] Ganti paket (upgrade/downgrade) dengan invoice otomatis
- [x] Top-up saldo deposit (direct via payment gateway + manual request)
- [x] **Payment channel selection saat top-up** — Pilih VA BCA/Mandiri/BNI/CIMB/Permata/OVO/ShopeePay via `/api/customer/payment-methods`, auto-select first, fee display ✅ (Mar 10, 2026)
- [x] Tiket support
- [x] Pengaturan WiFi SSID/Password (via GenieACS)
- [x] Notifikasi real-time (bell icon, localStorage persistent, auto-poll 30s)
- [x] Auto-refresh halaman saat admin konfirmasi pembayaran
- [x] Multi-language (ID/EN)
- [x] Cyberpunk dark theme + responsive (desktop + mobile browser)

### Admin Panel
- [x] Dashboard analytics + active sessions counter real-time (via RouterOS API + radacct)
- [x] Manajemen pelanggan (list, detail, edit, suspend, activate, isolasi)
- [x] Manajemen invoice (create, mark paid, delete, filter)
- [x] Manajemen pembayaran manual (approve/reject + notifikasi WA otomatis)
- [x] Broadcast notifikasi (WA/push per area/semua pelanggan)
- [x] Activity log
- [x] Cron job system (auto-billing, renewal, expiry, reminder)
- [x] Top-up request management
- [x] GPS location tracking lapangan + peta
- [x] WhatsApp integration (multi-provider: Dripsender, WA Business, dll)
- [x] Push notification (Firebase FCM)
- [x] Email notifications + template editor
- [x] Voucher/e-voucher system (hotspot)
- [x] VPN management (L2TP/PPTP/SSTP client + server)
- [x] Hotspot profile & agent management
- [x] Backup & restore (Telegram)
- [x] Multi-admin role & permission granular
- [x] Sidebar 3-level hierarchy (MenuGroup → MenuItem → Children) ✅ (Feb 25, 2026)
- [x] **2FA admin login** — TOTP (Google Authenticator) inline 2-step flow ✅ (Feb 27, 2026)
- [x] **Export Laporan PDF/Excel** — Invoice/Pembayaran/Pelanggan, Excel+PDF ✅ (Feb 27, 2026)
- [x] **VPN control modal inline SSH forms** — Hapus double-modal anti-pattern L2TP/PPTP/SSTP, SSH credentials inline di control modal, Apply Routing via Frontend (⚡ button + output terminal modal), fix routing script duplicate bug, new `/api/network/vpn-routing` endpoint ✅ (Mar 2, 2026)
- [x] **Light theme comprehensive fix** — 240+ fixes across 60+ admin files: `text-white`→`text-foreground`, `text-[#e0d0ff]`→`text-muted-foreground`, form inputs `bg-slate-900`→`bg-input`, broken unicode/emoji repair (38 instances in 6 files), globals.css modal bg overrides ✅ (Mar 2, 2026)
- [x] **Project cleanup** — Removed 16 unused one-time scripts (fix_*.py, patch-*.ps1, audit_*.py, timezone-*.js, check-company.js, check_mt.js, src-update.zip), synced FreeRADIUS `mods-enabled/rest` with VPS, verified all configs in sync (nginx, ecosystem, clients.conf, sql, rest, sites-available) ✅ (Mar 2, 2026)
- [x] **isRadiusServer filter** — VPN Client dropdown hanya tampilkan server dengan `isRadiusServer=true`, validasi di `handleConnectL2tp` ✅ (Mar 4, 2026)
- [x] **NAS config auto-sync** — `syncNasClients()` di-integrate ke `freeradiusHealthCheck()` cron (5 menit), returns `boolean` (changed/not), idempotent compare-before-write, `systemctl reload freeradius` jika config berubah (SIGHUP, tidak putus sesi aktif) ✅ Build #164 (Mar 4, 2026)
- [x] **PPPoE session sync cron** — `src/lib/cron/pppoe-session-sync.ts`: query MikroTik API `/ppp/active/print` setiap 5 menit, bandingkan dengan radacct, INSERT sesi yang hilang (akibat FreeRADIUS restart/packet loss), CLOSE sesi stale. Solusi untuk Accounting-Start loss. ✅ Build #165 (Mar 4, 2026)
- [x] **PPPoE active sessions uptime fix** — Dua bug diperbaiki: (1) `acctsessiontime` stale (frozen saat sync) diganti kalkulasi real-time `Math.floor((now - startMs) / 1000)`, (2) Prisma datetime timezone mismatch — Prisma append `Z` (UTC) ke MySQL DATETIME yang tersimpan WIB → durasi negatif; fix: `startMs = new Date(dt).getTime() - TZ_OFFSET_MS`, (3) `pppoe-session-sync.ts` pakai `DATE_SUB(NOW(), INTERVAL ? SECOND)` di MySQL daripada JS Date object ✅ Build #167 (Mar 4, 2026)

### Mobile App (React Native / Expo)
- [x] Customer login OTP
- [x] Dashboard (status, paket, device)
- [x] Riwayat tagihan & pembayaran
- [x] Ganti paket
- [x] Top-up saldo
- [x] **Payment channel selection saat top-up** — Sama dengan web, VA BCA/Mandiri/OVO/ShopeePay, `getPaymentChannels()` service ✅ (Mar 10, 2026)
- [x] Tiket support
- [x] Notifikasi push (FCM)
- [x] GPS location (lapangan)
- [x] Dark theme cyberpunk
- [x] ID Pelanggan + nomor HP display

### Infrastructure & Security
- [x] FreeRADIUS 3.x integration — radcheck, NAS sync, expiration module ✅ (Feb 26, 2026)
- [x] BlastRADIUS fix — `require_message_authenticator = no` ✅ (Feb 26, 2026)
- [x] FreeRADIUS REST authorize — cek expiredAt via `/api/radius/authorize` ✅ (Feb 25, 2026)
- [x] VPS performance — swappiness=10, Redis AOF optimized ✅ (Feb 26, 2026)
- [x] Unicode/Mojibake mass fix — 202 fixes di 31 files ✅ (Feb 26, 2026)
- [x] SSL + Cloudflare setup via `radius.hotspotapp.net` ✅ (Feb 25, 2026)
- [x] Nginx config — `/api/` no-cache, `/_next/static/` 365d cache ✅ (Feb 25, 2026)
- [x] **FreeRADIUS MySQL Error 4031 fix** — SQL pool tuning (`retry_delay=1, lifetime=300, idle_timeout=20, connect_timeout=3, max=32`), config corrupted file restored ✅ (Mar 1, 2026)
- [x] **VPS performance tuning** — swap reclaimed (474MB→0), Redis restart (frag 9.13x→1.17x), nginx gzip_comp_level 6 (was default 1) ✅ (Mar 1, 2026)
- [x] **Theme dark/light instant switch** — `theme-no-transition` CSS class (kills all transition/animation during toggle), cyberpunk-bg hidden in light mode, neon blobs properly suppressed ✅ (Mar 1, 2026)
- [x] **Light theme text visibility audit** — Comprehensive fix: 240+ class replacements across 60+ admin pages, form input restyling (46 inputs in 3 files), unicode/emoji repair (38 broken chars in 6 files), globals.css overrides for dark bg classes ✅ (Mar 2, 2026)
- [x] **Project cleanup & config verification** — Removed 16 unused scripts/files (one-time fix scripts, temp archives, debug scripts with hardcoded credentials), verified FreeRADIUS + Nginx + PM2 configs all in sync between local project and VPS ✅ (Mar 2, 2026)
- [x] **FreeRADIUS NAS auto-sync** — syncNasClients() integrated into health check cron, idempotent, reload-only (SIGHUP) ✅ (Mar 4, 2026)
- [x] **PPPoE session sync cron** — Solves Accounting-Start packet loss on FreeRADIUS restart ✅ (Mar 4, 2026)
- [x] **Uptime real-time calc + Prisma TZ fix** — Sessions API duration always from acctstarttime, TZ_OFFSET_MS correction for Prisma UTC→WIB mismatch ✅ (Mar 4, 2026)
- [x] **Logo dark mode visibility fix** — Added `bg-white p-2` to logo containers in 5 pages (admin login, customer login, technician login, isolated page, customer layout) so black/dark logos uploaded by users remain visible in dark theme ✅ (Mar 5, 2026)
- [x] **Sidebar Komunikasi group** — Moved Notifications + Push Notifications into a collapsible `Komunikasi` group placed directly below Dashboard, above PPPoE/Hotspot. Added `nav.communication` translation key. ✅ (Mar 5, 2026)
- [x] **CyberToastProvider admin root fix** — All admin pages threw "useToast must be used within a CyberToastProvider". Fixed by wrapping `<SessionProvider>` tree with `<CyberToastProvider>` in `AdminLayout` (`src/app/admin/layout.tsx`). ✅ (Mar 5, 2026)
- [x] **PPPoE cron auto-isolir fix** — `isPPPoeSyncRunning` reset moved to `finally` block; prevents permanent lock after any cron error. ✅ (Mar 8, 2026)
- [x] **Admin CyberToast dedup** — ID-based dedup with `sessionStorage` persistence, stable `addToastRef`, removed `addToast` from `useEffect` deps. Prevents repeat toasts on every cron poll. ✅ (Mar 8, 2026)
- [x] **Payment URL localhost fix** — 3 customer portal files: skip localhost-only URLs in Duitku/gateway payment redirect. ✅ (Mar 8, 2026)
- [x] **Dialog/modal inner padding** — `src/components/ui/dialog.tsx`: Added consistent padding so modal form fields don’t touch card borders ✅ (Mar 5, 2026)
- [x] **Modal title text color** — `.modal-title-override` global CSS class in `globals.css` to ensure visible title colors in both dark and light theme ✅ (Mar 5, 2026)
- [x] **Isolated portal complete user info** — `check-isolation` API now also returns `address`, `customerId`, `area.name`, `profilePrice`. Info grid shows these fields conditionally. ✅ PM2 #264 (Mar 7, 2026)
- [x] **Isolated portal compact no-scroll layout** — Redesigned `/isolated` page: reduced padding, inline header (logo 30px), single-row warning banner, primary/secondary info split with "Selengkapnya" toggle (`showAllInfo`), steps collapsible by default (`showSteps`), contact as small inline footer buttons. No scroll on mobile or desktop. ✅ PM2 #265 (Mar 7, 2026)
- [x] **Sidebar nav translation key fixes** — `nav.communication` added to `en.json`, `nav.pushNotifications` added to `id.json`. `nav.isolation` moved from `catManagement` to `catCustomer` group (before Invoices). ✅ PM2 #266 (Mar 7, 2026)
- [x] **Export Keuangan PDF/Excel fix** — `/admin/keuangan` Export button was blocked by `if (!startDate || !endDate)` gate; Excel used `window.open()` (popup blocker). Fixed: gate removed, date optional, Excel uses `fetch`+`Blob`+`a.click()`. API `/api/keuangan/export` updated: `where` now starts empty, date optional, `categoryId` + `search` filters forwarded. ✅ PM2 #267 (Mar 7, 2026)
- [x] **FreeRADIUS + Nginx config re-verified** — Full audit local vs VPS: all configs confirmed in sync (`clients.conf`, `mods-available/sql`, `mods-available/rest`, `sites-available/default`, `sites-available/coa`, `policy.d/filter`, nginx). `clients.d/nas-from-db.conf` is auto-generated by app on VPS; local has template only (correct). ✅ (Mar 7, 2026)
- [x] **FreeRADIUS + Installer + Export audit (Session 31)** — Full re-audit: VPS vs local configs IN SYNC. Installer covers LXC/VM/bare-metal, .env auto-created, all edge cases handled. `export-production.ps1` complete (cron-service.js, .env.example, firebase skip). README files in `freeradius-config/` updated. ✅ (Mar 8, 2026)

---

## 🔒 Security Audit — Completed (Feb 27, 2026)

> **Status: ALL 42 API routes sekarang sudah diamankan. Audit selesai.**

Middleware (`src/proxy.ts`) hanya melindungi page routes `/admin/*`, tidak melindungi `/api/*`. Setiap route handler harus cek auth sendiri menggunakan `getServerSession` pattern.

### Round 1 — Critical (10 routes, credential exposure)
- [x] `freeradius/radcheck` — was exposing RADIUS cleartext passwords
- [x] `freeradius/logs`, `freeradius/status`, `freeradius/config/list`
- [x] `network/routers` — was exposing router secret key
- [x] `sessions`, `invoices`, `notifications`
- [x] `whatsapp/providers`
- [x] `payment-gateway/config` — was exposing Midtrans/payment keys

### Round 2 — Full Coverage (29 routes)
- [x] `settings/genieacs`, `settings/email/templates`
- [x] `keuangan/transactions`, `keuangan/categories`
- [x] `payment-gateway/webhook-logs`
- [x] `permissions/route`, `permissions/role-templates`
- [x] `whatsapp/templates`, `whatsapp/history`, `whatsapp/reminder-settings`
- [x] `admin/technicians`, `admin/topup-requests`, `admin/registrations`
- [x] `admin/push-notifications`, `admin/evoucher/orders`
- [x] `tickets/route`, `tickets/stats`
- [x] `hotspot/profiles`, `hotspot/agents`
- [x] `pppoe/profiles`
- [x] `network/servers`, `network/odps`, `network/olts`, `network/odcs`
- [x] `manual-payments`, `voucher-templates`, `company`, `cron/route`, `cron/status`

### Round 3 — Fix 500→401 (4 routes, `requireAdmin` anti-pattern)
- [x] `admin/isolated-users` — GET: `requireAdmin()` throws → catch → 500, fixed
- [x] `admin/settings/isolation` — GET + PUT: same fix
- [x] `admin/settings/isolation/mikrotik-script` — GET: same fix
- [x] `admin/isolate-user` — POST: same fix

### Intentionally Public
- `settings/company` — returns name/logo/address only (untuk branding login page)

---

## 🔄 In Progress / Segera Dikerjakan

### 🐛 Tech Debt — Prioritas Segera
- [x] **Fix `requireAdmin`/`requireAuth` pattern di route lainnya** — ✅ DONE (Feb 28) — Added `HttpError` class + `handleRouteError()` helper to `src/lib/auth.ts`. All `requireAuth/requireAdmin/requireStaff/requireRole` now throw `HttpError(401/403, ...)` instead of plain `Error`. API routes pakai `getServerSession` langsung (pattern yang benar). `requireAdmin` hanya dipakai internal di `auth.ts`.
- [x] **Migrasi SweetAlert2 → CyberToast di customer portal** — ✅ DONE (Mar 1, 2026) — Admin panel + Customer portal FULLY CLEAN (0 Swal). All 19 calls di 4 file dimigrasikan ke CyberToast/showSuccess/showError
- [x] **Fixed translation EN — DONE** — `src/locales/en.json` all Indonesian strings translated to English

### 🔄 Feature — Sudah Dimulai
- [x] **Laporan tagihan export PDF/Excel** — ✅ DONE (Feb 27, 2026) — `/admin/laporan`, 3 tipe laporan (invoice/payment/customer), filter tanggal+status, preview tabel, export Excel (xlsx, auto col width) + PDF (jspdf+autoTable, landscape A4, summary section). API: `/api/admin/laporan`. PM2 #48.

---

## 📅 Planned — Q1 2026

### 🔴 Priority: High

| # | Feature | Estimasi | Notes |
|---|---------|----------|-------|
| 1 | **Export Laporan PDF/Excel** | 2–3 hari | ✅ DONE (Feb 27, 2026) — `/admin/laporan`, xlsx+jspdf, PM2 #48 |
| 2 | **WhatsApp template customizable dari UI** | 3–4 hari | ✅ DONE — DB-backed, 30+ template types, live WA preview, variable insertion, `/admin/whatsapp/templates`, API CRUD `/api/whatsapp/templates` |
| 3 | **Bulk import invoice dari CSV** | 2 hari | ✅ DONE — `/admin/invoices/import`, papaparse, per-row validation+result, `/api/admin/invoices/import` |
| 4 | **Customer self-service suspend** | 1–2 hari | ✅ DONE — `/customer/suspend`, `/admin/suspend-requests`, mobile `suspend.tsx`, API + cron, PM2 #67 |
| 5 | **2FA untuk admin login** | 2–3 hari | ✅ DONE (Feb 27, 2026) — TOTP inline 2-step, PM2 #47 |
| 6 | **Admin dashboard improvements** | 1 hari | ✅ DONE (Feb 28, 2026) — Agent voucher sales section, RADIUS auth log (radpostauth), fix i18n hardcoded strings (28 keys), PM2 #77 |
| 7 | **Full SALFANET rebrand** | 1 hari | ✅ DONE (Feb 28, 2026) — Semua `AIBILL`/`aibill` → `SALFANET`/`salfanet` di seluruh project (src/, vps-install/, docs/, production/), `salfanetradius` MikroTik profiles |

### 🟡 Priority: Medium

| # | Feature | Estimasi | Notes |
|---|---------|----------|-------|
| 6 | **Laporan analitik advanced** | 3–5 hari | ✅ DONE (Feb 28, 2026) — `/admin/laporan/analitik`, churn rate, retention, ARPU, grafik trend, period selector, 8 charts. API: `/api/admin/analytics`. PM2 #78. |
| 7 | **Dark/light mode toggle** | 1 hari | ✅ DONE (Feb 28, 2026) — `useTheme` hook + Sun/Moon toggle di admin header. Light mode CSS vars di `globals.css` (slate/white bg, dark sidebar remain). `localStorage` persistent via `theme` key. Instant switch (no transition) — `theme-no-transition` CSS class. |
| 8 | **Customer referral system** | 3-4 hari | ? DONE (Mar 7, 2026) � Referral code (8-char auto-gen), share URL /daftar?ref=CODE, admin panel /admin/referrals + settings /admin/settings/referral, customer portal /customer/referral (overview + rewards tab), DB migration 20260307_add_referral_system, reward trigger REGISTRATION + FIRST_PAYMENT, admin sidebar Gift icon + nav keys id.json |

### 🟢 Priority: Low

| # | Feature | Estimasi | Notes |
|---|---------|----------|-------|
| 9 | **Widget embed** | 2 hari | Status koneksi embed ke website ISP (iframe/JS snippet) |
| 10 | **Public API** | 5–7 hari | REST API + API key management untuk integrasi pihak ketiga |
| 11 | **SaaS multi-tenant architecture** | 2–4 minggu | NestJS backend + Next.js frontend, per-ISP isolation |

---

## 📅 Planned — Q2 2026

| # | Feature | Notes |
|---|---------|-------|
| 15 | **Multi-currency support** | Untuk ISP yang melayani > 1 negara |
| 16 | **Hotspot splash page builder** | Admin bisa desain halaman login hotspot |
| 17 | **Auto-konfigurasi ONT via GenieACS** | Provisioning otomatis saat pelanggan baru aktif |
| 18 | **Monitoring bandwidth real-time** | Grafik upload/download per pelanggan dari radacct |
| 19 | **Mobile app versi 2** | Fitur lebih lengkap: topup, tiket, notifikasi push |

---

## 🐛 Known Issues / Tech Debt

| # | Issue | Prioritas | Status | Notes |
|---|-------|-----------|--------|-------|
| 1 | `requireAdmin()`/`requireAuth()` masih dipakai di beberapa route | ✅ Fixed | Closed | `HttpError` class + `handleRouteError()` helper ditambahkan ke `src/lib/auth.ts` (Feb 28) |
| 2 | SweetAlert2 masih di customer portal | ✅ Fixed | Closed | Semua 19 Swal calls di 4 file sudah dimigrasikan ke CyberToast (Mar 1, 2026). Customer portal + admin panel FULLY CLEAN (0 Swal). |
| 3 | Translation `en.json` banyak masih Indonesia | 🟡 Sedang | ✅ DONE | All Indonesian strings fixed — full audit completed |
| 4 | GenieACS timeout saat perangkat offline | 🟡 Sedang | Open | Belum return graceful error, bisa crash halaman |
| 5 | Cron `next-run` kadang terlambat 1–2 menit | 🟢 Rendah | Open | Tergantung server load di VPS resource terbatas |
| 6 | `mobile-app/` ada di monorepo root | 🟢 Rendah | Known | Idealnya dipisah ke repo sendiri |
| 7 | `MYSQL_OPT_RECONNECT deprecated` di FreeRADIUS | 🟢 Rendah | Known | Dari libmysql MySQL 8.0+, tidak bisa fix tanpa recompile FreeRADIUS |
| 8 | Turbopack incremental cache — perlu `rm -rf .next` sebelum build VPS | 🟡 Sedang | Known | Jika lupa, route lama masih terkompilasi meski source sudah diupload |
| 9 | MikroTik script `/ppp profile add` error `expected end of command` (col 121) | 🔴 High | ✅ Fixed (Feb 28) | `use-vj-compression` dihapus dari script — parameter ini tidak ada di RouterOS 7.x. Juga tambah `comment=` ke profil `salfanetradius`. File: `src/app/api/network/routers/[id]/setup-radius/route.ts` |
| 10 | Light theme text invisible — white text on light bg across admin pages | 🔴 High | ✅ Fixed (Mar 2) | 240+ fixes across 60+ files: text-white→text-foreground, text-[#e0d0ff]→text-muted-foreground, form inputs restyled, unicode/emoji repaired |
| 11 | Unused one-time fix scripts cluttering `scripts/` directory | 🟢 Rendah | ✅ Fixed (Mar 2) | Removed 16 files (fix_*.py, patch-*.ps1, check_mt.js, src-update.zip). Kept 4 utility scripts |
| 12 | FreeRADIUS `mods-enabled/rest` missing `post-auth` section locally | 🟡 Sedang | ✅ Fixed (Mar 2) | Synced with `mods-available/rest` (the VPS source of truth) |
| 13 | PPPoE active session tidak muncul di web setelah FreeRADIUS restart | 🔴 High | ✅ Fixed (Mar 4) | Accounting-Start packet hilang saat restart → insert manual via MikroTik API di `pppoe-session-sync.ts` cron 5 menit |
| 14 | PPPoE uptime berbeda antara web dan MikroTik | 🔴 High | ✅ Fixed (Mar 4) | (1) `acctsessiontime` stale → now real-time from `acctstarttime`, (2) Prisma `Z`-suffix UTC bug → `TZ_OFFSET_MS` correction, (3) `pppoe-session-sync.ts` pakai `DATE_SUB(NOW(), INTERVAL ? SECOND)` |
| 15 | FreeRADIUS NAS config out-of-sync setelah ubah secret di DB | 🟡 Sedang | ✅ Fixed (Mar 4) | `syncNasClients()` diintegrasikan ke health-check cron, reload SIGHUP bila berubah — tidak perlu restart manual |

| 16 | `CyberToastProvider` missing in admin root layout | 🔴 High | ✅ Fixed (Mar 5) | All admin pages: "useToast must be used within a CyberToastProvider" — wrapped `SessionProvider` with `CyberToastProvider` in `AdminLayout` |
| 17 | Modal/dialog inner content touches card borders | 🟢 Low | ✅ Fixed (Mar 5) | Added Tailwind padding in `dialog.tsx`; modal title visibility fixed via `.modal-title-override` CSS |
| 18 | Black logo invisible on dark login/portal pages | 🟡 Medium | ✅ Fixed (Mar 5) | Added `bg-white p-2` to logo `<div>` in admin login, customer login, technician login, isolated page, customer layout |
| 19 | `/isolated` page shows raw translation keys (`nav.communication` dll) in EN locale | 🔴 High | ✅ Fixed (Mar 7) | `nav.communication` ditambahkan ke `en.json`; `nav.pushNotifications` ditambahkan ke `id.json`; menu `nav.isolation` dipindah ke grup `catCustomer` |
| 20 | Export Excel/PDF di `/admin/keuangan` tidak berfungsi | 🔴 High | ✅ Fixed (Mar 7) | Gate `if (!startDate || !endDate)` dihapus; Excel dari `window.open` → `fetch`+`Blob`+`a.click()`; API export: `where` opsional, filter `categoryId`+`search` diteruskan |
| 21 | `/isolated` portal scroll panjang di mobile | 🟡 Medium | ✅ Fixed (Mar 7) | Redesign compact: padding kecil, banner satu baris, info toggle "Selengkapnya", langkah collapsible (default hidden) |
| 22 | Hotspot session duration = 0s + TZ mismatch `firstLoginAt`/`expiresAt` | 🔴 High | ✅ Fixed (Mar 7) | `firstLoginAt`/`expiresAt` disimpan sebagai WIB naive DATETIME; Prisma append `Z` → 7h terlalu besar → countdown negatif. Fix: subtract `TZ_OFFSET_MS` di sessions API + agent sessions API. PM2 #286. |
| 23 | Hotspot sessions hilang dari halaman admin saat device masih online | 🔴 High | ✅ Fixed (Mar 7) | `Accounting-Stop` (Lost-Carrier) set `acctstoptime` → `WHERE acctstoptime IS NULL` miss device. Fix: step 4.5 synthesize sesi dari MikroTik `/ip/hotspot/active/print` (`dataSource: 'live'`). PM2 #285. |
| 24 | Kolom durasi hotspot/agent sessions tampilkan uptime, bukan sisa waktu | 🟡 Medium | ✅ Fixed (Mar 7) | Tambah `expiresAt` ke API response (TZ-corrected), hitung `liveCountdown = expiresAt - now`, tampil sebagai "Xm Ys left". PM2 #285–287. |
| 25 | Agent sessions IP + durasi cell hardcoded `text-white` (invisible di light mode) | 🟡 Medium | ✅ Fixed (Mar 7) | `text-white` → `text-slate-900 dark:text-white` di `src/app/agent/sessions/page.tsx`. PM2 #287. |
| 26 | Notification dropdown agent: teks tidak terlihat di light mode | 🟡 Medium | ✅ Fixed (Mar 7) | `NotificationDropdown.tsx`: message body `text-slate-700` → `text-slate-800`, date stamp `text-cyan-600` → `text-slate-600`. PM2 #287. |
| 27 | PPPoE cron `isPPPoeSyncRunning` terkunci setelah error | 🔴 High | ✅ Fixed (Mar 8) | Reset flag dipindahkan ke `finally` block agar selalu di-clear meski terjadi exception |
| 28 | Webhook POSTPAID `expiredAt` tidak di-extend setelah pembayaran | 🔴 High | ✅ Fixed (Mar 8) | `null` diganti dengan `max(expiredAt, now) + validity`; extend dari tanggal terbesar antara expiry lama dan tanggal bayar |
| 29 | Admin PUT handler expiry base date salah (billingDay logic) | 🔴 High | ✅ Fixed (Mar 8) | `billingDay` branch dihapus; keduanya kini pakai `max(expiredAt, now)` sebagai base |
| 30 | Webhook CoA via `fetch()` self-call gagal di environment SSR/Edge | 🔴 High | ✅ Fixed (Mar 8) | Diganti dengan direct import `disconnectPPPoEUser()` dari `coaService` |
| 31 | Duitku: `BV` muncul dengan label "BCA Virtual Account" (salah) | 🟡 Medium | ✅ Fixed (Mar 8) | `BV`=BSI VA, `BC`=BCA VA; `BC` ditambahkan ke defaults + `MIN_AMOUNTS` |
| 32 | CyberToast admin duplikat muncul setiap cron poll | 🔴 High | ✅ Fixed (Mar 8) | ID-based dedup via `sessionStorage` (`toastedNotifIdsRef`), stable `addToastRef`, `addToast` dihapus dari deps `useEffect` |
| 33 | Payment URL gagal di customer portal (localhost URL dikirim ke gateway) | 🟡 Medium | ✅ Fixed (Mar 8) | 3 customer portal files: skip/replace localhost URLs sebelum redirect ke payment gateway |
| 34 | Customer topup-direct: payment method section tidak muncul sebelum isi nominal | 🟡 Medium | ✅ Fixed (Mar 10, Session 33) | Section dibungkus conditional hide — dihapus, section selalu tampil |
| 35 | Customer topup-direct: tidak ada pilihan channel Duitku (hanya gateway) | 🔴 High | ✅ Fixed (Mar 10, Session 33) | New API `/api/customer/payment-methods`, channel list UI + fee display, `paymentChannel` diteruskan ke Duitku |
| 36 | Mobile app APK tidak ada channel selection, hardcode `gateway` only | 🔴 High | ✅ Fixed (Mar 10, Session 33) | `PaymentChannel` interface, `getPaymentChannels()` service, channel list UI di `topup.tsx` |

| 37 | Double toast notifications on all portals | 🔴 High | ✅ Fixed (Mar 19) | Agent: `AgentNotificationDropdown` mounted twice (desktop+mobile) → module-level dedup + `enableToasts` prop. Technician: `NotificationBell` mounted twice → module-level dedup. Admin: dropdown polled independently at 30s → reduced to 60s. |
| 38 | Admin sessions traffic data not updating (full-page spinner on auto-refresh) | 🔴 High | ✅ Fixed (Mar 19) | `fetchSessions` called `setLoading(true)` every 10s → added `silent` param, auto-refresh uses `silent=true` |
| 39 | Agent sessions traffic stops after background tab | 🟡 Medium | ✅ Fixed (Mar 19) | Added `visibilitychange` handler to both admin+agent sessions pages → instant refresh on tab focus |
| 40 | Redis still referenced in codebase after removal | 🔴 High | ✅ Fixed (Mar 19) | Full removal: 3 files deleted, ioredis from package.json, REDIS_URL from .env.example, cron-service.js cleaned |
| 41 | Hotspot traffic only updates every 5 minutes | 🟡 Medium | ✅ Fixed (Mar 19) | `Acct-Interim-Interval` 300→60 seconds in FreeRADIUS + agent sessions auto-refresh 30s |

---

## 🔢 Version History

| Version | Tanggal | Highlight |
|---------|---------|-----------|\n| 2.11.4 | 19 Mar 2026 | **Duplicate Notification Fix + Sessions Traffic Auto-Refresh** — Agent NotificationDropdown double-mount fix (module-level dedup + enableToasts prop). Technician NotificationBell double-mount fix. Admin sessions silent auto-refresh (no full-page spinner). visibilitychange handler for instant refresh on tab focus. |
| 2.11.3 | 19 Mar 2026 | **Full Redis Removal + Hotspot Traffic Real-time** — Removed all ioredis/Redis from codebase (3 files deleted, package.json cleaned, cron-service.js fixed). FreeRADIUS Acct-Interim-Interval 300→60s. Agent sessions auto-refresh 30s added. |
| 2.10.27 | 10 Mar 2026 | **Customer Payment Channel Selection** — Topup-direct web: selalu tampil payment section, pilih channel Duitku (VA BCA/Mandiri/BNI/CIMB/Permata/OVO/ShopeePay) via `/api/customer/payment-methods` (fallback hardcoded), `paymentChannel` diteruskan ke Duitku API. Mobile app sync: `PaymentChannel` interface + `getPaymentChannels()` service + channel list UI. PM2 restart VPS. |
| 2.10.26 | 10 Mar 2026 | **CRITICAL: API Response Wrapper Fix + Voucher Delete Overlay** — `ok()` and `created()` in `src/lib/api-response.ts` wrapped ALL responses in `{ data: ... }` but ALL frontends read flat keys → 0 vouchers/users showing (35k+ in DB). Fixed: removed wrapper, return flat JSON. Added `success: true` to notifications GET + invoices DELETE. Voucher page: delete overlay (batch/checkbox/expired) with red spinner→green checkmark→auto-close 2.5s. VPS deploy: rsync issue → pscp direct upload. Files: api-response.ts, notifications/route.ts, invoices/route.ts, voucher/page.tsx. PM2 #478-479. || 2.10.25 | 8 Mar 2026 | **Session 31 Bug Fixes** — PPPoE cron stuck-true fix (isPPPoeSyncRunning→finally). Payment URL localhost skip (3 customer files). Webhook POSTPAID: expiry dari `max(expiredAt,now)+validity`. CoA: direct `disconnectPPPoEUser()`. Admin PUT: same max logic, billingDay removed. CyberToast dedup: sessionStorage ID-dedup + stable `addToastRef`. Duitku: BV=BSI VA, BC=BCA VA + MIN_AMOUNTS. Invoice catch-up cron. FreeRADIUS audit: IN SYNC. Installer & export-production validated. |
| 2.10.24 | 7 Mar 2026 | **Customer Referral System Complete** � Referral code (8-char auto-gen), share URL /daftar?ref=CODE, admin panel /admin/referrals + /admin/settings/referral, customer portal /customer/referral (overview + rewards tab). APIs: /api/customer/referral GET+POST, /api/customer/referral/rewards. Reward triggers: REGISTRATION + FIRST_PAYMENT. DB migration 20260307_add_referral_system. Admin sidebar Gift icon + nav keys id.json. |
| 2.10.23 | 7 Mar 2026 | **Hotspot Sessions TZ Fix + Countdown + Live Synthesis** — `firstLoginAt`/`expiresAt` TZ correction (`- TZ_OFFSET_MS`) in sessions API + agent sessions API. Step 4.5 live session synthesis from MikroTik `/ip/hotspot/active/print` (devices missing from radacct). Duration column changed to countdown (`expiresAt - now`, "Xm Ys left"). Agent sessions: same TZ fix + `text-white` cell fix. NotificationDropdown light mode text colors. PM2 #285–287. |
| 2.10.22 | 7 Mar 2026 | **Isolated Portal + Export Fix + Config Audit** — `/isolated` portal: info lengkap (area, address, customerId, profilePrice), compact no-scroll layout (toggle info+steps). Sidebar nav keys fix (`nav.communication` en.json, `nav.pushNotifications` id.json), `nav.isolation` pindah ke grup Customer. Export Keuangan PDF/Excel: hapus date gate, Excel via fetch+Blob, API export date opsional & filter lengkap. FreeRADIUS + Nginx config audit: semua file lokal vs VPS dikonfirmasi sinkron. PM2 #264–267. |
| 2.10.21 | 5 Mar 2026 | **UI Fixes + CyberToastProvider** — Logo `bg-white` di 5 halaman login/portal agar logo hitam terlihat di dark mode. Sidebar: Komunikasi group (Notifikasi + Push Notifikasi) dipindahkan langsung di bawah Dashboard, di atas PPPoE. `CyberToastProvider` ditambahkan ke `AdminLayout` root (fix error `useToast must be used within a CyberToastProvider`). Dialog padding & modal title color juga diperbaiki. |
| 2.10.20 | 4 Mar 2026 | **PPPoE Session Sync + Uptime Fix + NAS Auto-Sync** — Build #167: Sessions API uptime sekarang real-time dari `acctstarttime` (bukan `acctsessiontime` stale). Prisma UTC→WIB TZ mismatch diperbaiki (`TZ_OFFSET_MS`). `pppoe-session-sync.ts` cron 5 menit: sync sesi aktif MikroTik→radacct (solusi Accounting-Start loss). `syncNasClients()` integrated ke freeradius-health cron, `systemctl reload` SIGHUP. `isRadiusServer` filter di VPN dropdown. || 2.10.17 | 2 Mar 2026 | **Light Theme Fix + Project Cleanup** — 240+ text color fixes across 60+ admin files (text-white→text-foreground, text-[#e0d0ff]→text-muted-foreground, form inputs bg-slate-900→bg-input). 38 broken unicode/emoji repaired in 6 files. Removed 16 unused scripts (fix_*.py, patch-*.ps1, check_mt.js, src-update.zip). FreeRADIUS mods-enabled/rest synced, all configs verified matching VPS. |
| 2.10.16 | 2 Mar 2026 | **VPN Control Modal UX Fix** — Hapus double-modal anti-pattern L2TP/PPTP/SSTP. SSH credentials inline di control modal. Apply Routing via Frontend (⚡ button + output terminal). Fix routing script duplicate bug (13 lines). New `/api/network/vpn-routing` endpoint. |
| 2.10.15 | 1 Mar 2026 | **Swal Migration + Referral System** — Customer portal 4 file fully migrated from SweetAlert2 → CyberToast (19 calls). Customer referral system (DB+API+UI). Theme instant switch (no transition). |
| 2.10.14 | 1 Mar 2026 | **VPS Hotfix** — FreeRADIUS MySQL Error 4031 fix (pool: retry_delay=1, lifetime=300, idle_timeout=20), nginx gzip level 6, swap reclaimed, Redis restart, theme instant switch, cyberpunk-bg hidden in light mode. PM2 #95. |
| 2.10.13 | 28 Feb 2026 | **Dark/Light Mode Toggle** — `useTheme` hook, Sun/Moon button di admin header, light mode CSS vars (slate-50 bg, dark sidebar), `localStorage` persistent. |
| 2.10.12 | 28 Feb 2026 | **Bugfix MikroTik Script** — `use-vj-compression` dihapus dari `/ppp profile add salfanetradius` (tidak valid di ROS 7.x, menyebabkan `expected end of command` col 121). |
| 2.10.11 | 28 Feb 2026 | **Admin Dashboard v2** — Agent voucher sales + RADIUS auth log + i18n fix (28 keys), PM2 #77. **Full SALFANET Rebrand** — semua AIBILL diganti di seluruh project, MikroTik profile `salfanetradius`. |
| 2.10.10 | 28 Feb 2026 | **Bulk Import Invoice CSV** — `/admin/invoices/import`, papaparse, PM2 #58. **Customer Self-service Suspend** — web+mobile, cron, `suspend_requests` table, PM2 #67. |
| 2.10.9+ | 27 Feb 2026 | **Export Laporan PDF/Excel** — `/admin/laporan`, pm2 #48. **2FA admin login** — TOTP inline, PM2 #47. Security audit 42 routes. PPPoE documents. |
| 2.10.9 | 21 Feb 2026 | Bug fixes customer portal, mobile layout, cleanup |
| 2.10.8 | 20 Feb 2026 | Customer mobile app UX, i18n admin panel |
| 2.10.x | Feb 2026 | Notification system, auto-refresh, CyberToast migration |
| 2.9.x | Jan 2026 | Multi-gateway payment, manual payment approval |
| 2.8.x | Des 2025 | GenieACS integration, WiFi self-service |
| 2.7.x | Des 2025 | Customer portal launch |
| 2.0.x | Nov 2025 | Admin panel rewrite, MikroTik CoA |

---

## 🗺️ Next Steps — Rekomendasi Urutan Pengerjaan

### Minggu ini (segera):
1. ✅ **Security audit selesai** — 42 routes, semua 401
2. ✅ **2FA admin login** — TOTP inline 2-step, deployed PM2 #47
3. ✅ **Export Laporan PDF/Excel** — `/admin/laporan`, xlsx+jspdf, PM2 #48
4. ✅ **Bulk Import Invoice CSV** — `/admin/invoices/import`, PM2 #58
5. ✅ **Customer self-service suspend** — web+mobile, cron hourly, PM2 #67
6. ✅ **Admin dashboard improvements** — agent voucher sales + RADIUS auth log + i18n, PM2 #77
7. ✅ **Full SALFANET rebrand** — seluruh AIBILL diganti, `salfanetradius` MikroTik profiles
8. ✅ **Dark/light mode toggle** — `useTheme` hook, Sun/Moon button, light CSS vars, `localStorage` persistent
9. ✅ **VPS hotfix** — FreeRADIUS MySQL 4031, gzip level 6, swap+Redis, theme smooth transition (Mar 1)
10. ✅ **Laporan analitik advanced** — churn rate, retention, ARPU, grafik trend — ✅ DONE (Feb 28, 2026) `/admin/laporan/analitik`, PM2 #78

### Bulan ini (Maret 2026):
4. ✅ **WA template customizable dari UI** — DONE (30+ templates, live preview, variable insertion)
5. ✅ **2FA admin login** — DONE
6. ✅ **Fix translation EN** — DONE
7. ✅ **Migrasi Swal → CyberToast di customer portal** — DONE (Mar 1, 4 file, 19 calls)
8. ? **Customer referral system** � DONE (Mar 7, 2026) � referral code, share URL, admin panel, customer portal, DB migration

### Q2 2026:
9. ✅ **Laporan analitik advanced** — churn, retention, ARPU — DONE (Feb 28, 2026)
10. ✅ **Customer self-service suspend** — web+mobile, cron hourly — DONE (Feb 28, 2026)
11. 🔜 **SaaS architecture planning** — jika ada rencana jual ke ISP lain
12. ✅ **Hotspot sessions TZ + countdown + live synthesis** — PM2 #285–287, Mar 7, 2026
