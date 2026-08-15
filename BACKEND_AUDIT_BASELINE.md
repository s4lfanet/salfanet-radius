# BACKEND AUDIT BASELINE — Phase 0

**Repository:** salfanet-radius  
**Branch:** master  
**Audit Date:** 2026-08-15  
**Auditor:** Devin (automated)  
**Scope:** Backend + API + Database + Cron + RADIUS + Payment  
**Frontend:** TIDAK DIUBAH (frontend berjalan normal)

---

## 1. ARCHITECTURE OVERVIEW

### 1.1 Stack
- **Runtime:** Next.js 16 (Turbopack) standalone, port 3001
- **Database:** MySQL via Prisma 6.19
- **Auth:** NextAuth (admin), JWT (agent), JWT (technician), token-based (customer)
- **Cache:** Redis (ioredis 6.0)
- **Cron:** node-cron + DB-based distributed lock
- **Integrations:** FreeRADIUS (MySQL tables), MikroTik (RouterOS API), GenieACS (REST), WhatsApp (Baileys), Payment gateways (Midtrans, Xendit, Duitku, Tripay)

### 1.2 Structure
```
backend/
├── src/
│   ├── app/api/          # 416 API routes (route.ts files)
│   ├── server/
│   │   ├── auth/         # NextAuth config, JWT, permissions
│   │   ├── cache/        # Redis cache
│   │   ├── cron/         # Cron job definitions & execution
│   │   ├── db/           # Prisma client singleton
│   │   ├── middleware/   # api-auth, agent-auth, rate-limit
│   │   └── services/     # billing, mikrotik, radius, notifications, payment
│   ├── lib/              # timezone, genieacs, network, olt, validators
│   ├── features/         # Zod schemas (pppoe, billing)
│   └── config/           # App configuration
├── prisma/schema.prisma  # Database schema
├── cron-runner.ts        # Standalone cron process
├── tests/                # 11 test files
└── scripts/              # postbuild, generate-vapid, etc.
```

### 1.3 Auth Model
| Actor | Auth Method | Middleware |
|-------|-------------|------------|
| Admin | NextAuth session | `requirePermission()` or `getServerSession()` |
| Agent | JWT cookie | `requireAgentAuth()` |
| Technician | JWT cookie | `verifyTechnician()` (per-route) |
| Customer | Bearer token (CustomerSession table) | Per-route token check |
| Cron | CRON_SECRET + DB lock | `timingSafeEqual` |
| Public | None | N/A |

### 1.4 RBAC Coverage
| Category | Count | Status |
|----------|-------|--------|
| Total API routes | 416 | — |
| Routes with `requirePermission()` | 48 | Proper RBAC |
| Routes with `getServerSession` only (no role check) | 216 | Authenticated but no authorization |
| Routes with no NextAuth at all | 152 | Token-based auth, public, webhook, or RADIUS |

**Key Gap:** 216 routes check authentication but NOT authorization. Any logged-in user (regardless of role) can access these endpoints.

---

## 2. BUILD & TEST RESULTS

### 2.1 Typecheck (`pnpm typecheck`)
**Status:** FAIL (pre-existing errors, not from recent changes)

| Error Type | Count | Files |
|------------|-------|-------|
| `session.user.role` not typed | ~20 | telegram/*, settings/*, pppoe/* |
| `midtrans-client` missing types | 2 | payment/create, midtrans.service |
| `description` not in invoice schema | 2 | payment-concurrency-db.test.ts |

**Root Cause:** NextAuth session type augmentation missing `role` field. `midtrans-client` has no `@types` package.

### 2.2 Lint (`pnpm lint`)
**Status:** FAIL — `next lint` deprecated in Next.js 16, no `eslint.config.js` present.

### 2.3 Tests
| Test File | Result |
|-----------|--------|
| `timezone.test.ts` | 27/27 PASS |
| `cron-schedule.test.ts` | 40/40 PASS |
| `cron-secret.test.ts` | 10/11 PASS (1 fail: no local backend) |
| `cron-lock.test.ts` | SKIP (requires VPS DB) |
| `freeradius-concurrency.test.ts` | SKIP (requires VPS DB) |
| `idor-*.test.ts` | SKIP (requires VPS DB) |
| `payment-concurrency*.test.ts` | SKIP (requires VPS DB) |
| `security-negative.test.ts` | SKIP (requires VPS DB) |
| `api-integration.test.ts` | SKIP (requires VPS DB) |

### 2.4 Build
**Status:** PASS on VPS (fails locally due to missing `NEXTAUTH_SECRET`)

---

## 3. FINDINGS BY SEVERITY

### Summary

| Severity | Count | Categories |
|----------|-------|------------|
| **P0 Critical** | 30 | Auth bypass, IDOR, secret leakage, weak crypto, missing RBAC |
| **P1 High** | 19 | Race conditions, scope bypass, N+1, full table scan, timezone |
| **P2 Medium** | 14 | Fire-and-forget, error swallowing, logging, missing validation |
| **P3 Low** | 5 | Performance, connection pooling, verbose errors |
| **Total** | **68** | |

---

## 4. P0 — CRITICAL FINDINGS

### P0-01: Missing Authentication — PPPoE Areas GET
**File:** `backend/src/app/api/pppoe/areas/route.ts` line 9  
**Description:** GET endpoint has NO authentication check at all. Anyone on the internet can fetch all area data.  
**Root Cause:** `GET()` function does not call `getServerSession()` or any auth check.  
**Impact:** Information disclosure — area names, user counts exposed publicly.  
**Recommended Fix:** Add `getServerSession` check or `requirePermission('areas.view')`.

### P0-02: Missing Authentication — PPPoE Profiles POST
**File:** `backend/src/app/api/pppoe/profiles/route.ts` line 48  
**Description:** POST endpoint (create profile) has NO authentication check. Anyone can create PPPoE profiles.  
**Root Cause:** `POST()` function does not call `getServerSession()` before processing.  
**Impact:** Unauthorized profile creation — attacker can set pricing, group names, rate limits.  
**Recommended Fix:** Add `requirePermission('profiles.create')`.

### P0-03: Missing Authentication — Company Settings POST
**File:** `backend/src/app/api/company/route.ts` line 44  
**Description:** POST endpoint (update company settings) has NO authentication check. Anyone can modify company name, phone, baseUrl, timezone.  
**Root Cause:** `POST()` function does not call `getServerSession()`.  
**Impact:** System configuration tampering — attacker can change baseUrl (redirect payment links), timezone, contact info.  
**Recommended Fix:** Add `requirePermission('settings.company')`.

### P0-04: Payment Gateway API Keys Exposed Without Role Check
**File:** `backend/src/app/api/payment-gateway/config/route.ts` lines 9-45  
**Description:** GET endpoint returns ALL payment gateway API keys (midtransServerKey, xenditApiKey, tripayPrivateKey, etc.) to ANY authenticated user. No role check — a technician or low-privilege user can see all payment secrets.  
**Root Cause:** Only checks `getServerSession()`, no `requirePermission()`. SELECT includes all secret fields.  
**Impact:** Payment gateway credential theft — attacker can process refunds, create fraudulent transactions.  
**Recommended Fix:** (1) Add `requirePermission('payment.config')` or SUPER_ADMIN check. (2) Mask API keys in GET response (show only last 4 chars).

### P0-05: IDOR — PPPoE User Detail by ID
**File:** `backend/src/app/api/pppoe/users/[id]/route.ts` lines 6-19  
**Description:** GET endpoint accepts any user ID without checking if the requester has permission to view that user. Any authenticated user can fetch any other user's full profile.  
**Root Cause:** Only checks session exists, no role/ownership check.  
**Impact:** Customer data leakage — names, phones, addresses, passwords (PPP secret) accessible.  
**Recommended Fix:** Add `requirePermission('customers.view')` or verify ownership.

### P0-06: IDOR — PPPoE User Extend (Subscription Modification)
**File:** `backend/src/app/api/pppoe/users/[id]/extend/route.ts` lines 15-18  
**Description:** POST endpoint allows extending any user's subscription without role check. Any authenticated user can extend any other user's subscription.  
**Root Cause:** Only checks session exists, no `requirePermission()`.  
**Impact:** Free service theft — attacker can extend their own or others' subscriptions indefinitely.  
**Recommended Fix:** Add `requirePermission('customers.edit')`.

### P0-07: Missing Role Check — Admin Analytics (Financial Data)
**File:** `backend/src/app/api/admin/analytics/route.ts` lines 55-58  
**Description:** Financial analytics (revenue, ARPU, churn) exposed to any authenticated user without role check.  
**Root Cause:** Only checks session existence.  
**Recommended Fix:** Add `requirePermission('analytics.view')` or SUPER_ADMIN/FINANCE role check.

### P0-08: Missing Role Check — Admin Laporan (Financial Reports)
**File:** `backend/src/app/api/admin/laporan/route.ts` lines 19-22  
**Description:** Sensitive financial reports exposed without role verification.  
**Recommended Fix:** Add `requirePermission('reports.view')`.

### P0-09: Missing Role Check — Admin Registrations
**File:** `backend/src/app/api/admin/registrations/route.ts` lines 8-11  
**Description:** Customer registration data exposed without role check.  
**Recommended Fix:** Add `requirePermission('registrations.view')`.

### P0-10: Missing Role Check — Admin Suspend Requests
**File:** `backend/src/app/api/admin/suspend-requests/route.ts` lines 11-14  
**Recommended Fix:** Add `requirePermission('suspend_requests.view')`.

### P0-11: Missing Role Check — Admin Referrals
**File:** `backend/src/app/api/admin/referrals/route.ts` lines 9-12  
**Recommended Fix:** Add `requirePermission('referrals.view')`.

### P0-12: Missing Role Check — Admin EVoucher Orders
**File:** `backend/src/app/api/admin/evoucher/orders/route.ts` lines 8-11  
**Recommended Fix:** Add `requirePermission('evoucher.orders.view')`.

### P0-13: Missing Role Check — Isolation Settings (System Config)
**File:** `backend/src/app/api/admin/settings/isolation/route.ts` lines 11-14 (GET), 72-75 (PUT)  
**Description:** Network isolation settings (affecting all users' network access) can be viewed and modified by any authenticated user.  
**Recommended Fix:** Add `requirePermission('settings.isolation')` for both GET and PUT.

### P0-14: Missing Role Check — Cloudflare Tunnel (System Config)
**File:** `backend/src/app/api/admin/cloudflare-tunnel/route.ts` lines 19-22 (GET), 131-134 (POST)  
**Description:** System-level tunnel configuration, can execute system commands.  
**Recommended Fix:** Add SUPER_ADMIN role check.

### P0-15: Missing Role Check — FreeRADIUS Backup
**File:** `backend/src/app/api/admin/system/freeradius-backup/route.ts` lines 56-60, 94-98  
**Recommended Fix:** Add SUPER_ADMIN role check.

### P0-16: Missing Role Check — System Info
**File:** `backend/src/app/api/admin/system/info/route.ts` lines 37-41  
**Recommended Fix:** Add SUPER_ADMIN role check.

### P0-17: Missing Role Check — Topup Requests
**File:** `backend/src/app/api/admin/topup-requests/route.ts` lines 8-11  
**Recommended Fix:** Add `requirePermission('topup_requests.view')`.

### P0-18: Missing Role Check — Network Routers (Credentials Exposure)
**File:** `backend/src/app/api/network/routers/route.ts` lines 31-34  
**Description:** Router configuration including MikroTik credentials exposed without role check.  
**Recommended Fix:** Add `requirePermission('network.routers.view')` and exclude password fields from response.

### P0-19: Missing Role Check — Backup Operations
**File:** `backend/src/app/api/backup/route.ts` lines 12-15, 44-47  
**Recommended Fix:** Add SUPER_ADMIN role check.

### P0-20: Missing Role Check — Activity Logs
**File:** `backend/src/app/api/admin/activity-logs/route.ts` lines 10-13  
**Recommended Fix:** Add `requirePermission('activity_logs.view')`.

### P0-21: Missing Role Check — WhatsApp History
**File:** `backend/src/app/api/whatsapp/history/route.ts` lines 9-12  
**Recommended Fix:** Add `requirePermission('whatsapp.history.view')`.

### P0-22: Missing Role Check — Invoices Export
**File:** `backend/src/app/api/invoices/export/route.ts` lines 9-12  
**Recommended Fix:** Add `requirePermission('invoices.export')`.

### P0-23: Missing Role Check — Keuangan Export (Financial Data)
**File:** `backend/src/app/api/keuangan/export/route.ts` lines 13-16  
**Recommended Fix:** Add `requirePermission('keuangan.export')`.

### P0-24: Missing Role Check — PPPoE Areas POST/PUT/DELETE
**File:** `backend/src/app/api/pppoe/areas/route.ts` lines 43, 92, 155  
**Description:** POST/PUT/DELETE only check session, no role check. Any authenticated user can create/modify/delete areas.  
**Recommended Fix:** Add `requirePermission('areas.create'/'areas.edit'/'areas.delete')`.

### P0-25: Missing Role Check — PPPoE Profiles GET
**File:** `backend/src/app/api/pppoe/profiles/route.ts` lines 11-14  
**Description:** Profile pricing and configuration exposed to any authenticated user.  
**Recommended Fix:** Add `requirePermission('profiles.view')`.

### P0-26: Missing Role Check — Company Settings GET
**File:** `backend/src/app/api/company/route.ts` lines 8-11  
**Recommended Fix:** Add `requirePermission('settings.company.view')`.

### P0-27: Weak Payment Token — Topup Direct
**File:** `backend/src/app/api/customer/topup-direct/route.ts` line 89  
**Description:** Payment token uses `Math.random()` which is NOT cryptographically secure.  
```typescript
const paymentToken = `pay-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
```
**Impact:** Payment tokens can be predicted, allowing unauthorized access to payment pages.  
**Recommended Fix:** Use `crypto.randomBytes(32).toString('hex')`.

### P0-28: Weak Payment Token — Customer Upgrade
**File:** `backend/src/app/api/customer/upgrade/route.ts` line 76  
**Description:** Same issue — `Math.random()` used for payment token.  
```typescript
const paymentToken = `PAY-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
```
**Recommended Fix:** Use `crypto.randomBytes(32).toString('hex')`.

### P0-29: Missing `auto_stop` Job in CRON_JOB_DEFS
**File:** `backend/src/server/cron/jobs.ts`  
**Description:** The `auto_stop` cron job is defined in `cron-runner.ts` (line 94) and handled in `/api/cron/route.ts` (line 130), but is completely missing from `CRON_JOB_DEFS` in `jobs.ts`.  
**Impact:** Job doesn't appear in UI cron schedules/status, cannot be configured via schedule override.  
**Recommended Fix:** Add to `CRON_JOB_DEFS`:
```typescript
{ type: 'auto_stop', name: 'Auto Stop', description: 'Stop user isolated >30 hari', defaultSchedule: '0 5 * * *', defaultScheduleLabel: 'Daily at 5 AM' },
```

### P0-30: Password Logging in Console
**File:** `backend/src/server/cron/invoice-jobs.ts` line 339  
**File:** `backend/src/app/api/pppoe/users/[id]/extend/route.ts` line 113  
**Description:** Console.log statements log PPP secret restoration context that includes password proximity. While not directly logging `user.password`, the context reveals sensitive operations.  
**Recommended Fix:** Remove or sanitize log messages to exclude any password-related context.

---

## 5. P1 — HIGH SEVERITY FINDINGS

### P1-01: Invoice Number Race Condition (TOCTOU)
**File:** `backend/src/app/api/invoices/route.ts` lines 168-175  
**Description:** Invoice number generation uses count-then-generate pattern (non-atomic). Concurrent requests can generate duplicate invoice numbers.  
```typescript
const count = await prisma.invoice.count({ where: { invoiceNumber: { startsWith: `INV-${year}${month}-` } } });
const invoiceNumber = `INV-${year}${month}-${String(count + 1).padStart(4, '0')}`;
```
**Recommended Fix:** Use DB unique constraint + retry, or `generateInvoiceNumber()` from `invoice.service.ts` (uses `randomBytes`).

### P1-02: Topup Invoice Number Race Condition
**File:** `backend/src/app/api/customer/topup-direct/route.ts` lines 87-88  
**Description:** Same TOCTOU pattern for topup invoice numbers.  
**Recommended Fix:** Use `generateInvoiceNumber()` or UUID-based numbering.

### P1-03: Admin Balance Update Without Idempotency
**File:** `backend/src/app/api/admin/pppoe/users/[id]/deposit/route.ts` lines 39-46  
**Description:** Balance increment without idempotency guard. Concurrent requests can double-credit.  
**Recommended Fix:** Use `updateMany` with condition or add idempotency key.

### P1-04: Agent Balance Update Without Idempotency
**File:** `backend/src/server/db/repositories/agent.repository.ts` lines 44-48  
**Description:** Same issue for agent balance adjustment.  
**Recommended Fix:** Add idempotency guard.

### P1-05: Referral Reward Credit Race Condition
**File:** `backend/src/app/api/admin/referrals/[id]/route.ts` lines 34-49  
**Description:** Status check (line 34) is outside the `$transaction` (line 40). Concurrent approvals can double-credit the referrer.  
**Recommended Fix:** Move status check inside transaction using `updateMany` with `status: 'PENDING'` condition.

### P1-06: Manual Payment Approval Race Condition
**File:** `backend/src/app/api/manual-payments/[id]/route.ts` lines 135-140, 206-244  
**Description:** Status check at line 135 is outside the transaction at line 206. Race window allows double-approval.  
**Recommended Fix:** Move status check inside transaction using `updateMany` with `status: 'PENDING'` condition.

### P1-07: Bulk Mark Paid Without Idempotency
**File:** `backend/src/app/api/pppoe/users/[id]/mark-paid/route.ts` lines 57-66  
**Description:** While `updateMany` filters by status, subsequent transaction record creation has no idempotency check.  
**Recommended Fix:** Add `INSERT IGNORE` or check-before-insert for transaction records.

### P1-08: Technician Scope Bypass — Offline Users
**File:** `backend/src/app/api/technician/offline/route.ts` lines 31-33, 58-65  
**Description:** Technician can view ALL offline users regardless of assigned area/router. No scope filtering.  
**Recommended Fix:** Add `areaId`/`routerId` filter based on technician's assigned scope.

### P1-09: Technician Scope Bypass — Isolated Users
**File:** `backend/src/app/api/technician/isolated/route.ts` lines 31-33, 35-52  
**Description:** Same scope bypass for isolated users list.  
**Recommended Fix:** Add scope filtering.

### P1-10: Technician Scope Bypass — Sessions
**File:** `backend/src/app/api/technician/sessions/route.ts` lines 31-33, 42-58  
**Description:** Same scope bypass for active sessions.  
**Recommended Fix:** Add scope filtering.

### P1-11: N+1 Query in Invoice Generation
**File:** `backend/src/server/cron/invoice-jobs.ts` lines 87-94  
**Description:** `customerAddon.findMany` is called inside the `for (const user of users)` loop — one query per user.  
**Recommended Fix:** Batch fetch all addons before the loop using `pppoeUserId: { in: users.map(u => u.id) }`.

### P1-12: Full Table Scan — Invoice Generation
**File:** `backend/src/server/cron/invoice-jobs.ts` lines 27-32  
**Description:** `pppoeUser.findMany` fetches ALL active/isolated users without pagination.  
**Recommended Fix:** Process in batches of 500.

### P1-13: Full Table Scan — RADIUS Reconciliation
**File:** `backend/src/server/services/radius/radius-reconciliation.service.ts` lines 65-87  
**Description:** Fetches ALL records from `pppoeUser`, `radcheck`, `radusergroup`, `radreply` without limits.  
**Recommended Fix:** Add cursor-based pagination.

### P1-14: Full Table Scan — Sessions List
**File:** `backend/src/app/api/sessions/route.ts` lines 177-180  
**Description:** `radacct.findMany` without `take`/`limit` — could return millions of rows.  
**Recommended Fix:** Add pagination with `take` and `skip`.

### P1-15: Full Table Scan — Network Fiber Paths Trace
**File:** `backend/src/app/api/network/fiber-paths/trace/route.ts` lines 27-32  
**Description:** Fetches ALL network nodes (OLTs, JCs, ODCs, ODPs) without any limit.  
**Recommended Fix:** Add reasonable limits or geographic filtering.

### P1-16: Hardcoded Timezone in Cron Parser
**File:** `backend/src/server/cron/jobs.ts` line 121  
**Description:** `CronExpressionParser.parse(schedule, { tz: 'UTC' })` uses hardcoded UTC instead of company timezone. Next-run calculations will be 7 hours off.  
**Recommended Fix:** Use `currentTimezone || 'Asia/Jakarta'`.

### P1-17: RADIUS Auth Error Fallback Too Permissive
**File:** `backend/src/app/api/radius/authorize/route.ts` lines 191-199  
**Description:** On any error, returns HTTP 204 (allow fallback to SQL/radcheck). If authorize logic crashes, users may authenticate when they shouldn't.  
**Recommended Fix:** Only return 204 on specific non-critical errors. For logic errors, return Reject.

### P1-18: Weak Development Secrets
**File:** `backend/src/server/auth/config.ts` lines 11-12  
**File:** `backend/src/server/auth/agent-jwt.ts` lines 18-19  
**Description:** Hardcoded fallback secrets: `'salfanet-radius-secret-change-in-production'` and `'dev-agent-secret-change-in-production-please-set-env!!'`.  
**Recommended Fix:** Fail-fast if secret not set, even in development.

### P1-19: Extensive Payment Detail Logging
**File:** `backend/src/app/api/payment/webhook/route.ts` lines 958, 977, 988, 1004, 1008, 1021, 1022, 1191, 1244, 1266, 1270, 1289, 1291, 1448, 1472, 1559, 1746  
**File:** `backend/src/app/api/payment/create/route.ts` line 50  
**File:** `backend/src/app/api/customer/topup-direct/route.ts` lines 126-128, 149, 164, 194, 244-245, 257, 283-284  
**Description:** Extensive `console.log` of payment details (invoice numbers, amounts, user balances) in production code.  
**Recommended Fix:** Reduce to essential info only, use structured logging with log levels.

---

## 6. P2 — MEDIUM SEVERITY FINDINGS

### P2-01: Fire-and-Forget MikroTik Operations in Auto-Isolir
**File:** `backend/src/server/cron/auto-isolir.ts` lines 130-137, 209-215  
**Description:** `managePppSecret()` and `kickPppoeSession()` called with `.then()/.catch()` but not awaited.  
**Impact:** PPP secret operations may fail silently, users not properly isolated.  
**Recommended Fix:** Await operations and track errors in job result.

### P2-02: Fire-and-Forget in Auto-Renewal
**File:** `backend/src/server/cron/invoice-jobs.ts` lines 334-343  
**Description:** Same fire-and-forget pattern for MikroTik operations in auto-renewal.  
**Recommended Fix:** Await and track errors.

### P2-03: RADIUS Data Operations Not in Transaction
**File:** `backend/src/server/cron/auto-isolir.ts` lines 99-126, 197-205  
**Description:** Multiple `$executeRaw` calls to modify radcheck, radusergroup, radreply are not wrapped in a transaction. Partial failure leaves inconsistent RADIUS state.  
**Recommended Fix:** Wrap in `prisma.$transaction()`.

### P2-04: CoA Disconnect No Retry Mechanism
**File:** `backend/src/server/services/radius/coa-handler.service.ts` lines 394-438  
**Description:** Failed disconnects are not retried or queued.  
**Recommended Fix:** Integrate with radius-sync-queue for failed disconnects.

### P2-05: RADIUS Sync Queue Backpressure Without Alert
**File:** `backend/src/server/services/radius/radius-sync-queue.service.ts` lines 317-322  
**Description:** Backpressure pauses after 5 failures but has no max duration or alert.  
**Recommended Fix:** Add max pause duration and admin alerting.

### P2-06: MikroTik Connection Timeout Not Enforced
**File:** `backend/src/server/services/mikrotik/ppp-secret.service.ts` lines 71-78  
**Description:** RouterOSAPI timeout covers API calls but not TCP connection phase.  
**Recommended Fix:** Use `Promise.race` timeout wrapper like `client.ts`.

### P2-07: GenieACS No Startup Health Check
**File:** `backend/src/lib/genieacs/api-client.ts` lines 37-58  
**Description:** Credentials resolved lazily on first call. Config issues only discovered at runtime.  
**Recommended Fix:** Add startup health check.

### P2-08: GenieACS Retry Without Circuit Breaker
**File:** `backend/src/lib/genieacs/api-client.ts` lines 109-161  
**Description:** Retries on 5xx up to 2 times but no circuit breaker for permanent outages.  
**Recommended Fix:** Add circuit breaker and alerting.

### P2-09: `new Date()` Instead of `nowWIB()` in Invoice Generation
**File:** `backend/src/app/api/invoices/generate/route.ts` line 158  
**Description:** `createdAt: new Date()` instead of `nowWIB()` for invoice timestamps.  
**Recommended Fix:** Use `nowWIB()`.

### P2-10: `new Date()` Instead of `nowWIB()` in Customer Renewal
**File:** `backend/src/app/api/customer/renewal/route.ts` — 20+ instances  
**Description:** Pervasive use of `new Date()` instead of `nowWIB()` throughout renewal flow.  
**Recommended Fix:** Replace with `nowWIB()`.

### P2-11: `new Date()` in Session Disconnect
**File:** `backend/src/app/api/sessions/disconnect/route.ts` lines 344, 422  
**Description:** `acctstoptime: new Date()` instead of timezone-aware function.  
**Recommended Fix:** Use `nowWIB()`.

### P2-12: Manual Mark As Paid Transaction Not Fully Idempotent
**File:** `backend/src/app/api/invoices/route.ts` lines 407-422  
**Description:** Check for existing transaction is outside the INSERT IGNORE. Race window exists.  
**Recommended Fix:** Rely solely on `INSERT IGNORE` or move check inside transaction.

### P2-13: Webhook Log Update Not Atomic
**File:** `backend/src/app/api/payment/webhook/route.ts` lines 329-365  
**Description:** Webhook log updated/created separately from payment processing.  
**Recommended Fix:** Move log update inside payment processing transaction.

### P2-14: Empty Catch Blocks (Error Swallowing)
**File:** `backend/src/server/services/notifications/whatsapp-templates.service.ts` lines 50, 61  
**Description:** Empty `catch (_) {}` blocks swallow errors silently.  
**Recommended Fix:** At minimum `console.error` the error.

---

## 7. P3 — LOW SEVERITY FINDINGS

### P3-01: No Connection Pooling for GenieACS
**File:** `backend/src/lib/genieacs/api-client.ts` lines 81-165  
**Description:** Each `nbiRequest` creates a new HTTP connection.  
**Recommended Fix:** Consider `undici` with pooled connections.

### P3-02: In-Memory Rate Limiting (Not Distributed)
**File:** `backend/src/server/middleware/rate-limit.ts` line 514  
**Description:** In-memory store bypassed in multi-instance deployments.  
**Recommended Fix:** Use Redis for distributed rate limiting.

### P3-03: Missing CSRF Protection
**Files:** All POST/PUT/DELETE routes  
**Description:** No CSRF tokens on state-changing operations.  
**Recommended Fix:** Implement CSRF token validation.

### P3-04: Verbose Error Messages in Some Routes
**Files:** Multiple routes return detailed errors in development mode.  
**Recommended Fix:** Sanitize in production.

### P3-05: Missing Request Size Limits on Uploads
**Files:** File upload routes  
**Description:** Some upload routes may lack proper size limits.  
**Recommended Fix:** Add explicit size limits.

---

## 8. POSITIVE FINDINGS (Good Practices)

| Area | Status | Notes |
|------|--------|-------|
| Prisma client singleton | PASS | `globalThis` pattern in `db/client.ts` |
| Webhook idempotency guards | PASS | `updateMany` with status conditions in payment webhook |
| Payment gateway signature verification | PASS | All 4 gateways verify signatures |
| `INSERT IGNORE` for transaction records | PASS | Used in webhook handlers |
| `crypto.randomBytes(32)` for most payment tokens | PASS | Used in most places (except P0-27, P0-28) |
| Cron DB-based distributed lock | PASS | Heartbeat + fail-closed in production |
| CRON_SECRET `timingSafeEqual` | PASS | Timing-safe comparison |
| Timezone utilities | PASS | `nowWIB()`, `toUTC()`, `formatWIB()` well-implemented |
| Schema indexes | PASS | Good coverage on FKs and frequent columns |
| Discount application (recently fixed) | PASS | All 7 invoice paths now apply discount |
| `iconv-lite` in standalone | PASS | Copied in postbuild |
| `listPppActive()` error propagation | PASS | Throws on failure (recently fixed) |
| RADIUS sync queue atomic claim | PASS | `updateMany` with status condition |

---

## 9. DEPENDENCY MAP BETWEEN ISSUES

```
P0-02 (Profiles POST no auth) ─┐
P0-03 (Company POST no auth) ──┤
P0-04 (Payment keys exposed) ──┼─→ Shared root cause: missing requirePermission()
P0-05..P0-26 (Missing RBAC) ───┘   Fix: batch-add requirePermission to 216 routes

P0-27 (Weak token topup) ──────┐
P0-28 (Weak token upgrade) ────┤─→ Shared root cause: Math.random() for security tokens
                                  Fix: replace with crypto.randomBytes()

P1-01 (Invoice number race) ───┐
P1-02 (Topup number race) ─────┤─→ Shared root cause: count-then-generate pattern
                                  Fix: use generateInvoiceNumber() or UUID

P1-03 (Admin balance race) ────┐
P1-04 (Agent balance race) ────┤
P1-05 (Referral credit race) ──┼─→ Shared root cause: status check outside transaction
P1-06 (Manual payment race) ───┤   Fix: move check inside $transaction with updateMany
P1-07 (Mark paid race) ────────┘

P1-08..P1-10 (Technician scope)─→ Shared root cause: no area/router filter
                                  Fix: add scope filtering in verifyTechnician()

P1-11 (N+1 addons) ────────────┐
P1-12 (Full scan users) ───────┤─→ Shared area: invoice-jobs.ts performance
                                  Fix: batch fetch + pagination

P2-01..P2-02 (Fire-and-forget)─→ Shared pattern: MikroTik ops not awaited
P2-03 (RADIUS not in tx) ──────┤   Fix: await + wrap in transaction
```

---

## 10. RECOMMENDED FIX ORDER (Phase 1+)

### Phase 1 — Critical Security (P0)
1. **P0-01..P0-03:** Add authentication to unauthenticated endpoints (3 files, immediate)
2. **P0-04:** Mask payment gateway API keys + add role check (1 file, immediate)
3. **P0-05..P0-06:** Add IDOR protection to PPPoE user routes (2 files, immediate)
4. **P0-07..P0-26:** Batch-add `requirePermission()` to 20 admin routes (can be done in groups)
5. **P0-27..P0-28:** Replace `Math.random()` with `crypto.randomBytes()` (2 files, immediate)
6. **P0-29:** Add `auto_stop` to `CRON_JOB_DEFS` (1 file, immediate)
7. **P0-30:** Remove password-adjacent logging (2 files, immediate)

### Phase 2 — Race Conditions (P1)
1. **P1-01..P1-02:** Fix invoice number generation (use `generateInvoiceNumber()`)
2. **P1-03..P1-07:** Move status checks inside transactions, add idempotency guards
3. **P1-08..P1-10:** Add technician scope filtering
4. **P1-11..P1-15:** Fix N+1 and full table scans
5. **P1-16:** Fix cron parser timezone
6. **P1-17:** Fix RADIUS auth error fallback
7. **P1-18:** Fail-fast on missing secrets
8. **P1-19:** Reduce payment logging

### Phase 3 — Reliability (P2)
1. **P2-01..P2-03:** Await MikroTik ops, wrap RADIUS writes in transaction
2. **P2-04..P2-08:** Add retry/circuit breaker for external services
3. **P2-09..P2-11:** Replace `new Date()` with `nowWIB()`
4. **P2-12..P2-14:** Improve idempotency and error handling

### Phase 4 — Hardening (P3)
1. **P3-01..P3-05:** Connection pooling, distributed rate limit, CSRF, error sanitization

---

## 11. NOTES

- This is a BASELINE audit only. No fixes have been applied.
- Frontend was NOT modified or audited in this phase.
- API contracts were NOT changed.
- All findings are based on code review, not runtime testing.
- VPS-based tests (IDOR, payment concurrency, RADIUS) were not executed locally.
- The 216 "session-only" routes need individual review — some may be legitimate (e.g., routes that serve multiple roles with different logic per role).
- The 152 "no auth" routes include legitimate public endpoints (login, webhook, RADIUS auth, public company info, push subscriptions) and token-based auth routes (customer, agent, technician).
