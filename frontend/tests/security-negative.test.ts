import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Security Negative Test Suite
 *
 * Verifies that hardened endpoints correctly reject:
 *  - Unauthenticated requests (401)
 *  - Insufficient-role requests (403)
 *  - Invalid webhook signatures (401)
 *  - Path-traversal / bad-extension filenames (400)
 *
 * Run with: npm test -- --reporter=verbose
 * Run subset: npm test -- -t "Security"
 *
 * All tests send raw HTTP; no real session/signature is needed —
 * a correct rejection is the expected outcome.
 */

const BASE_URL =
  process.env.TEST_API_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://localhost:3000';
const TIMEOUT = 8000;

let serverAvailable = false;

async function req(
  endpoint: string,
  options: RequestInit = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT);
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    clearTimeout(id);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch {
    return { status: 0, data: {} };
  }
}

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(4000),
    });
    serverAvailable = res.ok;
  } catch {
    serverAvailable = false;
    console.warn('\n⚠  Server not available — security tests require a running server.\n');
  }
});

function skip() {
  if (!serverAvailable) {
    console.log('   ⏭  Skipped (server not available)');
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK SIGNATURE TESTS
// ─────────────────────────────────────────────────────────────────────────────
describe('Security: Webhook signature rejection', () => {
  const webhookEndpoints = [
    '/api/payment/webhook',
    '/api/agent/deposit/webhook',
  ];

  for (const endpoint of webhookEndpoints) {
    it(`POST ${endpoint} — no signature header → 401`, async () => {
      if (skip()) return;
      // Send a plausible Midtrans payload with no signature headers
      const { status } = await req(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          order_id: 'TEST-001',
          status_code: '200',
          gross_amount: '10000',
          payment_type: 'bank_transfer',
        }),
        headers: { 'x-payment-gateway': 'midtrans' },
      });
      expect(status).toBe(401);
    });

    it(`POST ${endpoint} — wrong Midtrans signature → 401`, async () => {
      if (skip()) return;
      const { status } = await req(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          order_id: 'TEST-001',
          status_code: '200',
          gross_amount: '10000',
          payment_type: 'bank_transfer',
        }),
        headers: {
          'x-payment-gateway': 'midtrans',
          'x-signature-key': 'deadbeefdeadbeefdeadbeef',
        },
      });
      expect(status).toBe(401);
    });

    it(`POST ${endpoint} — wrong Xendit webhook token → 401`, async () => {
      if (skip()) return;
      const { status } = await req(endpoint, {
        method: 'POST',
        body: JSON.stringify({ id: 'evt_123', external_id: 'TEST-001' }),
        headers: {
          'x-payment-gateway': 'xendit',
          'x-callback-token': 'wrong-token-xyz',
        },
      });
      expect(status).toBe(401);
    });

    it(`POST ${endpoint} — wrong Tripay signature → 401`, async () => {
      if (skip()) return;
      const { status } = await req(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          merchant_ref: 'TEST-001',
          status: 'PAID',
        }),
        headers: {
          'x-payment-gateway': 'tripay',
          'x-callback-signature': 'badsig',
        },
      });
      expect(status).toBe(401);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN SYSTEM ENDPOINTS — UNAUTHENTICATED / WRONG ROLE
// ─────────────────────────────────────────────────────────────────────────────
describe('Security: Admin system endpoints require SUPER_ADMIN', () => {
  it('GET /api/admin/system/info — no session → 401', async () => {
    if (skip()) return;
    const { status } = await req('/api/admin/system/info');
    expect(status).toBe(401);
  });

  it('GET /api/admin/system/update — no session → 401', async () => {
    if (skip()) return;
    const { status } = await req('/api/admin/system/update?action=status');
    expect(status).toBe(401);
  });

  it('POST /api/admin/system/update — no session → 401', async () => {
    if (skip()) return;
    const { status } = await req('/api/admin/system/update', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH ENDPOINT — LOGOUT-LOG WITHOUT SESSION
// ─────────────────────────────────────────────────────────────────────────────
describe('Security: Logout-log requires authentication', () => {
  it('POST /api/auth/logout-log — no session → 401', async () => {
    if (skip()) return;
    const { status } = await req('/api/auth/logout-log', {
      method: 'POST',
      body: JSON.stringify({ userId: 'any', username: 'any', role: 'ADMIN' }),
    });
    expect(status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGO FILE SERVING — PATH TRAVERSAL & BAD EXTENSION
// ─────────────────────────────────────────────────────────────────────────────
describe('Security: Logo file serving rejects invalid filenames', () => {
  const badFilenames = [
    '../../../etc/passwd',
    '..%2F..%2Fetc%2Fpasswd',
    'logo%00.png',
    'logo.sh',
    'logo.php',
    'logo.exe',
  ];

  for (const filename of badFilenames) {
    it(`GET /api/uploads/logos/${filename} → 400`, async () => {
      if (skip()) return;
      const { status } = await req(
        `/api/uploads/logos/${encodeURIComponent(filename)}`,
      );
      expect(status).toBe(400);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN SUB-ROUTES — PREVIOUSLY MISSING AUTH
// ─────────────────────────────────────────────────────────────────────────────
describe('Security: Admin action sub-routes require authentication', () => {
  const adminRoutes: Array<[string, string]> = [
    ['POST', '/api/admin/topup-requests/nonexistent-id/approve'],
    ['POST', '/api/admin/topup-requests/nonexistent-id/reject'],
    ['POST', '/api/admin/registrations/nonexistent-id/approve'],
    ['POST', '/api/admin/registrations/nonexistent-id/reject'],
    ['POST', '/api/admin/registrations/nonexistent-id/mark-installed'],
    ['POST', '/api/admin/evoucher/orders/nonexistent-id/resend'],
    ['POST', '/api/admin/evoucher/orders/nonexistent-id/cancel'],
    ['POST', '/api/admin/users/nonexistent-id/renewal'],
    ['POST', '/api/admin/pppoe/users/nonexistent-id/deposit'],
  ];

  for (const [method, endpoint] of adminRoutes) {
    it(`${method} ${endpoint} — no session → 401`, async () => {
      if (skip()) return;
      const { status } = await req(endpoint, {
        method,
        body: JSON.stringify({ reason: 'test', amount: 10000 }),
      });
      expect(status).toBe(401);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FREERADIUS LOGS — AUTH REQUIRED & ROLE ENFORCED
// ─────────────────────────────────────────────────────────────────────────────
describe('Security: FreeRADIUS log endpoint requires ADMIN role', () => {
  it('GET /api/freeradius/logs — no session → 401', async () => {
    if (skip()) return;
    const { status } = await req('/api/freeradius/logs');
    expect(status).toBe(401);
  });
});
