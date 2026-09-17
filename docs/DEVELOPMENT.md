# Development Guide — Salfanet Radius

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 22+ | JavaScript runtime |
| pnpm | 11+ | Package manager (monorepo workspaces) |
| MySQL | 8.0 | Database |
| Git | 2.40+ | Version control |

Optional (for external services):
- FreeRADIUS 3.0.26
- MikroTik RouterOS device
- GenieACS server
- Redis (non-realtime cache; app degrades gracefully without it)
- WhatsApp Baileys service (`backend/wa-service.js`)

## Initial Setup

### 1. Clone and install

```bash
git clone https://github.com/s4lfanet/salfanet-radius.git
cd salfanet-radius
pnpm install
```

### 2. Configure environment

```bash
# Backend — DATABASE_URL, NEXTAUTH_SECRET, RADIUS_COA_SECRET, CRON_SECRET, VAPID_*, etc.
cp backend/.env.example backend/.env
# fill in DATABASE_URL at minimum; see backend/src/lib/env.ts for what's
# required vs. optional and what each one does

# Frontend — no DATABASE_URL needed (frontend has no Prisma access; it only
# talks to the backend over HTTP). NEXTAUTH_SECRET must match backend's.
cp frontend/.env.example frontend/.env
```

`NEXTAUTH_SECRET` **must be identical** in both `.env` files — the backend
verifies the same NextAuth JWT the frontend issues. In production a single
`.env` at the monorepo root is symlinked into both `backend/.env` and
`frontend/.env` for exactly this reason (see
`frontend/vps-install/install-app.sh`, `create_env_file()`); in local dev
it's simplest to just paste the same `NEXTAUTH_SECRET` into both files.

`NEXT_PUBLIC_API_URL` on the frontend only matters in production (Nginx
already routes `/api/*` there); leave it empty in local dev — the frontend's
`next.config.ts` rewrites `/api/*` to `BACKEND_URL` (default
`http://localhost:3001`) automatically.

### 3. Database setup

The Prisma schema lives in `backend/prisma/schema.prisma` — it is the single
source of truth for both apps.

```bash
cd backend
npx prisma generate
pnpm db:push      # or: pnpm db:migrate (creates a migrations/ entry too)
pnpm db:seed      # optional — seeds permissions, templates, categories, company
cd ..
```

> Production deploys use `prisma db push --accept-data-loss` (see
> `frontend/vps-install/updater.sh`), not `prisma migrate deploy`. The
> `migrations/` folder is best-effort/historical, not authoritative.

### 4. Run development servers

```bash
# Terminal 1 — Backend (Next.js API routes + cron logic, port 3001)
pnpm dev:backend

# Terminal 2 — Frontend (Next.js UI, port 3000)
pnpm dev
```

(`pnpm dev:all` runs both in parallel via `pnpm -r --parallel dev` if you
prefer one terminal — output is interleaved.)

Cron jobs themselves only run under `backend/cron-runner.ts` (the
`salfanet-cron` PM2 process in production); they are not started by `pnpm
dev:backend`. To exercise a job locally, trigger it manually — see below.

### 5. Access

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api

## Project Structure

```
salfanet-radius/
├── frontend/          # Next.js — UI (App Router, standalone)
├── backend/           # Next.js — API routes + cron + services (API only, no UI)
├── packages/          # @salfanet/shared-types
├── deploy/            # PM2, Nginx, deploy scripts
└── docs/              # Documentation
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full breakdown (this is
**not** NestJS — a NestJS backend was built during an earlier migration
attempt and later removed entirely in favor of native Next.js API routes on
both sides; ARCHITECTURE.md explains what actually ships today).

## Development Workflow

### Backend (Next.js API routes)

```bash
cd backend

pnpm dev          # dev server, hot reload, port 3001
pnpm build        # standalone build
pnpm typecheck    # tsc --noEmit (the build itself has ignoreBuildErrors: true)
pnpm lint
```

#### Adding a new API endpoint

Route handlers are plain Next.js `route.ts` files under `src/app/api/`:

```typescript
// src/app/api/my-feature/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/prisma';

export async function GET(req: NextRequest) {
  const auth = await checkAuth();
  if (!auth.authorized) return auth.response;

  const items = await prisma.myFeature.findMany();
  return NextResponse.json({ success: true, data: items });
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth();
  if (!auth.authorized) return auth.response;

  const body = await req.json();
  // validate with a zod schema from src/lib/validators/, then prisma.create(...)
  return NextResponse.json({ success: true, data: created });
}
```

Feature-scoped business logic (things reused across multiple routes) goes
in `src/features/<feature>/` with a barrel `index.ts` export, not directly
in the route file. Cross-cutting infra (MikroTik, RADIUS, payment gateways,
notifications) lives in `src/server/services/`.

### Frontend (Next.js)

```bash
cd frontend

pnpm dev          # dev server, port 3000
pnpm build        # standalone build
pnpm lint
pnpm typecheck
```

#### API client usage

```typescript
// Server-side (server components, layouts)
import { getCompanyInfo, apiFetch } from '@/lib/api/server';
const company = await getCompanyInfo();

// Client-side (admin — cookie session)
import { apiClient } from '@/lib/api/client';
const data = await apiClient.get('/api/pppoe/users');

// Client-side (customer/agent — Bearer token)
import { customerApi } from '@/lib/api/customer'; // or agent.ts
```

### Cron Jobs

Cron jobs are plain async functions in `backend/src/server/cron/*.ts`
(`jobs.ts`, `invoice-jobs.ts`, `auto-isolir.ts`, `additional-jobs.ts`,
`financial-reconciliation.ts`), registered with `node-cron` in
`backend/cron-runner.ts` — the entrypoint for the separate `salfanet-cron`
PM2 process. Definitions (name, default schedule, description) live in
`jobs.ts`'s `CRON_JOB_DEFINITIONS`; admins can override each job's schedule
from the admin UI (persisted in the `cronScheduleConfig` table), and every
run acquires a row in `cronLock` first so overlapping/duplicate PM2
processes can't double-run the same job.

To add a job: write the handler, add an entry to `CRON_JOB_DEFINITIONS` in
`jobs.ts`, wire it into `cron-runner.ts`'s schedule map, and add its
`jobType` string to the manual-trigger switch in
`backend/src/app/api/cron/route.ts`.

Manual trigger via API (admin auth or `x-cron-secret` header):
```
POST /api/cron
{ "jobType": "hotspot_sync" }
```

## Testing

There is no single `pnpm test` runner wired up yet — `backend/tests/*.test.ts`
are standalone integration scripts run individually with `tsx`, each hitting
a **real** database (see the header comment in each file for exact
requirements/side effects before running one against anything but a
disposable test DB):

```bash
cd backend
npx tsx tests/radius-integrity.test.ts
npx tsx tests/payment-integrity.test.ts
# etc. — see backend/tests/ for the full list
```

### Manual / Regression Testing

See [deploy/REGRESSION_TEST_CHECKLIST.md](../deploy/REGRESSION_TEST_CHECKLIST.md)
for the full manual test checklist used before a VPS deploy.

## Common Issues

### Prisma client not generated

```bash
cd backend
npx prisma generate
```

### Frontend layout errors (company info missing)

Layout files use `getCompanyInfo()` from `@/lib/api/server`, which calls the
backend's public `/api/public/company` route. If the backend isn't running
(or `BACKEND_URL` is wrong), layouts fall back to defaults rather than
crashing — check `BACKEND_URL`/`NEXT_PUBLIC_API_URL` first.

### Type errors don't fail the build

Both `next.config.ts` files set `typescript: { ignoreBuildErrors: true }`
(pnpm workspace hoisting can miss `@types/react` at build time on the VPS).
Run `pnpm typecheck` explicitly — don't rely on `pnpm build` to catch type
errors.

## Code Style

- TypeScript strict mode
- No `any` types (use `unknown` if needed)
- Next.js: App Router, server components by default, route handlers per
  `src/app/api/<resource>/route.ts`
- Shared types in `packages/shared-types/`

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Commit (conventional commits)
git commit -m "feat(backend): add my-feature route"

# Push
git push origin feature/my-feature
```

Commit prefixes:
- `feat(backend):` — Backend feature
- `feat(frontend):` — Frontend feature
- `fix(backend):` — Backend bug fix
- `docs:` — Documentation
- `test:` — Tests
- `deploy:` — Deployment config
