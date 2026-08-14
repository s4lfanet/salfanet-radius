# SALFANET RADIUS - Billing System for ISP/RTRW.NET

Modern, full-stack billing & RADIUS management system for ISP/RTRW.NET with FreeRADIUS integration supporting PPPoE and Hotspot authentication.

> **Architecture:** pnpm monorepo — **Two Next.js apps** (frontend UI + backend API) + Baileys WhatsApp service
> **Version:** 4.7.0 — Phase 6B complete (Frontend Type-Safety Hardening) + Phase 6A (Full API Contract & Type-Safety Audit) + Phase 5 (frontend audit) + Phase 2 (111 batches, ~510 fetch calls migrated) + Phase 3 architecture improvements

---

## 🤖 AI Development Assistant

**READ FIRST:** [docs/AI_PROJECT_MEMORY.md](docs/AI_PROJECT_MEMORY.md) — contains full architecture, VPS details, DB schema, known issues, and proven solutions.

---

## 🎯 Features

| Category | Key Capabilities |
|----------|-----------------|
| **RADIUS / Auth** | FreeRADIUS 3.0.26, PAP/CHAP/MS-CHAP, VPN L2TP/IPSec, PPPoE & Hotspot, CoA real-time speed/disconnect, **IP Pool management**, **Multi-NAS isolation** |
| **VPN Management** | MikroTik CHR via API, VPS built-in WireGuard & L2TP/IPsec peer management, configurable IP pool & gateway per protocol, auto-generated RouterOS scripts |
| **PPPoE Management** | Customer accounts, profile-based bandwidth, isolation, IP assignment, MikroTik auto-sync, foto KTP+instalasi via kamera HP, GPS otomatis, **realtime online/offline status (polling 10s)**, **PSB wizard 3-step (adopt dari home.pmynet.id)**, **true optimistic update (reactivate/delete instant)** |
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
| **Auth Modes** | `local` (MikroTik primary) dan `radius` (FreeRADIUS primary, PPP secret backup disabled). **hybrid mode obsolete** |
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
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
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

### v4.5.0 — 2026-08-14 — Phase 2 Complete + Phase 3 Architecture Improvements

#### Overview — Phase 2 Completion & Phase 3 Architecture
Melanjutkan migrasi API client dari Batch 53 sampai Batch 111 (selesai), dilanjutkan dengan Phase 3 architecture improvements (middleware, error boundaries, permission constants, security fix).

**Total Phase 2: 111 batch, ~510 fetch calls di-migrasi, 55 fetch calls tersisa (semua legitimate blob/FormData/streaming downloads).**

Dokumentasi lengkap: [`FRONTEND_AUDIT.md`](FRONTEND_AUDIT.md) · [`CHANGELOG.md`](CHANGELOG.md)

#### Phase 2 — Batch 53–111 (Remaining Pages Migration)
| Batch | Halaman | Calls | Commit |
|-------|---------|-------|--------|
| 53–60 | genieacs/presets, network/fiber-cables, genieacs/provisions, hotspot/evoucher, genieacs/virtual-parameters, network/odcs, sessions/hotspot, freeradius/config | ~24 | `2f117d71` |
| 61–68 | inventory/movements, inventory/suppliers, payment/bank-accounts, hotspot/template, inventory/categories, tickets/categories, settings/footer, network/fiber-joint-closures | ~24 | — |
| 69–76 | network/fiber-cores, technicians, olt/monitoring, olt/alerts, genieacs/auto-provision, freeradius/status, freeradius/radcheck, topup-requests | ~24 | `6e88dda0` |
| 77–84 | genieacs/files, genieacs/config, pppoe/users, payment-gateway, technicians, genieacs/auto-provision, freeradius/radcheck, freeradius/status | 24 | `2ae622f8` |
| 85–90 | settings/isolation, settings/cloudflare-tunnel, admin/login, pppoe/users/new, sessions, suspend-requests | 12 | `2ae622f8` |
| 91–93 | whatsapp/notifications, hotspot/agent/deposits, genieacs/faults | 6 | `2ae622f8` |
| 94–111 | 18 pages with 1 fetch call each (11 JSON → apiAdmin, 7 blob/FormData → buildUrl) | 18 | `2ae622f8` |

#### Phase 2 Final Status: ✅ COMPLETE
- **Total batches**: 111
- **Total fetch calls migrated**: ~510
- **Remaining fetch() calls**: 55 (all legitimate blob/FormData/streaming downloads using `buildUrl()`)

#### Phase 3 — Architecture Improvements
- **middleware.ts** — Protect `/admin/*` routes with NextAuth JWT check
- **error.tsx** — Route-level error boundary for `/admin/*` with retry & home buttons
- **loading.tsx** — Route-level loading UI with spinner
- **permissions.ts** — Centralized permission/role constants + helper functions
- **usePermissions.ts** — Migrated to `apiAdmin()`
- **C8 Fix** — SSH password removed from `localStorage` in `vpn-server/page.tsx`

#### Phase 3 Status: ✅ COMPLETE

---

### v4.4.0 — 2026-08-14 — Frontend Centralized API Migration (Phase 2 Batch 1–52)

#### Overview — Frontend Audit & Centralized API Client Migration
Migrasi massif frontend dari inline `fetch()` ke **centralized API client** (`@/lib/api`) untuk semua halaman admin. Frontend sekarang **UI-only** — tidak ada direct Prisma/DB/MikroTik/SSH/FreeRADIUS access.

**Total: 52 batch, 361 inline `fetch()` calls di-migrasi.**

Dokumentasi lengkap: [`FRONTEND_AUDIT.md`](FRONTEND_AUDIT.md) · [`CHANGELOG.md`](CHANGELOG.md)

#### Phase 1 — Architectural Cleanup (Prasyarat)
- **1A** — Dead code removal (import tidak terpakai, komponen yatim)
- **1B** — NextAuth refactor & Prisma removal dari frontend
- **1C** — Uploads serving dipindahkan ke Nginx (`/uploads/`)

#### Phase 2 — Centralized API Client Migration (Batch 1–52)
| Batch | Halaman | Calls | Tanggal |
|-------|---------|-------|---------|
| 1–8b | API client + pppoe/profiles, areas, users, invoices, dashboard, keuangan, ippool | 80 | 13 Aug |
| 9 | hotspot/voucher | 15 | 13 Aug |
| 10–11 | vpn-server + vpn-client | 31 | 13 Aug |
| 12–24 | genieacs, network, whatsapp, download-apk, pppoe, management | 88 | 13 Aug |
| 25–40 | network/trace, settings, sessions, notifications, tickets, inventory, cron, freeradius | 78 | 13 Aug |
| 41–52 | network/odps, pppoe/users/[id], manual-payments, settings/security, isolation, genieacs, addons, data-usage, whatsapp/send, push-notifications, referrals, templates | 49 | 14 Aug |

#### Centralized API Client (`@/lib/api`)
- `apiAdmin()` — auth-aware, auto JSON parsing, auto `Content-Type` header
- Throw `ApiError` untuk non-2xx responses
- Multipart & blob download support

#### Phase 2 Status
- **Migrated**: 52 batch, 361 fetch calls
- **Remaining**: ~176 fetch calls di halaman admin lainnya
- **Phase 3** (pending): middleware improvements, error boundaries, theme improvements

---

### v4.3.0 — 2026-08-14 — Add-ons System + Janji Bayar + GPS Maps + Diskon + Teknisi Tracking

#### Added — Layanan Add-ons (Add-on Services)
- **Prisma models**: `addonType`, `customerAddon`, `invoiceAddon` — mendukung recurring (bulanan) & one-time (sekali bayar)
- **API endpoints**: `GET/POST /api/addon-types`, `PUT/DELETE /api/addon-types/[id]`, `GET/POST /api/pppoe/users/[id]/addons`, `DELETE /api/customer-addons/[id]`
- **Invoice integration**: addon recurring otomatis ditambahkan ke invoice bulanan saat cron generate
- **Frontend admin page**: `/admin/pppoe/addons` — kelola jenis layanan tambahan (CRUD + toggle active)
- **UserDetailModal**: tab "📦 Add-ons" — lihat addon aktif & riwayat, tambah/hentikan addon dengan price override

#### Added — Janji Bayar (Promise to Pay)
- **Prisma model**: `paymentPromise` — status `active`/`fulfilled`/`broken`
- **API endpoints**: `GET/POST/DELETE /api/pppoe/users/[id]/promise`
- **Behavior**: membuat janji bayar akan membuka isolir pelanggan hingga tanggal janji; membatalkan akan mengisolir kembali
- **UserDetailModal**: tab "🤝 Janji Bayar" — buat janji bayar dengan tanggal & catatan, lihat riwayat

#### Added — GPS Maps di Customer Detail
- **Embedded OpenStreetMap iframe** di tab Info Pengguna — menampilkan lokasi GPS pelanggan
- **Google Maps link** — tombol "Google Maps ↗" untuk buka koordinat di Google Maps

#### Added — Diskon Tagihan di Customer Detail
- **Field diskon** (`discount` & `discountNote`) sekarang bisa di-edit dari UserDetailModal tab Info
- **Invoice generation fix**: cron `invoice-jobs.ts` sekarang mengurangi `discount` dari `baseAmount` saat generate invoice bulanan

#### Added — Teknisi Pemasang Tracking
- **Field baru**: `registeredByTechnicianId` di `pppoeUser` model (nullable, relation ke `technician`)
- **Display**: UserDetailModal tab Info menampilkan nama teknisi yang mendaftarkan pelanggan + tanggal registrasi
- Legacy customers tanpa teknisi menampilkan "System / Admin"

#### Fixed — Invoice Generation
- **Bug**: field `discount` di `pppoeUser` tidak digunakan saat generate invoice bulanan
- **Fix**: `baseAmount = Math.max(0, user.profile.price - (user.discount || 0))` + tambah recurring addons
- **Invoice addon records**: `invoiceAddon` records dibuat untuk setiap recurring addon aktif

---

### v4.2.0 — 2026-08-13 — Redis Cache + Realtime UI Fixes + RADIUS Script IP Fix + Auth Mode Cleanup

#### Added — Redis Cache untuk Data Non-Realtime
- **Cache endpoint**: `GET /api/pppoe/profiles`, `GET /api/pppoe/areas`, `GET /api/network/routers` — TTL 5 menit
- **Graceful degradation**: jika Redis unavailable, fallback ke database langsung
- File: `backend/src/server/cache/redis.ts`

#### Fixed — Realtime UI Fixes
- **Online/offline status**: polling 10 detik, hanya trigger re-render jika ada perubahan status
- **Badge "Live"** dengan indikator pulse di filter Sesi

#### Fixed — RADIUS Script IP Fix
- **Auto-generated RouterOS script** pakai **IP asli VPS** (bukan domain/Cloudflare proxy)
- VPN-specific address selection

#### Fixed — Auth Mode Cleanup
- **`hybrid` mode obsolete** — hanya `local` (MikroTik primary) dan `radius` (FreeRADIUS primary)
- PPP secret backup disabled saat `auth_mode='radius'`

---

### v4.1.0 — 2026-08-13

### Added — PSB Wizard 3-Step untuk Tambah Pelanggan
- **Wizard 3-step** mengadopsi flow `home.pmynet.id` untuk tambah pelanggan baru
- **Step 1 — Data Pelanggan**: nama, phone, NIK (16 digit), email, alamat, foto KTP (capture dari kamera HP via `capture="environment"`), GPS koordinat, MapPicker, foto instalasi, duplicate NIK & phone check
- **Step 2 — Data Pembayaran**: paket/profile, subscription type (POSTPAID/PREPAID), billing day, discount amount + note, preview harga setelah discount, first invoice option (none/prorate/full), estimasi prorate
- **Step 3 — Data Secret / Connection**: connection type (PPPoE/Static IP/Hotspot), PPPoE username+password, static IP, router/NAS, area, ODP, MAC address, auto-isolation, install date, comment, conditional "Buat PPP Secret di MikroTik" checkbox (muncul hanya untuk PPPoE + router `auth_mode='radius'`)
- **Per-step validation** sebelum bisa lanjut ke step berikutnya
- File: `frontend/src/app/admin/pppoe/users/new/page.tsx`

### Added — Backend Support untuk PSB Wizard
- `backend/src/features/pppoe/schemas.ts`: Extended `createPppoeUserSchema` dengan `odp`, `discount`, `discountNote`, `installDate`, `connectionType`
- `backend/src/server/services/pppoe.service.ts`: Persist field baru ke database + NIK/phone duplicate check
- `backend/src/app/api/pppoe/users/route.ts`: Validasi field baru

### Added — Prisma Schema untuk PSB Wizard
- `pppoeUser` model: tambah `odp` (varchar 100), `discount` (int default 0), `discountNote` (varchar 255), `installDate` (datetime)
- Update: `backend/prisma/schema.prisma` + `frontend/prisma/schema.prisma`

### Added — Implementasi 4 Cron Jobs yang Sebelumnya Placeholder
Sebelumnya 4 cron jobs hanya return "not yet implemented". Sekarang sudah diimplementasi penuh:

- **`hotspot_sync`** (setiap menit): Expire voucher hotspot dengan status `WAITING`/`ACTIVE` yang sudah lewat `expiresAt` → update ke `EXPIRED`
- **`agent_sales`** (setiap 5 menit): Catat penjualan voucher agent ke `agent_sales` table dengan amount dari `hotspotProfile.sellingPrice`, skip duplicate
- **`session_monitor`** (setiap 15 menit): Monitor sesi suspicious/stale/orphaned di `radacct`, **auto-close** orphaned (username tidak terdaftar) + stale (>30 hari)
- **`pppoe_session_sync`** (setiap 5 menit): Sync PPP active dari MikroTik via RouterOS API, **auto-close** stale sessions (tidak di MikroTik) + orphaned sessions (username tidak di `pppoe_users`/`hotspot_vouchers`)
- File: `backend/src/server/cron/additional-jobs.ts` (baru)
- File: `backend/src/app/api/cron/route.ts` — switch case untuk 4 jobs baru

### Fixed — Cron Jobs `{"error":"Unauthorized"}`
- **Root cause**: `CRON_SECRET` hanya ada di PM2 env cron-runner, tidak di `backend/.env`. Backend tidak bisa verify `x-cron-secret` header → fallback session auth → Unauthorized
- **Fix**:
  - Tambah `CRON_SECRET` ke `backend/.env` + `backend/.next/standalone/backend/.env` di VPS
  - `deploy/ecosystem.config.js` + `frontend/production/ecosystem.config.js`: Tambah `CRON_SECRET` ke env backend + cron
  - `frontend/vps-install/install-app.sh`: Auto-generate `CRON_SECRET` via `openssl rand -hex 32` saat install

### Fixed — Inkonsistensi Data PPPoE (Status Online vs Active Sessions)
- **Root cause**: `radacct` punya open sessions dari sistem lama (home.pmynet.id) yang username-nya tidak terdaftar di `pppoe_users`. Halaman sessions menampilkan semua radacct open sessions → muncul 3 active padahal hanya 1 user terdaftar
- **Fix**:
  - Cleanup 2 orphaned sessions langsung di VPS (`sucidwilestari@sukajadi`, `oomabdulrohman@sukajadi`)
  - `pppoe_session_sync` cron: auto-close orphaned + stale sessions setiap 5 menit
  - `session_monitor` cron: auto-close orphaned + stale (>30 hari) sessions setiap 15 menit
- **Verifikasi**: `radacct_open = 1`, `pppoe_active = 1`, `orphaned_open = 0` ✅

### Fixed — Static Assets 404 Setelah Build
- **Root cause**: `npx next build` standalone tidak otomatis copy `.next/static/` ke standalone directory → CSS/JS chunks 404 + MIME type error
- **Fix**: Manual `cp -r .next/static .next/standalone/frontend/.next/static/` (updater.sh sudah handle ini, masalah hanya saat build manual)

### v4.0.0 — 2026-08-13

### Architecture — Two Independent Next.js Apps
- **Migrated from NestJS backend back to Next.js** — both frontend and backend are now Next.js 16 standalone apps
- `frontend/` (port 3000): UI pages, components, NextAuth authentication routes
- `backend/` (port 3001): API routes, Prisma, MikroTik services, RADIUS services, cron business logic
- `packages/shared-types/`: Shared TypeScript types between apps
- Frontend communicates with backend over HTTP via `lib/api-client.ts`
- Nginx routes: `/api/auth/*` → frontend (3000), `/api/*` → backend (3001), `/` → frontend (3000)
- PM2 processes: `salfanet-frontend`, `salfanet-backend`, `salfanet-cron`, `salfanet-wa`
- Cron runner: standalone tsx process that calls backend APIs on schedule
- Monorepo standalone build: `scripts/postbuild.js` copies static assets to nested standalone dirs

### Fixed — PPPoE Tidak Reconnect Setelah Payment dari Isolir
- **Root cause 1**: Isolir flow mengubah MikroTik PPP secret profile ke `isolir`, tapi payment restoration hanya update RADIUS tables tanpa restore PPP secret
- **Root cause 2**: FreeRADIUS `rest` module `connect_uri` masih ke port 3000 (frontend) — seharusnya port 3001 (backend). Setelah split, route `/api/radius/authorize` ada di backend
- **Root cause 3**: `sqlippool` di FreeRADIUS post-auth bersifat fatal — jika gagal allocate IP, Access-Accept berubah menjadi Access-Reject
- **Root cause 4**: Auto-renewal cron hanya update `status: 'active'` tanpa restore RADIUS/PPP secret untuk user yang sebelumnya isolated

#### Fixes Applied
- `backend/src/app/api/invoices/route.ts` (PUT): Tambah `managePppSecret` + `kickPppoeSession` + `nas_identifier` di RADIUS queries
- `backend/src/server/cron/invoice-jobs.ts`: Auto-renewal sekarang restore RADIUS + PPP secret untuk user isolated
- `backend/freeradius-config/mods-enabled/rest`: `connect_uri` → `http://localhost:3001` (backend)
- `backend/freeradius-config/sites-enabled/default`: `sqlippool`, `sql`, `cuisql` di post-auth → non-fatal (`-` prefix)
- Clear stale `radippool` entries yang expired

#### Verification
- User `muhammadluthfi@rw02`: Access-Accept dengan `Mikrotik-Group=PAKET 100MBPS`
- IP `192.168.14.2` dari `100mbps-pool` (bukan `pool-isolir`)
- MikroTik: ACTIVE, session tersimpan di `radacct` dengan `acctstoptime=NULL`

### Added — Realtime Online/Offline Status
- **New API endpoint**: `GET /api/pppoe/users/online-status` — lightweight endpoint yang hanya return set username online
  - Cek `radacct` (RADIUS auth users) + `batchListPppActive` (MikroTik local auth users)
  - Support filter `?usernames=` untuk restrict ke user yang ditampilkan saja
- **Frontend polling**: Setiap 10 detik, update `isOnline` field tanpa reload full data
  - Hanya trigger re-render jika ada perubahan status (cegah unnecessary renders)
  - Badge **"Live"** dengan indikator pulse di filter Sesi
- File: `backend/src/app/api/pppoe/users/online-status/route.ts`
- File: `frontend/src/app/admin/pppoe/users/page.tsx` — polling effect

### Updated — FreeRADIUS Configuration
- `rest` module: `connect_uri` diupdate dari `localhost:3000` → `localhost:3001` (backend API)
- `sites-enabled/default` post-auth: semua modules (`sql`, `sqlippool`, `cuisql`, `rest`) sekarang non-fatal
- Comment diupdate untuk reflect 2-app architecture

### Updated — Deployment Configuration
- `deploy/ecosystem.config.js`: 4 PM2 processes (frontend, backend, cron, wa)
- `deploy/nginx-salfanet.conf`: 2-app routing (`/api/auth/*` → 3000, `/api/*` → 3001, `/` → 3000)
- `frontend/production/ecosystem.config.js`: Updated untuk 2-app architecture
- `frontend/production/nginx-salfanet-radius.conf`: Updated untuk 2-app routing

### Updated — Installer/Updater/Uninstaller
- `frontend/vps-install/install-pm2.sh`: Build dan setup 2 Next.js apps terpisah
- `frontend/vps-install/updater.sh`: Build dan restart 2 apps + cron
- `frontend/vps-install/vps-uninstaller.sh`: Hapus 4 PM2 processes (frontend, backend, cron, wa)
- `frontend/vps-install/install-app.sh`: Install dependencies untuk frontend + backend
- `frontend/vps-install/install-nginx.sh`: 2-app routing + nested static paths
- `frontend/vps-install/vps-installer.sh`: Path `frontend/vps-install/`, 4 PM2 status

### v3.2.0 — 2026-08-12

### FreeRADIUS Server Configuration (Stage 1 — Verified on VPS)
- Enabled `sqlippool` module (SQL-backed IP pool, not file-based `rlm_ippool`)
- Enabled `cui` module with MySQL backend (`cuisql`)
- Imported stored procedure `fr_allocate_previous_or_new_framedipaddress`
- Configured `queries.conf` to use stored procedure for atomic IP allocation
- Added `sqlippool` + `cuisql` to `sites-enabled/default` post-auth section
- Added `sqlippool` to accounting section for lease release on STOP/ON/OFF
- Fixed `Pool-Name` attribute: moved from `radgroupreply` to `radgroupcheck`
- Verified with `radtest`: Access-Accept + `Framed-IP-Address` from pool
- Verified CUI table populated on auth
- FreeRADIUS config validation: `freeradius -XC` exit 0

### Admin UI (Stage 2)
- New page: `/admin/ippool` — IP Pool Management
- New page: `/admin/data-usage` — Data Usage Reports
- Added sidebar menu entries under FreeRADIUS group: IP Pool, Data Usage

### v2.34.9 — 2026-08-11

### Fixed
- **Admin sidebar "Log Aktivitas" menu returned 404** — Created `src/app/admin/logs/activity/page.tsx` and fixed `.gitignore` overly-broad `logs/` rule.

### v2.34.5 — 2026-08-11

### Removed
- **Go backend cleanup — full revert to pure Next.js** — Menghapus seluruh sisa eksperimen migrasi backend ke Go.

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
