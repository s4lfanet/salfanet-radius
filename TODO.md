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
| **Deploy** | ✅ Selesai | VPS `192.168.54.129` — git pull, build, PM2 restart, health check OK |

---

## Phase 3 — Sisa (Low Priority)

### 3.6 — Dark Mode Inconsistencies
- **Status**: ❌ Belum dikerjakan
- **Deskripsi**: Masih ada hardcoded colors dan mixed palettes di beberapa komponen
- **File yang perlu diaudit**:
  - `frontend/src/app/admin/network/vpn-server/page.tsx` — hardcoded `bg-slate-700`, `text-green-400`
  - `frontend/src/app/admin/management/page.tsx` — hardcoded `bg-[#bc13fe]/10`, `border-[#bc13fe]/50`
  - Komponen lain yang mungkin pakai hardcoded colors
- **Solusi**: Ganti semua hardcoded colors dengan CSS variables dari Tailwind theme (`bg-muted`, `text-foreground`, `border-border`, dll.)
- **Prioritas**: Low (visual only, tidak affect functionality)

### 3.7 — Consolidate Duplicate Utilities
- **Status**: ❌ Belum dikerjakan
- **Deskripsi**: `formatCurrency` dan `formatDate` ada di beberapa tempat
- **File yang perlu diaudit**:
  - `frontend/src/lib/utils.ts` — `formatCurrency()`, `formatDate()`
  - `frontend/src/lib/utils/dateUtils.ts` — deprecated wrapper, masih dipakai beberapa page
  - Cari duplikat di komponen lain
- **Solusi**: Konsolidasi ke satu file, hapus yang deprecated
- **Prioritas**: Low (current utils work, hanya code cleanliness)

---

## Phase 4 — Type Safety & Performance

### 4.1 — Define NextAuth Session Types
- **Status**: ✅ Selesai
- **Deskripsi**: Hapus semua `(session.user as any)` casts, gunakan typed session
- **Files fixed**: `usePermissions.ts`, `server/auth/config.ts`, `AdminClientLayout.tsx`, `push-notifications/page.tsx`, `management/page.tsx`

### 4.2 — API Contract Types
- **Status**: ❌ Belum dikerjakan
- **Deskripsi**: Response API tidak typed — `apiAdmin()` return `any` di banyak tempat
- **Solusi**: Buat `frontend/src/types/api/` dengan interface untuk setiap endpoint response
- **Prioritas**: Medium

### 4.3 — React Query untuk Caching/Dedup
- **Status**: ❌ Belum dikerjakan
- **Deskripsi**: Tidak ada client-side caching/dedup untuk API calls
- **Solusi**: Tambah `@tanstack/react-query` untuk data fetching dengan cache, dedup, background refetch
- **Prioritas**: Low (current approach works, React Query adalah optimization)

### 4.4 — Audit Server vs Client Components
- **Status**: ❌ Belum dikerjakan
- **Deskripsi**: Banyak komponen pakai `'use client'` padahal bisa jadi Server Component
- **Solusi**: Audit semua `'use client'` directive, pindahkan ke Server Component where possible
- **Prioritas**: Low (performance optimization)

### 4.5 — Enable TypeScript Build Checks
- **Status**: ✅ Selesai
- **Deskripsi**: Enable `typescript.ignoreBuildErrors: false` di `next.config.ts`
- **8 TS errors fixed**: ippool (3), fiber-cores (1), olt/monitoring (1), charts (3)

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
- **VPS**: `192.168.54.129` (local)
- **Production dir**: `/var/www/salfanet-radius/`
- **Deploy method**: git pull + pnpm install + next build + PM2 restart
- **Commit deployed**: `cbc2fdbc`
- **PM2 processes**: All 4 online (frontend, backend, cron, wa)
- **Health check**: Backend `{"status":"ok"}`, Frontend 200, Nginx 200

### Production Testing
- **Status**: ⏳ Pending
- **Deskripsi**: Test semua halaman admin setelah deploy
- **Solusi**: Test manual atau via Playwright setelah deploy
- **Prioritas**: High (saat VPS available)

---

## Commits Terbaru (Phase 2 Completion + Phase 3)

| Commit | Tanggal | Deskripsi |
|--------|---------|-----------|
| `8c8c00f3` | 14 Aug | feat: Phase 3 architecture improvements |
| `8b743cfb` | 14 Aug | fix: resolve lint errors from API migration |
| `2ae622f8` | 14 Aug | refactor: migrate Batch 77-111 pages to centralized API client |
| `6e88dda0` | 14 Aug | refactor: migrate Batch 69-76 pages to centralized API client |
| `fb4bccf3` | 14 Aug | fix: resolve type errors from API client migration |
| `2f117d71` | 14 Aug | refactor: migrate Batch 53-60 pages to centralized API client |
| `42cf6b37` | 14 Aug | refactor: migrate genieacs/presets page to centralized API client |

---

## Ringkasan Prioritas

| Prioritas | Item | Phase |
|-----------|------|-------|
| **High** | Production Testing (test semua halaman admin) | Deploy |
| **Medium** | API Contract Types | Phase 4.2 |
| **Low** | Dark Mode Inconsistencies | Phase 3.6 |
| **Low** | Consolidate Duplicate Utilities | Phase 3.7 |
| **Low** | React Query | Phase 4.3 |
| **Low** | Server vs Client Component Audit | Phase 4.4 |

### Sudah Selesai
- ✅ VPS Deployment (14 Aug 2026)
- ✅ NextAuth Session Types (Phase 4.1)
- ✅ Enable TypeScript Build Checks (Phase 4.5)
- ✅ Pre-existing TS Errors — semua fixed
