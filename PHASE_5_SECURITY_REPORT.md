# PHASE 5 — BACKEND SECURITY HARDENING

## Overview

Phase 5 hardens the backend API as a security boundary. The audit covered all
90 backend API route files across authentication, authorization, RBAC, IDOR,
ownership checks, input validation, rate limiting, and mass assignment prevention.

## Audit Summary

### Inventory Results

| Category | Count | Status |
|----------|-------|--------|
| Total API route files | 90 | Audited |
| Weak auth (getServerSession only) | 28 | 17 fixed (high-priority) |
| Public endpoints | 8 | Rate limiting added |
| Strong auth (requirePermission) | 18 | Already secure |
| Customer token auth | 11 | Ownership checks verified |
| Agent JWT auth | 11 | Already secure |
| Cron secret auth | 4 | Already secure |
| Routes with [id] (IDOR risk) | 15 | Customer routes verified |
| Routes with Zod validation | 2 → 4 | Added to critical mutations |
| Routes with rate limiting | 1 → 12 | Added to public endpoints |

## Fixes Implemented

### Fix #1: Rate Limiter — Redis Migration + IP Bypass Prevention

**File:** `backend/src/server/middleware/rate-limit.ts`

**Before:**
- In-memory store (`const store = {}`)
- No IP validation — blindly trusted `x-forwarded-for` header
- Not shared across PM2 processes
- Vulnerable to IP header spoofing

**After:**
- Redis as primary store with in-memory fallback
- Atomic `INCR + EXPIRE` pipeline (race-condition-free)
- IP validation via `isValidIp()` — checks IPv4 octets (0-255) and IPv6 format
- Only trusts `cf-connecting-ip` (Cloudflare), `x-real-ip` (nginx), and validated first IP from `x-forwarded-for`
- Path-scoped keys (`ip:path`) for per-endpoint limits
- `resetRateLimit()` and `getRateLimitStats()` now async (Redis)

**IP Bypass Prevention:**
```
Attacker sends: X-Forwarded-For: fake-ip-not-real
→ isValidIp("fake-ip-not-real") returns false
→ Falls back to next header or 'unknown'

Attacker sends: X-Forwarded-For: 999.999.999.999
→ isValidIp checks octets 0-255, returns false
→ Falls back
```

### Fix #2: Rate Limiting on Public Auth Endpoints

Added rate limiting to 11 public endpoints:

| Endpoint | Preset | Limit |
|----------|--------|-------|
| `admin/auth/verify` | auth | 10 per 15 min |
| `admin/auth/verify-2fa` | auth | 10 per 15 min |
| `admin/auth/pre-login` | auth | 10 per 15 min |
| `admin/auth/logout-log` | moderate | 60 per min |
| `customer/auth/login` | auth | 10 per 15 min |
| `customer/auth/verify-otp` | auth | 10 per 15 min |
| `customer/auth/bypass-login` | auth | 10 per 15 min |
| `customer/auth/logout` | moderate | 60 per min |
| `company/info` | relaxed | 100 per min |
| `agent/deposit/payment-methods` | relaxed | 100 per min |
| `admin/olt/model-profiles` | relaxed | 100 per min |

### Fix #3: Weak Auth → requirePermission on Admin Routes

Converted 17 admin routes from `getServerSession()` (no role check) to
`requirePermission()` with proper RBAC permission keys:

| Route | Permission |
|-------|------------|
| `admin/analytics` | `reports.view` |
| `admin/activity-logs` | `users.view` |
| `admin/cloudflare-tunnel` (GET) | `settings.view` |
| `admin/cloudflare-tunnel` (POST) | `settings.edit` |
| `admin/isolated-users` | `customers.view` |
| `admin/laporan` | `reports.view` |
| `admin/registrations` | `registrations.view` |
| `admin/suspend-requests` | `customers.view` |
| `admin/evoucher/orders` | `invoices.view` |
| `admin/invoices/import` (GET) | `invoices.view` |
| `admin/invoices/import` (POST) | `invoices.edit` |
| `admin/referrals` | `customers.view` |
| `admin/referrals/config` (GET) | `settings.view` |
| `admin/referrals/config` (PUT) | `settings.edit` |
| `admin/settings/isolation` (GET) | `settings.view` |
| `admin/settings/isolation` (PUT) | `settings.edit` |
| `admin/settings/isolation/mikrotik-script` | `settings.view` |
| `admin/olt/test-connection` | `settings.edit` |
| `admin/profile/2fa` | `checkAuth()` (own settings) |
| `company` (GET) | `settings.view` |
| `company` (POST) | `settings.edit` |
| `cron/status` | `settings.view` |

**Auth helper pattern:**
```typescript
import { requirePermission } from '@/server/middleware/api-auth';

const authCheck = await requirePermission('reports.view');
if (!authCheck.authorized) return authCheck.response;
const session = authCheck.session;
```

### Fix #4: Customer IDOR Protection — Verified

Customer-facing `[id]` routes already have ownership checks:

| Route | Ownership Check |
|-------|----------------|
| `customer/invoices/[id]/manual-payment` | `findFirst({ where: { id, userId: user.id } })` |
| `customer/invoices` | `where: { userId: session.userId }` |
| `customer/invoices/[id]/manual-payment` | Returns 404 if invoice belongs to another user |

**IDOR Test Scenario:**
```
Customer A requests Customer B's invoice ID:
  findFirst({ where: { id: invoiceId, userId: user.id } })
  → invoice belongs to B, not A
  → returns null
  → 404 response (not found)
```

### Fix #5: Zod Validation on Critical Mutations

Added Zod validation to 2 critical mutation endpoints:

**`admin/isolate-user` (POST):**
```typescript
const isolateUserSchema = z.object({
  username: z.string().min(1).max(64),
  reason: z.string().max(500).optional(),
});
```
- Prevents mass assignment (only `username` and `reason` accepted)
- Limits string lengths to prevent buffer overflow / DoS

**`payment/create` (POST):**
```typescript
const paymentCreateSchema = z.object({
  invoiceId: z.string().uuid().optional(),
  orderNumber: z.string().max(64).optional(),
  amount: z.number().int().positive().optional(),
  gateway: z.enum(['midtrans', 'xendit', 'duitku', 'tripay', 'manual', 'cash', 'transfer']),
  type: z.enum(['invoice', 'voucher']).optional(),
  paymentMethod: z.string().max(64).optional(),
  paymentToken: z.string().max(128).optional(),
}).refine(...);
```
- Gateway validated as enum (prevents injection of unknown gateways)
- Amount must be positive integer
- All fields length-limited

## Files Changed

### Modified Files (32 files)

| File | Changes |
|------|---------|
| `server/middleware/rate-limit.ts` | Redis migration, IP validation, async functions |
| `app/api/admin/analytics/route.ts` | requirePermission('reports.view') |
| `app/api/admin/activity-logs/route.ts` | requirePermission('users.view') |
| `app/api/admin/auth/verify/route.ts` | Rate limiting (auth preset) |
| `app/api/admin/auth/verify-2fa/route.ts` | Rate limiting (auth preset) |
| `app/api/admin/auth/pre-login/route.ts` | Rate limiting (auth preset) |
| `app/api/admin/auth/logout-log/route.ts` | Rate limiting (moderate preset) |
| `app/api/admin/cloudflare-tunnel/route.ts` | requirePermission for GET+POST |
| `app/api/admin/evoucher/orders/route.ts` | requirePermission('invoices.view') |
| `app/api/admin/invoices/import/route.ts` | requirePermission for GET+POST |
| `app/api/admin/isolate-user/route.ts` | Zod validation + mass assignment prevention |
| `app/api/admin/isolated-users/route.ts` | requirePermission('customers.view') |
| `app/api/admin/laporan/route.ts` | requirePermission('reports.view') |
| `app/api/admin/olt/model-profiles/route.ts` | Rate limiting (relaxed preset) |
| `app/api/admin/olt/test-connection/route.ts` | requirePermission('settings.edit') |
| `app/api/admin/profile/2fa/route.ts` | checkAuth() (own settings) |
| `app/api/admin/referrals/config/route.ts` | requirePermission for GET+PUT |
| `app/api/admin/referrals/route.ts` | requirePermission('customers.view') |
| `app/api/admin/registrations/route.ts` | requirePermission('registrations.view') |
| `app/api/admin/settings/isolation/mikrotik-script/route.ts` | requirePermission('settings.view') |
| `app/api/admin/settings/isolation/route.ts` | requirePermission for GET+PUT |
| `app/api/admin/suspend-requests/route.ts` | requirePermission('customers.view') |
| `app/api/agent/deposit/payment-methods/route.ts` | Rate limiting (relaxed preset) |
| `app/api/company/info/route.ts` | Rate limiting (relaxed preset) |
| `app/api/company/route.ts` | requirePermission for GET+POST |
| `app/api/cron/status/route.ts` | requirePermission('settings.view') |
| `app/api/customer/auth/bypass-login/route.ts` | Rate limiting (auth preset) |
| `app/api/customer/auth/login/route.ts` | Rate limiting (auth preset) |
| `app/api/customer/auth/logout/route.ts` | Rate limiting (moderate preset) |
| `app/api/customer/auth/verify-otp/route.ts` | Rate limiting (auth preset) |
| `app/api/payment/create/route.ts` | Zod validation (gateway enum, amount validation) |

### New Files

| File | Purpose |
|------|---------|
| `backend/tests/security-hardening.test.ts` | 50-test security hardening suite |

## Test Results

### Phase 5 Tests (50 tests)

```
tests/security-hardening.test.ts:
  ✓ Rate Limiter — Redis migration + IP bypass prevention (8 tests)
  ✓ Public auth endpoints — rate limiting (11 tests)
  ✓ Admin routes — requirePermission instead of getServerSession (12 tests)
  ✓ Customer [id] routes — ownership checks (IDOR prevention) (2 tests)
  ✓ Critical mutation endpoints — Zod validation (6 tests)
  ✓ Mass assignment prevention (2 tests)
  ✓ Webhook security (2 tests)
  ✓ Auth helper availability and correctness (3 tests)
  ✓ Scenario: IDOR prevention (2 tests)
  ✓ Scenario: Rate limit bypass prevention (2 tests)
Total: 50/50 PASS
```

### All Tests

```
tests/security-hardening.test.ts:       50/50 PASS
tests/pppoe-external-integrity.test.ts: 23/23 PASS
tests/radius-integrity.test.ts:         24/24 PASS
tests/payment-integrity.test.ts:        10/10 PASS
tests/topup-integrity.test.ts:          18/18 PASS
────────────────────────────────────────────────
Total: 125/125 PASS
```

### Build & Production

```
VPS Build: PASS
Production: ONLINE (HTTP 200)
```

## Remaining Risks

### 1. Zod Validation Not Applied to All Routes (Medium Risk)
Only 4 out of 90 routes have Zod validation. The remaining 86 routes parse
request bodies manually with `await request.json()` and ad-hoc field checks.
This is technical debt — each route should have a Zod schema for proper
validation and mass assignment prevention. The critical routes (payment,
isolate-user) are now protected.

### 2. Admin [id] Routes — IDOR (Low Risk)
Admin routes with `[id]` parameters (e.g., `admin/users/[id]`, `admin/registrations/[id]`)
use `findUnique({ id })` without ownership checks. This is acceptable because
admin routes require `requirePermission()` — only authorized staff can access
them. The permission check is the security boundary, not ownership.

### 3. Rate Limit on Redis Unavailable (Low Risk)
If Redis is unavailable, the rate limiter falls back to in-memory store.
This means rate limits are per-process (not shared across PM2 workers).
This is a graceful degradation — rate limiting still works, just less
effectively.

### 4. Webhook Signature Verification (Informational)
The payment webhook checks signatures from payment providers (Midtrans,
Xendit, Duitku). The agent deposit webhook should also verify signatures.
This was not changed in Phase 5 but should be reviewed.

### 5. Remaining getServerSession Routes (Low Risk)
11 routes still use `getServerSession()` without `requirePermission()`.
These are primarily:
- Routes that already check role inline (e.g., `session.user.role === 'SUPER_ADMIN'`)
- Routes in `/api/admin/topup-requests/` that check role whitelist
- Routes that are customer-facing with token auth

These are lower risk because they have some form of role check, just not
via the centralized `requirePermission()` helper.

## Commits

- `3d09417b` — `fix(security): Phase 5 — Backend security hardening`

## Summary

Phase 5 successfully hardened the backend API as a security boundary:

1. **Rate Limiting**: Migrated from in-memory to Redis with IP validation
2. **Authentication**: 17 admin routes converted from weak auth to requirePermission
3. **IDOR Prevention**: Customer routes verified to have ownership checks
4. **Input Validation**: Zod schemas added to critical mutation endpoints
5. **Mass Assignment**: Prevented via explicit field selection in Zod schemas
6. **IP Bypass Prevention**: Rate limiter validates IP headers before use
7. **Public Endpoint Protection**: 11 public endpoints now have rate limiting
