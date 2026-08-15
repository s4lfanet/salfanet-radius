import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 6 — Cron Reliability & Timezone Hardening Tests
 *
 * Tests verify:
 * 1. Cron runner uses Node.js http module (not shell curl)
 * 2. CRON_SECRET not exposed in command line
 * 3. /api/cron always acquires lock (even with CRON_SECRET)
 * 4. Invoice generation uses atomic idempotency (transaction + re-check)
 * 5. Auto-isolir uses atomic conditional update (updateMany + status check)
 * 6. Invoice reminder uses atomic claim (transaction before send)
 * 7. Timezone uses nowWIBAsync() in cron jobs (refreshes from DB)
 * 8. Cleanup jobs use nowWIB() not Date.now()
 * 9. Cron runner periodically refreshes timezone
 * 10. Distributed lock has heartbeat, stale recovery, owner token
 */

const SRC_ROOT = path.resolve(__dirname, '..', 'src');
const REPO_ROOT = path.resolve(__dirname, '..');

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, relPath), 'utf-8');
}

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf-8');
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(SRC_ROOT, relPath));
}

describe('Phase 6 — Cron Reliability & Timezone Hardening', () => {

  // ─── Cron Runner: No shell curl ───────────────────────────────────────────
  describe('Cron Runner — no shell curl (secret exposure prevention)', () => {
    const cronRunner = readRepoFile('cron-runner.ts');

    it('must NOT use child_process exec for HTTP requests', () => {
      expect(cronRunner).not.toContain('execAsync');
      expect(cronRunner).not.toContain("from 'child_process'");
    });

    it('must NOT use curl command with CRON_SECRET', () => {
      // Check that there's no actual curl command execution (only in comments is OK)
      expect(cronRunner).not.toMatch(/execAsync.*curl/);
      expect(cronRunner).not.toMatch(/curl\s+-s\s+-X\s+POST/);
    });

    it('must use Node.js http module for internal API calls', () => {
      expect(cronRunner).toContain("import http from 'http'");
      expect(cronRunner).toContain('http.request');
    });

    it('must pass CRON_SECRET via headers (not command line)', () => {
      expect(cronRunner).toContain("'x-cron-secret': CRON_SECRET");
      expect(cronRunner).toContain('headers');
    });
  });

  // ─── /api/cron: Always acquire lock ───────────────────────────────────────
  describe('/api/cron — always acquire lock (no bypass)', () => {
    const cronRoute = readFile('app/api/cron/route.ts');

    it('must acquire lock for ALL requests (not just non-secret)', () => {
      // The old code had: if (!hasCronSecret) { ownerToken = await acquireCronLock... }
      // This should be removed — lock is always acquired.
      expect(cronRoute).not.toMatch(/if\s*\(!hasCronSecret\)\s*\{[^}]*acquireCronLock/);
    });

    it('must call acquireCronLock unconditionally', () => {
      expect(cronRoute).toContain('acquireCronLock(jobType)');
      expect(cronRoute).toContain('409');
    });

    it('must always release lock in finally block', () => {
      expect(cronRoute).toContain('releaseCronLock');
      expect(cronRoute).toContain('finally');
    });
  });

  // ─── Invoice Generation: Atomic Idempotency ───────────────────────────────
  describe('Invoice generation — atomic idempotency', () => {
    const invoiceJobs = readFile('server/cron/invoice-jobs.ts');

    it('must use transaction for invoice creation', () => {
      expect(invoiceJobs).toContain('$transaction');
    });

    it('must re-check existing invoice inside transaction', () => {
      // The transaction must do a findFirst to check if another instance
      // already created the invoice for this user+month+type.
      expect(invoiceJobs).toContain('tx.invoice.findFirst');
    });

    it('must use nowWIBAsync for timezone-aware time', () => {
      expect(invoiceJobs).toContain('nowWIBAsync');
    });
  });

  // ─── Auto-Isolir: Atomic Conditional Update ───────────────────────────────
  describe('Auto-isolir — atomic conditional update', () => {
    const autoIsolir = readFile('server/cron/auto-isolir.ts');

    it('must use updateMany with status condition (not update)', () => {
      // Should use updateMany with where: { id, status: 'active' }
      // This prevents double-isolation if another instance already isolated.
      expect(autoIsolir).toContain('updateMany');
      expect(autoIsolir).toContain("status: 'active'");
    });

    it('must check updateResult.count === 0 for idempotency skip', () => {
      expect(autoIsolir).toContain('updateResult.count === 0');
      expect(autoIsolir).toContain('continue');
    });

    it('runAutoStop must also use updateMany with status condition', () => {
      expect(autoIsolir).toContain("status: 'isolated'");
      expect(autoIsolir).toContain('updateMany');
    });

    it('must use nowWIBAsync for timezone-aware time', () => {
      expect(autoIsolir).toContain('nowWIBAsync');
    });
  });

  // ─── Invoice Reminder: Atomic Claim ───────────────────────────────────────
  describe('Invoice reminder — atomic claim before send', () => {
    const invoiceJobs = readFile('server/cron/invoice-jobs.ts');

    it('must claim reminder in transaction BEFORE sending WhatsApp', () => {
      // The transaction should update sentReminders before the sendInvoiceReminder call.
      // Find the FIRST occurrence of tx.invoice.update (in the reminder section)
      const firstTxUpdate = invoiceJobs.indexOf('tx.invoice.update');
      const sendIdx = invoiceJobs.indexOf('sendInvoiceReminder({');
      expect(firstTxUpdate).toBeGreaterThan(-1);
      expect(sendIdx).toBeGreaterThan(-1);
      // Transaction must come before send
      expect(firstTxUpdate).toBeLessThan(sendIdx);
    });

    it('must re-check sentDays inside transaction', () => {
      expect(invoiceJobs).toContain('currentDays.includes(daysUntilDue)');
    });

    it('must have claimed flag to prevent send if not claimed', () => {
      expect(invoiceJobs).toContain('claimed');
    });
  });

  // ─── Timezone: Dynamic Company TZ ─────────────────────────────────────────
  describe('Timezone — dynamic company timezone', () => {
    const timezone = readFile('lib/timezone.ts');

    it('must have refreshTimezoneFromDB function', () => {
      expect(timezone).toContain('refreshTimezoneFromDB');
    });

    it('must have nowWIBAsync function', () => {
      expect(timezone).toContain('nowWIBAsync');
    });

    it('must cache DB timezone with TTL', () => {
      expect(timezone).toContain('DB_TIMEZONE_CACHE_TTL');
      expect(timezone).toContain('dbTimezoneCache');
    });

    it('must not rely solely on process.env.TZ', () => {
      // The module should load from DB, not just from env.
      expect(timezone).toContain('prisma.company.findFirst');
    });
  });

  // ─── Cleanup Jobs: Use nowWIB not Date.now ────────────────────────────────
  describe('Cleanup jobs — use nowWIB not Date.now', () => {
    const cronRoute = readFile('app/api/cron/route.ts');

    it('runActivityLogCleanup must use nowWIB', () => {
      // Find the function definition, not the switch case
      const defIdx = cronRoute.indexOf('async function runActivityLogCleanup');
      const section = cronRoute.slice(defIdx, defIdx + 200);
      expect(section).toContain('nowWIB()');
      expect(section).not.toContain('Date.now()');
    });

    it('runWebhookLogCleanup must use nowWIB', () => {
      const defIdx = cronRoute.indexOf('async function runWebhookLogCleanup');
      const section = cronRoute.slice(defIdx, defIdx + 200);
      expect(section).toContain('nowWIB()');
      expect(section).not.toContain('Date.now()');
    });

    it('runCronHistoryCleanup must use nowWIB', () => {
      const defIdx = cronRoute.indexOf('async function runCronHistoryCleanup');
      const section = cronRoute.slice(defIdx, defIdx + 200);
      expect(section).toContain('nowWIB()');
      expect(section).not.toContain('Date.now()');
    });
  });

  // ─── Cron Runner: Periodic Timezone Refresh ───────────────────────────────
  describe('Cron runner — periodic timezone refresh', () => {
    const cronRunner = readRepoFile('cron-runner.ts');

    it('must periodically refresh timezone from DB', () => {
      expect(cronRunner).toContain('setInterval');
      expect(cronRunner).toContain('loadCompanyTimezone');
    });

    it('must update timezone module cache on refresh', () => {
      expect(cronRunner).toContain('setCurrentTimezone');
    });
  });

  // ─── Distributed Lock: Heartbeat + Stale Recovery ─────────────────────────
  describe('Distributed lock — heartbeat + stale recovery', () => {
    const lockService = readFile('server/services/cron-lock.service.ts');

    it('must have acquireCronLock with ownerToken', () => {
      expect(lockService).toContain('acquireCronLock');
      expect(lockService).toContain('ownerToken');
      expect(lockService).toContain('randomUUID');
    });

    it('must have releaseCronLock with owner verification', () => {
      expect(lockService).toContain('releaseCronLock');
      // Release must check ownerToken to prevent releasing someone else's lock
      const releaseSection = lockService.slice(lockService.indexOf('releaseCronLock'));
      expect(releaseSection).toContain('ownerToken');
    });

    it('must have renewCronLock (heartbeat) with conditional update', () => {
      expect(lockService).toContain('renewCronLock');
      expect(lockService).toContain('updateMany');
      expect(lockService).toContain('expiresAt');
    });

    it('must have stale lock recovery (TTL-based)', () => {
      expect(lockService).toContain('DEFAULT_TTL_MS');
      expect(lockService).toContain('expiresAt');
      // Stale lock detection: check if expiresAt < now
      expect(lockService).toContain('lt: now');
    });

    it('must have startHeartbeat helper', () => {
      expect(lockService).toContain('startHeartbeat');
      expect(lockService).toContain('setInterval');
    });

    it('must log lock events for monitoring', () => {
      expect(lockService).toContain('logCronLockAcquired');
      expect(lockService).toContain('logCronLockDenied');
      expect(lockService).toContain('logCronLockExpired');
      expect(lockService).toContain('logCronHeartbeatFailure');
    });
  });

  // ─── Cron Runner: Lock + Heartbeat + History ──────────────────────────────
  describe('Cron runner — lock + heartbeat + history', () => {
    const cronRunner = readRepoFile('cron-runner.ts');

    it('must have in-memory guard (fast path)', () => {
      expect(cronRunner).toContain('runningJobs');
      expect(cronRunner).toContain('runningJobs.has');
    });

    it('must acquire distributed lock before running job', () => {
      expect(cronRunner).toContain('acquireCronLock');
      expect(cronRunner).toContain('LOCK_TTL_MS');
    });

    it('must have heartbeat timer', () => {
      expect(cronRunner).toContain('heartbeatTimer');
      expect(cronRunner).toContain('HEARTBEAT_INTERVAL_MS');
      expect(cronRunner).toContain('renewCronLock');
    });

    it('must detect lock loss and discard result', () => {
      expect(cronRunner).toContain('lockLost');
      expect(cronRunner).toContain('LOCK_LOST');
    });

    it('must create cron history record', () => {
      expect(cronRunner).toContain('cronHistory.create');
      expect(cronRunner).toContain('cronHistory.update');
    });

    it('must release lock in finally block', () => {
      expect(cronRunner).toContain('releaseCronLock');
      expect(cronRunner).toContain('finally');
    });

    it('must use company timezone for cron schedule', () => {
      expect(cronRunner).toContain('timezone: companyTimezone');
    });
  });

  // ─── Scenario: Cron Overlap Prevention ────────────────────────────────────
  describe('Scenario: cron overlap prevention', () => {
    it('Job A running, Job B starts → B is denied (lock held)', () => {
      // The lock service uses MySQL primary key constraint.
      // When Job A acquires lock, Job B's acquireCronLock will fail
      // with P2002 (unique constraint violation).
      // Job B returns null → runJob logs "skipped (lock held)" and returns.
      const lockService = readFile('server/services/cron-lock.service.ts');
      expect(lockService).toContain('P2002');
      expect(lockService).toContain('Duplicate entry');
      expect(lockService).toContain('logCronLockDenied');
    });

    it('Job A crashes, Job B starts after TTL → B reclaims stale lock', () => {
      // If Job A crashes without releasing, the lock expires after TTL.
      // Job B's acquireCronLock first deletes expired locks, then inserts.
      // The stale lock is reclaimed atomically.
      const lockService = readFile('server/services/cron-lock.service.ts');
      expect(lockService).toContain('deleteMany');
      expect(lockService).toContain('expiresAt: { lt: now }');
    });

    it('Invoice generation overlap → no duplicate invoices', () => {
      // Even if both Job A and Job B pass the lock (edge case),
      // the invoice creation uses a transaction with re-check.
      // Only one will succeed in creating the invoice.
      const invoiceJobs = readFile('server/cron/invoice-jobs.ts');
      expect(invoiceJobs).toContain('$transaction');
      expect(invoiceJobs).toContain('tx.invoice.findFirst');
    });

    it('Auto-isolir overlap → no double isolation', () => {
      // Even if both instances find the same expired user,
      // only one will succeed in the updateMany (status: 'active' condition).
      // The other gets count=0 and skips.
      const autoIsolir = readFile('server/cron/auto-isolir.ts');
      expect(autoIsolir).toContain('updateMany');
      expect(autoIsolir).toContain("status: 'active'");
      expect(autoIsolir).toContain('count === 0');
    });
  });

  // ─── Scenario: Timezone Change ────────────────────────────────────────────
  describe('Scenario: company timezone change', () => {
    it('Cron runner picks up new timezone within 5 minutes', () => {
      // The cron runner has a setInterval that calls loadCompanyTimezone
      // every 5 minutes. If company changes timezone, the cron schedule
      // will use the new timezone after the next refresh.
      const cronRunner = readRepoFile('cron-runner.ts');
      expect(cronRunner).toContain('setInterval');
      expect(cronRunner).toContain('loadCompanyTimezone');
      expect(cronRunner).toContain('5 * 60 * 1000');
    });

    it('Cron jobs use nowWIBAsync which refreshes from DB', () => {
      // nowWIBAsync calls refreshTimezoneFromDB before computing time.
      // This ensures business logic uses the correct timezone.
      const timezone = readFile('lib/timezone.ts');
      expect(timezone).toContain('nowWIBAsync');
      expect(timezone).toContain('refreshTimezoneFromDB');
    });
  });

  // ─── Non-WIB Timezone Support ─────────────────────────────────────────────
  describe('Non-WIB timezone support (DST-aware, universal)', () => {
    const timezone = readFile('lib/timezone.ts');

    it('must NOT use hardcoded offset map', () => {
      // The old code had a fixed offsetMap that only supported ~15 timezones
      // and fell back to +07:00 for anything else. This is wrong.
      expect(timezone).not.toContain("'Asia/Jakarta': '+07:00'");
      expect(timezone).not.toContain("'Asia/Makassar': '+08:00'");
    });

    it('must NOT fallback to hardcoded +07:00 for unknown timezones', () => {
      // The getTimezoneOffsetMs fallback should use system offset, not +7
      expect(timezone).not.toContain('return 7 * 60 * 60 * 1000');
    });

    it('must use Intl.DateTimeFormat for DST-aware offset calculation', () => {
      expect(timezone).toContain('Intl.DateTimeFormat');
      expect(timezone).toContain('longOffset');
      expect(timezone).toContain('formatToParts');
    });

    it('must support any IANA timezone (not just hardcoded list)', () => {
      // The new implementation should work for any timezone like
      // America/New_York, Europe/London, etc.
      expect(timezone).toContain('timeZone: tz');
    });

    it('toUTC must use company offset (not server local getFullYear)', () => {
      // The old toUTC used getFullYear() which depends on server TZ.
      // The new one should use getTimezoneOffsetMs().
      const toUTCSection = timezone.slice(
        timezone.indexOf('export function toUTC'),
        timezone.indexOf('export function formatWIB')
      );
      expect(toUTCSection).toContain('getTimezoneOffsetMs');
      expect(toUTCSection).not.toContain('wib.getFullYear()');
    });

    it('getTimezoneOffsetMs fallback must use system offset (not hardcoded +7)', () => {
      const section = timezone.slice(
        timezone.indexOf('export function getTimezoneOffsetMs'),
        timezone.indexOf('export function parseDateAsWIB')
      );
      expect(section).toContain('getTimezoneOffset');
      expect(section).not.toContain('7 * 60 * 60 * 1000');
    });
  });
});
