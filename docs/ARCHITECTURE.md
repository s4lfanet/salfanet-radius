# Architecture — Salfanet Radius

> Last updated: 2026-09-17 (v5.21.0)

## Overview

Salfanet Radius is an ISP/RTRW.NET billing and RADIUS management system
built as a pnpm monorepo with **two independent Next.js applications**
(no NestJS — that backend was built during Migration Phases 1–8, then
fully removed in favor of native Next.js API routes; see
[MIGRATION_ROADMAP.md](MIGRATION_ROADMAP.md) for that history).

## System Architecture

```
                    ┌─────────────┐
                    │   Nginx     │ :80/:443
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
           /api/*                  /* (pages)
              │                         │
              ▼                         ▼
     ┌──────────────┐          ┌──────────────┐
     │  Next.js     │:3001     │  Next.js     │:3000
     │  Backend     │          │  Frontend    │
     │  (API only)  │          │  (UI, cluster)│
     │  + cron jobs │          └──────────────┘
     └──────┬───────┘
            │
            ▼
     ┌──────────┐        ┌──────────────┐
     │ Database │        │  External    │
     │ (MySQL)  │        │  Services    │
     └──────────┘        ├──────────────┤
                          │ FreeRADIUS   │
                          │ MikroTik API │
                          │ GenieACS     │
                          │ WhatsApp     │:4000 (Baileys)
                          │ SMTP         │
                          │ Payment GWs  │
                          │ Telegram     │
                          └──────────────┘
```

In production, Nginx routes `/api/*` to the backend (port 3001) and
everything else to the frontend (port 3000). In local dev, the frontend's
`next.config.ts` proxies `/api/*` to `BACKEND_URL` (default
`http://localhost:3001`) via `rewrites()`; `/api/auth/*` (NextAuth) always
stays on the frontend.

## Monorepo Structure

```
salfanet-radius/
├── frontend/          # Next.js — UI (179 pages across 6 portals)
├── backend/           # Next.js — API routes (466 route.ts) + cron + services
├── packages/          # @salfanet/shared-types
├── deploy/            # PM2, Nginx, deploy scripts
├── docs/              # Architecture, roadmaps, feature docs
└── pnpm-workspace.yaml
```

## Backend (Next.js, API-only)

### Structure

```
backend/
├── src/
│   ├── app/api/            # Route handlers (route.ts), ~40 top-level groups:
│   │                       #   pppoe, hotspot, invoices, sessions, network,
│   │                       #   olt, genieacs, radius, freeradius, whatsapp,
│   │                       #   telegram, payment(-gateway), push, tickets,
│   │                       #   admin, agent, technician, collector, customer,
│   │                       #   cron, settings, dashboard, ...
│   ├── features/           # Feature-scoped business logic (barrel exports):
│   │                       #   agents, billing, hotspot, network,
│   │                       #   notifications, pppoe, reports
│   ├── server/
│   │   ├── auth/           # NextAuth config, JWT (agent/technician/customer)
│   │   ├── cron/           # Cron job definitions + runner (see below)
│   │   ├── cache/          # Redis cache (redis.ts) with graceful degradation
│   │   ├── db/             # Prisma client singleton
│   │   ├── middleware/     # api-auth, agent-auth, rate-limit
│   │   └── services/       # mikrotik, radius, payment, notifications, ...
│   └── lib/                # genieacs, network, olt, utils, validators
├── cron-runner.ts          # tsx entrypoint for PM2 `salfanet-cron` process
├── wa-service.js           # Baileys WhatsApp gateway (separate PM2 process)
└── prisma/                 # Schema (single source of truth for DB)
```

### API Conventions

- **Base URL**: `/api/*` (no versioning — this is not the old NestJS `/api/v1/*`)
- **Response format**: plain JSON per route; most return `{ success, data }` or `{ success, error }`
- **Auth**: NextAuth JWT (admin, via `getServerSession`), Bearer token (customer/agent, from `localStorage`), signed cookie (technician/collector)
- **Validation**: zod schemas per route (`src/lib/validators/`)

### Cron Jobs (24)

Cron jobs are plain async functions in `backend/src/server/cron/`, scheduled
via `node-cron` in `cron-runner.ts` (PM2 process `salfanet-cron`, separate
from the API server). Definitions and default schedules live in
`backend/src/server/cron/jobs.ts`; schedules can be overridden per-job from
the admin UI (`cronScheduleConfig` table) and are distributed-locked via
`cronLock` to avoid double-runs if PM2 restarts.

| Job | Default Schedule | Description |
|-----|----------|-------------|
| hotspot_sync | `* * * * *` | Sync voucher hotspot aktif/expired |
| external_task_processor | `* * * * *` | Process MikroTik/WhatsApp/Email/CoA outbox |
| agent_sales | `*/5 * * * *` | Record agent voucher sales |
| disconnect_sessions | `*/5 * * * *` | Disconnect isolir/stop sessions |
| radius_sync_retry | `*/5 * * * *` | Retry failed FreeRADIUS syncs |
| pppoe_session_sync | `*/5 * * * *` | Sync MikroTik ↔ radacct |
| freeradius_health | `*/5 * * * *` | FreeRADIUS service health check |
| hotspot_voucher_sync | `*/5 * * * *` | Sync voucher status from local-only NAS |
| olt_poll | `*/5 * * * *` | Poll all OLT (status, ONU, optical power) |
| acs_alert | `*/3 * * * *` | RX degradation & offline ONU via GenieACS |
| session_monitor | `*/15 * * * *` | Detect suspicious sessions |
| pppoe_auto_isolir | `0 * * * *` | Isolate expired prepaid users |
| invoice_reminder | `0 * * * *` | Due-date reminders |
| invoice_status_update | `0 * * * *` | Update invoice status (overdue/paid) |
| suspend_check | `0 * * * *` | Check users needing suspend |
| financial_reconciliation | `0 5 * * *` | Reconcile invoice/payment consistency |
| invoice_auto_cancel | `0 6 * * *` | Cancel stale invoices for renewed customers |
| radius_reconciliation | `0 6 * * *` | Detect SalfaNet ↔ FreeRADIUS drift |
| invoice_generate | `0 7 * * *` | Generate monthly (postpaid) invoices |
| auto_renewal | `0 8 * * *` | Auto-renew prepaid from balance |
| activity_log_cleanup | `0 2 * * *` | Delete activity log >30 days |
| webhook_log_cleanup | `0 3 * * *` | Delete webhook log >7 days |
| cron_history_cleanup | `0 4 * * *` | Delete cron history >30 days |
| notification_check | `0 */6 * * *` | Check expired/overdue/pending notifications |

## Frontend (Next.js)

### Structure

- **App Router**, `output: 'standalone'`
- **6 portals**: Admin, Customer, Agent, Technician, Collector, plus public pages (`/daftar`, `/pay`, `/pay-manual`, `/evoucher`)
- **Centralized API client**: `src/lib/api/client.ts` — resolves server vs. client base URL, handles the 3 auth modes (admin cookie / customer bearer / agent bearer), and a debounced global 401 → redirect handler
- **Route protection**: `src/middleware.ts` guards `/admin/*` via NextAuth JWT; other portals (agent/customer/technician/collector) use client-side token checks in their layout components

### Layouts

- `src/app/layout.tsx` (root)
- `src/app/admin/AdminClientLayout.tsx`
- `src/app/agent/*`, `src/app/customer/*`, `src/app/technician/*`, `src/app/collector/*`

## Database

- **Engine**: MySQL 8.0
- **ORM**: Prisma 6.x
- **Schema**: `backend/prisma/schema.prisma` (119 models) — single schema shared by both apps at build time (frontend does not hold its own copy)
- **Schema deploy mechanism**: `prisma db push --accept-data-loss` on the VPS (see `frontend/vps-install/updater.sh`), **not** `prisma migrate deploy`. The `backend/prisma/migrations/` folder exists but is best-effort/informational — `db push` against `schema.prisma` is the source of truth for what's actually applied in production.
- **RADIUS tables**: `radcheck`, `radreply`, `radusergroup`, `radgroupcheck`, `radgroupreply`, `radacct`, `radpostauth`, `radippool`, `cui`, `nasreload` — standard FreeRADIUS SQL schema, extended with app-specific models (pppoeUser, hotspotVoucher, invoice, router, company, agent, ticket, network* (OLT/ODC/ODP/fiber), genieacs*, etc.)

## External Services

| Service | Purpose | Protocol |
|---------|---------|----------|
| FreeRADIUS | RADIUS authentication | RADIUS (UDP 1812/1813) |
| MikroTik | Router management, CoA | RouterOS API (TCP 8728) |
| GenieACS | TR-069 CPE management | HTTP (NBI 7557, CWMP 7547) |
| WhatsApp (Baileys native + Fonnte/WAHA/GOWA/MPWA/Wablas/Kirimi.id) | Messaging | HTTP / Baileys socket (port 4000) |
| Telegram | 2-way technician bot | Bot API webhook |
| SMTP | Email notifications | SMTP (TCP 587/465) |
| Midtrans / Xendit / Duitku / Tripay | Payment gateways | HTTP REST |
| Redis | Non-realtime cache (profiles, areas, routers) | TCP 6379, graceful degradation if unavailable |

## Deployment

See [deploy/README.md](../deploy/README.md) for detailed deployment instructions.

### PM2 Processes

| Process | Mode | Port | Description |
|---------|------|------|--------------|
| salfanet-frontend | cluster | 3000 | Next.js standalone (UI + NextAuth) |
| salfanet-backend | fork | 3001 | Next.js standalone (API + Prisma + services) |
| salfanet-cron | fork | — | Cron runner (`tsx cron-runner.ts`) |
| salfanet-wa | fork | 4000 (internal) | Baileys WhatsApp gateway |

### Nginx Routing

| Path | Target |
|------|--------|
| `/api/*` | Backend (port 3001) |
| `/*` | Frontend (port 3000) |

## Testing

```bash
cd backend && pnpm test        # vitest — security/integrity/concurrency suites (backend/tests/)
cd backend && pnpm typecheck   # tsc --noEmit (build itself has ignoreBuildErrors: true)
cd frontend && pnpm build      # standalone build
cd backend && pnpm build       # standalone build
```

> **Note**: both `next.config.ts` set `typescript: { ignoreBuildErrors: true }`
> (pnpm workspace hoisting can miss `@types/react` at build time). This means
> `pnpm build` will **not** fail on type errors — run `pnpm typecheck` separately
> in CI/pre-merge to catch them.
