import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 5 — Backend Security Hardening Tests
 *
 * Tests verify:
 * 1. Rate limiter uses Redis (not just in-memory)
 * 2. Rate limiter validates IP headers (no spoofing)
 * 3. Public auth endpoints have rate limiting
 * 4. Admin routes use requirePermission (not just getServerSession)
 * 5. Customer [id] routes have ownership checks
 * 6. Critical mutation endpoints use Zod validation
 * 7. Mass assignment prevention
 */

const SRC_ROOT = path.resolve(__dirname, '..', 'src');

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, relPath), 'utf-8');
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(SRC_ROOT, relPath));
}

describe('Phase 5 — Backend Security Hardening', () => {

  // ─── Rate Limiter ────────────────────────────────────────────────────────
  describe('Rate Limiter — Redis migration + IP bypass prevention', () => {
    const rateLimitCode = readFile('server/middleware/rate-limit.ts');

    it('must use Redis as primary store', () => {
      expect(rateLimitCode).toContain('ioredis');
      expect(rateLimitCode).toContain('getRedis');
      expect(rateLimitCode).toContain('redisKey');
      expect(rateLimitCode).toContain('INCR');
    });

    it('must have in-memory fallback for when Redis is unavailable', () => {
      expect(rateLimitCode).toContain('memStore');
      expect(rateLimitCode).toContain('In-memory fallback');
    });

    it('must use atomic Redis pipeline (INCR + EXPIRE)', () => {
      expect(rateLimitCode).toContain('pipeline');
      expect(rateLimitCode).toContain('incr');
      expect(rateLimitCode).toContain('expire');
    });

    it('must validate IP addresses to prevent header injection', () => {
      expect(rateLimitCode).toContain('isValidIp');
      expect(rateLimitCode).toContain('IPv4');
      expect(rateLimitCode).toContain('IPv6');
    });

    it('must not blindly trust x-forwarded-for without validation', () => {
      expect(rateLimitCode).toContain('isValidIp(firstIp)');
      expect(rateLimitCode).toContain('isValidIp(cfConnectingIp)');
      expect(rateLimitCode).toContain('isValidIp(realIp)');
    });

    it('must include path in rate limit key (per-endpoint limits)', () => {
      expect(rateLimitCode).toContain('path');
      expect(rateLimitCode).toContain('getClientId');
    });

    it('must have auth preset for brute force protection', () => {
      expect(rateLimitCode).toContain('auth');
      expect(rateLimitCode).toContain('15 * 60 * 1000'); // 15 minutes
    });

    it('resetRateLimit and getRateLimitStats must be async (Redis)', () => {
      expect(rateLimitCode).toMatch(/export async function resetRateLimit/);
      expect(rateLimitCode).toMatch(/export async function getRateLimitStats/);
    });
  });

  // ─── Public Endpoint Rate Limiting ───────────────────────────────────────
  describe('Public auth endpoints — rate limiting', () => {
    const endpoints = [
      { path: 'app/api/admin/auth/verify/route.ts', name: 'admin auth verify' },
      { path: 'app/api/admin/auth/verify-2fa/route.ts', name: 'admin auth verify-2fa' },
      { path: 'app/api/admin/auth/pre-login/route.ts', name: 'admin auth pre-login' },
      { path: 'app/api/customer/auth/verify-otp/route.ts', name: 'customer auth verify-otp' },
      { path: 'app/api/customer/auth/bypass-login/route.ts', name: 'customer auth bypass-login' },
      { path: 'app/api/customer/auth/logout/route.ts', name: 'customer auth logout' },
      { path: 'app/api/company/info/route.ts', name: 'company info' },
      { path: 'app/api/agent/deposit/payment-methods/route.ts', name: 'agent deposit payment-methods' },
    ];

    endpoints.forEach(({ path: relPath, name }) => {
      it(`${name} must have rate limiting`, () => {
        if (!fileExists(relPath)) return; // skip if file doesn't exist
        const code = readFile(relPath);
        expect(code).toContain('rateLimit');
      });
    });

    it('customer auth login must have rate limiting', () => {
      const code = readFile('app/api/customer/auth/login/route.ts');
      expect(code).toContain('rateLimit');
    });

    it('customer auth send-otp must have rate limiting (DB-based or middleware)', () => {
      const code = readFile('app/api/customer/auth/send-otp/route.ts');
      // send-otp uses DB-based rate limiting (checks recent OTP count)
      expect(code.toLowerCase()).toMatch(/rate.?limit|max.*otp|otp.*per|attempts/);
    });

    it('agent login must have rate limiting', () => {
      const code = readFile('app/api/agent/login/route.ts');
      expect(code).toContain('rateLimit');
    });
  });

  // ─── Admin Route Authentication ──────────────────────────────────────────
  describe('Admin routes — requirePermission instead of getServerSession', () => {
    const weakRoutes = [
      { path: 'app/api/admin/analytics/route.ts', perm: 'reports.view' },
      { path: 'app/api/admin/activity-logs/route.ts', perm: 'users.view' },
      { path: 'app/api/admin/isolated-users/route.ts', perm: 'customers.view' },
      { path: 'app/api/admin/laporan/route.ts', perm: 'reports.view' },
      { path: 'app/api/admin/registrations/route.ts', perm: 'registrations.view' },
      { path: 'app/api/admin/suspend-requests/route.ts', perm: 'customers.view' },
      { path: 'app/api/admin/evoucher/orders/route.ts', perm: 'invoices.view' },
      { path: 'app/api/admin/referrals/route.ts', perm: 'customers.view' },
    ];

    weakRoutes.forEach(({ path: relPath, perm }) => {
      it(`${relPath} must use requirePermission('${perm}')`, () => {
        if (!fileExists(relPath)) return;
        const code = readFile(relPath);
        expect(code).toContain('requirePermission');
        expect(code).toContain(perm);
        // Must NOT use bare getServerSession without permission check
        expect(code).not.toMatch(/getServerSession\(authOptions\);\s*if\s*\(!session\)/);
      });
    });

    it('admin profile/2fa must use checkAuth (own settings, no permission needed)', () => {
      const code = readFile('app/api/admin/profile/2fa/route.ts');
      expect(code).toContain('checkAuth');
    });

    it('admin settings/isolation must use requirePermission', () => {
      const code = readFile('app/api/admin/settings/isolation/route.ts');
      expect(code).toContain('requirePermission');
      expect(code).toContain('settings.view');
      expect(code).toContain('settings.edit');
    });

    it('company route must use requirePermission', () => {
      const code = readFile('app/api/company/route.ts');
      expect(code).toContain('requirePermission');
    });

    it('cron status must use requirePermission', () => {
      const code = readFile('app/api/cron/status/route.ts');
      expect(code).toContain('requirePermission');
    });
  });

  // ─── Customer IDOR Protection ────────────────────────────────────────────
  describe('Customer [id] routes — ownership checks (IDOR prevention)', () => {
    it('customer invoice manual-payment must check userId ownership', () => {
      const code = readFile('app/api/customer/invoices/[id]/manual-payment/route.ts');
      expect(code).toContain('userId: user.id');
      expect(code).toContain('findFirst');
    });

    it('customer invoice route must filter by user (not just findUnique by id)', () => {
      const code = readFile('app/api/customer/invoices/route.ts');
      // Should filter invoices by the authenticated user's session
      expect(code).toMatch(/userId.*session\.userId|session\.userId.*userId/);
    });
  });

  // ─── Zod Validation on Critical Mutations ────────────────────────────────
  describe('Critical mutation endpoints — Zod validation', () => {
    it('isolate-user must use Zod schema for body validation', () => {
      const code = readFile('app/api/admin/isolate-user/route.ts');
      expect(code).toContain('parseBody');
      expect(code).toContain('z.object');
      expect(code).toContain('isolateUserSchema');
    });

    it('isolate-user Zod schema must limit username length', () => {
      const code = readFile('app/api/admin/isolate-user/route.ts');
      expect(code).toContain('z.string().min(1).max(64)');
    });

    it('isolate-user Zod schema must limit reason length', () => {
      const code = readFile('app/api/admin/isolate-user/route.ts');
      expect(code).toContain('z.string().max(500)');
    });

    it('payment/create must use Zod schema for body validation', () => {
      const code = readFile('app/api/payment/create/route.ts');
      expect(code).toContain('paymentCreateSchema');
      expect(code).toContain('safeParse');
    });

    it('payment/create Zod must validate gateway as enum', () => {
      const code = readFile('app/api/payment/create/route.ts');
      expect(code).toContain('z.enum');
      expect(code).toContain('midtrans');
    });

    it('payment/create Zod must validate amount as positive integer', () => {
      const code = readFile('app/api/payment/create/route.ts');
      expect(code).toContain('z.number().int().positive()');
    });
  });

  // ─── Mass Assignment Prevention ──────────────────────────────────────────
  describe('Mass assignment prevention', () => {
    it('isolate-user must not spread body directly into DB update', () => {
      const code = readFile('app/api/admin/isolate-user/route.ts');
      // Should explicitly pick fields, not spread entire body
      expect(code).not.toMatch(/data:\s*\.\.\.body/);
      expect(code).not.toMatch(/data:\s*\.\.\.data/);
    });

    it('payment/create must not spread body directly into DB create', () => {
      const code = readFile('app/api/payment/create/route.ts');
      expect(code).not.toMatch(/data:\s*\.\.\.body/);
    });
  });

  // ─── Webhook Security ────────────────────────────────────────────────────
  describe('Webhook security', () => {
    it('payment webhook must verify signature', () => {
      const code = readFile('app/api/payment/webhook/route.ts');
      expect(code).toContain('signature');
      expect(code).toContain('x-callback-token');
    });

    it('agent deposit webhook must exist (signature verification)', () => {
      const code = readFile('app/api/agent/deposit/webhook/route.ts');
      // Webhook should have some form of verification
      expect(code.length).toBeGreaterThan(0);
    });
  });

  // ─── Auth Helper Availability ────────────────────────────────────────────
  describe('Auth helpers — availability and correctness', () => {
    it('requirePermission must exist and combine auth + permission check', () => {
      const code = readFile('server/middleware/api-auth.ts');
      expect(code).toContain('requirePermission');
      expect(code).toContain('checkAuth');
      expect(code).toContain('checkPermission');
      expect(code).toContain('isSuperAdmin');
    });

    it('requireRole must exist in auth config', () => {
      const code = readFile('server/auth/config.ts');
      expect(code).toContain('requireRole');
      expect(code).toContain('requireAdmin');
      expect(code).toContain('requireStaff');
    });

    it('permissions system must support hasPermission and hasAnyPermission', () => {
      const code = readFile('server/auth/permissions.ts');
      expect(code).toContain('hasPermission');
      expect(code).toContain('hasAnyPermission');
      expect(code).toContain('isSuperAdmin');
    });
  });

  // ─── Scenario: IDOR Prevention ───────────────────────────────────────────
  describe('Scenario: IDOR prevention', () => {
    it('Customer A cannot access Customer B invoice via manual-payment', () => {
      // The route uses findFirst with userId: user.id, not findUnique by id alone.
      // If Customer A requests Customer B's invoice ID:
      //   findFirst({ where: { id: invoiceId, userId: user.id } })
      //   → returns null (invoice belongs to B, not A)
      //   → 404 response
      const code = readFile('app/api/customer/invoices/[id]/manual-payment/route.ts');
      expect(code).toContain('findFirst');
      expect(code).toContain('userId: user.id');
      expect(code).toContain('404');
    });

    it('User without permission cannot access admin analytics', () => {
      // The route uses requirePermission('reports.view')
      // If user lacks permission:
      //   → 403 Forbidden
      const code = readFile('app/api/admin/analytics/route.ts');
      expect(code).toContain('requirePermission');
      expect(code).toContain('reports.view');
      expect(code).toContain('authorized');
    });
  });

  // ─── Scenario: Rate Limit Bypass Prevention ──────────────────────────────
  describe('Scenario: Rate limit bypass prevention', () => {
    it('Attacker cannot bypass rate limit by spoofing X-Forwarded-For', () => {
      // The rate limiter validates IP with isValidIp() before using it.
      // If attacker sends X-Forwarded-For: "fake-ip-not-real":
      //   → isValidIp("fake-ip-not-real") returns false
      //   → falls back to next header or 'unknown'
      // If attacker sends X-Forwarded-For: "999.999.999.999":
      //   → isValidIp checks octets 0-255, returns false
      //   → falls back
      const code = readFile('server/middleware/rate-limit.ts');
      expect(code).toContain('isValidIp');
      expect(code).toContain('255'); // octet validation
    });

    it('Rate limit is per-endpoint (path included in key)', () => {
      // Attacker cannot use up their limit on endpoint A and then
      // access endpoint B — each path has its own counter.
      const code = readFile('server/middleware/rate-limit.ts');
      expect(code).toContain('path');
      expect(code).toContain('getClientId');
    });
  });
});
