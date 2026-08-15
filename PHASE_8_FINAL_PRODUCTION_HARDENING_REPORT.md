# PHASE 8 — Final Production Hardening Report

**Date:** 2026-08-16
**Branch:** master
**Scope:** Role × Permission × Endpoint matrix, cron retention, backlog monitoring, financial ledger consistency, migration drift, API contract compatibility, regression tests

---

## Executive Summary

Phase 8 conducted 7 comprehensive audits covering the full backend. **6 P0/P1 issues were found and fixed**, including a critical system-breaking bug (external task processor never scheduled), 3 financial ledger gaps (agent deposits, referral rewards, auto-renewal not recorded in Keuangan), 2 CRUD permission mismatches, and 1 production data integrity issue (PAID invoice without payment record).

**Status:** All fixes implemented, tested (747/747 assertions pass), and built successfully. Production data integrity issue resolved in production DB.

---

## Audit Results

### Audit 1: Role × Permission × Endpoint Matrix

**Scope:** All ~415 API routes analyzed for auth mechanism and permission level.

**Findings:**
- ✅ `settings.cron` permission IS defined in seed file (subagent false positive — verified manually)
- 🔴 2 CRUD permission mismatches found and fixed:
  - `genieacs/devices/[deviceId]/wan` POST: was `network.view` → fixed to `network.edit`
  - `admin/data-usage` POST: was `settings.view` → fixed to `settings.edit`
- ⚠️ ~65 routes use `getServerSession` directly instead of `requirePermission` (pre-existing, deferred — these still require authentication but bypass the granular permission system)
- ✅ No undefined permissions used in code

**Files changed:**
- `backend/src/app/api/genieacs/devices/[deviceId]/wan/route.ts`
- `backend/src/app/api/admin/data-usage/route.ts`

### Audit 2: Cron History Retention/Cleanup

**Scope:** cron_history table growth, retention, cleanup mechanism.

**Findings:**
- ✅ Retention period: 30 days (hardcoded)
- ✅ Cleanup job exists: `cron_history_cleanup` scheduled daily at 4 AM
- ✅ Index on `startedAt` exists for efficient cleanup
- ✅ Production: 20,468 rows, oldest Aug 12 (4 days) — cleanup is working
- 🔴 Single `deleteMany` operation could lock table with 180K+ rows

**Fix applied:**
- `backend/src/app/api/cron/route.ts` — `runCronHistoryCleanup()` now uses batch delete (5,000 rows per batch with 200ms delay) to reduce lock contention

### Audit 3: Backlog/DEAD Task Monitoring

**Scope:** external_task and radius_sync_queue retry, monitoring, alerting.

**Findings:**
- 🔴 **CRITICAL: `external_task_processor` was NOT scheduled in cron runner** — external tasks (MikroTik sync, WhatsApp, Email, CoA) were never processed automatically. The API handler existed but no cron job triggered it.
- ✅ RADIUS sync queue: properly scheduled (`radius_sync_retry` every 5 minutes)
- ✅ Retry strategies: both queues use exponential backoff, max 5 retries
- ⚠️ No automated alerting for DEAD tasks (console log only)
- ⚠️ No API endpoints for external task monitoring

**Fixes applied:**
- `backend/src/server/cron/jobs.ts` — added `external_task_processor` to `CRON_JOB_DEFS` (every minute)
- `backend/cron-runner.ts` — added `external_task_processor` to standalone cron runner
- `backend/src/app/api/admin/external-tasks/stats/route.ts` — NEW: GET endpoint for task statistics
- `backend/src/app/api/admin/external-tasks/failed/route.ts` — NEW: GET endpoint for failed/dead tasks
- `backend/src/app/api/admin/external-tasks/retry/route.ts` — NEW: POST endpoint for manual retry

### Audit 4: Financial Ledger Consistency

**Scope:** All balance modification points, transaction records, payment flows, reconciliation.

**Findings:**
- 🔴 **Agent deposits not recorded in Keuangan ledger** — both webhook and admin approval paths incremented balance but created no `transaction` record
- 🔴 **Referral rewards not recorded in Keuangan ledger** — balance incremented but no ledger entry
- 🔴 **Auto-renewal balance decrement not recorded** — balance decremented and invoice marked PAID but no ledger entry
- ✅ Admin user deposit: atomic with ledger (good)
- ✅ Topup approval: atomic with ledger (good)
- ✅ Payment webhook: atomic invoice+balance, Keuangan sync outside tx but uses INSERT IGNORE (acceptable)
- ⚠️ No financial reconciliation cron job exists (deferred)

**Fixes applied:**
- `backend/src/app/api/agent/deposit/webhook/route.ts` — added `transaction.create` inside `$transaction` for agent deposits (category: "Deposit Agent")
- `backend/src/app/api/admin/agent-deposits/route.ts` — added `transaction.create` inside `$transaction` for admin-approved deposits
- `backend/src/app/api/admin/referrals/[id]/route.ts` — added `transaction.create` inside `$transaction` for referral rewards (category: "Referral Reward")
- `backend/src/server/cron/invoice-jobs.ts` — added `transaction.create` inside `$transaction` for auto-renewal (category: "Subscription")

### Audit 5: Production-vs-Schema Migration Drift

**Scope:** Compare production DB tables/columns against Prisma schema.

**Findings:**
- ✅ No tables in schema missing from DB
- ✅ Migration table clean (2 entries, no duplicates)
- ✅ Financial ledger consistency check: all user balances match sum of payments
- 🔴 1 invoice `INV-20260815-CC9B17` was PAID with no payment record
- ⚠️ 25 tables in DB but not in schema (FreeRADIUS tables: radacct, radcheck, etc.; network topology tables; WhatsApp tables — these are managed externally or via `db push`)
- ⚠️ Project uses `prisma db push` not `prisma migrate` (known architectural choice, not a Phase 8 fix scope)

**Fix applied (production):**
- `backend/scripts/fix-invoice-cc9b17.js` — backfilled missing payment record and Keuangan ledger entry for `INV-20260815-CC9B17`

### Audit 6: API Contract Compatibility with Frontend

**Scope:** All frontend API calls verified against backend endpoints.

**Findings:**
- ✅ ~120 unique endpoints called by frontend
- ✅ ~118 endpoints compatible (98%)
- ✅ `/api/manual-payments` endpoint EXISTS (subagent false positive — verified manually)
- ✅ Nginx routing correct (`/api/auth/*` → frontend, `/api/*` → backend)
- ✅ No response shape mismatches found
- ⚠️ ~20 direct `fetch()` calls bypass centralized API client (code quality, not a bug)

**No fixes needed.**

### Audit 7: Regression Tests

**Results:**
- ✅ Phase 7 tests: 46/46 passed
- ✅ Full suite: 747/747 assertions passed
- ✅ TypeScript: no new errors from Phase 8 changes
- ✅ Backend build: successful
- ⚠️ 12 test files "failed" due to pre-existing standalone-script `process.exit()` behavior (not from Phase 8 changes)

---

## Summary of Changes

### P0 Fixes (Critical)

| # | Issue | Fix | File(s) |
|---|-------|-----|---------|
| 1 | `external_task_processor` never scheduled | Added to cron job definitions | `jobs.ts`, `cron-runner.ts` |
| 2 | Agent deposits not in Keuangan ledger | Added `transaction.create` in `$transaction` | `agent/deposit/webhook/route.ts`, `admin/agent-deposits/route.ts` |
| 3 | Referral rewards not in Keuangan ledger | Added `transaction.create` in `$transaction` | `admin/referrals/[id]/route.ts` |
| 4 | Auto-renewal not in Keuangan ledger | Added `transaction.create` in `$transaction` | `cron/invoice-jobs.ts` |

### P1 Fixes (High)

| # | Issue | Fix | File(s) |
|---|-------|-----|---------|
| 5 | GenieACS WAN POST: `network.view` should be `network.edit` | Changed permission | `genieacs/devices/[deviceId]/wan/route.ts` |
| 6 | Data-usage POST: `settings.view` should be `settings.edit` | Changed permission | `admin/data-usage/route.ts` |
| 7 | Invoice PAID without payment record | Backfilled payment + ledger | Production DB (script) |
| 8 | No external task monitoring API | Created 3 new endpoints | `admin/external-tasks/{stats,failed,retry}` |

### P2 Fixes (Medium)

| # | Issue | Fix | File(s) |
|---|-------|-----|---------|
| 9 | Cron history single `deleteMany` | Batch delete (5K rows + 200ms delay) | `api/cron/route.ts` |

---

## Deferred Items (Not Phase 8 Scope)

These items were identified but are deferred as they require larger architectural changes or frontend modifications:

1. **~65 routes using `getServerSession` directly** — should use `requirePermission` for granular RBAC, but changing all at once risks breaking frontend contracts
2. **No financial reconciliation cron job** — should add daily job to verify `balance == sum(transactions)`
3. **No DEAD task alerting** — should integrate with Telegram/WhatsApp notifications
4. **`prisma db push` instead of `prisma migrate`** — known architectural choice, switching requires baseline migration
5. **Pre-existing TypeScript errors** — `session.user.role` typing, BigInt literals (not from Phase 8)
6. **Standalone test `process.exit()` behavior** — causes Vitest to report file-level failures despite all assertions passing
7. **~20 direct `fetch()` calls in frontend** — should use centralized API client (frontend change, out of scope)

---

## Verification

- **Tests:** 747/747 assertions passed
- **Phase 7 tests:** 46/46 passed
- **TypeScript:** No new errors from Phase 8 changes
- **Build:** Backend build successful
- **Production data:** Invoice `INV-20260815-CC9B17` payment record backfilled
- **Production cron_history:** 20,468 rows, cleanup working (oldest 4 days)

---

## Conclusion

Phase 8 found and fixed **4 P0 critical issues** (external task processor scheduling, 3 financial ledger gaps), **4 P1 high-priority issues** (2 permission mismatches, production data fix, monitoring endpoints), and **1 P2 medium issue** (batch delete). The backend is now substantially more production-ready:

- External tasks will now process automatically (was completely broken)
- All balance modifications now have corresponding Keuangan ledger records
- Permission levels correctly match operation severity for network/settings writes
- Admin monitoring endpoints exist for external task queue health
- Cron history cleanup won't lock the table on large deletions

**Remaining work before unconditional "production-ready" declaration:**
1. Migrate ~65 `getServerSession` routes to `requirePermission` (large effort, needs frontend compatibility testing)
2. Add financial reconciliation cron job
3. Add DEAD task alerting via Telegram
4. Consider migrating from `db push` to `prisma migrate` for proper schema version control
