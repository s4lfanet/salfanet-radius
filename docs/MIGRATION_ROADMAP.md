# Salfanet Radius — Migration Roadmap

> **Status**: Phase 1 ✅ Complete | Phase 2 🔄 In Progress
> **Last updated**: 2026-08-11
> **Target**: Frontend (Next.js) + Backend (NestJS) + API contract — independently buildable & deployable

---

## Overview

Salfanet Radius adalah sistem manajemen ISP/RADIUS yang saat ini berupa monolith Next.js.
Roadmap ini mendokumentasikan migrasi bertahap menuju arsitektur terpisah:

```
salfanet-radius/ (pnpm monorepo)
├── frontend/     # Next.js — UI only, no API routes, no Prisma
├── backend/      # NestJS — API + business logic + cron
├── packages/     # Shared TypeScript types
├── api/          # OpenAPI documentation
└── deploy/       # Docker, Nginx, PM2 configs
```

### Prinsip Migrasi

1. **Setiap phase menghasilkan project yang runnable** — tidak ada "big bang" switch
2. **Next.js API routes tetap jalan** sampai diganti oleh NestJS (dual-stack via Nginx)
3. **Frontend tidak break** selama migrasi — API client switch per module
4. **Cron jobs tetap jalan** — port terakhir, runner lama tetap active
5. **Tidak ada rewrite business logic** — hanya pindah + adaptasi framework
6. **API versioning**: endpoint baru di `/api/v1/*`, endpoint lama tetap di `/api/*`

---

## Phase Status

| Phase | Nama | Status | Estimasi | Commit |
|-------|------|--------|----------|--------|
| 1 | Setup Monorepo Structure | ✅ Complete | 1 hari | `8eaab66` |
| 2 | Backend Auth Module | 🔄 In Progress | 3-5 hari | — |
| 3 | Port API Modules (399 routes) | ⏳ Pending | 2-3 minggu | — |
| 4 | Port Cron Jobs (17 jobs) | ⏳ Pending | 3-5 hari | — |
| 5 | Frontend Cleanup | ⏳ Pending | 2-3 hari | — |
| 6 | Independent Build & Deploy | ⏳ Pending | 2-3 hari | — |
| 7 | Regression Test | ⏳ Pending | 3-5 hari | — |
| 8 | Cleanup & Documentation | ⏳ Pending | 2-3 hari | — |

---

## Phase 1: Setup Monorepo Structure ✅

**Status**: Complete
**Commit**: `8eaab66`
**Tanggal**: 2026-08-11

### Yang dilakukan

- [x] Install pnpm, setup `pnpm-workspace.yaml`
- [x] Move semua code existing ke `frontend/` (src, public, prisma, tests, scripts, dll)
- [x] Create `backend/` NestJS skeleton (main.ts, app.module, health module, prisma module)
- [x] Create `packages/shared-types/` dengan shared TypeScript types
- [x] Root `package.json` dengan orchestration scripts
- [x] Update `.gitignore` untuk monorepo paths
- [x] Fix `next.config.ts` turbopack.root untuk pnpm
- [x] Remove tracked temp/debug artifacts

### Verifikasi

- `pnpm install` — 3 packages install successfully
- `frontend: next dev` — Ready in 647ms
- `backend: nest build` — compiles to dist/
- `shared-types: tsc` — builds to dist/

### Struktur hasil

```
salfanet-radius/
├── frontend/              # @salfanet/frontend (Next.js, all existing code)
├── backend/               # @salfanet/backend (NestJS skeleton)
├── packages/shared-types/ # @salfanet/shared-types
├── pnpm-workspace.yaml
├── package.json           # Root orchestration
└── pnpm-lock.yaml
```

---

## Phase 2: Backend Auth Module 🔄

**Status**: In Progress
**Estimasi**: 3-5 hari
**Risiko**: TINGGI — auth harus kompatibel dengan frontend existing

### Tujuan

Port sistem authentication & authorization dari Next.js ke NestJS:
- NextAuth-compatible JWT session (admin login)
- JWT strategy untuk agent & technician
- Bearer token strategy untuk customer
- Permission system (role-based + custom user permissions)
- Rate limiting

### Tasks

- [ ] 2.1 Audit auth system existing (NextAuth config, permissions, JWT)
- [ ] 2.2 Port Prisma schema reference ke backend
- [ ] 2.3 Implement AuthModule (login, session, 2FA)
- [ ] 2.4 Implement Guards (Admin, Agent, Technician, Customer, Public)
- [ ] 2.5 Implement Permission system (hasPermission, requirePermission)
- [ ] 2.6 Implement rate limiting
- [ ] 2.7 Test auth endpoints
- [ ] 2.8 Commit

### Auth Patterns yang harus di-port

| Pattern | Current (Next.js) | Target (NestJS) |
|---------|-------------------|-----------------|
| Admin login | NextAuth CredentialsProvider + JWT cookie | AuthController + AuthService + JWT |
| 2FA | TOTP via otpauth + adminTwoFactorPending | AuthService 2FA flow |
| Admin session | NextAuth JWT (cookie `next-auth.session-token`) | JWT verify dari cookie/header |
| Permission | `requirePermission()` function | `@Permissions()` decorator + Guard |
| Agent auth | Bearer JWT (jose, 7d expiry) | AgentGuard dengan JWT verify |
| Technician auth | Custom JWT (TECH_JWT_SECRET) | TechnicianGuard |
| Customer auth | Bearer token (customerSession table) | CustomerGuard |
| Rate limit | In-memory store per IP:path | NestJS ThrottlerGuard or custom |

### Kompatibilitas Frontend

Frontend Next.js saat ini menggunakan NextAuth client-side (`useSession`, `signIn`).
Selama Phase 2, frontend TETAP menggunakan NextAuth untuk login.
Backend NestJS menyediakan endpoint `/api/v1/auth/*` untuk verifikasi session
yang akan digunakan saat API routes mulai dipindah di Phase 3.

**Strategy dual-stack**:
- Login flow: tetap via NextAuth (frontend) → Next.js API route
- API calls: gradual switch dari `/api/*` (Next.js) ke `/api/v1/*` (NestJS)
- NestJS verify NextAuth JWT cookie untuk admin endpoints

---

## Phase 3: Port API Modules ⏳

**Status**: Pending
**Estimasi**: 2-3 minggu
**Risiko**: TINGGI — 399 endpoints harus dport satu per satu

### Batches

| Batch | Modules | Routes | Estimasi |
|-------|---------|--------|----------|
| 1 | health, company, dashboard, permissions | 8 | 3-5 hari |
| 2 | auth, settings, users, notifications | 28 | 5-7 hari |
| 3 | pppoe, hotspot, invoices, payment, keuangan | 47 | 7-10 hari |
| 4 | network, olt, genieacs, freeradius, radius, sessions | 99 | 7-10 hari |
| 5 | customer, agent, technician | 49 | 5-7 hari |
| 6 | whatsapp, telegram, push, upload, backup, dll | 168 | 3-5 hari |

### Per-batch workflow

1. Port routes ke NestJS controller + service
2. Test NestJS endpoint dengan curl
3. Update frontend fetch calls (via centralized API client)
4. Remove Next.js API route
5. Verify regression

---

## Phase 4: Port Cron Jobs ⏳

**Status**: Pending
**Estimasi**: 3-5 hari

### Jobs to port (17 total)

1. hotspot_sync, pppoe_auto_isolir, agent_sales, invoice_generate
2. invoice_reminder, notification_check, disconnect_sessions
3. telegram_backup, telegram_health, activity_log_cleanup
4. auto_renewal, webhook_log_cleanup, invoice_status_update
5. session_monitor, pppoe_session_sync, suspend_check, freeradius_health

### Strategy

- Port ke NestJS `@nestjs/schedule` dengan `@Cron()` decorator
- Update PM2 config: `salfanet-cron` → run backend cron
- Runner lama tetap jalan sampai semua jobs verified

---

## Phase 5: Frontend Cleanup ⏳

**Status**: Pending
**Estimasi**: 2-3 hari

### Tasks

- [ ] Remove all `src/app/api/` dari frontend
- [ ] Remove `src/server/` dari frontend
- [ ] Remove `src/cron/` dari frontend
- [ ] Remove `prisma/` dari frontend
- [ ] Update 5 layout files — remove prisma import, ganti dengan API call
- [ ] Centralize API client: `NEXT_PUBLIC_API_URL` env var
- [ ] Verify: frontend build tidak butuh Prisma

---

## Phase 6: Independent Build & Deploy ⏳

**Status**: Pending
**Estimasi**: 2-3 hari

### Tasks

- [ ] `frontend/package.json` — hanya UI deps
- [ ] `backend/package.json` — hanya server deps
- [ ] PM2 config: 4 processes (frontend, backend, cron, wa)
- [ ] Nginx: `/api/` → backend, `/` → frontend
- [ ] Docker configs (optional)

### PM2 Architecture

```
salfanet-frontend  → Next.js standalone (port 3000)
salfanet-backend   → NestJS (port 3001)
salfanet-cron      → NestJS cron runner
salfanet-wa        → WhatsApp service (port 4000)
```

### Nginx

```nginx
location /api/ { proxy_pass http://127.0.0.1:3001; }
location / { proxy_pass http://127.0.0.1:3000; }
```

---

## Phase 7: Regression Test ⏳

**Status**: Pending
**Estimasi**: 3-5 hari

### Test checklist

- [ ] Login (admin, customer, agent, technician)
- [ ] Role & permission
- [ ] Customer CRUD
- [ ] PPPoE sync
- [ ] FreeRADIUS sync
- [ ] MikroTik integration
- [ ] OLT/ONU management
- [ ] GenieACS
- [ ] Billing & invoice
- [ ] Payment gateway webhook
- [ ] WhatsApp send
- [ ] Telegram backup
- [ ] Email notification
- [ ] Push notification
- [ ] Cron jobs (all 17)
- [ ] Backup & restore
- [ ] Settings
- [ ] Dashboard stats
- [ ] Activity logs

---

## Phase 8: Cleanup & Documentation ⏳

**Status**: Pending
**Estimasi**: 2-3 hari

### Tasks

- [ ] Remove old empty directories
- [ ] Update README.md
- [ ] Update CHANGELOG.md
- [ ] Create ARCHITECTURE.md
- [ ] Create API.md (OpenAPI auto-generated)
- [ ] Create DEVELOPMENT.md
- [ ] Create DEPLOYMENT.md
- [ ] Update vps-install scripts untuk monorepo

---

## Key Decisions

| Decision | Pilihan | Alasan |
|----------|---------|--------|
| Backend framework | NestJS 11 | Enterprise-grade, TypeScript-first, DI container, decorator pattern |
| Repo structure | Monorepo (pnpm) | Shared types, atomic commits, gradual migration |
| API versioning | `/api/v1/*` | Endpoint lama tetap jalan selama transisi |
| Auth strategy | Dual-stack | NextAuth tetap untuk login, NestJS verify JWT |
| Frontend framework | Tetap Next.js | 162 pages, 70 components — tidak perlu rewrite |
| Database | Prisma + MySQL | Tetap sama, schema dipindah ke backend |
| Cron | @nestjs/schedule | Native NestJS integration |

---

## Risk Mitigation

| Risiko | Mitigasi |
|--------|----------|
| Auth break | Dual-stack NextAuth + NestJS JWT verify |
| 399 endpoints break | Port per batch, dual-stack via Nginx |
| Cron jobs break | Port terakhir, runner lama tetap jalan |
| Prisma path issues | Build di VPS, bukan cross-platform |
| WhatsApp Baileys | Port wa-service.js ke backend module |
| Payment webhooks | Pastikan URL webhook tidak berubah |
| Frontend fetch paths | Centralize API client dengan env var |
| VPS 4GB RAM | Backend NestJS lebih ringan dari Next.js build |
