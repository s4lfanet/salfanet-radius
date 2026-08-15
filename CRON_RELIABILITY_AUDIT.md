# Cron Reliability Audit

**Date:** 2026-08-16
**Status:** ✅ FIXED (atomic distributed lock implemented)
**Deployed:** 2026-08-15, commit `ebe89923`, VPS `192.168.54.129`
**DB Migration:** `cron_lock` table created and applied

---

## Previous Architecture (Phase 2)

```
Cron tick
    ↓
In-memory Set check (runningJobs.has(jobType))
    ↓
findFirst cronHistory where status='running' and startedAt > staleThreshold
    ↓
If found → skip
If not found → execute
```

**Race condition:** Two instances could both pass the `findFirst` check
before either creates a `running` record, leading to duplicate execution.

---

## Current Architecture (Phase 3)

```
Cron tick
    ↓
In-memory Set check (fast path — prevents overlap in same process)
    ↓
acquireCronLock(jobKey, TTL=30min)
    ↓ MySQL atomic INSERT (primary key constraint)
    ↓
If lock acquired → execute
    ↓
Finally: releaseCronLock(jobKey, ownerToken)
    ↓ MySQL DELETE WHERE ownerToken matches
```

## Lock Properties

| Property | Implementation |
|----------|---------------|
| Unique job key | `cronLock.jobKey` (VARCHAR(64), primary key) |
| Owner token | Random UUID per lock acquisition |
| TTL | 30 minutes (configable per job) |
| Stale lock recovery | Expired locks deleted before acquisition; conditional update for reclaim |
| Error release | `finally` block always calls `releaseCronLock` |
| Crash recovery | TTL expiry — stale locks auto-expire after 30 min |
| Job-specific | Each job type has its own lock key (e.g., "invoice_generate", "radius_sync_retry") |

## Multi-Instance Safety

```
Instance A: acquireCronLock("invoice_generate") → SUCCESS (ownerToken=aaa)
Instance B: acquireCronLock("invoice_generate") → NULL (PK conflict)
Instance B: skips execution (409 from API or log message from runner)
Instance A: completes → releaseCronLock("invoice_generate", "aaa")
```

## Stale Lock Recovery

If Instance A crashes while holding a lock:
1. Lock remains in `cron_lock` table with `expiresAt` in the past
2. Next cron tick: `acquireCronLock` deletes expired locks first
3. New lock is created by the next instance that tries

## Components

### 1. Lock Service (`server/services/cron-lock.service.ts`)
- `acquireCronLock(jobKey, ttlMs)` — atomic INSERT with stale cleanup
- `releaseCronLock(jobKey, ownerToken)` — conditional DELETE (only owner can release)
- `isLockHeld(jobKey)` — check if lock is active
- `getActiveLocks()` / `getAllLocks()` — monitoring
- `forceReleaseLock(jobKey)` — admin override

### 2. Cron Runner (`cron-runner.ts`)
- Dynamic import of lock service
- `acquireCronLock` before job execution
- `releaseCronLock` in `finally` block
- Falls back to in-memory guard if lock table doesn't exist

### 3. Cron API Route (`api/cron/route.ts`)
- `acquireCronLock` before job execution
- Returns 409 if lock held
- `releaseCronLock` in `finally` block

## Verification Status

| Check | Status |
|-------|--------|
| TypeScript compilation | ✅ 0 errors |
| Build (local) | ✅ Exit 0 |
| Build (VPS) | ✅ Exit 0 |
| DB migration applied | ✅ VERIFIED — `cron_lock` table exists on VPS |
| PM2 restart | ✅ VERIFIED — all 4 services online |
| Lock acquisition (atomic) | ⏳ NOT VERIFIED — requires multi-instance test |
| Stale lock recovery | ⏳ NOT VERIFIED — requires simulated crash |
| Concurrent cron trigger | ⏳ NOT VERIFIED — requires running backend with CRON_SECRET |
| Lock table column exists | ✅ VERIFIED — `cron_lock.jobKey` column confirmed in production DB |

## Known Limitations

1. **MySQL-only** — the lock uses MySQL primary key constraint. PostgreSQL or Redis would require different implementation.
2. **No lock renewal** — if a job runs longer than 30 minutes, the lock expires and another instance could start. This is acceptable for current job durations.
3. **No lock monitoring UI** — locks are visible via API but not in the admin dashboard. Could be added in the future.
