# TODO — Salfanet Radius (Sisa Pekerjaan)

Daftar pekerjaan yang **belum dikerjakan** setelah Phase 1, Phase 2, dan Phase 3 selesai.

Dokumen ini dibuat pada: 2026-08-14
Terakhir diperbarukan: 2026-08-15 (Production Hardening Audit)

---

## Production Hardening Audit (2026-08-15) — Status

| Item | Status | Notes |
|------|--------|-------|
| Database ↔ Prisma @map consistency | ✅ [VERIFIED] | 0 mismatches |
| Cron heartbeat integration | ✅ [FIXED] | Heartbeat active in runJob() |
| Remove in-memory fallback (production) | ✅ [FIXED] | Fail-closed in production |
| CRON_SECRET hardening | ✅ [FIXED] | Fail-fast + timingSafeEqual |
| Cron HTTP timeout | ✅ [FIXED] | Per-job timeout config |
| Timezone +7h elimination | ✅ [FIXED] | Removed from cron-runner, UTC fix in timezone.ts |
| Cron schedule timezone | ✅ [FIXED] | Company timezone from DB |
| nextRun calculation | ✅ [FIXED] | cron-parser library |
| FreeRADIUS queue concurrency | ✅ [FIXED] | Atomic claim in processRetryQueue() |
| Payment idempotency | ✅ [VERIFIED] | No changes needed |
| GenieACS technician auth | ✅ [FIXED] | routerId/areaId scope required |
| IDOR audit | ✅ [VERIFIED] | Customer/agent/technician secure |
| Frontend API regression | ✅ [FIXED] | res.ok checks added |
| Transaction audit | ⚠️ [DOCUMENTED] | Pre-existing gaps noted |
| Secret leak audit | ✅ [FIXED] | Webhook + pay token logging fixed |
| Tests — timezone | ✅ [TESTED] | 27/27 passed |
| Tests — cron lock | ⚠️ [CREATED] | Must run on VPS |
| Documentation | ✅ [DONE] | CHANGELOG + audit report |
| VPS deployment | ❌ [PENDING] | Not yet deployed |

### Deployment Checklist
- [ ] Git push to master
- [ ] Git pull on VPS (/root/salfanet-radius)
- [ ] Git pull in deployment (/var/www/salfanet-radius)
- [ ] pnpm install (backend — for cron-parser dependency)
- [ ] prisma generate
- [ ] Backend build
- [ ] Frontend build
- [ ] Restart PM2 processes (salfanet-backend, salfanet-cron)
- [ ] Run cron lock tests on VPS
- [ ] Verify CRON_SECRET fail-fast
- [ ] Verify heartbeat in PM2 logs
- [ ] Verify GenieACS technician device filtering

---

## Status Phase yang Sudah Selesai

| Phase | Status | Ringkasan |
|-------|--------|-----------|
| **Phase 1A** | ✅ Selesai | Dead code removal (import tidak terpakai, komponen yatim) |
| **Phase 1B** | ✅ Selesai | NextAuth refactor & Prisma removal dari frontend |
| **Phase 1C** | ✅ Selesai | Uploads serving dipindahkan ke Nginx (`/uploads/`) |
| **Phase 2** | ✅ Selesai | 111 batch, ~510 fetch calls migrated to `apiAdmin()`. 55 fetch calls tersisa (semua legitimate blob/FormData/streaming) |
| **Phase 3** | ✅ Selesai | middleware.ts, error.tsx, loading.tsx, permissions.ts, usePermissions migration, C8 SSH credential fix |
| **Phase 4.1** | ✅ Selesai | NextAuth session types — hapus semua `(session.user as any)` casts |
| **Phase 4.5** | ✅ Selesai | Enable TypeScript build checks + fix 8 pre-existing TS errors |
| **Phase 5A** | ✅ Selesai | Production testing via VPS — 17 pages tested, 0 console errors |
| **Phase 5B** | ✅ Selesai | API Contract Types — `frontend/src/types/api/` (10 files), domain modules typed |
| **Phase 5C** | ✅ Selesai | Dark Mode audit — design system TailAdmin sudah konsisten, no fix needed |
| **Phase 5D** | ✅ Selesai | Utilities consolidation — hapus `dateUtils.ts`, 6 inline `formatRupiah` dihapus |
| **Phase 5E** | ⏭️ Skipped | React Query — optimization, low priority (current approach works) |
| **Phase 5F** | ✅ Selesai | Server/Client audit — `table.tsx` converted to Server Component |
| **Phase 5G** | ✅ Selesai | Security audit — `l2tpPassword` removed from localStorage |
| **Phase 5H** | ✅ Selesai | Final validation — TypeScript 0 errors, build OK, deploy OK |
| **Phase 6A** | ✅ Selesai | Full API Contract & Type-Safety Audit — 1369→950 `any` (31% reduction), 616→318 `(data as any)` casts (48% reduction), 2 new type files, 7 backend issues documented |
| **Deploy 6A** | ✅ Selesai | VPS `192.168.54.129` — commit `95bfa7e8` deployed, all PM2 online, health OK |
| **Sec Phase 1** | ✅ Selesai | Backend security hardening — auth, IDOR, billing, RADIUS, cron, GenieACS (commit `23bb7ef5`) |
| **Sec Phase 2** | ✅ Selesai | Security audit documentation (commit `aa09185e`) |
| **Sec Phase 3** | ✅ Selesai | FreeRADIUS reconciliation+retry, atomic cron lock, payment idempotency, IDOR tests, agent JWT revocation (commit `1b684fd5` + `ebe89923`) |
| **Deploy Sec3** | ✅ Selesai | VPS `192.168.54.129` — commit `ebe89923` deployed, DB migration applied, all PM2 online, smoke tests passed |

---

## Phase 3 — Sisa (Low Priority)

### 3.6 — Dark Mode Inconsistencies
- **Status**: ✅ Selesai (Phase 5C) — Tidak ada fix needed
- **Deskripsi**: Audit dark mode selesai. Project sudah punya design system TailAdmin dengan CSS variables lengkap. Dark mode berfungsi dengan baik (`.dark` class toggle). Hardcoded hex colors (`#bc13fe`, `#00f7ff`) adalah **intentional brand colors** untuk cyberpunk theme. `bg-slate-700` dan `text-green-400` adalah Tailwind utility classes yang bekerja di kedua mode.
- **Validasi**: Playwright test di production — dark mode CSS variables ter-apply dengan benar (background: `#0a1428`, foreground: `#e8eef9`)

### 3.7 — Consolidate Duplicate Utilities
- **Status**: ✅ Selesai (Phase 5D)
- **Deskripsi**: `dateUtils.ts` deprecated sudah dihapus. 2 file yang masih import (`evoucher/page.tsx`, `registrations/page.tsx`) sudah dimigrasi ke `formatWIB` dari `@/lib/timezone`. 6 inline `formatRupiah`/`formatCurrency` di 6 file sudah diganti dengan import dari `@/lib/utils`.
- **Files fixed**: `hotspot/voucher/page.tsx`, `hotspot/rekap-voucher/page.tsx`, `evoucher/page.tsx`, `technician/isolated/page.tsx`, `pay/[token]/page.tsx`, `customer/page.tsx`

---

## Phase 4 — Type Safety & Performance

### 4.1 — Define NextAuth Session Types
- **Status**: ✅ Selesai
- **Deskripsi**: Hapus semua `(session.user as any)` casts, gunakan typed session
- **Files fixed**: `usePermissions.ts`, `server/auth/config.ts`, `AdminClientLayout.tsx`, `push-notifications/page.tsx`, `management/page.tsx`

### 4.2 — API Contract Types
- **Status**: ✅ Selesai (Phase 5B + Phase 6A)
- **Deskripsi**: Response API sekarang typed. `frontend/src/types/api/` berisi 12 file: `common.ts`, `auth.ts`, `pppoe.ts`, `billing.ts`, `network.ts`, `voucher.ts`, `settings.ts`, `notification.ts`, `dashboard.ts`, `customer.ts`, `agent.ts`, `index.ts`. Domain modules (`pppoeApi`, `invoiceApi`, `billingApi`, `networkApi`, `dashboardApi`, `settingsApi`, `customerApi`, `agentApi`) sudah diupdate untuk menggunakan typed responses.
- **Types**: `PppoeUser`, `PppoeProfile`, `PppoeArea`, `Invoice`, `ManualPayment`, `Transaction`, `Router`, `OLT`, `HotspotVoucher`, `Notification`, `Ticket`, `DashboardStats`, `CustomerUser`, `AgentProfile`, dll.
- **Phase 6A validation**: Semua type definitions di-validasi terhadap actual backend route responses. 7 backend issues ditemukan dan didocument (missing endpoints, inconsistent wrappers/errors/pagination). Lihat `docs/FRONTEND_API_CONTRACT.md`.

### 4.3 — React Query untuk Caching/Dedup
- **Status**: ⏭️ Skipped (Phase 5E)
- **Deskripsi**: React Query adalah optimization, bukan fix. Current approach dengan `apiAdmin()` sudah bekerja dengan baik. Dapat ditambahkan nanti jika dibutuhkan untuk performance.

### 4.4 — Audit Server vs Client Components
- **Status**: ✅ Selesai (Phase 5F)
- **Deskripsi**: Audit 208 `'use client'` directives. `table.tsx` converted ke Server Component (pure presentational, no hooks). Komponen UI lain (`badge.tsx`, `card.tsx`, `button.tsx`, `input.tsx`, `textarea.tsx`) sudah tidak punya `'use client'`. Semua Radix UI primitives, chart components, dan pages dengan hooks tetap Client Component dengan alasan yang valid.

### 4.5 — Enable TypeScript Build Checks
- **Status**: ✅ Selesai
- **Deskripsi**: Enable `typescript.ignoreBuildErrors: false` di `next.config.ts`
- **8 TS errors fixed**: ippool (3), fiber-cores (1), olt/monitoring (1), charts (3)

### 5G — Security Audit
- **Status**: ✅ Selesai
- **Deskripsi**: Audit credential leakage di frontend. `l2tpPassword` sebelumnya disimpan di localStorage di `vpn-server/page.tsx` — sudah dihapus. SSH credentials hanya simpan `{ host, port, username }` (tidak ada password). NEXT_PUBLIC vars aman: timezone, app name, app url, api url. Tidak ada `DATABASE_URL`, `RADIUS_SECRET`, `API_SECRET`, atau secrets lain di frontend code.

---

## Pre-existing TypeScript Errors (Tidak Disebabkan Migration)

Error berikut sudah ada sebelum migrasi dan belum diperbaiki:

### `frontend/src/app/admin/ippool/page.tsx`
- Button `variant="ghost"` tidak allowed oleh component type
- **Prioritas**: Low

### `frontend/src/app/admin/laporan/analitik/page.tsx`
- Recharts formatter callback types incompatible — sudah di-fix dengan `any` type
- **Prioritas**: Low (workaround applied)

---

## Deployment & Production Testing

### VPS Deployment
- **Status**: ✅ Selesai (15 Aug 2026 — Sec Phase 3)
- **VPS**: `192.168.54.129`
- **Domain**: `https://radius.salfa.my.id`
- **Production dir**: `/var/www/salfanet-radius/`
- **Git source**: `/root/salfanet-radius/`
- **Deploy method**: git pull + pnpm install + next build + PM2 restart
- **Commit deployed**: `ebe89923` (Sec Phase 3)
- **DB migration**: `20260816_add_radius_sync_queue.sql` applied (radius_sync_queue, cron_lock, agents.sessionVersion, transactions.reference unique index)
- **PM2 processes**: All 4 online (frontend, backend, cron, wa)
- **Health check**: Backend 200, Frontend 200, Nginx 8080 200
- **Security smoke test**: 6 endpoints all return 401 without auth (admin/users, sync-all-radius, radius-sync, agent/logout, customer/dashboard, agent/dashboard)
- **Nginx**: port 8080, Cloudflare handles 443

### Production Testing
- **Status**: ✅ Selesai (14 Aug 2026)
- **Smoke test results**:
  - `https://radius.salfa.my.id` → 307 (redirect normal)
  - `https://radius.salfa.my.id/login` → 200 (18KB)
  - `https://radius.salfa.my.id/api/health` → 200 OK
  - `https://radius.salfa.my.id/api/pppoe/users` → 401 (expected, butuh auth)
  - `https://radius.salfa.my.id/api/dashboard/stats` → 401 (expected)
- **Regression statuses**: Tidak ada 400/404/405/500 di endpoint yang di-test

---

## Commits Terbaru

| Commit | Tanggal | Deskripsi |
|--------|---------|-----------|
| `ebe89923` | 15 Aug | fix: add missing SQL migration file for radius_sync_queue + cron_lock + agent sessionVersion |
| `1b684fd5` | 15 Aug | feat: FreeRADIUS reconciliation/retry, atomic cron lock, payment idempotency, IDOR tests, agent JWT revocation |
| `aa09185e` | 15 Aug | docs: update SECURITY_AUDIT.md with Phase 2 comprehensive security hardening findings |
| `23bb7ef5` | 15 Aug | fix: comprehensive security hardening — auth, IDOR, billing, RADIUS, cron, GenieACS |
| `ab3250a7` | 15 Aug | docs: update FRONTEND_REGRESSION_AUDIT.md with Phase 3 fetch migration audit |
| `95bfa7e8` | 14 Aug | Phase 6A: Full API contract and type-safety audit |
| `a72fcc30` | 14 Aug | docs: update TODO.md and CHANGELOG.md for Phase 5 completion |
| `8e39478f` | 14 Aug | feat: Phase 5 frontend audit — API types, utilities, security, server components |
| `8c8c00f3` | 14 Aug | feat: Phase 3 architecture improvements |
| `8b743cfb` | 14 Aug | fix: resolve lint errors from API migration |

---

## Ringkasan Prioritas

| Prioritas | Item | Phase | Status |
|-----------|------|-------|--------|
| **High** | Technician GenieACS scope — butuh schema `TechnicianRouter` assignment | Sec Phase 3 | ⚠️ Known Limitation |
| **Medium** | Customer session migration ke httpOnly cookies | Sec Phase 3 | ⚠️ Documented (not implemented) |
| **Medium** | Run IDOR + payment concurrency test suites di VPS | Sec Phase 3 | Pending |
| **Medium** | Sisa 318 `(data as any)` casts di lower-priority pages | Phase 6B | Pending |
| **Low** | Backend issues (7 items di FRONTEND_API_CONTRACT.md) | Backend | Documented |
| **Low** | `catch (e: any)` → `catch (e: unknown)` cleanup | Phase 6B | Pending |
| **Low** | `handleVoucherOrder` upgrade ke `updateMany` idempotency guard | Sec Phase 3 | Pending |

### Sudah Selesai
- ✅ VPS Deployment Sec Phase 3 (15 Aug 2026, commit `ebe89923`)
- ✅ Sec Phase 3 — FreeRADIUS reconciliation + retry queue
- ✅ Sec Phase 3 — Atomic cron distributed lock
- ✅ Sec Phase 3 — Payment concurrency/idempotency verification
- ✅ Sec Phase 3 — Automated IDOR + tenant isolation tests
- ✅ Sec Phase 3 — Agent JWT revocation (sessionVersion)
- ✅ Sec Phase 3 — Customer session hardening audit (documented)
- ✅ Sec Phase 3 — Technician GenieACS scope audit (documented)
- ✅ Sec Phase 3 — Security documentation synchronization
- ✅ VPS Deployment (14 Aug 2026, commit `95bfa7e8`)
- ✅ Phase 6A — Full API Contract & Type-Safety Audit
- ✅ Phase 6B — Frontend Type-Safety Hardening (14 Aug 2026)
- ✅ Phase 6C — API Client Correctness & Type-Safety Hardening (14 Aug 2026)
- ✅ Phase 6D — UI State & Error Handling Audit (15 Aug 2026)
- ✅ Phase 7 — React Query + Performance Optimizations (15 Aug 2026)
- ✅ Phase 8 — Complete React Query Migration (15 Aug 2026, commit `9f03f93f`)
- ✅ Production Testing — smoke test via domain
- ✅ NextAuth Session Types (Phase 4.1)
- ✅ Enable TypeScript Build Checks (Phase 4.5)
- ✅ Pre-existing TS Errors — semua fixed
- ✅ API Contract Types (Phase 5B + 6A validation)
- ✅ Dark Mode Audit (Phase 5C)
- ✅ Utilities Consolidation (Phase 5D)
- ✅ Server/Client Component Audit (Phase 5F)
- ✅ Security Audit (Phase 5G)
