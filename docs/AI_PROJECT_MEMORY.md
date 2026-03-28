# AI PROJECT MEMORY — SALFANET RADIUS

> **Untuk AI/LLM yang melanjutkan pengembangan project ini.**
> Baca file ini terlebih dahulu sebelum mulai membantu agar tidak mengulang hal yang sudah selesai atau membuat kesalahan yang sudah diketahui.

---

## 📌 Project Overview

**Salfanet Radius** adalah sistem billing ISP/RTRW.NET berbasis web dengan integrasi FreeRADIUS penuh. Mendukung PPPoE dan Hotspot, cocok untuk ISP kecil-menengah di Indonesia.

- **Version**: 2.11.6
- **Status**: Production-ready, deployed di VPS
- **Last Updated**: March 28, 2026
- **Latest Commit**: See GitHub
- **GitHub**: https://github.com/s4lfanet/salfanet-radius (public)
- **Live URL**: https://radius.yourdomain.com

### Recent Patch Log (March 2026)

- **Fix: billingDay reset to 1 on edit + MikroTik local-address verification** (`53688ee`, `28183d6`, March 28, 2026)
  - **Root cause**: `UserDetailModal.tsx` (the ACTUAL edit modal) had `user.subscriptionType || 'PREPAID'` — wrong default. POSTPAID users showed PREPAID view, hiding billing day field entirely, always resetting it to 1.
  - **Fix 1 (UserDetailModal.tsx)**: `subscriptionType: user.subscriptionType ?? 'POSTPAID'` and `billingDay: user.billingDay ?? new Date(user.expiredAt).getDate()` (infer from expiredAt when billingDay is null).
  - **Fix 2 (users/page.tsx handleEdit)**: same `??` nullish coalescing fixes (fallback to SimpleModal add form, minor but fixed).
  - **Fix 3 (pppoe.service.ts createPppoeUser)**: clamp billingDay to 1-28 (matches DB CHECK constraint; was 1-31).
  - **Enhancement (sync-mikrotik/route.ts)**: after syncing local-address to RouterOS PPP profile, now reads back the profile to verify the value was stored. Shows actionable warning if RouterOS didn't persist it — RouterOS requires the IP to be configured as an interface address first.
  - **Key architecture note**: `UserDetailModal.tsx` is the REAL edit dialog (`isOpen={isDialogOpen && !!editingUser}`). `SimpleModal` with `isOpen={isDialogOpen && !editingUser}` is the ADD form only — completely separate.

- **Fix: NAS IP, billingDay/expiredAt, Area badge & form — PPPoE UI revamp** (`1a6d30e`, `a33d8d0`, `f3fd754`)
  - **Network column** di tabel PPPoE: label "IP:" diganti "IP NAS:", nilai diubah dari `user.ipAddress` (IP statis user) menjadi `user.router?.ipAddress ?? user.router?.nasname` (IP rekap router NAS dari DB). IP statis user tetap di kolom PPPoE.
  - **updatePppoeUser service**: saat edit user POSTPAID dengan billingDay berubah, `expiredAt` kini di-recalculate ke tanggal tagihan bulan depan (`billingDay`). Sebelumnya `expiredAt` di-overwrite langsung dari nilai form tanpa memperhitungkan logika billingDay POSTPAID. Untuk PREPAID: `expiredAt` tetap ikut nilai form.
  - **Kolom Data Pelanggan**: badge Area (kuning, ikon MapPin) ditampilkan di bawah info pelanggan. Sebelumnya area tidak ditampilkan sama sekali di tabel.
  - **Form Tambah Pelanggan** (`SimpleModal`): tambah select Area (opsional) setelah NAS select. State `formData.areaId` sudah ada tapi tidak ada elemen UI-nya.
  - **Action buttons** (Phase 15): 5 ikon bersih — Eye, Pencil, RefreshCw, Shield, Trash. API `POST /api/pppoe/users/[userId]/sync-radius` dibuat untuk sync RADIUS per-user. Badge customerId & jumlah langganan bisa diklik sebagai filter.
  - **PPN calculation** (Phase 16): formula `ppnAmount = round(base * ppn/100)` diterapkan konsisten di 9 file billing. Koordinat GPS bisa diklik ke Google Maps.

- **Fix: Ghost sessions filtered from display and RADIUS authorize** (`4e89616`)
  - `sessions/route.ts`: tambah `.filter()` sebelum `.map()` — skip session yang tidak ada di `pppoeUser` maupun `hotspotVoucher`.
  - `authorize/route.ts`: pengguna tidak terdaftar sekarang dikembalikan REJECT (`control:Auth-Type = Reject`) bukan `{}` (allow).

- **Fix: Dashboard hotspot count cross-ref ke hotspotVoucher** (`57db2e6`)
  - `dashboard/stats/route.ts`: counter `activeSessionsHotspot` hanya naik jika username ada di tabel `hotspotVoucher`.
  - Tambah `Promise.all` lookup `hotspotVoucherSet` bersamaan dengan `pppoeByUsername`.
  - Sesi yang tidak terdaftar di table manapun (ghost) sepenuhnya diabaikan dari hitungan.

- **Fix: Next.js prerender crash pada `/_global-error`** (`bc3086c`)
  - Buat `src/app/global-error.tsx` sebagai `'use client'` component dengan `<html>/<body>` tags.
  - Tanpa file ini, Next.js 16 auto-generate `/_global-error` yang crash saat prerender dengan `TypeError: Cannot read properties of null (reading 'useContext')`.

- **Fix: Customer WiFi page padding** (`027749e`)
  - Semua `CyberCard` di `src/app/customer/wifi/page.tsx` kini punya `p-4 sm:p-5` eksplisit.
  - Container wrapper menggunakan `p-4 sm:p-5 lg:p-6 space-y-4 sm:space-y-5`.

- **Chore: Cleanup npm scripts + cross-platform deploy wrapper** (`9101c90`, `d646116`)
  - Restore `scripts/scan-api-endpoints.js` dan `scripts/test-all-apis.js` yang hilang.
  - Fix path deploy dari `bash smart-deploy.sh` → `bash production/smart-deploy.sh`.
  - Buat `scripts/run-deploy.js` — wrapper cross-platform; di Windows menampilkan panduan WSL/Git Bash; di Linux/macOS meneruskan ke `production/smart-deploy.sh`.
  - Tambah `npm run clean:local` dan `clean:all` untuk membersihkan `.next`, tsbuildinfo, dll.
  - Tidy `.gitignore`: hapus duplikat, hapus entry `/.git/`, rapikan per section.

- **Enhancement: Manual agent deposit with transfer proof + target admin account**
  - Agent manual top-up sekarang memilih rekening tujuan admin dari `company.bankAccounts` (API: `/api/company/info`).
  - Modal top-up agent menambahkan input transfer manual lengkap: rekening tujuan, nama/nomor rekening pengirim, catatan, dan upload bukti transfer.
  - Bukti transfer diproses via endpoint existing `/api/upload/payment-proof` lalu disimpan pada request manual.
  - Admin page verifikasi deposit agent (`/admin/hotspot/agent/deposits`) kini menampilkan rekening tujuan transfer, data pengirim, catatan, dan link bukti transfer.
  - API yang diperbarui:
    - `POST /api/agent/deposit/manual-request`
    - `GET/PATCH /api/admin/agent-deposits`
    - `GET /api/company/info` (tambahan `bankAccounts`)
  - Schema update `agentDeposit`:
    - `targetBankName`, `targetBankAccountNumber`, `targetBankAccountName`
    - `senderAccountName`, `senderAccountNumber`
    - `receiptImage`, `note`
  - Migration: `prisma/migrations/20260318120000_add_agent_manual_deposit_fields/migration.sql`

- **Fix: MapPicker z-index behind form modal**
  - `MapPicker` membuat `fixed` overlay tanpa `createPortal`, sehingga ancestor layout (sidebar, transform) membentuk stacking context yang menjebak z-index-nya di bawah `SimpleModal` portal.
  - Fix: tambah `createPortal(jsx, document.body)` pada return `MapPicker` agar render di root level (sama seperti `SimpleModal`).
  - File: `src/components/MapPicker.tsx`
  - Mempengaruhi: tambah/edit pelanggan PPPoE (`/admin/pppoe/users`), fiber joint closures, ODCs, dan semua halaman yang menggunakan `MapPicker` di atas form modal.

- **Refactor: Hapus bahasa Inggris — full Bahasa Indonesia only**
  - Hapus `src/locales/en.json` dan `src/components/LanguageSwitcher.tsx`.
  - Simplifikasi `useTranslation` hook: hardcode locale `'id'`, hapus English fallback, hapus import `en.json`.
  - Hapus tombol language toggle dari: Admin layout, Agent login, Agent layout, Customer layout, Technician layout.
  - Hapus import `Globe` yang tidak terpakai lagi di beberapa layout.
  - `store.ts`: locale type disederhanakan menjadi `'id'` only.
  - Hook `useTranslation` tetap mengembalikan `{ t, locale, setLocale, isID, isEN }` untuk kompatibilitas 131 file caller (setLocale jadi no-op, isEN selalu false).

- **System Update hardening (admin `/admin/system`)**
  - Fix spawn stdio issue (`fd: null`) by using `openSync` for log fd.
  - Resolve standalone `process.cwd()` mismatch with `getAppDir()` for system info/update routes.
  - Sanitize spawn environment to avoid PM2/Next inherited vars breaking `next build`.
  - Stabilize SSE live log stream with heartbeat + anti-buffering headers + auto reconnect.
  - Update script now uses zero-downtime `pm2 reload salfanet-radius` (cron tetap restart).

- **Nginx manifest fix**
  - Serve all manifest files statically via regex location (`manifest.json`, `manifest-admin.json`, dll.)
  - Prevent intermittent 500 during app restart window.

- **UI spacing polish (admin cards)**
  - Push Notifications page: explicit `CardHeader`/`CardContent` paddings, refined icon-title gaps.
  - Additional consistency fixes applied on Manual Payments and Network Trace pages.

- **Fix: Hotspot profile modal i18n key** (`f8e5702`)
  - Key `hotspot.eVoucherAccess` (capital V) → `hotspot.evoucherAccess` (lowercase) di `src/app/admin/hotspot/profile/page.tsx`.
  - Locale files sudah benar (`evoucherAccess`) — hanya pemanggil di page.tsx yang salah casing.

- **Fix: Dashboard SESI HOTSPOT AKTIF selalu 0** (`667b158`)
  - Hapus pengecekan RADIUS attrs (`service.includes('framed')`) yang menyebabkan hotspot MikroTik (mengirim `Service-Type = Framed-User`) salah diklasifikasi sebagai PPPoE.
  - Ganti ke logika sederhana: lookup `pppoeUser` → PPPoE, selainnya → Hotspot (sama seperti halaman Sesi).
  - Tambah Redis `online:users` sebagai supplement agar sesi yang belum masuk `radacct` tetap terhitung.
  - File: `src/app/api/dashboard/stats/route.ts`

---

## 🖥️ Production VPS

| Item | Value |
|------|-------|
| IP | `YOUR_VPS_IP` |
| OS | Ubuntu 22.04.1 LTS |
| App Path | `/var/www/salfanet-radius` |
| Domain | `https://radius.yourdomain.com` (Cloudflare proxy) |
| Node.js | 20.20.1 |
| MySQL | 8.0.45 |
| PM2 | 6.0.14 |
| FreeRADIUS | 3.0.26 |

**PM2 Apps:**
- `salfanet-radius` — Next.js app (cluster mode, port 3000)
- `salfanet-cron` — Cron service (fork mode)

**Database:**
- DB Name: `salfanet_radius`
- User: `salfanet_user` / Password: `YOUR_DB_PASSWORD`
- Root password: `YOUR_ROOT_PASSWORD`

**Default Login:**
- URL: `https://radius.yourdomain.com/login`
- Username: `superadmin`
- Password: `admin123`

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router + Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui + Radix UI |
| Database | MySQL 8.0 + Prisma ORM v6 |
| Auth | next-auth v4, bcryptjs, JWT |
| RADIUS | FreeRADIUS 3.0.26 (MySQL + REST) |
| Jobs | node-cron (via `cron-service.js`) |
| Icons | Lucide React |
| Maps | Leaflet / OpenStreetMap |
| Charts | Recharts |
| Payments | Midtrans, Xendit, Duitku, Tripay |
| Integrations | MikroTik RouterOS API, GenieACS TR-069, Firebase Admin, Nodemailer, WhatsApp |
| Timezone | WIB / Asia/Jakarta (UTC+7) |

---

## 🏗️ Architecture

```
src/
├── app/
│   ├── admin/          # Admin panel (5 role templates)
│   ├── agent/          # Agent/reseller portal
│   ├── customer/       # Customer self-service portal
│   ├── technician/     # Technician portal (route group: (portal)/)
│   ├── coordinator/    # Coordinator portal
│   └── api/            # Thin API route handlers
├── server/             # Server-only code
│   ├── db/             # Prisma client
│   ├── services/       # Business logic
│   ├── jobs/           # Cron job functions
│   ├── cache/          # Redis utilities
│   ├── auth/           # next-auth config
│   └── middleware/     # Request middleware
├── features/           # Vertical slices (queries, schemas, types per domain)
├── components/         # Shared UI components only
├── lib/                # Pure utilities + re-export proxies (migration artifacts)
├── hooks/              # Custom React hooks
├── locales/            # i18n translations (id, en)
└── types/              # Shared TypeScript types
```

**Important rule:** `src/app/api/` handlers must be thin — validate → call service → respond. No business logic directly in route handlers.

---

## 🔑 Key Rules & Known Issues

### 1. `cron-service.js` (root)
Standalone Node.js process launched by PM2. Calls HTTP API endpoints at `localhost:3000`. **DO NOT change this to import server code directly.** PM2 entrypoint.

### 2. Technician portal route structure
Route group pattern: `src/app/technician/(portal)/[page]/page.tsx`  
There was a duplicate `technician/dashboard/page.tsx` (outside group) — **already deleted**.  
Always use `(portal)/` group for all technician pages.

### 3. FreeRADIUS mods-enabled = standalone files, NOT symlinks
On this VPS, `mods-enabled/sql` and `sites-enabled/default` are **standalone files**, not symlinks.  
The install script copies files directly. Do not assume symlink behavior.

### 4. Prisma migrations vs db push
Fresh VPS install uses `prisma db push --accept-data-loss` (not `prisma migrate deploy`), because migrations assume pre-existing tables (`nas`).

### 5. Environment variable `TZ=Asia/Jakarta`
**Critical** — set in `ecosystem.config.js` and `.env`. Without this, all cron jobs and date calculations will be wrong.

### 6. `src/lib/` = re-export proxies
Old location. New canonical code is in `src/server/services/` and `src/server/jobs/`. `src/lib/` files just re-export for backward compatibility.

### 7. Both `upload/` and `uploads/` API routes exist
`src/app/api/upload/` and `src/app/api/uploads/` — both present for backward compat.

### 8. Windows development note
Scripts in `vps-install/*.sh` have UTF-8 BOM when created on Windows. Run `sed -i 's/^\xef\xbb\xbf//' script.sh` to strip BOM before executing on VPS.

### 9. VPS install must run from app directory
`install-freeradius.sh` and other VPS scripts call `check_directory()` which requires CWD to contain "salfanet-radius". Always run from `/var/www/salfanet-radius`.

### 10. UFW was previously configured but not auto-enabled
Installer lama hanya menambahkan rule `ufw allow`, tetapi tidak menjalankan `ufw enable`. Current installer fix:
- auto-detect SSH port aktif (`22` atau custom seperti `2020`)
- allow SSH + `80/tcp` + `443/tcp`
- set `default deny incoming`, `default allow outgoing`
- run `ufw --force enable`
- skip only for Proxmox LXC (`SKIP_UFW=true`)

### 11. Web app inaccessible on Proxmox VM usually means NAT / public edge issue, not app issue
If inside guest `ss -tulpn` shows Node.js on `:3000` and Nginx on `:80`/`:443`, but public IP still fails:
- `:2020` is SSH/custom admin port, not web app URL
- problem is usually DNAT / router / Proxmox firewall / provider security group
- guest-side `ufw inactive` is not the same as host-side NAT missing
- installer now includes external access diagnostics in `install-nginx.sh`

### 12. Redis installer needed production hardening
Redis failure pattern seen in production: `redis-server.service` crash-loop after install. Current installer fix ensures:
- `bind 127.0.0.1 ::1`
- `protected-mode yes`
- `supervised systemd`
- `daemonize no`
- runtime/log/data directories exist with `redis:redis`
- restart failure prints `systemctl status`, `journalctl`, and Redis log tail

### 13. Payment callback pages must support both `token` and `order_id`
Real-world issue: top-up success page received `order_id=TOPUP-TEMP-...` and showed `payment.paymentNotFound`.
Current fix:
- top-up direct flow now creates invoice first, then uses stable `orderId = invoice.invoiceNumber`
- added `GET /api/payment/check-order` to resolve invoice/deposit status from `order_id`
- `payment/success`, `payment/pending`, `payment/failed` now handle `order_id` fallback
- added alias pages: `/payment/failure` and `/payment/cancel`
- webhook now marks invoice `CANCELLED` for `expire|cancel|deny|failed`

---

## 🚀 Completed Features (by version)

| Version | Feature |
|---------|---------|
| v2.10.27 | Restructuring complete (5 phases), technician portal (11 pages + 19 API routes) |
| v2.10.x | Customers page → table layout redesign |
| v2.9.x | L2TP VPN client control, MikroTik CHR support |
| v2.8.0 | Balance/deposit system, auto-renewal prepaid, RADIUS restore on renewal |
| v2.7.6 | GenieACS TR-069 device management, WiFi configuration from portal |
| v2.7.2 | Broadcast notifications, template pages mobile responsive, maintenance resolved template |
| v2.7.0 | Manual payment upload + approval workflow, multiple bank accounts, customer ID |
| v2.6.x | PPPoE isolation system, isolation templates (WhatsApp/Email/HTML) |
| v2.5.x | Agent/reseller system, voucher commission tracking |
| v2.4.x | CoA service (real-time disconnect), auto-disconnect cronjob |
| v2.3.1 | Multi-timezone support, WIB/WITA/WIT |
| v2.2.x | FTTH network (OLT/ODC/ODP), network map, GPS coordinates |
| v2.1.x | Full RADIUS mode (radacct sessions, no MikroTik API) |
| v2.0.x | FreeRADIUS integration, SQL + REST modules |

---

## 📦 Database Schema Summary

**~45 Prisma models.** Key models:

| Model | Purpose |
|-------|---------|
| `User` | Admin users + roles + permissions |
| `Customer` | ISP customers (PPPoE/Hotspot) |
| `Voucher` | Hotspot vouchers |
| `Invoice` | Billing invoices |
| `Transaction` | Financial transactions |
| `Router` / `Nas` | MikroTik routers |
| `Agent` | Reseller/agent accounts |
| `Olt` / `Odc` / `Odp` | FTTH network topology |
| `radcheck` / `radreply` | FreeRADIUS auth tables |
| `radacct` | RADIUS accounting/sessions |
| `radpostauth` | RADIUS auth logs |
| `CronJobExecution` | Cron history |
| `ActivityLog` | Admin activity audit |
| `Setting` | App settings (key-value) |
| `NotificationTemplate` | WhatsApp/Email templates |

---

## 🔧 Common Commands

```bash
# Development
npm run dev              # Start Next.js dev server (Turbopack)
npm run build            # Production build
npx tsc --noEmit         # TypeScript check (must = 0 errors)
npm run lint             # ESLint
npm run test:run         # Vitest (must pass)
npm run test:api         # Smoke test public API endpoints
npm run test:scan        # Scan & document all API endpoints → API_ENDPOINTS.md
npm run clean:local      # Remove .next, tsconfig.tsbuildinfo, coverage, .turbo, .cache
npm run clean:all        # clean:local + remove console.log (cleanup)
npm run deploy           # Run production/smart-deploy.sh (bash required)
npm run deploy:quick     # Quick deploy (build + PM2 restart)
npm run deploy:full      # Full deploy (install deps + build + restart)
npm run deploy:status    # Check deploy status
npm run deploy:rollback  # Rollback last deploy

# Database
npx prisma db push       # Sync schema to DB (fresh install)
npx prisma migrate dev   # Create migration (development)
npx prisma studio        # DB browser
npm run db:seed          # Run all seeds (tsx prisma/seeds/seed-all.ts)

# PM2 (on VPS)
pm2 status               # Check all apps
pm2 logs salfanet-radius # App logs
pm2 restart salfanet-radius --update-env
pm2 restart salfanet-cron

# FreeRADIUS (on VPS)
systemctl status freeradius
freeradius -X            # Debug mode (verbose)
freeradius -CX           # Config test only
radtest user pass localhost 0 testing123  # Test auth

# VPS Install scripts (run from /var/www/salfanet-radius)
bash /tmp/vps-install/install-freeradius.sh
bash /tmp/vps-install/install-nodejs.sh
```

---

## 📡 FreeRADIUS Architecture

```
MikroTik (NAS) → FreeRADIUS → MySQL (radcheck/radreply/radgroupreply)
                            ↓
                   REST API (/api/radius/*)
                            ↓
                   - /api/radius/authorize  → check user status
                   - /api/radius/post-auth  → set firstLoginAt, expiresAt
                   - /api/radius/accounting → update Redis online-users
```

**Config files location:** `/etc/freeradius/3.0/`
- `mods-enabled/sql` — MySQL connection (standalone file)
- `mods-enabled/rest` — REST API integration (symlink → mods-available/rest)
- `sites-enabled/default` — Auth logic (standalone file)
- `sites-available/coa` — CoA/Disconnect (symlink)
- `clients.conf` — NAS clients + `$INCLUDE clients.d/`
- `clients.d/nas-from-db.conf` — Auto-generated NAS from DB

**Project backup:** `freeradius-config/` directory in repo root.

---

## 🌐 Portals Summary

| Portal | URL | Users |
|--------|-----|-------|
| Admin | `/admin` | SUPER_ADMIN, FINANCE, CS, TECHNICIAN, MARKETING, VIEWER |
| Customer | `/customer` | ISP customers |
| Agent | `/agent` | Resellers/agents |
| Technician | `/technician` | Field technicians |
| Coordinator | `/coordinator` | Area coordinators |

---

## 🌍 Translations / i18n

Files in `src/locales/`:
- `id.json` — Indonesian (satu-satunya bahasa)

Bahasa Inggris (`en.json`) sudah dihapus. Semua UI menggunakan Bahasa Indonesia.
Hook `useTranslation()` tetap digunakan di 131+ file, hanya saja locale hardcoded ke `'id'`.
Language switcher sudah dihapus dari semua portal (Admin, Agent, Customer, Technician).

---

## 📁 Important Files

| File | Purpose |
|------|---------|
| `ecosystem.config.js` → `production/ecosystem.config.js` | PM2 config (deployed to `/var/www/salfanet-radius/`) |
| `cron-service.js` | Cron PM2 entrypoint (root) |
| `prisma/schema.prisma` | Database schema |
| `prisma/seeds/seed-all.ts` | Run all seeds |
| `src/instrumentation.ts` | Next.js instrumentation hook |
| `vps-install/` | VPS installer scripts |
| `freeradius-config/` | FreeRADIUS config backup |
| `production/nginx-salfanet-radius.conf` | Nginx config template |

---

## 🔐 Security Notes

- `.env` is gitignored — never commit real credentials
- `.env.example` and `.env.production.example` are safe templates
- Firebase service account files are gitignored (`*firebase-service-account*.json`)
- RADIUS `testing123` secret is for local testing only — change in production `clients.conf`
- `require_message_authenticator = no` set for localhost client (compatibility)

---

## 📝 Recent Changes (March 2026)

- ✅ Customers page redesigned to table layout (from card grid)
- ✅ Deleted duplicate `src/app/technician/dashboard/page.tsx`
- ✅ FreeRADIUS installed and running on VPS
- ✅ GitHub repo made public
- ✅ Removed: `chk-pg.js`, `kill-ports.ps1`, `start-dev.ps1` (debug/dev-only files)
- ✅ VPS fully deployed: Node.js 20, MySQL 8.0.45, Redis, Nginx, PM2, FreeRADIUS 3.0.26
- ✅ DB seeded: superadmin, templates, 19 ticket categories, email templates, isolation templates
- ✅ **Network/Fiber Management Translation Audit & Fixes:**
  - Expanded `network.tracing` from 3 keys to full 41-key set covering `PathTracerTool`, `TraceResultDisplay`, `ImpactAnalysisPanel` components
  - Expanded `network.jointClosure` from 1 key to full 34-key set for CRUD labels
  - Added complete Indonesian translations for both sections in `id.json`
  - All other network section keys also added: `network.diagram.*`, `network.unifiedMap.*`, `common.created`, `common.updated`
- ✅ **New Pages Created (fiber management routes):**
  - `/admin/network/fiber-joint-closures` — Full CRUD management for `network_joint_closures` model (uses `/api/network/joint-closures` API)
  - `/admin/network/fiber-odcs` — Redirect to `/admin/network/odcs`
  - `/admin/network/fiber-odps` — Redirect to `/admin/network/odps`

---

## 🗺️ Network/Fiber Management Routes

| Route | Description |
|-------|-------------|
| `/admin/network/fiber-cables` | Fiber cable management (GPON/ADSS etc.) |
| `/admin/network/fiber-cores` | Fiber core management |
| `/admin/network/splice-points` | Splice point management |
| `/admin/network/fiber-joint-closures` | Joint Closure (JC) CRUD — new, uses `network_joint_closures` model |
| `/admin/network/fiber-odcs` | Redirect → `/admin/network/odcs` |
| `/admin/network/fiber-odps` | Redirect → `/admin/network/odps` |
| `/admin/network/odcs` | ODC management (Optical Distribution Cabinet) |
| `/admin/network/odps` | ODP management (Optical Distribution Point) |
| `/admin/network/olts` | OLT management |
| `/admin/network/diagrams` | Network splitter diagrams (links to fiber-joint-closures/odcs/odps) |
| `/admin/network/trace` | Network path tracing (logical + physical) |
| `/admin/network/unified-map` | Unified network map |
| `/admin/network/infrastruktur` | Infrastructure overview |
| `/admin/network/map` | Network map |

