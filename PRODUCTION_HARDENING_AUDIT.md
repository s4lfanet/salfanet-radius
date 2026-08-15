# Production Hardening Audit Report — 2026-08-15

## Scope
Comprehensive audit and production hardening of `salfanet-radius` (branch: `master`).

Focus areas: stability, database consistency, cron, FreeRADIUS, payment, timezone, security, regression.

**No new features added. No UI redesign.**

---

## 1. Database ↔ Prisma Schema Consistency

### Method
- Queried production MySQL `information_schema.columns` for all columns with underscores.
- Compared against `backend/prisma/schema.prisma` field names and `@map()` annotations.
- Verified all `@@map()` table mappings.

### Result
**[VERIFIED]** 0 mismatches. All snake_case database columns have explicit `@map()` annotations:
- `cron_lock`: `job_key`, `owner_token`, `acquired_at`, `expires_at` — mapped
- `radius_sync_queue`: all 10 snake_case columns — mapped
- `pppoe_users`: `customer_id`, `pppoe_customer_id`, `referred_by_id`, `registered_by_technician_id` — mapped
- `customer_addons`: `pppoe_user_id`, `addon_type_id`, `created_by_admin_id` — mapped
- `invoice_addons`: `invoice_id`, `addon_type_id` — mapped
- `payment_promises`: `pppoe_user_id`, `invoice_id`, `created_by_admin_id` — mapped
- FreeRADIUS tables (`radacct`, `radcheck`, `radreply`, `radusergroup`, `radippool`): snake_case fields are native to the model (no mapping needed)

### Validation
- `prisma validate`: **PASSED**
- No new migrations required.

---

## 2. Cron Distributed Lock + Heartbeat

### Findings
- `acquireCronLock()` uses atomic INSERT with primary key constraint — correct.
- `renewCronLock()` uses conditional `updateMany` with `ownerToken` + `expiresAt >= now` — correct.
- `releaseCronLock()` uses conditional `deleteMany` with `ownerToken` — correct.
- Stale lock recovery via `deleteMany` + conditional `updateMany` — correct.

### Issues Found & Fixed
1. **Heartbeat not integrated into `runJob()`**: `startHeartbeat()` helper existed but was never called by `cron-runner.ts`.
   - **[FIXED]**: `cron-runner.ts` now starts a heartbeat `setInterval` that calls `renewCronLock()` every 3 minutes (TTL is 10 minutes). If renewal fails, `lockLost` flag is set and the job result is recorded as error (not success) to prevent duplicate processing.

2. **`server-only` import blocked standalone cron-runner**: `cron-lock.service.ts`, `monitoring.service.ts`, and `db/client.ts` all imported `server-only`, which throws when imported outside Next.js. This was the root cause of the original in-memory fallback.
   - **[FIXED]**: Removed `server-only` from all three files. The cron-runner can now import the lock service directly.

3. **In-memory fallback in production**: `runningJobs` Set was used as a fallback when DB lock failed.
   - **[FIXED]**: In production (`NODE_ENV=production`), if DB lock fails, the job is NOT run. Error is logged and recorded in cron history. In-memory guard remains as an optimization only.

---

## 3. CRON_SECRET Security

### Issues Found & Fixed
1. **No fail-fast in production**: If `CRON_SECRET` was empty, the cron-runner would log a warning but continue.
   - **[FIXED]**: `cron-runner.ts` now calls `process.exit(1)` if `NODE_ENV=production` and `CRON_SECRET` is empty.
   - **[FIXED]**: `/api/cron` route returns 500 if `NODE_ENV=production` and `CRON_SECRET` is empty.

2. **Timing attack vulnerability**: Secret comparison used `===` (string equality).
   - **[FIXED]**: Both cron-runner and API route now use `timingSafeEqual` for secret comparison.

3. **Secret exposure in logs**: `CRON_SECRET` value was logged in startup message.
   - **[FIXED]**: Only secret length is logged (`CRON_SECRET: set (length: 32)`), never the value.

---

## 4. Cron HTTP Timeout + Async Execution

### Issues Found & Fixed
1. **Single timeout for all jobs**: All jobs used the same 120s curl timeout.
   - **[FIXED]**: Per-job timeout configuration. Heavy jobs (invoice_generate, radius_reconciliation) get 300s. Default is 120s.

2. **Lock released before work finishes**: Lock was released in `finally` block, which is correct. But if the HTTP call timed out, the lock was released while the API route might still be processing.
   - **[FIXED]**: Heartbeat now extends the lock while the job is active. If the HTTP call times out, the heartbeat stops, the lock eventually expires (10 min TTL), and another instance can reclaim it.

---

## 5. Timezone Handling

### Issues Found & Fixed
1. **Manual `+7h` in `cron-runner.ts`**: `nowWIB()` used `new Date(now.getTime() + 7 * 60 * 60 * 1000)`.
   - **[FIXED]**: Replaced with `new Date()` which respects system timezone (`TZ=Asia/Jakarta` in production).

2. **UTC timezone not handled in `getTimezoneOffset()`**: `getTimezoneOffset('UTC')` returned `'+07:00'` as fallback.
   - **[FIXED]**: Added explicit UTC/GMT/Etc/UTC/Etc/GMT check returning `'+00:00'`. Applied to both backend and frontend.

3. **Hardcoded `'Asia/Jakarta'` in frontend layouts**: 5 files used `formatInTimeZone(now, 'Asia/Jakarta', ...)` instead of dynamic timezone.
   - **[FIXED]**: Replaced with `getCurrentTimezone()` in TechnicianPortalLayout, CustomerClientLayout, AgentLayoutClient, AdminClientLayout, and customer/suspend page.

4. **Cron schedule timezone**: `node-cron` used system timezone, not company timezone.
   - **[FIXED]**: `cron-runner.ts` loads company timezone from DB and passes it to `cron.schedule()` via `{ timezone: companyTimezone }`.

5. **`nextRun` calculation**: Heuristic interval estimation was inaccurate.
   - **[FIXED]**: Replaced with `cron-parser` library (`CronExpressionParser.parse()`) for accurate next-run calculation.

### Test Results
- **[TESTED]** Timezone tests: 27/27 passed locally.

---

## 6. FreeRADIUS Queue Concurrency

### Issues Found & Fixed
1. **Non-atomic queue claim**: `processRetryQueue()` used unconditional `prisma.radiusSyncQueue.update()` to mark items as SYNCING. Two workers could claim the same item.
   - **[FIXED]**: Replaced with conditional `updateMany({ where: { id, status: { in: ['PENDING', 'FAILED'] } } })`. If `count === 0`, the item was already claimed and is skipped.

### Verified Safe
- Reconciliation: Only reads SalfaNet DB, never deletes. Correctly treats SalfaNet as source of truth.
- Stale delete queuing: Verifies user doesn't exist in SalfaNet before queuing FreeRADIUS delete.
- Retry/backoff: Exponential backoff with max 5 retries, then DEAD status.
- Circuit breaker: Pauses after 5 consecutive failures.

---

## 7. Payment & Financial Safety

### Verified Safe
- `payments.invoiceId` has `@unique` constraint — prevents duplicate payment records.
- `handleVoucherOrder`: Uses atomic `updateMany` with `status: { not: 'PAID' }` — only one webhook generates vouchers.
- `handleAgentDeposit`: Uses `$transaction` with atomic `updateMany` — only one webhook increments balance.
- `handleCustomerTopUp`: Uses `$transaction` with atomic `updateMany` — only one webhook increments balance.
- `handleInvoicePayment`: Uses `$transaction` with atomic `updateMany` — only one webhook processes payment.
- Duplicate callback detection: Checks `webhookLog` for existing successful callbacks with same `gateway` + `transactionId`.

### No Changes Required
Payment idempotency is correctly implemented via atomic conditional updates.

---

## 8. Technician GenieACS Authorization

### Issues Found & Fixed
1. **No area/router filtering on device list**: Field technicians could see ALL GenieACS devices.
   - **[FIXED]**: Field technicians must now provide `routerId` or `areaId`. Devices are filtered to only show those matching customers in the assigned scope.

2. **No authorization check on single device access**: Field technicians could access any device by ID.
   - **[FIXED]**: Field technicians must provide `routerId`/`areaId` and the device must match a customer in their assigned scope. Returns 403 if not in their area.

3. **`verifyTechnician()` inconsistency**: GenieACS routes didn't return `isAdminUser` flag.
   - **[FIXED]**: Both routes now return `isAdminUser` flag, matching the customers route pattern.

### Note
No schema changes were made (no `routerId`/`areaId` added to `technician` model). The fix uses the existing query parameter pattern already established in the customers route.

---

## 9. IDOR / Authorization

### Verified Safe
- **Customer routes**: All use `session.userId` to scope queries. No IDOR.
- **Agent routes**: All use `agentId` to scope queries. No IDOR.
- **Technician routes**: Work orders verify `technicianId` assignment. No IDOR.

### Admin Routes (By Design)
Admin routes rely on RBAC (role-based access control) rather than resource ownership. This is standard for admin interfaces. Risk is mitigated by:
- Role permissions (`SUPER_ADMIN`, `FINANCE`, `CUSTOMER_SERVICE`, `TECHNICIAN`)
- Activity logging
- The admin user model supports per-user permission overrides

### No Changes Required
IDOR protections are correct for user-facing routes. Admin RBAC is by design.

---

## 10. Frontend ↔ API Regression

### Issues Found & Fixed
1. **GenieACS files upload**: Called `res.json()` without checking `res.ok` first — would throw on non-JSON error responses.
   - **[FIXED]**: Added `res.ok` check with try/catch error parsing.

2. **Pay-manual page**: Called `response.json()` in error path without try/catch — would throw on non-JSON error bodies.
   - **[FIXED]**: Wrapped in try/catch with fallback error message.

### Verified Safe
- Centralized API client (`lib/api/client.ts`) correctly handles 401/403/404/405/429/500 with try/catch around `res.json()`.
- Global 401 handler triggers redirect to login.
- No direct Prisma/database access from frontend.

---

## 11. Database Transaction Audit

### Findings
- `pppoe.service.ts` (create/update/delete): Multi-table operations (pppoeUser + radcheck/radreply/radusergroup) are NOT wrapped in `$transaction`. Risk: partial update if RADIUS sync fails after user creation.
- `extend/route.ts`: User update + invoice + transaction creation are NOT wrapped in `$transaction`. Risk: user extended but no invoice/financial record.
- `manual-payments/[id]/route.ts` (APPROVE): Core operations ARE wrapped in `$transaction`. RADIUS sync happens post-transaction (acceptable — eventual consistency via retry queue).

### Assessment
Wrapping RADIUS operations (which include external MikroTik API calls) in DB transactions is an anti-pattern — long-running transactions lock rows. The existing retry queue (`radiusSyncQueue`) provides eventual consistency. The extend route's DB-only operations (user + invoice + transaction) should ideally be transactional, but this is a pre-existing issue not introduced by this audit.

### Status
- **[DOCUMENTED]** Pre-existing transaction gaps noted. No changes made to avoid introducing regressions in complex business logic.

---

## 12. Logging & Monitoring Secret Leak Audit

### Issues Found & Fixed
1. **Payment webhook raw body logging**: Full webhook payload logged (may contain PII).
   - **[FIXED]**: Removed raw body and form data logging.

2. **Full signature logging**: Tripay and header signatures logged in full.
   - **[FIXED]**: Signatures truncated to first 16 characters.

3. **Payment token debug logging**: `/api/pay/[token]` logged the full payment token.
   - **[FIXED]**: Removed all debug `console.log` statements.

### Verified Safe
- Gateway secrets (Midtrans server key, Xendit webhook token, Duitku API key, Tripay private key) are NOT logged.
- `CRON_SECRET` is NOT logged (only length).
- Midtrans signature validation already truncates signatures (was correct before this audit).

---

## 13. TypeScript & Build Validation

### Typecheck Results
- **Backend**: No new errors introduced by this audit. Pre-existing errors remain (session.user typing, BigInt target).
- **Frontend**: No new errors introduced by this audit.
- **Prisma validate**: PASSED

### Changed File Typecheck
All changed files compile cleanly:
- `cron-runner.ts`, `cron/route.ts`, `cron/jobs.ts`
- `cron-lock.service.ts`, `monitoring.service.ts`, `db/client.ts`
- `radius-sync-queue.service.ts`
- `technician/genieacs/devices/route.ts`, `[deviceId]/route.ts`
- `payment/webhook/route.ts`, `pay/[token]/route.ts`
- `timezone.ts` (backend + frontend)
- All 5 frontend layout files
- `genieacs/files/page.tsx`, `pay-manual/page.tsx`

---

## 14. Test Results

| Test | Status | Notes |
|------|--------|-------|
| Timezone utility tests | **[TESTED]** 27/27 passed | Run locally with `npx tsx tests/timezone.test.ts` |
| Cron lock service tests | **[CREATED]** | Must run on VPS where DB is accessible |
| Prisma validate | **[PASSED]** | Schema valid |
| Backend typecheck (changed files) | **[PASSED]** | No new errors |
| Frontend typecheck (changed files) | **[PASSED]** | No new errors |
| Payment idempotency | **[VERIFIED]** | Atomic conditional updates in all handlers |
| IDOR (customer/agent/technician) | **[VERIFIED]** | All routes scope by session ID |
| FreeRADIUS queue concurrency | **[FIXED]** | Atomic claim prevents duplicate processing |

### Tests Not Run (Environment Limitations)
- Cron lock tests: Require VPS database access (MySQL binds to localhost on VPS)
- Full backend build: Pre-existing errors in unrelated files (session typing, BigInt)
- Frontend build: Not run (no changes to build configuration)
- VPS deployment verification: Not yet performed

---

## 15. Remaining Issues

1. **Pre-existing backend typecheck errors**: `session.user.role` and `session.user.id` typing issues in ~40 files. These are pre-existing and not caused by this audit. Fix requires updating the NextAuth session type augmentation.

2. **Pre-existing transaction gaps**: `pppoe.service.ts` and `extend/route.ts` multi-table operations are not transactional. This is a pre-existing design issue. The retry queue provides eventual consistency for RADIUS operations.

3. **WebhookLog unique constraint**: No DB-level unique constraint on `(gateway, transactionId)`. Application-level dedup check has a race window. However, the atomic conditional updates in all payment handlers prevent double-processing even if the dedup check races.

4. **Cron lock tests not run on VPS**: Tests are written but require VPS database access to execute.

5. **RADIUS_COA_SECRET**: Previously noted as missing on VPS. Not addressed in this audit (configuration issue, not code issue).

---

## 16. Final Status

### Code Changes: **[FIXED]**
All identified issues have been fixed in code.

### Local Tests: **[TESTED]**
Timezone tests: 27/27 passed. Typecheck: no new errors.

### VPS Verification: **[NOT YET PERFORMED]**
Changes have not been deployed to the VPS. The following must be verified after deployment:
- Cron lock acquisition with heartbeat
- CRON_SECRET fail-fast behavior
- RADIUS queue atomic claim
- GenieACS technician device filtering
- Company timezone in cron schedule

### Production Readiness: **NOT PRODUCTION READY**

The code changes are complete and locally verified, but production readiness requires:
1. Deploy to VPS
2. Run cron lock tests on VPS
3. Verify cron heartbeat is active in PM2 logs
4. Verify CRON_SECRET fail-fast (temporarily unset and confirm cron-runner exits)
5. Verify GenieACS technician device filtering (field technician should only see assigned devices)
6. Run full backend build
7. Run frontend build
8. Verify all PM2 processes restart cleanly

**Do NOT deploy to production until these verification steps are completed.**
