# Next.js Project Restructuring Guide
## SALFANET RADIUS — Architecture Overhaul

> **Status:** 📅 Planning Phase  
> **Created:** March 10, 2026  
> **Author:** Senior Next.js Developer  
> **Version target:** 3.0.0

---

## Konteks & Motivasi

Project SALFANET RADIUS saat ini adalah full-stack monolith Next.js yang menggabungkan **backend logic, API handlers, dan frontend** dalam satu project. Ini adalah arsitektur yang tepat untuk Next.js — namun **struktur folder saat ini belum mencerminkan separation of concerns** yang memadai untuk skala project ini (~45 model DB, 35+ API route groups, 5 portal berbeda).

### Masalah Yang Ada

| Area | Masalah |
|------|---------|
| `src/lib/` | 30+ file campur aduk: services, utils, config, integrasi eksternal |
| `src/app/api/` | Business logic hidup langsung di route handlers |
| `src/components/` | Komponen shared UI dan feature-specific dicampur |
| `cron-service.js` | Ada di root, tidak terintegrasi ke `src/` |
| Types | Tersebar di `src/types/`, inline di komponen, dan di route handlers |
| Imports | Tidak konsisten, beberapa circular dependency potensial |

---

## Target Arsitektur

```
src/
├── app/                              ← ROUTING LAYER ONLY (tipis)
│   ├── (public)/                     ← Route group: no auth required
│   │   ├── login/
│   │   ├── daftar/
│   │   ├── pay/
│   │   ├── pay-manual/
│   │   ├── payment/
│   │   ├── evoucher/
│   │   └── isolated/
│   ├── (portals)/                    ← Route group: authenticated portals
│   │   ├── admin/
│   │   ├── customer/
│   │   ├── agent/
│   │   ├── technician/
│   │   └── coordinator/
│   ├── api/
│   │   ├── v1/                       ← Versioned API (future-proof)
│   │   │   ├── pppoe/
│   │   │   ├── hotspot/
│   │   │   ├── billing/
│   │   │   ├── mikrotik/
│   │   │   ├── radius/
│   │   │   └── notifications/
│   │   ├── auth/
│   │   ├── cron/
│   │   ├── webhook/
│   │   └── health/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
│
├── features/                         ← FEATURE MODULES (Domain-Driven)
│   │   Setiap feature = vertical slice mandiri
│   ├── pppoe/
│   │   ├── components/               ← UI spesifik feature ini
│   │   ├── hooks/                    ← Hooks spesifik feature ini
│   │   ├── actions/                  ← Next.js Server Actions
│   │   ├── queries/                  ← Data fetching (server-side)
│   │   ├── schemas/                  ← Zod validation schemas
│   │   └── types.ts
│   ├── hotspot/
│   ├── billing/
│   │   ├── invoices/
│   │   ├── payments/
│   │   └── transactions/
│   ├── customers/
│   ├── agents/
│   ├── network/
│   ├── notifications/
│   ├── radius/
│   └── reports/
│
├── server/                           ← SERVER-ONLY CODE
│   ├── db/
│   │   ├── client.ts                 ← Prisma singleton
│   │   └── repositories/            ← Data Access Layer (DAL)
│   │       ├── pppoe.repository.ts
│   │       ├── invoice.repository.ts
│   │       ├── payment.repository.ts
│   │       ├── hotspot.repository.ts
│   │       ├── agent.repository.ts
│   │       └── ...
│   ├── services/                     ← Business logic
│   │   ├── mikrotik/
│   │   │   ├── client.ts
│   │   │   ├── pppoe.service.ts
│   │   │   └── hotspot.service.ts
│   │   ├── radius/
│   │   │   ├── coa.service.ts
│   │   │   ├── freeradius.service.ts
│   │   │   └── sync.service.ts
│   │   ├── payment/
│   │   │   ├── midtrans.service.ts
│   │   │   ├── xendit.service.ts
│   │   │   ├── duitku.service.ts
│   │   │   └── tripay.service.ts
│   │   ├── notifications/
│   │   │   ├── whatsapp.service.ts
│   │   │   ├── email.service.ts
│   │   │   ├── push.service.ts
│   │   │   └── telegram.service.ts
│   │   ├── billing/
│   │   │   ├── invoice.service.ts
│   │   │   └── renewal.service.ts
│   │   ├── isolation.service.ts
│   │   ├── referral.service.ts
│   │   └── backup.service.ts
│   ├── jobs/                         ← Cron jobs (replace root cron-service.js)
│   │   ├── index.ts                  ← Job registry & starter
│   │   ├── jobs.config.ts            ← Schedules config
│   │   ├── voucher-sync.job.ts
│   │   ├── auto-isolir.job.ts
│   │   ├── invoice-gen.job.ts
│   │   ├── invoice-reminder.job.ts
│   │   ├── auto-renewal.job.ts
│   │   ├── session-sync.job.ts
│   │   └── cleanup.job.ts
│   ├── cache/
│   │   ├── redis.ts                  ← Redis client singleton
│   │   └── online-users.cache.ts
│   ├── auth/
│   │   ├── config.ts                 ← NextAuth config
│   │   ├── permissions.ts
│   │   └── session.ts
│   └── middleware/
│       ├── api-auth.ts
│       └── rate-limit.ts
│
├── components/                       ← SHARED UI ONLY (dipakai 2+ fitur)
│   ├── ui/                           ← shadcn/ui primitives (unchanged)
│   ├── layout/
│   │   ├── AdminLayout.tsx
│   │   ├── CustomerLayout.tsx
│   │   └── Sidebar.tsx
│   ├── forms/
│   │   ├── SearchInput.tsx
│   │   └── DateRangePicker.tsx
│   ├── data-display/
│   │   ├── DataTable.tsx
│   │   └── StatsCard.tsx
│   └── feedback/
│       ├── LoadingSpinner.tsx
│       └── EmptyState.tsx
│
├── hooks/                            ← Global client-side hooks
│   ├── usePermissions.ts
│   ├── useSSE.ts
│   ├── useTheme.ts
│   └── useTranslation.ts
│
├── lib/                              ← PURE UTILITIES (no side effects)
│   ├── utils.ts                      ← cn(), formatters, helpers
│   ├── constants.ts                  ← App-wide constants
│   ├── timezone.ts
│   └── validators/                   ← Shared Zod schemas
│
├── types/                            ← Global TypeScript types
│   ├── index.ts
│   ├── api.types.ts
│   ├── auth.types.ts
│   └── next-auth.d.ts
│
├── locales/                          ← i18n translations (unchanged)
└── instrumentation.ts
```

---

## Prinsip Arsitektur

### 1. Routing ≠ Business Logic

Route handlers di `src/app/api/` hanya boleh:
1. Parse & validasi input (via Zod)
2. Panggil service layer
3. Return response

```typescript
// ✅ BENAR — route handler tipis
export async function POST(req: Request) {
  const body = await parseBody(req, createPppoeSchema);
  if (!body.success) return badRequest(body.error);
  
  const result = await pppoeService.create(body.data);
  return ok(result);
}

// ❌ SALAH — business logic di route handler
export async function POST(req: Request) {
  const body = await req.json();
  // 50+ baris Prisma queries, MikroTik API calls, WhatsApp notifications...
}
```

### 2. Server/Client Boundary yang Ketat

```
src/server/      → server-only (NEVER dikirim ke browser)
src/features/*/components/ → "use client"
src/features/*/queries/    → server-only data fetching
src/features/*/actions/    → "use server" (Server Actions)
```

### 3. Repository Pattern — Data Access Layer

Semua Prisma queries harus melalui repository:

```typescript
// src/server/db/repositories/pppoe.repository.ts
export const pppoeRepo = {
  findMany: (filters: PppoeFilters) =>
    prisma.pppoeUser.findMany({ where: filters }),
  findById: (id: string) =>
    prisma.pppoeUser.findUnique({ where: { id } }),
  create: (data: CreatePppoeInput) =>
    prisma.pppoeUser.create({ data }),
  update: (id: string, data: UpdatePppoeInput) =>
    prisma.pppoeUser.update({ where: { id }, data }),
};
```

### 4. Service Layer — Domain Logic

```typescript
// src/server/services/billing/invoice.service.ts
export async function generateMonthlyInvoices() {
  const users = await pppoeRepo.findDueForInvoice();
  for (const user of users) {
    const invoice = await invoiceRepo.create({ ... });
    await whatsappService.sendInvoiceNotification(user, invoice);
  }
}
```

### 5. Feature Vertical Slice

```
features/billing/invoices/
├── components/
│   ├── InvoiceList.tsx      ← "use client"
│   ├── InvoiceCard.tsx      ← "use client"
│   └── InvoiceFilters.tsx   ← "use client"
├── hooks/
│   └── useInvoicePoll.ts
├── actions/
│   └── markPaid.action.ts   ← "use server"
├── queries/
│   └── getInvoices.ts       ← server-only
├── schemas/
│   └── invoice.schema.ts    ← Zod
└── types.ts
```

### 6. API Conventions

```
GET    /api/v1/pppoe            → list (paginated)
POST   /api/v1/pppoe            → create
GET    /api/v1/pppoe/[id]       → detail
PATCH  /api/v1/pppoe/[id]       → update
DELETE /api/v1/pppoe/[id]       → delete
POST   /api/v1/pppoe/[id]/sync  → custom action
POST   /api/v1/pppoe/bulk       → bulk operations
```

Response format konsisten:
```typescript
type ApiResponse<T> = {
  data?: T;
  error?: string;
  message?: string;
  meta?: { total: number; page: number; limit: number };
};
```

### 7. Path Aliases (tsconfig.json)

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@/server/*": ["./src/server/*"],
      "@/features/*": ["./src/features/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/types/*": ["./src/types/*"]
    }
  }
}
```

---

## Constraints & Aturan Wajib

| Aturan | Keterangan |
|--------|-----------|
| ❌ No microservices | Tetap satu repo, satu project monolith |
| ❌ No new dependencies | Kecuali benar-benar diperlukan |
| ❌ No DB schema change | Prisma schema tidak berubah |
| ❌ No API URL change | FreeRADIUS & MikroTik depend on existing URLs |
| ✅ Incremental migration | Build harus tetap jalan setiap akhir fase |
| ✅ TypeScript strict | `npx tsc --noEmit` harus pass setiap fase |
| ✅ Keep "use client"/"use server" | Directive harus akurat setelah setiap move |
| ✅ Maintain test coverage | Vitest tests tetap hijau |

---

## AI Prompt Context (untuk agent/copilot)

Gunakan prompt berikut saat minta AI membantu restructuring:

```
ROLE: You are a Senior Next.js Developer performing an incremental
architectural restructuring of a large ISP management system.

PROJECT: SALFANET RADIUS
- Next.js 16 App Router + TypeScript + MySQL/Prisma + Redis
- ~45 DB models, 35+ API route groups, 5 authenticated portals
- FreeRADIUS + MikroTik + Midtrans/Xendit payment integrations

CURRENT ISSUE: src/lib/ has 30+ mixed files with no separation of concerns.
Business logic lives in API route handlers. No repository pattern.

TARGET STRUCTURE:
- src/server/ → all server-only code (DB, services, jobs, cache, auth)
- src/features/ → feature vertical slices (components, hooks, actions, queries, schemas)
- src/components/ → shared UI only (used in 2+ features)
- src/lib/ → pure utilities only (no DB calls, no side effects)
- src/app/api/ → thin route handlers (validate → call service → respond)

CONSTRAINTS:
- Do NOT change Prisma schema
- Do NOT change public API URL paths (FreeRADIUS/MikroTik depend on them)
- Do NOT add new npm dependencies  
- Migration must be incremental — build must pass after each step
- Run: npx tsc --noEmit after each move to verify

CURRENT PHASE: [specify phase 1-5]
CURRENT TASK: [specify what you're moving/refactoring]
```

---

## Referensi

- [ROADMAP_RESTRUCTURING.md](./ROADMAP_RESTRUCTURING.md) — Rencana & progress tiap fase
- [COMPREHENSIVE_FEATURE_GUIDE.md](./COMPREHENSIVE_FEATURE_GUIDE.md) — Detail semua fitur
