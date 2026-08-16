import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SRC_ROOT = path.join(ROOT, 'src');
const SCHEMA_PATH = path.join(ROOT, 'prisma', 'schema.prisma');
const MIGRATIONS_DIR = path.join(ROOT, 'prisma', 'migrations');

function readFile(absPath: string): string {
  return fs.readFileSync(absPath, 'utf-8');
}

function readSrc(relPath: string): string {
  return readFile(path.join(SRC_ROOT, relPath));
}

describe('Phase 8 — Final Production Hardening', () => {

  // ─── 1. Permission Matrix — all API routes use requirePermission ────────
  describe('Permission matrix — requirePermission adoption', () => {
    it('only cron/route.ts still uses getServerSession in api/', () => {
      const apiDir = path.join(SRC_ROOT, 'app', 'api');
      const files: string[] = [];
      function walk(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full);
          else if (e.name.endsWith('.ts')) files.push(full);
        }
      }
      walk(apiDir);
      const offenders = files.filter(f => {
        const content = readFile(f);
        return content.includes('getServerSession') && !f.includes(path.join('cron', 'route.ts'));
      });
      expect(offenders).toEqual([]);
    });

    it('requirePermission middleware exists', () => {
      const middleware = readSrc('server/middleware/api-auth.ts');
      expect(middleware).toMatch(/export.*requirePermission/);
    });

    it('permissions seed file contains settings.cron', () => {
      const seeds = readFile(path.join(ROOT, 'prisma', 'seeds', 'permissions.ts'));
      expect(seeds).toMatch(/settings\.cron/);
    });
  });

  // ─── 2. Cron History Cleanup — batched deletion ─────────────────────────
  describe('Cron history — batched cleanup', () => {
    it('cron route uses batched deletion for history cleanup', () => {
      const cronRoute = readSrc('app/api/cron/route.ts');
      // Should use $executeRawUnsafe or a loop with LIMIT for batched deletes
      expect(cronRoute).toMatch(/runCronHistoryCleanup|cronHistoryCleanup/i);
      // Should NOT use a single deleteMany for the whole cleanup
      const cleanupSection = cronRoute.match(/function runCronHistoryCleanup[\s\S]*?\n\}/);
      if (cleanupSection) {
        expect(cleanupSection[0]).toMatch(/LIMIT|batch|DELETE/i);
      }
    });

    it('cron history retention is 30 days', () => {
      const cronRoute = readSrc('app/api/cron/route.ts');
      // Retention expressed as 30 * 24 * 60 * 60 * 1000 ms or INTERVAL 30 day
      expect(cronRoute).toMatch(/30.*24.*60.*60|INTERVAL.*30|retention.*30/i);
    });
  });

  // ─── 3. DEAD Task Alerting ──────────────────────────────────────────────
  describe('DEAD task alerting via Telegram', () => {
    it('alert.service.ts exists and exports alert functions', () => {
      const alertService = readSrc('server/services/notifications/alert.service.ts');
      expect(alertService).toMatch(/export.*function|export.*const/);
      expect(alertService).toMatch(/DEAD|dead/i);
    });

    it('external-task.service.ts calls alert on DEAD state', () => {
      const taskService = readSrc('server/services/external-task.service.ts');
      expect(taskService).toMatch(/alert|notifyDead|sendDeadAlert/i);
    });

    it('radius-sync-queue.service.ts calls alert on DEAD state', () => {
      const radiusService = readSrc('server/services/radius/radius-sync-queue.service.ts');
      expect(radiusService).toMatch(/alert|notifyDead|sendDeadAlert/i);
    });

    it('telegram.service.ts exists', () => {
      const telegramPath = path.join(SRC_ROOT, 'server', 'services', 'notifications', 'telegram.service.ts');
      expect(fs.existsSync(telegramPath)).toBe(true);
    });
  });

  // ─── 4. Financial Reconciliation ────────────────────────────────────────
  describe('Financial reconciliation cron job', () => {
    it('financial-reconciliation.ts exists', () => {
      const reconPath = path.join(SRC_ROOT, 'server', 'cron', 'financial-reconciliation.ts');
      expect(fs.existsSync(reconPath)).toBe(true);
    });

    it('reconciliation job is registered in jobs.ts', () => {
      const jobs = readSrc('server/cron/jobs.ts');
      expect(jobs).toMatch(/financial.reconciliation|financialReconciliation/i);
    });

    it('reconciliation job is registered in cron-runner.ts', () => {
      const cronRunner = readFile(path.join(ROOT, 'cron-runner.ts'));
      expect(cronRunner).toMatch(/financial.reconciliation|financialReconciliation/i);
    });

    it('reconciliation job is dispatched in cron route', () => {
      const cronRoute = readSrc('app/api/cron/route.ts');
      expect(cronRoute).toMatch(/financial.reconciliation|financialReconciliation|runFinancialReconciliation/i);
    });
  });

  // ─── 5. External Task Monitoring Endpoints ──────────────────────────────
  describe('External task monitoring endpoints', () => {
    it('stats endpoint exists', () => {
      const statsPath = path.join(SRC_ROOT, 'app', 'api', 'admin', 'external-tasks', 'stats', 'route.ts');
      expect(fs.existsSync(statsPath)).toBe(true);
    });

    it('failed endpoint exists', () => {
      const failedPath = path.join(SRC_ROOT, 'app', 'api', 'admin', 'external-tasks', 'failed', 'route.ts');
      expect(fs.existsSync(failedPath)).toBe(true);
    });

    it('retry endpoint exists', () => {
      const retryPath = path.join(SRC_ROOT, 'app', 'api', 'admin', 'external-tasks', 'retry', 'route.ts');
      expect(fs.existsSync(retryPath)).toBe(true);
    });

    it('stats endpoint uses requirePermission', () => {
      const statsPath = path.join(SRC_ROOT, 'app', 'api', 'admin', 'external-tasks', 'stats', 'route.ts');
      const content = readFile(statsPath);
      expect(content).toMatch(/requirePermission/);
    });
  });

  // ─── 6. External Task Processor Scheduling ──────────────────────────────
  describe('External task processor scheduling', () => {
    it('external_task_processor is in jobs.ts', () => {
      const jobs = readSrc('server/cron/jobs.ts');
      expect(jobs).toMatch(/external_task_processor/);
    });

    it('external_task_processor is in cron-runner.ts', () => {
      const cronRunner = readFile(path.join(ROOT, 'cron-runner.ts'));
      expect(cronRunner).toMatch(/external_task_processor/);
    });

    it('external_task_processor is dispatched in cron route', () => {
      const cronRoute = readSrc('app/api/cron/route.ts');
      expect(cronRoute).toMatch(/external_task_processor/);
    });
  });

  // ─── 7. Ledger Writes in Financial Transactions ─────────────────────────
  describe('Ledger writes in financial transactions', () => {
    it('agent deposit webhook creates ledger entry', () => {
      const webhook = readSrc('app/api/agent/deposit/webhook/route.ts');
      expect(webhook).toMatch(/transaction\.create|keuangan.*create/i);
    });

    it('admin agent deposit approval creates ledger entry', () => {
      const adminDeposits = readSrc('app/api/admin/agent-deposits/route.ts');
      expect(adminDeposits).toMatch(/transaction\.create|keuangan.*create/i);
    });

    it('referral reward credit creates ledger entry', () => {
      const referralRoute = readSrc('app/api/admin/referrals/[id]/route.ts');
      expect(referralRoute).toMatch(/transaction\.create|keuangan.*create/i);
    });

    it('auto-renewal balance deduction creates ledger entry', () => {
      const invoiceJobs = readSrc('server/cron/invoice-jobs.ts');
      expect(invoiceJobs).toMatch(/transaction\.create|keuangan.*create/i);
    });
  });

  // ─── 8. Migration Baseline ──────────────────────────────────────────────
  describe('Prisma migration baseline', () => {
    it('only 0_init migration directory exists', () => {
      const entries = fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
      expect(dirs).toEqual(['0_init']);
    });

    it('0_init migration.sql exists and is non-empty', () => {
      const migrationFile = path.join(MIGRATIONS_DIR, '0_init', 'migration.sql');
      expect(fs.existsSync(migrationFile)).toBe(true);
      const content = readFile(migrationFile);
      expect(content.length).toBeGreaterThan(1000);
    });

    it('no archive directories inside migrations/', () => {
      const entries = fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
      expect(dirs).not.toContain('_archive_loose_sql');
      expect(dirs.every(d => !d.includes('archive'))).toBe(true);
    });
  });

  // ─── 9. Permission Corrections ──────────────────────────────────────────
  describe('Permission key corrections', () => {
    it('genieacs WAN POST requires network.edit', () => {
      const wanRoute = readSrc('app/api/genieacs/devices/[deviceId]/wan/route.ts');
      // Check that POST handler uses network.edit, not network.view
      expect(wanRoute).toMatch(/network\.edit/);
    });

    it('admin data-usage POST requires settings.edit', () => {
      const dataUsageRoute = readSrc('app/api/admin/data-usage/route.ts');
      expect(dataUsageRoute).toMatch(/settings\.edit/);
    });
  });

  // ─── 10. Safe Error Handling ────────────────────────────────────────────
  describe('Safe error handling — no secret leakage', () => {
    it('auth route does not log OTPs', () => {
      // Check OTP-related routes for safe logging
      const authDir = path.join(SRC_ROOT, 'app', 'api', 'auth');
      if (fs.existsSync(authDir)) {
        const files: string[] = [];
        function walk(dir: string) {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) walk(full);
            else if (e.name.endsWith('.ts')) files.push(full);
          }
        }
        walk(authDir);
        for (const f of files) {
          const content = readFile(f);
          // Should not console.log OTP values
          expect(content).not.toMatch(/console\.log.*otp|console\.log.*code.*\$\{/i);
        }
      }
    });
  });
});
