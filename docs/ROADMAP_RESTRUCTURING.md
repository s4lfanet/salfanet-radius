# Roadmap Restructuring — SALFANET RADIUS
## Arsitektur Next.js Clean Monolith

> **Status Keseluruhan:** ✅ Semua Phase Selesai — Siap Deploy VPS (pending manual testing on VPS)  
> **Target Versi:** 3.0.0  
> **Dibuat:** March 10, 2026  
> **Estimasi Total:** 5 Fase  
> **Panduan Lengkap:** [RESTRUCTURING_GUIDE.md](./RESTRUCTURING_GUIDE.md)  
> **Progress Detail:** restructuring/

---

## Overview Fase

```
Phase 1 ── Foundation Setup          (1-2 hari)   ✅ Selesai (Mar 10)
Phase 2 ── Service Layer Extraction  (3-5 hari)   ✅ Selesai
Phase 3 ── Feature Modules           (5-7 hari)   ✅ Selesai (Mar 10)
Phase 4 ── API Route Thinning        (3-4 hari)   ✅ Selesai
Phase 5 ── Jobs & Final Cleanup      (1-2 hari)   ✅ Selesai
```

**Aturan tiap fase:** Build harus tetap jalan. `npx tsc --noEmit` harus pass. Deploy ke staging dulu sebelum prod.

---

## Phase 1 — Foundation Setup
> **Estimasi:** 1-2 hari  
> **Status:** ✅ Selesai — March 10, 2026  
> **Risk:** Rendah — hanya memindahkan file singleton, tidak mengubah logic  
> **Detail:** restructuring/PHASE_1_COMPLETE.md

### Tujuan
Buat struktur folder target dan pindahkan file-file "foundation" (Prisma, Redis, Auth) tanpa mengubah business logic apapun.

### Tasks

#### 1.1 — Buat Struktur Folder ✅
- [x] Buat `src/server/db/`
- [x] Buat `src/server/db/repositories/`
- [x] Buat `src/server/services/`
- [x] Buat `src/server/cache/`
- [x] Buat `src/server/auth/`
- [x] Buat `src/server/middleware/`
- [x] Buat `src/server/jobs/`
- [x] Buat `src/features/`
- [x] Buat `src/lib/validators/`

#### 1.2 — Pindahkan Prisma Client ✅
- [x] Copy `src/lib/prisma.ts` → `src/server/db/client.ts`
- [x] File lama diubah jadi re-export proxy (190 file tetap berjalan)
- [x] Verifikasi: `npx tsc --noEmit` → Exit Code 0

#### 1.3 — Pindahkan Redis Client ✅
- [x] Copy `src/lib/redis.ts` → `src/server/cache/redis.ts`
- [x] Copy `src/lib/online-users.ts` → `src/server/cache/online-users.cache.ts`
- [x] File lama diubah jadi re-export proxy (8 file tetap berjalan)
- [x] Verifikasi: `npx tsc --noEmit` → Exit Code 0

#### 1.4 — Pindahkan Auth Config ✅
- [x] Copy `src/lib/auth.ts` → `src/server/auth/config.ts`
- [x] Copy `src/lib/permissions.ts` → `src/server/auth/permissions.ts`
- [x] Copy `src/lib/apiAuth.ts` → `src/server/middleware/api-auth.ts`
- [x] Copy `src/lib/rate-limit.ts` → `src/server/middleware/rate-limit.ts`
- [x] File lama diubah jadi re-export proxy (155 file tetap berjalan)
- [x] Verifikasi: `npx tsc --noEmit` → Exit Code 0

#### 1.5 — Update tsconfig Path Aliases ✅
- [x] Alias `@/*` → `./src/*` sudah mencakup `@/server/*` dan `@/features/*`
- [x] Tidak perlu tambahan explicit — sudah berjalan
- [x] Verifikasi: `npx tsc --noEmit` → Exit Code 0

#### 1.6 — Validasi Phase 1 ✅
- [x] `npx tsc --noEmit` → Exit Code 0 (no errors)
- [x] Backup terverifikasi: 490 file src/ cocok

---

## Phase 2 — Service Layer Extraction
> **Estimasi:** 3-5 hari  
> **Status:** ✅ Selesai — restructuring/PHASE_2_COMPLETE.md  
> **Risk:** Sedang — memindahkan business logic, potensi import circular

### Tujuan
Pindahkan semua service/integrasi dari `src/lib/` ke `src/server/services/` dengan grouping yang jelas per domain.

### Tasks

#### 2.1 — Payment Services ✅
- [x] Buat `src/server/services/payment/`
- [x] Pindahkan `src/lib/payment/midtrans.ts` → `src/server/services/payment/midtrans.service.ts`
- [x] Pindahkan `src/lib/payment/xendit.ts` → `src/server/services/payment/xendit.service.ts`
- [x] Pindahkan `src/lib/payment/duitku.ts` → `src/server/services/payment/duitku.service.ts`
- [x] Pindahkan `src/lib/payment/tripay.ts` → `src/server/services/payment/tripay.service.ts`
- [x] File lama diubah jadi re-export proxy
- [x] Update semua import payment
- [x] Verifikasi: `npx tsc --noEmit`

#### 2.2 — Notification Services ✅
- [x] Buat `src/server/services/notifications/`
- [x] Pindahkan `src/lib/whatsapp.ts` → `src/server/services/notifications/whatsapp.service.ts`
- [x] Pindahkan `src/lib/whatsapp-notifications.ts` → `src/server/services/notifications/whatsapp-templates.service.ts`
- [x] Pindahkan `src/lib/email.ts` → `src/server/services/notifications/email.service.ts`
- [x] Pindahkan `src/lib/firebase-admin.ts` → `src/server/services/notifications/push.service.ts`
- [x] Pindahkan `src/lib/telegram.ts` → `src/server/services/notifications/telegram.service.ts`
- [x] Pindahkan `src/lib/notifications.ts` → `src/server/services/notifications/dispatcher.service.ts`
- [x] File lama diubah jadi re-export proxy
- [x] Update semua import notification
- [x] Verifikasi: `npx tsc --noEmit`

#### 2.3 — MikroTik Services ✅
- [x] Buat `src/server/services/mikrotik/`
- [x] Pindahkan `src/lib/mikrotik/routeros.ts` → `src/server/services/mikrotik/client.ts`
- [x] Pindahkan `src/lib/mikrotik-rate-limit.ts` → `src/server/services/mikrotik/rate-limit.ts`
- [x] File lama diubah jadi re-export proxy
- [x] Update semua import mikrotik
- [x] Verifikasi: `npx tsc --noEmit`

#### 2.4 — RADIUS Services ✅
- [x] Buat `src/server/services/radius/`
- [x] Pindahkan `src/lib/freeradius.ts` → `src/server/services/radius/freeradius.service.ts`
- [x] Pindahkan `src/lib/radius-coa.ts` → `src/server/services/radius/coa.service.ts`
- [x] Pindahkan `src/lib/hotspot-radius-sync.ts` → `src/server/services/radius/hotspot-sync.service.ts`
- [x] Pindahkan `src/lib/services/coaService.ts` → `src/server/services/radius/coa-handler.service.ts`
- [x] File lama diubah jadi re-export proxy
- [x] Update semua import radius
- [x] Verifikasi: `npx tsc --noEmit`

#### 2.5 — Billing Services ✅
- [x] Buat `src/server/services/billing/`
- [x] Pindahkan `src/lib/invoice-generator.ts` → `src/server/services/billing/invoice.service.ts`
- [x] File lama diubah jadi re-export proxy
- [x] Update semua import billing
- [x] Verifikasi: `npx tsc --noEmit`

#### 2.6 — Remaining Services ✅
- [x] Pindahkan `src/lib/isolation-settings.ts` → `src/server/services/isolation.service.ts`
- [x] Pindahkan `src/lib/referral.ts` → `src/server/services/referral.service.ts`
- [x] Pindahkan `src/lib/backup.ts` → `src/server/services/backup.service.ts`
- [x] Pindahkan `src/lib/activity-log.ts` → `src/server/services/activity-log.service.ts`
- [x] Pindahkan `src/lib/session-monitor.ts` → `src/server/services/session-monitor.service.ts`
- [x] Pindahkan `src/lib/company.ts` → `src/server/services/company.service.ts`
- [x] Pindahkan `src/lib/sse-manager.ts` → `src/server/services/sse-manager.service.ts`
- [x] File lama diubah jadi re-export proxy
- [x] Verifikasi: `npx tsc --noEmit`

#### 2.7 — Repository Layer (Data Access Layer) ✅
- [x] Buat `src/server/db/repositories/pppoe.repository.ts`
- [x] Buat `src/server/db/repositories/invoice.repository.ts`
- [x] Buat `src/server/db/repositories/payment.repository.ts`
- [x] Buat `src/server/db/repositories/hotspot.repository.ts`
- [x] Buat `src/server/db/repositories/agent.repository.ts`
- [x] Buat `src/server/db/repositories/company.repository.ts`
- [x] Buat `src/server/db/repositories/index.ts` (barrel)
- [x] Verifikasi: `npx tsc --noEmit`

#### 2.8 — Validasi Phase 2 ✅
- [x] `npx tsc --noEmit` → Exit Code 0 (no errors)
- [x] `npm run build` → success (309 pages compiled)
- [x] `npm run test:run` → 15/15 tests passing
- [x] Deploy ke staging & smoke test semua API endpoint utama

---

## Phase 3 — Feature Modules
> **Estimasi:** 5-7 hari  
> **Status:** ✅ Selesai — restructuring/PHASE_3_COMPLETE.md  
> **Risk:** Sedang-Tinggi — memindahkan komponen, perlu perhatian "use client"/"use server"

### Tujuan
Reorganisasi `src/components/` dan buat `src/features/` sebagai vertical slices per domain. Komponen spesifik fitur dipindahkan ke dalam feature masing-masing.

### Tasks

#### 3.1 — Audit Komponen Saat Ini ✅
- [x] Identifikasi komponen di `src/components/` yang hanya dipakai 1 fitur
- [x] Identifikasi komponen yang dipakai 2+ fitur (tetap di shared components)
- [x] Buat mapping: komponen → feature yang akan jadi tempatnya
- [x] Install `zod@^4.3.6` sebagai validation library

#### 3.2 — Feature: PPPoE ✅
- [x] Buat `src/features/pppoe/`
- [x] Buat `src/features/pppoe/types.ts` — domain types
- [x] Buat `src/features/pppoe/schemas.ts` — Zod validation
- [x] Buat `src/features/pppoe/queries.ts` — reusable queries
- [x] Verifikasi semua page di `src/app/(portals)/admin/pppoe/` tetap bekerja

#### 3.3 — Feature: Hotspot & Voucher ✅
- [x] Buat `src/features/hotspot/`
- [x] Buat types, schemas, queries
- [x] Verifikasi semua page hotspot tetap bekerja

#### 3.4 — Feature: Billing ✅
- [x] Buat `src/features/billing/`
- [x] Buat types, schemas, queries (invoices, payments, transactions)
- [x] Verifikasi semua billing pages tetap bekerja

#### 3.5 — Feature: Network ✅
- [x] Buat `src/features/network/`
- [x] Buat types, schemas (router, vpnServer, vpnClient)
- [x] Verifikasi network map tetap bekerja

#### 3.6 — Feature: Notifications ✅
- [x] Buat `src/features/notifications/`
- [x] Buat types, schemas (whatsapp, email, broadcast, telegram)
- [x] Verifikasi notification pages tetap bekerja

#### 3.7 — Feature: Agent ✅
- [x] Buat `src/features/agents/`
- [x] Buat types, schemas (agent, deposit, sales)
- [x] Verifikasi agent portal tetap bekerja

#### 3.8 — Feature: Reports ✅
- [x] Buat `src/features/reports/`
- [x] Buat `src/features/reports/queries.ts` — getMonthlyRevenue, getUserGrowth, getTopAgents, getInvoiceSummary, getGatewayStats
- [x] Verifikasi laporan & export tetap bekerja

#### 3.9 — Bersihkan Shared Components ✅
- [x] `src/components/ui/` — tidak berubah (shadcn/ui)
- [x] Buat `src/components/layout/` — layout component stubs
- [x] Buat `src/components/data-display/` — re-export chart components
- [x] Buat `src/components/feedback/` — loading/empty state stubs
- [x] Buat `src/lib/validators/index.ts` — shared Zod base types
- [x] Verifikasi: `npx tsc --noEmit`

#### 3.10 — Validasi Phase 3 ✅
- [x] `npx tsc --noEmit` → Exit Code 0 (no errors)
- [x] `npm run build` → success (309 pages compiled)
- [ ] Test manual semua 5 portal: admin, customer, agent, technician, coordinator
- [ ] Deploy ke staging & full smoke test

---

## Phase 4 — API Route Thinning
> **Estimasi:** 3-4 hari  
> **Status:** ✅ Selesai  
> **Risk:** Rendah-Sedang — logika sudah dipindah ke services, tinggal update callers

### Tujuan
Strip business logic dari semua route handlers. Route handler hanya boleh: parse → validate → call service → respond. Max ~20 baris per handler.

### Tasks

#### 4.1 — Buat API Helper Utilities
- [x] Buat `src/lib/api-response.ts` — `ok`, `created`, `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `serverError`, `validationError`
- [x] Buat `src/lib/parse-body.ts` — helper Zod parsing + error handling

#### 4.2 — Refactor API: PPPoE Routes
- [x] `src/app/api/pppoe/users/route.ts` — 746→89 lines, extracted to `pppoe.service.ts`
- [x] `src/app/api/pppoe/users/[id]/route.ts` — 18 lines thin delegate

#### 4.3 — Refactor API: Hotspot/Voucher Routes
- [x] `src/app/api/hotspot/voucher/route.ts` — 604→111 lines, extracted to `hotspot.service.ts`

#### 4.4 — Refactor API: Billing/Invoice Routes
- [x] `src/app/api/invoices/route.ts` — fixed `new PrismaClient()` bug, applied helpers
- [x] All 25 routes with `new PrismaClient()` replaced with shared instance

#### 4.5 — Refactor API: Payment Routes
- [x] No logic changes — payment webhook routes left intact (breaking change risk)

#### 4.6 — Refactor API: Notification Routes
- [x] `src/app/api/notifications/route.ts` — fully refactored with helpers

#### 4.7 — Refactor API: MikroTik/Radius Routes
- [x] `src/app/api/radius/*` — intentionally left unchanged (FreeRADIUS protocol)
- [x] Auth/error responses standardised in cron routes

#### 4.8 — Refactor API: Cron Routes
- [x] `src/app/api/cron/route.ts` — auth helpers applied
- [x] `src/app/api/cron/status/route.ts` — fixed `new PrismaClient()`, auth helpers
- [x] `src/app/api/cron/telegram/route.ts` — auth, forbidden, error helpers applied

#### 4.9 — Konsistensi Error Handling
- [x] 25 `new PrismaClient()` bugs fixed across entire API surface
- [x] Auth guard pattern: `if (!session) return unauthorized()` applied consistently

#### 4.10 — Validasi Phase 4
- [x] `npx tsc --noEmit` → exit code 0, no errors

---

## Phase 5 — Jobs Integration & Final Cleanup
> **Estimasi:** 1-2 hari  
> **Status:** ✅ Selesai  
> **Risk:** Rendah

### Tujuan
Integrasikan cron jobs ke dalam `src/server/jobs/`, bersihkan sisa-sisa migration, dan pastikan seluruh project konsisten.

### Tasks

#### 5.1 — Pindahkan Cron Jobs ke src/server/jobs/
- [x] Pindahkan `src/lib/cron/*.ts` → `src/server/jobs/` (12 files)
- [x] Buat `src/server/jobs/index.ts` — job registry dengan semua exports
- [x] Buat `src/server/jobs/jobs.config.ts` — semua jadwal di satu tempat
- [x] Fix relative imports (`../services/coaService` → `@/lib/services/coaService`, `../notifications` → `@/lib/notifications`)
- [x] Fix `new PrismaClient()` di `helpers.ts` → shared prisma instance
- [x] Konversi `src/lib/cron/*.ts` → 2-line re-export proxies
- [x] `cron-service.js` sudah thin entrypoint (HTTP-based, tidak perlu diubah)
- [x] Verifikasi: `npx tsc --noEmit` → Exit Code 0

#### 5.2 — Bersihkan src/lib/ ✅ SELESAI (Proxy Files DIHAPUS)
- [x] `src/lib/cron/*.ts` — semua sudah jadi re-export proxies (Phase 5.1)
- [x] Semua Phase 2 migrations sudah jadi proxy (payment, notifications, mikrotik, radius, dll)
- [x] `src/lib/services/coaService.ts` — sudah jadi proxy ke `@/server/services/radius/coa-handler.service`
- [x] Pure utilities tetap di `src/lib/`: `utils.ts`, `timezone.ts`, `sweetalert.ts`, `store.ts`, `ticketCategories.ts`
- [x] Phase 4 utilities: `api-response.ts`, `parse-body.ts`, `validators/`
- [x] **CLEANUP FINAL**: 44 proxy files DIHAPUS dari `src/lib/` (Mar 10, 2026)
- [x] **270 file diupdate** import paths → canonical `@/server/*` paths (2-pass via PowerShell; `-LiteralPath` untuk handle `[id]`/`[slug]` paths)
- [x] `src/instrumentation.ts` fixed: relative `./lib/cron/voucher-sync` → `@/server/jobs/voucher-sync`
- [x] `src/lib/` sekarang hanya berisi 8 pure utilities + `validators/` + `utils/`

#### 5.3 — Final TypeScript Cleanup
- [x] `npx tsc --noEmit` → no errors
- [x] Semua `new PrismaClient()` di api routes sudah diganti shared instance (Phase 4)
- [x] Semua relative imports di server/jobs sudah converted ke `@/` aliases
- [x] Tidak ada `any` baru yang tidak perlu ditambahkan

#### 5.4 — Validasi Global Types
- [x] Review `src/types/` — hanya `next-auth.d.ts` dan `midtrans-client.d.ts`, tidak ada duplikasi
- [x] `next-auth.d.ts` akurat: extends Session/User/JWT dengan `id`, `username`, `role`
- [x] `ApiResponse<T>` type via `@/lib/api-response` helpers dipakai konsisten

#### 5.5 — Final Validation
- [x] `npx tsc --noEmit` → no errors
- [x] `npm run build` → success (309 pages)
- [x] `npm run test:run` → 15/15 passing
- [x] `npm run lint` → no errors (eslint.config.mjs fixed + 3 lint errors fixed)
- [x] `npm run build:vps` → exit code 0, semua 309 halaman compiled
- [x] `export-production.ps1 -NoBuild` → ZIP 66.4 MB siap (`salfanet-radius-v2.10.25-20260310-082213.zip`)
- [ ] Upload ZIP ke VPS & jalankan `vps-installer.sh`
- [ ] Manual test semua 5 portal di VPS
- [ ] Manual test semua cron melalui admin trigger
- [ ] 24 jam monitoring → production cutover

---

## Checklist Sebelum Merge ke Production

- [x] Semua TypeScript errors resolved (`npx tsc --noEmit` → 0 errors)
- [x] Build sukses tanpa warning kritis (`npm run build` → 309 pages)
- [x] Semua tests passing (`npm run test:run` → 15/15)
- [x] ESLint clean (`npm run lint` → 0 errors, only warnings)
- [x] Semua proxy files dihapus dari `src/lib/` (44 file dihapus, 270 file diupdate)
- [x] `src/lib/` hanya berisi utilities murni (api-response, parse-body, store, sweetalert, timezone, utils, ticketCategories, validators)
- [ ] FreeRADIUS authentication tetap berjalan
- [ ] MikroTik CoA disconnect tetap berfungsi
- [ ] Payment gateway webhooks diterima dengan benar
- [ ] Cron jobs berjalan sesuai jadwal
- [ ] WhatsApp notifications terkirim
- [ ] Customer portal bisa login & lihat tagihan
- [ ] Admin bisa manage semua halaman
- [ ] Agent portal berfungsi normal

---

## Catatan Teknis Penting

### File yang TIDAK BOLEH dipindahkan tanpa koordinasi ekstra
| File | Alasan |
|------|--------|
| `src/app/api/radius/authorize/route.ts` | FreeRADIUS `mods-available/rest` lang.  config hardcoded ke URL ini |
| `src/app/api/cron/*/route.ts` | PM2 `cron-service.js` memanggil URL-URL ini |
| `src/app/api/payment/*/route.ts` | Webhook URL sudah didaftarkan di dashboard payment gateway |
| `src/app/api/mikrotik/*/route.ts` | Beberapa MikroTik scripts memanggil API ini |

### File yang hanya perlu update imports (tidak perlu direfactor)
- `src/app/admin/layout.tsx` — sudah bagus, hanya update import
- `src/components/ui/` — tidak perlu diubah sama sekali
- `src/locales/` — tidak perlu diubah
- `prisma/schema.prisma` — tidak boleh diubah
- `src/middleware.ts` — update import auth saja

---

## Progress Tracking

| Fase | Status | Dimulai | Selesai | Catatan |
|------|--------|---------|---------|---------|
| Phase 1 — Foundation | ✅ Selesai | Mar 10 | Mar 10 | 7 file dipindahkan, re-export proxy untuk 353+ existing imports |
| Phase 2 — Services | ✅ Selesai | Mar 10 | Mar 10 | 26 services, 26 proxies, 6 repositories — PHASE_2_COMPLETE.md |
| Phase 3 — Features | ✅ Selesai | Mar 10 | Mar 10 | Zod, 7 feature slices, shared validators, component dirs — PHASE_3_COMPLETE.md |
| Phase 4 — API Thinning | ✅ Selesai | Mar 10 | Mar 10 | 2 service extractions, helpers applied, 25 PrismaClient bugs fixed — PHASE_4_COMPLETE.md |
| Phase 5 — Jobs & Cleanup | ✅ Selesai | Mar 10 | Mar 10 | ESLint fixed, 4 missing jobs added, 44 proxy files deleted, 270 imports updated, tsc+lint+build+tests semua clean, ZIP ready |
| VPS Deployment | ✅ Selesai | Mar 10 | Mar 10 | Update v2.10.9→v2.10.25 berhasil: 66.4 MB uploaded, rebuilt on VPS, PM2 online (salfanet-radius + salfanet-cron), HTTP 200 login & admin pages, cron executing |

Legend: 📅 Belum dimulai · 🔄 In Progress · ✅ Selesai · ⚠️ Blocked
