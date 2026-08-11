# Architecture — Salfanet Radius

## Overview

Salfanet Radius is an ISP/RTRW.NET billing and RADIUS management system
built as a pnpm monorepo with Next.js frontend and NestJS backend.

## System Architecture

```
                    ┌─────────────┐
                    │   Nginx     │ :80/:443
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         /api/v1/*    /api/docs     /* (other)
              │            │            │
              ▼            │            ▼
     ┌──────────────┐      │     ┌──────────────┐
     │  NestJS      │:3001 │     │  Next.js     │:3000
     │  Backend     │      │     │  Frontend    │
     │  + Cron Jobs │      │     │  (standalone)│
     └──────┬───────┘      │     └──────┬───────┘
            │              │            │
            │              │            │ (legacy fallback)
            │              │            ▼
            │              │     ┌──────────────┐
            │              │     │  Legacy API  │
            │              │     │  Routes      │
            │              │     │  (/api/*)    │
            │              │     └──────────────┘
            │              │
            ▼              ▼
     ┌──────────┐   ┌──────────────┐
     │ Database │   │  Swagger UI  │
     │ (MySQL)  │   │  /api/docs   │
     └──────────┘   └──────────────┘
            │
            │
     ┌──────┴───────┐
     │   External   │
     │   Services   │
     ├──────────────┤
     │ FreeRADIUS   │
     │ MikroTik API │
     │ GenieACS     │
     │ WhatsApp     │:4000 (Baileys)
     │ SMTP         │
     │ Payment GWs  │
     └──────────────┘
```

## Monorepo Structure

```
salfanet-radius/
├── frontend/          # Next.js — UI + legacy API routes
├── backend/           # NestJS — API + cron + business logic
├── packages/          # @salfanet/shared-types
├── deploy/            # PM2, Nginx, deploy scripts
├── docs/              # Migration roadmap, architecture
└── pnpm-workspace.yaml
```

## Backend (NestJS)

### Module Structure

The backend follows NestJS module pattern with 46 feature modules:

```
backend/src/
├── modules/
│   ├── auth/              # JWT auth, login, guards
│   ├── pppoe/             # PPPoE user management
│   ├── hotspot/           # Hotspot voucher management
│   ├── invoices/          # Billing & invoices
│   ├── sessions/          # RADIUS session monitoring
│   ├── network/           # Router management
│   ├── mikrotik/          # MikroTik API integration
│   ├── freeradius/        # FreeRADIUS config & control
│   ├── genieacs/          # TR-069 CPE management
│   ├── olt/               # OLT/ONU management
│   ├── vpn/               # VPN server/client management
│   ├── whatsapp/          # WhatsApp messaging
│   ├── email/             # Email notifications
│   ├── push/              # Web push notifications
│   ├── telegram/          # Telegram backup/health
│   ├── cron/              # 17 scheduled jobs (@nestjs/schedule)
│   ├── payment-gateway/   # Midtrans/Xendit/Duitku/Tripay
│   ├── dashboard/         # Statistics & analytics
│   ├── tickets/           # Support tickets
│   ├── customer-portal/   # Customer self-service
│   ├── agent-portal/      # Agent/reseller portal
│   ├── technician-portal/ # Technician portal
│   ├── export/            # PDF/Excel exports
│   ├── extras/            # Misc admin endpoints
│   └── ... (20+ more)
├── common/
│   ├── guards/            # AdminGuard, AgentGuard, CustomerGuard, etc.
│   ├── decorators/        # @Public, @CurrentUser, @Permissions
│   ├── interceptors/      # ResponseTransformInterceptor
│   └── filters/           # GlobalExceptionFilter
├── prisma/                # PrismaService
└── main.ts                # Bootstrap (port 3001, /api/v1 prefix)
```

### API Conventions

- **Base URL**: `/api/v1/*`
- **Swagger docs**: `/api/docs`
- **Response format**: `{ success: boolean, data: any }` (via ResponseTransformInterceptor)
- **Auth**: JWT Bearer token (AdminGuard, AgentGuard, CustomerGuard, TechnicianGuard)
- **Public routes**: `@Public()` decorator
- **Validation**: class-validator + class-transformer (global ValidationPipe)
- **Throttling**: @nestjs/throttler (100 req/min)

### Cron Jobs (17)

All cron jobs run via `@nestjs/schedule` in the backend process:

| Job | Schedule | Description |
|-----|----------|-------------|
| hotspot_sync | `* * * * *` | Voucher status sync |
| pppoe_auto_isolir | `0 * * * *` | Expired user isolation |
| invoice_reminder | `0 * * * *` | WhatsApp + Email reminders |
| disconnect_sessions | `*/5 * * * *` | MikroTik session disconnect |
| pppoe_session_sync | `*/5 * * * *` | MikroTik ↔ radacct sync |
| freeradius_health | `*/5 * * * *` | Service check + auto-restart |
| ... | ... | (17 total) |

## Frontend (Next.js)

### Architecture

- **App Router** with standalone output
- **5 portals**: Admin, Customer, Agent, Technician, Public
- **Centralized API client**: `src/lib/api-client.ts`
  - `apiFetch()` — server-side (server components, layouts)
  - `apiFetchAuth()` — client-side with Bearer token
  - `getCompanyInfo()` — public company info for layouts
- **NEXT_PUBLIC_API_URL** env var: if set → NestJS backend, if empty → legacy routes

### Layout Files

All 5 layout files use `getCompanyInfo()` instead of direct Prisma access:
- `src/app/layout.tsx` (root)
- `src/app/admin/layout.tsx`
- `src/app/agent/layout.tsx`
- `src/app/customer/layout.tsx`
- `src/app/technician/layout.tsx`

### Legacy Code (During Migration)

- `src/app/api/` — Legacy Next.js API routes (fallback)
- `src/server/` — Legacy services
- `src/cron/` — Legacy cron runner
- `prisma/` — Shared Prisma schema

These are kept until Phase 7 regression testing is verified on VPS.

## Database

- **Engine**: MySQL 8.0
- **ORM**: Prisma 6.x
- **Schema**: `frontend/prisma/schema.prisma` (~45 models)
- **Key models**: user, pppoeUser, hotspotVoucher, invoice, router, radacct, radcheck, company, agent, etc.

## External Services

| Service | Purpose | Protocol |
|---------|---------|----------|
| FreeRADIUS | RADIUS authentication | RADIUS (UDP 1812/1813) |
| MikroTik | Router management | RouterOS API (TCP 8728) |
| GenieACS | TR-069 CPE management | HTTP (NBI 7557, CWMP 7547) |
| WhatsApp (Baileys) | Messaging | HTTP (port 4000) |
| SMTP | Email notifications | SMTP (TCP 587/465) |
| Midtrans | Payment gateway | HTTP REST |
| Xendit | Payment gateway | HTTP REST |
| Duitku | Payment gateway | HTTP REST |
| Tripay | Payment gateway | HTTP REST |

## Deployment

See [deploy/README.md](../deploy/README.md) for detailed deployment instructions.

### PM2 Processes

| Process | Port | Description |
|---------|------|-------------|
| salfanet-frontend | 3000 | Next.js standalone |
| salfanet-backend | 3001 | NestJS API + cron |
| salfanet-cron | — | Legacy cron (fallback) |
| salfanet-wa | 4000 | Baileys WhatsApp |

### Nginx Routing

| Path | Target |
|------|--------|
| `/api/v1/*` | Backend (port 3001) |
| `/api/docs` | Swagger UI (port 3001) |
| `/api/*` | Legacy routes (port 3000) |
| `/*` | Frontend (port 3000) |

## Testing

```bash
# E2E tests (46 tests)
cd backend && pnpm test:e2e

# Backend build
cd backend && pnpm build

# Frontend build
cd frontend && pnpm build
```

See [deploy/REGRESSION_TEST_CHECKLIST.md](../deploy/REGRESSION_TEST_CHECKLIST.md)
for manual VPS testing checklist.
