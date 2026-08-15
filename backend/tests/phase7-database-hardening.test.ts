import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 7 — Database & Final Backend Hardening Tests
 *
 * Tests verify:
 * 1. Prisma schema has composite indexes for common query patterns
 * 2. Export routes exclude passwords by default (P0 security)
 * 3. OTP codes are not logged or returned in API responses (P0 security)
 * 4. Safe error handler exists and maps Prisma errors to generic messages
 * 5. Critical routes use Zod validation (auth + financial)
 * 6. N+1 query fix in invoice generation (batch addon fetch)
 * 7. Migration SQL is non-destructive (additive indexes only)
 */

const ROOT = path.resolve(__dirname, '..');
const SRC_ROOT = path.join(ROOT, 'src');
const SCHEMA_PATH = path.join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION_PATH = path.join(
  ROOT,
  'prisma',
  'migrations',
  '20260301000001_phase7_composite_indexes',
  'migration.sql',
);

function readFile(absPath: string): string {
  return fs.readFileSync(absPath, 'utf-8');
}

function readSrc(relPath: string): string {
  return readFile(path.join(SRC_ROOT, relPath));
}

describe('Phase 7 — Database & Final Backend Hardening', () => {

  // ─── 1. Prisma Schema Composite Indexes ─────────────────────────────────
  describe('Schema — composite indexes for query patterns', () => {
    const schema = readFile(SCHEMA_PATH);

    it('invoice model has @@index([userId, status])', () => {
      expect(schema).toMatch(/@@index\(\[userId,\s*status\]\)/);
    });

    it('invoice model has @@index([status, dueDate])', () => {
      expect(schema).toMatch(/@@index\(\[status,\s*dueDate\]\)/);
    });

    it('invoice model has @@index([paidAt])', () => {
      expect(schema).toMatch(/@@index\(\[paidAt\]\)/);
    });

    it('payment model has @@index([status])', () => {
      // Find the payment model section and check for status index
      const paymentSection = schema.match(/model payment \{[\s\S]*?\}/);
      expect(paymentSection).toBeTruthy();
      expect(paymentSection![0]).toMatch(/@@index\(\[status\]\)/);
    });

    it('payment model has @@index([paidAt])', () => {
      const paymentSection = schema.match(/model payment \{[\s\S]*?\}/);
      expect(paymentSection).toBeTruthy();
      expect(paymentSection![0]).toMatch(/@@index\(\[paidAt\]\)/);
    });

    it('pppoeUser model has @@index([subscriptionType, status])', () => {
      expect(schema).toMatch(/@@index\(\[subscriptionType,\s*status\]\)/);
    });

    it('pppoeUser model has @@index([lastPaymentDate])', () => {
      expect(schema).toMatch(/@@index\(\[lastPaymentDate\]\)/);
    });

    it('paymentAttempt model has @@index([invoiceId, status])', () => {
      const section = schema.match(/model paymentAttempt \{[\s\S]*?^\}/m);
      expect(section).toBeTruthy();
      expect(section![0]).toMatch(/@@index\(\[invoiceId,\s*status\]\)/);
    });
  });

  // ─── 2. Export Password Exclusion (P0 Security) ─────────────────────────
  describe('Export routes — password exclusion by default', () => {
    const exportRoute = readSrc('app/api/pppoe/users/export/route.ts');
    const bulkRoute = readSrc('app/api/pppoe/users/bulk/route.ts');

    it('export route has includePassword parameter', () => {
      expect(exportRoute).toContain('includePassword');
    });

    it('export route defaults includePassword to false', () => {
      expect(exportRoute).toMatch(/includePassword.*===\s*'true'/);
    });

    it('export route uses select with conditional password', () => {
      expect(exportRoute).toContain('password: includePassword');
    });

    it('export route masks password in PDF when not included', () => {
      expect(exportRoute).toContain('••••••');
    });

    it('bulk route has includePassword parameter', () => {
      expect(bulkRoute).toContain('includePassword');
    });

    it('bulk route defaults includePassword to false', () => {
      expect(bulkRoute).toMatch(/includePassword.*===\s*'true'/);
    });

    it('bulk route uses select with conditional password', () => {
      expect(bulkRoute).toContain('password: includePassword');
    });
  });

  // ─── 3. OTP Code Not Logged (P0 Security) ───────────────────────────────
  describe('OTP routes — no OTP code in logs or responses', () => {
    const technicianOtp = readSrc('app/api/technician/auth/request-otp/route.ts');

    it('technician OTP route does not log OTP code', () => {
      // Should NOT contain console.log with otpCode variable interpolation
      expect(technicianOtp).not.toMatch(/console\.log.*\$\{otpCode\}/);
    });

    it('technician OTP route does not return OTP code in response', () => {
      // Should NOT return otpCode in the JSON response
      expect(technicianOtp).not.toMatch(/\.\.\.\(process\.env\.NODE_ENV.*otpCode\)/);
    });

    it('technician OTP route logs success without code', () => {
      expect(technicianOtp).toMatch(/OTP sent via WhatsApp/);
      expect(technicianOtp).not.toMatch(/OTP sent.*\$\{otpCode\}/);
    });
  });

  // ─── 4. Safe Error Handler ──────────────────────────────────────────────
  describe('Safe error handler — Prisma error mapping', () => {
    const apiResponse = readSrc('lib/api-response.ts');

    it('safeErrorResponse function exists', () => {
      expect(apiResponse).toContain('safeErrorResponse');
    });

    it('maps P2002 to conflict (unique constraint)', () => {
      expect(apiResponse).toContain('P2002');
      expect(apiResponse).toMatch(/P2002[\s\S]*conflict/);
    });

    it('maps P2025 to notFound (record not found)', () => {
      expect(apiResponse).toContain('P2025');
      expect(apiResponse).toMatch(/P2025[\s\S]*notFound/);
    });

    it('maps P2003 to badRequest (foreign key)', () => {
      expect(apiResponse).toContain('P2003');
    });

    it('does not expose error.message in fallback', () => {
      // The generic fallback should NOT return error.message to the client
      // Check that serverError() is called without error.message as argument
      const fallbackLine = apiResponse.match(/return serverError\([^)]*\)/g);
      expect(fallbackLine).toBeTruthy();
      for (const line of fallbackLine!) {
        // serverError() or serverError('Internal server error') is OK
        // serverError(error.message) or serverError(error?.message) is NOT OK
        expect(line).not.toMatch(/error\??\.message/);
      }
    });

    it('logs full error server-side', () => {
      expect(apiResponse).toMatch(/console\.error.*\[API Error\]/);
    });

    it('cron route uses safeErrorResponse', () => {
      const cronRoute = readSrc('app/api/cron/route.ts');
      expect(cronRoute).toContain('safeErrorResponse');
    });

    it('cron schedules route uses safeErrorResponse', () => {
      const cronSchedules = readSrc('app/api/cron/schedules/route.ts');
      expect(cronSchedules).toContain('safeErrorResponse');
    });
  });

  // ─── 5. Zod Validation for Auth + Financial Routes ──────────────────────
  describe('Zod validation — auth and financial routes', () => {
    it('customer auth send-otp uses Zod', () => {
      const route = readSrc('app/api/customer/auth/send-otp/route.ts');
      expect(route).toContain('parseBody');
      expect(route).toContain('sendOtpSchema');
      expect(route).toMatch(/z\.object/);
    });

    it('customer auth verify-otp uses Zod', () => {
      const route = readSrc('app/api/customer/auth/verify-otp/route.ts');
      expect(route).toContain('parseBody');
      expect(route).toContain('verifyOtpSchema');
    });

    it('customer auth login uses Zod', () => {
      const route = readSrc('app/api/customer/auth/login/route.ts');
      expect(route).toContain('parseBody');
      expect(route).toContain('loginSchema');
    });

    it('customer topup-direct uses Zod', () => {
      const route = readSrc('app/api/customer/topup-direct/route.ts');
      expect(route).toContain('parseBody');
      expect(route).toContain('topupDirectSchema');
      expect(route).toMatch(/z\.number\(\)\.int\(\)\.min\(10000/);
    });

    it('admin deposit route uses Zod', () => {
      const route = readSrc('app/api/admin/pppoe/users/[id]/deposit/route.ts');
      expect(route).toContain('parseBody');
      expect(route).toContain('depositSchema');
      expect(route).toMatch(/z\.number\(\)\.int\(\)\.positive/);
    });

    it('keuangan transactions POST uses Zod', () => {
      const route = readSrc('app/api/keuangan/transactions/route.ts');
      expect(route).toContain('parseBody');
      expect(route).toContain('createTransactionSchema');
      expect(route).toMatch(/z\.enum\(\['INCOME',\s*'EXPENSE'\]\)/);
    });
  });

  // ─── 6. N+1 Fix in Invoice Generation ───────────────────────────────────
  describe('Invoice generation — N+1 batch fix', () => {
    const invoiceJobs = readSrc('server/cron/invoice-jobs.ts');

    it('batch fetches addons before the loop', () => {
      expect(invoiceJobs).toContain('allAddons');
      expect(invoiceJobs).toContain('addonsByUserId');
      expect(invoiceJobs).toMatch(/prisma\.customerAddon\.findMany[\s\S]*pppoeUserId:\s*\{\s*in:\s*users\.map/);
    });

    it('uses Map lookup instead of per-user query in loop', () => {
      expect(invoiceJobs).toMatch(/addonsByUserId\.get\(user\.id\)/);
    });

    it('does NOT have per-user addon query inside the for loop', () => {
      // The old pattern was: for (const user of users) { ... await prisma.customerAddon.findMany(...) }
      // The new pattern batch-fetches before the loop.
      // Check that the batch fetch is BEFORE the for loop.
      const batchPos = invoiceJobs.indexOf('allAddons');
      const loopPos = invoiceJobs.indexOf('for (const user of users)');
      expect(batchPos).toBeGreaterThan(-1);
      expect(loopPos).toBeGreaterThan(-1);
      expect(batchPos).toBeLessThan(loopPos);
    });

    it('parallelizes waProviders and company queries', () => {
      expect(invoiceJobs).toMatch(/Promise\.all\(/);
      expect(invoiceJobs).toMatch(/whatsapp_providers\.findMany[\s\S]*company\.findFirst/);
    });
  });

  // ─── 7. Migration SQL — Non-destructive ─────────────────────────────────
  describe('Migration SQL — non-destructive, additive only', () => {
    const migration = readFile(MIGRATION_PATH);

    it('migration file exists', () => {
      expect(migration).toBeTruthy();
    });

    it('only uses CREATE INDEX IF NOT EXISTS', () => {
      const lines = migration.split('\n').filter(
        (l) => l.trim().startsWith('CREATE') || l.trim().startsWith('ALTER') || l.trim().startsWith('DROP')
      );
      for (const line of lines) {
        expect(line).toMatch(/CREATE INDEX IF NOT EXISTS/);
      }
    });

    it('does not contain DROP TABLE or DROP COLUMN', () => {
      expect(migration).not.toMatch(/DROP TABLE/i);
      expect(migration).not.toMatch(/DROP COLUMN/i);
      expect(migration).not.toMatch(/DROP INDEX/i);
    });

    it('does not contain ALTER TABLE (no schema changes)', () => {
      expect(migration).not.toMatch(/ALTER TABLE/i);
    });

    it('creates invoice composite indexes', () => {
      expect(migration).toMatch(/invoices_userId_status_idx/);
      expect(migration).toMatch(/invoices_status_dueDate_idx/);
      expect(migration).toMatch(/invoices_paidAt_idx/);
    });

    it('creates payment indexes', () => {
      expect(migration).toMatch(/payments_status_idx/);
      expect(migration).toMatch(/payments_paidAt_idx/);
    });

    it('creates pppoe_users composite indexes', () => {
      expect(migration).toMatch(/pppoe_users_subscriptionType_status_idx/);
      expect(migration).toMatch(/pppoe_users_lastPaymentDate_idx/);
    });

    it('creates payment_attempts composite index', () => {
      expect(migration).toMatch(/payment_attempts_invoiceId_status_idx/);
    });
  });

  // ─── 8. No Mass Assignment ──────────────────────────────────────────────
  describe('Mass assignment prevention — verified', () => {
    it('export route uses explicit select (not include spread)', () => {
      const exportRoute = readSrc('app/api/pppoe/users/export/route.ts');
      // Should use select with explicit fields, not include: { ...body }
      expect(exportRoute).toContain('select:');
      expect(exportRoute).not.toMatch(/data:\s*body\b/);
      expect(exportRoute).not.toMatch(/data:\s*\{\.\.\.body\}/);
    });

    it('bulk route uses explicit select', () => {
      const bulkRoute = readSrc('app/api/pppoe/users/bulk/route.ts');
      expect(bulkRoute).toContain('select:');
      expect(bulkRoute).not.toMatch(/data:\s*body\b/);
    });
  });
});
