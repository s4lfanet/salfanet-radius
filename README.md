# SALFANET RADIUS - Billing System for ISP/RTRW.NET

Modern, full-stack billing & RADIUS management system for ISP/RTRW.NET with FreeRADIUS integration supporting PPPoE and Hotspot authentication.

> **Architecture:** pnpm monorepo — **Two Next.js apps** (frontend UI + backend API) + Baileys WhatsApp service
> **Version:** 5.25.0 - Foto Tiket + PPPoE Online Teknisi + Build APK Native di GitHub

---

## 🎯 Features

| Category | Key Capabilities |
|----------|-----------------|
| **RADIUS / Auth** | FreeRADIUS 3.0.26, PAP/CHAP/MS-CHAP, VPN L2TP/IPSec, PPPoE & Hotspot, CoA real-time speed/disconnect, **IP Pool management**, **Multi-NAS isolation** |
| **VPN Management** | MikroTik CHR via API, VPS built-in WireGuard & L2TP/IPsec peer management, configurable IP pool & gateway per protocol, auto-generated RouterOS scripts |
| **PPPoE Management** | Customer accounts, profile-based bandwidth, isolation, IP assignment, MikroTik auto-sync, foto KTP+instalasi via kamera HP, GPS otomatis, **realtime online/offline status (polling 10s)**, **realtime status isolir/aktif (polling 10s)**, **PSB wizard 3-step (adopt dari home.pmynet.id)**, **true optimistic update (reactivate/delete instant)**, **placeholder MAC rejection** |
| **IP Pool** | RADIUS ippool module — dynamic IP allocation per speed tier, pool create/expand/delete, Pool-Name → group mapping, utilization stats |
| **Hotspot Voucher** | 8 code types, batch up to 25,000, agent distribution, auto-sync with RADIUS, print templates, **MikroTik local-only mode** (voucher sync via RouterOS API, `salfanet:` comment marker, batch cleanup, cron status sync), **Rekap Voucher** (laporan penjualan per hari/minggu/bulan, filter by agent & profile, export Excel, rincian per hari, pendapatan per agent — support both RADIUS & local NAS via `firstLoginAt`) |
| **Billing** | Postpaid/prepaid invoices, auto-generation, payment reminders, balance/deposit, auto-renewal |
| **Payment** | Manual upload (bukti transfer), **QRIS Mandiri** (QR dinamis + listener), Midtrans/Xendit/Duitku/**Tripay** gateway, approval workflow, 0–5 bank accounts, halaman bayar publik `/pay/[token]` |
| **Notifications** | WhatsApp (Fonnte/WAHA/GOWA/MPWA/Wablas/WABlast/**Kirimi.id**/**Baileys native**), Email SMTP, broadcast (outage/invoice/payment), webhook pesan masuk, **Telegram** (backup DB terjadwal + bot 2-arah untuk teknisi: cek redaman/pelanggan) |
| **Agent/Reseller** | Balance-based voucher generation, commission tracking, sales stats |
| **Financial** | Income/expense tracking with categories, keuangan reconciliation |
| **Network (FTTH)** | OLT multi-vendor (ZTE/Huawei/FiberHome/BDCOM/Hioso/Raisecom) via SNMP+Telnet+SSH, ONU discovery/register/reboot/config (dry-run preview + commit), ODC/ODP/fiber inventory & trace, network map, **OLT poll + low-signal & mass-outage alert per PON**, **ACS RX/offline alert via GenieACS** |
| **GenieACS TR-069** | CPE/ONT management, WiFi config (SSID/password), device status & uptime |
| **Isolation** | Auto-isolate expired customers, customizable WhatsApp/Email/HTML landing page templates, **fallback MikroTik API kick saat radacct kosong**, **HOTSPOT local mode isolation/reactivation** (manageHotspotUser enable/disable + kick), **connectionType-aware reactivation** (PPPoE & Hotspot) di semua route (webhook, mark-paid, status, bulk-status, extend) |
| **Cron Jobs** | 27 automated background jobs (tsx runner via PM2 fork), history, distributed locking, manual trigger, **auto-close orphaned/stale sessions** |
| **Roles & Permissions** | 53 permissions, 6 portals (Admin/Customer/Agent/Technician/Collector + SuperAdmin) |
| **Activity Log** | Audit trail with auto-cleanup (30 days) |
| **Security** | Session timeout 30 min, idle warning, RBAC, HTTPS/SSL |
| **Performance** | **Redis cache untuk data non-realtime** (profiles, areas, routers), graceful degradation jika Redis unavailable |
| **Auth Modes** | `local` (MikroTik primary) dan `radius` (FreeRADIUS primary, PPP secret backup disabled). **Auto-migrate radius → local: create PPP secrets from existing customer data + disconnect RADIUS sessions**. **Migrate local → radius: one-click bulk sync all users to RADIUS tables + disable PPP secrets + CoA kick + reload FreeRADIUS**. **Bulk re-sync RADIUS** (fix out-of-sync data tanpa ubah authMode). **hybrid mode obsolete** |
| **RADIUS Setup** | Auto-generated RouterOS script pakai **IP asli VPS** (bukan domain/Cloudflare proxy), VPN-specific address selection |
| **Bahasa** | Bahasa Indonesia (full) |
| **PWA** | Installable di semua portal (admin, customer, agent, technician), offline fallback, service worker cache |
| **Web Push** | VAPID-based browser push notifications, one shared sidebar subscribe/unsubscribe toggle across all portals (admin, agent, technician, customer, collector), admin broadcast with role targeting (customer/agent/technician/admin/all), cron-triggered push (invoice reminder, auto-isolir, auto-renewal), server-side read state for customer and collector notifications. Collector subscriptions have their own table, apart from the admin one |
| **Collector Portal** | Portal kolektor berbasis wilayah tugas (area dan/atau router/NAS): ringkasan per bulan, tagihan (tandai lunas tunai/transfer + bukti), pelanggan dengan status pembayaran, peta dan detail GPS, Telepon/WhatsApp, isolir, setoran, koleksi, bukti transfer, cabut ONT, lonceng notifikasi dengan status baca dan web push. Admin: Setoran Kolektor sebagai daftar pembayaran dengan konfirmasi per baris atau massal |
| **Mobile App** | Native Flutter customer app (`mobile/customer_app/`) — WiFi control, invoice, payment, tickets with photos, push via FCM — and staff app (`mobile/admin_app/`). Built per deployment, see [docs/BUILD-APK.md](docs/BUILD-APK.md) |
| **WhatsApp Baileys** | Native WhatsApp gateway built-in VPS via `@whiskeysockets/baileys`, PM2 proses terpisah, scan QR langsung di admin panel, auto-reconnect |

---

## 📱 Mobile App (Flutter, native Android)

Source: `mobile/customer_app/`. Same customer-facing feature set as the web portal,
talking to the same `backend/src/app/api/customer/*` API. Every install runs on its
own domain (no hard-coded host — configurable in-app), and every install needs its
own Firebase project for push notifications.

A second native app for staff lives in `mobile/admin_app/` (customers, invoices, Kasir QRIS,
network map, in-app guides, quick actions; menus follow each account's role). Both apps can
update themselves from the APK uploaded in the web panel (Build APK).

- **Build a release APK for your own deployment**: [`docs/BUILD-APK.md`](docs/BUILD-APK.md) —
  your own Firebase project, signing keystore, `flutter build apk --split-per-abi`, or the
  manual GitHub Actions workflow **Build Native APKs** (signing and `google-services.json`
  come from repository secrets; APKs are published to the `apk-latest` release)
- **Run it in development**: [`mobile/customer_app/README.md`](mobile/customer_app/README.md)
- **Enable push notifications (FCM)**: [`mobile/customer_app/FIREBASE_SETUP.md`](mobile/customer_app/FIREBASE_SETUP.md)
  — creating the Firebase project, `google-services.json`, the backend's service
  account key, and how to verify each side actually works. Neither credential is
  ever committed to this repo.

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

## � Auth Modes: Local vs RADIUS (v5.20.0)

Setiap router/NAS punya dua mode autentikasi yang bisa dipilih di halaman Router settings:

| Mode | `authMode` | Sumber Auth | PPP Secret di MikroTik | RADIUS Tables |
|------|-----------|-------------|------------------------|---------------|
| **Local** | `local` | MikroTik PPP secret (primary) | Aktif | Backup (selalu di-sync tapi tidak dipakai untuk auth) |
| **RADIUS** | `radius` | FreeRADIUS (primary) | Disabled (backup) | Aktif (primary auth source) |

### Cara Migrasi Local → RADIUS

1. **Pastikan MikroTik sudah dikonfigurasi sebagai RADIUS client** — jalankan "Setup RADIUS" di halaman Router untuk generate script RouterOS
2. **Klik tombol "Migrate to RADIUS"** (ikon panah kuning) di router card — hanya muncul saat `authMode = local`
3. Sistem otomatis:
   - Ubah `router.authMode` → `radius`
   - Re-sync SEMUA pelanggan ke RADIUS tables (`radcheck`, `radusergroup`, `radreply`)
   - Disable PPP secrets di MikroTik (sebagai backup)
   - Reload FreeRADIUS
   - CoA disconnect semua sesi aktif (pelanggan re-auth via RADIUS)

### Re-sync RADIUS (Tanpa Ubah AuthMode)

Jika data RADIUS tidak sinkron dengan database (misalnya setelah restore atau manual edit):
- Klik tombol **"Re-sync RADIUS"** (ikon refresh cyan) di router card
- Sistem akan re-sync semua pelanggan ke RADIUS tables tanpa mengubah authMode

### Bulk Edit Pelanggan

Di halaman Data Pelanggan, select multiple pelanggan via checkbox, lalu klik tombol **"Edit"** (biru) di bulk action bar untuk mengubah massal:
- **Router/NAS** — pindah router (otomatis sync RADIUS + MikroTik secret + CoA)
- **Hari Tagihan** — tanggal jatuh tempo bulanan (1-28) untuk POSTPAID
- **Auto Isolasi** — aktif/nonaktifkan auto-isolasi saat jatuh tempo

## �📋 Frontend Audit & Centralized API Migration (v4.4.0)

Migrasi frontend dari inline `fetch()` ke **centralized API client** (`@/lib/api`) untuk semua halaman admin. Frontend sekarang **UI-only** — tidak ada direct Prisma/DB/MikroTik/SSH/FreeRADIUS access.

Dokumentasi lengkap: [`FRONTEND_AUDIT.md`](./frontend/FRONTEND_AUDIT.md) · [`CHANGELOG.md`](CHANGELOG.md)

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

Dokumentasi lengkap: [`FRONTEND_AUDIT.md`](./frontend/FRONTEND_AUDIT.md)

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

Dokumentasi lengkap: [`FRONTEND_AUDIT.md`](./frontend/FRONTEND_AUDIT.md)

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

Dokumentasi lengkap: [`FRONTEND_AUDIT.md`](./frontend/FRONTEND_AUDIT.md) · [`docs/TYPE_SAFETY_EXCEPTIONS.md`](docs/TYPE_SAFETY_EXCEPTIONS.md)

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

Dokumentasi lengkap: [`FRONTEND_AUDIT.md`](./frontend/FRONTEND_AUDIT.md)

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

Dokumentasi lengkap: [`docs/FRONTEND_API_CONTRACT.md`](docs/FRONTEND_API_CONTRACT.md) · [`FRONTEND_AUDIT.md`](./frontend/FRONTEND_AUDIT.md)

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


### IP Pool Management (`/api/admin/ippool`)

Dynamic IP allocation via FreeRADIUS `ippool` module — tidak perlu IP static per user.

| Endpoint | Method | Fungsi |
|----------|--------|--------|
| `/api/admin/ippool` | GET | List semua pool dengan summary |
| `/api/admin/ippool/stats` | GET | Statistik global (total, allocated, free, utilization) |
| `/api/admin/ippool/:name` | GET | Detail pool + recent allocations |
| `/api/admin/ippool` | POST | Create pool (pool_name, network, start, end) |
| `/api/admin/ippool/expand` | PUT | Expand pool dengan IP tambahan |
| `/api/admin/ippool` | DELETE | Hapus pool (hanya jika tidak ada allocation) |
| `/api/admin/ippool/mappings/list` | GET | List Pool-Name → group mappings |
| `/api/admin/ippool/mappings` | POST | Map pool ke RADIUS group |
| `/api/admin/ippool/mappings/:id` | DELETE | Hapus mapping |

**Seed IP Pool per speed tier:**
```bash
cd frontend && npx prisma db seed -- --ippool
# Creates: 10Mbps-Pool, 20Mbps-Pool, 30Mbps-Pool, 50Mbps-Pool
# Each: 1022 IPs (/22 subnet) + auto-mapped to RADIUS groups
```

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

## 🏦 Collector Portal (v5.24.0)

Portal untuk kolektor (petugas tagihan lapangan). Aksesnya mengikuti **wilayah tugas** yang ditetapkan admin di Kelola Kolektor: satu area, satu atau beberapa router/NAS, atau keduanya. Kolektor tanpa area dan NAS tidak melihat data apa pun.

### Halaman

| Halaman | Fungsi |
|---------|--------|
| **Ringkasan** | Tagihan per bulan (bulan lalu dan bulan depan bisa dibuka), total belum dibayar dan sudah lunas, setoran bulan ini, filter area dan router/NAS |
| **Tagihan** | Tabel pelanggan dengan invoice yang bisa dibuka. Tandai lunas tunai atau transfer (bukti transfer dikompres otomatis), janji bayar, kirim bukti lunas lewat WhatsApp, cetak ke printer Bluetooth |
| **Pelanggan** | Semua pelanggan di wilayah tugas: tabel yang bisa diurutkan, status pembayaran (Lunas, Belum lunas, Terlambat) dengan filter, tampilan Daftar atau Peta, detail pelanggan dengan GPS, pratinjau peta, dan navigasi Google Maps, tombol Telepon dan WhatsApp (pesan pengingat tagihan sudah terisi) |
| **Pelanggan Isolir** | Pelanggan terisolir dengan jumlah tagihan, aksi tagih dan catat cabut ONT |
| **Setoran Saya** | Pembayaran yang dicatat per hari atau per rentang tanggal, tunai dan transfer, dan status konfirmasi admin |
| **Koleksi Saya** | Riwayat 6 bulan terakhir per bulan dan transaksi terbaru |
| **Bukti Transfer** | Bukti transfer pelanggan di wilayah tugas dan hasil pemeriksaan admin |
| **Cabut ONT** | Riwayat perangkat yang dicabut dari pelanggan isolir |
| **Lonceng** | Notifikasi dengan status baca (klik untuk membaca, Tandai semua dibaca) dan web push |

Notifikasi: setoran dikonfirmasi atau dibatalkan, bukti transfer disetujui atau ditolak, pembayaran dicatat admin ke kolektor, tiket ditugaskan. Web push butuh HTTPS dan kunci VAPID di `.env` backend; tombol Aktifkan ada di banner halaman, sidebar, dan panel lonceng, dan menjelaskan alasannya bila perangkat tidak bisa push.

### Admin

- **Kelola Kolektor**: tambah, edit, hapus (kolektor yang pernah menagih hanya bisa dinonaktifkan), area opsional, pilihan beberapa router/NAS, alamat login dengan tombol salin
- **Setoran Kolektor**: satu daftar semua pembayaran kolektor (pelanggan, kolektor, invoice, tunai atau transfer, bukti, status). Konfirmasi per baris, atau centang beberapa dan konfirmasi sekaligus; mode harian dan rentang tanggal
- **Tagihan, Tandai Lunas**: bisa memilih kolektor yang menerima uang dan metodenya, supaya masuk ke setorannya. Invoice lunas yang tidak dimiliki kolektor tampil di Setoran Kolektor dan bisa dicatat ke kolektor

### API Endpoints

| Endpoint | Method | Fungsi |
|----------|--------|--------|
| `/api/collector/auth/login` | POST | Login kolektor (cookie `collector-token`) |
| `/api/collector/auth/session` | GET | Sesi, wilayah tugas, pilihan filter |
| `/api/collector/dashboard` | GET | Ringkasan per bulan (`period`, `areaId`, `routerId`) |
| `/api/collector/users` | GET | Pelanggan di wilayah tugas dengan status pembayaran (filter unpaid/all/paid) |
| `/api/collector/isolir` | GET | Pelanggan isolir di wilayah tugas |
| `/api/collector/mark-paid` | POST | Tandai invoice lunas, tunai atau transfer dengan bukti |
| `/api/collector/ont-removals` | GET/POST | Catatan cabut ONT |
| `/api/collector/proofs` | GET | Bukti transfer di wilayah tugas |
| `/api/collector/my-collections` | GET | Riwayat koleksi kolektor |
| `/api/collector/my-settlements` | GET | Setoran harian, dan `/range` untuk rentang tanggal |
| `/api/collector/notifications` | GET/POST | Daftar notifikasi, tandai dibaca (`ids` atau `all`) |
| `/api/push/collector-subscribe` | POST | Daftarkan web push kolektor (`collector-unsubscribe` untuk mencabut) |
| `/api/collector/list` | GET | Daftar kolektor (admin) |
| `/api/collector/setoran` | GET | Setoran semua kolektor per hari (`date`) atau rentang (`from`, `to`) (admin) |
| `/api/collector/setoran/confirm` | POST | Konfirmasi atau batalkan beberapa pembayaran (`invoiceIds`, `confirm`) (admin) |
| `/api/collector/setoran/unassigned` | GET/POST | Invoice lunas tanpa kolektor, dan mencatatnya ke kolektor (admin) |
| `/api/collector/setoran/collectors` | GET | Kolektor aktif untuk pilihan penerima uang (admin) |
| `/api/collector/confirm-settlement` | POST/DELETE | Konfirmasi atau batalkan setoran satu hari (dipakai aplikasi admin) |

### Keamanan

- Sesi kolektor memakai cookie JWT terpisah dari sesi admin, dan akun dicek ke database di setiap permintaan (aktif dan role COLLECTOR)
- Setiap rute memeriksa wilayah tugas (area dan router/NAS) di sisi server, termasuk tandai lunas, janji bayar, kirim invoice, dan PDF invoice
- Setoran dan konfirmasi di admin memakai izin `keuangan.view` dan `keuangan.edit`
- Langganan web push kolektor disimpan di tabel sendiri, terpisah dari langganan admin
- Bukti transfer disimpan sebagai base64 (MediumText) di DB dan diperiksa admin di Verifikasi Bukti Transfer

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
│   │   ├── app/                  # Admin, agent, customer, technician, collector portals
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
├── mobile/                       # Native Flutter apps
│   ├── customer_app/             # Customer portal app (payment, WiFi, tickets, FCM)
│   └── admin_app/                # Staff app (customers, invoices, Kasir QRIS, map)
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

Lihat detail lengkap di [vps-install/README.md](./frontend/vps-install/README.md).

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

## ⏰ Cron Jobs (27 automated)

Dijalankan oleh `cron-runner.ts` (PM2 `salfanet-cron`). Jadwal bawaan bisa diubah, job bisa diaktif/nonaktifkan, dan semua job bisa dipicu manual dari **Settings → Cron** di panel admin. Detail lengkap: [docs/features/CRON-SYSTEM.md](docs/features/CRON-SYSTEM.md)

| Job | Schedule | Function |
|-----|----------|----------|
| Hotspot Sync | Every minute | Sync voucher hotspot aktif/kedaluwarsa |
| External Task Processor | Every minute | Antrean tugas keluar (MikroTik, WhatsApp, email, CoA) |
| Agent Sales | Every 5 min | Catat penjualan voucher agent |
| Disconnect Sessions | Every 5 min | CoA disconnect pelanggan isolir/stop |
| PPPoE Session Sync | Every 5 min | Sync sesi PPPoE MikroTik ke radacct |
| RADIUS Sync Retry | Every 5 min | Ulangi sync FreeRADIUS yang gagal (backoff) |
| FreeRADIUS Health | Every 5 min | Auto-restart if down |
| Hotspot Voucher Sync | Every 5 min | Status voucher dari router local-only |
| OLT Poll | Every 5 min | Polling semua OLT (status, ONU, RX power, alert) |
| Telegram Backup | Every 5 min | Backup DB ke Telegram sesuai jadwal pengaturan |
| ACS Alert | Every 3 min | RX degradation & ONU offline via GenieACS |
| Session Monitor | Every 15 min | Security session monitoring |
| Auto Isolir (PPPoE) | Every hour | Isolir pelanggan prepaid kedaluwarsa |
| Invoice Reminder | Every hour | Reminder invoice (kirim sesuai jam di pengaturan) |
| Invoice Status | Every hour | PENDING → OVERDUE setelah jatuh tempo |
| Suspend Check | Every hour | Activate/restore suspend requests |
| Notification Check | Every 6 hours | Notifikasi admin (invoice telat, expired, pendaftaran) |
| Activity Log Cleanup | Daily 2 AM | Log >30 hari + notifikasi kolektor lama |
| Webhook Log Cleanup | Daily 3 AM | Delete webhook logs >7 days |
| RADIUS Auth Log Cleanup | Daily 3:30 AM | Hapus radpostauth >30 hari (per batch) |
| Cron History Cleanup | Daily 4 AM | Hapus cron history >30 hari |
| Financial Reconciliation | Daily 5 AM | Kecocokan invoice–payment, deteksi anomali |
| Auto Stop | Daily 5 AM | Stop pelanggan isolir >30 hari (**nonaktif bawaan**) |
| Invoice Auto-Cancel | Daily 6 AM | Batalkan invoice basi (pelanggan sudah perpanjang) |
| RADIUS Reconciliation | Daily 6 AM | Selisih data SalfaNet ↔ FreeRADIUS |
| Invoice Generate | Daily 7 AM | Generate invoice bulanan (postpaid) |
| Auto Renewal | Daily 8 AM | Prepaid auto-renew dari saldo |

---

## 📱 Android APK Builder

Buat APK Android (WebView wrapper) untuk 4 portal langsung di server VPS — tanpa GitHub Actions, tanpa Android Studio. Logo perusahaan yang diupload di halaman Download APK otomatis digunakan sebagai ikon APK (server build maupun ZIP project).

APK **QRIS Listener** (standalone, untuk HP kasir) di-build dengan cara yang sama dari **Admin → Payment Gateway → tab QRIS Mandiri**; device key dan webhook server sudah terisi di APK.

> Aplikasi **native** Flutter (admin dan pelanggan) tidak di-build di sini — butuh Flutter SDK dan RAM besar. Pakai GitHub Actions atau build lokal, lihat [docs/BUILD-APK.md](docs/BUILD-APK.md).

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

# Mulai build (role: admin | customer | technician | agent | qris_listener)
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
bash frontend/vps-install/install-nginx.sh
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
| WABlast | `http://IP:PORT` | API Key |
| Kirimi.id | `https://api.kirimi.id` | Token/Secret |
| Baileys (native) | PM2 `salfanet-wa` (port 4000) | QR scan di admin panel |

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

Dashboard · PPPoE (users, customers, profiles, areas, addons) · Hotspot (voucher, e-voucher, agent, template, rekap) · Invoice · Payment (gateway, proofs, bank accounts, manual) · Keuangan · Laporan (invoice, payment, customer, per-paket) · Sessions · Tickets · Network (OLT/ODC/ODP, fiber, map, routers) · GenieACS · Agent · Collector (kelola & setoran) · Technician · WhatsApp · Notifications & Push · IP Pool · Referral · Settings (cron, telegram, email, security, isolation, Cloudflare tunnel) · System (update, logs, APK)

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

### v5.25.0 — 2026-10-27 - Foto Tiket + PPPoE Online Teknisi + Build APK Native di GitHub

### Summary
Rilis setelah 5.24.0 (20 commit). Tiket pelanggan dengan foto kini tersimpan dan fotonya tampil di admin, teknisi, dan kedua aplikasi. PPPoE Online teknisi hanya menampilkan pelanggan PPPoE yang terhubung lewat RADIUS, dengan pemakaian download dan upload live dari MikroTik. Toggle web push di sidebar sama di semua portal. APK QRIS Listener bisa di-build lagi, dan aplikasi native admin dan pelanggan di-build lewat GitHub Actions.

### Tiket
- **[FIX]** Pelanggan yang punya ID pelanggan gagal membuat tiket di aplikasi ("failed create ticket"): tiket disimpan dengan kode pelanggan, padahal kolomnya merujuk ke akun pelanggan. Daftar tiket pelanggan memfilter dengan nilai yang sama, sehingga tiketnya juga tidak muncul
- **[FIX]** Foto dari form tiket web pelanggan dan form tiket admin tidak pernah tersimpan: `POST /api/tickets` mengabaikan lampiran dan lokasi GPS. File sudah terunggah, tapi tidak terhubung ke tiket
- **[FEATURE]** Foto lampiran tampil di detail tiket admin, teknisi, aplikasi admin, dan aplikasi pelanggan. Ketuk foto untuk melihat penuh; PDF dibuka di aplikasi luar
- **[FIX]** Batas unggah lampiran tiket pelanggan naik dari 5 ke 20 file per menit, sehingga tiket dengan beberapa foto tidak tertolak

### Portal Teknisi
- **[FIX]** PPPoE Online ikut menampilkan sesi hotspot dan sesi lokal MikroTik. Kini hanya pelanggan PPPoE terdaftar yang sesinya tercatat di RADIUS, satu sesi per pelanggan
- **[FIX]** Pemakaian download dan upload tidak bertambah selama sesi berjalan, karena hanya dibaca dari radacct yang menunggu interim update. Admin dan teknisi kini memakai counter live dari MikroTik. Router dicari dari NAS IP sesi, jadi pelanggan yang belum ditetapkan routernya tetap terbaca
- **[FEATURE]** Menu Pelanggan Isolir di sidebar (halamannya sudah ada, tapi hanya bisa dibuka lewat URL)
- **[FEATURE]** Status pembayaran Belum Lunas dan Terlambat di daftar pelanggan, sama seperti portal kolektor
- **[UI]** Tambah pelanggan: tombol Selanjutnya dan Buat Pelanggan Baru nonaktif sampai data wajib terisi, dengan daftar field yang belum diisi. Tab Paket & Dokumen tidak bisa dibuka lebih dulu

### Web Push
- **[UI]** Toggle notifikasi push di sidebar sama di admin, agent, teknisi, pelanggan, dan kolektor: Notif Push: Aktif, Nonaktif, atau Diblokir, dengan alasan bila perangkat tidak mendukung
- **[FIX]** Portal teknisi mengirim ulang langganan push ke server setiap kali halaman dirender

### Keuangan
- **[FIX]** Menghapus tagihan, lunas maupun belum, kini juga menghapus transaksinya di Keuangan

### APK
- **[FEATURE]** Build APK QRIS Listener standalone kembali tersedia di tab QRIS Mandiri (Payment Gateway), dengan device key dan webhook server yang sudah terisi
- **[FEATURE]** Workflow GitHub Actions "Build Native APKs" untuk aplikasi admin dan pelanggan. Signing release dan `google-services.json` diambil dari repository secrets, APK dipecah per ABI (sekitar 20 MB, sebelumnya 61 MB), lalu diunggah ke release `apk-latest`
- **[DOCS]** `docs/BUILD-APK.md`: panduan build APK native untuk instalasi lain (project Firebase sendiri, keystore, build, update di aplikasi)
- **[CHORE]** Aplikasi admin naik ke 1.0.14 dan aplikasi pelanggan ke 1.1.9

### Updater
- **[FIX]** Backup sebelum update menyalin seluruh folder aplikasi, termasuk `node_modules` dan `.next` (sekitar 4 GB per backup), bila rsync tidak tersedia, sehingga disk VPS penuh. Kini memakai tar dengan pengecualian yang sama, atau dilewati bila keduanya tidak ada

### Catatan Pembaruan
- Tidak ada perubahan skema database
- Tiket yang dibuat sebelum rilis ini tidak punya foto, karena URL fotonya tidak pernah tersimpan
- Aplikasi pelanggan versi lama masih gagal membuat tiket. Pasang APK terbaru dari release `apk-latest`, atau terbitkan lewat Download APK agar aplikasi menawarkan update
- **[CHORE]** Bump versi root, frontend, dan backend ke 5.25.0

### v5.24.0 — 2026-10-25 - Portal Kolektor Baru + Setoran Per Pembayaran + Notifikasi dan Web Push Kolektor

### Summary
Rilis setelah 5.23.0 (63 commit). Portal kolektor dirancang ulang dan bekerja per area dan router/NAS yang ditetapkan admin. Setoran Kolektor di admin menjadi satu daftar pembayaran yang bisa dikonfirmasi satu per satu atau banyak sekaligus, dan Tagihan bisa mencatat kolektor yang menerima uang. Lonceng kolektor punya status baca dan web push yang benar-benar jalan. Teknisi masuk dengan username dan password. Pengingat tagihan WhatsApp, cron, dan push FCM diaudit dan diperbaiki, begitu juga akses per role, FreeRADIUS, dan installer. Aplikasi admin 1.0.13.

### Portal Kolektor
- **[FEATURE]** Wilayah tugas per kolektor: satu area, satu atau beberapa router/NAS, atau keduanya (Kelola Kolektor di web dan aplikasi admin). Pelanggan, tagihan, isolir, dashboard, bukti transfer, dan cabut ONT hanya dari wilayah itu; kolektor tanpa area dan NAS tidak melihat data. Beberapa kolektor bisa berbagi satu area dengan membaginya per NAS
- **[SECURITY]** Semua rute kolektor memeriksa wilayah tugas, termasuk tandai lunas, janji bayar, kirim invoice, dan PDF invoice
- **[FIX]** Menandai lunas dua kali bersamaan tidak lagi memperpanjang langganan dua kali
- **[FEATURE]** Dashboard per bulan (bulan lalu dan bulan depan), total tagihan per periode, dan filter area dan router/NAS yang selalu tampil bila kolektor punya area atau NAS
- **[UI]** Desain ulang: sidebar di desktop, bar bawah dan menu geser di HP, tabel di Pelanggan, Tagihan, Isolir, Setoran Saya, Koleksi Saya, dan Cabut ONT memakai lebar penuh, ukuran huruf sama dengan panel admin, aksi pada tagihan rata dan mudah ditekan, dan halaman login mengikuti portal peran lain
- **[FEATURE]** Daftar pelanggan seperti di admin: tabel yang bisa diurutkan, status pembayaran (Lunas, Belum lunas, Terlambat) dengan filter, tampilan Daftar atau Peta
- **[FEATURE]** Peta dan koordinat per pelanggan serta detail pelanggan (GPS, pratinjau OpenStreetMap, salin koordinat, navigasi Google Maps). Sama untuk portal teknisi, yang juga bisa mengubah lokasi pelanggan (Pilih di Peta atau GPS Otomatis)
- **[FEATURE]** Tombol Telepon dan WhatsApp berlabel; WhatsApp terbuka dengan pesan pengingat tagihan yang sudah terisi, memakai nama perusahaan dari pengaturan
- **[FIX]** Rekap Setoran Saya mengelompokkan hari memakai tanggal UTC, sehingga pembayaran pukul 00.00 sampai 06.59 WIB masuk ke hari sebelumnya. Hari kini mengikuti zona waktu perusahaan, sama dengan admin

### Notifikasi dan Web Push Kolektor
- **[FIX]** Lonceng menghitung ulang pembayaran dan tiket 24 jam terakhir tiap 30 detik tanpa status baca, sehingga tidak ada yang bisa dihapus dan entri yang sama terus kembali. Notifikasi kini disimpan dengan status baca: klik untuk membaca dan membuka halamannya, Tandai semua dibaca, dan badge hanya menghitung yang belum dibaca
- **[FEATURE]** Notifikasi baru untuk kolektor: setoran dikonfirmasi, konfirmasi setoran dibatalkan, bukti transfer disetujui atau ditolak (dengan alasan), pembayaran dicatat admin ke kolektor, dan tiket ditugaskan. Pembayaran yang dicatat kolektor sendiri tidak lagi memunculkan notifikasi
- **[FIX]** Web push tidak pernah terdaftar untuk kolektor: lonceng memakai jalur teknisi yang meminta sesi admin, dan kolektor memakai cookie sendiri (selalu 401). Kolektor kini punya jalur subscribe dan tabel langganan sendiri, terpisah dari tabel admin supaya siaran admin tidak sampai ke kolektor
- **[FEATURE]** Setiap notifikasi juga dikirim sebagai web push; lonceng langsung berubah bila push tiba saat portal terbuka
- **[FEATURE]** Tombol Aktifkan notifikasi terlihat: banner di halaman (bisa ditunda), baris di sidebar dan menu geser, dan panel lonceng. Bila perangkat tidak bisa push, alasannya tertulis (tanpa HTTPS, iPhone belum dipasang ke Layar Utama, browser tidak mendukung, izin diblokir, kunci VAPID belum diatur di server)
- **[CHORE]** Job pembersihan harian menghapus notifikasi kolektor yang sudah dibaca setelah 30 hari dan yang belum dibaca setelah 60 hari

### Setoran Kolektor (Admin)
- **[FIX]** Pembayaran yang ditandai lunas dari halaman Tagihan admin tidak pernah masuk Setoran Kolektor, karena hanya status yang dikirim, tanpa kolektor dan metode bayar. Dialog Tandai Lunas kini punya pilihan Diterima oleh (kolektor) dan metode Tunai atau Transfer
- **[FEATURE]** Invoice lunas yang tidak dimiliki kolektor mana pun tampil di panel tersendiri, dan bisa dicatat ke kolektor yang menerima uangnya (tidak bisa dipindah dari kolektor lain; pembayaran gateway dan transfer yang diajukan pelanggan tidak dimasukkan)
- **[UI]** Halaman dirombak menjadi satu daftar pembayaran: pelanggan (nama, ID, username, HP, alamat, area, paket), kolektor, invoice, metode Tunai atau Transfer, ada tidaknya bukti, jumlah, dan status. Ada ringkasan Belum dikonfirmasi, pencarian, filter kolektor, status, dan metode, serta tampilan kartu di HP
- **[FEATURE]** Konfirmasi per pembayaran: tombol Konfirmasi atau Batalkan di setiap baris, kotak centang dan pilih semua, lalu konfirmasi atau batalkan banyak pembayaran sekaligus (maksimal 500)
- **[FEATURE]** Mode Rentang tanggal berfungsi (sebelumnya hanya tulisan segera hadir), dan tanggal bisa digeser per hari
- **[FIX]** Setoran dan konfirmasi memakai izin keuangan.view dan keuangan.edit, bukan dua peran yang ditulis tetap; akun berizin lain sebelumnya melihat daftar kosong tanpa pesan. Kolektor nonaktif yang masih punya pembayaran tetap tampil
- **[CHORE]** Konfirmasi kini disimpan per pembayaran. Konfirmasi harian yang sudah ada, termasuk dari aplikasi admin, tetap berlaku untuk semua pembayaran di hari itu

### Teknisi, Staf dan Role
- **[FEATURE]** Teknisi masuk dengan username dan password seperti kolektor, diisi di Kelola Teknisi; teknisi yang belum punya password diberi tanda. Login OTP WhatsApp dihapus: nomor yang tidak terdaftar bisa membuat akun teknisi aktif, dan opsi OTP mati membuat nomor saja cukup untuk masuk
- **[FEATURE]** Kelola Teknisi dan Kelola Kolektor punya tombol Edit dan Hapus. Kolektor yang pernah menagih tidak bisa dihapus (nonaktifkan saja), karena rekap setoran akan kehilangan pembayarannya
- **[FIX]** Username kolektor dan teknisi tampil dan diinput tanpa tanda @
- **[FIX]** Menu dan akses per role sesuai yang bisa dipakai: Keuangan, Customer Service, dan Marketing sebelumnya melihat halaman yang ditolak API dan kehilangan halaman yang mereka butuhkan; staf bisa membaca izin miliknya sendiri; daftar router untuk peran pelanggan, voucher, dan hotspot tanpa kredensial; ekspor butuh izin
- **[FIX]** Portal teknisi dan kolektor: akses data, unggah foto, dan pesan tiket diperbaiki

### Pengingat Tagihan, Cron dan Push
- **[FIX]** Pengiriman WhatsApp yang gagal di semua provider dianggap berhasil oleh semua pemanggil, sehingga pengingat tagihan ditandai terkirim hari itu dan tidak dicoba lagi. Kegagalan kini dilaporkan dan dicoba lagi pada putaran berikutnya
- **[FIX]** Test manual Pengingat Invoice tidak menunggu jam kirim, dan hasilnya menjelaskan kenapa tidak ada yang terkirim: tidak ada invoice di hari pengingat, sudah dikirim hari ini, tanpa nomor HP, template nonaktif, provider gagal, atau invoice yang sudah lewat jatuh tempo tidak diingatkan karena tidak ada hari H+ di pengaturan
- **[FIX]** Job cron yang gagal dengan pesan kosong "HTTP request failed": runner kini terhubung ke 127.0.0.1, mencoba ulang sekali, dan mencatat kode error
- **[FIX]** Setiap job terjadwal tercatat dua kali di riwayat dan keduanya saling mengunci tabel (deadlock). Kini satu baris per run, baris yang tertinggal berstatus running dibereskan tiap 15 menit, dan nama job di riwayat memakai nama dari daftar server
- **[FIX]** Job Auto Stop dijadwalkan runner tetapi ditolak server, sehingga tidak pernah berjalan. Kini terdaftar di halaman Cron dalam keadaan nonaktif (menghentikan pelanggan yang terisolir lebih dari 30 hari), dan diaktifkan oleh admin
- **[FIX]** Push ke aplikasi pelanggan (FCM) tidak terkirim ke pelanggan yang hanya memakai aplikasi: pengiriman berhenti bila tidak ada langganan browser, dan kunci VAPID yang kosong ikut membatalkan push aplikasi

### Sistem, FreeRADIUS dan Installer
- **[FEATURE]** Panduan di panel: tombol Panduan di bilah atas membuka panduan halaman yang sedang dibuka, dan Pusat Panduan memuat urutan pengaturan awal serta semua panduan yang bisa dicari
- **[CHORE]** Pemakaian Data (web dan aplikasi) dihapus beserta API-nya: halaman itu menyebut agregasi harian yang tidak pernah ada, jadi hanya terisi setelah ditekan manual. Tabelnya dibiarkan
- **[FIX]** Log Autentikasi menampilkan waktu terlambat 7 jam dan hitungan hari ini mulai dari pukul 07.00 hari sebelumnya; kini mengikuti zona waktu perusahaan. Job baru `radpostauth_cleanup` menyimpan 30 hari log (tabelnya sempat mencapai 2,8 juta baris)
- **[FIX]** FreeRADIUS: hook REST menuju API (bukan frontend), sehingga akun diblokir atau kedaluwarsa kini ditolak dan voucher hotspot mendapat waktu login pertama dan masa berlaku; koneksi SQL diperbarui tiap jam sehingga login pertama setelah sepi tidak ditolak; salinan modul di `mods-enabled` ikut diperbaiki
- **[FIX]** PM2: backend tidak lagi dimatikan setiap menit yang sibuk (batas memori dinaikkan ke 768M, dipasang oleh `deploy/fix-pm2-limits.sh` dan updater)
- **[FIX]** Installer: instalasi baru dan uninstall berjalan tanpa macet (cron crash saat start, `clear` tanpa TERM, `pm2 delete` yang menggantung, password root MySQL salah), dan nginx menyajikan `/uploads/` dari folder unggahan sehingga foto bukti dan KTP tidak 404
- **[FIX]** Update Sekarang mengulang build satu kali dengan `.next/cache` kosong bila build gagal, karena cache yang rusak membuat build gagal dengan pesan modul font tidak ditemukan

### Aplikasi Admin Android
- **[FEATURE]** Pusat Panduan dan tombol Panduan per layar, Aksi Cepat di dashboard, dan menu yang ditampilkan menurut izin role
- **[FEATURE]** Username dan password teknisi, serta router/NAS pada kolektor, di Kelola Teknisi dan Kolektor
- **[CHORE]** Aplikasi admin naik ke 1.0.13

### Catatan Pembaruan
- Update Sekarang menjalankan `prisma db push` yang membuat tabel `collector_notifications` dan `collector_push_subscriptions` serta menambah kolom nullable (username dan password teknisi, router kolektor, dan konfirmasi setoran per invoice). Tidak ada data yang dihapus
- Web push butuh `VAPID_PUBLIC_KEY` dan `VAPID_PRIVATE_KEY` di `.env` backend (buat dengan `npx web-push generate-vapid-keys`), dan portal dibuka lewat HTTPS
- Teknisi lama harus diisi username dan password di Kelola Teknisi sebelum bisa masuk
- **[CHORE]** Bump versi root, frontend, dan backend ke 5.24.0

### v5.23.0 — 2026-10-20 - Bayar di Dalam Aplikasi + Update APK dari Aplikasi + Kasir QRIS di Aplikasi Admin + Peta Jaringan

### Summary
Rilis setelah 5.22.0 (27 commit). Pelanggan membayar tagihan, perpanjangan, top-up, dan upgrade paket tanpa keluar dari aplikasi. Aplikasi admin dan pelanggan bisa memperbarui dirinya sendiri dari APK yang diunggah di panel web. QRIS Listener kini bagian dari aplikasi admin (Kasir QRIS), aplikasi admin mendapat Peta Jaringan, backup otomatis Telegram benar-benar berjalan, backup dan restore FreeRADIUS diperbaiki dan diamankan, dan updater web tidak lagi gagal build. Aplikasi pelanggan 1.1.8, aplikasi admin 1.0.7.

### Pembayaran di Aplikasi Pelanggan
- **[FEATURE]** Bayar tagihan, perpanjangan, top-up saldo, dan upgrade paket di dalam aplikasi, tidak lagi dibuka di browser: QRIS lebih dulu, semua payment gateway yang aktif (dengan pilihan channel bila gateway menyediakannya), dan transfer manual
- **[FEATURE]** QRIS Mandiri native: QR dari server, nominal dengan kode unik dan tombol salin, hitung mundur, status langsung, QR bisa disimpan atau dibagikan untuk dibayar dari DANA atau m-banking di HP yang sama
- **[FEATURE]** Halaman checkout gateway di WebView dalam aplikasi; tautan e-wallet (GoPay, DANA, `intent://`) membuka aplikasi e-wallet, dan layar menutup sendiri saat gateway kembali ke situs operator
- **[FEATURE]** Transfer manual: rekening operator dengan tombol salin, data pengirim, dan foto bukti transfer
- **[FIX]** Memilih payment gateway tidak lagi error: batas minimum Rp 10.000 yang menolak tagihan kecil dihapus, channel hanya diminta dari Duitku dan Tripay, dan pesan error menampilkan alasan dari gateway
- **[FIX]** Tripay memakai channel yang dipilih pelanggan, bukan selalu QRIS
- **[FIX]** "Tautan pembayaran tagihan tidak valid" di aplikasi: endpoint lama yang membuat transaksi Midtrans setiap dipanggil dan menimpa link `/pay` tagihan kini hanya mengembalikan token tagihan, dan link yang tertimpa dipulihkan

### Update APK dari Dalam Aplikasi
- **[FEATURE]** Aplikasi admin dan pelanggan memeriksa versi terbaru saat dibuka, mengunduh APK di dalam aplikasi dengan progress, lalu membuka layar pasang Android; data dan login tetap tersimpan
- **[FEATURE]** Menu Pembaruan Aplikasi di kedua aplikasi: versi terpasang, versi di server, catatan rilis, dan tombol perbarui, dengan alasan bila versi tidak terbaca
- **[FEATURE]** Opsi Wajib Update: aplikasi di bawah build tertentu tidak bisa dipakai sebelum diperbarui
- **[FEATURE]** Panel Rilis APK di Build APK: Super Admin mengunggah APK pelanggan atau admin tanpa SSH, dengan catatan rilis
- **[SECURITY]** Unggahan APK dibaca nama paket, nomor build, dan sertifikat tanda tangannya; APK yang tertukar, ditandatangani kunci berbeda, atau nomor build-nya tidak lebih tinggi ditolak karena Android tidak akan memasangnya sebagai update
- **[FEATURE]** Link unduh aplikasi admin Android di halaman login admin; link unduh memakai id versi sehingga CDN selalu menyajikan file terbaru
- **[CHORE]** Build release memakai satu keystore tetap lewat `android/key.properties` (tidak masuk git)

### Aplikasi Admin Android
- **[FEATURE]** Kasir QRIS: QRIS Listener kini bagian dari aplikasi admin (application ID `id.my.salfa.admin_app`); build QRIS Listener terpisah di Build APK dihapus
- **[FIX]** Listener tidak membaca notifikasi milik aplikasinya sendiri, sehingga push "Pembayaran diterima" dari server tidak dilaporkan balik sebagai pembayaran baru
- **[FEATURE]** Peta Jaringan: OLT, ODC, ODP, OTB/Joint Closure, dan pelanggan berkoordinat, garis jalur kabel, filter per jenis, peta jalan atau satelit, lokasi saya, dan petunjuk arah ke Google Maps
- **[FEATURE]** Alamat login tiap portal dengan tombol salin di Staf & Tim, Teknisi Lapangan, dan Kolektor
- **[FIX]** Field angka bisa dikosongkan dan diketik ulang

### Staf, Teknisi & Kolektor
- **[FIX]** Satu tempat per jenis akun: kolektor hanya di Kelola Kolektor, teknisi hanya di Kelola Teknisi; Admin & Role untuk staf kantor
- **[FIX]** Akun teknisi lama (role TECHNICIAN di Admin & Role) bisa mengambil dan menyelesaikan work order serta mendaftarkan pelanggan, karena kini ditautkan ke data teknisi
- **[FIX]** Role bawaan yang tidak valid (OPERATOR) diganti CUSTOMER_SERVICE
- **[FEATURE]** Alamat login semua portal (admin, teknisi, kolektor, agen, pelanggan) dengan tombol salin di Admin & Role, Kelola Teknisi, dan Kelola Kolektor, mengikuti domain instalasi

### Backup & Restore
- **[FIX]** Backup otomatis Telegram benar-benar berjalan: jadwal di Pengaturan Telegram (harian, 12 jam, 6 jam, mingguan) sebelumnya tidak pernah dibaca. Job baru `telegram_backup` mengirim backup ke topic Backup, laporan kesehatan ke topic Health, menyimpan N backup terakhir, mengejar jadwal yang terlewat saat server mati, dan melaporkan kegagalan ke grup
- **[FIX]** Buat Backup FreeRADIUS tidak pernah berhasil karena script dicari di lokasi yang salah; arsip kini dibuat langsung oleh backend
- **[SECURITY]** Restore FreeRADIUS tidak lagi menjalankan shell dengan isi arsip (nama folder di arsip unggahan bisa menjalankan perintah sebagai root); symlink hanya dipulihkan bila menunjuk ke dalam folder config
- **[FIX]** Restore FreeRADIUS menyimpan config saat ini lebih dulu, memeriksa hasilnya dengan `freeradius -C`, dan mengembalikan config lama bila ditolak; login database dan alamat API server ini dipertahankan saat restore dari VPS lain; FreeRADIUS di-restart, bukan reload
- **[SECURITY]** Buat, unduh, unggah, dan restore backup FreeRADIUS khusus Super Admin
- **[FIX]** Arsip FreeRADIUS pindah ke `/var/data/salfanet/backups/freeradius`, aman dari `rsync --delete` saat deploy

### Pembaruan Sistem (Update dari Web)
- **[FIX]** Update Sekarang tidak lagi memakai `pnpm install --force` yang memasang binary untuk semua platform dan memenuhi disk
- **[FIX]** Update berhenti di awal dengan pesan jelas bila sisa disk kurang dari 3 GB
- **[FIX]** Build lewat web mengikuti `deploy.sh`: secret diambil dari file `.env`, heap 1,5 GB, dan `public/`, `.next/static`, `.env` disalin ke bundle standalone
- **[UI]** Bila update gagal, halaman Sistem menampilkan log terakhir

### Notifikasi & E-Voucher
- **[FIX]** Pengingat tagihan mengikuti pengaturannya: hari, jam kirim, jeda batch, dan urutan acak; H+1 dan H+3 bisa dipilih; WhatsApp, email, dan push satu jadwal, dan pengiriman gagal dicoba lagi
- **[FIX]** Setiap isolir diumumkan ke pelanggan
- **[FIX]** Link pembayaran dan kode voucher e-voucher sampai ke pembeli lewat WhatsApp dan email; beli dengan "Email saja" tidak lagi gagal; placeholder yang tidak dikenal tidak muncul ke pembeli
- **[FIX]** Link pembayaran e-voucher kedaluwarsa 24 jam sesuai pesan

### Web UI
- **[FIX]** Field angka di seluruh form bisa dikosongkan dan diketik ulang (komponen `NumberInput` menggantikan 143 field angka)
- **[UI]** Stat card dashboard lebih ringkas: judul huruf biasa, angka dan ikon lebih kecil
- **[UI]** Aplikasi admin dan pelanggan memakai warna brand apa adanya di atas permukaan abu netral

### Sistem
- **[CHORE]** Bump versi root, frontend, dan backend ke 5.23.0

### v5.22.0 — 2026-10-15 - QRIS Mandiri untuk Semua Transaksi + Aplikasi Admin & Pelanggan Native + Biaya Operasional

### Summary
Rilis besar setelah 5.21.0 (130 commit). QRIS Mandiri kini dipakai untuk semua jenis pembayaran dengan satu jalur pelunasan yang sama seperti payment gateway, QRIS Listener jauh lebih andal dan mengumumkan pembayaran dengan suara, aplikasi Android native untuk admin dan pelanggan (Flutter) dengan push FCM, halaman Biaya Operasional, perbaikan besar OLT ZTE dan GenieACS, serta sejumlah perbaikan keamanan.

### Pembayaran & QRIS Mandiri
- **[FEATURE]** QRIS Mandiri tersedia untuk tagihan, top-up saldo, pembelian voucher online, upgrade paket, dan deposit agen: QR dinamis dengan kode unik, berlaku 15 menit, halaman bayar `/pay/qris/{orderId}`
- **[FIX]** Pembayaran QRIS dilunasi lewat jalur yang sama dengan payment gateway (invoice, top-up, voucher, deposit agen), termasuk notifikasi dan pencatatan keuangan
- **[FIX]** Top-up pelanggan benar-benar menambah saldo
- **[SECURITY]** Notifikasi QRIS wajib bertanda tangan HMAC (Device Secret), dengan proteksi replay (nonce + jendela waktu 5 menit) dan perbandingan constant-time
- **[FIX]** Satu jalur pelunasan deposit agen; webhook deposit agen memakai handler webhook utama
- **[FIX]** Nomor pesanan voucher aman dari tabrakan (retry otomatis)
- **[FIX]** Midtrans yang mengarahkan browser ke URL webhook tidak lagi menghasilkan 405
- **[FIX]** Redirect pembayaran memakai domain publik, bukan origin proxy internal
- **[UI]** Device Key dan Device Secret QRIS terlihat di halaman Payment Gateway (salin, tampilkan/sembunyikan, buat secret baru)
- **[FEATURE]** Endpoint `qris-notify` menjawab GET dengan pesan status dan punya mode tes koneksi

### QRIS Listener (APK Android)
- **[FIX]** Notifikasi DANA ("Pembayaran Masuk", "Rp... diterima DANA Bisnis") tertangkap; judul notifikasi bergaya kini terbaca
- **[FIX]** Service tetap hidup: heartbeat tiap 5 menit, watchdog memaksa Android mengikat ulang listener yang dimatikan sistem, antrean kirim ulang saat server tidak terjangkau
- **[FIX]** Status "Aktif" dihitung dari heartbeat, bukan flag lama yang tetap "Terhubung" setelah service mati
- **[FEATURE]** Tombol Tes Koneksi Server untuk memeriksa Device Key dan Device Secret
- **[FEATURE]** Tombol Izinkan Autostart untuk Xiaomi, Oppo, Vivo, Realme, Huawei
- **[FEATURE]** Pembayaran diumumkan dengan suara Bahasa Indonesia ("Pembayaran DANA diterima, tiga ribu delapan puluh enam rupiah") lewat volume media, menggantikan nada alarm; bisa dimatikan dan dites
- **[FIX]** Build APK dari web: waktu build sesuai jam server, listener berhasil dikompilasi, pesan gagal lebih jelas

### Aplikasi Admin Android (Flutter, baru)
- **[FEATURE]** Aplikasi admin native di `mobile/admin_app` dengan tambah, ubah, hapus untuk semua modul admin web
- **[FEATURE]** Laporan, pelanggan terisolir, fiber trace, Biaya Operasional
- **[FEATURE]** Push notifikasi FCM untuk admin
- **[FIX]** Semua data termuat (paginasi penuh), bukan hanya halaman pertama
- **[UI]** Garis dan border lebih jelas, dashboard lebih lengkap, ikon aplikasi dari logo perusahaan
- **[UI]** Program referral bernama "Ajak Teman"
- **[FIX]** Layar yang tidak bisa di-scroll sampai bawah

### Aplikasi Pelanggan Android (Flutter, baru)
- **[FEATURE]** Aplikasi pelanggan native: tagihan, PDF invoice, tiket dengan GPS, branding operator dinamis, alamat server bisa diatur
- **[FEATURE]** Push notifikasi FCM yang bisa diketuk; broadcast admin dan statistik dashboard memakai FCM
- **[FEATURE]** Link unduh aplikasi Android di halaman login dan sidebar portal pelanggan

### Keuangan & Billing
- **[FEATURE]** Halaman Biaya Operasional (alat, bandwidth, gaji, dan lainnya) di web dan aplikasi admin
- **[FEATURE]** Laporan pendapatan per paket
- **[FIX]** Pelanggan prabayar tidak ditagih sebelum bulan expired-nya
- **[FEATURE]** Cron membatalkan otomatis tagihan basi untuk pelanggan yang sudah diperpanjang
- **[FIX]** Format nomor invoice seragam di seluruh sistem
- **[FEATURE]** Lokasi GPS dicatat pada janji bayar

### OLT & GenieACS
- **[FIX]** ZTE C320 V2.1: discovery SNMP per port, rumus RX power, status (termasuk Dying Gasp/LOS) dan jarak lewat Telnet
- **[FEATURE]** ZTE C320 V2.2: kesehatan chassis, TX power dan jarak ONU
- **[FIX]** Penomoran port PON, port uplink SMXA, slot uplink standby
- **[FIX]** OLT baru tidak lagi tertahan "Offline"; tes koneksi SNMP berfungsi; poller Telnet 3,1x lebih cepat
- **[FIX]** Jumlah ONU tidak lagi dobel karena baris unregistered lama; staf bisa menghapus baris basi
- **[UI]** Detail ONU didesain ulang berdasarkan kondisi ONU
- **[FIX]** GenieACS: band 2.4GHz ONT WiFi 6 tidak lagi hilang, field detail perangkat lintas vendor terisi, mode PON, RX power dan voltase di daftar
- **[SECURITY]** Peringatan NBI GenieACS tanpa autentikasi, dan port 7557 di-firewall otomatis oleh installer

### RADIUS & MikroTik
- **[FIX]** Status online, kesehatan RADIUS, IP/MAC sesi, dan error 500 pada detail
- **[FIX]** Sinkronisasi NAS-client FreeRADIUS tidak lagi terlewat, dengan fallback live ke MikroTik
- **[FIX]** Error socket RouterOS API tidak lagi menghentikan proses
- **[FIX]** Uptime dari router lebih dipercaya daripada radacct yang tidak lengkap

### Hotspot
- **[FEATURE]** Template voucher bawaan termasuk 50 dan 60 per A4, Kartu Standar 50 per A4, ganti warna satu klik

### Notifikasi
- **[FIX]** Notifikasi admin dan pelanggan terkirim di setiap jalur pelunasan pembayaran
- **[FIX]** Template pengingat, isolir, dan pembayaran berisi data pelanggan lengkap (paket, area, ID pelanggan)
- **[FIX]** Bel notifikasi teknisi dan kolektor tidak crash saat polling
- **[FEATURE]** Bot Telegram dua arah untuk teknisi (cek redaman, cek pelanggan)
- **[FEATURE]** Banner promo slideshow di dashboard pelanggan

### Keamanan
- **[SECURITY]** Patch dua celah RCE Next.js tanpa autentikasi; kerentanan dependensi 27 menjadi 0
- **[SECURITY]** Autentikasi wajib pada mutasi admin yang belum terlindungi, tiket, dan pesan tiket; hook RADIUS hanya dari localhost

### Web UI
- **[UI]** Latar logo login seragam di semua portal (tile putih solid di kedua tema, fallback ukuran sama)
- **[UI]** Komponen toggle seragam; perbaikan audit UI frontend
- **[FIX]** Padding bawah halaman admin dan kolektor

### Sistem
- **[FIX]** Versi aplikasi di web tidak lagi tertahan: file `VERSION` lama dari instalasi ZIP tidak menimpa versi yang lebih baru, folder aplikasi dicari dari lokasi server yang berjalan, dan endpoint health melaporkan versi yang sama
- **[CHORE]** Bump versi root, frontend, dan backend ke 5.22.0
- **[FIX]** Semua error typecheck backend dan frontend diselesaikan; lint backend berfungsi kembali

### v5.21.0 — 2026-09-15 — Hotspot Session Sync Fixes + Dashboard Log Centralization + Invoice/PWA Fixes

### Summary
Perbaikan besar pada sinkronisasi sesi hotspot voucher dengan RADIUS (ghost session, timeleft, expired voucher), sentralisasi log aktivitas/RADIUS/system status ke halaman terpisah, fix generate tagihan PREPAID per bulan, dan PWA icon otomatis dari company logo.

### Hotspot Voucher Session Sync
- **[CRITICAL]** Voucher EXPIRED masih terbaca online di monitoring — synthetic radacct tidak pernah ditutup
- **[FIX]** Cron menutup radacct voucher EXPIRED — voucher kadaluarsa hilang dari active session dan ditolak RADIUS
- **[FIX]** `pppoe_session_sync` salah menutup radacct voucher hotspot sebagai "stale"
- **[FIX]** Synthetic radacct hanya dibuat untuk voucher yang benar-benar terhubung di MikroTik active list
- **[FIX]** `timeleft` voucher dipertahankan saat migrasi RADIUS dan re-authentication — tidak reset ke validity penuh
- **[FIX]** Waiting voucher mendapat full profile validity sebagai `Session-Timeout`; active voucher memakai sisa waktu dari DB

### RADIUS & Session Monitoring
- **[FIX]** Bulk migrate/sync RADIUS sekarang benar-benar disable PPP secrets + sync profile attributes (radreply)
- **[FIX]** PPPoE active sessions tidak tampil di dashboard untuk router mode RADIUS
- **[FIX]** Uptime & start time FreeRADIUS salah parsing timezone WIB
- **[FIX]** Audit API role agent/technician/customer setelah migrasi RADIUS
- **[FEATURE]** RADIUS server memilih IP private/local VPS, bukan IP publik — NAS MikroTik dikenali FreeRADIUS

### Dashboard & Navigasi
- **[FEATURE]** Activity Log, RADIUS Auth Log, dan System Status dipindah dari dashboard ke halaman terpusat
- **[FEATURE]** Halaman baru `/admin/freeradius/auth-log` — log autentikasi RADIUS dari tabel `radpostauth` (stats accept/reject, filter, search, pagination)
- **[UI]** Kategori menu sidebar default expanded
- **[UI]** Menu Laporan dipindah ke kategori Keuangan, label diubah jadi "Export Data"
- **[CHORE]** Halaman analitik laporan dihapus — tidak relevan untuk perusahaan kecil

### Billing
- **[CRITICAL]** Generate tagihan PREPAID mengabaikan bulan target — `dueDate = user.expiredAt` mentah, sehingga generate Oktober membuat invoice due November dan generate November di-skip sebagai duplikat
- **[FIX]** PREPAID `dueDate` = tanggal expired di bulan target (manual generate + cron `invoice_generate`)
- **[FIX]** Filter bulan list invoice untuk tagihan belum bayar memakai `dueDate` (periode tagihan), bukan `createdAt`
- **[UI]** Setelah generate sukses, filter bulan otomatis pindah ke bulan target

### PWA
- **[FEATURE]** Icon PWA otomatis dari company logo — endpoint `/api/pwa/icon` resize logo via `sharp`
- **[FIX]** Logo tersimpan sebagai `/api/uploads/...` tidak dikenali resolver — selalu jatuh ke icon statis
- **[FEATURE]** Icon maskable (padding zona aman + background opak) dan apple-touch-icon 180px dinamis
- **[CHORE]** Bump service worker cache ke v30

### UI & Laporan
- **[UI]** Redesign modal Detail/Edit Pelanggan — seksi berkelompok (Akun & Koneksi, Data Pelanggan, Langganan & Tagihan, Dokumen, Pendaftaran), pill status, tab underline, footer sticky; hapus 60 override warna hardcoded yang rusak di dark mode
- **[FIX]** Background logo login semua role + sidebar jadi `bg-white/90` — logo gelap terlihat di kedua tema
- **[FIX]** Data laporan/export diterjemahkan ke Bahasa Indonesia (status invoice/pelanggan, tipe langganan, metode pembayaran)

### Cleanup
- **[CHORE]** Hapus konfigurasi AI agent, script debug, dan file non-production dari repo
- **[CHORE]** Bump root & frontend package.json version ke 5.21.0

<!-- AUTO-CHANGELOG:END -->

See full changelog: [CHANGELOG.md](CHANGELOG.md)

## 📚 Documentation

| File | Description |
|------|-------------|
| [docs/DOCS_INDEX.md](./docs/DOCS_INDEX.md) | Index of all documentation |
| [frontend/vps-install/README.md](./frontend/vps-install/README.md) | VPS installer: steps, environments, update, uninstall |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Architecture: apps, API, cron jobs, processes |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) | Development guide |
| [docs/features/CRON-SYSTEM.md](./docs/features/CRON-SYSTEM.md) | Cron jobs: runner, job list, history, manual runs |
| [docs/setup/FREERADIUS-SETUP.md](./docs/setup/FREERADIUS-SETUP.md) | FreeRADIUS configuration guide |
| [docs/features/GENIEACS-GUIDE.md](./docs/features/GENIEACS-GUIDE.md) | GenieACS TR-069 setup & WiFi management |
| [docs/billing/AGENT_DEPOSIT_SYSTEM.md](./docs/billing/AGENT_DEPOSIT_SYSTEM.md) | Agent balance & deposit |

## 📝 License

MIT License - Free for commercial and personal use

## 👨‍💻 Development

Built with ❤️ for Indonesian ISPs

**Important**: Always use `formatWIB()` and `toWIB()` functions when displaying dates to users.
