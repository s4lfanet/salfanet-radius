# SALFANET RADIUS - Billing System for ISP/RTRW.NET

Modern, full-stack billing & RADIUS management system for ISP/RTRW.NET with FreeRADIUS integration supporting PPPoE and Hotspot authentication.

> **Architecture:** pnpm monorepo — **Two Next.js apps** (frontend UI + backend API) + Baileys WhatsApp service
> **Version:** 5.12.0 — QRIS Mandiri Payment, Auto-Update System, Installer & Cloudflare Tunnel Fixes + Phase 7 (React Query + Performance) + Phase 6D (UI State & Error Handling) + Phase 6C (API Client Correctness) + Phase 6B (Type-Safety) + Phase 6A (API Contract Audit) + Phase 5 (frontend audit) + Phase 2 (111 batches, ~510 fetch calls migrated) + Phase 3 architecture improvements

---

## 🤖 AI Development Assistant

**READ FIRST:** [docs/AI_PROJECT_MEMORY.md](docs/AI_PROJECT_MEMORY.md) — contains full architecture, VPS details, DB schema, known issues, and proven solutions.

---

## 🎯 Features

| Category | Key Capabilities |
|----------|-----------------|
| **RADIUS / Auth** | FreeRADIUS 3.0.26, PAP/CHAP/MS-CHAP, VPN L2TP/IPSec, PPPoE & Hotspot, CoA real-time speed/disconnect, **IP Pool management**, **Multi-NAS isolation** |
| **VPN Management** | MikroTik CHR via API, VPS built-in WireGuard & L2TP/IPsec peer management, configurable IP pool & gateway per protocol, auto-generated RouterOS scripts |
| **PPPoE Management** | Customer accounts, profile-based bandwidth, isolation, IP assignment, MikroTik auto-sync, foto KTP+instalasi via kamera HP, GPS otomatis, **realtime online/offline status (polling 10s)**, **realtime status isolir/aktif (polling 10s)**, **PSB wizard 3-step (adopt dari home.pmynet.id)**, **true optimistic update (reactivate/delete instant)**, **placeholder MAC rejection** |
| **IP Pool** | RADIUS ippool module — dynamic IP allocation per speed tier, pool create/expand/delete, Pool-Name → group mapping, utilization stats |
| **Data Usage Reporting** | Per-user bandwidth tracking (daily aggregation via cron), monthly summary, top consumers, GB upload/download per period |
| **Hotspot Voucher** | 8 code types, batch up to 25,000, agent distribution, auto-sync with RADIUS, print templates |
| **Billing** | Postpaid/prepaid invoices, auto-generation, payment reminders, balance/deposit, auto-renewal |
| **Payment** | Manual upload (bukti transfer), Midtrans/Xendit/Duitku gateway, approval workflow, 0–5 bank accounts |
| **Notifications** | WhatsApp (Fonnte/WAHA/GOWA/MPWA/Wablas/WABlast/**Kirimi.id**/**Baileys native**), Email SMTP, broadcast (outage/invoice/payment), webhook pesan masuk |
| **Agent/Reseller** | Balance-based voucher generation, commission tracking, sales stats |
| **Financial** | Income/expense tracking with categories, keuangan reconciliation |
| **Network (FTTH)** | OLT/ODC/ODP management, customer port assignment, network map, distance calculation |
| **GenieACS TR-069** | CPE/ONT management, WiFi config (SSID/password), device status & uptime |
| **Isolation** | Auto-isolate expired customers, customizable WhatsApp/Email/HTML landing page templates, **fallback MikroTik API kick saat radacct kosong** |
| **Cron Jobs** | 17 automated background jobs (tsx runner via PM2 fork), history, distributed locking, manual trigger, **auto-close orphaned/stale sessions** |
| **Roles & Permissions** | 53 permissions, 5 portals (Admin/Customer/Agent/Technician + SuperAdmin) |
| **Activity Log** | Audit trail with auto-cleanup (30 days) |
| **Security** | Session timeout 30 min, idle warning, RBAC, HTTPS/SSL |
| **Performance** | **Redis cache untuk data non-realtime** (profiles, areas, routers), graceful degradation jika Redis unavailable |
| **Auth Modes** | `local` (MikroTik primary) dan `radius` (FreeRADIUS primary, PPP secret backup disabled). **Auto-migrate radius → local: create PPP secrets from existing customer data + disconnect RADIUS sessions**. **hybrid mode obsolete** |
| **RADIUS Setup** | Auto-generated RouterOS script pakai **IP asli VPS** (bukan domain/Cloudflare proxy), VPN-specific address selection |
| **Bahasa** | Bahasa Indonesia (full) |
| **PWA** | Installable di semua portal (admin, customer, agent, technician), offline fallback, service worker cache |
| **Web Push** | VAPID-based browser push notifications, subscribe/unsubscribe toggle, admin broadcast |
| **System Update** | Update via SSH menggunakan `updater.sh`, tidak ada web-based update |
| **Mobile App** | Flutter customer portal (WiFi control, invoice, payment) |
| **WhatsApp Baileys** | Native WhatsApp gateway built-in VPS via `@whiskeysockets/baileys`, PM2 proses terpisah, scan QR langsung di admin panel, auto-reconnect |

---

## 📱 WhatsApp Baileys (Native Gateway)

Provider WhatsApp bawaan tanpa layanan pihak ketiga. Berjalan sebagai proses PM2 terpisah (`salfanet-wa`) di VPS.

### Setup

Provider Baileys otomatis di-setup saat menjalankan `updater.sh`. Tidak ada konfigurasi tambahan.

```bash
# Cek status wa-service
pm2 status
pm2 logs salfanet-wa --lines 20
```

### Cara Pakai

1. Buka **Admin → Pengaturan → WhatsApp → Penyedia**
2. Klik **+ Tambah Provider**, pilih tipe **Baileys**
3. Klik **QR Code** → scan dengan HP (WhatsApp → Linked Devices)
4. Setelah scan berhasil, modal menampilkan centang hijau konfirmasi
5. Provider siap digunakan untuk kirim notifikasi

### PM2 Processes

| Process | Mode | Port | Purpose |
|---------|------|------|---------|
| `salfanet-frontend` | cluster | 3000 | Next.js standalone (UI + NextAuth routes) |
| `salfanet-backend` | fork | 3001 | Next.js standalone (API routes + Prisma + services) |
| `salfanet-cron` | fork | — | Cron runner (calls backend APIs on schedule) |
| `salfanet-wa` | fork | 4000 (internal) | Baileys WA service |

### Auth Session

Session WhatsApp tersimpan di `/var/data/salfanet/baileys_auth/` dan persist meski PM2 restart. Untuk logout/scan ulang, klik **Restart Session** di admin panel.

---

## ⚡ Redis Cache (v4.2.0)

Redis digunakan untuk cache data non-realtime agar load halaman lebih cepat. Data realtime (online/offline, sessions, invoices) **tidak di-cache**.

### Yang Di-Cache (TTL 5 menit)

| Endpoint | Cache Key | TTL |
|----------|-----------|-----|
| `GET /api/pppoe/profiles` | `pppoe:profiles` | 5 menit |
| `GET /api/pppoe/areas` | `pppoe:areas` | 5 menit |
| `GET /api/network/routers` | `network:routers` | 5 menit |

Cache di-invalidate otomatis saat create/update/delete pada data terkait.

### Yang TIDAK Di-Cache (Realtime)

- `/api/pppoe/users` — online/offline status harus realtime
- `/api/pppoe/users/[id]` — detail user harus realtime
- `/api/invoices` — status pembayaran harus realtime
- `/api/sessions/*` — session data harus realtime

### Graceful Degradation

Jika Redis unavailable, semua function cache tetap jalan dengan fallback ke database langsung (return null, caller query DB).

### Setup

Redis harus terinstall dan running di VPS:
```bash
sudo apt install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
redis-cli ping  # harus return PONG
```

File: `backend/src/server/cache/redis.ts`

---

## 📡 RADIUS Enhancements (v3.1.0)

Diadopsi dari FreeRADIUS 3.2.8 schema (`home.pmynet.id-main` project).

## 📋 Frontend Audit & Centralized API Migration (v4.4.0)

Migrasi frontend dari inline `fetch()` ke **centralized API client** (`@/lib/api`) untuk semua halaman admin. Frontend sekarang **UI-only** — tidak ada direct Prisma/DB/MikroTik/SSH/FreeRADIUS access.

Dokumentasi lengkap: [`FRONTEND_AUDIT.md`](FRONTEND_AUDIT.md) · [`CHANGELOG.md`](CHANGELOG.md)

### Phase 1 — Architectural Cleanup (Prasyarat)

| Phase | Deskripsi | Status |
|-------|-----------|--------|
| 1A | Dead code removal (import tidak terpakai, komponen yatim) | ✅ Done |
| 1B | NextAuth refactor & Prisma removal dari frontend | ✅ Done |
| 1C | Uploads serving dipindahkan ke Nginx (`/uploads/`) | ✅ Done |

### Phase 2 — Centralized API Client Migration (Batch 1–52)

**Total: 52 batch, 361 inline `fetch()` calls di-migrasi**

| Batch Range | Halaman | Calls | Tanggal |
|-------------|---------|-------|---------|
| 1–8b | API client + pppoe/profiles, areas, users, invoices, dashboard, keuangan, ippool | 80 | 13 Aug |
| 9 | hotspot/voucher | 15 | 13 Aug |
| 10–11 | vpn-server + vpn-client | 31 | 13 Aug |
| 12 | genieacs/devices | 13 | 13 Aug |
| 13 | network/diagrams | 10 | 13 Aug |
| 14 | network/map | 9 | 13 Aug |
| 15 | network/olts | 8 | 13 Aug |
| 16 | hotspot/agent | 9 | 13 Aug |
| 17 | network/infrastruktur | 8 | 13 Aug |
| 18 | whatsapp/providers | 7 | 13 Aug |
| 19 | network/routers | 8 | 13 Aug |
| 20 | download-apk | 7 | 13 Aug |
| 21 | genieacs/parameter-config | 7 | 13 Aug |
| 22 | pppoe/registrations | 7 | 13 Aug |
| 23 | genieacs/vp-scripts | 6 | 13 Aug |
| 24 | management | 6 | 13 Aug |
| 25 | network/trace | 4 | 13 Aug |
| 26 | settings/email | 6 | 13 Aug |
| 27 | sessions | 4 | 13 Aug |
| 28 | notifications | 6 | 13 Aug |
| 29 | settings/database | 6 | 13 Aug |
| 30 | settings/company | 5 | 13 Aug |
| 31 | settings/telegram | 5 | 13 Aug |
| 32 | tickets | 5 | 13 Aug |
| 33 | inventory/items | 5 | 13 Aug |
| 34 | settings/cron | 5 | 13 Aug |
| 35 | sessions/pppoe | 4 | 13 Aug |
| 36 | network/unified-map | 5 | 13 Aug |
| 37 | network/customers | 5 | 13 Aug |
| 38 | network/splice-points | 5 | 13 Aug |
| 39 | freeradius/backup | 5 | 13 Aug |
| 40 | tickets/[id] | 5 | 13 Aug |
| 41 | network/odps | 5 | 14 Aug |
| 42 | pppoe/users/[id] | 5 | 14 Aug |
| 43 | manual-payments | 4 | 14 Aug |
| 44 | settings/security (2FA) | 4 | 14 Aug |
| 45 | settings/isolation/templates | 4 | 14 Aug |
| 46 | settings/genieacs | 4 | 14 Aug |
| 47 | pppoe/addons | 4 | 14 Aug |
| 48 | data-usage | 4 | 14 Aug |
| 49 | whatsapp/send | 4 | 14 Aug |
| 50 | push-notifications | 4 | 14 Aug |
| 51 | referrals + settings/referral | 4 | 14 Aug |
| 52 | whatsapp/templates | 2 | 14 Aug |

### Centralized API Client (`@/lib/api`)

```typescript
import { apiAdmin } from '@/lib/api';
import type { PppoeUserListResponse } from '@/types/api';

// GET — typed response
const data = await apiAdmin<PppoeUserListResponse>('/api/pppoe/users');
// data.users, data.count — fully typed

// POST/PUT/DELETE
const result = await apiAdmin<{ success: boolean; message?: string }>('/api/pppoe/users', {
  method: 'POST',
  body: JSON.stringify(payload),
});

// Error handling otomatis via ApiError
try {
  const data = await apiAdmin<PppoeUserListResponse>('/api/invoices');
} catch (error) {
  // error instanceof ApiError — non-2xx response
}
```

**Fitur:**
- Auth-aware (mengirim session cookie otomatis)
- Auto JSON parsing
- Auto `Content-Type: application/json` header
- Throw `ApiError` untuk non-2xx responses
- Multipart & blob download support
- **Generic typed** — `apiAdmin<T = unknown>` (Phase 6A: default `unknown` forces explicit typing)
- 3 auth modes: `apiAdmin` (cookies), `apiCustomer` (Bearer), `apiAgent` (Bearer)

### Verification (per batch)

Setiap batch diverifikasi dengan:
1. ✅ Local build (`npm run build`) — exit code 0
2. ✅ Deploy via `pscp` + remote build + `pm2 restart salfanet-frontend`
3. ✅ Production page test via Playwright
4. ✅ Browser console errors check (0 errors expected)
5. ✅ Update `FRONTEND_AUDIT.md`
6. ✅ Git commit + push

### Phase 2 Status

- **Migrated**: 52 batch, 361 fetch calls
- **Remaining**: ~176 fetch calls di halaman admin lainnya
- **Phase 3** (pending): middleware improvements, error boundaries, theme improvements

---

## Phase 8 — Complete React Query Migration (v5.1.0)

Melanjutkan migrasi React Query dari Phase 7 untuk **semua halaman admin tersisa**. 80 file diubah, net reduction 875 baris kode.

### Yang Dikerjakan

- Migrasi 65+ halaman admin dari `useEffect + apiAdmin + load()` ke `useApiQuery`/`useQueryClient`
- Settings (15), GenieACS (6), Network (11), PPPoE+Hotspot (10), FreeRADIUS (6), other admin (23)
- Mutations menggunakan `queryClient.invalidateQueries()` bukan manual reload
- Filter/pagination params masuk ke query key
- Reference data: `staleTime: 300000` (5 menit)
- Polling: `refetchInterval` menggantikan `setInterval`
- Auth pages (login, 2FA) **tidak dimigrasi** (intentional)

### Verification

- `npx tsc --noEmit`: 0 errors
- `npx next build`: sukses (local + VPS)
- PM2: 4 processes online
- Smoke: health 200, login 200, 404, protected 401, upload 401
- Commit: `9f03f93f`

---

## � Phase 7 — React Query + Performance Optimizations (v5.0.0)

Implementasi @tanstack/react-query v5 untuk caching, deduplication, dan background refetching.

Dokumentasi lengkap: [`FRONTEND_AUDIT.md`](FRONTEND_AUDIT.md)

### Yang Dikerjakan

1. **Install @tanstack/react-query v5** + `QueryProvider` di root layout
2. **Create hooks** — `useApiQuery`, `useApiMutation`, `useAdminQuery`, `useCustomerQuery`, `useAgentQuery`
3. **Migrate 15 pages** to React Query:
   - Dashboard — 30s/5min polling via `refetchInterval`
   - PPPoE users — 10s online status polling, optimistic updates
   - Hotspot voucher — eliminates 3x duplicate `loadVouchers()` on mount
   - PPPoE sessions — 10s polling, disconnect mutation
   - Hotspot sessions — 10s polling, sync/disconnect mutations
   - Network: routers, OLTs, ODPs, trace, infrastruktur
   - GenieACS: presets, provisions, files, config, faults
   - Invoices — mark-as-paid, send-reminder, broadcast, generate mutations
   - Keuangan — transactions, categories with 5min staleTime
4. **Remove dead code** — `lib/utils/export.ts` (unused, had eager jsPDF/exceljs imports)
5. **Add `loading="lazy"`** to 27 `<img>` tags across 16 files
6. **Remove `{ cache: 'no-store' }`** from GenieACS pages (RQ handles caching)

### Performance Improvements

| Metric | Before | After |
|--------|--------|-------|
| Duplicate API calls on mount | 5+ instances | 0 (RQ dedup) |
| Pages with no caching | ~100 | 15 migrated (RQ caching) |
| setInterval polling | 8 files | 0 (refetchInterval) |
| Dead code (eager imports) | 1 file | 0 (removed) |
| Images without loading="lazy" | 27 | 0 |
| Net code reduction | — | -1132 lines |

### Verification
- TypeScript: 0 errors
- Build: success
- No business logic, API endpoint, or HTTP method changes
- React Query implemented as planned based on profiling data

---

## �🔒 Phase 6D — UI State & Error Handling Audit (v4.9.0)

Standardisasi error handling, loading states, dan confirmation dialogs di seluruh frontend.

Dokumentasi lengkap: [`FRONTEND_AUDIT.md`](FRONTEND_AUDIT.md)

### Hasil

| Metric | Before | After |
|--------|--------|-------|
| `alert()` calls | 23 | 0 |
| `Swal.fire()` direct | 14 | 0 |
| bare `confirm()` | 15 | 0 |
| silent catch blocks | 22 | 0 |
| error.tsx boundaries | 1 | 4 |
| loading.tsx boundaries | 1 | 4 |
| not-found.tsx | 0 | 1 |
| shared feedback components | 0 | 3 |

### Yang Dikerjakan

1. **alert() → toast** — 23 occurrences di 7 files, diganti dengan `showError`/`showSuccess`/`showInfo`
2. **confirm() → showConfirm()** — 15 occurrences di 12 files, diganti dengan `await showConfirm()`
3. **Swal.fire() → CyberToast bridge** — 14 occurrences di 3 files (AddNodePanel, NetworkNodePanel, unified-map)
4. **Silent catch blocks** — 22 occurrences di 10 files, ditambah `console.error`/`console.warn`
5. **Error/loading/not-found boundaries** — root, customer, technician portals
6. **Shared feedback components** — `EmptyState`, `LoadingSpinner`, `ErrorState` di `components/feedback/`

### Verification
- TypeScript: 0 errors
- Build: success
- No business logic, API endpoint, or HTTP method changes
- React Query not implemented (deferred to Phase 7)

---

## 🔒 Phase 6C — API Client Correctness & Type-Safety Hardening (v4.8.0)

Perbaikan critical API client + pengurangan `any` ke minimum + dokumentasi semua exceptions.

Dokumentasi lengkap: [`FRONTEND_AUDIT.md`](FRONTEND_AUDIT.md) · [`docs/TYPE_SAFETY_EXCEPTIONS.md`](docs/TYPE_SAFETY_EXCEPTIONS.md)

### Hasil

| Metric | Before (6B) | After (6C) | Reduction |
|--------|-------------|------------|-----------|
| `: any` | 70 | 2 | **97%** |
| `as any` | 37 | 0 | **100%** |
| `<any>` | 9 | 5 | **44%** |
| `(data as any)` | 0 | 0 | — |
| `catch (e: any)` | 0 | 0 | — |
| `as unknown as` | 24 | 24 | — (all documented) |
| TypeScript errors | 0 | 0 | — |
| Build | ✅ | ✅ | — |

### Yang Dikerjakan

1. **API Client Content-Type fix (CRITICAL)** — `apiAdmin()` tidak lagi memaksakan `Content-Type: application/json` untuk FormData/Blob/binary. Hanya JSON string body yang dapat Content-Type.
2. **Error handling** — 401/403/404/405/429/500+ messages, 204 No Content handling, `ApiErrorResponse` interface
3. **SplitterDiagram** — `metadata?: any` → `PortMetadata` / `SplitterNodeMetadata` interfaces
4. **AddNodePanel** — 20 `: any` → 8 new interfaces
5. **Recharts** — 4 `: any` → `TooltipPayloadEntry`, `TooltipValueType` from recharts
6. **Admin pages** — 20+ files, `as any` → typed `apiAdmin<T>()` calls
7. **Hooks** — `useTranslation.ts`, `useSSE.ts` — `any` → `unknown` / `MessageEvent`
8. **`as unknown as` audit** — all 24 documented with inline comments (Leaflet, jsPDF, API type boundaries, SplitterNode, custom DOM)
9. **Type Safety Exceptions** — `docs/TYPE_SAFETY_EXCEPTIONS.md` created

### Sisa `any` (2 — all third-party)

- `midtrans-client.d.ts` — Midtrans API declaration (no types available)

---

## 🔒 Phase 6B — Frontend Type-Safety Hardening (v4.7.0)

Pengurangan `any` secara signifikan tanpa memaksa `any = 0`. Membangun **safe type system** dengan explicit types, safe narrowing, dan response interfaces.

Dokumentasi lengkap: [`FRONTEND_AUDIT.md`](FRONTEND_AUDIT.md)

### Hasil

| Metric | Before (6A) | After (6B) | Reduction |
|--------|-------------|------------|-----------|
| `: any` | 418 | 70 | 83% |
| `as any` | 483 | 37 | 92% |
| `(data as any)` | 272 | 0 | 100% |
| `catch (e: any)` | 257 | 0 | 100% |
| `Record<string, any>` | 6 | 0 | 100% |
| TypeScript errors | 0 | 0 | — |
| Build | ✅ | ✅ | — |

### Yang Dikerjakan

1. **257 `catch (e: any)` → `catch (e: unknown)`** di 88 files dengan safe narrowing (`e instanceof Error ? e.message : String(e)`)
2. **272 `(data as any)` casts removed** di 40 files — setiap `apiAdmin()` call sekarang memiliki explicit type argument
3. **6 `Record<string, any>` → `Record<string, unknown>`** — semua fixed
4. **`Promise<any>` → `Promise<unknown>`** di rateLimiter.ts
5. **`useState<any>` → proper interfaces** — EntityFormData, OnuDetailResponse, dll.
6. **102 files modified** — type-only changes, no business logic changes

### Sisa `any` yang Legitimate

- `Promise<any>` di `midtrans-client.d.ts` (third-party declaration)
- `<any>` di Leaflet map refs dan React.ComponentType untuk dynamic icons
- `: any` di Recharts callbacks dan SplitterDiagram metadata
- `as any` di network diagrams SplitterNode conversions

---

## 🔒 Phase 6A — Full API Contract & Type-Safety Audit (v4.6.0)

Verifikasi bahwa Phase 5B API types benar-benar digunakan through complete data flow:
`Backend API → API Response → apiAdmin() → Domain API module → Hook/Page → Component`

Dokumentasi lengkap: [`docs/FRONTEND_API_CONTRACT.md`](docs/FRONTEND_API_CONTRACT.md) · [`FRONTEND_AUDIT.md`](FRONTEND_AUDIT.md)

### Hasil Audit

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| Total `any` patterns | 1369 | 950 | 31% |
| `(data as any)` casts | 616 | 318 | 48% |
| TypeScript errors | 0 | 0 | — |
| Lint errors | 0 | 0 | — |

### Yang Dikerjakan

1. **Type definitions updated** — semua type di `frontend/src/types/api/` di-validasi terhadap actual backend route responses
2. **2 new type files** — `types/api/customer.ts` (Customer portal) dan `types/api/agent.ts` (Agent portal)
3. **API client generic fix** — `apiAdmin<T = any>` → `apiAdmin<T = unknown>` (force explicit typing)
4. **Endpoint fixes** — manual payment approve/reject (POST→PATCH), transactions path, settings endpoint, agent endpoints
5. **Top 20 pages fixed** — `(data as any)` casts removed dari dashboard, PPPoE, VPN, GenieACS, invoices, company, OLT, routers, keuangan, voucher, profiles, FreeRADIUS, payment-gateway, email settings, technicians
6. **API contract documentation** — `docs/FRONTEND_API_CONTRACT.md` dengan 34 endpoint documented

### Backend Issues Found (documented, NOT fixed)

7 backend issues ditemukan dan didocument di `docs/FRONTEND_API_CONTRACT.md`:
1. Missing: `DELETE /api/pppoe/users/bulk-delete`
2. Missing: `GET /api/invoices/[id]/pdf`
3. Missing: generic `/api/settings` endpoint
4. Missing: `/api/agent/me` and `/api/agent/vouchers` endpoints
5. Inconsistent response wrappers (`ok(data)` vs `{ success: true, data }`)
6. Inconsistent error shapes (`{ error }` vs `{ success: false, error }`)
7. Inconsistent pagination patterns (3 different shapes)

### Deployment

- **Commit**: `95bfa7e8`
- **VPS**: `192.168.54.129` — `https://radius.salfa.my.id`
- **PM2**: All 4 processes online (frontend, backend, cron, wa)
- **Health check**: Backend OK, Frontend 200, API 200 via domain

---


### IP Pool Management (`/api/v1/ippool`)

Dynamic IP allocation via FreeRADIUS `ippool` module — tidak perlu IP static per user.

| Endpoint | Method | Fungsi |
|----------|--------|--------|
| `/api/v1/ippool` | GET | List semua pool dengan summary |
| `/api/v1/ippool/stats` | GET | Statistik global (total, allocated, free, utilization) |
| `/api/v1/ippool/:name` | GET | Detail pool + recent allocations |
| `/api/v1/ippool` | POST | Create pool (pool_name, network, start, end) |
| `/api/v1/ippool/expand` | PUT | Expand pool dengan IP tambahan |
| `/api/v1/ippool` | DELETE | Hapus pool (hanya jika tidak ada allocation) |
| `/api/v1/ippool/mappings/list` | GET | List Pool-Name → group mappings |
| `/api/v1/ippool/mappings` | POST | Map pool ke RADIUS group |
| `/api/v1/ippool/mappings/:id` | DELETE | Hapus mapping |

**Seed IP Pool per speed tier:**
```bash
cd frontend && npx prisma db seed -- --ippool
# Creates: 10Mbps-Pool, 20Mbps-Pool, 30Mbps-Pool, 50Mbps-Pool
# Each: 1022 IPs (/22 subnet) + auto-mapped to RADIUS groups
```

### Data Usage Reporting (`/api/v1/data-usage`)

Bandwidth tracking per user per period — diadopsi dari FreeRADIUS `process-radacct.sql`.

| Endpoint | Method | Fungsi |
|----------|--------|--------|
| `/api/v1/data-usage` | GET | Bandwidth per user untuk date range |
| `/api/v1/data-usage/monthly` | GET | Monthly summary per user (sorted by usage) |
| `/api/v1/data-usage/top` | GET | Top bandwidth consumers |
| `/api/v1/data-usage/aggregate` | POST | Manual trigger aggregation |

**Cron:** Daily at 00:05 — aggregate `radacct` → `data_usage_by_period` table.

### Multi-NAS Isolation

Username isolation per-NAS untuk ISP dengan multiple router/MikroTik:
- Column `nas_identifier` di `radcheck`, `radreply`, `radusergroup`
- Auto-sync dari `pppoeUser.routerId` saat sync ke RADIUS
- Memungkinkan username yang sama di router berbeda tanpa konflik

### CUI (Chargeable User Identity)

Persistent user tracking across sessions/NAS untuk billing & audit:
- Table `cui` (FreeRADIUS `cui` module)
- Unique identifier per user+IP+MAC combination

---

## 🚀 Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16 (App Router, standalone output) — UI + NextAuth |
| Backend | Next.js 16 (App Router, standalone output) — API routes + Prisma + services |
| Cron | Separate tsx runner (PM2 fork, calls backend APIs) |
| Language | TypeScript (shared types via @salfanet/shared-types) |
| Styling | Tailwind CSS |
| Database | MySQL 8.0 + Prisma ORM |
| RADIUS | FreeRADIUS 3.0.26 |
| Process Manager | PM2 (4 processes) |
| Reverse Proxy | Nginx (`/api/auth/*` → frontend, `/api/*` → backend, `/` → frontend) |
| Session Tracking | FreeRADIUS radacct + MikroTik /ppp/active (realtime polling) |
| Maps | Leaflet / OpenStreetMap |
| Package Manager | pnpm (monorepo workspaces) |

---

## 📁 Project Structure

```
salfanet-radius/                  # pnpm monorepo root
├── frontend/                     # Next.js — UI + NextAuth (port 3000)
│   ├── src/
│   │   ├── app/                  # Admin, agent, customer, technician portals
│   │   │   └── api/auth/         # NextAuth routes only
│   │   ├── components/           # Shared React components
│   │   ├── features/             # Vertical slices (queries, schemas)
│   │   ├── lib/api-client.ts     # Centralized API client (→ backend port 3001)
│   │   ├── locales/              # i18n (id, en)
│   │   └── hooks/                # React hooks (usePermissions, useTranslation, etc.)
│   ├── scripts/postbuild.js      # Copy static assets to standalone (monorepo)
│   └── package.json
├── backend/                      # Next.js — API + Prisma + services (port 3001)
│   ├── src/
│   │   ├── app/api/              # API route handlers (/api/pppoe, /api/invoices, etc.)
│   │   ├── server/               # Services (mikrotik, radius, cron, pppoe, billing)
│   │   │   ├── services/mikrotik/  # MikroTik API integration
│   │   │   ├── cron/               # Cron job logic
│   │   │   └── db/client.ts        # Prisma client
│   │   └── lib/api-response.ts    # Standard API response helpers
│   ├── prisma/                   # Prisma schema + migrations + seeds
│   ├── freeradius-config/        # FreeRADIUS config templates
│   ├── scripts/postbuild.js      # Copy static assets to standalone (monorepo)
│   ├── cron-runner.ts            # Standalone cron runner entry point
│   └── package.json
├── packages/                     # Shared TypeScript types
│   └── shared-types/
├── deploy/                       # Deployment configuration
│   ├── ecosystem.config.js       # PM2 config (4 processes: frontend, backend, cron, wa)
│   ├── nginx-salfanet.conf       # Nginx reverse proxy (2-app routing)
│   └── README.md
├── docs/                         # Documentation
├── frontend/vps-install/         # VPS installer scripts (installer, updater, uninstaller)
├── frontend/production/          # Production deployment configs
└── pnpm-workspace.yaml
```

---

## ⚙️ Installation

### Metode 1 — Git Clone (Recommended)

```bash
ssh root@YOUR_VPS_IP

git clone https://github.com/s4lfanet/salfanet-radius.git /root/salfanet-radius
cd /root/salfanet-radius
bash frontend/vps-install/vps-installer.sh
```

Installer akan berjalan **interaktif** — mendeteksi environment otomatis, memandu konfigurasi, lalu menjalankan semua step.

---

### Metode 2 — Upload Manual via SCP (Tanpa Akses Internet di Server)

```bash
# Jalankan di terminal LOKAL (bukan di server)
scp -r ./salfanet-radius root@YOUR_VPS_IP:/root/salfanet-radius

# SSH ke server, lalu jalankan installer
ssh root@YOUR_VPS_IP
cd /root/salfanet-radius
bash frontend/vps-install/vps-installer.sh
```

---

### Environment yang Didukung

| Environment | Flag | Akses |
|------------|------|-------|
| **Public VPS** (DigitalOcean, Vultr, Hetzner, AWS) | `--env vps` | Internet |
| **Proxmox LXC** | `--env lxc` | LAN/VLAN |
| **Proxmox VM / VirtualBox** | `--env vm` | LAN |
| **Bare Metal / Server Fisik** | `--env bare` | LAN |

```bash
# Contoh: paksa environment + IP
bash frontend/vps-install/vps-installer.sh --env lxc --ip 192.168.1.50
```

---

### Updating Existing Installation

Cara paling aman. **Semua data upload (logo, foto KTP pelanggan, bukti bayar) otomatis dipreservasi.**

```bash
bash /var/www/salfanet-radius/frontend/vps-install/updater.sh
```

Atau update dari branch terbaru secara manual:

```bash
cd /var/www/salfanet-radius
git pull origin master
pnpm install
cd backend && npx prisma generate && npx prisma db push && cd ..
cd frontend && npx prisma generate && cd ..
# Build both apps
cd backend && NODE_OPTIONS='--max-old-space-size=1536' npx next build && node scripts/postbuild.js && cd ..
cd frontend && NODE_OPTIONS='--max-old-space-size=1536' npx next build && node scripts/postbuild.js && cd ..
# Restart PM2
pm2 restart salfanet-frontend salfanet-backend salfanet-cron --update-env
```

Lihat detail lengkap di [vps-install/README.md](vps-install/README.md).

---

### Data yang Aman Saat Update

| Data | Status |
|------|--------|
| Logo perusahaan (`public/uploads/logos/`) | ✅ Dipreservasi |
| Foto KTP & dokumen pelanggan | ✅ Dipreservasi |
| Bukti pembayaran | ✅ Dipreservasi |
| File `.env` (database, secrets) | ✅ Tidak disentuh |
| **Database MySQL (semua data pelanggan)** | ✅ Tidak disentuh |

---

### Default Credentials

| | |
|--|--|
| Admin URL | `http://YOUR_VPS_IP/admin/login` |
| Username | `superadmin` |
| Password | `admin123` |

⚠️ **Ganti password segera setelah login pertama!**

---

## 🔌 FreeRADIUS

Key config files at `/etc/freeradius/3.0/`:

| File | Purpose |
|------|---------|
| `mods-enabled/sql` | MySQL connection for user auth |
| `mods-enabled/rest` | REST API for voucher management |
| `sites-enabled/default` | Main auth logic (PPPoE realm support) |
| `clients.conf` | NAS/router clients (+ `$INCLUDE clients.d/`) |
| `sites-enabled/coa` | CoA/Disconnect-Request virtual server |

Config backup in `freeradius-config/` is auto-deployed by the installer.

### Auth Flow

**PPPoE:** `MikroTik → FreeRADIUS → MySQL (radcheck/radusergroup/radgroupreply)` → Access-Accept with Mikrotik-Rate-Limit

**Hotspot Voucher:** Same RADIUS path + `REST /api/radius/post-auth` → sets firstLoginAt, expiresAt, syncs keuangan

### RADIUS Tables

| Table | Purpose |
|-------|---------|
| `radcheck` | User credentials |
| `radreply` | User-specific reply attrs |
| `radusergroup` | User → Group mapping |
| `radgroupreply` | Group reply (bandwidth, session timeout) |
| `radacct` | Session accounting |
| `nas` | NAS/Router clients (dynamic) |

---

## ⏰ Cron Jobs (16 automated)

| Job | Schedule | Function |
|-----|----------|----------|
| Voucher Sync | Every 5 min | Sync voucher status with RADIUS |
| Disconnect Sessions | Every 5 min | CoA disconnect expired vouchers |
| Auto Isolir (PPPoE) | Every hour | Suspend overdue customers |
| FreeRADIUS Health | Every 5 min | Auto-restart if down |
| PPPoE Session Sync | Every 10 min | Sync radacct sessions |
| Agent Sales | Daily 1 AM | Update sales statistics |
| Invoice Generate | Daily 2 AM | Generate monthly invoices |
| Activity Log Cleanup | Daily 2 AM | Delete logs >30 days |
| Invoice Reminder | Daily 8 AM | Send payment reminders |
| Invoice Status | Daily 9 AM | Mark overdue invoices |
| Notification Check | Every 10 min | Process notification queue |
| Auto Renewal | Daily 8 AM | Prepaid auto-renew from balance |
| Webhook Log Cleanup | Daily 3 AM | Delete webhook logs >30 days |
| Session Monitor | Every 5 min | Security session monitoring |
| Cron History Cleanup | Daily 4 AM | Keep last 50 per job type |
| Suspend Check | Every hour | Activate/restore suspend requests |

All jobs can be triggered manually from **Settings → Cron** in the admin panel.

---

## 📱 Android APK Builder

Buat APK Android (WebView wrapper) untuk 4 portal langsung di server VPS — tanpa GitHub Actions, tanpa Android Studio.

### 1) Setup Android SDK (satu kali via SSH)

```bash
apt-get update && apt-get install -y openjdk-17-jdk wget unzip && \
mkdir -p /opt/android/cmdline-tools && \
wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O /tmp/cmdtools.zip && \
unzip -q /tmp/cmdtools.zip -d /opt/android/cmdline-tools && \
mv /opt/android/cmdline-tools/cmdline-tools /opt/android/cmdline-tools/latest && \
yes | /opt/android/cmdline-tools/latest/bin/sdkmanager --licenses && \
/opt/android/cmdline-tools/latest/bin/sdkmanager "platforms;android-34" "build-tools;34.0.0" && \
echo 'export ANDROID_HOME=/opt/android' >> /etc/environment && \
echo 'Selesai!'
```

> **Perkiraan waktu:** ~5–10 menit (download ~500MB). Disk yang dibutuhkan: ~2GB.

### 2) Build APK via Admin Panel

Buka **Admin → Download Aplikasi Android** → klik **Build APK** pada role yang diinginkan.

- Build berjalan di background (tidak timeout meski butuh beberapa menit)
- Status diperbarui otomatis setiap 3 detik
- Setelah selesai, tombol **Download APK** muncul

### 3) Build via API (opsional)

```bash
# Cek environment
curl http://YOUR_VPS/api/admin/apk/trigger

# Mulai build (role: admin | customer | technician | agent)
curl -X POST http://YOUR_VPS/api/admin/apk/trigger?role=customer \
  -H "Cookie: next-auth.session-token=..."

# Cek status
curl http://YOUR_VPS/api/admin/apk/status?role=customer

# Download APK
curl -OJ http://YOUR_VPS/api/admin/apk/file?role=customer \
  -H "Cookie: next-auth.session-token=..."
```

### Storage APK

| Path | Keterangan |
|------|------------|
| `/var/data/salfanet/apk/{role}/app.apk` | File APK hasil build |
| `/var/data/salfanet/apk/{role}/status.json` | Status & metadata build |
| `/var/data/salfanet/apk/{role}/build.log` | Log Gradle |
| `/var/data/salfanet/gradle-cache` | Cache Gradle (mempercepat build berikutnya) |

### Paket Aplikasi

| Role | Package ID | Warna |
|------|-----------|-------|
| Admin | `net.salfanet.admin` | Biru |
| Customer | `net.salfanet.customer` | Cyan |
| Technician | `net.salfanet.technician` | Hijau |
| Agent | `net.salfanet.agent` | Ungu |

---

## 🛠️ Common Commands

```bash
# PM2
pm2 status
pm2 logs salfanet-frontend --lines 50
pm2 logs salfanet-backend --lines 50
pm2 logs salfanet-cron --lines 50
pm2 restart salfanet-frontend salfanet-backend salfanet-cron --update-env

# FreeRADIUS
systemctl restart freeradius
freeradius -XC    # Test config
radtest 'user@realm' password 127.0.0.1 0 testing123

# Database
mysql -u salfanet_user -psalfanetradius123 salfanet_radius
mysqldump -u salfanet_user -psalfanetradius123 salfanet_radius > backup.sql

# Build (manual)
cd /var/www/salfanet-radius
cd backend && npx prisma generate && NODE_OPTIONS='--max-old-space-size=1536' npx next build && node scripts/postbuild.js && cd ..
cd frontend && NODE_OPTIONS='--max-old-space-size=1536' npx next build && node scripts/postbuild.js && cd ..
pm2 restart salfanet-frontend salfanet-backend --update-env
```

---

## 🧯 Troubleshooting Cepat

### 1) Website tidak bisa diakses dari IP VPS

Jika `Nginx` dan app sudah jalan di server tapi dari internet tetap tidak bisa akses, biasanya masalah ada di layer jaringan (NAT/forwarding/firewall external), bukan di aplikasi.

```bash
# Di VM/VPS guest
ss -tulpn | grep -E ':80|:443|:3000|:3001'
curl -I http://127.0.0.1:3000   # frontend
curl -I http://127.0.0.1:3001   # backend
curl http://127.0.0.1:3001/api/health  # backend health check
curl -I http://127.0.0.1
systemctl status nginx --no-pager
pm2 status
```

Jika semua check local di atas OK, cek mapping di host Proxmox/router/cloud firewall:

1. `Public:2020 -> VM:22` (SSH)
2. `Public:80 -> VM:80` (HTTP)
3. `Public:443 -> VM:443` (HTTPS)

Catatan: `IP:2020` adalah port SSH, bukan URL web aplikasi.

### 2) PM2 jalan tapi web tetap blank/error

```bash
pm2 status
pm2 logs salfanet-frontend --lines 100
pm2 logs salfanet-backend --lines 100
cd /var/www/salfanet-radius
# Rebuild both apps
cd backend && NODE_OPTIONS='--max-old-space-size=1536' npx next build && node scripts/postbuild.js && cd ..
cd frontend && NODE_OPTIONS='--max-old-space-size=1536' npx next build && node scripts/postbuild.js && cd ..
pm2 restart salfanet-frontend salfanet-backend --update-env
```

### 3) API returns 404 (route not found)

Pastikan nginx routing benar — `/api/auth/*` → frontend (3000), `/api/*` → backend (3001):

```bash
nginx -T 2>&1 | grep -A2 'location.*api'
# Should show:
#   location /api/auth/  → proxy_pass http://127.0.0.1:3000
#   location /api/       → proxy_pass http://127.0.0.1:3001
```

### 4) Jalankan diagnosa Nginx otomatis dari installer

Installer Nginx terbaru menambahkan self-check internal (`127.0.0.1:3000`, `127.0.0.1`) dan best-effort check publik (HTTP/HTTPS).

```bash
cd /var/www/salfanet-radius
bash vps-install/install-nginx.sh
```

Jika warning menunjukkan HTTP publik tidak reachable, fokus perbaikan di NAT/port-forward/security-group, bukan di Next.js.

---

## 🔐 Security

```bash
# Firewall
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 8080/tcp
ufw allow 1812/udp && ufw allow 1813/udp && ufw allow 3799/udp
```

1. Change default admin password on first login
2. Change MySQL passwords in `.env`
3. Configure SSL (Let's Encrypt or Cloudflare)
4. Enable UFW

---

## 📡 CoA (Change of Authorization)

Sends real-time speed/disconnect commands to MikroTik without dropping PPPoE connections.

**MikroTik requirement:** `/radius incoming set accept=yes port=3799`

**API:** `POST /api/radius/coa` — actions: `disconnect`, `update`, `sync-profile`, `test`

Auto-triggered when: PPPoE profile speed is edited (syncs all active sessions).

---

## 📲 WhatsApp Providers

| Provider | Base URL | Auth |
|----------|----------|------|
| Fonnte | `https://api.fonnte.com/send` | Token |
| WAHA | `http://IP:PORT` | API Key |
| GOWA | `http://IP:PORT` | `user:pass` |
| MPWA | `http://IP:PORT` | API Key |
| Wablas | `https://pati.wablas.com` | Token |

---

## ⏱️ Timezone

| Layer | Timezone | Note |
|-------|----------|------|
| Database (Prisma) | UTC | Prisma default |
| FreeRADIUS | WIB (UTC+7) | Server local time |
| PM2 env | WIB | `TZ: 'Asia/Jakarta'` in ecosystem.config.js |
| API / Frontend | WIB | Auto-converts UTC ↔ WIB |

For WITA (UTC+8) or WIT (UTC+9): change `TZ` in `.env`, `ecosystem.config.js`, and `src/lib/timezone.ts`.

---

## 📋 Admin Modules

Dashboard · PPPoE · Hotspot · Agent · Invoice · Payment · Keuangan · Sessions · WhatsApp · Network (OLT/ODC/ODP) · GenieACS · Settings

**Roles:** SUPER_ADMIN · FINANCE · CUSTOMER_SERVICE · TECHNICIAN · MARKETING · VIEWER

---

## 🟢 Realtime Online/Offline Status

Status online/offline pelanggan PPPoE di admin page (`/admin/pppoe/users`) diperbarui otomatis setiap **10 detik** tanpa reload halaman.

**Cara kerja:**
1. Frontend polling `GET /api/pppoe/users/online-status` setiap 10 detik
2. Backend cek `radacct` (RADIUS users) + MikroTik `/ppp/active` (local users)
3. Frontend update `isOnline` field hanya jika ada perubahan (cegah unnecessary re-render)
4. Badge **"Live"** dengan indikator pulse di filter Sesi

**Endpoint:** `GET /api/pppoe/users/online-status?usernames=user1,user2,...`

Response:
```json
{ "online": ["user1", "user3"], "onlineCount": 2, "total": 5, "timestamp": "..." }
```

---

## 🔧 PPPoE Reconnect Setelah Payment

Saat pelanggan isolir dilunaskan (manual atau auto-renewal), sistem otomatis:

1. Update status user → `active`
2. Restore RADIUS `radcheck` (password) + `radusergroup` (profile group) dengan `nas_identifier`
3. Hapus entry isolir dari `radreply`
4. Restore `Framed-IP-Address` jika user punya IP static
5. Restore MikroTik PPP secret: enable + set profile ke group user (bukan `isolir`)
6. Kick session lama via MikroTik + RADIUS CoA disconnect
7. User reconnect otomatis dengan profile yang benar

**FreeRADIUS config penting:**
- `rest` module → `connect_uri = "http://localhost:3001"` (backend, bukan frontend)
- `sqlippool`, `sql`, `cuisql` di post-auth → non-fatal (`-` prefix) agar auth tetap berhasil jika pool gagal

---

## 📝 Changelog

Bagian ini otomatis sinkron dari `CHANGELOG.md` saat file changelog berubah di GitHub.

<!-- AUTO-CHANGELOG:START -->

### v5.12.0 — 2026-08-17 — QRIS Mandiri Payment, Auto-Update System, Installer & Cloudflare Tunnel Fixes

### Summary
Batch fitur dan fix: implementasi QRIS Mandiri payment gateway (static-to-dynamic QRIS + Android listener), sistem auto-update dari admin panel (changelog + git pull + build + PM2 restart), auto-version dari git commit count, fix port 8080 UFW di semua installer scripts, fix cloudflare tunnel nginx port switching, dan fix installer seed exit code masking.

### QRIS Mandiri Payment Gateway
- **[FEATURE]** Implementasi QRIS Mandiri (qris_own) — konversi static QRIS ke dynamic QRIS dengan amount unik per invoice (TLV parser, CRC16 EMVCo standard)
- **[FEATURE]** Android QrisListener app support — webhook `/api/payment/qris-notify` menerima notifikasi pembayaran dari Android listener
- **[FEATURE]** QRIS test simulation endpoint `/api/payment/qris-test` untuk testing tanpa Android app
- **[FEATURE]** QRIS status polling endpoint `/api/payment/qris-status` untuk cek status pembayaran
- **[FEATURE]** QRIS Mandiri tab di admin payment-gateway page — konfigurasi static code, merchant name, device key, test simulation
- **[FEATURE]** `qris.ts` utility library — validateQris, staticToDynamic, generateUniqueAmount (deterministic suffix 1-999 dari MD5 hash invoice ID)
- **[FEATURE]** QrisPending model di Prisma schema untuk tracking pending QRIS payments
- **[FEATURE]** QRIS fields di company model: qrisStaticCode, qrisMerchantName, qrisEnabled, qrisDeviceKey

### Auto-Update System
- **[FEATURE]** Backend API `/api/admin/system/changelog` (GET) — fetch git log antara local vs remote commit sebagai changelog
- **[FEATURE]** Backend API `/api/admin/system/changelog` (POST) — execute update: git pull, prisma db push, pnpm install + build (backend & frontend), PM2 restart semua service, dengan step-by-step progress reporting
- **[FEATURE]** Frontend admin/system page — tombol "Lihat Changelog" dan "Update Sekarang" dengan konfirmasi dan progress display
- **[FEATURE]** Auto-version dari git commit count — version format `2.35.0+1398` (base version + total commits), tidak perlu manual update package.json
- **[FEATURE]** System info API sekarang return gitBranch, totalCommits, behindCount, baseVersion

### Installer Fixes
- **[FIX]** Port 8080 ditambahkan ke UFW rules di semua installer scripts (install-nginx.sh, common.sh, install-security.sh, install-wizard.html, README.md) — Cloudflare tunnel menggunakan port 8080
- **[FIX]** `seed_database` pipe-to-tee masks exit code — gunakan PIPESTATUS untuk real exit code detection
- **[FIX]** Cloudflare tunnel `switch_nginx_port` regex tidak handle `[::]:80` dan `default_server` format — fix regex pattern

### Commits
- `6f46dcf2` — feat: implement QRIS Mandiri payment gateway
- `597e3790` — fix: add port 8080 to UFW firewall rules in all installer scripts
- `01147df8` — feat: add auto-changelog and manual update from admin/system page
- `788ee001` — fix: showConfirm signature and regex flag for TS compatibility
- `fde04827` — feat: auto-version from git commit count + show branch, total commits, behind count
- `3b9a4e9c` — fix: installer seed_database pipe-to-tee masks exit code
- `da73801a` — fix: cloudflare tunnel switch_nginx_port regex
- `a90bb57a` — chore: remove debug scripts from repo

---

### v5.11.0 — 2026-08-16 — MikroTik Local-Auth Sync, Realtime Status, MAC Cleanup & Installer Fixes

### Summary
Batch fix untuk sinkronisasi MikroTik local-auth (isolir profile, password, active sessions), realtime status polling di halaman pelanggan, hapus placeholder MAC address, fix 429 rate limit, dan perbaikan kritis path di installer/uninstaller/updater scripts.

### MikroTik Local-Auth Fixes
- **[CRITICAL]** Isolir profile ditimpa oleh `sync_mikrotik_create` task — task menggunakan profile dari DB (PAKET 100MBPS) alih-alih `isolir`. Fix: cek status user terbaru dari DB sebelum eksekusi task, override profile ke `isolir` jika status=`isolated`.
- **[CRITICAL]** Isolated user di-disable (`disabled=true`) — SALAH. Isolated user harus tetap enabled agar bisa login dan dapat isolir profile. Fix: hanya `stop`/`blocked` yang di-disable.
- **[FIX]** Empty password dari form edit menimpa PPP secret MikroTik dengan password kosong. Fix: truthy check sebelum kirim password ke MikroTik.
- **[FIX]** Isolir pada local-auth router tidak update PPP secret profile — hanya kick session. Fix: `enable`/`disable` action juga update profile saat provided.
- **[FIX]** MikroTik API calls fire-and-forget causing race condition. Fix: await semua MikroTik operations dalam urutan yang benar (update secret → kick session).

### Active Sessions untuk Local-Auth Routers
- **[FEATURE]** Dashboard dan halaman sessions sekarang menampilkan active sessions dari MikroTik `/ppp/active` untuk local-auth routers (sebelumnya hanya dari `radacct`).
- **[FEATURE]** PPPoE online/offline status polling dari MikroTik `/ppp/active` untuk non-RADIUS routers.
- **[FEATURE]** Hotspot active sessions dari MikroTik untuk local-auth routers.
- **[FIX]** `listPppActive()` tidak lagi menelan error — throw agar cron skip cycle instead of false-closing sessions.
- **[FIX]** `iconv-lite` ditambahkan ke `serverExternalPackages` untuk Next.js standalone deployment.

### Realtime Status Polling
- **[FEATURE]** Halaman data pelanggan sekarang polling status (isolated/active/stop/blocked) setiap 10 detik tanpa reload halaman. Sebelumnya status hanya update saat manual refresh.
- **[FEATURE]** Endpoint `/api/pppoe/users/online-status` sekarang return `statusMap` (username → status) bersamaan dengan online set.

### MAC Address Cleanup
- **[FIX]** Placeholder MAC addresses (`00:00:00:00:00:00`, `AA:BB:CC:DD:EE:FF`, dll) tidak lagi disimpan di database. Validasi `isPlaceholderMac()` menolak MAC placeholder saat create/update user.
- **[FIX]** ARP service tidak lagi default ke `00:00:00:00:00:00` saat MAC kosong — MikroTik menerima ARP entry tanpa MAC.
- **[FIX]** Cleanup script untuk set placeholder MAC yang sudah ada di DB ke `null`.

### Rate Limit Fix
- **[FIX]** `/api/company/info` return 429 Too Many Requests setelah navigasi normal. Fix: naikkan rate limit dari `relaxed` (100/min) ke `veryRelaxed` (500/min), tambah Cache-Control header, dan throttle frontend fetch ke 5 menit.

### Auth Mode & Connection Type Migration
- **[FEATURE]** Support perubahan authMode router (radius → local) dengan auto-create PPP secrets dari existing customer data.
- **[FEATURE]** Support perubahan connectionType customer (PPPoE → Static IP / Hotspot) dengan cleanup MikroTik entries lama.
- **[FIX]** CoA disconnect untuk kick session lama saat authMode atau connectionType berubah.

### Customer Delete Fix
- **[FIX]** Delete customer tidak mengirim password konfirmasi ke backend. Fix: frontend DELETE helper sekarang mengirim `{ confirmPassword }`.
- **[FIX]** `external_task.id` dan `entity_id` terlalu pendek untuk composite IDs. Fix: widen ke `VARCHAR(191)`.

### Installer/Updater/Uninstaller Fixes
- **[CRITICAL]** `updater.sh` line 318: `apply_sql_migrations || true ────` punya trailing dashes yang menyebabkan bash syntax error. Fix: hapus trailing dashes.
- **[CRITICAL]** `updater.sh`: 15 referensi path `$APP_DIR/vps-install/` SALAH — seharusnya `$APP_DIR/frontend/vps-install/`. Post-update steps untuk auth fix, security, VPN, WireGuard, dan L2TP silently skipped karena path tidak ditemukan. Fix: semua path diperbaiki.
- **[FIX]** `vps-uninstaller.sh`: reinstall instruction menunjuk ke `/root/SALFANET-RADIUS-main/vps-install` (legacy). Fix: `/root/salfanet-radius/frontend/vps-install`.

### Commits
- `e612ed42` — fix: remove default/placeholder MAC addresses from customer data
- `f12eccef` — feat: realtime status (isolated/active/stop) polling on customer page
- `4d5046c5` — fix: sync_mikrotik_create task overwrites isolir profile with original package
- `c8b42f4c` — fix: resolve 429 Too Many Requests on /api/company/info
- `c91165de` — fix: isolir on local-auth routers — update PPP secret profile + await MikroTik calls
- `8306a0b2` — feat: show MikroTik local-auth active sessions on dashboard & sessions page
- `b5a26caf` — fix: prevent empty password from overwriting MikroTik PPP secret
- `c111a9d8` — fix: use sync_mikrotik_create (upsert) + CoA disconnect on authMode & connectionType change
- `6b11f5fa` — feat: support connectionType change & authMode migration with MikroTik sync
- `75c7fc70` — fix: delete customer — send confirmPassword to backend

---

### v5.7.0 — 2026-08-15 — Fix: Diskon Pelanggan Tidak Diterapkan ke Tagihan

### Summary
Bug kritis: diskon pelanggan (field `discount` di `PppoeUser`) hanya diterapkan pada cron monthly invoice generation (postpaid) dan first invoice saat create customer. 5 path lain tidak mengurangi diskon dari base price, menyebabkan tagihan tidak sesuai dengan diskon yang sudah di-set di form tambah/edit pelanggan.

### Root Cause
Pattern yang benar (sudah ada di cron monthly + first invoice):
```ts
const baseAmount = Math.max(0, profile.price - (user.discount || 0));
```

Pattern yang salah (5 path lain, tidak mengurangi diskon):
```ts
const baseAmount = profile.price;  // BUG: tidak - user.discount
```

### Fixed Paths (5 bug)
1. **Customer renewal API** (`/api/customer/renewal`) — perpanjangan dari customer portal
2. **Admin renewal API** (`/api/admin/users/[id]/renewal`) — perpanjangan dari admin panel
3. **PREPAID auto-renewal cron** (`invoice-jobs.ts`) — auto-renewal dari balance prepaid
4. **Admin extend route** (`/api/pppoe/users/[id]/extend`) — perpanjangan langsung dari admin
5. **Admin invoices/generate** (`/api/invoices/generate`) — generate invoice manual dari admin

### Already Working (tidak diubah)
- Cron monthly invoice generation (postpaid) — sudah apply diskon
- First invoice saat create customer — sudah apply diskon
- Save diskon di form tambah pelanggan — sudah berfungsi
- Save diskon di form edit pelanggan (UserDetailModal) — sudah berfungsi

### Commits
- `2b55e056` — fix(billing): apply customer discount to all invoice generation paths

---

### v5.6.0 — 2026-08-15 — Frontend Performance Optimization + Auto-Changelog Fix

### Summary
Frontend performance optimization pass: remove dead dependency, code-split heavy chart library, fix broken auto-changelog script path.

### Performance Optimizations
- **[REMOVED]** `sweetalert2` dari `dependencies` — dead dependency, sudah diganti CyberToast bridge (`@/lib/sweetalert`). Reduce install size ~150KB.
- **[MOVED]** `@types/leaflet` dari `dependencies` ke `devDependencies` — type-only package, tidak perlu di production deps.
- **[CODE-SPLIT]** `recharts` (~400KB) sebelumnya static import di `components/charts/index.tsx` → sekarang dynamic import via `next/dynamic` dengan `ssr: false`. recharts hanya loaded saat chart components dibutuhkan (dashboard/analitik pages), tidak di initial bundle untuk non-chart pages.
  - Split: `charts/RechartsComponents.tsx` (internal, recharts imports) + `charts/index.tsx` (public API, dynamic load)
  - Non-recharts components (`ChartCard`, `TopRevenueSources`) tetap static export

### Auto-Changelog Fix
- **[FIXED]** `sync-readme-changelog.mjs` dipindah dari `backend/scripts/` ke root `scripts/` — GitHub Action (`sync-readme-changelog.yml`) memanggil `node scripts/sync-readme-changelog.mjs` dari repo root, tapi file ada di `backend/scripts/` setelah monorepo restructure. Auto-sync README changelog sekarang berfungsi lagi.
- **[VERIFIED]** Script berjalan sukses dari root: `node scripts/sync-readme-changelog.mjs` → "README.md updated from CHANGELOG.md"

### Build Performance
- Compile: 11.2s (Turbopack, sebelumnya 13.0s) — 14% faster
- TypeScript: 6.2s
- Total: ~18s
- Bundle: 8,863 KB (257 files) — recharts sekarang di separate chunk (443 KB), hanya loaded on-demand

### Commits
- `9464c61d` — perf: remove dead sweetalert2 dep, move @types/leaflet to devDeps, dynamic import recharts, fix auto-changelog script path

---

### v5.5.0 — 2026-08-15 — Active Session Sync Fix + Frontend Audit (Responsive + Accessibility + Nav)

### Summary
Dua kategori perbaikan: (1) Critical fix untuk sync active session MikroTik → web (mismatch status aktif), dan (2) Frontend audit menyeluruh untuk responsive, accessibility, loading/error state, dan menu navigation consistency across all 4 role layouts.

### Active Session Sync Fix (CRITICAL)
- **[CRITICAL]** `listPppActive()` sebelumnya menelan error MikroTik API dan return empty Set → cron menganggap semua session stale dan menutupnya. Fix: sekarang throw error pada failure, sehingga cron skip cycle instead of false-closing sessions.
- **[CRITICAL]** `iconv-lite` tidak tersedia di Next.js standalone deployment → semua MikroTik API calls gagal. Fix: tambah `iconv-lite` ke `serverExternalPackages`, copy ke standalone `node_modules` di postbuild.

### Frontend Audit — Responsive Fixes
- Fixed `grid-cols-N` tanpa mobile prefixes → `grid-cols-1/2 sm:grid-cols-N` di ~20+ pages:
  - Referral stats, agent/technician login cards, technician isolated stats
  - Splitter loss metrics dan ports, port selection dialogs
  - User installation-photo grids, OLT tabs, GenieACS stats
  - Hotspot agent/voucher report stats, IP pool, data usage cards
  - PPPoE installation photos, SMTP settings, WhatsApp summaries
  - Customer top-up payment methods, VPN status summaries
  - Invoice generation results, Splitter/ODP/ODC diagrams
  - Fiber cable presets, VPN client pool summaries
- Added `overflow-x-auto` wrappers untuk tables yang bisa overflow di small screens:
  - `admin/genieacs/files/page.tsx`
  - `admin/genieacs/devices/[deviceId]/page.tsx`

### Frontend Audit — Loading/Error State
- Created route-level `loading.tsx` dan `error.tsx` untuk `/app/agent/` (sebelumnya missing)
- Loading: centered `Loader2` spinner + "Memuat..."
- Error: client component, logs error, generic Indonesian message, "Coba Lagi" + link ke `/agent`, shows error digest

### Frontend Audit — Accessibility & Navigation
- Added `aria-label` ke icon-only close buttons di semua 4 layout (Admin, Agent, Customer, Technician)
- Added `aria-label` ke mobile menu/hamburger buttons where missing
- Added `aria-expanded` ke Admin category dan submenu toggle buttons
- Added `aria-label="X navigation"` ke semua nav landmarks
- Increased close-button padding dari `p-1.5` → `p-2.5` untuk touch targets ≥44px
- Fixed Admin submenu `max-h-96` → `max-h-[500px]` untuk accommodate GenieACS group (11 children)
- Verified route-change sidebar closing behavior di semua layout
- Verified semua 4 layout menggunakan single source of truth untuk menu (no desktop/mobile duplication)

### Performance Audit Findings
- Build: 13s compile + 5.6s TypeScript = ~20s total (Next.js 16 Turbopack)
- Bundle: 8.8 MB total static (257 files), largest JS chunk 409 KB, largest CSS 539 KB (Tailwind v4)
- Heavy deps properly code-split: `jspdf`, `xlsx`, `leaflet` menggunakan dynamic `await import()`
- `sweetalert2` di `package.json` tapi TIDAK di-import (sudah diganti CyberToast) — dead dependency
- `recharts` statically imported di `components/charts/index.tsx` — bisa di-optimize dengan dynamic import tapi low priority

### Commits
- `076501c0` — fix(critical): listPppActive must throw on error, not return empty Set
- `54b45403` — fix: add iconv-lite to serverExternalPackages for standalone build
- `432e3593` — fix: copy iconv-lite to standalone node_modules in postbuild
- `fa9ddd1f` — fix: copy iconv-lite from pnpm store to standalone node_modules
- `0b330fe1` — fix(frontend): responsive, accessibility, and loading/error state improvements
- `a13c609a` — fix(nav): menu navigation desktop/mobile audit - accessibility and UI fixes

---

<!-- AUTO-CHANGELOG:END -->

See full changelog: [CHANGELOG.md](CHANGELOG.md)

## 📚 Documentation

| File | Description |
|------|-------------|
| [docs/INSTALLATION-GUIDE.md](docs/INSTALLATION-GUIDE.md) | Complete VPS installation |
| [docs/GENIEACS-GUIDE.md](docs/GENIEACS-GUIDE.md) | GenieACS TR-069 setup & WiFi management |
| [docs/AGENT_DEPOSIT_SYSTEM.md](docs/AGENT_DEPOSIT_SYSTEM.md) | Agent balance & deposit |
| [docs/RADIUS-CONNECTIVITY.md](docs/RADIUS-CONNECTIVITY.md) | RADIUS architecture |
| [docs/FREERADIUS-SETUP.md](docs/FREERADIUS-SETUP.md) | FreeRADIUS configuration guide |

## 📝 License

MIT License - Free for commercial and personal use

## 👨‍💻 Development

Built with ❤️ for Indonesian ISPs

**Important**: Always use `formatWIB()` and `toWIB()` functions when displaying dates to users.
