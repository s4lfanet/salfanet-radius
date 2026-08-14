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
- **Status**: ❌ Belum dikerjakan
- **Deskripsi**: NextAuth session masih pakai `(session.user as any).id` — tidak typed
- **File**: `frontend/src/types/next-auth.d.ts`, `frontend/src/server/auth/config.ts`
- **Solusi**: Define proper `Session` interface dengan `user.id`, `user.username`, `user.role`
- **Prioritas**: Medium

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
- **Status**: ❌ Belum dikerjakan
- **Deskripsi**: Build saat ini ignore TypeScript errors (`typescript: false` di `next.config.ts` mungkin)
- **Solusi**: Fix semua TS errors, enable `typescript: true` di Next.js config
- **Prioritas**: Medium

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
- **Status**: ⏳ Pending
- **Deskripsi**: VPS unreachable, tidak bisa deploy untuk production testing
- **Solusi**: Tunggu VPS available, jalankan `updater.sh` di VPS
- **Prioritas**: High (saat VPS available)

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
| **High** | VPS Deployment & Production Testing | Deploy |
| **Medium** | NextAuth Session Types | Phase 4.1 |
| **Medium** | API Contract Types | Phase 4.2 |
| **Medium** | Enable TypeScript Build Checks | Phase 4.5 |
| **Low** | Dark Mode Inconsistencies | Phase 3.6 |
| **Low** | Consolidate Duplicate Utilities | Phase 3.7 |
| **Low** | React Query | Phase 4.3 |
| **Low** | Server vs Client Component Audit | Phase 4.4 |
| **Low** | Pre-existing TS Errors (ippool button variant) | Bug fix |
