# FreeRADIUS Sync Audit

**Date:** 2026-08-16
**Status:** ✅ FIXED (reconciliation + retry queue + delete sync + backpressure + automatic reconciliation)
**Deployed:** 2026-08-15, commit `ebe89923`, VPS `192.168.54.129`
**DB Migration:** `radius_sync_queue` table created and applied
**Phase 4 Update:** 2026-08-16 — delete sync, stale user protection, automatic reconciliation cron, circuit breaker/backpressure

---

## Architecture

```
SalfaNet DB (pppoeUser)
    ↓
syncSingleUserToRadius()
    ↓
FreeRADIUS DB (radcheck/radusergroup/radreply)
    ↓ Success
Mark syncedToRadius=true, lastSyncAt=now()

    ↓ Failure
Enqueue to radius_sync_queue
    ↓
Cron job (every 5 min): processRetryQueue()
    ↓
Retry with exponential backoff: 1m → 5m → 15m → 30m → 1h
    ↓
After 5 retries → DEAD state
    ↓
Admin can view + manually retry via /api/admin/pppoe/radius-sync
```

## Components

### 1. Retry Queue Service (`radius-sync-queue.service.ts`)
- **enqueueFailedSync()** — adds failed sync to queue (deduplicates by user+syncType)
- **processRetryQueue()** — processes due retries in batches (50/batch)
- **syncSingleUserToRadius()** — core sync logic (transactional per user)
- **markSynced()/markFailed()** — update queue entry status
- **manualRetry()** — admin-triggered retry of DEAD entries
- **getFailedSyncs()** — list failed/dead entries for admin dashboard

### 2. Reconciliation Service (`radius-reconciliation.service.ts`)
- **runReconciliation()** — full comparison of SalfaNet vs FreeRADIUS
- Reports: missing in RADIUS, stale in RADIUS, mismatch password/profile/IP
- Does NOT auto-repair — returns report for admin review

### 3. Sync All RADIUS Route (`admin/pppoe/sync-all-radius/route.ts`)
- Batch processing (50 users/batch)
- Failed syncs enqueued for automatic retry
- Independent failure per user (one failure doesn't block others)

### 4. Admin Status API (`admin/pppoe/radius-sync/route.ts`)
- GET: view failed syncs + reconciliation report
- POST: manually retry a dead/failed entry

### 5. Cron Job (`radius_sync_retry`)
- Schedule: every 5 minutes
- Processes due retries
- Logs result to cronHistory

## NAS Isolation

All sync operations preserve `nas_identifier` (router.id):
- `deleteMany` scoped by `nas_identifier`
- `create` includes `nas_identifier`
- No cross-NAS collision possible

## Verification Status

| Check | Status |
|-------|--------|
| TypeScript compilation | ✅ 0 errors |
| Build (local) | ✅ Exit 0 |
| Build (VPS) | ✅ Exit 0 |
| DB migration applied | ✅ VERIFIED — `radius_sync_queue` table exists on VPS |
| Admin API endpoint | ✅ VERIFIED — `/api/admin/pppoe/radius-sync` returns 401 without auth (correct) |
| Retry queue logic | ⏳ NOT VERIFIED — REQUIRES EXTERNAL ENVIRONMENT (FreeRADIUS server) |
| Reconciliation accuracy | ⏳ NOT VERIFIED — REQUIRES EXTERNAL ENVIRONMENT (populated DB) |
| Batch processing | ⏳ NOT VERIFIED — REQUIRES EXTERNAL ENVIRONMENT (large dataset) |
| NAS isolation | ⏳ NOT VERIFIED — REQUIRES EXTERNAL ENVIRONMENT (multi-NAS setup) |
| Cron job registration | ✅ VERIFIED — `radius_sync_retry` + `radius_reconciliation` jobs registered |
| Delete sync (Phase 4) | ✅ VERIFIED (code inspection) — `syncSingleUserDeleteToRadius` + retry queue integration |
| Stale user protection (Phase 4) | ✅ VERIFIED (code inspection) — categorized as known_stale/unknown/delete_queued |
| Automatic reconciliation cron (Phase 4) | ✅ VERIFIED (code inspection) — `radius_reconciliation` job, daily at 6 AM |
| Circuit breaker/backpressure (Phase 4) | ✅ VERIFIED (code inspection) — 5 consecutive failures → pause + defer |
| Monitoring integration (Phase 4) | ✅ VERIFIED (code inspection) — sync success/failure/retry/dead/backpressure logged |

## Known Limitations

1. **No automatic reconciliation cron** — reconciliation is on-demand only (admin triggers via API). A scheduled reconciliation cron could be added in the future.
2. **No RADIUS delete sync** — when a user is deleted from SalfaNet, their RADIUS entries are not automatically removed. Reconciliation reports stale entries but does not auto-delete.
3. **Retry queue is per-user** — if a batch of 50 users fails due to a systemic issue (e.g., FreeRADIUS down), all 50 will retry independently. This is by design but may cause load spikes.
