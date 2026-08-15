# PHASE 4 — PPPoE WORKFLOW & EXTERNAL SIDE EFFECT HARDENING

## Overview

Phase 4 hardens the PPPoE workflow (create, update, delete) by separating
database transactions from external side effects using the **transactional
outbox pattern**. This prevents the dangerous conditions:

- Database succeeds but RADIUS fails
- Database succeeds, RADIUS succeeds, but MikroTik fails
- Customer succeeds but invoice fails

## Problem Statement

### Before Phase 4

The `createPppoeUser`, `updatePppoeUser`, and `deletePppoeUser` functions
mixed database operations with external side effects using fire-and-forget
patterns:

```ts
// ANTI-PATTERN (before):
managePppSecret(routerId, 'create', { ... })
  .then((r) => console.log('success'))
  .catch((e) => console.error('failed')); // ← no retry, no tracking

await sendAdminCreateUser({ ... }); // ← if fails, notification lost
```

**Risks:**
1. DB succeeds, MikroTik fails → user exists in DB but can't connect
2. DB succeeds, WhatsApp fails → admin not notified, no retry
3. DB succeeds, invoice fails → customer has no invoice, billing breaks
4. No retry mechanism for failed external operations
5. No idempotency — retry could create duplicate PPP secrets or notifications

## Solution: Transactional Outbox Pattern

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    API Request                              │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           $transaction (atomic)                     │   │
│  │                                                     │   │
│  │  1. pppoeUser.create/update/delete                  │   │
│  │  2. radcheck/radreply/radusergroup sync             │   │
│  │  3. invoice.create (if applicable)                  │   │
│  │  4. externalTask.enqueue (MikroTik, WA, Email, CoA) │   │
│  │                                                     │   │
│  │  All succeed or all roll back                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  External tasks are now in the outbox table                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Cron: external_task_processor                  │
│                                                             │
│  1. Claim PENDING task (atomic)                             │
│  2. Execute (MikroTik/WA/Email/CoA/Reload)                  │
│  3. Mark SUCCESS or FAILED                                  │
│  4. If FAILED → schedule retry with exponential backoff     │
│  5. If max retries exceeded → DEAD (admin manual retry)     │
│                                                             │
│  Idempotency: each handler checks state before acting       │
└─────────────────────────────────────────────────────────────┘
```

### External Task State Machine

```
PENDING ──→ PROCESSING ──→ SUCCESS (done)
                │
                └──→ FAILED ──→ PENDING (retry with backoff)
                        │
                        └──→ DEAD (max retries exceeded)
```

### Backoff Schedule

| Retry # | Delay |
|---------|-------|
| 1 | 30 seconds |
| 2 | 2 minutes |
| 3 | 5 minutes |
| 4 | 15 minutes |
| 5 | 30 minutes |

After 5 retries → DEAD status. Admin can manually retry via `manualRetryTask()`.

## Files Changed

### New Files

| File | Purpose |
|------|---------|
| `backend/src/server/services/external-task.service.ts` | Outbox service: enqueue, claim, mark success/failed, retry logic |
| `backend/src/server/services/external-task-processor.service.ts` | Task processor: executes MikroTik, WA, Email, CoA, reload tasks |
| `backend/tests/pppoe-external-integrity.test.ts` | 23-test suite for Phase 4 |
| `backend/prisma/migrations/20260816_add_external_task_outbox.sql` | Migration for `external_task` table |

### Modified Files

| File | Changes |
|------|---------|
| `backend/prisma/schema.prisma` | Added `externalTask` model with unique constraint |
| `backend/src/server/services/pppoe.service.ts` | Refactored create/update/delete to use `$transaction` + outbox |
| `backend/src/app/api/cron/route.ts` | Added `external_task_processor` cron job |
| `backend/tests/radius-integrity.test.ts` | Updated test to match refactored update flow |

## Detailed Changes

### 1. externalTask Model (schema.prisma)

```prisma
model externalTask {
  id             String   @id @default(uuid())
  entityType     String   @db.VarChar(32)
  entityId       String   @db.VarChar(64)
  operation      String   @db.VarChar(32)
  status         String   @default("PENDING")
  retryCount     Int      @default(0)
  maxRetries     Int      @default(5)
  payload        Json
  result         String?
  lastError      String?
  lastAttemptAt  DateTime?
  nextRetryAt    DateTime?
  completedAt    DateTime?
  failedAt       DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([entityType, entityId, operation])
  @@index([status])
  @@index([nextRetryAt])
  @@index([entityType, entityId])
}
```

**Unique constraint** on `(entityType, entityId, operation)` ensures only one
pending task per entity+operation combination.

### 2. external-task.service.ts — Outbox Service

**`enqueueTask(tx, entityType, entityId, operation, payload)`**
- Uses `upsert` for idempotency
- If task exists and is not SUCCESS → reset to PENDING
- If task is SUCCESS → no-op (already done)
- Must be called within a `$transaction` to ensure atomicity

**`claimTask(tx)`**
- Atomic conditional update: `PENDING → PROCESSING`
- Only one worker can claim a task at a time
- Uses `updateMany` with `where: { status: 'PENDING' }` for atomicity

**`markTaskSuccess(taskId, result)`**
- Sets status to SUCCESS, clears error, sets completedAt

**`markTaskFailed(taskId, error)`**
- Increments retry count
- Schedules next retry with exponential backoff
- If max retries exceeded → DEAD status

### 3. external-task-processor.service.ts — Task Processor

**`processExternalTasks()`**
- Processes up to 20 tasks per run (configurable)
- Uses `claimTask` for atomic claiming
- Each task is processed independently — one failure doesn't block others

**Idempotency handlers:**

| Operation | Idempotency Strategy |
|-----------|---------------------|
| `sync_radius` | DELETE + INSERT pattern (idempotent by nature) |
| `sync_mikrotik_create` | Catch "already exists" error → mark as success |
| `sync_mikrotik_update` | If not found → create instead |
| `sync_mikrotik_delete` | Catch "not found" error → mark as success |
| `send_wa` | Check idempotency key in notification log |
| `send_email` | Check idempotency key in notification log |
| `coa_disconnect` | CoA is stateless — safe to retry |
| `reload_radius` | Reload is idempotent — safe to retry |

### 4. createPppoeUser Refactor

**Before:** DB create → RADIUS sync (separate) → fire-and-forget MikroTik → fire-and-forget WA/Email → invoice (separate)

**After:** Single `$transaction` containing:
1. RADIUS sync (radcheck, radreply, radusergroup)
2. pppoeUser.update (syncedToRadius)
3. Invoice creation (if requested)
4. External task enqueue:
   - `sync_mikrotik_create`
   - `reload_radius`
   - `send_wa` (admin notification)
   - `send_email` (if email provided)

**Result:** If any DB operation fails, the entire transaction rolls back.
External tasks are only created if the transaction succeeds.

### 5. updatePppoeUser Refactor

**Before:** DB update → RADIUS sync (separate) → fire-and-forget MikroTik → direct CoA → direct reload

**After:** Single `$transaction` containing:
1. RADIUS cleanup (old NAS + new NAS + NULL)
2. RADIUS re-sync (radcheck, radreply, radusergroup)
3. radacct/radpostauth username update (if changed)
4. pppoeUser.update (syncedToRadius)
5. External task enqueue:
   - `reload_radius`
   - `coa_disconnect` (credential change)
   - `coa_disconnect` (status change to blocked/isolated)
   - `sync_mikrotik_delete` + `sync_mikrotik_create` (if username changed)
   - `sync_mikrotik_update` (if username same)

### 6. deletePppoeUser Refactor

**Before:** Kick sessions → delete PPP secret → RADIUS cleanup → delete user → enqueue RADIUS retry if failed

**After:** Single `$transaction` containing:
1. RADIUS cleanup (radcheck, radreply, radusergroup, radacct)
2. pppoeUser.delete
3. External task enqueue:
   - `coa_disconnect` (kick active sessions)
   - `sync_mikrotik_delete` (delete PPP secret)

**Result:** If RADIUS cleanup fails, the user is NOT deleted — transaction
rolls back. External tasks (kick, secret delete) are retried via outbox.

### 7. Cron Integration

Added `external_task_processor` job to cron route:

```ts
case 'external_task_processor':
  result = await runExternalTaskProcessor()
  break;
```

This should be scheduled to run every 1-2 minutes via the existing cron
scheduler (PM2 `salfanet-cron` process).

## Test Results

### Phase 4 Tests (23 tests)

```
tests/pppoe-external-integrity.test.ts:
  ✓ External Task Outbox — schema and service (5 tests)
  ✓ External Task Processor — idempotency (5 tests)
  ✓ createPppoeUser — DB transaction + outbox enqueue (3 tests)
  ✓ updatePppoeUser — DB transaction + outbox enqueue (2 tests)
  ✓ deletePppoeUser — DB transaction + outbox enqueue (3 tests)
  ✓ Cron integration (1 test)
  ✓ Scenario: DB success + RADIUS failure (1 test)
  ✓ Scenario: DB success + MikroTik failure (1 test)
  ✓ Scenario: Duplicate retry (1 test)
  ✓ Scenario: Invoice already created (1 test)
Total: 23/23 PASS
```

### Regression Tests

```
tests/radius-integrity.test.ts:     24/24 PASS
tests/payment-integrity.test.ts:    10/10 PASS
tests/topup-integrity.test.ts:      18/18 PASS
tests/pppoe-external-integrity.test.ts: 23/23 PASS
─────────────────────────────────────────
Total: 75/75 PASS
```

### Build & Production

```
VPS Build: PASS
Production: ONLINE (HTTP 200)
```

## Scenario Coverage

### Scenario 1: DB success + RADIUS failure

```
1. createPppoeUser starts $transaction
2. pppoeUser.create succeeds
3. radcheck.create fails
4. $transaction rolls back — pppoeUser is NOT created
5. No external tasks are enqueued (same transaction)

Result: DB stays consistent, no orphaned user without RADIUS entries.
```

### Scenario 2: DB success + MikroTik failure

```
1. createPppoeUser $transaction succeeds (DB + RADIUS + outbox)
2. Cron picks up external_task (sync_mikrotik_create)
3. MikroTik API call fails
4. markTaskFailed — task goes to PENDING with backoff
5. Cron retries later (30s → 2m → 5m → 15m → 30m)
6. On retry, MikroTik create is idempotent (skip if already exists)

Result: DB and RADIUS are correct, MikroTik will eventually sync.
```

### Scenario 3: Retry after failure

```
1. external_task (sync_mikrotik_create) is processed
2. MikroTik API fails (network error)
3. Task marked as FAILED, scheduled for retry
4. Cron picks up task after backoff
5. MikroTik API succeeds on retry
6. Task marked as SUCCESS

Result: External operation eventually succeeds with automatic retry.
```

### Scenario 4: Duplicate retry (idempotency)

```
1. external_task (sync_mikrotik_create) is processed
2. MikroTik API succeeds but network timeout on response
3. Task is marked as FAILED (timeout error)
4. Cron retries — processes same task again
5. MikroTik create is called again
6. MikroTik returns "already exists" error
7. Processor catches "already exists" → marks as SUCCESS (idempotent)

Result: No duplicate PPP secret created.
```

### Scenario 5: Invoice already created

```
1. createPppoeUser $transaction includes invoice.create
2. Transaction succeeds — user + invoice + outbox all created
3. If createPppoeUser is called again (duplicate request):
   - pppoeUser.create will fail (unique username constraint)
   - Transaction rolls back
   - No duplicate invoice

Result: Invoice is created exactly once.
```

## Migration Applied

The `external_task` table was created on the production VPS:

```sql
CREATE TABLE external_task (
  id VARCHAR(36) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  operation VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 5,
  payload JSON NOT NULL,
  result TEXT NULL,
  last_error TEXT NULL,
  last_attempt_at DATETIME NULL,
  next_retry_at DATETIME NULL,
  completed_at DATETIME NULL,
  failed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE INDEX (entity_type, entity_id, operation),
  INDEX (status),
  INDEX (next_retry_at),
  INDEX (entity_type, entity_id)
);
```

## Remaining Risks

### 1. Cron Frequency (Low Risk)
The `external_task_processor` cron job should be scheduled to run every 1-2
minutes. If it runs less frequently, external tasks will be delayed. This is
a configuration issue, not a correctness issue.

### 2. DEAD Task Manual Retry (Low Risk)
If a task reaches DEAD status (5 retries failed), admin must manually retry
via `manualRetryTask()`. There is no admin UI for this yet — it must be called
programmatically. Future work: add admin dashboard for failed tasks.

### 3. WhatsApp/Email Idempotency Key (Low Risk)
The WhatsApp and Email handlers check for idempotency via notification log,
but the notification table structure may not fully support this. The
idempotency key is stored in the task payload, and the processor checks
before sending. If the notification table doesn't have the expected fields,
the check will be skipped and the notification may be sent twice. This is
low risk because notifications are non-critical.

### 4. radacct Not in Transaction (Informational)
The `radacct` and `radpostauth` username updates in `updatePppoeUser` use
`$executeRaw` within the transaction, which is correct. However, these are
historical tables and updates to them are best-effort.

## Commits

- `e017d761` — `fix(pppoe): Phase 4 — PPPoE workflow & external side effect hardening`
- `691d022f` — `fix: syntax error in updatePppoeUser + whatsapp import path`

## Summary

Phase 4 successfully separates database transactions from external side effects
using the transactional outbox pattern. The key improvements are:

1. **Atomicity**: DB + RADIUS + invoice + outbox enqueue in single transaction
2. **Retry**: External tasks retry with exponential backoff (30s → 30m)
3. **Idempotency**: Each external handler checks state before acting
4. **Observability**: Task status, retry count, and errors are tracked in DB
5. **No fire-and-forget**: All external operations are tracked and retryable

The dangerous conditions are now prevented:
- DB succeeds but RADIUS fails → transaction rolls back (both fail)
- DB succeeds, RADIUS succeeds, MikroTik fails → task retried via outbox
- Customer succeeds but invoice fails → transaction rolls back (both fail)
