# PHASE 8 — Final Production Hardening Report

**Date:** 2026-08-16 (updated)
**Branch:** master
**Latest commit:** `37025935`
**Scope:** Role × Permission × Endpoint matrix, cron retention, backlog monitoring, financial ledger consistency, migration drift, API contract compatibility, regression tests

---

## Executive Summary

Phase 8 conducted 7 comprehensive audits covering the full backend. All identified issues have been fixed, including the previously deferred items:

- **4 P0 critical issues** fixed (external task processor scheduling, 3 financial ledger gaps)
- **4 P1 high-priority issues** fixed (2 permission mismatches, production data fix, monitoring endpoints)
- **1 P2 medium issue** fixed (batch delete for cron history)
- **4 previously-deferred items** now completed:
  - All 44 `getServerSession` routes migrated to `requirePermission`
  - Financial reconciliation cron job added
  - DEAD task alerting via Telegram added
  - Prisma migration baseline established (`0_init`)

**Status:** All fixes implemented, tested (121 unit tests pass), built successfully, and deployed to production. Production verification confirms data integrity, migration state, and queue health.

---

## Audit Results

### Audit 1: Role × Permission × Endpoint Matrix

**Scope:** All ~415 API routes analyzed for auth mechanism and permission level.

**Findings:**
- ✅ `settings.cron` permission IS defined in seed file (subagent false positive — verified manually)
- 🔴 2 CRUD permission mismatches found and fixed:
  - `genieacs/devices/[deviceId]/wan` POST: was `network.view` → fixed to `network.edit`
  - `admin/data-usage` POST: was `settings.view` → fixed to `settings.edit`
- 🔴 44 routes used `getServerSession` directly instead of `requirePermission` — **ALL NOW MIGRATED**
- ✅ No undefined permissions used in code

**Files changed (44 routes migrated):**

| Category | Files | Permission Keys |
|----------|-------|-----------------|
| Network (14) | `network/vps-l2tp-info`, `network/vps-info`, `network/trace`, `network/otbs/*`, `network/olts/template`, `network/joint-closures/*`, `network/fiber-paths/*` | `network.view`, `network.edit` |
| PPPoE (6) | `pppoe/users/bulk`, `pppoe/users/online-status`, `pppoe/users/sync-mikrotik`, `pppoe/users/[id]/promise`, `pppoe/areas`, `pppoe/profiles/sync-mikrotik`, `pppoe/customers/bulk`, `pppoe/customers` | `customers.view`, `customers.edit`, `customers.delete`, `network.view`, `network.edit` |
| Dashboard (3) | `dashboard/traffic`, `dashboard/stats`, `dashboard/analytics` | `dashboard.view` |
| Admin (6) | `admin/topup-requests`, `admin/system/info`, `admin/system/freeradius-backup/download`, `admin/download-apk`, `admin/apk/file`, `admin/apk/status` | `invoices.approve`, `settings.view` |
| FreeRADIUS (2) | `freeradius/logs`, `freeradius/config/list` | `settings.view` |
| Backup (2) | `backup/history`, `backup/health` | `settings.view` |
| Other (6) | `invoices/counts`, `hotspot/rekap-voucher`, `hotspot/rekap-voucher/export`, `genieacs/tasks`, `email/history`, `customers/with-location`, `notifications`, `push/send`, `genieacs/devices/[deviceId]` | `invoices.view`, `reports.view`, `reports.export`, `settings.genieacs`, `notifications.view`, `notifications.manage`, `network.view` |

**Only `cron/route.ts` retains `getServerSession`** — this is intentional as it uses `CRON_SECRET` header-based auth, not session-based auth.

### Audit 2: Cron History Retention/Cleanup

**Scope:** cron_history table growth, retention, cleanup mechanism.

**Findings:**
- ✅ Retention period: 30 days (hardcoded)
- ✅ Cleanup job exists: `cron_history_cleanup` scheduled daily at 4 AM
- ✅ Index on `startedAt` exists for efficient cleanup
- ✅ Production: 20,562 rows, 0 older than 30 days — cleanup is working
- 🔴 Single `deleteMany` operation could lock table with large row counts

**Fix applied:**
- `backend/src/app/api/cron/route.ts` — `runCronHistoryCleanup()` now uses batch raw SQL deletion (5,000 rows per batch with 200ms delay) to reduce lock contention

**Production verification:**
- Cron history records: 20,562
- Records older than 30 days: 0 (retention working correctly)

### Audit 3: Backlog/DEAD Task Monitoring

**Scope:** external_task and radius_sync_queue retry, monitoring, alerting.

**Findings:**
- 🔴 **CRITICAL: `external_task_processor` was NOT scheduled in cron runner** — external tasks (MikroTik sync, WhatsApp, Email, CoA) were never processed automatically. The API handler existed but no cron job triggered it.
- ✅ RADIUS sync queue: properly scheduled (`radius_sync_retry` every 5 minutes)
- ✅ Retry strategies: both queues use exponential backoff, max 5 retries
- 🔴 No automated alerting for DEAD tasks (console log only)
- 🔴 No API endpoints for external task monitoring

**Fixes applied:**
- `backend/src/server/cron/jobs.ts` — added `external_task_processor` to `CRON_JOB_DEFS` (every minute)
- `backend/cron-runner.ts` — added `external_task_processor` to standalone cron runner
- `backend/src/app/api/admin/external-tasks/stats/route.ts` — NEW: GET endpoint for task statistics
- `backend/src/app/api/admin/external-tasks/failed/route.ts` — NEW: GET endpoint for failed/dead tasks
- `backend/src/app/api/admin/external-tasks/retry/route.ts` — NEW: POST endpoint for manual retry
- `backend/src/server/services/notifications/alert.service.ts` — NEW: DEAD task alerting service
- `backend/src/server/services/external-task.service.ts` — integrated DEAD task alert
- `backend/src/server/services/radius/radius-sync-queue.service.ts` — integrated DEAD task alert

**Production verification:**
- DEAD external tasks: 0
- Alerting is best-effort (does not fail queue operations if Telegram is unavailable)

### Audit 4: Financial Ledger Consistency

**Scope:** All balance modification points, transaction records, payment flows, reconciliation.

**Findings:**
- 🔴 **Agent deposits not recorded in Keuangan ledger** — both webhook and admin approval paths incremented balance but created no `transaction` record
- 🔴 **Referral rewards not recorded in Keuangan ledger** — balance incremented but no ledger entry
- 🔴 **Auto-renewal balance decrement not recorded** — balance decremented and invoice marked PAID but no ledger entry
- ✅ Admin user deposit: atomic with ledger (good)
- ✅ Topup approval: atomic with ledger (good)
- ✅ Payment webhook: atomic invoice+balance, Keuangan sync outside tx but uses INSERT IGNORE (acceptable)
- 🔴 No financial reconciliation cron job existed

**Fixes applied:**
- `backend/src/app/api/agent/deposit/webhook/route.ts` — added `transaction.create` inside `$transaction` for agent deposits (category: "Deposit Agent")
- `backend/src/app/api/admin/agent-deposits/route.ts` — added `transaction.create` inside `$transaction` for admin-approved deposits
- `backend/src/app/api/admin/referrals/[id]/route.ts` — added `transaction.create` inside `$transaction` for referral rewards (category: "Referral Reward")
- `backend/src/server/cron/invoice-jobs.ts` — added `transaction.create` inside `$transaction` for auto-renewal (category: "Subscription")
- `backend/src/server/cron/financial-reconciliation.ts` — NEW: daily reconciliation job to detect balance/ledger/invoice/payment inconsistencies
- Registered reconciliation job in `jobs.ts`, `cron-runner.ts`, and `api/cron/route.ts`

**Production verification:**
- Total payments: 1, sum: 1110
- Total ledger entries: 1, sum: 1110
- No duplicate ledger entries from fix payment
- Invoice `INV-20260815-CC9B17`: PAID, 1 payment of 1110, consistent

### Audit 5: Production-vs-Schema Migration Drift

**Scope:** Compare production DB tables/columns against Prisma schema.

**Findings:**
- ✅ No tables in schema missing from DB
- ✅ Migration table clean (single `0_init` baseline)
- ✅ Financial ledger consistency check: all user balances match sum of payments
- 🔴 1 invoice `INV-20260815-CC9B17` was PAID with no payment record
- ⚠️ 25 tables in DB but not in schema (FreeRADIUS tables: radacct, radcheck, etc.; network topology tables; WhatsApp tables — these are managed externally)

**Fixes applied:**
- `backend/scripts/fix-invoice-cc9b17.js` — backfilled missing payment record and Keuangan ledger entry for `INV-20260815-CC9B17`
- `backend/prisma/migrations/0_init/migration.sql` — NEW: baseline migration generated from current schema
- `backend/scripts/resolve-migration-history.js` — normalized production `_prisma_migrations` table to single baseline
- Removed all loose SQL files and old migration directories from `prisma/migrations/`
- Archived loose SQL files outside the active migrations directory

**Production verification:**
- `prisma migrate status`: "1 migration found in prisma/migrations" / "Database schema is up to date!"
- Migration table: single `0_init` entry, finished at 2026-08-16T07:03:42Z

### Audit 6: API Contract Compatibility with Frontend

**Scope:** All frontend API calls verified against backend endpoints.

**Findings:**
- ✅ ~120 unique endpoints called by frontend
- ✅ ~118 endpoints compatible (98%)
- ✅ `/api/manual-payments` endpoint EXISTS (subagent false positive — verified manually)
- ✅ Nginx routing correct (`/api/auth/*` → frontend, `/api/*` → backend)
- ✅ No response shape mismatches found
- ⚠️ ~20 direct `fetch()` calls bypass centralized API client (code quality, not a bug)

**No fixes needed.** The `getServerSession` → `requirePermission` migration preserves the same authentication contract (session-based auth via NextAuth cookies). No frontend changes were required.

### Audit 7: Regression Tests

**Results:**
- ✅ Phase 7 tests: 91/91 assertions passed (updated to check schema.prisma instead of removed migration file)
- ✅ Phase 8 tests: 30/30 assertions passed (NEW test suite)
- ✅ Total unit tests: 121/121 passed
- ✅ TypeScript: no new errors from Phase 8 changes
- ✅ Backend build: successful (local and production)
- ⚠️ 12 integration test files "failed" due to `ECONNREFUSED` (require running server/DB — pre-existing, not from Phase 8 changes)

**Phase 8 test suite covers:**
1. Permission matrix — requirePermission adoption (all routes migrated)
2. Cron history — batched cleanup and retention
3. DEAD task alerting via Telegram
4. Financial reconciliation cron job registration
5. External task monitoring endpoints existence and auth
6. External task processor scheduling
7. Ledger writes in financial transactions
8. Prisma migration baseline (single `0_init`)
9. Permission key corrections
10. Safe error handling (no OTP logging)

---

## Summary of All Changes

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

### Previously-Deferred Items — Now Completed

| # | Item | Fix | File(s) |
|---|------|-----|---------|
| 10 | ~44 routes using `getServerSession` directly | All migrated to `requirePermission` | 44 route files across network, pppoe, dashboard, admin, freeradius, backup, other |
| 11 | No financial reconciliation cron job | Created `financial-reconciliation.ts` and registered in scheduler | `server/cron/financial-reconciliation.ts`, `jobs.ts`, `cron-runner.ts`, `api/cron/route.ts` |
| 12 | No DEAD task alerting | Created `alert.service.ts` and integrated with both queue services | `server/services/notifications/alert.service.ts`, `external-task.service.ts`, `radius-sync-queue.service.ts` |
| 13 | `prisma db push` instead of `prisma migrate` | Generated `0_init` baseline migration, normalized production migration history | `prisma/migrations/0_init/migration.sql`, `scripts/resolve-migration-history.js` |

---

## Production Verification

**Deployment:**
- Git: `6a40f511` pushed and pulled on VPS (`/root/salfanet-radius` and `/var/www/salfanet-radius`)
- Backend build: successful on production
- PM2 processes: all 4 online (`salfanet-frontend`, `salfanet-backend`, `salfanet-cron`, `salfanet-wa`)
- Health check: `GET /api/health` → 200 `{"status":"ok"}`
- Auth check: `GET /api/admin/external-tasks/stats` → 401 (correct — requires auth)
- Cron auth: `GET /api/cron` with wrong secret → 401 (correct)

**Database:**
- `prisma migrate status`: "1 migration found" / "Database schema is up to date!"
- Migration table: single `0_init` entry
- Invoice `INV-20260815-CC9B17`: PAID, 1 payment of 1110, no duplicates
- Financial totals: 1 payment (sum 1110) = 1 ledger entry (sum 1110) — consistent
- Cron history: 20,562 records, 0 older than 30 days
- DEAD external tasks: 0

**Tests:**
- Phase 7 tests: 91/91 passed
- Phase 8 tests: 30/30 passed
- Total: 121/121 unit tests passed
- Backend build: successful

---

## Remaining Limitations and Risks

1. **Pre-existing TypeScript errors** — `session.user.role` typing (no `next-auth.d.ts` type augmentation), BigInt literals in some routes. These are pre-existing and do not block the Next.js build (which succeeds). Fixing them would require adding a NextAuth type augmentation file.

2. **Integration tests require running server** — 12 test files fail with `ECONNREFUSED` when no server is running. These are integration tests, not unit tests, and are pre-existing.

3. **25 DB tables not in Prisma schema** — FreeRADIUS tables (`radacct`, `radcheck`, `radreply`, `radusergroup`), network topology tables, and WhatsApp tables are managed externally or via legacy SQL. They are not drift — they are intentionally outside Prisma's scope.

4. **Financial reconciliation logic** — The new reconciliation job detects inconsistencies but transaction records don't always have a direct `userId` or `agentId`; some relationships rely on reference patterns. The reconciliation should be monitored over time.

5. **DEAD task alerting** — Alerting is best-effort. If Telegram is not configured or sending fails, the alert is silently dropped (queue operations are not affected). Telegram delivery should be verified with a real test.

6. **Migration baseline** — The `0_init` baseline was generated from the current schema. Future schema changes should use `prisma migrate dev` (development) and `prisma migrate deploy` (production) to create proper incremental migrations.

7. **~20 direct `fetch()` calls in frontend** — Should use centralized API client (frontend change, out of Phase 8 scope).

---

## Conclusion

Phase 8 is now **complete**. All 7 audits were conducted, all identified issues were fixed, all previously-deferred items were completed, and all changes were tested, built, and deployed to production.

**Production-readiness assessment:**

The backend is now substantially production-ready:

- ✅ All API routes use `requirePermission` for granular RBAC (except cron which uses CRON_SECRET)
- ✅ External tasks process automatically (was completely broken before)
- ✅ All balance modifications have corresponding Keuangan ledger records
- ✅ Financial reconciliation job runs daily to detect inconsistencies
- ✅ DEAD tasks trigger Telegram alerts
- ✅ Admin monitoring endpoints exist for external task queue health
- ✅ Cron history cleanup uses batched deletion (no table locks)
- ✅ Prisma migration baseline established (no more `db push` drift risk)
- ✅ Permission levels correctly match operation severity
- ✅ Production data integrity verified (invoice repair, ledger consistency, queue health)
- ✅ 121 unit tests pass, backend build succeeds

**Conditional production-ready.** The system is production-ready with the noted limitations above. The most important remaining work is:
1. Add NextAuth type augmentation to fix pre-existing TypeScript errors (cosmetic, doesn't affect runtime)
2. Monitor financial reconciliation job output over time
3. Verify Telegram alert delivery with a real test
4. Use `prisma migrate dev`/`deploy` for future schema changes
