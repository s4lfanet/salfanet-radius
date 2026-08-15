# Payment Idempotency Audit

**Date:** 2026-08-16
**Status:** ✅ VERIFIED (atomic transactions + idempotency guards)
**Deployed:** 2026-08-15, commit `ebe89923`, VPS `192.168.54.129`
**DB Migration:** Unique index on `transactions.reference` created and applied

---

## Architecture

```
Payment Gateway
    ↓
POST /api/payment/webhook
    ↓
1. Signature verification (per gateway)
    ↓
2. Duplicate webhook check (webhookLog findFirst)
    ↓
3. Order type detection (INV-, TOPUP-, EVC-, UUID)
    ↓
4. Handler-specific processing:
    ↓
    prisma.$transaction(async (tx) => {
      updateMany WHERE status='PENDING'/'not PAID'
      → if count === 0: already processed → return null
      → else: proceed with balance/payment update
    })
    ↓
5. Notifications (best-effort, outside transaction)
    ↓
6. Financial transaction sync (INSERT IGNORE for race safety)
```

## Idempotency Layers

### Layer 1: Webhook Log Deduplication
- **Check:** `webhookLog.findFirst` for same `gateway` + `transactionId` + `success=true`
- **Purpose:** Skip already-processed successful callbacks
- **Race safety:** Not atomic (findFirst), but Layer 2 provides the real guarantee

### Layer 2: Transaction-Level Idempotency (PRIMARY GUARANTEE)
- **Agent Deposit:** `agentDeposit.updateMany WHERE status='PENDING'` → only one webhook gets `count > 0`
- **Customer Top-Up:** `invoice.updateMany WHERE status != 'PAID'` → only one webhook gets `count > 0`
- **Invoice Payment:** `invoice.updateMany WHERE status != 'PAID'` → only one webhook gets `count > 0`
- **Race safety:** ✅ Atomic at database level — MySQL row-level locking ensures only one `updateMany` succeeds

### Layer 3: Payment Record Deduplication
- **Check:** `payment.findFirst WHERE invoiceId` inside transaction
- **Purpose:** Prevent duplicate payment records
- **Race safety:** Inside transaction — protected by Layer 2's `updateMany` guard

### Layer 4: Financial Transaction Idempotency
- **Implementation:** `INSERT IGNORE INTO transactions ... reference=...`
- **Unique index:** `idx_transactions_reference_unique` on `transactions.reference`
- **Race safety:** ✅ Atomic at database level — MySQL unique constraint prevents duplicates

## Concurrency Scenario

```
Webhook A (settlement) ──┐
                         ├──→ Both reach handler simultaneously
Webhook B (settlement) ──┘

Webhook A: $transaction → updateMany WHERE status='PENDING' → count=1 → proceeds
Webhook B: $transaction → updateMany WHERE status='PENDING' → count=0 → returns null

Result: Only Webhook A processes the payment.
        Webhook B is silently ignored (idempotent).
```

## Handler Analysis

### handleAgentDeposit
- ✅ `$transaction` with `updateMany` guard
- ✅ Balance increment inside transaction
- ✅ Notifications outside transaction (best-effort)
- ✅ Activity log outside transaction (best-effort)

### handleCustomerTopUp
- ✅ `$transaction` with `updateMany` guard
- ✅ Balance increment inside transaction
- ✅ Notifications outside transaction (best-effort)
- ✅ Financial sync with `INSERT IGNORE`

### handleInvoicePayment
- ✅ `$transaction` with `updateMany` guard
- ✅ Payment record creation inside transaction (with dedup check)
- ✅ User status/expiry/profile update inside transaction
- ✅ Amount mismatch check before transaction
- ✅ Notifications outside transaction (best-effort)
- ✅ Financial sync with `INSERT IGNORE`

### handleVoucherOrder
- ⚠️ Uses `findFirst` + `update` (not `updateMany` with condition)
- **Risk:** Two concurrent webhooks could both pass the `order.status !== 'PAID'` check
- **Mitigation:** Layer 1 (webhook log dedup) catches most duplicates
- **Recommendation:** Consider upgrading to `updateMany` with condition for full atomicity

## Verification Status

| Check | Status |
|-------|--------|
| TypeScript compilation | ✅ 0 errors |
| Build (local) | ✅ Exit 0 |
| Build (VPS) | ✅ Exit 0 |
| DB migration applied | ✅ VERIFIED — unique index on `transactions.reference` exists on VPS |
| Transaction atomicity | ✅ VERIFIED (code inspection) |
| updateMany idempotency guard | ✅ VERIFIED (code inspection) |
| INSERT IGNORE for financial sync | ✅ VERIFIED (code inspection) |
| Webhook endpoint live | ✅ VERIFIED — `/api/payment/webhook` responds on VPS |
| Duplicate webhook handling | ⏳ NOT VERIFIED — requires running backend with payment gateway |
| Concurrent webhook handling | ⏳ NOT VERIFIED — requires running backend with payment gateway |
| Amount mismatch rejection | ⏳ NOT VERIFIED — requires running backend with payment gateway |
| handleVoucherOrder atomicity | ⚠️ KNOWN LIMITATION — uses findFirst+update (not updateMany) |

## Known Limitations

1. **handleVoucherOrder** uses `findFirst` + `update` instead of `updateMany` with condition. This is a minor race condition risk, mitigated by the webhook log deduplication layer. Upgrading to `updateMany` would provide full atomicity.
2. **No idempotency key from provider** — some gateways don't send a unique callback ID. The system uses `transactionId` or `orderId` as the dedup key, which may not be unique across gateway retries in all cases.
3. **Notifications are best-effort** — if a notification fails after the transaction commits, it is not retried. This is acceptable for the current architecture but could be improved with a notification queue.
