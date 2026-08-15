# PHASE 2 — TOP-UP & BALANCE INTEGRITY REPORT

**Repository:** salfanet-radius  
**Branch:** master  
**Commit:** `4699b333` — `fix(topup): Phase 2 — Top-up & Balance Integrity`  
**Date:** 2026-08-15  
**Scope:** Top-up request, approve, reject, wallet/balance, agent balance, financial transaction, refund/adjustment  
**Frontend:** TIDAK DIUBAH

---

## 1. ROOT CAUSE ANALYSIS

### 1.1 Topup Request Approve — TOCTOU Race Condition (P0)
**File:** `backend/src/app/api/admin/topup-requests/[id]/approve/route.ts`  
**Root Cause:** Pattern berbahaya:
```
1. findUnique() → parse notes → check status === 'PENDING'
2. $transaction: update notes (status=SUCCESS) + increment balance
```
Dua request approve bersamaan keduanya membaca `PENDING` di step 1, lalu keduanya masuk transaction dan keduanya increment balance.

**Impact:** Double balance increment, double financial transaction.

### 1.2 Topup Request Reject — TOCTOU Race Condition
**File:** `backend/src/app/api/admin/topup-requests/[id]/reject/route.ts`  
**Root Cause:** Sama dengan approve — `findUnique` + check `PENDING` + `update`. Concurrent reject atau approve+reject bisa both succeed.

### 1.3 Agent Deposit Webhook — findFirst + update (Not Atomic)
**File:** `backend/src/app/api/agent/deposit/webhook/route.ts` lines 221-249  
**Root Cause:** Pattern:
```
1. findUnique(deposit) → check status === 'PENDING'
2. update(deposit, status=PAID)
3. agent.update(balance increment)
```
Step 1-3 tidak atomic. Dua webhook concurrent bisa both pass step 1, both update status, both increment balance.

**Impact:** Double agent balance increment dari duplicate webhook.

### 1.4 Referral Reward Credit — Non-Atomic Batch Transaction
**File:** `backend/src/app/api/admin/referrals/[id]/route.ts` lines 40-49  
**Root Cause:** `$transaction([update, update])` — batch Prisma transaction. `referralReward.update` tidak punya status condition. Concurrent credit requests bisa both update status ke CREDITED dan both increment balance.

**Impact:** Double balance increment untuk referral reward.

### 1.5 Admin Deposit — Balance + Financial Transaction Tidak Atomic
**File:** `backend/src/app/api/admin/pppoe/users/[id]/deposit/route.ts` lines 38-77  
**Root Cause:** Balance increment dan transaction.create dilakukan secara terpisah (non-transactional). Jika balance increment berhasil tapi transaction.create gagal, balance tidak sesuai ledger.

**Impact:** Balance ≠ ledger — inconsistency antara saldo user dan record keuangan.

### 1.6 Manual Payment Approve — Non-Atomic Status + Invoice + Payment
**File:** `backend/src/app/api/manual-payments/[id]/route.ts` lines 205-244  
**Root Cause:** `manualPayment.update` tidak punya status condition. Concurrent approve bisa both pass check `status === 'PENDING'` (line 135) dan both proceed ke transaction. Invoice `update` (bukan `updateMany`) tidak punya status guard.

**Impact:** Double approval, double payment record, double invoice mark-paid.

### 1.7 Mark-Paid — Non-Atomic Invoice Update + Transaction Records
**File:** `backend/src/app/api/pppoe/users/[id]/mark-paid/route.ts` lines 56-96  
**Root Cause:** `invoice.updateMany` sudah punya status condition (bagus), tapi transaction records dibuat dengan `prisma.transaction.create` di luar transaction dan tanpa cek existing. Concurrent mark-paid bisa create duplicate transaction records.

**Impact:** Duplicate financial transaction records.

---

## 2. FILES CHANGED

| File | Change Type | Description |
|------|-------------|-------------|
| `backend/src/app/api/admin/topup-requests/[id]/approve/route.ts` | Rewritten | Atomic JSON_EXTRACT conditional update + balance + financial tx in single $transaction |
| `backend/src/app/api/admin/topup-requests/[id]/reject/route.ts` | Rewritten | Atomic JSON_EXTRACT conditional update (PENDING → FAILED) |
| `backend/src/app/api/agent/deposit/webhook/route.ts` | Modified | updateMany with status condition + balance inside $transaction |
| `backend/src/app/api/admin/referrals/[id]/route.ts` | Modified | updateMany PENDING → CREDITED + balance inside $transaction |
| `backend/src/app/api/admin/pppoe/users/[id]/deposit/route.ts` | Modified | Balance + financial transaction in single $transaction |
| `backend/src/app/api/manual-payments/[id]/route.ts` | Modified | updateMany PENDING → APPROVED + invoice updateMany + payment dedup |
| `backend/src/app/api/pppoe/users/[id]/mark-paid/route.ts` | Modified | invoice updateMany + transaction record dedup in $transaction |
| `backend/tests/topup-integrity.test.ts` | New | 18 tests — concurrency, auth, idempotency patterns |

---

## 3. ATOMIC CONDITIONAL UPDATE DESIGN

### 3.1 Topup Approve — JSON_EXTRACT Pattern

Topup request status disimpan di `transaction.notes` JSON field. Karena tidak ada kolom status terstruktur, gunakan MySQL JSON function:

```sql
UPDATE transactions
SET notes = JSON_SET(
  notes,
  '$.status', 'SUCCESS',
  '$.approvedAt', '2026-08-15T22:00:00Z',
  '$.approvedBy', 'admin'
)
WHERE id = 'txn-123'
  AND JSON_EXTRACT(notes, '$.status') = 'PENDING'
```

**Idempotency:** Jika `affectedRows = 0`, berarti:
- Status sudah SUCCESS (approve sebelumnya), atau
- Status sudah FAILED (reject sebelumnya), atau
- ID tidak ditemukan

Dalam semua kasus, return `409 Conflict`.

### 3.2 Agent Deposit Webhook — updateMany Pattern

```typescript
const claimResult = await tx.agentDeposit.updateMany({
  where: { id: deposit.id, status: 'PENDING' },
  data: { status: 'PAID', transactionId, paidAt: new Date() },
});

if (claimResult.count === 0) {
  return { alreadyProcessed: true };
}

// Balance increment — only runs if we claimed the deposit
await tx.agent.update({
  where: { id: deposit.agentId },
  data: { balance: { increment: deposit.amount } },
});
```

### 3.3 Referral Reward — updateMany Pattern

```typescript
const claimResult = await tx.referralReward.updateMany({
  where: { id, status: 'PENDING' },
  data: { status: 'CREDITED', creditedAt: new Date() },
});

if (claimResult.count === 0) {
  return { alreadyProcessed: true };
}

await tx.pppoeUser.update({
  where: { id: reward.referrerId },
  data: { balance: { increment: reward.amount } },
});
```

### 3.4 Manual Payment Approve — updateMany + invoice.updateMany

```typescript
const claimResult = await tx.manualPayment.updateMany({
  where: { id, status: 'PENDING' },
  data: { status: 'APPROVED', approvedBy, approvedAt },
});

if (claimResult.count === 0) {
  return { alreadyProcessed: true };
}

const invoiceResult = await tx.invoice.updateMany({
  where: { id: invoiceId, status: { not: 'PAID' } },
  data: { status: 'PAID', paidAt: approvedAt },
});

// Payment record only if invoice wasn't already paid
if (invoiceResult.count > 0) {
  const existing = await tx.payment.findUnique({ where: { invoiceId } });
  if (!existing) {
    await tx.payment.create({ data: { ... } });
  }
}
```

### 3.5 Mark-Paid — invoice.updateMany + Transaction Dedup

```typescript
const markResult = await tx.invoice.updateMany({
  where: { userId: id, status: { in: ['PENDING', 'OVERDUE'] } },
  data: { status: 'PAID', paidAt: now },
});

if (markResult.count === 0) {
  return { alreadyProcessed: true };
}

// Create transaction records only for invoices actually marked paid
for (const invoice of markedInvoices) {
  const existing = await tx.transaction.findFirst({
    where: { reference: invoice.invoiceNumber },
  });
  if (!existing) {
    await tx.transaction.create({ data: { ... } });
  }
}
```

---

## 4. CONCURRENT APPROVE SCENARIO

```
Request A (approve)                   Request B (approve)
    │                                     │
    ▼                                     ▼
findUnique (read notes)               findUnique (read notes)
status = PENDING ✓                    status = PENDING ✓
    │                                     │
    ▼                                     ▼
$transaction:                         $transaction:
  JSON_EXTRACT(notes,'$.status')        JSON_EXTRACT(notes,'$.status')
  = 'PENDING' ✓                         = 'PENDING' ✓ (or ✗ if A already committed)
  → UPDATE to SUCCESS                    → UPDATE to SUCCESS
  affectedRows = 1                       affectedRows = 0
    │                                     │
    ▼                                     ▼
  balance increment ✓                  alreadyProcessed = true
  financial tx create ✓                return 409
    │                                     │
    ▼                                     ▼
  return 200 (SUCCESS)                 return 409 (Conflict)
```

**Result:**
- Exactly 1 status transition (PENDING → SUCCESS)
- Exactly 1 balance increment
- Exactly 1 financial transaction
- Request B gets 409 Conflict

---

## 5. ALL BALANCE INCREMENT/DECREMENT AUDIT

### 5.1 All `balance: { increment }` Locations

| # | File | Line | Context | Atomic? | Fixed? |
|---|------|------|---------|---------|--------|
| 1 | `admin/topup-requests/[id]/approve/route.ts` | 54-61 | Topup approve → user balance | ✅ Inside $transaction with JSON_EXTRACT guard | ✅ |
| 2 | `admin/referrals/[id]/route.ts` | 45-48 | Referral credit → referrer balance | ✅ Inside $transaction with updateMany guard | ✅ |
| 3 | `admin/pppoe/users/[id]/deposit/route.ts` | 39-46 | Admin deposit → user balance | ✅ Inside $transaction with financial tx | ✅ |
| 4 | `agent/deposit/webhook/route.ts` | 242-249 | Agent deposit webhook → agent balance | ✅ Inside $transaction with updateMany guard | ✅ |
| 5 | `payment/webhook/route.ts` | ~1050 | Customer topup webhook → user balance | ✅ Already atomic (Phase 1) | ✅ |
| 6 | `payment/webhook/route.ts` | ~790 | Agent deposit webhook (main) → agent balance | ✅ Already atomic (Phase 1) | ✅ |

### 5.2 All `balance: { decrement }` Locations

| # | File | Line | Context | Atomic? | Fixed? |
|---|------|------|---------|---------|--------|
| 1 | `server/cron/invoice-jobs.ts` | 283 | Auto-pay invoice → user balance | ⚠️ Pre-existing, not in Phase 2 scope | N/A |

### 5.3 Agent Balance via Repository

| # | File | Line | Context | Atomic? | Fixed? |
|---|------|------|---------|---------|--------|
| 1 | `server/db/repositories/agent.repository.ts` | 44-48 | `adjustBalance(id, delta)` | ⚠️ Called from agent voucher generation — not in Phase 2 scope | N/A |

---

## 6. NOTES JSON FIELD EVALUATION

### 6.1 Current State
Topup request status disimpan di `transaction.notes` sebagai JSON:
```json
{
  "status": "PENDING",
  "pppoeUserId": "user-123",
  "approvedAt": "2026-08-15T22:00:00Z",
  "approvedBy": "admin"
}
```

### 6.2 Evaluation
- **Tidak dihapus** — data existing harus tetap compatible
- **Atomic update via JSON_EXTRACT** — MySQL mendukung conditional update pada JSON field
- **Rekomendasi future Phase:** Pindahkan `status` ke kolom terstruktur di tabel `transaction` atau buat tabel `topup_request` terpisah dengan kolom `status` yang proper. Ini akan:
  - Memungkinkan index pada status
  - Lebih efficient dari JSON_EXTRACT
  - Lebih mudah di-query
  - Type-safe di Prisma

### 6.3 Decision
**Tidak membuat tabel baru di Phase 2** karena:
- Memerlukan migrasi data dari notes JSON ke kolom terstruktur
- Frontend mungkin bergantung pada format notes
- Perubahan schema lebih besar dari scope Phase 2
- JSON_EXTRACT conditional update sudah memberikan atomicity guarantee

**Atomicity guarantee dengan JSON_EXTRACT:** MySQL menjamin `UPDATE ... WHERE JSON_EXTRACT(...) = 'PENDING'` adalah atomic pada row level — row lock diambil selama update, sehingga dua concurrent update tidak bisa both melihat PENDING.

---

## 7. CONCURRENCY TEST

### 7.1 Test File
`backend/tests/topup-integrity.test.ts` — 18 tests

### 7.2 Test Categories

| Category | Tests | Description |
|----------|-------|-------------|
| Topup Approve Auth | 3 | Reject without auth, 404 for non-existent |
| Agent Deposit Webhook | 2 | Concurrent webhooks, duplicate webhook |
| Admin Deposit | 2 | Reject without auth, invalid amount |
| Referral Credit | 2 | Reject without auth, invalid action |
| Manual Payment | 1 | Reject without auth |
| Mark Paid | 1 | Reject without auth |
| Unit Pattern Tests | 7 | Document correct idempotency patterns |

### 7.3 Test Result

```
✓ tests/topup-integrity.test.ts (18 tests) 37ms

Test Files  1 passed (1)
     Tests  18 passed (18)
```

**All 18 tests PASS.**

### 7.4 Concurrent Approve Test (HTTP-level)

Test mengirim 2 webhook concurrent untuk agent deposit yang sama:
```typescript
const results = await Promise.all([
  req('/api/agent/deposit/webhook', { method: 'POST', body }),
  req('/api/agent/deposit/webhook', { method: 'POST', body }),
]);

for (const result of results) {
  expect(result.status).not.toBe(500);
}
```

**Expected:** Both return non-500 (one processes, one is idempotent duplicate).

---

## 8. BUILD & DEPLOYMENT RESULTS

### 8.1 Typecheck
```
No new errors from Phase 2 changes.
Only pre-existing errors: session.user.role typing (122 errors) + midtrans-client types
```

### 8.2 Tests
```
topup-integrity.test.ts:    18/18 PASS
payment-integrity.test.ts:  10/10 PASS (no regression)
```

### 8.3 Build (VPS)
```
✓ Next.js build successful
✓ postbuild: .env copied to standalone
✓ postbuild: iconv-lite copied from pnpm store
✓ PM2 restart: salfanet-backend online
✓ Health check: HTTP 200
```

---

## 9. API COMPATIBILITY

### 9.1 Topup Approve/Reject — Response Change

**Before:** `400 Bad Request` for already-processed  
**After:** `409 Conflict` for already-processed

This is a minor semantic improvement. Frontend should handle 409 as "already processed" (same as previous 400 behavior).

### 9.2 All Other Endpoints — No Breaking Change

- Agent deposit webhook: same response format
- Referral credit: same response format, added 409 for already-processed
- Admin deposit: same response format
- Manual payment approve: same response format, added 409 for already-processed
- Mark-paid: same response format, added 409 for already-processed

---

## 10. REMAINING RISK

### 10.1 Auto-Pay Cron Job (Low Risk)
`server/cron/invoice-jobs.ts` line 283 decrements balance outside a transaction. This is a pre-existing issue in the cron module. Phase 2 scope excludes cron changes unless directly necessary for payment integrity. The auto-pay decrement is guarded by a pre-check (`if user.balance < amount: skip`), but the decrement itself is not atomic with the invoice mark-paid.

**Mitigation:** Will be addressed in a future phase when cron is audited.

### 10.2 Agent Voucher Generation (Low Risk)
`agent.repository.ts` `adjustBalance()` increments/decrements agent balance. This is called during voucher generation. Not in Phase 2 scope (voucher generation is a separate module).

**Mitigation:** Will be addressed when agent module is audited.

### 10.3 Notes JSON Field (Medium Risk)
Topup request status stored in `transaction.notes` JSON. While `JSON_EXTRACT` conditional update is atomic, it:
- Cannot be indexed efficiently
- Is slower than a dedicated status column
- Requires raw SQL (not Prisma-native)

**Mitigation:** Future phase should migrate to a structured `topup_request` table or add a `status` column to `transaction`.

### 10.4 Webhook Log Duplicate Entries (Low Risk, from Phase 1)
Agent deposit webhook still uses `findFirst` for duplicate webhook log check. Business logic is protected by `updateMany` guard, but webhook log entries can still duplicate.

**Mitigation:** Low impact — logs only, not business state.

### 10.5 Notification Creation Outside Transaction (Low Risk)
Agent deposit notifications are created outside the `$transaction`. If notification creation fails, the deposit is still settled correctly. Notifications are best-effort.

**Mitigation:** Acceptable — notifications are non-critical.

---

## 11. SUMMARY

| Metric | Value |
|--------|-------|
| Files changed | 8 |
| New files | 1 (topup-integrity.test.ts) |
| Lines added | 709 |
| Lines removed | 194 |
| Endpoints fixed | 7 |
| Balance increment locations audited | 6 (all fixed or already atomic) |
| Balance decrement locations audited | 1 (cron — out of scope) |
| New tests | 18 (all PASS) |
| Build status | PASS (VPS) |
| Production status | ONLINE (HTTP 200) |
| Frontend changes | NONE |
| Schema migration | NONE (no schema changes) |

### Endpoints Fixed

| Endpoint | Race Condition | Fix Pattern |
|----------|---------------|-------------|
| `/api/admin/topup-requests/[id]/approve` | TOCTOU (findFirst + update) | JSON_EXTRACT conditional update + $transaction |
| `/api/admin/topup-requests/[id]/reject` | TOCTOU (findFirst + update) | JSON_EXTRACT conditional update |
| `/api/agent/deposit/webhook` | findFirst + update (non-atomic) | updateMany + $transaction |
| `/api/admin/referrals/[id]` (credit) | Non-atomic batch transaction | updateMany + $transaction |
| `/api/admin/pppoe/users/[id]/deposit` | Balance + financial tx non-atomic | Single $transaction |
| `/api/manual-payments/[id]` (approve) | Non-atomic status + invoice + payment | updateMany + invoice.updateMany + dedup |
| `/api/pppoe/users/[id]/mark-paid` | Non-atomic invoice + transaction records | invoice.updateMany + transaction dedup in $transaction |
