# TODO — Salfanet Radius (Sisa Pekerjaan)

Daftar pekerjaan yang **belum dikerjakan** setelah Phase 1, Phase 2, dan Phase 3 selesai.

Dokumen ini dibuat pada: 2026-08-14

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
- **Status**: ✅ Selesai (14 Aug 2026)
- **VPS**: `192.168.54.129`
- **Domain**: `https://radius.salfa.my.id`
- **Production dir**: `/var/www/salfanet-radius/`
- **Git source**: `/root/salfanet-radius/`
- **Deploy method**: git pull + pnpm install + next build + PM2 restart
- **Commit deployed**: `95bfa7e8` (Phase 6A)
- **PM2 processes**: All 4 online (frontend, backend, cron, wa)
- **Health check**: Backend `{"status":"ok"}`, Frontend 307→200, Nginx 8080 OK
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
| `95bfa7e8` | 14 Aug | Phase 6A: Full API contract and type-safety audit |
| `a72fcc30` | 14 Aug | docs: update TODO.md and CHANGELOG.md for Phase 5 completion |
| `8e39478f` | 14 Aug | feat: Phase 5 frontend audit — API types, utilities, security, server components |
| `8c8c00f3` | 14 Aug | feat: Phase 3 architecture improvements |
| `8b743cfb` | 14 Aug | fix: resolve lint errors from API migration |
| `2ae622f8` | 14 Aug | refactor: migrate Batch 77-111 pages to centralized API client |
| `6e88dda0` | 14 Aug | refactor: migrate Batch 69-76 pages to centralized API client |
| `fb4bccf3` | 14 Aug | fix: resolve type errors from API client migration |
| `2f117d71` | 14 Aug | refactor: migrate Batch 53-60 pages to centralized API client |
| `42cf6b37` | 14 Aug | refactor: migrate genieacs/presets page to centralized API client |

---

## Ringkasan Prioritas

| Prioritas | Item | Phase | Status |
|-----------|------|-------|--------|
| **Medium** | Sisa 318 `(data as any)` casts di lower-priority pages | Phase 6B | Pending |
| **Medium** | React Query (performance optimization) | Phase 7 | Pending (butuh profiling data) |
| **Low** | Backend issues (7 items di FRONTEND_API_CONTRACT.md) | Backend | Documented |
| **Low** | `catch (e: any)` → `catch (e: unknown)` cleanup | Phase 6B | Pending |

### Sudah Selesai
- ✅ VPS Deployment (14 Aug 2026, commit `95bfa7e8`)
- ✅ Phase 6A — Full API Contract & Type-Safety Audit
- ✅ Phase 6B — Frontend Type-Safety Hardening (14 Aug 2026)
- ✅ Phase 6C — API Client Correctness & Type-Safety Hardening (14 Aug 2026)
- ✅ Phase 6D — UI State & Error Handling Audit (15 Aug 2026)
- ✅ Phase 7 — React Query + Performance Optimizations (15 Aug 2026)
- ✅ Production Testing — smoke test via domain
- ✅ NextAuth Session Types (Phase 4.1)
- ✅ Enable TypeScript Build Checks (Phase 4.5)
- ✅ Pre-existing TS Errors — semua fixed
- ✅ API Contract Types (Phase 5B + 6A validation)
- ✅ Dark Mode Audit (Phase 5C)
- ✅ Utilities Consolidation (Phase 5D)
- ✅ Server/Client Component Audit (Phase 5F)
- ✅ Security Audit (Phase 5G)
